import type { CustomerPaymentStatus, WorkspaceBilling, WorkspaceOrder } from "@holypearls/contracts";
import { and, type Database, desc, eq, gte, ilike, inArray, or, schema, sql } from "@holypearls/db";
import { placementNames, type RecordScope, scopeWhere } from "../organizations/scope.js";
import { refundFactsForOrder } from "../payments/refunds.js";
import { customerPaymentStatus } from "../payments/status.js";
import { customerProduction } from "../production/production.js";
import { proofsForOrder } from "../proofs/proofs.js";
import { paymentSummaryForOrder } from "../quotes/customer.js";

/*
 * Organization orders for the Brand Workspace (T10-03; PRD-05 B2B-FR-011,
 * 012): the orders module's own view of its rows, filtered by a scope the
 * organizations module decides (TECH-00 §5). Each card is a light version
 * of the order page's statuses: production, payment and proofs.
 */

type OrderRow = typeof schema.orders.$inferSelect;

const DUE: readonly CustomerPaymentStatus[] = ["PAYMENT_DUE", "DEPOSIT_DUE", "BALANCE_DUE", "PAYMENT_FAILED", "PAYMENT_RESOLUTION_REQUIRED"];
const DONE = new Set(["DELIVERED", "CANCELLED"]);

const orderScope = (scope: RecordScope) => scopeWhere({ organizationId: schema.orders.organizationId, locationId: schema.orders.locationId, ownerUserId: schema.orders.ownerUserId }, scope);

const titleOf = (items: { productName: string; quantity: number }[]) => {
  const [first] = items;
  if (!first) return "Order";
  return items.length === 1 ? `${first.productName} · ${first.quantity.toLocaleString("en-NG")}` : `${first.productName} and ${items.length - 1} more`;
};

export interface OrderCard extends WorkspaceOrder {
  balance: { amountMinor: bigint; label: string } | null;
  currency: "NGN" | "USD";
}

async function card(db: Database, row: OrderRow, locationName: string, viewerUserId: string): Promise<OrderCard> {
  const [items, receipts, payments, production, proofs] = await Promise.all([
    db.select({ productName: schema.orderItems.productName, quantity: schema.orderItems.quantity }).from(schema.orderItems).where(eq(schema.orderItems.orderId, row.id)).orderBy(schema.orderItems.position),
    db.select({ id: schema.receipts.id }).from(schema.receipts).where(eq(schema.receipts.orderId, row.id)).limit(1),
    paymentSummaryForOrder(db, row),
    customerProduction(db, row.id),
    proofsForOrder(db, row.id),
  ]);
  const refunds = await refundFactsForOrder(db, row);
  const paymentStatus = payments
    ? customerPaymentStatus({ installments: payments.installments.map((part) => ({ position: part.position, status: part.status, latestAttempt: null })), needsResolution: false, ...refunds })
    : receipts.length
      ? customerPaymentStatus({ installments: [{ position: 1, status: "PAID", latestAttempt: "SUCCEEDED" }], needsResolution: false, ...refunds })
      : null;
  const proofsWaiting = proofs.filter((proof) => proof.status === "AWAITING_APPROVAL").length;
  const due = paymentStatus !== null && DUE.includes(paymentStatus) && !DONE.has(production.summaryStatus) ? payments?.next ?? null : null;
  const steps = [
    ...(proofsWaiting ? [proofsWaiting === 1 ? "Approve the proof" : `Approve ${proofsWaiting} proofs`] : []),
    ...(due ? [paymentStatus === "BALANCE_DUE" ? "Pay the balance" : paymentStatus === "DEPOSIT_DUE" ? "Pay the deposit" : paymentStatus === "PAYMENT_FAILED" ? "Try the payment again" : "Make the payment"] : []),
  ];
  return {
    id: row.id,
    number: row.number,
    title: titleOf(items),
    locationName,
    summaryStatus: production.summaryStatus,
    paymentStatus,
    needsYou: steps.length > 0,
    nextStep: steps.length ? steps.join(" · ") : DONE.has(production.summaryStatus) ? "Nothing needed" : "Nothing needed from you",
    placedAt: row.placedAt.toISOString(),
    placedByYou: row.ownerUserId === viewerUserId,
    balance: due ? { amountMinor: BigInt(due.amountMinor), label: due.label } : null,
    currency: row.currency as "NGN" | "USD",
  };
}

/** An organization's orders in a scope, newest first. Text matches the order number or an item name. */
export async function organizationOrders(db: Database, scope: RecordScope, viewerUserId: string, options: { query?: string; limit?: number } = {}): Promise<OrderCard[]> {
  const term = options.query?.trim().replace(/[%_\\]/g, "\\$&");
  const rows = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        orderScope(scope),
        term
          ? or(
              ilike(schema.orders.number, `%${term}%`),
              inArray(schema.orders.id, db.select({ id: schema.orderItems.orderId }).from(schema.orderItems).where(ilike(schema.orderItems.productName, `%${term}%`))),
            )
          : undefined,
      ),
    )
    .orderBy(desc(schema.orders.placedAt))
    .limit(options.limit ?? 50);
  const names = await placementNames(db, rows.map((row) => (row.organizationId && row.locationId ? { organizationId: row.organizationId, locationId: row.locationId } : null)));
  return Promise.all(rows.map((row) => card(db, row, names.get(row.locationId!)?.locationName ?? "", viewerUserId)));
}

export const isComplete = (order: WorkspaceOrder) => DONE.has(order.summaryStatus);

/**
 * Billing across the organization's orders (B2B-FR-012): what's due now,
 * this year's receipts and their total. Refund records arrive with T13-05.
 */
export async function organizationBilling(db: Database, scope: RecordScope, viewerUserId: string, now: Date): Promise<WorkspaceBilling> {
  const orders = await organizationOrders(db, scope, viewerUserId, { limit: 200 });
  const balancesDue = orders.flatMap((order) =>
    order.balance && order.paymentStatus ? [{ orderId: order.id, number: order.number, locationName: order.locationName, label: order.balance.label, amountMinor: order.balance.amountMinor.toString(), currency: order.currency, paymentStatus: order.paymentStatus }] : [],
  );
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const receiptRows = await db
    .select({ receipt: schema.receipts, order: schema.orders })
    .from(schema.receipts)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.receipts.orderId))
    .where(orderScope(scope))
    .orderBy(desc(schema.receipts.paidAt))
    .limit(100);
  const names = await placementNames(db, receiptRows.map(({ order }) => (order.organizationId && order.locationId ? { organizationId: order.organizationId, locationId: order.locationId } : null)));
  const [year] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.receipts.amountMinor}), 0)::text`, count: sql<number>`count(*)::int` })
    .from(schema.receipts)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.receipts.orderId))
    .where(and(orderScope(scope), gte(schema.receipts.paidAt, yearStart)));
  return {
    currency: "NGN",
    dueMinor: balancesDue.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n).toString(),
    paidThisYearMinor: year?.total ?? "0",
    receiptsThisYear: year?.count ?? 0,
    balancesDue,
    receipts: receiptRows.map(({ receipt, order }) => ({
      id: receipt.id,
      number: receipt.number,
      orderId: order.id,
      orderNumber: order.number,
      locationName: names.get(order.locationId!)?.locationName ?? "",
      amountMinor: receipt.amountMinor.toString(),
      currency: receipt.currency as "NGN" | "USD",
      paidAt: receipt.paidAt.toISOString(),
      // Refunds are recorded from T13-05; until then every receipt is a payment received.
      status: "PAID" as const,
    })),
  };
}

/** The organization's ordered items made from a design, as places a template can start from (T11-01b). */
export async function organizationOrderItemSources(db: Database, scope: RecordScope, limit = 30) {
  const rows = await db
    .select({ configurationId: schema.orderItems.configurationId, productName: schema.orderItems.productName, quantity: schema.orderItems.quantity, number: schema.orders.number, position: schema.orderItems.position })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(and(orderScope(scope), sql`${schema.orderItems.configurationId} is not null`))
    .orderBy(desc(schema.orders.placedAt))
    .limit(limit);
  return rows.map((row) => ({ configurationId: row.configurationId!, productName: row.productName, label: `${row.number} item ${row.position} · ${row.productName} × ${row.quantity.toLocaleString("en-NG")}`, kind: "ORDER_ITEM" as const }));
}

/** Is this configuration an item of an order in the scope? */
export async function isOrganizationOrderItem(db: Database, scope: RecordScope, configurationId: string) {
  const [row] = await db
    .select({ id: schema.orderItems.id })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(and(orderScope(scope), eq(schema.orderItems.configurationId, configurationId)))
    .limit(1);
  return Boolean(row);
}
