import type { Order, Receipt } from "@holypearls/contracts";
import { asc, type Database, desc, eq, schema, sql, type Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink } from "../identity/customers.js";
import { type NotificationDeps, queueEmail } from "../platform/notifications.js";
import { customerPaymentStatus } from "../payments/status.js";
import { deviceHash } from "../sales/cart.js";

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

/** For emails and labels: ₦47,300 or ₦3,937.50; kobo only when there are some. */
export function displayMoney(minor: bigint | string, currency: string): string {
  const value = BigInt(minor);
  const symbol = currency === "USD" ? "$" : "₦";
  const whole = value / 100n;
  const fraction = value % 100n;
  return `${symbol}${whole.toLocaleString("en-NG")}${fraction ? `.${fraction.toString().padStart(2, "0")}` : ""}`;
}

async function nextNumber(tx: Tx, sequence: "order_number_seq" | "receipt_number_seq", prefix: string, now: Date) {
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

/** The account that owns it, the browser that paid, or a guest link to this order (TECH-03 §5). Anyone else: 404. */
async function loadOrder(db: Database, access: OrderAccess, id: string) {
  const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  const { actor } = access;
  if (actor.type === "user") {
    if (row.ownerUserId === actor.session.userId) return row;
    const [customer] = await db.select({ userId: schema.customers.userId }).from(schema.customers).where(eq(schema.customers.id, row.customerId));
    if (customer?.userId === actor.session.userId) return row;
  }
  if (actor.type === "guest" && actor.guest.targetType === "ORDER" && actor.guest.targetId === row.id) return row;
  if (access.deviceKey && row.ownerDeviceHash && row.ownerDeviceHash === deviceHash(access.deviceKey)) return row;
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
  const row = await loadOrder(db, access, id);
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, row.id)).orderBy(asc(schema.orderItems.position));
  const receipts = await db.select().from(schema.receipts).where(eq(schema.receipts.orderId, row.id)).orderBy(desc(schema.receipts.paidAt));
  const contact = row.contact as { name: string };
  const address = row.address as { area?: string; state?: string; country?: string } | null;
  return {
    id: row.id,
    number: row.number,
    placedAt: row.placedAt.toISOString(),
    // A direct order is paid in full when it's made; schedules arrive with quotes (T05-05).
    paymentStatus: receipts.length ? customerPaymentStatus({ installments: [{ position: 1, status: "PAID", latestAttempt: "SUCCEEDED" }], needsResolution: false }) : null,
    items: items.map((item) => ({
      productName: item.productName,
      summary: item.summary,
      quantity: item.quantity,
      totalMinor: item.totalMinor.toString(),
      status: item.status,
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
  };
}

export async function getReceipt(db: Database, access: OrderAccess, orderId: string, receiptId: string): Promise<Receipt> {
  const order = await loadOrder(db, access, orderId);
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
