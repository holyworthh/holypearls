import type { AdminOrganizationRequest, MyOrganizationRequest, OrganizationRequest, OrganizationRequestInput } from "@holypearls/contracts";
import { type Database, desc, eq, schema } from "@holypearls/db";
import { AppError } from "../errors.js";
import { type ActorContext, requireUser } from "../identity/actor.js";
import { assertStaff } from "../identity/staff.guard.js";
import { recordAudit } from "../platform/audit.js";
import { queueEmail } from "../platform/notifications.js";
import { createOrganization } from "./organizations.js";
import type { OrganizationDeps } from "./team.js";

/*
 * Workspace requests: owner decision of 2026-10-08, which no PRD, TECH
 * document or ADR covers. A signed-in customer with a verified email asks for
 * a workspace; staff with ORGANIZATION_APPROVE approve or decline it.
 * Approving creates the organization, its locations and the requester as its
 * ACTIVE Owner with All locations. PENDING → APPROVED | DECLINED.
 */

type Row = typeof schema.organizationRequests.$inferSelect;

const toRequest = (row: Row): OrganizationRequest => ({
  id: row.id,
  status: row.status,
  companyName: row.companyName,
  locations: row.requestedLocations,
  teamSize: row.teamSize,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
  decidedAt: row.decidedAt?.toISOString() ?? null,
  declineReason: row.declineReason,
  organizationId: row.organizationId,
});

export async function myOrganizationRequest(db: Database, actor: ActorContext): Promise<MyOrganizationRequest> {
  const user = requireUser(actor);
  const [row] = await db
    .select()
    .from(schema.organizationRequests)
    .where(eq(schema.organizationRequests.requesterUserId, user.session.userId))
    .orderBy(desc(schema.organizationRequests.createdAt))
    .limit(1);
  return { request: row ? toRequest(row) : null };
}

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string })?.code === "23505" || (error as { cause?: { code?: string } })?.cause?.code === "23505";

/** Unverified accounts can't ask (T09-01's verified-email rule); one request waits at a time. */
export async function submitOrganizationRequest(deps: OrganizationDeps, actor: ActorContext, input: OrganizationRequestInput): Promise<OrganizationRequest> {
  const user = requireUser(actor);
  if (!user.session.emailVerified) {
    throw new AppError("RULE_FAILED", { message: "Verify your email first, then ask for a workspace.", context: { reason: "VERIFY_EMAIL_FIRST" } });
  }
  try {
    const row = await deps.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.organizationRequests)
        .values({ requesterUserId: user.session.userId, companyName: input.companyName, requestedLocations: input.locations, teamSize: input.teamSize, note: input.note })
        .returning();
      await recordAudit(tx, actor, {
        action: "organization.requested",
        summary: `Workspace requested for ${input.companyName}`,
        recordType: "ORGANIZATION_REQUEST",
        recordId: created!.id,
        recordLabel: input.companyName,
        after: { companyName: input.companyName, locations: input.locations.length, teamSize: input.teamSize },
      });
      await queueEmail(deps, tx, {
        template: "organization_request_staff",
        to: deps.helpInboxEmail,
        data: { company: input.companyName, locations: input.locations.length, url: `${deps.adminOrigin}/organization-requests/${created!.id}` },
        record: { type: "ORGANIZATION_REQUEST", id: created!.id, label: input.companyName },
        requestId: actor.requestId,
      });
      return created!;
    });
    return toRequest(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("RULE_FAILED", { message: "Your workspace request is already with our team.", context: { reason: "REQUEST_PENDING" } });
    }
    throw error;
  }
}

/* Staff queue (ORGANIZATION_APPROVE). */

async function adminRows(db: Database, where?: ReturnType<typeof eq>) {
  const query = db
    .select({ request: schema.organizationRequests, name: schema.users.name, email: schema.users.email, emailVerified: schema.users.emailVerified, decidedBy: schema.staffProfiles.displayName })
    .from(schema.organizationRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.organizationRequests.requesterUserId))
    .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.id, schema.organizationRequests.decidedByStaffId));
  const rows = await (where ? query.where(where) : query).orderBy(desc(schema.organizationRequests.createdAt)).limit(200);
  return rows.map(
    (row): AdminOrganizationRequest => ({
      ...toRequest(row.request),
      requester: { userId: row.request.requesterUserId, name: row.name, email: row.email, emailVerified: row.emailVerified },
      decidedBy: row.decidedBy,
    }),
  );
}

export async function listOrganizationRequests(db: Database, status?: string) {
  const known = status === "PENDING" || status === "APPROVED" || status === "DECLINED";
  return { requests: await adminRows(db, known ? eq(schema.organizationRequests.status, status) : undefined) };
}

export async function getOrganizationRequest(db: Database, id: string) {
  const [row] = await adminRows(db, eq(schema.organizationRequests.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

async function lockPending(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], id: string) {
  const [row] = await tx.select().from(schema.organizationRequests).where(eq(schema.organizationRequests.id, id)).for("update");
  if (!row) throw new AppError("NOT_FOUND");
  if (row.status !== "PENDING") throw new AppError("RULE_FAILED", { message: "Someone already decided this request.", context: { reason: "ALREADY_DECIDED", status: row.status } });
  return row;
}

/** Creates the organization, its locations and the requester as ACTIVE Owner, in one transaction. */
export async function approveOrganizationRequest(deps: OrganizationDeps, actor: ActorContext, id: string) {
  const staff = assertStaff(actor, "ORGANIZATION_APPROVE");
  await deps.db.transaction(async (tx) => {
    const row = await lockPending(tx, id);
    const [requester] = await tx.select({ email: schema.users.email, emailVerified: schema.users.emailVerified }).from(schema.users).where(eq(schema.users.id, row.requesterUserId));
    if (!requester?.emailVerified) throw new AppError("RULE_FAILED", { message: "The requester's email isn't verified.", context: { reason: "REQUESTER_UNVERIFIED" } });
    const { organizationId, membershipId } = await createOrganization(tx, { name: row.companyName, locations: row.requestedLocations, ownerUserId: row.requesterUserId });
    await tx
      .update(schema.organizationRequests)
      .set({ status: "APPROVED", decidedAt: actor.now, decidedByStaffId: staff.staff.staffProfileId, organizationId })
      .where(eq(schema.organizationRequests.id, id));
    await recordAudit(tx, actor, {
      action: "organization.request_approved",
      summary: `Workspace approved: ${row.companyName}`,
      recordType: "ORGANIZATION_REQUEST",
      recordId: id,
      recordLabel: row.companyName,
      before: { status: "PENDING" },
      after: { status: "APPROVED", organizationId, ownerMembershipId: membershipId, locations: row.requestedLocations.length },
      permission: "ORGANIZATION_APPROVE",
    });
    await queueEmail(deps, tx, {
      template: "organization_request_approved",
      to: requester.email,
      data: { organization: row.companyName, url: `${deps.webOrigin}/workspace/${organizationId}/team` },
      record: { type: "ORGANIZATION", id: organizationId, label: row.companyName },
      requestId: actor.requestId,
    });
  });
  return getOrganizationRequest(deps.db, id);
}

export async function declineOrganizationRequest(deps: OrganizationDeps, actor: ActorContext, id: string, reason: string) {
  const staff = assertStaff(actor, "ORGANIZATION_APPROVE");
  await deps.db.transaction(async (tx) => {
    const row = await lockPending(tx, id);
    const [requester] = await tx.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, row.requesterUserId));
    await tx
      .update(schema.organizationRequests)
      .set({ status: "DECLINED", decidedAt: actor.now, decidedByStaffId: staff.staff.staffProfileId, declineReason: reason })
      .where(eq(schema.organizationRequests.id, id));
    await recordAudit(tx, actor, {
      action: "organization.request_declined",
      summary: `Workspace declined: ${row.companyName}`,
      recordType: "ORGANIZATION_REQUEST",
      recordId: id,
      recordLabel: row.companyName,
      before: { status: "PENDING" },
      after: { status: "DECLINED", reason },
      permission: "ORGANIZATION_APPROVE",
    });
    if (requester) {
      await queueEmail(deps, tx, {
        template: "organization_request_declined",
        to: requester.email,
        data: { company: row.companyName, reason },
        record: { type: "ORGANIZATION_REQUEST", id, label: row.companyName },
        requestId: actor.requestId,
      });
    }
  });
  return getOrganizationRequest(deps.db, id);
}
