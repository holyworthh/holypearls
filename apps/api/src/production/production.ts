import type { OrderSummaryStatus, ProductionBoard, ProductionCard, ProductionItem, ProductionMove } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink } from "../identity/customers.js";
import type { OrderEmailDeps } from "../orders/orders.js";
import { recordAudit } from "../platform/audit.js";
import { queueEmail } from "../platform/notifications.js";

/*
 * Production (T07-01; FUL-FR-012–016, 020–021, OPS-FR-060–064, TECH-01 §3–4,
 * TECH-05 §10). Each order item moves on its own, one checked service call per
 * move, with a history row and an audit entry in the same transaction.
 *
 * - An item is QUEUED by the system once its prerequisites are met: the proof
 *   approved (or not needed), the deposit paid, and its artwork READY. Every
 *   place that can meet one calls releaseReadyItems.
 * - Staff start production, send it to quality check, and record the result:
 *   passed goes to READY_TO_DISPATCH, or READY_AWAITING_RELEASE while a
 *   before-dispatch balance is unpaid (that payment then falls due); rework
 *   goes back to IN_PRODUCTION.
 * - Paying the balance moves READY_AWAITING_RELEASE items on in the payment's
 *   own transaction (releaseAfterBalance). There is no manual release.
 * - A hold pauses an item without changing its status; while it's open the
 *   item shows ON_HOLD and staff can't move it.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;
type ItemStatus = (typeof schema.orderItemStatus.enumValues)[number];

const PROOF_MET = new Set(["NOT_REQUIRED", "APPROVED"]);
const ACTIVE: ItemStatus[] = ["AWAITING_PREREQUISITE", "QUEUED", "IN_PRODUCTION", "QUALITY_CHECK", "READY_AWAITING_RELEASE", "READY_TO_DISPATCH"];
const BEFORE_PRODUCTION = ["ON_ACCEPTANCE", "BEFORE_PRODUCTION"];

/** Staff moves and the one status each comes from (TECH-01 §4). */
const MOVES: Record<ProductionMove, { from: ItemStatus; to: ItemStatus }> = {
  QUEUE: { from: "AWAITING_PREREQUISITE", to: "QUEUED" },
  START: { from: "QUEUED", to: "IN_PRODUCTION" },
  TO_QUALITY_CHECK: { from: "IN_PRODUCTION", to: "QUALITY_CHECK" },
};

const PROOF_WORDS: Record<string, string> = {
  PREPARING: "the proof is still being prepared",
  AWAITING_APPROVAL: "the proof isn't approved",
  CHANGES_REQUESTED: "the customer asked for proof changes",
  REVISION_IN_PROGRESS: "a new proof version is being prepared",
};

/* ------------------------------------------------------------------ */
/* Order summary (PRD-00 §8)                                           */
/* ------------------------------------------------------------------ */

/**
 * Works out the order summary from its items. Checked in order; the first
 * that matches wins. Cancelled items are ignored unless every item is
 * cancelled. Shipment states (DISPATCHED, DELIVERED) come before holds, so a
 * hold on one item doesn't hide that the rest has left.
 */
export function orderSummaryStatus(items: { status: ItemStatus; onHold: boolean }[]): OrderSummaryStatus {
  const live = items.filter((item) => item.status !== "CANCELLED");
  if (!live.length) return "CANCELLED";
  const count = (...statuses: ItemStatus[]) => live.filter((item) => statuses.includes(item.status)).length;
  const all = live.length;
  if (count("DELIVERED") === all) return "DELIVERED";
  if (count("DELIVERED")) return "PARTIALLY_DELIVERED";
  if (count("DISPATCHED") === all - count("DELIVERED")) return "DISPATCHED";
  if (count("DISPATCHED")) return "PARTIALLY_DISPATCHED";
  if (live.some((item) => item.onHold)) return "ON_HOLD";
  if (count("READY_AWAITING_RELEASE")) return "BALANCE_REQUIRED";
  if (count("READY_TO_DISPATCH") === all) return "READY_TO_DISPATCH";
  if (count("READY_TO_DISPATCH")) return "PARTIALLY_READY";
  if (count("IN_PRODUCTION", "QUALITY_CHECK")) return "IN_PRODUCTION";
  if (count("AWAITING_PREREQUISITE") === all) return "AWAITING_PREREQUISITE";
  return "CONFIRMED";
}

/* ------------------------------------------------------------------ */
/* Facts                                                               */
/* ------------------------------------------------------------------ */

async function openHolds(db: Db, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, typeof schema.holds.$inferSelect>();
  const rows = await db
    .select()
    .from(schema.holds)
    .where(and(inArray(schema.holds.orderItemId, itemIds), eq(schema.holds.status, "OPEN")));
  return new Map(rows.map((row) => [row.orderItemId, row]));
}

/** The order's installments, from its checkout or its accepted quote version. */
export async function orderInstallments(db: Db, order: { checkoutId: string | null; quoteVersionId: string | null }) {
  const source = order.quoteVersionId ? eq(schema.paymentSchedules.quoteVersionId, order.quoteVersionId) : order.checkoutId ? eq(schema.paymentSchedules.checkoutId, order.checkoutId) : null;
  if (!source) return [];
  return db
    .select({ part: schema.installments })
    .from(schema.installments)
    .innerJoin(schema.paymentSchedules, eq(schema.paymentSchedules.id, schema.installments.scheduleId))
    .where(source)
    .orderBy(asc(schema.installments.position))
    .then((rows) => rows.map((row) => row.part));
}

/** Balance owed before dispatch: BEFORE_DISPATCH installments that aren't paid (TECH-05 §10). */
function unpaidBalance(parts: (typeof schema.installments.$inferSelect)[]) {
  return parts.filter((part) => part.trigger === "BEFORE_DISPATCH" && part.status !== "PAID" && part.status !== "CANCELLED");
}

type Prerequisites = ProductionItem["prerequisites"];

/** What each of an order's items still needs before it can be queued (TECH-01 §4). */
async function prerequisites(db: Db, orderId: string): Promise<Map<string, Prerequisites>> {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) return new Map();
  const items = await db.select({ id: schema.orderItems.id, configurationId: schema.orderItems.configurationId }).from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  const itemIds = items.map((item) => item.id);
  const configurationIds = items.map((item) => item.configurationId).filter((id): id is string => Boolean(id));
  const [proofs, versions, artwork, parts] = await Promise.all([
    itemIds.length ? db.select().from(schema.proofs).where(inArray(schema.proofs.orderItemId, itemIds)) : Promise.resolve([]),
    itemIds.length
      ? db
          .select({ proofId: schema.proofVersions.proofId, number: schema.proofVersions.number })
          .from(schema.proofVersions)
          .innerJoin(schema.proofs, eq(schema.proofs.id, schema.proofVersions.proofId))
          .where(and(inArray(schema.proofs.orderItemId, itemIds), eq(schema.proofVersions.status, "APPROVED")))
      : Promise.resolve([]),
    configurationIds.length
      ? db
          .select({ configurationId: schema.configurationFiles.configurationId, status: schema.files.status })
          .from(schema.configurationFiles)
          .innerJoin(schema.files, eq(schema.files.id, schema.configurationFiles.fileId))
          .where(and(inArray(schema.configurationFiles.configurationId, configurationIds), inArray(schema.configurationFiles.role, ["ARTWORK", "LOGO"])))
      : Promise.resolve([]),
    orderInstallments(db, order),
  ]);
  const depositParts = parts.filter((part) => BEFORE_PRODUCTION.includes(part.trigger));
  const deposit: Prerequisites["deposit"] = !depositParts.length ? "NOT_NEEDED" : depositParts.every((part) => part.status === "PAID") ? "PAID" : "DUE";
  return new Map(
    items.map((item) => {
      const proof = proofs.find((row) => row.orderItemId === item.id);
      const approved = versions.filter((row) => row.proofId === proof?.id).map((row) => row.number);
      const files = artwork.filter((row) => row.configurationId === item.configurationId);
      const art: Prerequisites["artwork"] = !files.length ? "NONE" : files.every((row) => row.status === "READY") ? "READY" : "WAITING";
      const missing: Prerequisites["missing"] = [];
      if (proof && !PROOF_MET.has(proof.status)) missing.push("PROOF_APPROVAL");
      if (deposit === "DUE") missing.push("DEPOSIT");
      if (art === "WAITING") missing.push("ARTWORK");
      return [item.id, { proof: { status: proof?.status ?? "NOT_REQUIRED", versionNumber: approved.length ? Math.max(...approved) : null }, deposit, artwork: art, missing }];
    }),
  );
}

function missingWords(facts: Prerequisites) {
  return facts.missing.map((need) => (need === "PROOF_APPROVAL" ? `${PROOF_WORDS[facts.proof.status] ?? "the proof isn't approved"} (${facts.proof.status})` : need === "DEPOSIT" ? "the deposit isn't paid" : "the artwork isn't ready"));
}

/* ------------------------------------------------------------------ */
/* System moves                                                        */
/* ------------------------------------------------------------------ */

async function writeMove(tx: Db, item: { id: string; status: ItemStatus }, to: ItemStatus, note: string | null, staffId: string | null) {
  await tx
    .update(schema.orderItems)
    .set({ status: to, version: sql`${schema.orderItems.version} + 1`, updatedAt: new Date() })
    .where(eq(schema.orderItems.id, item.id));
  await tx.insert(schema.orderItemEvents).values({ orderItemId: item.id, fromStatus: item.status, toStatus: to, kind: "STATUS", note, staffProfileId: staffId });
}

/**
 * Queues every item of the order whose prerequisites are now met. Called in
 * the same transaction as whatever met one: order creation, proof approval,
 * a payment, or an artwork file marked READY. Safe to call any number of times.
 */
export async function releaseReadyItems(tx: Db, orderId: string) {
  const waiting = await tx
    .select({ id: schema.orderItems.id, status: schema.orderItems.status })
    .from(schema.orderItems)
    .where(and(eq(schema.orderItems.orderId, orderId), eq(schema.orderItems.status, "AWAITING_PREREQUISITE")))
    .for("update");
  if (!waiting.length) return;
  const facts = await prerequisites(tx, orderId);
  for (const item of waiting) {
    const fact = facts.get(item.id);
    if (!fact || fact.missing.length) continue;
    const met = [fact.proof.status === "APPROVED" ? "Proof approved" : "No proof needed", fact.deposit === "PAID" ? "deposit paid" : null, fact.artwork === "READY" ? "artwork ready" : null].filter(Boolean).join(" · ");
    await writeMove(tx, item, "QUEUED", `Prerequisites met: ${met}`, null);
  }
}

/** Every order with an item made from a configuration that uses this file (an artwork decision). */
export async function releaseForFile(tx: Db, fileId: string) {
  const rows = await tx
    .selectDistinct({ orderId: schema.orderItems.orderId })
    .from(schema.configurationFiles)
    .innerJoin(schema.orderItems, eq(schema.orderItems.configurationId, schema.configurationFiles.configurationId))
    .where(and(eq(schema.configurationFiles.fileId, fileId), eq(schema.orderItems.status, "AWAITING_PREREQUISITE")));
  for (const row of rows) await releaseReadyItems(tx, row.orderId);
}

/**
 * A payment on the order: queues items whose deposit is now paid and, once no
 * before-dispatch balance is left, moves READY_AWAITING_RELEASE items to
 * READY_TO_DISPATCH in the payment's own transaction (TECH-05 §10).
 */
export async function releaseAfterPayment(tx: Db, orderId: string) {
  await releaseReadyItems(tx, orderId);
  const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order || unpaidBalance(await orderInstallments(tx, order)).length) return;
  const held = await tx
    .select({ id: schema.orderItems.id, status: schema.orderItems.status })
    .from(schema.orderItems)
    .where(and(eq(schema.orderItems.orderId, orderId), eq(schema.orderItems.status, "READY_AWAITING_RELEASE")))
    .for("update");
  for (const item of held) await writeMove(tx, item, "READY_TO_DISPATCH", "Balance paid: released for dispatch", null);
}

/* ------------------------------------------------------------------ */
/* Board and item                                                      */
/* ------------------------------------------------------------------ */

const GROUP_OF: Partial<Record<ItemStatus, ProductionCard["group"]>> = {
  AWAITING_PREREQUISITE: "WAITING",
  QUEUED: "QUEUED",
  IN_PRODUCTION: "IN_PRODUCTION",
  QUALITY_CHECK: "QUALITY_CHECK",
  READY_AWAITING_RELEASE: "READY",
  READY_TO_DISPATCH: "READY",
};
const GROUPS: ProductionCard["group"][] = ["WAITING", "QUEUED", "IN_PRODUCTION", "QUALITY_CHECK", "READY", "ON_HOLD"];
const NEED_WORDS = { PROOF_APPROVAL: "proof approval", DEPOSIT: "deposit", ARTWORK: "artwork" } as const;
const BOARD_LIMIT = 300;

/** OPS-FR-060: active items grouped, oldest change first. Dispatched and later belong to shipments. */
export async function productionBoard(db: Database): Promise<ProductionBoard> {
  const rows = await db
    .select({ item: schema.orderItems, number: schema.orders.number })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(inArray(schema.orderItems.status, ACTIVE))
    .orderBy(asc(schema.orderItems.updatedAt))
    .limit(BOARD_LIMIT);
  const holds = await openHolds(
    db,
    rows.map((row) => row.item.id),
  );
  const orderIds = [...new Set(rows.filter((row) => row.item.status === "AWAITING_PREREQUISITE" || row.item.status === "READY_AWAITING_RELEASE").map((row) => row.item.orderId))];
  const facts = new Map<string, Prerequisites>();
  const balances = new Map<string, string>();
  for (const orderId of orderIds) {
    for (const [id, fact] of await prerequisites(db, orderId)) facts.set(id, fact);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const due = unpaidBalance(await orderInstallments(db, order!));
    if (due.length) balances.set(orderId, `${due.map((part) => part.label).join(", ")} due`);
  }
  const cards: ProductionCard[] = rows.map(({ item, number }) => {
    const hold = holds.get(item.id);
    const fact = facts.get(item.id);
    const note = hold
      ? `${hold.whoActs === "CUSTOMER" ? "Customer" : "HolyPearls"}: ${hold.reason.toLowerCase().replaceAll("_", " ")}`
      : item.status === "AWAITING_PREREQUISITE" && fact?.missing.length
        ? `Needs: ${fact.missing.map((need) => NEED_WORDS[need]).join(", ")}`
        : item.status === "READY_AWAITING_RELEASE"
          ? (balances.get(item.orderId) ?? null)
          : null;
    return {
      id: item.id,
      orderId: item.orderId,
      orderNumber: number,
      position: item.position,
      productName: item.productName,
      quantity: item.quantity,
      status: item.status,
      group: hold ? "ON_HOLD" : GROUP_OF[item.status]!,
      note,
      updatedAt: item.updatedAt.toISOString(),
    };
  });
  return { groups: GROUPS.map((group) => ({ group, items: cards.filter((card) => card.group === group) })) };
}

async function loadItem(db: Db, id: string) {
  const [row] = await db
    .select({ item: schema.orderItems, order: schema.orders })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(eq(schema.orderItems.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** One item for staff (Pen 113 item panel, 114 hold): prerequisites, allowed moves, hold and history. */
export async function getProductionItem(db: Db, id: string): Promise<ProductionItem> {
  const { item, order } = await loadItem(db, id);
  const siblings = await db.select({ id: schema.orderItems.id, status: schema.orderItems.status }).from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
  const [holds, facts, parts, hold, events, staff] = await Promise.all([
    openHolds(
      db,
      siblings.map((row) => row.id),
    ),
    prerequisites(db, order.id),
    orderInstallments(db, order),
    db.select().from(schema.holds).where(eq(schema.holds.orderItemId, id)).orderBy(desc(schema.holds.createdAt)).limit(1),
    db.select().from(schema.orderItemEvents).where(eq(schema.orderItemEvents.orderItemId, id)).orderBy(desc(schema.orderItemEvents.createdAt)).limit(100),
    db.select({ id: schema.staffProfiles.id, name: schema.staffProfiles.displayName }).from(schema.staffProfiles),
  ]);
  const staffName = (staffId: string | null) => (staffId ? (staff.find((row) => row.id === staffId)?.name ?? "Staff") : "System");
  const open = holds.get(id) ?? null;
  const latest = open ?? hold[0] ?? null;
  const due = unpaidBalance(parts);
  const moves = open ? [] : (Object.entries(MOVES) as [ProductionMove, (typeof MOVES)[ProductionMove]][]).filter(([, move]) => move.from === item.status).map(([name]) => name);
  return {
    id: item.id,
    orderId: order.id,
    orderNumber: order.number,
    position: item.position,
    itemCount: siblings.length,
    productName: item.productName,
    summary: item.summary,
    quantity: item.quantity,
    status: item.status,
    version: item.version,
    orderSummary: orderSummaryStatus(siblings.map((row) => ({ status: row.status, onHold: holds.has(row.id) }))),
    prerequisites: facts.get(id)!,
    balance: due[0] ? { label: due[0].label, amountMinor: due.reduce((sum, part) => sum + part.amountMinor, 0n).toString(), currency: due[0].currency as "NGN" | "USD", status: due[0].status } : null,
    moves,
    canRecordQc: !open && item.status === "QUALITY_CHECK",
    hold: latest
      ? {
          id: latest.id,
          status: latest.status,
          reason: latest.reason as NonNullable<ProductionItem["hold"]>["reason"],
          internalNote: latest.internalNote,
          customerExplanation: latest.customerExplanation,
          whoActs: latest.whoActs as "CUSTOMER" | "HOLYPEARLS",
          timingImpactDays: latest.timingImpactDays,
          placedBy: latest.placedByStaffId ? staffName(latest.placedByStaffId) : null,
          createdAt: latest.createdAt.toISOString(),
          resolution: latest.resolution,
          resolvedAt: latest.resolvedAt?.toISOString() ?? null,
        }
      : null,
    history: events.map((event) => ({
      kind: event.kind as ProductionItem["history"][number]["kind"],
      from: event.fromStatus,
      to: event.toStatus,
      note: event.note,
      by: staffName(event.staffProfileId),
      at: event.createdAt.toISOString(),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Staff actions                                                       */
/* ------------------------------------------------------------------ */

const staffOf = (actor: ActorContext) => (actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null);

/** Locks the item and checks its version and that it isn't on hold. */
async function lockForMove(tx: Tx, id: string, version: number) {
  const [item] = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.id, id)).for("update");
  if (!item) throw new AppError("NOT_FOUND");
  const [order] = await tx.select({ number: schema.orders.number }).from(schema.orders).where(eq(schema.orders.id, item.orderId));
  if (item.version !== version) throw new AppError("VERSION_CONFLICT", { context: { latest: await getProductionItem(tx, id) } });
  const [hold] = await tx
    .select({ id: schema.holds.id })
    .from(schema.holds)
    .where(and(eq(schema.holds.orderItemId, id), eq(schema.holds.status, "OPEN")));
  if (hold) throw new AppError("RULE_FAILED", { message: `${order!.number} item ${item.position} is on hold. Resolve the hold first.`, context: { reason: "ON_HOLD" } });
  return { item, label: `${order!.number} item ${item.position}` };
}

/** OPS-FR-061: one item's next step. Anything TECH-01 §4 doesn't list is refused and nothing changes. */
export async function moveItem(db: Database, actor: ActorContext, id: string, input: { move: ProductionMove; version: number; note?: string }) {
  const move = MOVES[input.move];
  await db.transaction(async (tx) => {
    const { item, label } = await lockForMove(tx, id, input.version);
    if (item.status !== move.from) {
      throw new AppError("RULE_FAILED", { message: `${label} can't move to ${move.to}: it is ${item.status}.`, context: { reason: "ILLEGAL_MOVE", status: item.status } });
    }
    if (input.move === "QUEUE") {
      const fact = (await prerequisites(tx, item.orderId)).get(id)!;
      if (fact.missing.length) {
        throw new AppError("RULE_FAILED", { message: `${label} can't move to QUEUED: ${missingWords(fact).join("; ")}.`, context: { reason: "PREREQUISITE_MISSING", missing: fact.missing } });
      }
    }
    await writeMove(tx, item, move.to, input.note?.trim() || null, staffOf(actor));
    await recordAudit(tx, actor, { action: "order_item.moved", summary: `${label} moved from ${item.status} to ${move.to}`, recordType: "ORDER_ITEM", recordId: id, recordLabel: label, before: { status: item.status }, after: { status: move.to }, permission: "PRODUCTION_MANAGE" });
  });
  return getProductionItem(db, id);
}

/**
 * OPS-FR-063: the quality check result. Passed goes to READY_TO_DISPATCH, or
 * READY_AWAITING_RELEASE while a before-dispatch balance is unpaid, and that
 * balance falls due now (the customer is emailed). Rework goes back to
 * IN_PRODUCTION. The result is kept either way.
 */
export async function recordQcResult(deps: OrderEmailDeps, actor: ActorContext, id: string, input: { outcome: "PASSED" | "REWORK"; note: string; version: number }) {
  await deps.db.transaction(async (tx) => {
    const { item, label } = await lockForMove(tx, id, input.version);
    if (item.status !== "QUALITY_CHECK") {
      throw new AppError("RULE_FAILED", { message: `${label} isn't in quality check (it is ${item.status}).`, context: { reason: "ILLEGAL_MOVE", status: item.status } });
    }
    const staffId = staffOf(actor);
    let to: ItemStatus = "IN_PRODUCTION";
    if (input.outcome === "PASSED") {
      const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, item.orderId));
      const due = unpaidBalance(await orderInstallments(tx, order!));
      to = due.length ? "READY_AWAITING_RELEASE" : "READY_TO_DISPATCH";
      for (const part of due.filter((row) => row.status === "NOT_DUE")) {
        await tx.update(schema.installments).set({ status: "DUE" }).where(eq(schema.installments.id, part.id));
        await deps.jobs.send("reminder.send", { v: 1, requestId: actor.requestId, kind: "INSTALLMENT_DUE", recordId: part.id }, { tx });
      }
    }
    await tx.insert(schema.qcResults).values({ orderItemId: id, outcome: input.outcome, note: input.note, staffProfileId: staffId });
    await tx
      .update(schema.orderItems)
      .set({ status: to, version: sql`${schema.orderItems.version} + 1`, updatedAt: new Date() })
      .where(eq(schema.orderItems.id, id));
    await tx.insert(schema.orderItemEvents).values({ orderItemId: id, fromStatus: "QUALITY_CHECK", toStatus: to, kind: "QC", note: `${input.outcome === "PASSED" ? "QC passed" : "Sent for rework"}${input.note ? `: ${input.note}` : ""}`, staffProfileId: staffId });
    await recordAudit(tx, actor, { action: input.outcome === "PASSED" ? "order_item.qc_passed" : "order_item.qc_rework", summary: `${label} quality check: ${input.outcome === "PASSED" ? `passed (${to})` : "sent for rework"}`, recordType: "ORDER_ITEM", recordId: id, recordLabel: label, after: { status: to }, permission: "PRODUCTION_MANAGE" });
  });
  return getProductionItem(deps.db, id);
}

const WHO_ACTS_LINE = (whoActs: string, days: number | null) =>
  `${whoActs === "CUSTOMER" ? "Your action is needed" : "We're working on it"}${days ? ` · this may add ${days} working day${days === 1 ? "" : "s"}` : ""}`;

/** OPS-FR-062: place a hold. The item keeps its status; the customer is told why and who acts. */
export async function placeHold(
  deps: OrderEmailDeps,
  actor: ActorContext,
  id: string,
  input: { reason: string; internalNote: string; customerExplanation: string; whoActs: "CUSTOMER" | "HOLYPEARLS"; timingImpactDays: number | null },
) {
  await deps.db.transaction(async (tx) => {
    const [item] = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.id, id)).for("update");
    if (!item) throw new AppError("NOT_FOUND");
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, item.orderId));
    const label = `${order!.number} item ${item.position}`;
    if (!ACTIVE.includes(item.status)) throw new AppError("RULE_FAILED", { message: `${label} is ${item.status} and can't be put on hold.`, context: { reason: "NOT_ACTIVE" } });
    const [existing] = await tx
      .select({ id: schema.holds.id })
      .from(schema.holds)
      .where(and(eq(schema.holds.orderItemId, id), eq(schema.holds.status, "OPEN")));
    if (existing) throw new AppError("CONFLICT", { message: `${label} is already on hold.`, context: { reason: "ALREADY_ON_HOLD" } });
    const staffId = staffOf(actor);
    await tx.insert(schema.holds).values({ orderItemId: id, reason: input.reason, internalNote: input.internalNote, customerExplanation: input.customerExplanation, whoActs: input.whoActs, timingImpactDays: input.timingImpactDays, placedByStaffId: staffId });
    await tx.insert(schema.orderItemEvents).values({ orderItemId: id, fromStatus: item.status, toStatus: item.status, kind: "HOLD_PLACED", note: `On hold: ${input.reason.toLowerCase().replaceAll("_", " ")}`, staffProfileId: staffId });
    await recordAudit(tx, actor, { action: "order_item.hold_placed", summary: `${label} put on hold (${input.reason})`, recordType: "ORDER_ITEM", recordId: id, recordLabel: label, after: { reason: input.reason, whoActs: input.whoActs, timingImpactDays: input.timingImpactDays }, permission: "PRODUCTION_MANAGE" });
    const contact = order!.contact as { email: string };
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: order!.id, customerId: order!.customerId, now: actor.now });
    await queueEmail(deps, tx, {
      template: "item_on_hold",
      to: contact.email,
      customerId: order!.customerId,
      data: { orderNumber: order!.number, item: item.productName, explanation: input.customerExplanation, action: WHO_ACTS_LINE(input.whoActs, input.timingImpactDays), url: link.url },
      record: { type: "ORDER", id: order!.id, label: order!.number },
      linkLabel: `Opens order ${order!.number}`,
      requestId: actor.requestId,
    });
  });
  return getProductionItem(deps.db, id);
}

/** Resolve the open hold: the item carries on in its status and the customer is emailed. */
export async function resolveHold(deps: OrderEmailDeps, actor: ActorContext, id: string, input: { resolution: string }) {
  await deps.db.transaction(async (tx) => {
    const [hold] = await tx
      .select()
      .from(schema.holds)
      .where(and(eq(schema.holds.orderItemId, id), eq(schema.holds.status, "OPEN")))
      .for("update");
    if (!hold) throw new AppError("CONFLICT", { message: "This item has no open hold.", context: { reason: "NO_OPEN_HOLD" } });
    const { item, order } = await loadItem(tx, id);
    const label = `${order.number} item ${item.position}`;
    const staffId = staffOf(actor);
    await tx.update(schema.holds).set({ status: "RESOLVED", resolution: input.resolution, resolvedByStaffId: staffId, resolvedAt: actor.now }).where(eq(schema.holds.id, hold.id));
    await tx.insert(schema.orderItemEvents).values({ orderItemId: id, fromStatus: item.status, toStatus: item.status, kind: "HOLD_RESOLVED", note: `Hold resolved: ${input.resolution}`, staffProfileId: staffId });
    await recordAudit(tx, actor, { action: "order_item.hold_resolved", summary: `${label} hold resolved`, recordType: "ORDER_ITEM", recordId: id, recordLabel: label, permission: "PRODUCTION_MANAGE" });
    const contact = order.contact as { email: string };
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: order.id, customerId: order.customerId, now: actor.now });
    await queueEmail(deps, tx, {
      template: "hold_resolved",
      to: contact.email,
      customerId: order.customerId,
      data: { orderNumber: order.number, item: item.productName, url: link.url },
      record: { type: "ORDER", id: order.id, label: order.number },
      linkLabel: `Opens order ${order.number}`,
      requestId: actor.requestId,
    });
  });
  return getProductionItem(deps.db, id);
}

/* ------------------------------------------------------------------ */
/* Customer view                                                       */
/* ------------------------------------------------------------------ */

/** Open holds as the customer sees them (no internal note), and the order summary. */
export async function customerProduction(db: Db, orderId: string) {
  const items = await db.select({ id: schema.orderItems.id, position: schema.orderItems.position, status: schema.orderItems.status }).from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  const holds = await openHolds(
    db,
    items.map((item) => item.id),
  );
  return {
    summaryStatus: orderSummaryStatus(items.map((item) => ({ status: item.status, onHold: holds.has(item.id) }))),
    holdByPosition: new Map(
      items
        .filter((item) => holds.has(item.id))
        .map((item) => {
          const hold = holds.get(item.id)!;
          return [item.position, { explanation: hold.customerExplanation, whoActs: hold.whoActs as "CUSTOMER" | "HOLYPEARLS", timingImpactDays: hold.timingImpactDays, since: hold.createdAt.toISOString() }];
        }),
    ),
  };
}

/** Production export (T13-03b): every item of the orders placed in the range, with its production status. */
export async function productionForExport(db: Database, range: { start: Date; end: Date }): Promise<string[][]> {
  const rows = await db
    .select({ item: schema.orderItems, number: schema.orders.number, placedAt: schema.orders.placedAt })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(and(sql`${schema.orders.placedAt} >= ${range.start}`, sql`${schema.orders.placedAt} < ${range.end}`))
    .orderBy(asc(schema.orders.placedAt), asc(schema.orderItems.position));
  return [
    ["Order", "Placed", "Item", "Product", "Details", "Quantity", "Status", "Last change"],
    ...rows.map(({ item, number, placedAt }) => [number, placedAt.toISOString(), String(item.position + 1), item.productName, item.summary, String(item.quantity), item.status, item.updatedAt.toISOString()]),
  ];
}
