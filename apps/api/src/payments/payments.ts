import type { Courier } from "../sales/courier.js";
import { type CheckoutPayment, displayMoney, type PaymentChannel, type PaymentStart } from "@holypearls/contracts";
import { and, type Database, desc, eq, inArray, or, schema, sql, type Transaction } from "@holypearls/db";
import type { Jobs } from "@holypearls/jobs";
import { type PaymentGateway, PaymentStartError, type VerifyResult } from "@holypearls/payments";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink, ofPerson, type PersonSubject } from "../identity/customers.js";
import { recordAudit, scrubJsonText } from "../platform/audit.js";
import { queueEmail } from "../platform/notifications.js";
import { type OrderEmailDeps, orderForCheckout, queueOrderConfirmation, receiptForAttempt } from "../orders/orders.js";
import { confirmRefundEvent } from "./refunds.js";
import { customerPaymentStatus } from "./status.js";
import { releaseAfterPayment } from "../production/production.js";

/*
 * Payments core (T04-03, TECH-05 §3–7, PAY-FR-001–011).
 *
 * The server decides every amount: a checkout's intent is made from the
 * checkout's own total, never from anything the browser sends. Only two things
 * change a payment's result: a verified webhook followed by Paystack's verify
 * API, or the payment.check job calling verify. A redirect back from Paystack
 * proves nothing (TECH-05 §6).
 *
 * Every result is applied in one transaction with the attempt and intent rows
 * locked, so webhooks, checks and retries can arrive in any order and any
 * number of times without crediting twice. The unique succeeded_attempt_id
 * is the last safeguard (TECH-05 §7).
 */

export interface PaymentDeps {
  db: Database;
  jobs: Jobs;
  /** Null when no Paystack key is set: payments show as not available. */
  gateway: PaymentGateway | null;
  /** The web app's origin, for Paystack's callback page and the order's secure link. */
  webOrigin: string;
  /** DATA_ENCRYPTION_KEY: order confirmations are stored sealed (they carry the order's link). */
  sealKey: string;
  /** Shipbubble (T08-05); null when no key is set, and addresses outside the zones are priced by staff. */
  courier?: Courier | null;
}

type Tx = Transaction | Database;
type Attempt = typeof schema.paymentAttempts.$inferSelect;
type Intent = typeof schema.paymentIntents.$inferSelect;
type Checkout = typeof schema.checkouts.$inferSelect;

/** Checks after an attempt starts, in seconds: 2 min, 10 min, 30 min, 2 h, 6 h, 24 h, then the 48-hour cut-off (TECH-05 §6). */
export const CHECK_SCHEDULE_SECONDS = [120, 600, 1800, 7200, 21_600, 86_400, 172_800] as const;
/** While an attempt is pending, a new one may start after this (TECH-05 §6). */
export const NEW_ATTEMPT_AFTER_MS = 10 * 60 * 1000;
/**
 * Paystack calls an opened but unpaid transaction "abandoned" at once, while
 * the customer may still be choosing a method. Before this age it counts as
 * still pending; the later checks settle it.
 */
const ABANDONED_FINAL_AFTER_MS = 30 * 60 * 1000;

const ACTIVE_ATTEMPT = ["CREATED", "PENDING"] as const;

export async function paymentSettings(db: Tx) {
  const [row] = await db.select().from(schema.paymentSettings).where(eq(schema.paymentSettings.id, 1));
  return row ?? { onlinePayments: false, channels: ["card", "bank_transfer", "ussd"], internationalCards: false, usdEnabled: false };
}

/** Why Pay can't be pressed, if anything stops it (TECH-05 §13). */
export function paymentsBlocker(gateway: PaymentGateway | null, settings: { onlinePayments: boolean }) {
  if (!gateway) return { code: "PAYMENTS_NOT_AVAILABLE" as const, message: "Online payment isn't switched on yet." };
  if (!settings.onlinePayments) return { code: "PAYMENTS_PAUSED" as const, message: "Online payment is paused. We'll email you when it's back." };
  return null;
}

/** The checkout's schedule, installment and intent, if the customer has pressed Pay before. */
async function checkoutIntent(db: Tx, checkoutId: string) {
  const [row] = await db
    .select({ intent: schema.paymentIntents, installment: schema.installments })
    .from(schema.paymentSchedules)
    .innerJoin(schema.installments, eq(schema.installments.scheduleId, schema.paymentSchedules.id))
    .innerJoin(schema.paymentIntents, eq(schema.paymentIntents.installmentId, schema.installments.id))
    .where(eq(schema.paymentSchedules.checkoutId, checkoutId));
  return row ?? null;
}

/** Checkouts whose payment is under way or done can't be changed or closed. */
export async function checkoutsWithActivePayment(db: Tx, checkoutIds: string[]) {
  if (!checkoutIds.length) return [];
  const rows = await db
    .select({ checkoutId: schema.paymentSchedules.checkoutId })
    .from(schema.paymentSchedules)
    .innerJoin(schema.installments, eq(schema.installments.scheduleId, schema.paymentSchedules.id))
    .innerJoin(schema.paymentIntents, eq(schema.paymentIntents.installmentId, schema.installments.id))
    .where(and(inArray(schema.paymentSchedules.checkoutId, checkoutIds), inArray(schema.paymentIntents.status, ["PROCESSING", "SUCCEEDED", "REVIEW_REQUIRED"])));
  return rows.map((row) => row.checkoutId!);
}

export const paymentInProgress = () =>
  new AppError("CONFLICT", { message: "A payment for this checkout is in progress. Wait for it to finish before changing anything.", context: { reason: "PAYMENT_IN_PROGRESS" } });

/** A closed checkout's unpaid intent is cancelled with it (TECH-01 §4: OPEN → CANCELLED). */
export async function cancelCheckoutPayments(tx: Tx, checkoutIds: string[]) {
  if (!checkoutIds.length) return;
  const parts = await tx
    .select({ installmentId: schema.installments.id })
    .from(schema.paymentSchedules)
    .innerJoin(schema.installments, eq(schema.installments.scheduleId, schema.paymentSchedules.id))
    .where(inArray(schema.paymentSchedules.checkoutId, checkoutIds));
  const ids = parts.map((part) => part.installmentId);
  if (!ids.length) return;
  await tx.update(schema.paymentIntents).set({ status: "CANCELLED" }).where(and(inArray(schema.paymentIntents.installmentId, ids), eq(schema.paymentIntents.status, "OPEN")));
  await tx.update(schema.installments).set({ status: "CANCELLED" }).where(and(inArray(schema.installments.id, ids), inArray(schema.installments.status, ["NOT_DUE", "DUE"])));
}

/** What the checkout page shows about paying (PAY-FR-003, 007, 009). */
export async function checkoutPayment(deps: Pick<PaymentDeps, "db" | "gateway">, checkout: Checkout): Promise<CheckoutPayment> {
  const settings = await paymentSettings(deps.db);
  const found = await checkoutIntent(deps.db, checkout.id);
  const [latest] = found
    ? await deps.db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.intentId, found.intent.id)).orderBy(desc(schema.paymentAttempts.createdAt)).limit(1)
    : [];
  const [review] = found
    ? await deps.db.select({ id: schema.paymentReviews.id }).from(schema.paymentReviews).where(and(eq(schema.paymentReviews.intentId, found.intent.id), eq(schema.paymentReviews.status, "OPEN"))).limit(1)
    : [];
  const status = found
    ? customerPaymentStatus({ installments: [{ position: found.installment.position, status: found.installment.status, latestAttempt: latest?.status ?? null }], needsResolution: Boolean(review) })
    : checkout.status === "OPEN"
      ? "PAYMENT_DUE"
      : null;
  return {
    available: paymentsBlocker(deps.gateway, settings) === null,
    channels: settings.channels as PaymentChannel[],
    internationalCards: settings.internationalCards,
    status,
    attempt: latest
      ? {
          status: latest.status,
          reference: latest.reference,
          startedAt: latest.createdAt.toISOString(),
          newAttemptFrom: latest.status === "PENDING" || latest.status === "CREATED" ? new Date(latest.createdAt.getTime() + NEW_ATTEMPT_AFTER_MS).toISOString() : null,
          message: latest.status === "FAILED" || latest.status === "ABANDONED" ? (latest.failureMessage ?? latest.gatewayResponse) : null,
        }
      : null,
    amountMinor: (found?.intent.amountMinor ?? checkout.totalMinor).toString(),
    currency: checkout.currency as "NGN" | "USD",
  };
}

/**
 * The checkout's intent, made on the first Pay: one installment for the whole
 * amount, due now. While nobody is paying, the amount follows the checkout's
 * latest total (a changed delivery choice).
 */
async function ensureCheckoutIntent(tx: Tx, checkout: Checkout): Promise<Intent> {
  const existing = await checkoutIntent(tx, checkout.id);
  if (existing) {
    const { intent, installment } = existing;
    if (intent.status === "OPEN" && intent.amountMinor !== checkout.totalMinor) {
      await tx.update(schema.paymentSchedules).set({ totalMinor: checkout.totalMinor }).where(eq(schema.paymentSchedules.checkoutId, checkout.id));
      await tx.update(schema.installments).set({ amountMinor: checkout.totalMinor }).where(eq(schema.installments.id, installment.id));
      const [updated] = await tx.update(schema.paymentIntents).set({ amountMinor: checkout.totalMinor }).where(eq(schema.paymentIntents.id, intent.id)).returning();
      return updated!;
    }
    return intent;
  }
  const [schedule] = await tx.insert(schema.paymentSchedules).values({ checkoutId: checkout.id, currency: checkout.currency, totalMinor: checkout.totalMinor }).returning();
  const [part] = await tx
    .insert(schema.installments)
    .values({ scheduleId: schedule!.id, position: 1, label: "Pay in full", amountMinor: checkout.totalMinor, currency: checkout.currency, trigger: "ON_ACCEPTANCE", status: "DUE" })
    .returning();
  const [intent] = await tx.insert(schema.paymentIntents).values({ installmentId: part!.id, amountMinor: checkout.totalMinor, currency: checkout.currency }).returning();
  return intent!;
}

const lockIntent = async (tx: Tx, id: string) => (await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, id)).for("update"))[0]!;

/**
 * "Pay" on a checkout (TECH-05 §5). Checks the checkout can be paid, makes or
 * refreshes its intent, records a CREATED attempt with a new reference, asks
 * Paystack to start the transaction, then marks the attempt PENDING and queues
 * its checks. The same Idempotency-Key returns the same attempt (the
 * interceptor), and a second key while one is pending is refused for 10 minutes.
 */
export async function startCheckoutPayment(
  deps: PaymentDeps,
  actor: ActorContext,
  checkout: { row: Checkout; blockers: { code: string; message: string }[] },
): Promise<PaymentStart> {
  const now = actor.now;
  const settings = await paymentSettings(deps.db);
  const off = paymentsBlocker(deps.gateway, settings);
  if (off) throw new AppError("RULE_FAILED", { message: off.message, context: { reason: off.code } });
  const blocker = checkout.blockers.find((item) => item.code === "STEPS_INCOMPLETE" || item.code === "DELIVERY_QUOTE_REQUIRED");
  if (blocker) throw new AppError("RULE_FAILED", { message: blocker.message, context: { reason: blocker.code } });
  const email = (checkout.row.contact as { email?: string } | null)?.email;
  if (!email) throw new AppError("RULE_FAILED", { message: "Add your contact details first.", context: { reason: "STEPS_INCOMPLETE" } });

  return beginAttempt(deps, actor, {
    email,
    callbackUrl: `${deps.webOrigin}/checkout/${checkout.row.id}/processing`,
    metadata: { checkoutId: checkout.row.id },
    prepare: async (tx) => {
      const [row] = await tx.select().from(schema.checkouts).where(eq(schema.checkouts.id, checkout.row.id)).for("update");
      if (row!.status === "COMPLETED") throw new AppError("CONFLICT", { message: "This checkout is already paid.", context: { reason: "ALREADY_PAID" } });
      const expired = row!.expiresAt !== null && row!.expiresAt.getTime() <= now.getTime();
      if (row!.status !== "OPEN" || expired) throw new AppError("CONFLICT", { message: "This checkout is closed. Go back to your cart to start again.", context: { reason: "CHECKOUT_CLOSED" } });
      if (row!.version !== checkout.row.version) throw new AppError("CONFLICT", { message: "This checkout changed in another tab. Reload to continue.", context: { reason: "STALE_VERSION" } });
      return ensureCheckoutIntent(tx, row!);
    },
  });
}

/**
 * The common part of every Pay (TECH-05 §5): under the intent's lock, check
 * it can be paid, record a CREATED attempt with a new reference and mark the
 * intent PROCESSING; then ask Paystack to start the transaction, mark the
 * attempt PENDING and queue its checks. A refused start fails the attempt and
 * reopens the intent.
 */
export async function beginAttempt(
  deps: PaymentDeps,
  actor: ActorContext,
  input: { email: string; callbackUrl: string; metadata: Record<string, string>; prepare: (tx: Tx) => Promise<Intent> },
): Promise<PaymentStart> {
  const now = actor.now;
  const settings = await paymentSettings(deps.db);
  const gateway = deps.gateway!;
  const started = await deps.db.transaction(async (tx) => {
    const intent = await lockIntent(tx, (await input.prepare(tx)).id);
    if (intent.status === "SUCCEEDED") throw new AppError("CONFLICT", { message: "This is already paid.", context: { reason: "ALREADY_PAID" } });
    if (intent.status === "REVIEW_REQUIRED") throw new AppError("CONFLICT", { message: "We're checking a payment on this. We'll email you, or contact us with your reference.", context: { reason: "PAYMENT_UNDER_REVIEW" } });
    if (intent.status === "CANCELLED") throw new AppError("CONFLICT", { message: "This payment was cancelled. Start again from the page you came from.", context: { reason: "CHECKOUT_CLOSED" } });
    if (intent.status === "PROCESSING") {
      const [active] = await tx
        .select()
        .from(schema.paymentAttempts)
        .where(and(eq(schema.paymentAttempts.intentId, intent.id), inArray(schema.paymentAttempts.status, [...ACTIVE_ATTEMPT])))
        .orderBy(desc(schema.paymentAttempts.createdAt))
        .limit(1);
      if (active && now.getTime() - active.createdAt.getTime() < NEW_ATTEMPT_AFTER_MS) {
        throw new AppError("CONFLICT", {
          message: "A payment is already in progress.",
          context: { reason: "PAYMENT_IN_PROGRESS", newAttemptFrom: new Date(active.createdAt.getTime() + NEW_ATTEMPT_AFTER_MS).toISOString() },
        });
      }
    }
    const [attempt] = await tx
      .insert(schema.paymentAttempts)
      .values({ intentId: intent.id, reference: `HPPAY-${randomUUID()}`, amountMinor: intent.amountMinor, currency: intent.currency, createdAt: now })
      .returning();
    // Marked as being paid before Paystack is called, so a second key can't start a parallel attempt.
    await tx.update(schema.paymentIntents).set({ status: "PROCESSING", version: sql`${schema.paymentIntents.version} + 1` }).where(eq(schema.paymentIntents.id, intent.id));
    await tx.update(schema.installments).set({ status: "PROCESSING" }).where(eq(schema.installments.id, intent.installmentId));
    for (const [index, seconds] of CHECK_SCHEDULE_SECONDS.entries()) {
      await deps.jobs.send("payment.check", { v: 1, requestId: actor.requestId, attemptId: attempt!.id, check: index + 1 }, { tx, startAfterSeconds: seconds });
    }
    return { attempt: attempt!, intent };
  });

  const { attempt, intent } = started;
  let opened: { accessCode: string; authorizationUrl: string };
  try {
    opened = await gateway.initialize({
      reference: attempt.reference,
      amountMinor: attempt.amountMinor,
      currency: attempt.currency as "NGN" | "USD",
      email: input.email,
      channels: settings.channels as PaymentChannel[],
      callbackUrl: input.callbackUrl,
      metadata: { intentId: intent.id, ...input.metadata },
    });
  } catch (error) {
    if (!(error instanceof PaymentStartError)) throw error;
    // No transaction exists at Paystack: the attempt failed and the intent can be paid again (TECH-05 §5).
    await deps.db.transaction(async (tx) => {
      await lockIntent(tx, intent.id);
      await tx.update(schema.paymentAttempts).set({ status: "FAILED", failureMessage: "We couldn't start the payment.", gatewayResponse: error.message.slice(0, 500), finishedAt: now }).where(eq(schema.paymentAttempts.id, attempt.id));
      await reopenIfIdle(tx, intent.id, intent.installmentId);
    });
    throw new AppError("RULE_FAILED", { message: "We couldn't start the payment. Try again.", context: { reason: "PAYMENT_START_FAILED" } });
  }

  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.paymentAttempts)
      .set({ status: "PENDING", accessCode: opened.accessCode, authorizationUrl: opened.authorizationUrl })
      .where(and(eq(schema.paymentAttempts.id, attempt.id), eq(schema.paymentAttempts.status, "CREATED")));
  });
  return { reference: attempt.reference, accessCode: opened.accessCode, authorizationUrl: opened.authorizationUrl, amountMinor: attempt.amountMinor.toString(), currency: attempt.currency as "NGN" | "USD" };
}

/** A failed or abandoned attempt returns the intent to OPEN and the installment to DUE, unless another attempt is still going. */
async function reopenIfIdle(tx: Tx, intentId: string, installmentId: string) {
  const [active] = await tx
    .select({ id: schema.paymentAttempts.id })
    .from(schema.paymentAttempts)
    .where(and(eq(schema.paymentAttempts.intentId, intentId), inArray(schema.paymentAttempts.status, [...ACTIVE_ATTEMPT])))
    .limit(1);
  if (active) return;
  const reopened = await tx
    .update(schema.paymentIntents)
    .set({ status: "OPEN", version: sql`${schema.paymentIntents.version} + 1` })
    .where(and(eq(schema.paymentIntents.id, intentId), eq(schema.paymentIntents.status, "PROCESSING")))
    .returning({ id: schema.paymentIntents.id });
  if (reopened.length) await tx.update(schema.installments).set({ status: "DUE" }).where(and(eq(schema.installments.id, installmentId), eq(schema.installments.status, "PROCESSING")));
}

async function openReview(tx: Tx, intent: Intent, attempt: Attempt, reason: "UNCLEAR_RESULT" | "AMOUNT_MISMATCH" | "DUPLICATE_PAYMENT", details: Record<string, unknown>) {
  await tx.update(schema.paymentIntents).set({ status: "REVIEW_REQUIRED", version: sql`${schema.paymentIntents.version} + 1` }).where(eq(schema.paymentIntents.id, intent.id));
  const opened = await tx.insert(schema.paymentReviews).values({ intentId: intent.id, attemptId: attempt.id, reason, details }).onConflictDoNothing().returning({ id: schema.paymentReviews.id });
  if (opened.length) {
    await recordAudit(tx, null, {
      action: "payment.review_opened",
      summary: `Payment review opened: ${reason}`,
      recordType: "payment_intent",
      recordId: intent.id,
      recordLabel: attempt.reference,
      after: { reason, ...details },
    });
  }
}

/** What a confirmed payment needs besides the database: email for the order confirmation (null in some tests). */
export interface ResultDeps {
  db: Database;
  notify: OrderEmailDeps | null;
}

/**
 * The intent has its one successful attempt: the installment is paid and the
 * checkout completes; its designs are ordered and leave the cart. The order
 * is made from the checkout's snapshot, the receipt from the attempt, and the
 * confirmation email is queued, all in this transaction (TECH-05 §6, §8, §9).
 */
export async function onIntentSucceeded(tx: Tx, intent: Intent, attemptId: string, now: Date, notify: OrderEmailDeps | null, requestId: string) {
  await tx.update(schema.installments).set({ status: "PAID", paidAt: now }).where(eq(schema.installments.id, intent.installmentId));
  const [source] = await tx
    .select({ checkoutId: schema.paymentSchedules.checkoutId, quoteVersionId: schema.paymentSchedules.quoteVersionId })
    .from(schema.installments)
    .innerJoin(schema.paymentSchedules, eq(schema.paymentSchedules.id, schema.installments.scheduleId))
    .where(eq(schema.installments.id, intent.installmentId));
  if (source?.quoteVersionId) return onInstallmentPaid(tx, intent, attemptId, source.quoteVersionId, now, notify, requestId);
  if (!source?.checkoutId) return;
  const [checkout] = await tx
    .update(schema.checkouts)
    .set({ status: "COMPLETED", completedAt: now, version: sql`${schema.checkouts.version} + 1` })
    .where(eq(schema.checkouts.id, source.checkoutId))
    .returning();
  if (!checkout) return;
  if (checkout.configurationIds.length) {
    await tx.update(schema.configurations).set({ status: "ORDERED", savedForLaterAt: null }).where(inArray(schema.configurations.id, checkout.configurationIds));
    await tx.delete(schema.cartItems).where(inArray(schema.cartItems.configurationId, checkout.configurationIds));
  }
  const order = await orderForCheckout(tx, checkout, now);
  const [attempt] = await tx.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, attemptId));
  const receipt = await receiptForAttempt(tx, { attempt: attempt!, intentId: intent.id, order, paidAt: attempt!.paidAt ?? now, now });
  if (notify) await queueOrderConfirmation(notify, tx, order, receipt, requestId);
  return order;
}

/**
 * An installment of an accepted quote is paid (PAY-FR-001–006): the receipt
 * is made from the attempt and the customer is told what's left. The order
 * already exists (it was made when the quote was accepted).
 */
async function onInstallmentPaid(tx: Tx, intent: Intent, attemptId: string, quoteVersionId: string, now: Date, notify: OrderEmailDeps | null, requestId: string) {
  const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.quoteVersionId, quoteVersionId));
  if (!order) return;
  const [attempt] = await tx.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, attemptId));
  const receipt = await receiptForAttempt(tx, { attempt: attempt!, intentId: intent.id, order, paidAt: attempt!.paidAt ?? now, now });
  // A deposit can queue items; the balance releases finished ones, in this transaction (TECH-05 §10).
  await releaseAfterPayment(tx, order.id);
  if (notify) {
    const [part] = await tx.select().from(schema.installments).where(eq(schema.installments.id, intent.installmentId));
    const paid = await tx
      .select({ amount: schema.installments.amountMinor })
      .from(schema.installments)
      .where(and(eq(schema.installments.scheduleId, part!.scheduleId), eq(schema.installments.status, "PAID")));
    const remaining = order.totalMinor - paid.reduce((sum, row) => sum + row.amount, 0n);
    const contact = order.contact as { email: string };
    const link = await createGuestLink(tx as Database, notify.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: order.id, customerId: order.customerId, now });
    await queueEmail(notify, tx as Transaction, {
      template: "payment_received",
      to: contact.email,
      customerId: order.customerId,
      data: { orderNumber: order.number, label: part!.label, amount: displayMoney(receipt.amountMinor, receipt.currency), receiptNumber: receipt.number, remaining: displayMoney(remaining > 0n ? remaining : 0n, order.currency), url: link.url },
      record: { type: "ORDER", id: order.id, label: order.number },
      linkLabel: `Opens order ${order.number}`,
      requestId,
    });
  }
  return order;
}

export type ResultSource = "webhook" | "check";

/**
 * Applies Paystack's verified answer to one attempt (TECH-05 §6–7). Safe to
 * run any number of times, from webhooks and checks in any order.
 * `finalCheck` is the 48-hour check: no final answer by then means UNKNOWN
 * and a staff review.
 */
export async function applyResult(deps: ResultDeps, attemptId: string, result: VerifyResult, options: { source: ResultSource; now: Date; finalCheck?: boolean; requestId?: string }) {
  const { now } = options;
  return deps.db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, attemptId)).for("update");
    if (!attempt) return "missing" as const;
    const intent = await lockIntent(tx, attempt.intentId);
    const check = { at: now.toISOString(), source: options.source, status: result.providerStatus ?? result.status, amountMinor: result.amountMinor?.toString() ?? null, currency: result.currency };
    const checks = [...(attempt.checks as object[]), check];
    const reported = { paidAmountMinor: result.amountMinor, paidCurrency: result.currency, channel: result.channel, gatewayResponse: result.gatewayResponse?.slice(0, 500) ?? null };

    if (result.status === "success") {
      if (attempt.status === "SUCCEEDED") {
        await tx.update(schema.paymentAttempts).set({ checks }).where(eq(schema.paymentAttempts.id, attempt.id));
        return "unchanged" as const;
      }
      // Money was taken, whatever the attempt looked like before: it's recorded as paid (PAY-FR-010).
      await tx
        .update(schema.paymentAttempts)
        .set({ status: "SUCCEEDED", ...reported, paidAt: result.paidAt ?? now, finishedAt: now, checks })
        .where(eq(schema.paymentAttempts.id, attempt.id));
      const succeeded = { ...attempt, status: "SUCCEEDED" as const };
      const expected = { amountMinor: intent.amountMinor.toString(), currency: intent.currency };
      if (intent.succeededAttemptId && intent.succeededAttemptId !== attempt.id) {
        await openReview(tx, intent, succeeded, "DUPLICATE_PAYMENT", { ...expected, firstAttemptId: intent.succeededAttemptId, reportedAmountMinor: result.amountMinor?.toString() ?? null });
        return "duplicate" as const;
      }
      if (result.amountMinor !== intent.amountMinor || result.currency !== intent.currency.trim()) {
        await openReview(tx, intent, succeeded, "AMOUNT_MISMATCH", { ...expected, reportedAmountMinor: result.amountMinor?.toString() ?? null, reportedCurrency: result.currency });
        return "mismatch" as const;
      }
      if (intent.status !== "OPEN" && intent.status !== "PROCESSING") {
        // Paid after a staff review opened or the checkout closed: staff decide (TECH-01 §4).
        await openReview(tx, intent, succeeded, "UNCLEAR_RESULT", { ...expected, why: `Paid while the intent was ${intent.status}` });
        return "review" as const;
      }
      await tx
        .update(schema.paymentIntents)
        .set({ status: "SUCCEEDED", succeededAttemptId: attempt.id, version: sql`${schema.paymentIntents.version} + 1` })
        .where(eq(schema.paymentIntents.id, intent.id));
      await onIntentSucceeded(tx, intent, attempt.id, now, deps.notify, options.requestId ?? `payment_${options.source}`);
      await recordAudit(tx, null, {
        action: "payment.succeeded",
        summary: `Payment received through ${options.source === "webhook" ? "a verified webhook" : "a payment check"}`,
        recordType: "payment_intent",
        recordId: intent.id,
        recordLabel: attempt.reference,
        after: { amountMinor: expected.amountMinor, currency: expected.currency, channel: result.channel },
      });
      return "succeeded" as const;
    }

    const finished = attempt.status === "SUCCEEDED" || attempt.status === "FAILED" || attempt.status === "ABANDONED";
    const tooEarly = result.status === "abandoned" && !options.finalCheck && now.getTime() - attempt.createdAt.getTime() < ABANDONED_FINAL_AFTER_MS;
    if (finished || tooEarly || result.status === "pending" || result.status === "not_found") {
      const unclear = !finished && options.finalCheck && (attempt.status === "PENDING" || attempt.status === "CREATED");
      await tx
        .update(schema.paymentAttempts)
        .set({ checks, ...(unclear ? { status: "UNKNOWN" as const } : {}) })
        .where(eq(schema.paymentAttempts.id, attempt.id));
      if (unclear) {
        await openReview(tx, intent, attempt, "UNCLEAR_RESULT", { amountMinor: intent.amountMinor.toString(), currency: intent.currency, why: "No final answer from Paystack after 48 hours" });
        return "unknown" as const;
      }
      return "unchanged" as const;
    }

    // Failed or abandoned: the customer can try again (TECH-05 §6).
    await tx
      .update(schema.paymentAttempts)
      .set({ status: result.status === "failed" ? "FAILED" : "ABANDONED", ...reported, finishedAt: now, checks, failureMessage: result.status === "failed" ? "Payment failed — try again" : "Payment wasn't completed" })
      .where(eq(schema.paymentAttempts.id, attempt.id));
    await reopenIfIdle(tx, intent.id, intent.installmentId);
    return result.status === "failed" ? ("failed" as const) : ("abandoned" as const);
  });
}

/** payment.check: asks Paystack about one attempt at its scheduled time. */
export async function checkPaymentAttempt(deps: Pick<PaymentDeps, "db" | "gateway"> & ResultDeps, attemptId: string, check: number, now = new Date()) {
  const [attempt] = await deps.db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, attemptId));
  if (!attempt || attempt.status === "SUCCEEDED" || attempt.status === "FAILED" || attempt.status === "ABANDONED") return "skipped" as const;
  // Retried by the queue until the key is back; the result is never guessed (PAY-FR-009).
  if (!deps.gateway) throw new Error("Payments aren't set up here: no Paystack key");
  const result = await deps.gateway.verify(attempt.reference);
  return applyResult(deps, attemptId, result, { source: "check", now, finalCheck: check >= CHECK_SCHEDULE_SECONDS.length });
}

/**
 * The Paystack webhook (TECH-02 §9): checks the signature against the raw
 * body, saves the event once, and queues the follow-up. Returns false for a
 * forged or unreadable request.
 */
export async function receivePaystackWebhook(deps: Pick<PaymentDeps, "db" | "jobs" | "gateway">, rawBody: Buffer, signature: string | undefined, requestId: string) {
  if (!deps.gateway || !deps.gateway.verifyWebhook(rawBody, signature)) return false;
  let body: { event?: unknown; data?: { id?: unknown; reference?: unknown; transaction_reference?: unknown } };
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return false;
  }
  const event = typeof body.event === "string" ? body.event.slice(0, 100) : "unknown";
  // Charge events carry the transaction's reference; refund events carry it as transaction_reference (T13-05).
  const rawReference = body.data?.reference ?? body.data?.transaction_reference;
  const reference = typeof rawReference === "string" ? rawReference.slice(0, 200) : null;
  const providerId = body.data?.id !== undefined ? String(body.data.id) : createHash("sha256").update(rawBody).digest("hex");
  await deps.db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(schema.paystackEvents)
      .values({ eventKey: `${event}:${providerId}`, event, reference, rawBody: rawBody.toString("utf8") })
      .onConflictDoNothing()
      .returning({ id: schema.paystackEvents.id });
    // A resent event is already saved: nothing more to do.
    if (saved && reference && (event.startsWith("charge.") || event.startsWith("refund."))) await deps.jobs.send("payment.verify", { v: 1, requestId, eventId: saved.id }, { tx });
  });
  return true;
}

/** payment.verify: confirms a webhook's transaction (or refund, T13-05) with Paystack, then applies it. */
export async function processPaystackEvent(deps: Pick<PaymentDeps, "db" | "gateway"> & ResultDeps, eventId: string, now = new Date()) {
  const [event] = await deps.db.select().from(schema.paystackEvents).where(eq(schema.paystackEvents.id, eventId));
  if (!event || event.processedAt) return "skipped" as const;
  const [attempt] = event.reference ? await deps.db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, event.reference)) : [];
  let outcome: string = "not ours";
  if (event.event.startsWith("refund.")) {
    outcome = await confirmRefundEvent(deps, event, now);
  } else if (attempt) {
    if (!deps.gateway) throw new Error("Payments aren't set up here: no Paystack key");
    outcome = await applyResult(deps, attempt.id, await deps.gateway.verify(attempt.reference), { source: "webhook", now });
  }
  await deps.db.update(schema.paystackEvents).set({ processedAt: now }).where(eq(schema.paystackEvents.id, eventId));
  return outcome;
}

/** Privacy (T15-03): the person's attempts, through the checkouts and quotes they paid for. */
const subjectAttempts = (db: Tx) =>
  db
    .select({ attempt: schema.paymentAttempts, intent: schema.paymentIntents })
    .from(schema.paymentAttempts)
    .innerJoin(schema.paymentIntents, eq(schema.paymentIntents.id, schema.paymentAttempts.intentId))
    .innerJoin(schema.installments, eq(schema.installments.id, schema.paymentIntents.installmentId))
    .innerJoin(schema.paymentSchedules, eq(schema.paymentSchedules.id, schema.installments.scheduleId))
    .leftJoin(schema.checkouts, eq(schema.checkouts.id, schema.paymentSchedules.checkoutId))
    .leftJoin(schema.quoteVersions, eq(schema.quoteVersions.id, schema.paymentSchedules.quoteVersionId))
    .leftJoin(schema.quotes, eq(schema.quotes.id, schema.quoteVersions.quoteId));

const ofSubject = (subject: PersonSubject) => or(ofPerson(subject, schema.checkouts.customerId, schema.checkouts.ownerUserId), ofPerson(subject, schema.quotes.customerId))!;

/** A payment being confirmed (or waiting for staff) can't lose the contact details its order will be made from. */
export async function paymentBlocker(db: Tx, subject: PersonSubject) {
  const [busy] = await subjectAttempts(db)
    .where(and(ofSubject(subject), inArray(schema.paymentIntents.status, ["PROCESSING", "REVIEW_REQUIRED"])))
    .limit(1);
  return busy ? { code: "PAYMENT_IN_PROGRESS" as const, message: "A payment is being confirmed. Try again when it has finished." } : null;
}

/** Privacy export (T15-03): references and results only; Paystack's raw bodies are not exported. */
export async function paymentAttemptsForPerson(db: Database, subject: PersonSubject) {
  const rows = await subjectAttempts(db).where(ofSubject(subject)).orderBy(schema.paymentAttempts.createdAt);
  return rows.map(({ attempt }) => ({ reference: attempt.reference, status: attempt.status, amountMinor: attempt.amountMinor, currency: attempt.currency, channel: attempt.channel, createdAt: attempt.createdAt, paidAt: attempt.paidAt }));
}

/** Privacy erasure (T15-03): Paystack's saved events keep their row and key; the customer block inside the body goes. Attempts hold no contact data. */
export async function erasePaymentEvents(tx: Tx, subject: PersonSubject) {
  const rows = await subjectAttempts(tx).where(ofSubject(subject));
  const references = rows.map(({ attempt }) => attempt.reference);
  if (!references.length) return;
  const events = await tx.select({ id: schema.paystackEvents.id, rawBody: schema.paystackEvents.rawBody }).from(schema.paystackEvents).where(inArray(schema.paystackEvents.reference, references));
  for (const event of events) await tx.update(schema.paystackEvents).set({ rawBody: scrubJsonText(event.rawBody) }).where(eq(schema.paystackEvents.id, event.id));
}
