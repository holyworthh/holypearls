import type { PaymentSummary } from "@holypearls/contracts";
import { and, type Database, desc, eq, inArray, or, schema, sql, type SQL, type Transaction } from "@holypearls/db";
import type { PaymentFacts } from "./status.js";

type Source = { id: string; checkoutId: string | null; quoteVersionId: string | null };
type Part = typeof schema.installments.$inferSelect;
export interface OrderPaymentDetails {
  facts: PaymentFacts;
  summary: PaymentSummary | null;
}
const sourceKey = (source: { checkoutId: string | null; quoteVersionId: string | null }) =>
  source.checkoutId ? `checkout:${source.checkoutId}` : `quote:${source.quoteVersionId}`;

/** One page's payment facts, including reviews and the latest attempt, in four reads. */
export async function paymentDetailsForOrders(db: Database | Transaction, orders: readonly Source[]): Promise<Map<string, OrderPaymentDetails>> {
  if (!orders.length) return new Map();
  const checkoutIds = orders.flatMap((row) => (row.checkoutId ? [row.checkoutId] : []));
  const quoteIds = orders.flatMap((row) => (row.quoteVersionId ? [row.quoteVersionId] : []));
  const [rows, receipts] = await Promise.all([
    db
      .select({ part: schema.installments, schedule: schema.paymentSchedules, intent: schema.paymentIntents })
      .from(schema.paymentSchedules)
      .innerJoin(schema.installments, eq(schema.installments.scheduleId, schema.paymentSchedules.id))
      .leftJoin(schema.paymentIntents, eq(schema.paymentIntents.installmentId, schema.installments.id))
      .where(
        or(
          checkoutIds.length ? inArray(schema.paymentSchedules.checkoutId, checkoutIds) : undefined,
          quoteIds.length ? inArray(schema.paymentSchedules.quoteVersionId, quoteIds) : undefined,
        ),
      )
      .orderBy(schema.installments.position),
    db
      .select({ orderId: schema.receipts.orderId, intentId: schema.receipts.intentId })
      .from(schema.receipts)
      .where(
        inArray(
          schema.receipts.orderId,
          orders.map((row) => row.id),
        ),
      ),
  ]);
  const intentIds = [...new Set([...rows.flatMap((row) => (row.intent ? [row.intent.id] : [])), ...receipts.map((row) => row.intentId)])];
  const [attempts, reviews] = intentIds.length
    ? await Promise.all([
        db
          .selectDistinctOn([schema.paymentAttempts.intentId], { intentId: schema.paymentAttempts.intentId, status: schema.paymentAttempts.status })
          .from(schema.paymentAttempts)
          .where(inArray(schema.paymentAttempts.intentId, intentIds))
          .orderBy(schema.paymentAttempts.intentId, desc(schema.paymentAttempts.createdAt), desc(schema.paymentAttempts.id)),
        db
          .select({ intentId: schema.paymentReviews.intentId })
          .from(schema.paymentReviews)
          .where(and(inArray(schema.paymentReviews.intentId, intentIds), eq(schema.paymentReviews.status, "OPEN"))),
      ])
    : [[], []];
  const latest = new Map(attempts.map((row) => [row.intentId, row.status]));
  const unresolved = new Set(reviews.map((row) => row.intentId));
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = sourceKey(row.schedule);
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  const received = new Map<string, string[]>();
  for (const row of receipts) if (row.orderId) received.set(row.orderId, [...(received.get(row.orderId) ?? []), row.intentId]);
  return new Map(
    orders.map((order) => {
      const group = grouped.get(sourceKey(order)) ?? [];
      const facts: PaymentFacts = {
        installments: group.map(({ part, intent }) => ({ position: part.position, status: part.status, latestAttempt: intent ? (latest.get(intent.id) ?? null) : null })),
        needsResolution:
          group.some((row) => row.intent && (row.intent.status === "REVIEW_REQUIRED" || unresolved.has(row.intent.id))) ||
          (received.get(order.id) ?? []).some((id) => unresolved.has(id)),
      };
      if (!group.length && received.has(order.id)) facts.installments.push({ position: 1, status: "PAID", latestAttempt: "SUCCEEDED" });
      const schedule = group[0]?.schedule;
      const parts = group.map((row) => row.part);
      const live = parts.filter((part) => part.status !== "CANCELLED");
      const next = live.find((part) => part.status !== "PAID") ?? null;
      const view = (part: Part) => ({
        id: part.id,
        position: part.position,
        label: part.label,
        amountMinor: part.amountMinor.toString(),
        trigger: part.trigger as "ON_ACCEPTANCE" | "BEFORE_PRODUCTION" | "BEFORE_DISPATCH" | "ON_DATE",
        dueOn: part.dueOn,
        status: part.status,
        paidAt: part.paidAt?.toISOString() ?? null,
        payable: part.id === next?.id && part.status !== "PROCESSING",
      });
      const paid = live.filter((part) => part.status === "PAID").reduce((sum, part) => sum + part.amountMinor, 0n);
      const summary: PaymentSummary | null =
        order.quoteVersionId && schedule
          ? {
              currency: schedule.currency as "NGN" | "USD",
              totalMinor: schedule.totalMinor.toString(),
              paidMinor: paid.toString(),
              remainingMinor: (schedule.totalMinor - paid).toString(),
              next: next ? view(next) : null,
              installments: parts.map(view),
            }
          : null;
      return [order.id, { facts, summary }];
    }),
  );
}

/** A current due part or unresolved review, before an order page is limited. */
export function paymentNeedsAttention(order: { id: SQL; checkoutId: SQL; quoteVersionId: SQL }) {
  return sql`exists (select 1 from payment_schedules ps join installments ip on ip.schedule_id = ps.id
    left join payment_intents pi on pi.installment_id = ip.id
    where (ps.checkout_id = ${order.checkoutId} or ps.quote_version_id = ${order.quoteVersionId})
      and (ip.status = 'DUE' or pi.status = 'REVIEW_REQUIRED'
        or exists (select 1 from payment_reviews pr where pr.intent_id = pi.id and pr.status = 'OPEN')))
    or exists (select 1 from receipts r join payment_reviews pr on pr.intent_id = r.intent_id where r.order_id = ${order.id} and pr.status = 'OPEN')`;
}
