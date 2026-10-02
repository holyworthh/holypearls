import type { ChangeRequest } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { customerForActor } from "../identity/customers.js";
import { loadOrderFor, type OrderAccess } from "../orders/orders.js";
import { recordAudit } from "../platform/audit.js";

/*
 * Changes after approval (T06-03; FUL-FR-007, OPS-FR-054, TECH-01 §4). The
 * customer asks for a change to an approved proof. Before production starts
 * it's a change request; after, a feasibility review (the stage is recorded).
 * Staff review it and decide, recording the cost and timing impact.
 * Accepting may start a new proof version (the approved version is kept, and
 * the next one needs approval again) or note a quote revision; declining
 * keeps the approved version as it is.
 */

type Row = typeof schema.changeRequests.$inferSelect;

const STARTED = new Set(["IN_PRODUCTION", "QUALITY_CHECK", "READY_AWAITING_RELEASE", "READY_TO_DISPATCH", "DISPATCHED", "DELIVERED"]);

async function views(db: Database, rows: Row[]): Promise<ChangeRequest[]> {
  if (!rows.length) return [];
  const orders = await db.select({ id: schema.orders.id, number: schema.orders.number }).from(schema.orders).where(inArray(schema.orders.id, [...new Set(rows.map((row) => row.orderId))]));
  const proofIds = rows.map((row) => row.proofId).filter((id): id is string => Boolean(id));
  const items = proofIds.length
    ? await db.select({ proofId: schema.proofs.id, name: schema.orderItems.productName }).from(schema.proofs).innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.proofs.orderItemId)).where(inArray(schema.proofs.id, proofIds))
    : [];
  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    orderNumber: orders.find((order) => order.id === row.orderId)?.number ?? "",
    proofId: row.proofId,
    item: items.find((item) => item.proofId === row.proofId)?.name ?? null,
    stage: row.stage,
    status: row.status,
    description: row.description,
    costImpactMinor: row.costImpactMinor === null ? null : row.costImpactMinor.toString(),
    timingImpactDays: row.timingImpactDays,
    outcome: row.outcome,
    staffNote: row.staffNote,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
  }));
}

export async function changeRequestsForOrder(db: Database, orderId: string) {
  return views(db, await db.select().from(schema.changeRequests).where(eq(schema.changeRequests.orderId, orderId)).orderBy(desc(schema.changeRequests.createdAt)));
}

/** The customer asks for a change to an approved proof (FUL-FR-007). One open request per proof at a time. */
export async function requestChange(db: Database, access: OrderAccess, orderId: string, input: { proofId: string; description: string }) {
  const order = await loadOrderFor(db, access, orderId);
  const [proof] = await db
    .select({ proof: schema.proofs, itemStatus: schema.orderItems.status })
    .from(schema.proofs)
    .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.proofs.orderItemId))
    .where(and(eq(schema.proofs.id, input.proofId), eq(schema.orderItems.orderId, order.id)));
  if (!proof) throw new AppError("NOT_FOUND");
  if (proof.proof.status !== "APPROVED") throw new AppError("RULE_FAILED", { message: "Use Request changes on the proof itself until it's approved.", context: { reason: "NOT_APPROVED" } });
  const [open] = await db.select({ id: schema.changeRequests.id }).from(schema.changeRequests).where(and(eq(schema.changeRequests.proofId, input.proofId), inArray(schema.changeRequests.status, ["OPEN", "UNDER_REVIEW"])));
  if (open) throw new AppError("CONFLICT", { message: "We're already reviewing a change to this item. We'll reply soon.", context: { reason: "ALREADY_OPEN" } });
  const customer = await customerForActor(db, access.actor);
  const stage = STARTED.has(proof.itemStatus) ? "AFTER_PRODUCTION_START" : "BEFORE_PRODUCTION";
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.changeRequests).values({ orderId: order.id, proofId: input.proofId, stage, description: input.description, customerId: customer?.id ?? null }).returning();
    await recordAudit(tx, access.actor, { action: "change_request.opened", summary: `Change requested after approval on ${order.number} (${stage === "BEFORE_PRODUCTION" ? "before production" : "after production started"})`, recordType: "CHANGE_REQUEST", recordId: row!.id, recordLabel: order.number });
  });
  return changeRequestsForOrder(db, order.id);
}

/** Staff queue (OPS-FR-054): open and under review first, oldest first. */
export async function listChangeRequests(db: Database, view: string | undefined) {
  const statuses = view === "decided" ? (["ACCEPTED", "DECLINED"] as const) : (["OPEN", "UNDER_REVIEW"] as const);
  const rows = await db.select().from(schema.changeRequests).where(inArray(schema.changeRequests.status, [...statuses])).orderBy(asc(schema.changeRequests.createdAt)).limit(100);
  return { items: await views(db, rows) };
}

export async function startChangeReview(db: Database, actor: ActorContext, id: string) {
  const [row] = await db
    .update(schema.changeRequests)
    .set({ status: "UNDER_REVIEW", version: sql`${schema.changeRequests.version} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.changeRequests.id, id), eq(schema.changeRequests.status, "OPEN")))
    .returning();
  if (!row) throw new AppError("CONFLICT", { message: "This request isn't open.", context: { reason: "NOT_OPEN" } });
  await recordAudit(db, actor, { action: "change_request.review_started", summary: "Change request review started", recordType: "CHANGE_REQUEST", recordId: id, permission: "PROOF_MANAGE" });
  return (await views(db, [row]))[0]!;
}

/**
 * Decide (OPS-FR-054). The cost and timing impact and a note are recorded.
 * Accepting with NEW_PROOF_VERSION opens a draft after the approved version:
 * the approved version stays APPROVED and kept; the proof goes back to
 * REVISION_IN_PROGRESS and the next version needs approval again.
 */
export async function decideChangeRequest(
  db: Database,
  actor: ActorContext,
  id: string,
  input: { version: number; decision: "ACCEPTED" | "DECLINED"; outcome: "NEW_PROOF_VERSION" | "QUOTE_REVISION" | "NONE"; costImpactMinor: string | null; timingImpactDays: number | null; note: string },
) {
  const staffId = actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null;
  const decided = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.changeRequests).where(eq(schema.changeRequests.id, id)).for("update");
    if (!row) throw new AppError("NOT_FOUND");
    if (row.status === "ACCEPTED" || row.status === "DECLINED") throw new AppError("CONFLICT", { message: "This request was already decided.", context: { reason: "ALREADY_DECIDED" } });
    if (row.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { latest: (await views(db, [row]))[0] } });
    const [saved] = await tx
      .update(schema.changeRequests)
      .set({
        status: input.decision,
        outcome: input.decision === "ACCEPTED" ? input.outcome : "NONE",
        costImpactMinor: input.costImpactMinor === null ? null : BigInt(input.costImpactMinor),
        timingImpactDays: input.timingImpactDays,
        staffNote: input.note,
        decidedByStaffId: staffId,
        decidedAt: actor.now,
        version: sql`${schema.changeRequests.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.changeRequests.id, id))
      .returning();
    if (input.decision === "ACCEPTED" && input.outcome === "NEW_PROOF_VERSION" && row.proofId) {
      const versions = await tx.select().from(schema.proofVersions).where(eq(schema.proofVersions.proofId, row.proofId)).orderBy(desc(schema.proofVersions.number));
      const approved = versions.find((version) => version.status === "APPROVED");
      if (!versions.some((version) => version.status === "DRAFT")) {
        await tx.insert(schema.proofVersions).values({ proofId: row.proofId, number: (versions[0]?.number ?? 0) + 1, views: approved?.views ?? [], details: approved?.details ?? {}, createdByStaffId: staffId });
      }
      await tx.update(schema.proofs).set({ status: "REVISION_IN_PROGRESS", version: sql`${schema.proofs.version} + 1`, updatedAt: new Date() }).where(eq(schema.proofs.id, row.proofId));
    }
    await recordAudit(tx, actor, {
      action: input.decision === "ACCEPTED" ? "change_request.accepted" : "change_request.declined",
      summary: `Change request ${input.decision.toLowerCase()}${input.decision === "ACCEPTED" ? ` (${input.outcome})` : ""}`,
      recordType: "CHANGE_REQUEST",
      recordId: id,
      after: { costImpactMinor: input.costImpactMinor, timingImpactDays: input.timingImpactDays, outcome: input.outcome },
      permission: "PROOF_MANAGE",
    });
    return saved!;
  });
  return (await views(db, [decided]))[0]!;
}
