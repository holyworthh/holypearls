import { type AdminRefund, displayMoney, type IssueRefund, type RefundablePayment } from "@holypearls/contracts";
import { and, type Database, desc, eq, inArray, ne, schema, sql, type Transaction } from "@holypearls/db";
import type { Jobs } from "@holypearls/jobs";
import { type PaymentGateway, RefundRefusedError, type RefundResult } from "@holypearls/payments";
import { AppError } from "../errors.js";
import { type ActorContext, requireRecentMfa } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import { customerPaymentStatus } from "./status.js";

/*
 * Refunds (T13-05; TECH-05 §11; OPS-FR-043; PRD-06 §18; Pen 121). Finance
 * (REFUND_ISSUE, MFA in the last 15 minutes) refunds all or part of a
 * successful attempt through Paystack. Each refund is a new record; the
 * original attempt, intent, installment and receipt are never changed.
 *
 * The refund row is saved (PENDING) under a lock on the attempt before
 * Paystack is called, so two refunds can never together exceed what was paid.
 * Paystack's answer then sets its id and status. A clear refusal fails the
 * refund; no answer at all leaves it PENDING without an id, and refund.check
 * looks for it in Paystack's list rather than asking again (TECH-07: never
 * blindly retry a call that moves money). After that, status changes only
 * from Paystack's refund API: on a webhook, or on the refund.check schedule.
 */

export interface RefundDeps {
  db: Database;
  jobs: Jobs;
  gateway: PaymentGateway | null;
}

type Tx = Transaction | Database;
type Row = typeof schema.refunds.$inferSelect;
type Attempt = typeof schema.paymentAttempts.$inferSelect;

/** Checks after a refund is asked for: 10 min, 1 h, 6 h, 1 day, 3 days. Paystack can take days to process one. */
export const REFUND_CHECK_SECONDS = [600, 3600, 21_600, 86_400, 259_200] as const;
const KINDS: Record<string, string> = { DUPLICATE_PAYMENT: "duplicate", PAID_PARTICIPANT_REMOVED: "removed participant" };
const NO_ANSWER = "Paystack didn't answer. We're checking whether the refund was made; don't refund again until it settles.";

const paidOf = (attempt: Attempt) => attempt.paidAmountMinor ?? attempt.amountMinor;
const currencyOf = (attempt: Attempt) => (attempt.paidCurrency ?? attempt.currency) as "NGN" | "USD";

/** Pending and processed refunds count against the attempt; failed ones don't. */
async function refundedFor(db: Tx, attemptId: string) {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.refunds.amountMinor}), 0)::text` })
    .from(schema.refunds)
    .where(and(eq(schema.refunds.attemptId, attemptId), ne(schema.refunds.status, "FAILED")));
  return BigInt(row!.total);
}

/** What the customer sees for an intent, with its refunds counted (TECH-01 §4 order: resolution, refunded, partially refunded, …). */
async function customerSeesFor(db: Tx, intentIds: string[]) {
  if (!intentIds.length) return new Map<string, AdminRefund["customerSees"]>();
  const rows = await db
    .select({
      intentId: schema.paymentIntents.id,
      position: schema.installments.position,
      installmentStatus: schema.installments.status,
      openReview: sql<boolean>`exists (select 1 from payment_reviews r where r.intent_id = ${schema.paymentIntents.id} and r.status = 'OPEN')`,
      paid: sql<string>`(select coalesce(sum(coalesce(a.paid_amount_minor, a.amount_minor)), 0)::text from payment_attempts a where a.intent_id = ${schema.paymentIntents.id} and a.status = 'SUCCEEDED')`,
      refunded: sql<string>`(select coalesce(sum(f.amount_minor), 0)::text from refunds f where f.intent_id = ${schema.paymentIntents.id} and f.status = 'PROCESSED')`,
    })
    .from(schema.paymentIntents)
    .innerJoin(schema.installments, eq(schema.installments.id, schema.paymentIntents.installmentId))
    .where(inArray(schema.paymentIntents.id, intentIds));
  return new Map(
    rows.map((row) => [
      row.intentId,
      customerPaymentStatus({
        installments: [{ position: row.position, status: row.installmentStatus, latestAttempt: null }],
        needsResolution: row.openReview,
        refundedMinor: BigInt(row.refunded),
        paidMinor: BigInt(row.paid),
      }),
    ]),
  );
}

async function views(db: Tx, rows: Row[]): Promise<AdminRefund[]> {
  if (!rows.length) return [];
  const about = await db
    .select({ attemptId: schema.paymentAttempts.id, reference: schema.paymentAttempts.reference, orderNumber: schema.orders.number, checkoutId: schema.paymentSchedules.checkoutId, quoteVersionId: schema.paymentSchedules.quoteVersionId })
    .from(schema.paymentAttempts)
    .innerJoin(schema.paymentIntents, eq(schema.paymentIntents.id, schema.paymentAttempts.intentId))
    .innerJoin(schema.installments, eq(schema.installments.id, schema.paymentIntents.installmentId))
    .innerJoin(schema.paymentSchedules, eq(schema.paymentSchedules.id, schema.installments.scheduleId))
    .leftJoin(schema.orders, sql`${schema.orders.checkoutId} = ${schema.paymentSchedules.checkoutId} or ${schema.orders.quoteVersionId} = ${schema.paymentSchedules.quoteVersionId}`)
    .where(inArray(schema.paymentAttempts.id, [...new Set(rows.map((row) => row.attemptId))]));
  const attempts = new Map(about.map((entry) => [entry.attemptId, entry]));
  const reviewIds = rows.flatMap((row) => (row.reviewId ? [row.reviewId] : []));
  const reviews = new Map(
    (reviewIds.length ? await db.select().from(schema.paymentReviews).where(inArray(schema.paymentReviews.id, reviewIds)) : []).map((review) => [review.id, review]),
  );
  const paidByAttempt = new Map(
    (await db.select().from(schema.paymentAttempts).where(inArray(schema.paymentAttempts.id, [...attempts.keys()]))).map((attempt) => [attempt.id, paidOf(attempt)]),
  );
  const sees = await customerSeesFor(db, [...new Set(rows.map((row) => row.intentId))]);
  return rows.map((row) => {
    const attempt = attempts.get(row.attemptId);
    const review = row.reviewId ? reviews.get(row.reviewId) : undefined;
    const kind = review ? (KINDS[review.reason] ?? review.reason.toLowerCase()) : row.amountMinor < (paidByAttempt.get(row.attemptId) ?? 0n) ? "partial" : "full";
    return {
      id: row.id,
      number: row.number,
      attemptId: row.attemptId,
      intentId: row.intentId,
      reference: attempt?.reference ?? "—",
      forLabel: `${attempt?.orderNumber ?? (attempt?.checkoutId ? `Checkout ${attempt.checkoutId.slice(0, 8)}` : "Quote payment")} · ${kind}`,
      review: review ? { id: review.id, reason: review.reason, status: review.status } : null,
      amountMinor: row.amountMinor.toString(),
      currency: row.currency,
      reason: row.reason,
      status: row.status,
      failure: row.failure,
      customerSees: sees.get(row.intentId) ?? null,
      issuedBy: row.issuedByName,
      createdAt: row.createdAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
    };
  });
}

/** The refunds list (Pen 121 NJoG3), newest first. */
export async function listRefunds(db: Database) {
  const rows = await db.select().from(schema.refunds).orderBy(desc(schema.refunds.createdAt)).limit(100);
  return { items: await views(db, rows) };
}

/** The issue form for one successful attempt (Pen 121 mRG8q), optionally from a payment review. */
export async function refundablePayment(db: Database, attemptId: string, reviewId: string | null): Promise<RefundablePayment> {
  const [attempt] = await db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, attemptId));
  if (!attempt || attempt.status !== "SUCCEEDED") throw new AppError("NOT_FOUND");
  const [review] = reviewId ? await db.select().from(schema.paymentReviews).where(and(eq(schema.paymentReviews.id, reviewId), eq(schema.paymentReviews.intentId, attempt.intentId))) : [];
  if (reviewId && !review) throw new AppError("NOT_FOUND");
  const rows = await db.select().from(schema.refunds).where(eq(schema.refunds.attemptId, attemptId)).orderBy(desc(schema.refunds.createdAt));
  const refunded = await refundedFor(db, attemptId);
  const [order] = await db
    .select({ id: schema.orders.id, number: schema.orders.number })
    .from(schema.paymentIntents)
    .innerJoin(schema.installments, eq(schema.installments.id, schema.paymentIntents.installmentId))
    .innerJoin(schema.paymentSchedules, eq(schema.paymentSchedules.id, schema.installments.scheduleId))
    .innerJoin(schema.orders, sql`${schema.orders.checkoutId} = ${schema.paymentSchedules.checkoutId} or ${schema.orders.quoteVersionId} = ${schema.paymentSchedules.quoteVersionId}`)
    .where(eq(schema.paymentIntents.id, attempt.intentId));
  return {
    attemptId: attempt.id,
    intentId: attempt.intentId,
    reference: attempt.reference,
    forLabel: order?.number ?? "No order yet",
    orderId: order?.id ?? null,
    paidMinor: paidOf(attempt).toString(),
    currency: currencyOf(attempt),
    channel: attempt.channel,
    paidAt: attempt.paidAt?.toISOString() ?? null,
    refundedMinor: refunded.toString(),
    leftMinor: (paidOf(attempt) - refunded).toString(),
    review: review ? { id: review.id, reason: review.reason, status: review.status } : null,
    refunds: await views(db, rows),
  };
}

async function nextNumber(tx: Tx) {
  const result = await tx.execute<{ n: string }>(sql`select nextval('refund_number_seq')::text as n`);
  return `RF-${result.rows[0]!.n.padStart(4, "0")}`;
}

/** Issues a refund (OPS-FR-043): high-risk, so REFUND_ISSUE (the route's guard), a recent MFA check and an audit entry. */
export async function issueRefund(deps: RefundDeps, actor: ActorContext, input: IssueRefund): Promise<AdminRefund> {
  requireRecentMfa(actor);
  const gateway = deps.gateway;
  if (!gateway) throw new AppError("RULE_FAILED", { message: "Payments aren't set up here, so refunds can't be issued.", context: { reason: "PAYMENTS_NOT_SET_UP" } });
  const amount = BigInt(input.amountMinor);
  const { row, attempt } = await deps.db.transaction(async (tx) => {
    // The lock makes two refunds of one payment wait for each other, so together they never exceed it.
    const [attempt] = await tx.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, input.attemptId)).for("update");
    if (!attempt || attempt.status !== "SUCCEEDED") throw new AppError("NOT_FOUND");
    const left = paidOf(attempt) - (await refundedFor(tx, attempt.id));
    if (amount > left) {
      throw new AppError("VALIDATION_FAILED", { fieldErrors: { amountMinor: `Can't refund more than the ${displayMoney(left, currencyOf(attempt))} left on this payment.` }, context: { leftMinor: left.toString() } });
    }
    if (input.reviewId) {
      const [review] = await tx.select().from(schema.paymentReviews).where(eq(schema.paymentReviews.id, input.reviewId));
      if (!review || review.intentId !== attempt.intentId) throw new AppError("VALIDATION_FAILED", { fieldErrors: { reviewId: "This review is about another payment" } });
      if (review.status !== "OPEN") throw new AppError("CONFLICT", { message: "This review was already resolved.", context: { reason: "REVIEW_RESOLVED" } });
    }
    const [row] = await tx
      .insert(schema.refunds)
      .values({
        number: await nextNumber(tx),
        attemptId: attempt.id,
        intentId: attempt.intentId,
        reviewId: input.reviewId,
        amountMinor: amount,
        currency: currencyOf(attempt),
        reason: input.reason,
        issuedByUserId: actor.type === "user" ? actor.session.userId : null,
        issuedByName: actor.type === "user" ? (actor.staff?.displayName ?? "Staff") : "Staff",
        createdAt: actor.now,
        updatedAt: actor.now,
      })
      .returning();
    await recordAudit(tx, actor, {
      action: "refund.issued",
      summary: `Refund ${row!.number}: ${displayMoney(amount, currencyOf(attempt))} of ${attempt.reference} (${amount === paidOf(attempt) ? "full" : "partial"}). ${input.reason}`,
      recordType: "payment_intent",
      recordId: attempt.intentId,
      recordLabel: row!.number,
      after: { refundId: row!.id, attemptId: attempt.id, amountMinor: amount.toString(), reviewId: input.reviewId },
      permission: "REFUND_ISSUE",
    });
    // The checks are queued with the row, so even a crash before Paystack answers is followed up.
    for (const [index, seconds] of REFUND_CHECK_SECONDS.entries()) {
      await deps.jobs.send("refund.check", { v: 1, requestId: actor.requestId, refundId: row!.id, check: index + 1 }, { tx, startAfterSeconds: seconds });
    }
    return { row: row!, attempt };
  });

  try {
    const result = await gateway.refund({ reference: attempt.reference, amountMinor: amount, currency: currencyOf(attempt), note: `${row.number}: ${input.reason}` });
    await applyRefundResult(deps.db, row.id, result, "issue", actor.now);
  } catch (error) {
    const refused = error instanceof RefundRefusedError;
    await deps.db
      .update(schema.refunds)
      .set({
        status: refused ? "FAILED" : "PENDING",
        failure: refused ? `Paystack declined: ${error.message}` : NO_ANSWER,
        checks: sql`${schema.refunds.checks} || ${JSON.stringify([{ at: actor.now.toISOString(), source: "issue", status: refused ? "refused" : "no answer" }])}::jsonb`,
        updatedAt: actor.now,
      })
      .where(eq(schema.refunds.id, row.id));
  }
  const [saved] = await deps.db.select().from(schema.refunds).where(eq(schema.refunds.id, row.id));
  return (await views(deps.db, [saved!]))[0]!;
}

/**
 * Applies Paystack's status to a refund, once: a final status never changes
 * again. A processed refund settles the review it came from (REFUNDED), and
 * the intent leaves REVIEW_REQUIRED when nothing else is open.
 */
async function applyRefundResult(db: Database, refundId: string, result: RefundResult, source: string, now: Date) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.refunds).where(eq(schema.refunds.id, refundId)).for("update");
    if (!row) return "skipped" as const;
    const check = { at: now.toISOString(), source, status: result.providerStatus };
    if (row.status !== "PENDING") {
      await tx.update(schema.refunds).set({ checks: sql`${schema.refunds.checks} || ${JSON.stringify([check])}::jsonb` }).where(eq(schema.refunds.id, refundId));
      return "already final" as const;
    }
    const status = result.status === "processed" ? "PROCESSED" : result.status === "failed" ? "FAILED" : "PENDING";
    await tx
      .update(schema.refunds)
      .set({
        status,
        providerRefundId: result.providerRefundId,
        providerStatus: result.providerStatus,
        failure: status === "FAILED" ? "Paystack declined the refund. Try again or contact Paystack." : null,
        processedAt: status === "PROCESSED" ? now : null,
        checks: sql`${schema.refunds.checks} || ${JSON.stringify([check])}::jsonb`,
        updatedAt: now,
      })
      .where(eq(schema.refunds.id, refundId));
    if (status === "PENDING") return "pending" as const;
    if (status === "PROCESSED" && row.reviewId) {
      await tx
        .update(schema.paymentReviews)
        .set({ status: "RESOLVED", resolution: "REFUNDED", note: `${row.number}: ${row.reason}`, resolvedByUserId: row.issuedByUserId, resolvedAt: now })
        .where(and(eq(schema.paymentReviews.id, row.reviewId), eq(schema.paymentReviews.status, "OPEN")));
      const [intent] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, row.intentId)).for("update");
      const [open] = await tx.select({ id: schema.paymentReviews.id }).from(schema.paymentReviews).where(and(eq(schema.paymentReviews.intentId, row.intentId), eq(schema.paymentReviews.status, "OPEN"))).limit(1);
      if (intent?.status === "REVIEW_REQUIRED" && intent.succeededAttemptId && !open) {
        await tx.update(schema.paymentIntents).set({ status: "SUCCEEDED", version: sql`${schema.paymentIntents.version} + 1` }).where(eq(schema.paymentIntents.id, row.intentId));
      }
    }
    await recordAudit(tx, null, {
      action: status === "PROCESSED" ? "refund.processed" : "refund.failed",
      summary: `Refund ${row.number} ${status === "PROCESSED" ? "processed" : "failed"} at Paystack (${displayMoney(row.amountMinor, row.currency)})`,
      recordType: "payment_intent",
      recordId: row.intentId,
      recordLabel: row.number,
      after: { refundId: row.id, status, providerStatus: result.providerStatus },
    });
    return status === "PROCESSED" ? ("processed" as const) : ("failed" as const);
  });
}

/**
 * Asks Paystack for a refund's status (refund.check, and after a refund
 * webhook). A refund whose request got no answer is looked for in Paystack's
 * list for the transaction; if it still isn't there at the last check, it
 * was never made and fails.
 */
export async function checkRefund(deps: Pick<RefundDeps, "db" | "gateway">, refundId: string, check: number, source = "check", now = new Date()) {
  const [row] = await deps.db.select().from(schema.refunds).where(eq(schema.refunds.id, refundId));
  if (!row || row.status !== "PENDING") return "skipped" as const;
  if (!deps.gateway) throw new Error("Payments aren't set up here: no Paystack key");
  let providerRefundId = row.providerRefundId;
  if (!providerRefundId) {
    const [attempt] = await deps.db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, row.attemptId));
    const known = new Set(
      (await deps.db.select({ id: schema.refunds.providerRefundId }).from(schema.refunds).where(eq(schema.refunds.attemptId, row.attemptId))).flatMap((entry) => (entry.id ? [entry.id] : [])),
    );
    const found = (await deps.gateway.listRefunds(attempt!.reference)).find((refund) => !known.has(refund.providerRefundId) && refund.amountMinor === row.amountMinor);
    if (!found) {
      if (check < REFUND_CHECK_SECONDS.length) return "not found yet" as const;
      await deps.db
        .update(schema.refunds)
        .set({ status: "FAILED", failure: "Paystack has no record of this refund, so it wasn't made. Issue it again if it's still owed.", updatedAt: now })
        .where(and(eq(schema.refunds.id, refundId), eq(schema.refunds.status, "PENDING")));
      return "failed" as const;
    }
    providerRefundId = found.providerRefundId;
  }
  return applyRefundResult(deps.db, refundId, await deps.gateway.refundStatus(providerRefundId), source, now);
}

/** A refund webhook (saved by the Paystack webhook route): finds the refund it's about and confirms with the refund API. */
export async function confirmRefundEvent(deps: Pick<RefundDeps, "db" | "gateway">, event: { rawBody: string; reference: string | null }, now: Date) {
  let providerRefundId: string | null = null;
  try {
    const id = (JSON.parse(event.rawBody) as { data?: { id?: unknown } }).data?.id;
    providerRefundId = id === undefined || id === null ? null : String(id);
  } catch {
    // Unreadable: fall back to the transaction's pending refunds.
  }
  const [attempt] = event.reference ? await deps.db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, event.reference)) : [];
  if (!attempt) return "not ours";
  const pending = await deps.db.select().from(schema.refunds).where(and(eq(schema.refunds.attemptId, attempt.id), eq(schema.refunds.status, "PENDING")));
  const matching = pending.filter((refund) => refund.providerRefundId === providerRefundId || refund.providerRefundId === null);
  const outcomes = [];
  for (const refund of matching) outcomes.push(await checkRefund(deps, refund.id, 0, "webhook", now));
  return outcomes.join(", ") || "no pending refund";
}
