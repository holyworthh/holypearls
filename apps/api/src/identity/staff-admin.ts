import type { InviteStaff, StaffInvitation, StaffInvitationPreview, StaffList, StaffMember, StaffPermission } from "@holypearls/contracts";
import { and, type Database, desc, eq, gt, inArray, schema, sql } from "@holypearls/db";
import { createHash, randomBytes } from "node:crypto";
import { AppError } from "../errors.js";
import { recordAudit } from "../platform/audit.js";
import { type NotificationDeps, queueEmail } from "../platform/notifications.js";
import { enforce } from "../platform/policy.js";
import { type ActorContext, requireRecentMfa, requireUser } from "./actor.js";
import { maskEmail } from "./customers.js";
import { normalizeEmail } from "./invitations.js";
import { canManageStaffAccess, canResetStaffMfa } from "./policies.js";

/*
 * Staff user administration (T13-05b; PRD-06 §2, §18; TECH-03 §8–11; Pen 122).
 * STAFF_ADMIN throughout. Inviting someone with permissions raises access, so
 * it needs a recent MFA check (TECH-03 §9). At least two active people keep
 * STAFF_ADMIN: removing it, or deactivating a holder, is refused below that
 * (TECH-03 §10). Granting, revoking and MFA resets stay in staff-access.ts.
 */

export interface StaffAdminDeps extends NotificationDeps {
  webOrigin: string;
}

type InvitationRow = typeof schema.staffInvitations.$inferSelect;
const DAY_MS = 86_400_000;
const VALID_DAYS = 7;
const hashOf = (token: string) => createHash("sha256").update(token).digest("base64url");
const effective = (row: Pick<InvitationRow, "status" | "expiresAt">, now: Date) => (row.status === "PENDING" && row.expiresAt <= now ? ("EXPIRED" as const) : row.status);
const longDate = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

/** Active STAFF_ADMIN holders, by name. */
export async function activeStaffAdmins(db: Database | Parameters<Parameters<Database["transaction"]>[0]>[0]) {
  const rows = await db
    .select({ id: schema.staffProfiles.id, name: schema.staffProfiles.displayName })
    .from(schema.staffPermissionGrants)
    .innerJoin(schema.staffProfiles, eq(schema.staffProfiles.id, schema.staffPermissionGrants.staffProfileId))
    .where(and(eq(schema.staffPermissionGrants.permission, "STAFF_ADMIN"), eq(schema.staffProfiles.status, "ACTIVE")));
  return rows;
}

async function members(db: Database, ids?: string[]) {
  const rows = await db
    .select({
      staffProfileId: schema.staffProfiles.id,
      name: schema.staffProfiles.displayName,
      email: schema.users.email,
      mfaEnabled: schema.users.twoFactorEnabled,
      status: schema.staffProfiles.status,
      permission: schema.staffPermissionGrants.permission,
    })
    .from(schema.staffProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.staffProfiles.userId))
    .leftJoin(schema.staffPermissionGrants, eq(schema.staffPermissionGrants.staffProfileId, schema.staffProfiles.id))
    .where(ids ? inArray(schema.staffProfiles.id, ids) : undefined)
    .orderBy(schema.staffProfiles.displayName);
  const byId = new Map<string, StaffList["members"][number]>();
  for (const row of rows) {
    const member = byId.get(row.staffProfileId) ?? { staffProfileId: row.staffProfileId, name: row.name, email: row.email, mfaEnabled: Boolean(row.mfaEnabled), status: row.status, permissions: [] as StaffPermission[] };
    if (row.permission) member.permissions.push(row.permission);
    byId.set(row.staffProfileId, member);
  }
  return [...byId.values()].map((member) => ({ ...member, permissions: member.permissions.sort() }));
}

const invitationView = (row: InvitationRow, now: Date): StaffInvitation => ({
  id: row.id,
  email: row.emailNormalized,
  name: row.displayName,
  permissions: [...row.permissions].sort(),
  status: effective(row, now),
  expiresAt: row.expiresAt.toISOString(),
});

/** The staff list (Pen 122 rbymz): members, then invitations still open. */
export async function listStaff(db: Database, actor: ActorContext): Promise<StaffList> {
  enforce(canManageStaffAccess(actor));
  const open = await db.select().from(schema.staffInvitations).where(eq(schema.staffInvitations.status, "PENDING")).orderBy(desc(schema.staffInvitations.createdAt));
  return { members: await members(db), invitations: open.map((row) => invitationView(row, actor.now)) };
}

/** One member (Pen 122 pplkz): permissions, MFA, sessions, and who else holds STAFF_ADMIN. */
export async function getStaffMember(db: Database, actor: ActorContext, staffProfileId: string): Promise<StaffMember> {
  enforce(canManageStaffAccess(actor));
  const [member] = await members(db, [staffProfileId]);
  if (!member) throw new AppError("NOT_FOUND");
  const [profile] = await db.select({ userId: schema.staffProfiles.userId }).from(schema.staffProfiles).where(eq(schema.staffProfiles.id, staffProfileId));
  const [sessions] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, profile!.userId), gt(schema.sessions.expiresAt, actor.now)));
  const [reset] = await db
    .select({ at: schema.auditLog.occurredAt, by: schema.auditLog.actorLabel })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, "staff.mfa_reset"), eq(schema.auditLog.recordId, staffProfileId)))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(1);
  return {
    ...member,
    lastMfaReset: reset ? { at: reset.at.toISOString(), by: reset.by } : null,
    activeSessions: sessions?.n ?? 0,
    activeStaffAdmins: (await activeStaffAdmins(db)).map((admin) => admin.name),
  };
}

/** Invites someone (Pen 122 "Invitation sent"): 7 days, one use, emailed; the secret travels after # only. */
export async function inviteStaff(deps: StaffAdminDeps, actor: ActorContext, input: InviteStaff): Promise<StaffInvitation> {
  enforce(canManageStaffAccess(actor));
  // Giving someone permissions is raising their access (TECH-03 §9).
  if (input.permissions.length) requireRecentMfa(actor);
  const email = normalizeEmail(input.email);
  const inviter = requireUser(actor).session.name;
  const row = await deps.db.transaction(async (tx) => {
    const [staff] = await tx
      .select({ status: schema.staffProfiles.status })
      .from(schema.staffProfiles)
      .innerJoin(schema.users, eq(schema.users.id, schema.staffProfiles.userId))
      .where(sql`lower(${schema.users.email}) = ${email}`);
    if (staff?.status === "ACTIVE") throw new AppError("RULE_FAILED", { message: "This person is already on the staff.", context: { reason: "ALREADY_STAFF" } });
    const [pending] = await tx.select().from(schema.staffInvitations).where(and(eq(schema.staffInvitations.emailNormalized, email), eq(schema.staffInvitations.status, "PENDING")));
    if (pending && pending.expiresAt > actor.now) {
      throw new AppError("RULE_FAILED", { message: "This person already has an invitation waiting. Cancel it to send a new one.", context: { reason: "ALREADY_INVITED" } });
    }
    if (pending) await tx.update(schema.staffInvitations).set({ status: "EXPIRED", updatedAt: actor.now }).where(eq(schema.staffInvitations.id, pending.id));
    const token = randomBytes(32).toString("base64url");
    const [created] = await tx
      .insert(schema.staffInvitations)
      .values({
        secretHash: hashOf(token),
        emailNormalized: email,
        displayName: input.name,
        permissions: [...input.permissions].sort(),
        expiresAt: new Date(actor.now.getTime() + VALID_DAYS * DAY_MS),
        invitedByUserId: requireUser(actor).session.userId,
        createdAt: actor.now,
        updatedAt: actor.now,
      })
      .returning();
    await queueEmail(deps, tx, {
      template: "staff_invitation",
      to: email,
      data: { invitedBy: inviter, permissions: input.permissions.join(", ") || "none yet", expires: longDate(created!.expiresAt), url: `${deps.webOrigin}/invitations#${token}` },
      record: { type: "STAFF_INVITATION", id: created!.id, label: input.name },
      linkLabel: "Accept the invitation",
      requestId: actor.requestId,
    });
    await recordAudit(tx, actor, {
      action: "staff.invited",
      summary: `Staff invitation sent to ${input.name}`,
      recordType: "STAFF_INVITATION",
      recordId: created!.id,
      recordLabel: input.name,
      after: { permissions: created!.permissions, expiresAt: created!.expiresAt.toISOString() },
      permission: "STAFF_ADMIN",
    });
    return created!;
  });
  return invitationView(row, actor.now);
}

export async function revokeStaffInvitation(db: Database, actor: ActorContext, id: string) {
  enforce(canManageStaffAccess(actor));
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.staffInvitations)
      .set({ status: "REVOKED", revokedAt: actor.now, updatedAt: actor.now })
      .where(and(eq(schema.staffInvitations.id, id), eq(schema.staffInvitations.status, "PENDING")))
      .returning();
    if (!row) throw new AppError("NOT_FOUND");
    await recordAudit(tx, actor, { action: "staff.invitation_revoked", summary: `Staff invitation for ${row.displayName} cancelled`, recordType: "STAFF_INVITATION", recordId: id, recordLabel: row.displayName, permission: "STAFF_ADMIN" });
  });
  return listStaff(db, actor);
}

/**
 * Deactivates a staff member (Pen 122 "Deactivate Uche Nna?"): access ends
 * at once and every session is signed out; history is kept. Not yourself, and
 * never the third-last STAFF_ADMIN (TECH-03 §10).
 */
export async function deactivateStaff(db: Database, actor: ActorContext, staffProfileId: string) {
  enforce(canResetStaffMfa(actor, { staffProfileId }));
  await db.transaction(async (tx) => {
    // One lock for every change to who holds STAFF_ADMIN, so two removals can't both pass the count.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('staff_admins'))`);
    const [profile] = await tx.select().from(schema.staffProfiles).where(eq(schema.staffProfiles.id, staffProfileId));
    if (!profile) throw new AppError("NOT_FOUND");
    if (profile.status === "DEACTIVATED") return;
    const admins = await activeStaffAdmins(tx);
    if (admins.some((admin) => admin.id === staffProfileId) && admins.length <= 2) {
      throw new AppError("FORBIDDEN", {
        message: `${admins.map((admin) => admin.name).join(" and ")} are the only STAFF_ADMIN. Add another STAFF_ADMIN before deactivating this one.`,
        context: { reason: "MINIMUM_STAFF_ADMINS", minimum: 2 },
      });
    }
    await tx.update(schema.staffProfiles).set({ status: "DEACTIVATED", updatedAt: actor.now }).where(eq(schema.staffProfiles.id, staffProfileId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, profile.userId));
    await recordAudit(tx, actor, {
      action: "staff.deactivated",
      summary: `${profile.displayName} deactivated; sessions ended`,
      recordType: "STAFF",
      recordId: staffProfileId,
      recordLabel: profile.displayName,
      before: { status: "ACTIVE" },
      after: { status: "DEACTIVATED", sessionsEnded: true },
      permission: "STAFF_ADMIN",
    });
  });
  return getStaffMember(db, actor, staffProfileId);
}

async function findBySecret(db: Database | Parameters<Parameters<Database["transaction"]>[0]>[0], token: string, lock = false) {
  const query = db.select().from(schema.staffInvitations).where(eq(schema.staffInvitations.secretHash, hashOf(token)));
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

export async function previewStaffInvitation(db: Database, token: string, now: Date): Promise<StaffInvitationPreview> {
  const row = await findBySecret(db, token);
  if (!row) throw new AppError("NOT_FOUND");
  return { status: effective(row, now), invitedEmail: maskEmail(row.emailNormalized), permissions: [...row.permissions].sort(), expiresAt: row.expiresAt.toISOString() };
}

const CLOSED = {
  ACCEPTED: "This invitation has already been used.",
  EXPIRED: "This invitation has expired. Ask for a new one.",
  REVOKED: "This invitation was cancelled. Ask for a new one.",
} as const;

/**
 * Accepts a staff invitation (TECH-03 §11): signed in with the invited email,
 * verified. Creates the staff profile, or reactivates a deactivated one, with
 * the invited permissions. MFA is set up at the first admin sign-in.
 */
export async function acceptStaffInvitation(db: Database, actor: ActorContext, token: string, adminOrigin: string) {
  const user = requireUser(actor);
  await db.transaction(async (tx) => {
    const invitation = await findBySecret(tx, token, true);
    if (!invitation) throw new AppError("NOT_FOUND");
    const status = effective(invitation, actor.now);
    if (status !== "PENDING") throw new AppError("RULE_FAILED", { message: CLOSED[status], context: { reason: `INVITATION_${status}` } });
    if (!user.session.emailVerified) throw new AppError("RULE_FAILED", { message: "Verify your email first, then accept the invitation.", context: { reason: "VERIFY_EMAIL_FIRST" } });
    if (normalizeEmail(user.session.email) !== invitation.emailNormalized) {
      throw new AppError("RULE_FAILED", { message: "This invitation is for a different email address. Sign in with the invited email.", context: { reason: "WRONG_ACCOUNT" } });
    }
    const [existing] = await tx.select().from(schema.staffProfiles).where(eq(schema.staffProfiles.userId, user.session.userId));
    if (existing?.status === "ACTIVE") throw new AppError("RULE_FAILED", { message: "You're already on the staff.", context: { reason: "ALREADY_STAFF" } });
    let profileId: string;
    if (existing) {
      await tx.update(schema.staffProfiles).set({ status: "ACTIVE", displayName: invitation.displayName, updatedAt: actor.now }).where(eq(schema.staffProfiles.id, existing.id));
      await tx.delete(schema.staffPermissionGrants).where(eq(schema.staffPermissionGrants.staffProfileId, existing.id));
      profileId = existing.id;
    } else {
      const [created] = await tx.insert(schema.staffProfiles).values({ userId: user.session.userId, displayName: invitation.displayName }).returning({ id: schema.staffProfiles.id });
      profileId = created!.id;
    }
    const [inviter] = invitation.invitedByUserId ? await tx.select({ id: schema.staffProfiles.id }).from(schema.staffProfiles).where(eq(schema.staffProfiles.userId, invitation.invitedByUserId)) : [];
    if (invitation.permissions.length) {
      await tx.insert(schema.staffPermissionGrants).values(invitation.permissions.map((permission) => ({ staffProfileId: profileId, permission, grantedByStaffId: inviter?.id ?? null })));
    }
    await tx.update(schema.staffInvitations).set({ status: "ACCEPTED", acceptedAt: actor.now, acceptedByUserId: user.session.userId, updatedAt: actor.now }).where(eq(schema.staffInvitations.id, invitation.id));
    await recordAudit(tx, actor, {
      action: "staff.invitation_accepted",
      summary: `${invitation.displayName} joined the staff from an invitation`,
      recordType: "STAFF",
      recordId: profileId,
      recordLabel: invitation.displayName,
      after: { invitationId: invitation.id, permissions: invitation.permissions, reactivated: Boolean(existing) },
    });
  });
  // MFA comes next, at the first admin sign-in (TECH-03 §10).
  return { adminSignInUrl: `${adminOrigin}/sign-in` };
}
