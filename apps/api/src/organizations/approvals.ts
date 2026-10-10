import type { ApprovalPolicy, Configuration, DecideOrderRequest, OrderRequest, OrderRequestList, OrderRequestStatus, UpdateApprovalPolicy } from "@holypearls/contracts";
import { displayMoney } from "@holypearls/contracts";
import { and, type Database, desc, eq, inArray, ne, schema, type Transaction } from "@holypearls/db";
import { currentDesigns, heldQuotable, holdForApproval, quoteIn, releaseFromApproval } from "../configuration/drafts.js";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import { queueEmail } from "../platform/notifications.js";
import { enforce } from "../platform/policy.js";
import { scopeFor, scopeWhere } from "./scope.js";
import { findActiveMember, type Member, requireMember } from "./members.js";
import { canSeeLocation, needsPermission } from "./policies.js";
import type { OrganizationDeps } from "./team.js";

/*
 * Internal approval (T11-04; PRD-05 B2B-FR-040–042, 044; TECH-01 §4; Pen
 * frames 72–73). One rule per organization. A request that needs approval
 * waits as an order request; someone with "Approve organization requests"
 * for its location approves (which sends it to HolyPearls for a quote),
 * requests changes, or declines. With "separate requester and approver" on,
 * nobody decides their own request. Decisions are insert-only.
 */

type Db = Database | Transaction;
type RequestRow = typeof schema.orderRequests.$inferSelect;

const actorName = (actor: ActorContext) => (actor.type === "user" ? actor.session.name : "A member");
const naira = (minor: bigint | string | null, currency = "NGN") => (minor === null ? null : displayMoney(minor.toString(), currency));
const workspaceUrl = (deps: OrganizationDeps, organizationId: string, requestId: string) => `${deps.webOrigin}/workspace/${organizationId}/approvals/${requestId}`;

/* ——— Policy ——— */

export async function policyFor(db: Db, organizationId: string) {
  const [row] = await db.select().from(schema.approvalPolicies).where(eq(schema.approvalPolicies.organizationId, organizationId));
  const requesters = row ? await db.select({ membershipId: schema.approvalPolicyRequesters.membershipId }).from(schema.approvalPolicyRequesters).where(eq(schema.approvalPolicyRequesters.organizationId, organizationId)) : [];
  return {
    rule: row?.rule ?? "NONE",
    thresholdMinor: row?.thresholdMinor ?? null,
    currency: (row?.currency ?? "NGN") as "NGN" | "USD",
    separateRequesterApprover: row?.separateRequesterApprover ?? true,
    requesterIds: new Set(requesters.map((item) => item.membershipId)),
    version: row?.version ?? 0,
  };
}

type Policy = Awaited<ReturnType<typeof policyFor>>;

export async function getApprovalPolicy(db: Database, actor: ActorContext, organizationId: string): Promise<ApprovalPolicy> {
  const member = await requireMember(db, actor, organizationId);
  return policyView(db, organizationId, member, await policyFor(db, organizationId));
}

async function policyView(db: Db, organizationId: string, member: Member, policy: Policy): Promise<ApprovalPolicy> {
  const people = policy.requesterIds.size
    ? await db
        .select({ membershipId: schema.memberships.id, name: schema.users.name })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(and(eq(schema.memberships.organizationId, organizationId), inArray(schema.memberships.id, [...policy.requesterIds])))
    : [];
  return {
    rule: policy.rule,
    thresholdMinor: policy.thresholdMinor?.toString() ?? null,
    currency: policy.currency,
    requesters: people.sort((a, b) => a.name.localeCompare(b.name)),
    separateRequesterApprover: policy.separateRequesterApprover,
    canManage: member.role === "OWNER",
    version: policy.version,
  };
}

/** Only an Owner sets the rule: it decides who can spend without a second pair of eyes. */
export async function updateApprovalPolicy(db: Database, actor: ActorContext, organizationId: string, input: UpdateApprovalPolicy): Promise<ApprovalPolicy> {
  const member = await requireMember(db, actor, organizationId);
  if (member.role !== "OWNER") throw new AppError("FORBIDDEN", { context: { reason: "OWNER_REQUIRED" } });
  if (input.requesterMembershipIds.length) {
    const found = await db.select({ id: schema.memberships.id }).from(schema.memberships).where(and(eq(schema.memberships.organizationId, organizationId), inArray(schema.memberships.id, input.requesterMembershipIds)));
    if (found.length !== new Set(input.requesterMembershipIds).size) throw new AppError("VALIDATION_FAILED", { fieldErrors: { requesterMembershipIds: "Choose people in this workspace" } });
  }
  await db.transaction(async (tx) => {
    const before = await policyFor(tx, organizationId);
    if (before.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: before.version } });
    const values = {
      rule: input.rule,
      thresholdMinor: input.rule === "ABOVE_AMOUNT" ? BigInt(input.thresholdMinor!) : null,
      separateRequesterApprover: input.separateRequesterApprover,
      updatedByUserId: member.userId,
    };
    if (before.version === 0) await tx.insert(schema.approvalPolicies).values({ organizationId, ...values });
    else await tx.update(schema.approvalPolicies).set({ ...values, version: before.version + 1, updatedAt: actor.now }).where(eq(schema.approvalPolicies.organizationId, organizationId));
    await tx.delete(schema.approvalPolicyRequesters).where(eq(schema.approvalPolicyRequesters.organizationId, organizationId));
    const requesters = input.rule === "REQUESTERS" ? [...new Set(input.requesterMembershipIds)] : [];
    if (requesters.length) await tx.insert(schema.approvalPolicyRequesters).values(requesters.map((membershipId) => ({ organizationId, membershipId })));
    await recordAudit(tx, actor, {
      action: "approval_policy.updated",
      summary: `Approval rule set to ${input.rule}`,
      recordType: "ORGANIZATION",
      recordId: organizationId,
      before: { rule: before.rule, thresholdMinor: before.thresholdMinor?.toString() ?? null, separateRequesterApprover: before.separateRequesterApprover },
      after: { rule: input.rule, thresholdMinor: values.thresholdMinor?.toString() ?? null, separateRequesterApprover: input.separateRequesterApprover, requesters },
    });
  });
  return getApprovalPolicy(db, actor, organizationId);
}

/**
 * Does this request need approval (B2B-FR-040)? Above an amount, a request
 * with no estimate yet needs approval too: nobody can show it's under.
 */
export function approvalNeeded(policy: Policy, member: Member, estimateMinor: bigint | null, requesterName = "this person"): { needed: boolean; note: string | null } {
  const limit = naira(policy.thresholdMinor, policy.currency);
  switch (policy.rule) {
    case "ALL":
      return { needed: true, note: `${member.organizationName} policy: every order needs an approver.` };
    case "ABOVE_AMOUNT":
      if (estimateMinor === null) return { needed: true, note: `${member.organizationName} policy: orders above ${limit} need an approver. This one has no price yet.` };
      return estimateMinor > policy.thresholdMinor!
        ? { needed: true, note: `${member.organizationName} policy: orders above ${limit} need an approver. This one is ${naira(estimateMinor - policy.thresholdMinor!, policy.currency)} over.` }
        : { needed: false, note: null };
    case "REQUESTERS":
      return policy.requesterIds.has(member.membershipId) ? { needed: true, note: `${member.organizationName} policy: orders from ${requesterName} need an approver.` } : { needed: false, note: null };
    default:
      return { needed: false, note: null };
  }
}

/** The approval rule as the order form shows it (frame 131 "Approval needed"). */
export async function approvalCheck(db: Db, member: Member, estimateMinor: bigint | null, requesterName?: string) {
  return approvalNeeded(await policyFor(db, member.organizationId), member, estimateMinor, requesterName);
}

/* ——— Order requests ——— */

/**
 * Starts an order request waiting for approval, holding its designs (B2B-FR-040;
 * frame 131 "this becomes an order request for approval"). The approvers for
 * its location are emailed.
 */
export async function createOrderRequest(
  deps: OrganizationDeps,
  tx: Transaction,
  actor: ActorContext,
  member: Member,
  input: { locationId: string; title: string; designs: Configuration[]; estimateMinor: bigint | null; currency: string; policyNote: string | null; templateName: string | null },
) {
  const items = input.designs.map((design) => ({
    configurationId: design.id,
    productName: design.productName,
    quantity: design.price?.quantity ?? design.quantity,
    templateName: input.templateName,
    totalMinor: design.price?.totalMinor ?? null,
    priceState: design.price?.state ?? null,
  }));
  const [row] = await tx
    .insert(schema.orderRequests)
    .values({
      organizationId: member.organizationId,
      locationId: input.locationId,
      title: input.title,
      status: "PENDING_APPROVAL",
      requestedByUserId: member.userId,
      requestedByMembershipId: member.membershipId,
      estimatedTotalMinor: input.estimateMinor,
      currency: input.currency,
      configurationIds: input.designs.map((design) => design.id),
      snapshot: { schema: "order-request/v1", items, policyNote: input.policyNote, designs: input.designs },
      submittedAt: actor.now,
    })
    .returning();
  await holdForApproval(tx, row!.configurationIds);
  await recordAudit(tx, actor, { action: "order_request.submitted", summary: `Order request submitted for approval: ${input.title}`, recordType: "ORDER_REQUEST", recordId: row!.id, after: { status: "PENDING_APPROVAL", estimatedTotalMinor: input.estimateMinor?.toString() ?? null, locationId: input.locationId } });
  await emailApprovers(deps, tx, actor, row!, actorName(actor));
  return row!;
}

async function emailApprovers(deps: OrganizationDeps, tx: Transaction, actor: ActorContext, row: RequestRow, requestedBy: string) {
  const [location] = await tx.select({ name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.id, row.locationId));
  for (const approver of await approversFor(tx, row)) {
    if (approver.userId === row.requestedByUserId) continue;
    await queueEmail(deps, tx, {
      template: "order_request_submitted",
      to: approver.email,
      data: { title: row.title, requestedBy, location: location?.name ?? "", amount: naira(row.estimatedTotalMinor, row.currency) ?? undefined, url: workspaceUrl(deps, row.organizationId, row.id) },
      record: { type: "ORDER_REQUEST", id: row.id, label: row.title },
      requestId: actor.requestId,
    });
  }
}

/** ACTIVE members with "Approve organization requests" whose locations include the request's. */
async function approversFor(db: Db, row: RequestRow) {
  const rows = await db
    .select({ membershipId: schema.memberships.id, userId: schema.memberships.userId, email: schema.users.email, allLocations: schema.memberships.allLocations })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .innerJoin(schema.membershipPermissions, eq(schema.membershipPermissions.membershipId, schema.memberships.id))
    .where(and(eq(schema.memberships.organizationId, row.organizationId), eq(schema.memberships.status, "ACTIVE"), eq(schema.membershipPermissions.permission, "APPROVE_REQUESTS")));
  if (!rows.length) return [];
  const scoped = await db
    .select({ membershipId: schema.membershipLocations.membershipId })
    .from(schema.membershipLocations)
    .where(and(inArray(schema.membershipLocations.membershipId, rows.map((item) => item.membershipId)), eq(schema.membershipLocations.locationId, row.locationId)));
  const inLocation = new Set(scoped.map((item) => item.membershipId));
  return rows.filter((item) => item.allLocations || inLocation.has(item.membershipId));
}

/** Who sees a request: its requester; approvers and record viewers for its location (Buyers see only their own). */
function canSee(member: Member, row: RequestRow) {
  if (!(member.allLocations || member.locationIds.has(row.locationId))) return false;
  if (row.requestedByUserId === member.userId) return true;
  return member.permissions.has("APPROVE_REQUESTS") || member.permissions.has("VIEW_RECORDS");
}

function decideState(member: Member, row: RequestRow, policy: Policy) {
  const able = row.status === "PENDING_APPROVAL" && member.permissions.has("APPROVE_REQUESTS") && (member.allLocations || member.locationIds.has(row.locationId));
  const own = row.requestedByUserId === member.userId;
  if (able && own && policy.separateRequesterApprover) return { canDecide: false, reason: "You can't approve your own request. Someone else with approval rights needs to decide." };
  return { canDecide: able, reason: null };
}

async function names(db: Db, userIds: readonly (string | null)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, ids));
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function summaries(db: Db, member: Member, rows: RequestRow[], policy: Policy) {
  const locations = new Map((await db.select({ id: schema.locations.id, name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.organizationId, member.organizationId))).map((row) => [row.id, row.name]));
  const people = await names(db, rows.map((row) => row.requestedByUserId));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status as OrderRequestStatus,
    locationId: row.locationId,
    locationName: locations.get(row.locationId) ?? "",
    requestedBy: (row.requestedByUserId && people.get(row.requestedByUserId)) || "Former member",
    estimatedTotalMinor: row.estimatedTotalMinor?.toString() ?? null,
    currency: row.currency as "NGN" | "USD",
    createdAt: row.createdAt.toISOString(),
    needsMyDecision: decideState(member, row, policy).canDecide,
  }));
}

export async function listOrderRequests(db: Database, actor: ActorContext, organizationId: string, options: { locationId?: string | null; needsDecision?: boolean; limit?: number } = {}): Promise<OrderRequestList> {
  const member = await requireMember(db, actor, organizationId);
  const policy = await policyFor(db, organizationId);
  const scope = scopeFor(member, options.locationId);
  if (member.permissions.has("APPROVE_REQUESTS")) scope.ownerUserId = null;
  if (options.needsDecision && !member.permissions.has("APPROVE_REQUESTS")) return { requests: [], canApprove: false };
  const rows = await db.select().from(schema.orderRequests).where(and(
    scopeWhere({ organizationId: schema.orderRequests.organizationId, locationId: schema.orderRequests.locationId, ownerUserId: schema.orderRequests.requestedByUserId }, scope),
    options.needsDecision ? eq(schema.orderRequests.status, "PENDING_APPROVAL") : undefined,
    options.needsDecision && policy.separateRequesterApprover ? ne(schema.orderRequests.requestedByUserId, member.userId) : undefined,
  )).orderBy(desc(schema.orderRequests.createdAt)).limit(options.limit ?? 200);
  const list = await summaries(db, member, rows.filter((row) => canSee(member, row)), policy);
  // Waiting for this person first, then the newest.
  list.sort((a, b) => Number(b.needsMyDecision) - Number(a.needsMyDecision));
  return { requests: list, canApprove: member.permissions.has("APPROVE_REQUESTS") };
}

async function loadRequest(db: Db, organizationId: string, requestId: string, options: { lock?: boolean } = {}) {
  const query = db.select().from(schema.orderRequests).where(and(eq(schema.orderRequests.id, requestId), eq(schema.orderRequests.organizationId, organizationId)));
  const [row] = options.lock ? await query.for("update") : await query;
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

async function requestView(db: Db, member: Member, row: RequestRow): Promise<OrderRequest> {
  const policy = await policyFor(db, member.organizationId);
  const [summary] = await summaries(db, member, [row], policy);
  const approvals = await db.select().from(schema.organizationApprovals).where(eq(schema.organizationApprovals.orderRequestId, row.id)).orderBy(schema.organizationApprovals.createdAt);
  const people = await names(db, [row.requestedByUserId, ...approvals.map((approval) => approval.decidedByUserId)]);
  const [quote] = row.quoteId ? await db.select({ reference: schema.quotes.reference }).from(schema.quotes).where(eq(schema.quotes.id, row.quoteId)) : [];
  const snapshot = row.snapshot as { items: OrderRequest["items"]; policyNote: string | null; reapproval?: { quoteVersion: number; totalMinor: string; approvedMinor: string; note: string | null } };
  const again = row.status === "PENDING_APPROVAL" && row.quoteId && snapshot.reapproval ? snapshot.reapproval : null;
  const decide = decideState(member, row, policy);
  const own = row.requestedByUserId === member.userId;
  const requester = (row.requestedByUserId && people.get(row.requestedByUserId)) || null;
  const label = { APPROVED: "Approved", REJECTED: "Declined", CHANGES_REQUESTED: "Changes requested" } as const;
  return {
    ...summary!,
    items: snapshot.items.map(({ configurationId, productName, quantity, templateName, totalMinor }) => ({ configurationId, productName, quantity, templateName, totalMinor })),
    policyNote: snapshot.policyNote,
    approvals: approvals.map((approval) => ({
      id: approval.id,
      decision: approval.decision,
      amountMinor: approval.approvedAmountMinor?.toString() ?? null,
      note: approval.note,
      decidedBy: (approval.decidedByUserId && people.get(approval.decidedByUserId)) || null,
      createdAt: approval.createdAt.toISOString(),
    })),
    history: [
      ...(row.submittedAt ? [{ label: "Submitted for approval", by: requester, at: row.submittedAt.toISOString() }] : []),
      ...approvals.map((approval) => ({ label: approval.decision === "APPROVED" ? `Approved ${naira(approval.approvedAmountMinor, approval.currency)}` : label[approval.decision], by: (approval.decidedByUserId && people.get(approval.decidedByUserId)) || null, at: approval.createdAt.toISOString() })),
      ...(row.sentAt ? [{ label: `Sent to HolyPearls for a quote${quote ? ` (${quote.reference})` : ""}`, by: null, at: row.sentAt.toISOString() }] : []),
    ].sort((a, b) => b.at.localeCompare(a.at)),
    quoteReference: quote?.reference ?? null,
    quoteId: row.quoteId,
    reapproval: again
      ? { approvedMinor: again.approvedMinor, quoteTotalMinor: again.totalMinor, differenceMinor: (BigInt(again.totalMinor) - BigInt(again.approvedMinor)).toString(), quoteVersion: again.quoteVersion, note: again.note }
      : null,
    canDecide: decide.canDecide,
    decideBlockedReason: decide.reason,
    canCancel: own && (row.status === "DRAFT" || row.status === "PENDING_APPROVAL"),
    canResubmit: own && row.status === "DRAFT",
    version: row.version,
  };
}

export async function getOrderRequest(db: Database, actor: ActorContext, organizationId: string, requestId: string): Promise<OrderRequest> {
  const member = await requireMember(db, actor, organizationId);
  const row = await loadRequest(db, organizationId, requestId);
  if (!canSee(member, row)) throw new AppError("NOT_FOUND");
  return requestView(db, member, row);
}

/**
 * Approve, request changes or decline (B2B-FR-041–042; frame 72). Approving
 * records the approved amount and scope and sends the request to HolyPearls
 * as a quote request owned by the requester, all in one transaction.
 */
export async function decideOrderRequest(deps: OrganizationDeps, actor: ActorContext, organizationId: string, requestId: string, input: DecideOrderRequest): Promise<OrderRequest> {
  const db = deps.db;
  const member = await requireMember(db, actor, organizationId);
  const current = await loadRequest(db, organizationId, requestId);
  if (!canSee(member, current)) throw new AppError("NOT_FOUND");
  enforce(needsPermission(member, "APPROVE_REQUESTS"));
  enforce(canSeeLocation(member, current.locationId));
  const policy = await policyFor(db, organizationId);
  if (current.requestedByUserId === member.userId && policy.separateRequesterApprover) throw new AppError("FORBIDDEN", { context: { reason: "SELF_APPROVAL" } });
  if (current.status !== "PENDING_APPROVAL") throw new AppError("RULE_FAILED", { message: "This request isn't waiting for approval.", context: { reason: "NOT_PENDING", status: current.status } });
  const amount = input.decision === "APPROVE" ? (input.amountMinor !== null ? BigInt(input.amountMinor) : current.estimatedTotalMinor) : null;
  if (input.decision === "APPROVE" && amount === null) throw new AppError("VALIDATION_FAILED", { fieldErrors: { amountMinor: "Enter the amount you approve" } });
  // A re-approval (T11-04b) decides on HolyPearls' quote, which already exists.
  const reapproval = current.quoteId !== null;
  // The quote is checked before anything changes, so a design that can't be quoted leaves the request waiting.
  const checked = input.decision === "APPROVE" && !reapproval ? await heldQuotable(db, current.configurationIds, actor.now) : [];
  const [requester] = current.requestedByUserId ? await db.select().from(schema.users).where(eq(schema.users.id, current.requestedByUserId)) : [];
  if (input.decision === "APPROVE" && !reapproval && !requester) throw new AppError("RULE_FAILED", { message: "The requester has left the workspace. Ask someone to request it again.", context: { reason: "REQUESTER_GONE" } });

  await db.transaction(async (tx) => {
    const row = await loadRequest(tx, organizationId, requestId, { lock: true });
    if (row.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: row.version } });
    if (row.status !== "PENDING_APPROVAL") throw new AppError("RULE_FAILED", { message: "This request isn't waiting for approval.", context: { reason: "NOT_PENDING", status: row.status } });
    const decision = input.decision === "APPROVE" ? "APPROVED" : input.decision === "DECLINE" ? "REJECTED" : "CHANGES_REQUESTED";
    const snapshot = row.snapshot as { items: unknown[] };
    await tx.insert(schema.organizationApprovals).values({
      orderRequestId: row.id,
      organizationId,
      decision,
      approvedAmountMinor: amount,
      currency: row.currency,
      scope: { items: snapshot.items, locationId: row.locationId, estimatedTotalMinor: row.estimatedTotalMinor?.toString() ?? null },
      note: input.note,
      decidedByUserId: member.userId,
    });
    let quoteId: string | null = row.quoteId;
    let next: OrderRequestStatus = decision === "REJECTED" ? "REJECTED" : decision === "CHANGES_REQUESTED" ? (reapproval ? "SENT_TO_HOLYPEARLS" : "DRAFT") : reapproval ? "SENT_TO_HOLYPEARLS" : "APPROVED";
    if (decision === "APPROVED" && !reapproval) {
      const reference = await quoteIn(tx, deps, { actor, deviceKey: null }, checked, {
        email: requester!.email,
        name: requester!.name,
        note: `Approved by ${actorName(actor)} for up to ${naira(amount, row.currency)}${input.note ? `: ${input.note}` : ""}.`,
        placedFor: { organizationId, locationId: row.locationId },
        owner: { userId: requester!.id, email: requester!.email, name: requester!.name, emailVerified: Boolean(requester!.emailVerified) },
      });
      const [quote] = await tx.select({ id: schema.quotes.id }).from(schema.quotes).where(eq(schema.quotes.reference, reference));
      quoteId = quote!.id;
      next = "SENT_TO_HOLYPEARLS";
    } else if (!reapproval) {
      await releaseFromApproval(tx, row.configurationIds);
    }
    await tx
      .update(schema.orderRequests)
      .set({ status: next, quoteId, sentAt: decision === "APPROVED" && !reapproval ? actor.now : row.sentAt, version: row.version + 1, updatedAt: actor.now })
      .where(eq(schema.orderRequests.id, row.id));
    await recordAudit(tx, actor, {
      action: `order_request.${decision.toLowerCase()}`,
      summary: `Order request ${decision === "APPROVED" ? `approved for ${naira(amount, row.currency)} and sent to HolyPearls` : decision === "REJECTED" ? "declined" : "returned for changes"}: ${row.title}`,
      recordType: "ORDER_REQUEST",
      recordId: row.id,
      before: { status: "PENDING_APPROVAL" },
      after: { status: next, approvedAmountMinor: amount?.toString() ?? null, note: input.note, quoteId },
      permission: "APPROVE_REQUESTS",
    });
    if (requester && requester.id !== member.userId) {
      await queueEmail(deps, tx, {
        template: "order_request_decided",
        to: requester.email,
        data: { title: row.title, decision, decidedBy: actorName(actor), note: input.note ?? undefined, url: workspaceUrl(deps, organizationId, row.id) },
        record: { type: "ORDER_REQUEST", id: row.id, label: row.title },
        requestId: actor.requestId,
      });
    }
  });
  return getOrderRequest(db, actor, organizationId, requestId);
}

/** After changes were requested, the requester sends it again; today's price is the new estimate. */
export async function resubmitOrderRequest(deps: OrganizationDeps, actor: ActorContext, organizationId: string, requestId: string, version: number): Promise<OrderRequest> {
  const db = deps.db;
  const member = await requireMember(db, actor, organizationId);
  enforce(needsPermission(member, "CREATE_REQUESTS"));
  const existing = await loadRequest(db, organizationId, requestId);
  if (existing.requestedByUserId !== member.userId) throw new AppError("NOT_FOUND");
  const designs = await currentDesigns(db, existing.configurationIds, actor.now);
  const totals = designs.map((design) => design.price?.totalMinor ?? null);
  const input = { version, designs, estimateMinor: totals.every((total) => total !== null) ? totals.reduce((sum, total) => sum + BigInt(total!), 0n) : null };
  await db.transaction(async (tx) => {
    const row = await loadRequest(tx, organizationId, requestId, { lock: true });
    if (row.requestedByUserId !== member.userId) throw new AppError("NOT_FOUND");
    if (row.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: row.version } });
    if (row.status !== "DRAFT") throw new AppError("RULE_FAILED", { message: "Only a request returned for changes can be sent again.", context: { reason: "NOT_DRAFT", status: row.status } });
    const snapshot = row.snapshot as { items: { configurationId: string; templateName: string | null }[]; policyNote: string | null };
    const items = input.designs.map((design) => ({
      configurationId: design.id,
      productName: design.productName,
      quantity: design.price?.quantity ?? design.quantity,
      templateName: snapshot.items.find((item) => item.configurationId === design.id)?.templateName ?? null,
      totalMinor: design.price?.totalMinor ?? null,
      priceState: design.price?.state ?? null,
    }));
    const updated = { ...row, estimatedTotalMinor: input.estimateMinor };
    await holdForApproval(tx, row.configurationIds);
    await tx
      .update(schema.orderRequests)
      .set({ status: "PENDING_APPROVAL", estimatedTotalMinor: input.estimateMinor, snapshot: { ...snapshot, items, designs: input.designs }, submittedAt: actor.now, version: row.version + 1, updatedAt: actor.now })
      .where(eq(schema.orderRequests.id, row.id));
    await recordAudit(tx, actor, { action: "order_request.resubmitted", summary: `Order request sent for approval again: ${row.title}`, recordType: "ORDER_REQUEST", recordId: row.id, before: { status: "DRAFT" }, after: { status: "PENDING_APPROVAL", estimatedTotalMinor: input.estimateMinor?.toString() ?? null } });
    await emailApprovers(deps, tx, actor, updated, actorName(actor));
  });
  return getOrderRequest(db, actor, organizationId, requestId);
}

/** The requester withdraws it before it goes to HolyPearls; its designs become drafts again. */
export async function cancelOrderRequest(db: Database, actor: ActorContext, organizationId: string, requestId: string, version: number): Promise<OrderRequest> {
  const member = await requireMember(db, actor, organizationId);
  await db.transaction(async (tx) => {
    const row = await loadRequest(tx, organizationId, requestId, { lock: true });
    if (row.requestedByUserId !== member.userId) throw canSee(member, row) ? new AppError("FORBIDDEN", { context: { reason: "REQUESTER_ONLY" } }) : new AppError("NOT_FOUND");
    if (row.version !== version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: row.version } });
    if (row.status !== "DRAFT" && row.status !== "PENDING_APPROVAL") throw new AppError("RULE_FAILED", { message: "This request can't be cancelled now.", context: { reason: "NOT_CANCELLABLE", status: row.status } });
    await releaseFromApproval(tx, row.configurationIds);
    await tx.update(schema.orderRequests).set({ status: "CANCELLED", version: row.version + 1, updatedAt: actor.now }).where(eq(schema.orderRequests.id, row.id));
    await recordAudit(tx, actor, { action: "order_request.cancelled", summary: `Order request cancelled: ${row.title}`, recordType: "ORDER_REQUEST", recordId: row.id, before: { status: row.status }, after: { status: "CANCELLED" } });
  });
  return getOrderRequest(db, actor, organizationId, requestId);
}

/* ——— Quote authority (T11-04b; PRD-03 QUOTE-FR-020–022; PRD-05 B2B-FR-043–044; frames 48, 73B) ——— */

type QuoteForCheck = { id: string; organizationId: string | null; locationId: string | null };

/** The order request a quote came from, and its latest approval. */
async function requestForQuote(db: Db, quoteId: string) {
  const [row] = await db.select().from(schema.orderRequests).where(eq(schema.orderRequests.quoteId, quoteId));
  if (!row) return null;
  const approvals = await db.select().from(schema.organizationApprovals).where(eq(schema.organizationApprovals.orderRequestId, row.id)).orderBy(desc(schema.organizationApprovals.createdAt));
  return { row, approved: approvals.find((approval) => approval.decision === "APPROVED") ?? null };
}

/**
 * Can this person accept this organization quote now? Accepting needs
 * "Accept HolyPearls quotes" for its location (B2B-FR-044), separate from
 * approving. A quote over the approved amount is blocked with "Organization
 * re-approval required" until a new approval covers it (QUOTE-FR-021); the
 * quote itself stays visible and unchanged.
 */
export async function organizationQuoteCheck(db: Db, actor: ActorContext, quote: QuoteForCheck, totalMinor: bigint | null) {
  if (!quote.organizationId || !quote.locationId) return { blockers: [], approval: null };
  const [organization] = await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, quote.organizationId));
  const name = organization?.name ?? "your organization";
  const member = actor.type === "user" ? await findActiveMember(db, quote.organizationId, actor.session.userId) : null;
  const blockers: { code: "ORGANIZATION_PERMISSION" | "ORGANIZATION_REAPPROVAL_REQUIRED"; message: string }[] = [];
  const found = await requestForQuote(db, quote.id);
  let approval = null;
  if (found) {
    const approvedMinor = found.approved?.approvedAmountMinor ?? null;
    const pending = found.row.status === "PENDING_APPROVAL";
    const over = totalMinor !== null && approvedMinor !== null && totalMinor > approvedMinor;
    const [approver] = found.approved?.decidedByUserId ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, found.approved.decidedByUserId)) : [];
    if (over || pending || found.row.status === "REJECTED") {
      blockers.push({
        code: "ORGANIZATION_REAPPROVAL_REQUIRED",
        message: found.row.status === "REJECTED" ? `${name} declined this request.` : pending ? `Accept unlocks once ${name} approves ${naira(totalMinor, found.row.currency)}.` : "Organization re-approval required",
      });
    }
    approval = {
      requestId: found.row.id,
      organizationId: quote.organizationId,
      organizationName: name,
      approvedMinor: approvedMinor?.toString() ?? null,
      approvedBy: approver?.name ?? null,
      quoteTotalMinor: totalMinor?.toString() ?? null,
      differenceMinor: over ? (totalMinor! - approvedMinor!).toString() : null,
      reapprovalRequired: over && !pending,
      reapprovalPending: pending,
      canSendForReapproval: over && !pending && found.row.status === "SENT_TO_HOLYPEARLS" && member !== null && (found.row.requestedByUserId === member.userId || member.permissions.has("ACCEPT_QUOTES")),
      version: found.row.version,
    };
  }
  const canAccept = member !== null && member.permissions.has("ACCEPT_QUOTES") && (member.allLocations || member.locationIds.has(quote.locationId));
  if (!canAccept) blockers.unshift({ code: "ORGANIZATION_PERMISSION", message: `Only people who can accept HolyPearls quotes for ${name} can accept this quote.` });
  return { blockers, approval };
}

/**
 * "Send for reapproval" (frame 48): HolyPearls' quote came back above the
 * approved amount, so the request goes back to the approvers for the new
 * total. Their decision is a new approval record; the old one is kept.
 */
export async function requestReapproval(deps: OrganizationDeps, actor: ActorContext, organizationId: string, requestId: string, input: { note: string | null; version: number }): Promise<OrderRequest> {
  const db = deps.db;
  const member = await requireMember(db, actor, organizationId);
  const current = await loadRequest(db, organizationId, requestId);
  if (!canSee(member, current)) throw new AppError("NOT_FOUND");
  if (current.requestedByUserId !== member.userId && !member.permissions.has("ACCEPT_QUOTES")) throw new AppError("FORBIDDEN", { context: { reason: "REQUESTER_OR_ACCEPTER_ONLY" } });
  if (!current.quoteId) throw new AppError("RULE_FAILED", { message: "This request hasn't been quoted yet.", context: { reason: "NOT_QUOTED" } });
  const [version] = await db
    .select({ number: schema.quoteVersions.number, totalMinor: schema.quoteVersions.totalMinor })
    .from(schema.quoteVersions)
    .where(and(eq(schema.quoteVersions.quoteId, current.quoteId), eq(schema.quoteVersions.status, "SENT")))
    .orderBy(desc(schema.quoteVersions.number))
    .limit(1);
  const found = await requestForQuote(db, current.quoteId);
  const approvedMinor = found?.approved?.approvedAmountMinor ?? null;
  if (!version || approvedMinor === null || version.totalMinor <= approvedMinor) {
    throw new AppError("RULE_FAILED", { message: "This quote is within the approved amount; it doesn't need a new approval.", context: { reason: "WITHIN_APPROVAL" } });
  }
  await db.transaction(async (tx) => {
    const row = await loadRequest(tx, organizationId, requestId, { lock: true });
    if (row.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: row.version } });
    if (row.status !== "SENT_TO_HOLYPEARLS") throw new AppError("RULE_FAILED", { message: "This request is already waiting for a decision.", context: { reason: "NOT_SENT", status: row.status } });
    const snapshot = row.snapshot as Record<string, unknown>;
    const updated = { ...row, estimatedTotalMinor: version.totalMinor };
    await tx
      .update(schema.orderRequests)
      .set({
        status: "PENDING_APPROVAL",
        estimatedTotalMinor: version.totalMinor,
        snapshot: { ...snapshot, reapproval: { quoteVersion: version.number, totalMinor: version.totalMinor.toString(), approvedMinor: approvedMinor.toString(), note: input.note } },
        submittedAt: actor.now,
        version: row.version + 1,
        updatedAt: actor.now,
      })
      .where(eq(schema.orderRequests.id, row.id));
    await recordAudit(tx, actor, {
      action: "order_request.reapproval_requested",
      summary: `Re-approval requested: HolyPearls' quote ${naira(version.totalMinor, row.currency)} is above the approved ${naira(approvedMinor, row.currency)} (${row.title})`,
      recordType: "ORDER_REQUEST",
      recordId: row.id,
      before: { status: "SENT_TO_HOLYPEARLS", approvedMinor: approvedMinor.toString() },
      after: { status: "PENDING_APPROVAL", quoteVersion: version.number, totalMinor: version.totalMinor.toString(), note: input.note },
    });
    await emailApprovers(deps, tx, actor, updated, actorName(actor));
  });
  return getOrderRequest(db, actor, organizationId, requestId);
}
