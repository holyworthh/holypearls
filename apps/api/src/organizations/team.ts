import {
  CONFIRMATION_REQUIRED,
  type InviteInput,
  type InvitationPreview,
  type MemberChange,
  type MemberStatusChange,
  type OrganizationPermission,
  type OwnershipTransfer,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type Team,
  type TeamInvitation,
  type TeamMember,
} from "@holypearls/contracts";
import { and, type Database, desc, eq, inArray, schema, sql, type Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import { type ActorContext, requireUser } from "../identity/actor.js";
import { maskEmail, requireRecentEmailCode } from "../identity/customers.js";
import { claimInvitation, effectiveStatus, findInvitationByToken, invitationLocationIds, issueInvitation, normalizeEmail, revokeInvitation } from "../identity/invitations.js";
import { recordAudit } from "../platform/audit.js";
import type { HelpDeps } from "../platform/help-requests.js";
import { queueEmail } from "../platform/notifications.js";
import { enforce } from "../platform/policy.js";
import { activeOwnerCount, grantFor, grantsOf, isPreset, lockOrganization, type Member, requireMember, writeGrants } from "./members.js";
import { canGrant, canManageMember, canSeeMember, canTransferOwnership, type Grant, needsPermission, raisedBy } from "./policies.js";

/*
 * Team and invitations (PRD-05 B2B-FR-090–093; TECH-03 §7, §9, §11). Every
 * change is one transaction that locks the organization row first, so the
 * last-owner rule can't be raced, and writes an audit entry (TECH-03 §15).
 */

export type OrganizationDeps = HelpDeps;

type MembershipRow = typeof schema.memberships.$inferSelect;
const ROLE_ORDER = ["OWNER", "ADMIN", "APPROVER", "LOCATION_MANAGER", "BUYER", "VIEWER"] as const;
const workspaceUrl = (deps: OrganizationDeps, organizationId: string) => `${deps.webOrigin}/workspace/${organizationId}/team`;
const longDate = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

async function locationNames(db: Database | Transaction, organizationId: string) {
  const rows = await db.select({ id: schema.locations.id, name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.organizationId, organizationId)).orderBy(schema.locations.name);
  return new Map(rows.map((row) => [row.id, row.name]));
}

const refs = (names: Map<string, string>, ids: readonly string[]) =>
  ids.flatMap((id) => (names.has(id) ? [{ id, name: names.get(id)! }] : [])).sort((a, b) => a.name.localeCompare(b.name));

/** Location IDs must belong to this organization; anything else is a field error, never a silent drop. */
async function checkLocations(db: Database | Transaction, organizationId: string, grant: { allLocations: boolean; locationIds: readonly string[] }) {
  if (grant.allLocations) return [];
  const unique = [...new Set(grant.locationIds)];
  const names = await locationNames(db, organizationId);
  if (unique.some((id) => !names.has(id))) throw new AppError("VALIDATION_FAILED", { fieldErrors: { locationIds: "Choose locations from this organization" } });
  return unique;
}

/** A change that needs confirming answers with what it would do (B2B-FR-091); the web app shows it in the dialog. */
function requireConfirmation(confirmed: boolean, context: Record<string, unknown>) {
  if (!confirmed) throw new AppError("RULE_FAILED", { message: "Confirm this change to continue.", context: { reason: CONFIRMATION_REQUIRED, ...context } });
}

function checkVersion(row: MembershipRow, version: number) {
  if (row.version !== version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: row.version } });
}

async function membershipInOrganization(tx: Transaction, organizationId: string, membershipId: string) {
  const [row] = await tx
    .select({ membership: schema.memberships, name: schema.users.name, email: schema.users.email })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.id, membershipId), eq(schema.memberships.organizationId, organizationId)));
  // Another organization's membership looks exactly like a missing one (TECH-03 §12).
  if (!row) throw new AppError("NOT_FOUND");
  const { permissions, locations } = await grantsOf(tx, [membershipId]);
  const grant: Grant = { role: row.membership.role, permissions: permissions.get(membershipId) ?? [], allLocations: row.membership.allLocations, locationIds: locations.get(membershipId) ?? [] };
  return { ...row, grant };
}

const describe = (names: Map<string, string>, raised: ReturnType<typeof raisedBy>) => ({
  raises: raised.raises,
  becomesOwner: raised.becomesOwner,
  addedPermissions: raised.permissions.map((permission) => ({ permission, label: PERMISSION_LABELS[permission] })),
  addedAllLocations: raised.allLocations,
  addedLocations: refs(names, raised.locationIds),
});

/** Compares two grants regardless of the order rows came back in. */
const grantKey = (grant: Grant) => JSON.stringify([grant.role, [...grant.permissions].sort(), grant.allLocations, [...grant.locationIds].sort()]);

const auditGrant = (grant: Grant, status?: string) => ({ role: grant.role, permissions: grant.permissions, allLocations: grant.allLocations, locationIds: grant.locationIds, ...(status && { status }) });

/* Reading the team. */

export async function listTeam(db: Database, actor: ActorContext, organizationId: string): Promise<Team> {
  const manager = await requireMember(db, actor, organizationId);
  enforce(needsPermission(manager, "MANAGE_TEAM"));
  const names = await locationNames(db, organizationId);
  const rows = await db
    .select({ membership: schema.memberships, name: schema.users.name, email: schema.users.email })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.organizationId, organizationId));
  const { permissions, locations } = await grantsOf(db, rows.map((row) => row.membership.id));
  const members: TeamMember[] = rows
    .map((row) => {
      const id = row.membership.id;
      const granted = permissions.get(id) ?? [];
      return {
        membershipId: id,
        name: row.name,
        email: row.email,
        role: row.membership.role,
        status: row.membership.status,
        allLocations: row.membership.allLocations,
        locations: refs(names, locations.get(id) ?? []),
        permissions: grantFor(row.membership.role, granted),
        adjusted: !isPreset(row.membership.role, granted),
        isYou: row.membership.userId === manager.userId,
        version: row.membership.version,
      };
    })
    .filter((member) => canSeeMember(manager, { role: member.role, allLocations: member.allLocations, locationIds: member.locations.map((location) => location.id) }))
    .sort((a, b) => Number(a.status === "DEACTIVATED") - Number(b.status === "DEACTIVATED") || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  return {
    members,
    invitations: await teamInvitations(db, manager, names),
    activeOwners: await activeOwnerCount(db, organizationId),
  };
}

async function teamInvitations(db: Database, manager: Member, names: Map<string, string>): Promise<TeamInvitation[]> {
  const rows = await db
    .select()
    .from(schema.invitations)
    .where(and(eq(schema.invitations.organizationId, manager.organizationId), inArray(schema.invitations.status, ["PENDING", "EXPIRED"])))
    .orderBy(desc(schema.invitations.createdAt))
    .limit(50);
  const byInvitation = await invitationLocationIds(db, rows.map((row) => row.id));
  const now = new Date();
  return rows
    .map((row) => ({
      id: row.id,
      email: row.emailNormalized,
      role: row.role,
      allLocations: row.allLocations,
      locations: refs(names, byInvitation.get(row.id) ?? []),
      status: effectiveStatus(row, now),
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }))
    .filter((invitation) => canSeeMember(manager, { role: invitation.role, allLocations: invitation.allLocations, locationIds: invitation.locations.map((location) => location.id) }));
}

/** Read after a change with a fresh actor, so the per-request membership memo doesn't answer with the old access. */
async function memberView(db: Database, actor: ActorContext, organizationId: string, membershipId: string) {
  const team = await listTeam(db, { ...actor }, organizationId);
  return team.members.find((member) => member.membershipId === membershipId) ?? null;
}

/* Inviting (B2B-FR-090). */

export async function inviteMember(deps: OrganizationDeps, actor: ActorContext, organizationId: string, input: InviteInput): Promise<TeamInvitation> {
  const manager = await requireMember(deps.db, actor, organizationId);
  enforce(needsPermission(manager, "MANAGE_TEAM"));
  const locationIds = await checkLocations(deps.db, organizationId, input);
  const grant: Grant = { role: input.role, permissions: grantFor(input.role, null), allLocations: input.allLocations, locationIds };
  enforce(canGrant(manager, grant));
  const now = actor.now;
  const inviter = requireUser(actor).session.name;
  const id = await deps.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: schema.memberships.status })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.memberships.organizationId, organizationId), sql`lower(${schema.users.email}) = ${normalizeEmail(input.email)}`));
    if (existing?.status === "ACTIVE") throw new AppError("RULE_FAILED", { message: "This person is already in the team.", context: { reason: "ALREADY_MEMBER" } });
    const { invitation, token } = await issueInvitation(tx, { organizationId, email: input.email, role: input.role, allLocations: input.allLocations, locationIds, invitedByUserId: manager.userId }, now);
    await queueEmail(deps, tx, {
      template: "organization_invitation",
      to: input.email,
      data: { organization: manager.organizationName, role: ROLE_LABELS[input.role], invitedBy: inviter, expires: longDate(invitation.expiresAt), url: `${deps.webOrigin}/invitations/${token}` },
      record: { type: "ORGANIZATION", id: organizationId, label: manager.organizationName },
      linkLabel: "Accept the invitation",
      requestId: actor.requestId,
    });
    await recordAudit(tx, actor, {
      action: "organization.member_invited",
      summary: `Invited someone as ${ROLE_LABELS[input.role]}`,
      recordType: "ORGANIZATION",
      recordId: organizationId,
      recordLabel: manager.organizationName,
      after: { invitationId: invitation.id, ...auditGrant(grant), expiresAt: invitation.expiresAt.toISOString() },
      permission: "MANAGE_TEAM",
    });
    return invitation.id;
  });
  const team = await listTeam(deps.db, actor, organizationId);
  return team.invitations.find((invitation) => invitation.id === id)!;
}

export async function revokeTeamInvitation(db: Database, actor: ActorContext, organizationId: string, invitationId: string) {
  const manager = await requireMember(db, actor, organizationId);
  enforce(needsPermission(manager, "MANAGE_TEAM"));
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.invitations).where(and(eq(schema.invitations.id, invitationId), eq(schema.invitations.organizationId, organizationId))).for("update");
    if (!row) throw new AppError("NOT_FOUND");
    const locationIds = (await invitationLocationIds(tx, [row.id])).get(row.id) ?? [];
    enforce(canManageMember(manager, { membershipId: row.id, role: row.role, allLocations: row.allLocations, locationIds }));
    if (effectiveStatus(row, actor.now) !== "PENDING") throw new AppError("RULE_FAILED", { message: "This invitation is no longer waiting.", context: { reason: "NOT_PENDING" } });
    await revokeInvitation(tx, row.id, actor.now);
    await recordAudit(tx, actor, {
      action: "organization.invitation_revoked",
      summary: `Invitation as ${ROLE_LABELS[row.role]} revoked`,
      recordType: "ORGANIZATION",
      recordId: organizationId,
      recordLabel: manager.organizationName,
      before: { invitationId: row.id, status: "PENDING" },
      after: { invitationId: row.id, status: "REVOKED" },
      permission: "MANAGE_TEAM",
    });
  });
  return { revoked: true as const };
}

/* Accepting (TECH-03 §11). */

export async function previewInvitation(db: Database, token: string, now: Date): Promise<InvitationPreview> {
  const invitation = await findInvitationByToken(db, token);
  if (!invitation) throw new AppError("NOT_FOUND");
  const [organization] = await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, invitation.organizationId));
  return {
    status: effectiveStatus(invitation, now),
    organizationName: organization?.name ?? "",
    role: invitation.role,
    invitedEmail: maskEmail(invitation.emailNormalized),
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export async function acceptInvitation(db: Database, actor: ActorContext, token: string) {
  const user = requireUser(actor);
  return db.transaction(async (tx) => {
    const { invitation, locationIds } = await claimInvitation(tx, token, { userId: user.session.userId, email: user.session.email, emailVerified: user.session.emailVerified }, actor.now);
    await lockOrganization(tx, invitation.organizationId);
    const grant: Grant = { role: invitation.role, permissions: grantFor(invitation.role, null), allLocations: invitation.allLocations, locationIds };
    const [existing] = await tx
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.organizationId, invitation.organizationId), eq(schema.memberships.userId, user.session.userId)));
    if (existing?.status === "ACTIVE") throw new AppError("RULE_FAILED", { message: "You're already in this team.", context: { reason: "ALREADY_MEMBER" } });
    let membershipId: string;
    if (existing) {
      // A deactivated member who is invited again comes back with the invitation's role and locations.
      await tx
        .update(schema.memberships)
        .set({ status: "ACTIVE", deactivatedAt: null, role: grant.role, allLocations: grant.allLocations, version: existing.version + 1 })
        .where(eq(schema.memberships.id, existing.id));
      membershipId = existing.id;
    } else {
      const [row] = await tx
        .insert(schema.memberships)
        .values({ organizationId: invitation.organizationId, userId: user.session.userId, role: grant.role, allLocations: grant.allLocations })
        .returning({ id: schema.memberships.id });
      membershipId = row!.id;
    }
    await writeGrants(tx, { id: membershipId, organizationId: invitation.organizationId }, grant);
    await recordAudit(tx, actor, {
      action: "organization.invitation_accepted",
      summary: `Joined as ${ROLE_LABELS[grant.role]} from an invitation`,
      recordType: "ORGANIZATION",
      recordId: invitation.organizationId,
      after: { invitationId: invitation.id, membershipId, ...auditGrant(grant, "ACTIVE"), reactivated: Boolean(existing) },
    });
    return { organizationId: invitation.organizationId };
  });
}

/* Changing a member (B2B-FR-091, 092; TECH-03 §9). */

export async function changeMember(deps: OrganizationDeps, actor: ActorContext, organizationId: string, membershipId: string, input: MemberChange): Promise<TeamMember | null> {
  const manager = await requireMember(deps.db, actor, organizationId);
  enforce(needsPermission(manager, "MANAGE_TEAM"));
  await deps.db.transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const target = await membershipInOrganization(tx, organizationId, membershipId);
    enforce(canManageMember(manager, { membershipId, ...target.grant }));
    if (target.membership.status !== "ACTIVE") throw new AppError("RULE_FAILED", { message: "Reactivate this member before changing their role.", context: { reason: "MEMBER_DEACTIVATED" } });
    checkVersion(target.membership, input.version);
    const allLocations = input.role === "OWNER" || input.allLocations;
    const after: Grant = {
      role: input.role,
      permissions: grantFor(input.role, input.permissions as OrganizationPermission[] | null),
      allLocations,
      locationIds: await checkLocations(tx, organizationId, { allLocations, locationIds: input.locationIds }),
    };
    enforce(canGrant(manager, after));
    if (target.grant.role === "OWNER" && after.role !== "OWNER" && (await activeOwnerCount(tx, organizationId)) <= 1) {
      throw new AppError("RULE_FAILED", { message: "This is the only Owner. Make someone else an Owner first.", context: { reason: "LAST_OWNER" } });
    }
    const raised = raisedBy(target.grant, after);
    if (grantKey(target.grant) === grantKey(after)) return;
    const names = await locationNames(tx, organizationId);
    requireConfirmation(input.confirmed, { member: target.name, role: after.role, ...describe(names, raised) });
    if (raised.raises) await requireRecentEmailCode(deps.db, actor);
    await tx.update(schema.memberships).set({ role: after.role, allLocations: after.allLocations, version: target.membership.version + 1 }).where(eq(schema.memberships.id, membershipId));
    await writeGrants(tx, { id: membershipId, organizationId }, after);
    await recordAudit(tx, actor, {
      action: "organization.member_changed",
      summary: `${raised.raises ? "Raised" : "Changed"} a member's access: ${ROLE_LABELS[target.grant.role]} → ${ROLE_LABELS[after.role]}`,
      recordType: "MEMBERSHIP",
      recordId: membershipId,
      recordLabel: manager.organizationName,
      before: auditGrant(target.grant),
      after: { ...auditGrant(after), highRisk: raised.raises },
      permission: "MANAGE_TEAM",
    });
    const permissionsChanged = grantKey({ ...target.grant, allLocations: false, locationIds: [] }) !== grantKey({ ...after, allLocations: false, locationIds: [] });
    if (permissionsChanged) {
      await queueEmail(deps, tx, {
        template: "organization_role_changed",
        to: target.email,
        data: { organization: manager.organizationName, role: ROLE_LABELS[after.role], url: workspaceUrl(deps, organizationId) },
        record: { type: "ORGANIZATION", id: organizationId, label: manager.organizationName },
        requestId: actor.requestId,
      });
    }
  });
  return memberView(deps.db, actor, organizationId, membershipId);
}

/** B2B-FR-093: access ends on the member's next request; their history stays. */
export async function deactivateMember(db: Database, actor: ActorContext, organizationId: string, membershipId: string, input: MemberStatusChange) {
  const manager = await requireMember(db, actor, organizationId);
  enforce(needsPermission(manager, "MANAGE_TEAM"));
  await db.transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const target = await membershipInOrganization(tx, organizationId, membershipId);
    enforce(canManageMember(manager, { membershipId, ...target.grant }));
    if (target.membership.userId === manager.userId) throw new AppError("RULE_FAILED", { message: "You can't deactivate yourself. Ask another Owner or Admin.", context: { reason: "SELF" } });
    if (target.membership.status !== "ACTIVE") throw new AppError("RULE_FAILED", { message: "This member is already deactivated.", context: { reason: "ALREADY_DEACTIVATED" } });
    checkVersion(target.membership, input.version);
    if (target.grant.role === "OWNER" && (await activeOwnerCount(tx, organizationId)) <= 1) {
      throw new AppError("RULE_FAILED", { message: "This is the only Owner. Make someone else an Owner first.", context: { reason: "LAST_OWNER" } });
    }
    requireConfirmation(input.confirmed, { member: target.name, action: "DEACTIVATE" });
    await tx.update(schema.memberships).set({ status: "DEACTIVATED", deactivatedAt: actor.now, version: target.membership.version + 1 }).where(eq(schema.memberships.id, membershipId));
    await recordAudit(tx, actor, {
      action: "organization.member_deactivated",
      summary: `Deactivated a member (${ROLE_LABELS[target.grant.role]})`,
      recordType: "MEMBERSHIP",
      recordId: membershipId,
      recordLabel: manager.organizationName,
      before: { status: "ACTIVE" },
      after: { status: "DEACTIVATED" },
      permission: "MANAGE_TEAM",
    });
  });
  return memberView(db, actor, organizationId, membershipId);
}

/** Bringing someone back gives them access again, so it counts as raising (TECH-03 §9). */
export async function reactivateMember(db: Database, actor: ActorContext, organizationId: string, membershipId: string, input: MemberStatusChange) {
  const manager = await requireMember(db, actor, organizationId);
  enforce(needsPermission(manager, "MANAGE_TEAM"));
  await db.transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const target = await membershipInOrganization(tx, organizationId, membershipId);
    enforce(canManageMember(manager, { membershipId, ...target.grant }));
    if (target.membership.status !== "DEACTIVATED") throw new AppError("RULE_FAILED", { message: "This member is already active.", context: { reason: "ALREADY_ACTIVE" } });
    checkVersion(target.membership, input.version);
    enforce(canGrant(manager, target.grant));
    const names = await locationNames(tx, organizationId);
    requireConfirmation(input.confirmed, { member: target.name, action: "REACTIVATE", ...describe(names, raisedBy(null, target.grant)) });
    await requireRecentEmailCode(db, actor);
    await tx.update(schema.memberships).set({ status: "ACTIVE", deactivatedAt: null, version: target.membership.version + 1 }).where(eq(schema.memberships.id, membershipId));
    await recordAudit(tx, actor, {
      action: "organization.member_reactivated",
      summary: `Reactivated a member (${ROLE_LABELS[target.grant.role]})`,
      recordType: "MEMBERSHIP",
      recordId: membershipId,
      recordLabel: manager.organizationName,
      before: { status: "DEACTIVATED" },
      after: { ...auditGrant(target.grant, "ACTIVE"), highRisk: true },
      permission: "MANAGE_TEAM",
    });
  });
  return memberView(db, actor, organizationId, membershipId);
}

/** Changing the final Owner is high-risk (TECH-03 §9): confirmation, a recent email code and an audit entry. */
export async function transferOwnership(deps: OrganizationDeps, actor: ActorContext, organizationId: string, input: OwnershipTransfer): Promise<Team> {
  const owner = await requireMember(deps.db, actor, organizationId);
  enforce(canTransferOwnership(owner));
  await deps.db.transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const target = await membershipInOrganization(tx, organizationId, input.membershipId);
    if (target.membership.userId === owner.userId) throw new AppError("RULE_FAILED", { message: "Choose another member.", context: { reason: "SELF" } });
    if (target.membership.status !== "ACTIVE") throw new AppError("RULE_FAILED", { message: "Reactivate this member first.", context: { reason: "MEMBER_DEACTIVATED" } });
    if (target.grant.role === "OWNER") throw new AppError("RULE_FAILED", { message: "This member is already an Owner.", context: { reason: "ALREADY_OWNER" } });
    const ownerGrant: Grant = { role: "OWNER", permissions: grantFor("OWNER", null), allLocations: true, locationIds: [] };
    const names = await locationNames(tx, organizationId);
    requireConfirmation(input.confirmed, { member: target.name, stepDown: input.stepDown, ...describe(names, raisedBy(target.grant, ownerGrant)) });
    await requireRecentEmailCode(deps.db, actor);
    await tx.update(schema.memberships).set({ role: "OWNER", allLocations: true, version: target.membership.version + 1 }).where(eq(schema.memberships.id, target.membership.id));
    await writeGrants(tx, { id: target.membership.id, organizationId }, ownerGrant);
    if (input.stepDown) {
      const adminGrant: Grant = { role: "ADMIN", permissions: grantFor("ADMIN", null), allLocations: true, locationIds: [] };
      await tx.update(schema.memberships).set({ role: "ADMIN", version: sql`${schema.memberships.version} + 1` }).where(eq(schema.memberships.id, owner.membershipId));
      await writeGrants(tx, { id: owner.membershipId, organizationId }, adminGrant);
    }
    await recordAudit(tx, actor, {
      action: "organization.ownership_transferred",
      summary: input.stepDown ? "Ownership transferred; the previous Owner is now an Admin" : "Another member made an Owner",
      recordType: "ORGANIZATION",
      recordId: organizationId,
      recordLabel: owner.organizationName,
      before: { newOwnerMembershipId: target.membership.id, role: target.grant.role, previousOwnerMembershipId: owner.membershipId },
      after: { newOwnerRole: "OWNER", previousOwnerRole: input.stepDown ? "ADMIN" : "OWNER", highRisk: true },
    });
    await queueEmail(deps, tx, {
      template: "organization_role_changed",
      to: target.email,
      data: { organization: owner.organizationName, role: ROLE_LABELS.OWNER, url: workspaceUrl(deps, organizationId) },
      record: { type: "ORGANIZATION", id: organizationId, label: owner.organizationName },
      requestId: actor.requestId,
    });
  });
  // After stepping down the person is an Admin, who can still see the team (read with a fresh actor).
  return listTeam(deps.db, { ...actor }, organizationId);
}
