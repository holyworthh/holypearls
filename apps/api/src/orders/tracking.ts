import type { Order } from "@holypearls/contracts";
import { and, asc, type Database, eq, inArray, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import { type ActorContext, requireRecentMfa } from "../identity/actor.js";
import { createGuestLink, customerForActor, normalizeEmail } from "../identity/customers.js";
import { recordAudit } from "../platform/audit.js";
import { queueEmail } from "../platform/notifications.js";
import { orderInstallments } from "../production/production.js";
import { displayMoney, loadOrderFor, type OrderAccess, type OrderEmailDeps } from "./orders.js";

/*
 * Order tracking, Find my order and cancellation (T07-03; FUL-FR-010–011,
 * 033, 040, 050–052; TECH-03 §9).
 *
 * - Find my order: the order number and the checkout email. A match emails the
 *   order's secure link to that address (never shown on screen); no match
 *   says so without saying which part was wrong. Rate-limited per address.
 * - Customers can cancel online only before production (every item still
 *   waiting or queued) and while no payment is being processed. After that
 *   they contact us (FUL-FR-051). Staff can cancel after commitment, with a
 *   reason and an MFA check in the last 15 minutes (TECH-03 §9). Items already
 *   dispatched stay as they are.
 * - Cancelling cancels the items (with history), unpaid installments and open
 *   payments, and records what has to be refunded. Refunds themselves are
 *   issued by finance (T13-05).
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type OrderRow = typeof schema.orders.$inferSelect;
type ItemStatus = (typeof schema.orderItemStatus.enumValues)[number];

const BEFORE_PRODUCTION: ItemStatus[] = ["AWAITING_PREREQUISITE", "QUEUED"];
const SHIPPED: ItemStatus[] = ["DISPATCHED", "DELIVERED"];

const CUSTOMER_STATUS: Partial<Record<ItemStatus, string>> = {
  QUEUED: "is queued for production",
  IN_PRODUCTION: "is in production",
  QUALITY_CHECK: "is in quality check",
  READY_AWAITING_RELEASE: "is made and checked, waiting for the balance",
  READY_TO_DISPATCH: "is ready to dispatch",
  DISPATCHED: "was dispatched",
  DELIVERED: "was delivered",
  CANCELLED: "was cancelled",
};

/** What has been paid on the order, so far: the refund due if it's cancelled. */
async function paidSoFar(db: Database | Tx, order: OrderRow) {
  const parts = await orderInstallments(db, order);
  return {
    parts,
    paid: parts.filter((part) => part.status === "PAID").reduce((sum, part) => sum + part.amountMinor, 0n),
    processing: parts.some((part) => part.status === "PROCESSING"),
  };
}

/** The extra order fields for tracking: cancellation, whether the customer can cancel, scope changes, and activity. */
export async function trackingView(db: Database | Tx, order: OrderRow): Promise<Pick<Order, "cancellation" | "cancel" | "canChangeScope" | "activity">> {
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)).orderBy(asc(schema.orderItems.position));
  const itemIds = items.map((item) => item.id);
  const { paid, processing } = await paidSoFar(db, order);
  const live = items.filter((item) => item.status !== "CANCELLED");
  const blockedBy = order.cancelledAt
    ? ("CANCELLED" as const)
    : live.some((item) => SHIPPED.includes(item.status))
      ? ("DISPATCHED" as const)
      : live.some((item) => !BEFORE_PRODUCTION.includes(item.status))
        ? ("STARTED" as const)
        : processing
          ? ("PAYMENT_IN_PROGRESS" as const)
          : null;

  const [events, receipts, decisions, changes] = await Promise.all([
    itemIds.length ? db.select().from(schema.orderItemEvents).where(inArray(schema.orderItemEvents.orderItemId, itemIds)) : Promise.resolve([]),
    db.select().from(schema.receipts).where(eq(schema.receipts.orderId, order.id)),
    itemIds.length
      ? db
          .select({ decision: schema.proofDecisions.decision, at: schema.proofDecisions.createdAt, number: schema.proofVersions.number, itemId: schema.proofs.orderItemId })
          .from(schema.proofDecisions)
          .innerJoin(schema.proofVersions, eq(schema.proofVersions.id, schema.proofDecisions.proofVersionId))
          .innerJoin(schema.proofs, eq(schema.proofs.id, schema.proofVersions.proofId))
          .where(inArray(schema.proofs.orderItemId, itemIds))
      : Promise.resolve([]),
    db.select().from(schema.changeRequests).where(eq(schema.changeRequests.orderId, order.id)),
  ]);
  const name = (itemId: string) => items.find((item) => item.id === itemId)?.productName ?? "An item";
  const activity: { at: Date; text: string }[] = [{ at: order.placedAt, text: order.quoteVersionId ? "Order placed from your accepted quote" : "Order placed and paid" }];
  for (const receipt of receipts) activity.push({ at: receipt.paidAt, text: `Payment received · ${displayMoney(receipt.amountMinor, receipt.currency)} · receipt ${receipt.number}` });
  for (const decision of decisions) activity.push({ at: decision.at, text: `${name(decision.itemId)}: proof V${decision.number} ${decision.decision === "APPROVED" ? "approved" : "changes requested"}` });
  for (const event of events) {
    // Internal notes and the quality checklist stay internal (FUL-FR-016); only the milestone is shown.
    if (event.kind === "HOLD_PLACED") activity.push({ at: event.createdAt, text: `${name(event.orderItemId)} was put on hold` });
    else if (event.kind === "HOLD_RESOLVED") activity.push({ at: event.createdAt, text: `${name(event.orderItemId)} is no longer on hold` });
    else if (event.toStatus && event.toStatus !== event.fromStatus && CUSTOMER_STATUS[event.toStatus]) {
      activity.push({ at: event.createdAt, text: event.kind === "QC" && event.toStatus === "IN_PRODUCTION" ? `${name(event.orderItemId)} went back into production after quality check` : `${name(event.orderItemId)} ${CUSTOMER_STATUS[event.toStatus]}` });
    }
  }
  for (const change of changes) {
    activity.push({ at: change.createdAt, text: `You asked for a change: ${change.description.length > 80 ? `${change.description.slice(0, 80)}…` : change.description}` });
    if (change.decidedAt) activity.push({ at: change.decidedAt, text: `Your change request was ${change.status === "ACCEPTED" ? "accepted" : "declined"}` });
  }
  if (order.cancelledAt) activity.push({ at: order.cancelledAt, text: order.cancelledBy === "STAFF" ? "Order cancelled by HolyPearls" : "You cancelled the order" });
  activity.sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    cancellation: order.cancelledAt ? { at: order.cancelledAt.toISOString(), by: order.cancelledBy as "CUSTOMER" | "STAFF", refundDueMinor: (order.refundDueMinor ?? 0n).toString() } : null,
    cancel: { allowed: blockedBy === null, blockedBy, refundMinor: paid.toString() },
    canChangeScope: Boolean(order.quoteVersionId) && !order.cancelledAt && live.some((item) => !SHIPPED.includes(item.status)),
    activity: activity.slice(0, 200).map((entry) => ({ at: entry.at.toISOString(), text: entry.text })),
  };
}

/* ------------------------------------------------------------------ */
/* Find my order                                                       */
/* ------------------------------------------------------------------ */

const mask = (email: string) => {
  const [local, domain] = email.split("@");
  return `${local!.slice(0, 1)}•••••@${domain}`;
};

/** FUL-FR-033: number + email → the order's secure link, emailed to that address. */
export async function findOrder(deps: OrderEmailDeps, input: { number: string; email: string }, requestId: string, now = new Date()) {
  const number = input.number.trim().toUpperCase();
  const email = normalizeEmail(input.email);
  const [order] = await deps.db.select().from(schema.orders).where(eq(schema.orders.number, number));
  const contact = order?.contact as { email?: string } | undefined;
  if (!order || !contact?.email || normalizeEmail(contact.email) !== email) {
    throw new AppError("NOT_FOUND", { message: "We couldn't find an order with those details. Check the order number and the email used at checkout." });
  }
  await deps.db.transaction(async (tx) => {
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: order.id, customerId: order.customerId, now });
    await queueEmail(deps, tx, {
      template: "order_link",
      to: contact.email!,
      customerId: order.customerId,
      data: { orderNumber: order.number, url: link.url },
      record: { type: "ORDER", id: order.id, label: order.number },
      linkLabel: `Opens order ${order.number}`,
      requestId,
    });
  });
  return { sentTo: mask(contact.email) };
}

/* ------------------------------------------------------------------ */
/* Cancellation                                                        */
/* ------------------------------------------------------------------ */

async function cancelInTx(tx: Tx, deps: OrderEmailDeps, order: OrderRow, input: { by: "CUSTOMER" | "STAFF"; reason: string | null; staffId: string | null; requestId: string }) {
  const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)).for("update");
  const { parts, paid } = await paidSoFar(tx, order);
  const now = new Date();
  for (const item of items.filter((row) => row.status !== "CANCELLED" && !SHIPPED.includes(row.status))) {
    await tx
      .update(schema.orderItems)
      .set({ status: "CANCELLED", version: sql`${schema.orderItems.version} + 1`, updatedAt: now })
      .where(eq(schema.orderItems.id, item.id));
    await tx.insert(schema.orderItemEvents).values({ orderItemId: item.id, fromStatus: item.status, toStatus: "CANCELLED", kind: "STATUS", note: input.by === "STAFF" ? `Cancelled by staff: ${input.reason}` : `Cancelled by the customer${input.reason ? `: ${input.reason}` : ""}`, staffProfileId: input.staffId });
    await tx.update(schema.holds).set({ status: "RESOLVED", resolution: "Order cancelled", resolvedByStaffId: input.staffId, resolvedAt: now }).where(and(eq(schema.holds.orderItemId, item.id), eq(schema.holds.status, "OPEN")));
  }
  const unpaid = parts.filter((part) => part.status === "NOT_DUE" || part.status === "DUE").map((part) => part.id);
  if (unpaid.length) {
    await tx.update(schema.installments).set({ status: "CANCELLED" }).where(inArray(schema.installments.id, unpaid));
    await tx.update(schema.paymentIntents).set({ status: "CANCELLED" }).where(and(inArray(schema.paymentIntents.installmentId, unpaid), eq(schema.paymentIntents.status, "OPEN")));
  }
  await tx.update(schema.orders).set({ cancelledAt: now, cancelledBy: input.by, cancelReason: input.reason, refundDueMinor: paid, updatedAt: now }).where(eq(schema.orders.id, order.id));
  const contact = order.contact as { email: string };
  const link = await createGuestLink(tx, deps.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: order.id, customerId: order.customerId, now });
  await queueEmail(deps, tx, {
    template: "order_cancelled",
    to: contact.email,
    customerId: order.customerId,
    data: { orderNumber: order.number, refund: paid > 0n ? displayMoney(paid, order.currency) : null, url: link.url },
    record: { type: "ORDER", id: order.id, label: order.number },
    linkLabel: `Opens order ${order.number}`,
    requestId: input.requestId,
  });
  return paid;
}

/** FUL-FR-050: the customer cancels before production; anything later is refused with the reason. */
export async function cancelOrder(deps: OrderEmailDeps, access: OrderAccess, orderId: string, input: { reason?: string }) {
  const order = await loadOrderFor(deps.db, access, orderId);
  if (access.actor.type === "anonymous" && !access.deviceKey) throw new AppError("NOT_FOUND");
  await deps.db.transaction(async (tx) => {
    const [locked] = await tx.select().from(schema.orders).where(eq(schema.orders.id, order.id)).for("update");
    const view = await trackingView(tx, locked!);
    if (!view.cancel.allowed) {
      const messages = {
        CANCELLED: "This order is already cancelled.",
        DISPATCHED: "Part of this order has already been dispatched, so it can't be cancelled online. Contact us to talk about your options.",
        STARTED: "Production has started, so this order can't be cancelled online. Contact us to talk about your options.",
        PAYMENT_IN_PROGRESS: "A payment on this order is being processed. Try again once it has finished.",
      } as const;
      throw new AppError(view.cancel.blockedBy === "CANCELLED" ? "CONFLICT" : "RULE_FAILED", { message: messages[view.cancel.blockedBy!], context: { reason: view.cancel.blockedBy } });
    }
    const paid = await cancelInTx(tx, deps, locked!, { by: "CUSTOMER", reason: input.reason?.trim() || null, staffId: null, requestId: access.actor.requestId });
    const customer = await customerForActor(deps.db, access.actor);
    await recordAudit(tx, access.actor, { action: "order.cancelled", summary: `Order ${order.number} cancelled by the customer before production (refund due ${displayMoney(paid, order.currency)})`, recordType: "ORDER", recordId: order.id, recordLabel: order.number, after: { refundDueMinor: paid.toString(), customerId: customer?.id ?? null } });
  });
  return { ok: true as const };
}

/** TECH-03 §9: staff cancel after commitment. PRODUCTION_MANAGE, a reason, and MFA in the last 15 minutes. */
export async function staffCancelOrder(deps: OrderEmailDeps, actor: ActorContext, orderId: string, input: { reason: string }) {
  requireRecentMfa(actor);
  const staffId = actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null;
  let paid = 0n;
  await deps.db.transaction(async (tx) => {
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!order) throw new AppError("NOT_FOUND");
    if (order.cancelledAt) throw new AppError("CONFLICT", { message: "This order is already cancelled.", context: { reason: "CANCELLED" } });
    const items = await tx.select({ status: schema.orderItems.status }).from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    if (items.every((item) => item.status === "CANCELLED" || SHIPPED.includes(item.status))) {
      throw new AppError("RULE_FAILED", { message: "Everything on this order has been dispatched. Use a return or problem report instead.", context: { reason: "DISPATCHED" } });
    }
    const { processing } = await paidSoFar(tx, order);
    if (processing) throw new AppError("RULE_FAILED", { message: "A payment on this order is being processed. Try again once it has finished.", context: { reason: "PAYMENT_IN_PROGRESS" } });
    paid = await cancelInTx(tx, deps, order, { by: "STAFF", reason: input.reason, staffId, requestId: actor.requestId });
    await recordAudit(tx, actor, { action: "order.cancelled_by_staff", summary: `Order ${order.number} cancelled by staff: ${input.reason} (refund due ${displayMoney(paid, order.currency)})`, recordType: "ORDER", recordId: order.id, recordLabel: order.number, after: { refundDueMinor: paid.toString() }, permission: "PRODUCTION_MANAGE" });
  });
  return { ok: true as const, refundDueMinor: paid.toString() };
}

