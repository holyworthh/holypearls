import type { WorkspaceBilling, WorkspaceOrder, WorkspaceOrderView } from "@holypearls/contracts";
import { and, type Database, desc, eq, gte, ilike, inArray, or, schema, sql } from "@holypearls/db";
import { placementNames, type RecordScope, scopeWhere } from "../organizations/scope.js";
import { paymentDetailsForOrders, paymentNeedsAttention } from "../payments/order-facts.js";
import { customerPaymentStatus } from "../payments/status.js";
import { afterCursor, newestFirst, pageOf } from "../platform/cursor.js";
import { heldItemIds, orderSummaryStatus } from "../production/production.js";
import { orderAwaitsProof, proofsWaitingForOrders } from "../proofs/proofs.js";

const DONE = new Set(["DELIVERED", "CANCELLED"]);
const orderScope = (scope: RecordScope) =>
  scopeWhere({ organizationId: schema.orders.organizationId, locationId: schema.orders.locationId, ownerUserId: schema.orders.ownerUserId }, scope);
const complete = sql`not exists (select 1 from order_items oi where oi.order_id = ${schema.orders.id} and oi.status not in ('DELIVERED', 'CANCELLED'))`;
const attention = sql`(${orderAwaitsProof(sql`${schema.orders.id}`)} or (${paymentNeedsAttention({ id: sql`${schema.orders.id}`, checkoutId: sql`${schema.orders.checkoutId}`, quoteVersionId: sql`${schema.orders.quoteVersionId}` })}))`;
const selection = (view?: WorkspaceOrderView) => (view === "attention" ? attention : view === "active" ? sql`not (${complete})` : view === "complete" ? complete : undefined);

export interface OrderCard extends WorkspaceOrder {
  balance: { amountMinor: bigint; label: string } | null;
  currency: "NGN" | "USD";
}

/** Filter first, then load one page's facts in batches. */
export async function organizationOrders(
  db: Database,
  scope: RecordScope,
  viewerUserId: string,
  options: { query?: string; limit?: number | null; view?: WorkspaceOrderView; cursor?: string } = {},
): Promise<OrderCard[]> {
  const term = options.query?.trim().replace(/[%_\\]/g, "\\$&");
  const query = db
    .select()
    .from(schema.orders)
    .where(
      and(
        orderScope(scope),
        selection(options.view),
        afterCursor(schema.orders.placedAt, schema.orders.id, options.cursor),
        term
          ? or(
              ilike(schema.orders.number, `%${term}%`),
              inArray(
                schema.orders.id,
                db
                  .select({ id: schema.orderItems.orderId })
                  .from(schema.orderItems)
                  .where(ilike(schema.orderItems.productName, `%${term}%`)),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(...newestFirst(schema.orders.placedAt, schema.orders.id))
    .$dynamic();
  const rows = await (options.limit === null ? query : query.limit(options.limit ?? 50));
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [items, payments, proofs, names] = await Promise.all([
    db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, ids)).orderBy(schema.orderItems.position),
    paymentDetailsForOrders(db, rows),
    proofsWaitingForOrders(db, ids),
    placementNames(
      db,
      rows.map((row) => (row.organizationId && row.locationId ? { organizationId: row.organizationId, locationId: row.locationId } : null)),
    ),
  ]);
  const held = await heldItemIds(
    db,
    items.map((item) => item.id),
  );
  const byOrder = new Map<string, typeof items>();
  for (const item of items) {
    const group = byOrder.get(item.orderId) ?? [];
    group.push(item);
    byOrder.set(item.orderId, group);
  }
  return rows.map((row) => {
    const lines = byOrder.get(row.id) ?? [];
    const first = lines[0];
    const payment = payments.get(row.id)!;
    const paymentStatus = customerPaymentStatus(payment.facts);
    const summaryStatus = orderSummaryStatus(lines.map((item) => ({ status: item.status, onHold: held.has(item.id) })));
    const waiting = proofs.get(row.id) ?? 0;
    const due = paymentStatus !== "PAYMENT_RESOLUTION_REQUIRED" && payment.summary?.next?.status === "DUE" ? payment.summary.next : null;
    const steps = [
      ...(waiting ? [waiting === 1 ? "Approve the proof" : `Approve ${waiting} proofs`] : []),
      ...(paymentStatus === "PAYMENT_RESOLUTION_REQUIRED"
        ? ["Contact us about the payment"]
        : due
          ? [
              paymentStatus === "BALANCE_DUE"
                ? "Pay the balance"
                : paymentStatus === "DEPOSIT_DUE"
                  ? "Pay the deposit"
                  : paymentStatus === "PAYMENT_FAILED"
                    ? "Try the payment again"
                    : "Make the payment",
            ]
          : []),
    ];
    return {
      id: row.id,
      number: row.number,
      title: !first ? "Order" : lines.length === 1 ? `${first.productName} · ${first.quantity.toLocaleString("en-NG")}` : `${first.productName} and ${lines.length - 1} more`,
      locationName: names.get(row.locationId!)?.locationName ?? "",
      summaryStatus,
      paymentStatus,
      needsYou: steps.length > 0,
      nextStep: steps.length ? steps.join(" · ") : DONE.has(summaryStatus) ? "Nothing needed" : "Nothing needed from you",
      placedAt: row.placedAt.toISOString(),
      placedByYou: row.ownerUserId === viewerUserId,
      balance: due ? { amountMinor: BigInt(due.amountMinor), label: due.label } : null,
      currency: row.currency as "NGN" | "USD",
    };
  });
}

export async function organizationOrderCounts(db: Database, scope: RecordScope) {
  const [counts] = await db
    .select({
      all: sql<number>`count(*)::int`,
      complete: sql<number>`count(*) filter (where ${complete})::int`,
      active: sql<number>`count(*) filter (where not (${complete}))::int`,
      attention: sql<number>`count(*) filter (where ${attention})::int`,
    })
    .from(schema.orders)
    .where(orderScope(scope));
  return counts!;
}

export const isComplete = (order: WorkspaceOrder) => DONE.has(order.summaryStatus);

/** Money is aggregated across the full scope in its original currency; history is paged separately. */
export async function organizationBilling(db: Database, scope: RecordScope, viewerUserId: string, now: Date, cursor?: string): Promise<WorkspaceBilling> {
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const [orders, receiptPage, year] = await Promise.all([
    organizationOrders(db, scope, viewerUserId, { view: "attention", limit: null }),
    db
      .select({ receipt: schema.receipts, order: schema.orders })
      .from(schema.receipts)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.receipts.orderId))
      .where(and(orderScope(scope), afterCursor(schema.receipts.paidAt, schema.receipts.id, cursor)))
      .orderBy(...newestFirst(schema.receipts.paidAt, schema.receipts.id))
      .limit(101),
    db
      .select({ currency: schema.receipts.currency, total: sql<string>`coalesce(sum(${schema.receipts.amountMinor}), 0)::text`, count: sql<number>`count(*)::int` })
      .from(schema.receipts)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.receipts.orderId))
      .where(and(orderScope(scope), gte(schema.receipts.paidAt, yearStart)))
      .groupBy(schema.receipts.currency),
  ]);
  const balancesDue = orders.flatMap((order) =>
    order.balance && order.paymentStatus
      ? [
          {
            orderId: order.id,
            number: order.number,
            locationName: order.locationName,
            label: order.balance.label,
            amountMinor: order.balance.amountMinor.toString(),
            currency: order.currency,
            paymentStatus: order.paymentStatus,
          },
        ]
      : [],
  );
  const { page: receiptRows, nextCursor } = pageOf(receiptPage, 100, (row) => ({ at: row.receipt.paidAt, id: row.receipt.id }));
  const receiptPayments = await paymentDetailsForOrders(db, [...new Map(receiptRows.map(({ order }) => [order.id, order])).values()]);
  const names = await placementNames(
    db,
    receiptRows.map(({ order }) => (order.organizationId && order.locationId ? { organizationId: order.organizationId, locationId: order.locationId } : null)),
  );
  const currencies = new Set<"NGN" | "USD">([...year.map((row) => row.currency as "NGN" | "USD"), ...balancesDue.map((row) => row.currency)]);
  if (!currencies.size) currencies.add("NGN");
  return {
    totals: [...currencies].sort().map((currency) => ({
      currency,
      dueMinor: balancesDue
        .filter((row) => row.currency === currency)
        .reduce((sum, row) => sum + BigInt(row.amountMinor), 0n)
        .toString(),
      paidThisYearMinor: year.find((row) => row.currency === currency)?.total ?? "0",
      receiptsThisYear: year.find((row) => row.currency === currency)?.count ?? 0,
    })),
    balancesDue,
    receiptsNextCursor: nextCursor,
    needsResolution: orders.filter((row) => row.paymentStatus === "PAYMENT_RESOLUTION_REQUIRED").length,
    receipts: receiptRows.map(({ receipt, order }) => ({
      id: receipt.id,
      number: receipt.number,
      orderId: order.id,
      orderNumber: order.number,
      locationName: names.get(order.locationId!)?.locationName ?? "",
      amountMinor: receipt.amountMinor.toString(),
      currency: receipt.currency as "NGN" | "USD",
      paidAt: receipt.paidAt.toISOString(),
      status: receiptPayments.get(order.id)?.facts.needsResolution ? ("PAYMENT_RESOLUTION_REQUIRED" as const) : ("PAID" as const),
    })),
  };
}

/** The organization's ordered items made from a design, as places a template can start from (T11-01b). */
export async function organizationOrderItemSources(db: Database, scope: RecordScope, limit = 30) {
  const rows = await db
    .select({
      configurationId: schema.orderItems.configurationId,
      productName: schema.orderItems.productName,
      quantity: schema.orderItems.quantity,
      number: schema.orders.number,
      position: schema.orderItems.position,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(and(orderScope(scope), sql`${schema.orderItems.configurationId} is not null`))
    .orderBy(desc(schema.orders.placedAt))
    .limit(limit);
  return rows.map((row) => ({
    configurationId: row.configurationId!,
    productName: row.productName,
    label: `${row.number} item ${row.position} · ${row.productName} × ${row.quantity.toLocaleString("en-NG")}`,
    kind: "ORDER_ITEM" as const,
  }));
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
