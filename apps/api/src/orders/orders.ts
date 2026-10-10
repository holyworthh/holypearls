import type { SQL } from "@holypearls/db";
import { type AccountOrder, type AccountReceipt, displayMoney, type Order, type Receipt } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, lt, or, schema, sql, type Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink } from "../identity/customers.js";
import { type NotificationDeps, queueEmail } from "../platform/notifications.js";
import { changeRequestsForOrder } from "../proofs/changes.js";
import { customerProduction, releaseReadyItems } from "../production/production.js";
import { customerProblems } from "../shipments/problems.js";
import { customerShipments } from "../shipments/shipments.js";
import { trackingView } from "./tracking.js";
import { createProofsForOrder, proofsForOrder } from "../proofs/proofs.js";
import { paymentDetailsForOrders } from "../payments/order-facts.js";
import { customerPaymentStatus } from "../payments/status.js";
import { deviceHash } from "../sales/cart.js";
import { canSeeOrganizationRecord, organizationAccessWhere } from "../organizations/scope.js";

/*
 * Orders and receipts (T04-05, TECH-05 §8–9; COM-FR-082, 085; PAY-FR-006).
 *
 * A direct order is made from the checkout's frozen snapshot inside the
 * transaction that confirms its payment. The unique checkout_id makes a
 * repeat return the same order, so a replayed webhook, a late check or two
 * results at once never make a second order. The receipt records one
 * successful payment and is unique per attempt. The confirmation email
 * carries the order's secure link; the receipt row is the financial record.
 */

type Tx = Transaction | Database;
type CheckoutRow = typeof schema.checkouts.$inferSelect;
type OrderRow = typeof schema.orders.$inferSelect;

export async function nextNumber(tx: Tx, sequence: "order_number_seq" | "receipt_number_seq", prefix: string, now: Date) {
  const result = await tx.execute<{ n: string }>(sql`select nextval(${sequence}::regclass)::text as n`);
  return `${prefix}${now.getUTCFullYear()}-${String(result.rows[0]!.n).padStart(4, "0")}`;
}

interface FrozenItem {
  configurationId: string;
  productName: string;
  summary: string;
  quantity: number;
  goodsMinor: string;
  vatMinor: string;
  totalMinor: string;
  leadDays: { min: number; max: number } | null;
  snapshot: unknown;
}

/** The order for a paid checkout: made once, from its frozen items and answers (TECH-05 §8). */
export async function orderForCheckout(tx: Tx, checkout: CheckoutRow, now: Date): Promise<OrderRow> {
  const [existing] = await tx.select().from(schema.orders).where(eq(schema.orders.checkoutId, checkout.id));
  if (existing) return existing;
  if (!checkout.customerId || !checkout.contact) throw new Error(`Checkout ${checkout.id} was paid without contact details`);
  const [created] = await tx
    .insert(schema.orders)
    .values({
      number: await nextNumber(tx, "order_number_seq", "HP-", now),
      checkoutId: checkout.id,
      customerId: checkout.customerId,
      ownerUserId: checkout.ownerUserId,
      ownerDeviceHash: checkout.ownerDeviceHash,
      // The organization and location the checkout was placed for (T10-03; TECH-03 §7: children inherit).
      organizationId: checkout.organizationId,
      locationId: checkout.locationId,
      currency: checkout.currency,
      goodsMinor: checkout.goodsMinor,
      deliveryMinor: checkout.deliveryMinor,
      vatMinor: checkout.vatMinor,
      totalMinor: checkout.totalMinor,
      vatRateBps: checkout.vatRateBps,
      contact: checkout.contact,
      address: checkout.address,
      delivery: checkout.delivery,
      billing: checkout.billing,
      placedAt: now,
    })
    .onConflictDoNothing({ target: schema.orders.checkoutId })
    .returning();
  // Two results at once: the unique checkout lets one insert through, and both get that order.
  if (!created) return (await tx.select().from(schema.orders).where(eq(schema.orders.checkoutId, checkout.id)))[0]!;
  const items = checkout.items as FrozenItem[];
  if (items.length) {
    await tx.insert(schema.orderItems).values(
      items.map((item, index) => ({
        orderId: created.id,
        position: index + 1,
        configurationId: item.configurationId,
        productName: item.productName,
        summary: item.summary,
        quantity: item.quantity,
        goodsMinor: BigInt(item.goodsMinor),
        vatMinor: BigInt(item.vatMinor),
        totalMinor: BigInt(item.totalMinor),
        leadDays: item.leadDays,
        snapshot: item.snapshot,
      })),
    );
  }
  await createProofsForOrder(tx, created.id);
  // A paid order whose items need no proof or artwork is queued straight away (T07-01).
  await releaseReadyItems(tx, created.id);
  return created;
}

/** The receipt for one successful attempt (PAY-FR-006). Safe to repeat. */
export async function receiptForAttempt(
  tx: Tx,
  input: { attempt: typeof schema.paymentAttempts.$inferSelect; intentId: string; order: OrderRow; paidAt: Date; now: Date },
) {
  const [existing] = await tx.select().from(schema.receipts).where(eq(schema.receipts.attemptId, input.attempt.id));
  if (existing) return existing;
  const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, input.order.id)).orderBy(asc(schema.orderItems.position));
  const contact = input.order.contact as { name: string; email: string };
  const [created] = await tx
    .insert(schema.receipts)
    .values({
      number: await nextNumber(tx, "receipt_number_seq", "HP-R-", input.now),
      attemptId: input.attempt.id,
      intentId: input.intentId,
      orderId: input.order.id,
      customerId: input.order.customerId,
      amountMinor: input.attempt.paidAmountMinor ?? input.attempt.amountMinor,
      currency: input.attempt.currency,
      paystackReference: input.attempt.reference,
      channel: input.attempt.channel,
      payer: { name: contact.name, email: contact.email },
      lines: items.map((item) => ({ label: `${item.productName} · ${item.summary}`, quantity: item.quantity, totalMinor: item.totalMinor.toString() })),
      paidAt: input.paidAt,
    })
    .onConflictDoNothing({ target: schema.receipts.attemptId })
    .returning();
  return created ?? (await tx.select().from(schema.receipts).where(eq(schema.receipts.attemptId, input.attempt.id)))[0]!;
}

export interface OrderEmailDeps extends NotificationDeps {
  /** The customer site's origin, for the order's secure link. */
  webOrigin: string;
}

/** "Order confirmed" with the receipt and the order's secure link, in the payment's transaction. */
export async function queueOrderConfirmation(deps: OrderEmailDeps, tx: Tx, order: OrderRow, receipt: typeof schema.receipts.$inferSelect, requestId: string) {
  const contact = order.contact as { name: string; email: string };
  const link = await createGuestLink(tx as Database, deps.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: order.id, customerId: order.customerId, now: receipt.createdAt });
  const lines = (receipt.lines as { label: string; quantity: number | null; totalMinor: string }[]).map((line) => `${line.label} · ${displayMoney(line.totalMinor, receipt.currency)}`);
  await queueEmail(deps, tx as Transaction, {
    template: "order_confirmed",
    to: contact.email,
    data: {
      name: contact.name.split(" ")[0],
      orderNumber: order.number,
      receiptNumber: receipt.number,
      total: displayMoney(receipt.amountMinor, receipt.currency),
      paidOn: receipt.paidAt.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" }),
      lines,
      url: link.url,
    },
    customerId: order.customerId,
    record: { type: "ORDER", id: order.id, label: order.number },
    linkLabel: `Opens order ${order.number}`,
    requestId,
  });
}

// ---- Reading orders --------------------------------------------------------

export interface OrderAccess {
  actor: ActorContext;
  deviceKey: string | null;
}

/**
 * The account that owns it, the browser that paid, or a guest link to this
 * order (TECH-03 §5). With `organizationRead`, also a workspace member who
 * can see it (T10-03): reading only, so actions keep using the owner checks.
 * Anyone else: 404.
 */
async function loadOrder(db: Database, access: OrderAccess, id: string, options: { organizationRead?: boolean } = {}) {
  const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  const { actor } = access;
  if (row.organizationId && actor.type !== "guest") {
    if (!(await canSeeOrganizationRecord(db, actor, row))) throw new AppError("NOT_FOUND");
    if (options.organizationRead) return row;
  }
  if (actor.type === "user") {
    if (row.ownerUserId === actor.session.userId) return row;
    const [customer] = await db.select({ userId: schema.customers.userId }).from(schema.customers).where(eq(schema.customers.id, row.customerId));
    if (customer?.userId === actor.session.userId) return row;
  }
  if (actor.type === "guest" && actor.guest.targetType === "ORDER" && actor.guest.targetId === row.id) return row;
  // A quote's link opens the order made from it (T05-05).
  if (actor.type === "guest" && actor.guest.targetType === "QUOTE" && row.quoteVersionId) {
    const [version] = await db.select({ quoteId: schema.quoteVersions.quoteId }).from(schema.quoteVersions).where(eq(schema.quoteVersions.id, row.quoteVersionId));
    if (version?.quoteId === actor.guest.targetId) return row;
  }
  if (access.deviceKey && row.ownerDeviceHash && row.ownerDeviceHash === deviceHash(access.deviceKey)) return row;
  if (options.organizationRead && (await canSeeOrganizationRecord(db, actor, row))) return row;
  throw new AppError("NOT_FOUND");
}

const receiptSummary = (row: typeof schema.receipts.$inferSelect) => ({
  id: row.id,
  number: row.number,
  amountMinor: row.amountMinor.toString(),
  currency: row.currency as "NGN" | "USD",
  paidAt: row.paidAt.toISOString(),
  channel: row.channel,
  paystackReference: row.paystackReference,
});

export async function getOrder(db: Database, access: OrderAccess, id: string): Promise<Order> {
  return orderView(db, await loadOrder(db, access, id, { organizationRead: true }));
}

/** Whose orders an account sees: its own, and its linked customer record's (TECH-03 §6). */
const accountOwns = (userId: string) => and(or(eq(schema.orders.ownerUserId, userId), eq(schema.customers.userId, userId)), organizationAccessWhere(schema.orders, userId));

/** The account's newest orders for its overview (Pen frame 92), with the statuses its order pages show. */
export async function accountOrders(db: Database, userId: string, limit = 10): Promise<AccountOrder[]> {
  const rows = await db
    .select({ order: schema.orders })
    .from(schema.orders)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
    .where(accountOwns(userId))
    .orderBy(desc(schema.orders.placedAt))
    .limit(limit);
  return Promise.all(
    rows.map(async ({ order }) => {
      const view = await orderView(db, order);
      const [first] = view.items;
      const title = !first ? "Order" : view.items.length === 1 ? `${first.productName} · ${first.quantity.toLocaleString("en-NG")}` : `${first.productName} and ${view.items.length - 1} more`;
      return { id: order.id, number: order.number, title, summaryStatus: view.summaryStatus, paymentStatus: view.paymentStatus, placedAt: order.placedAt.toISOString() };
    }),
  );
}

/** The account's newest receipts, from its orders. */
export async function accountReceipts(db: Database, userId: string, limit = 10): Promise<AccountReceipt[]> {
  const rows = await db
    .select({ receipt: schema.receipts })
    .from(schema.receipts)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.receipts.orderId))
    .innerJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
    .where(accountOwns(userId))
    .orderBy(desc(schema.receipts.paidAt))
    .limit(limit);
  return rows.map(({ receipt }) => ({ ...receiptSummary(receipt), orderId: receipt.orderId }));
}

/** Orders placed with a customer record before an account existed: the ones linking added. */
export async function ordersBefore(db: Database, customerId: string, before: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.orders)
    .where(and(eq(schema.orders.customerId, customerId), lt(schema.orders.placedAt, before)));
  return row?.n ?? 0;
}

export async function loadOrderFor(db: Database, access: OrderAccess, id: string) {
  return loadOrder(db, access, id);
}

export async function canReadOrder(db: Database, actor: ActorContext, id: string) {
  try {
    await loadOrder(db, { actor, deviceKey: null }, id, { organizationRead: true });
    return true;
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") return false;
    throw error;
  }
}

/** Artwork of an ordered configuration inherits the retained order's access. */
export async function configurationOrderAccess(db: Database, actor: ActorContext, configurationId: string) {
  const orders = await db.selectDistinct({ id: schema.orderItems.orderId }).from(schema.orderItems).where(eq(schema.orderItems.configurationId, configurationId));
  if (!orders.length) return null;
  for (const order of orders) if (await canReadOrder(db, actor, order.id)) return true;
  return false;
}

export async function orderView(db: Database, row: OrderRow): Promise<Order> {
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, row.id)).orderBy(asc(schema.orderItems.position));
  const receipts = await db.select().from(schema.receipts).where(eq(schema.receipts.orderId, row.id)).orderBy(desc(schema.receipts.paidAt));
  const payment = (await paymentDetailsForOrders(db, [row])).get(row.id)!;
  const payments = payment.summary;
  const [quote] = row.quoteVersionId
    ? await db
        .select({ id: schema.quotes.id, reference: schema.quotes.reference, version: schema.quoteVersions.number })
        .from(schema.quoteVersions)
        .innerJoin(schema.quotes, eq(schema.quotes.id, schema.quoteVersions.quoteId))
        .where(eq(schema.quoteVersions.id, row.quoteVersionId))
    : [];
  const production = await customerProduction(db, row.id);
  const contact = row.contact as { name: string };
  const address = row.address as { area?: string; state?: string; country?: string } | null;
  return {
    id: row.id,
    number: row.number,
    placedAt: row.placedAt.toISOString(),
    paymentStatus: customerPaymentStatus(payment.facts),
    summaryStatus: production.summaryStatus,
    items: items.map((item) => ({
      productName: item.productName,
      summary: item.summary,
      quantity: item.quantity,
      totalMinor: item.totalMinor.toString(),
      status: item.status,
      hold: production.holdByPosition.get(item.position) ?? null,
      leadDays: (item.leadDays as { min: number; max: number } | null) ?? null,
    })),
    totals: {
      goodsMinor: row.goodsMinor.toString(),
      deliveryMinor: row.deliveryMinor === null ? null : row.deliveryMinor.toString(),
      vatMinor: row.vatMinor.toString(),
      totalMinor: row.totalMinor.toString(),
      vatRateBps: row.vatRateBps,
    },
    currency: row.currency as "NGN" | "USD",
    contactName: contact.name,
    deliverTo: address ? [address.area, address.state, address.country && address.country !== "NG" ? address.country : null].filter(Boolean).join(", ") : null,
    receipts: receipts.map(receiptSummary),
    payments,
    quote: quote ?? null,
    proofs: await proofsForOrder(db, row.id),
    changeRequests: await changeRequestsForOrder(db, row.id),
    ...(await trackingView(db, row)),
    shipments: await customerShipments(db, row.id),
    problems: await customerProblems(db, row.id),
    // Delivered items made from a design can be ordered again (FUL-FR-060–062); quote lines start a new project.
    reorderable: items.filter((item) => item.configurationId && item.status === "DELIVERED").map((item) => item.position),
  };
}

export async function getReceipt(db: Database, access: OrderAccess, orderId: string, receiptId: string): Promise<Receipt> {
  const order = await loadOrder(db, access, orderId, { organizationRead: true });
  const [row] = await db.select().from(schema.receipts).where(eq(schema.receipts.id, receiptId));
  if (!row || row.orderId !== order.id) throw new AppError("NOT_FOUND");
  return receiptView(row, order);
}

export function receiptView(row: typeof schema.receipts.$inferSelect, order: OrderRow | null): Receipt {
  return {
    ...receiptSummary(row),
    orderNumber: order?.number ?? null,
    payer: row.payer as { name: string; email: string },
    lines: row.lines as Receipt["lines"],
    totals: order
      ? {
          goodsMinor: order.goodsMinor.toString(),
          deliveryMinor: order.deliveryMinor === null ? null : order.deliveryMinor.toString(),
          vatMinor: order.vatMinor.toString(),
          totalMinor: order.totalMinor.toString(),
          vatRateBps: order.vatRateBps,
        }
      : null,
  };
}

/** The checkout's order, for the confirmation screen. */
export async function orderOfCheckout(db: Database, checkoutId: string) {
  const [row] = await db.select({ id: schema.orders.id, number: schema.orders.number }).from(schema.orders).where(eq(schema.orders.checkoutId, checkoutId));
  return row ?? null;
}

/** Retained attachments and snapshots must survive upload cleanup. */
export function orderRetainsFile(fileId: string | SQL) {
  return sql`exists (select 1 from problem_report_photos where file_id = ${fileId}::uuid)
    or exists (select 1 from order_items where snapshot::text like '%' || ${fileId}::text || '%')
    or exists (select 1 from proof_versions where views::text like '%' || ${fileId}::text || '%')`;
}
