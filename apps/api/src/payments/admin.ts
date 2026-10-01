import type { AdminIntent, AdminPaymentList, AdminReview, PaymentChannel, PaymentSettings, PaymentSettingsInput, ResolveReview } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, ilike, inArray, or, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { requireRecentMfa } from "../identity/actor.js";
import type { OrderEmailDeps } from "../orders/orders.js";
import { recordAudit } from "../platform/audit.js";
import { afterCursor, newestFirst, pageOf } from "../platform/cursor.js";
import { onIntentSucceeded, paymentSettings } from "./payments.js";
import { customerPaymentStatus } from "./status.js";

/*
 * Payments admin (T04-05; OPS-FR-041, 044–047; Pen 97, 99, 100, 109).
 * Viewing needs PAYMENT_VIEW; deciding reviews and changing settings need
 * PAYMENT_MANAGE, and settings also a recent authenticator check. Every
 * decision is audited, and no Paystack record is ever changed or deleted to
 * tidy the history (TECH-05 §7).
 */

type Attempt = typeof schema.paymentAttempts.$inferSelect;

/** What each intent was for, who the customer is, and what they see: one query for a set of intents. */
async function contextOf(db: Database, intentIds: string[]) {
  if (!intentIds.length) return new Map<string, { forLabel: string; customer: string; orderId: string | null; customerSees: AdminIntent["customerSees"]; installmentStatus: string; label: string; position: number; of: number }>();
  const rows = await db
    .select({
      intentId: schema.paymentIntents.id,
      installmentStatus: schema.installments.status,
      label: schema.installments.label,
      position: schema.installments.position,
      of: sql<number>`(select count(*)::int from installments i2 where i2.schedule_id = ${schema.installments.scheduleId})`,
      checkoutId: schema.paymentSchedules.checkoutId,
      orderId: schema.orders.id,
      orderNumber: schema.orders.number,
      customerName: schema.customers.name,
      customerEmail: schema.customers.email,
      latest: sql<string | null>`(select a.status from payment_attempts a where a.intent_id = ${schema.paymentIntents.id} order by a.created_at desc limit 1)`,
      openReview: sql<boolean>`exists (select 1 from payment_reviews r where r.intent_id = ${schema.paymentIntents.id} and r.status = 'OPEN')`,
    })
    .from(schema.paymentIntents)
    .innerJoin(schema.installments, eq(schema.installments.id, schema.paymentIntents.installmentId))
    .innerJoin(schema.paymentSchedules, eq(schema.paymentSchedules.id, schema.installments.scheduleId))
    .leftJoin(schema.checkouts, eq(schema.checkouts.id, schema.paymentSchedules.checkoutId))
    .leftJoin(schema.orders, eq(schema.orders.checkoutId, schema.paymentSchedules.checkoutId))
    .leftJoin(schema.customers, eq(schema.customers.id, schema.checkouts.customerId))
    .where(inArray(schema.paymentIntents.id, intentIds));
  return new Map(
    rows.map((row) => [
      row.intentId,
      {
        forLabel: row.orderNumber ?? `Checkout ${row.checkoutId?.slice(0, 8) ?? "—"}`,
        customer: row.customerName ?? row.customerEmail ?? "Unknown customer",
        orderId: row.orderId,
        installmentStatus: row.installmentStatus,
        label: row.label,
        position: row.position,
        of: row.of,
        customerSees: customerPaymentStatus({
          installments: [{ position: row.position, status: row.installmentStatus, latestAttempt: (row.latest as Attempt["status"] | null) ?? null }],
          needsResolution: row.openReview,
        }),
      },
    ]),
  );
}

/** The payments list (Pen 109, OPS-FR-041): every attempt, newest first, filterable by status and searchable. */
export async function listPayments(db: Database, query: { status?: string; q?: string; cursor?: string; limit?: number }): Promise<AdminPaymentList> {
  const limit = Math.min(query.limit ?? 25, 100);
  const filters = [afterCursor(schema.paymentAttempts.createdAt, schema.paymentAttempts.id, query.cursor)];
  if (query.status && ["CREATED", "PENDING", "SUCCEEDED", "FAILED", "ABANDONED", "UNKNOWN"].includes(query.status)) {
    filters.push(eq(schema.paymentAttempts.status, query.status as Attempt["status"]));
  }
  const q = query.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
    filters.push(
      or(
        ilike(schema.paymentAttempts.reference, like),
        sql`exists (select 1 from installments i join payment_schedules s on s.id = i.schedule_id join payment_intents pi on pi.installment_id = i.id
          left join orders o on o.checkout_id = s.checkout_id left join checkouts c on c.id = s.checkout_id left join customers cu on cu.id = c.customer_id
          where pi.id = ${schema.paymentAttempts.intentId} and (o.number ilike ${like} or cu.email ilike ${like} or cu.name ilike ${like}))`,
      ),
    );
  }
  const rows = await db
    .select()
    .from(schema.paymentAttempts)
    .where(and(...filters))
    .orderBy(...newestFirst(schema.paymentAttempts.createdAt, schema.paymentAttempts.id))
    .limit(limit + 1);
  const { page, nextCursor } = pageOf(rows, limit, (row) => ({ at: row.createdAt, id: row.id }));
  const context = await contextOf(db, [...new Set(page.map((row) => row.intentId))]);
  const [reviews] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.paymentReviews).where(eq(schema.paymentReviews.status, "OPEN"));
  const settings = await paymentSettings(db);
  return {
    items: page.map((row) => {
      const about = context.get(row.intentId);
      return {
        attemptId: row.id,
        intentId: row.intentId,
        reference: row.reference,
        forLabel: about?.forLabel ?? "—",
        customer: about?.customer ?? "—",
        amountMinor: row.amountMinor.toString(),
        currency: row.currency,
        attemptStatus: row.status,
        channel: row.channel,
        customerSees: about?.customerSees ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    }),
    nextCursor,
    openReviews: reviews?.n ?? 0,
    paymentsPaused: !settings.onlinePayments,
  };
}

/** One intent with every attempt, check, Paystack event, review, receipt and history entry (Pen 97, OPS-FR-045). */
export async function getIntent(db: Database, id: string): Promise<AdminIntent> {
  const [intent] = await db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, id));
  if (!intent) throw new AppError("NOT_FOUND");
  const about = (await contextOf(db, [id])).get(id)!;
  const attempts = await db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.intentId, id)).orderBy(desc(schema.paymentAttempts.createdAt));
  const references = attempts.map((attempt) => attempt.reference);
  const events = references.length ? await db.select().from(schema.paystackEvents).where(inArray(schema.paystackEvents.reference, references)).orderBy(desc(schema.paystackEvents.receivedAt)) : [];
  const reviews = await db.select().from(schema.paymentReviews).where(eq(schema.paymentReviews.intentId, id)).orderBy(desc(schema.paymentReviews.createdAt));
  const [receipt] = await db.select().from(schema.receipts).where(eq(schema.receipts.intentId, id)).orderBy(asc(schema.receipts.createdAt)).limit(1);
  const history = await db.select().from(schema.auditLog).where(eq(schema.auditLog.recordId, id)).orderBy(desc(schema.auditLog.occurredAt)).limit(50);
  return {
    id: intent.id,
    status: intent.status,
    amountMinor: intent.amountMinor.toString(),
    currency: intent.currency,
    forLabel: about.forLabel,
    orderId: about.orderId,
    installment: { label: about.label, position: about.position, of: about.of, status: about.installmentStatus },
    customer: about.customer,
    customerSees: about.customerSees,
    succeededAttemptReference: attempts.find((attempt) => attempt.id === intent.succeededAttemptId)?.reference ?? null,
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      reference: attempt.reference,
      status: attempt.status,
      channel: attempt.channel,
      amountMinor: attempt.amountMinor.toString(),
      paidAmountMinor: attempt.paidAmountMinor?.toString() ?? null,
      paidCurrency: attempt.paidCurrency,
      gatewayResponse: attempt.gatewayResponse,
      createdAt: attempt.createdAt.toISOString(),
      finishedAt: attempt.finishedAt?.toISOString() ?? null,
      checks: attempt.checks as AdminIntent["attempts"][number]["checks"],
    })),
    events: events.map((event) => ({ id: event.id, event: event.event, reference: event.reference, receivedAt: event.receivedAt.toISOString(), processedAt: event.processedAt?.toISOString() ?? null })),
    reviews: reviews.map((review) => ({ id: review.id, reason: review.reason, status: review.status })),
    receipt: receipt
      ? { id: receipt.id, number: receipt.number, amountMinor: receipt.amountMinor.toString(), currency: receipt.currency as "NGN" | "USD", paidAt: receipt.paidAt.toISOString(), channel: receipt.channel, paystackReference: receipt.paystackReference }
      : null,
    history: history.map((entry) => ({ action: entry.action, summary: entry.summary, actorLabel: entry.actorLabel, occurredAt: entry.occurredAt.toISOString() })),
  };
}

async function reviewView(db: Database, review: typeof schema.paymentReviews.$inferSelect): Promise<AdminReview> {
  const [intent] = await db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, review.intentId));
  const about = (await contextOf(db, [review.intentId])).get(review.intentId)!;
  const attempts = await db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.intentId, review.intentId)).orderBy(asc(schema.paymentAttempts.createdAt));
  let resolvedBy: string | null = null;
  if (review.resolvedByUserId) {
    const [staff] = await db.select({ name: schema.staffProfiles.displayName }).from(schema.staffProfiles).where(eq(schema.staffProfiles.userId, review.resolvedByUserId));
    resolvedBy = staff?.name ?? null;
  }
  return {
    id: review.id,
    intentId: review.intentId,
    reason: review.reason,
    status: review.status,
    forLabel: about.forLabel,
    customer: about.customer,
    details: review.details as Record<string, unknown>,
    attempts: attempts
      .filter((attempt) => attempt.status === "SUCCEEDED" || attempt.id === review.attemptId)
      .map((attempt) => ({
        id: attempt.id,
        reference: attempt.reference,
        status: attempt.status,
        amountMinor: attempt.amountMinor.toString(),
        paidAmountMinor: attempt.paidAmountMinor?.toString() ?? null,
        channel: attempt.channel,
        credited: intent?.succeededAttemptId === attempt.id,
      })),
    createdAt: review.createdAt.toISOString(),
    resolution: (review.resolution as "SUCCEEDED" | "OPEN" | null) ?? null,
    note: review.note,
    resolvedBy,
    resolvedAt: review.resolvedAt?.toISOString() ?? null,
  };
}

/** The review queue (Pen 99, OPS-FR-046): open reviews oldest first, or resolved ones newest first. */
export async function listReviews(db: Database, status: "OPEN" | "RESOLVED" = "OPEN") {
  const rows = await db
    .select()
    .from(schema.paymentReviews)
    .where(eq(schema.paymentReviews.status, status))
    .orderBy(status === "OPEN" ? asc(schema.paymentReviews.createdAt) : desc(schema.paymentReviews.resolvedAt))
    .limit(100);
  return { items: await Promise.all(rows.map((row) => reviewView(db, row))) };
}

export async function getReview(db: Database, id: string) {
  const [row] = await db.select().from(schema.paymentReviews).where(eq(schema.paymentReviews.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return reviewView(db, row);
}

/**
 * A staff decision on a review (TECH-01 §4: REVIEW_REQUIRED → SUCCEEDED or
 * OPEN, audited). Keeping a payment credits the chosen successful attempt; if
 * the intent wasn't credited yet, the order, receipt and email follow, as for
 * any payment. Returning to OPEN means no payment counts; it isn't allowed
 * once an order exists (refund the extra payment instead, T13-05).
 */
export async function resolveReview(deps: { db: Database; notify: OrderEmailDeps | null }, actor: ActorContext, id: string, input: ResolveReview) {
  const now = actor.now;
  await deps.db.transaction(async (tx) => {
    const [review] = await tx.select().from(schema.paymentReviews).where(eq(schema.paymentReviews.id, id)).for("update");
    if (!review) throw new AppError("NOT_FOUND");
    if (review.status !== "OPEN") throw new AppError("CONFLICT", { message: "This review was already resolved.", context: { reason: "REVIEW_RESOLVED" } });
    const [intent] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, review.intentId)).for("update");
    const before = { intent: intent!.status, succeededAttemptId: intent!.succeededAttemptId };

    if (input.resolution === "SUCCEEDED") {
      const [attempt] = await tx.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, input.attemptId));
      if (!attempt || attempt.intentId !== intent!.id || attempt.status !== "SUCCEEDED") {
        throw new AppError("VALIDATION_FAILED", { fieldErrors: { attemptId: "Choose a successful payment for this intent" } });
      }
      if (intent!.succeededAttemptId && intent!.succeededAttemptId !== attempt.id) {
        throw new AppError("RULE_FAILED", { message: "Another payment is already credited. Keep that one and refund the extra payment.", context: { reason: "ALREADY_CREDITED" } });
      }
      await tx.update(schema.paymentIntents).set({ status: "SUCCEEDED", succeededAttemptId: attempt.id, version: sql`${schema.paymentIntents.version} + 1` }).where(eq(schema.paymentIntents.id, intent!.id));
      if (!intent!.succeededAttemptId) await onIntentSucceeded(tx, intent!, attempt.id, now, deps.notify, actor.requestId);
    } else {
      if (intent!.succeededAttemptId) {
        throw new AppError("RULE_FAILED", { message: "A payment is already credited and its order exists. Keep it and refund any extra payment.", context: { reason: "ALREADY_CREDITED" } });
      }
      await tx.update(schema.paymentIntents).set({ status: "OPEN", version: sql`${schema.paymentIntents.version} + 1` }).where(eq(schema.paymentIntents.id, intent!.id));
      await tx.update(schema.installments).set({ status: "DUE" }).where(eq(schema.installments.id, intent!.installmentId));
    }
    // Other open reviews of the same intent are settled by the same decision.
    await tx
      .update(schema.paymentReviews)
      .set({ status: "RESOLVED", resolution: input.resolution, note: input.note, resolvedByUserId: actor.type === "user" ? actor.session.userId : null, resolvedAt: now })
      .where(and(eq(schema.paymentReviews.intentId, intent!.id), eq(schema.paymentReviews.status, "OPEN")));
    await recordAudit(tx, actor, {
      action: "payment.review_resolved",
      summary: input.resolution === "SUCCEEDED" ? `Review resolved: payment kept (${review.reason})` : `Review resolved: returned to open (${review.reason})`,
      recordType: "payment_intent",
      recordId: intent!.id,
      before,
      after: { intent: input.resolution, attemptId: input.resolution === "SUCCEEDED" ? input.attemptId : null, note: input.note },
      permission: "PAYMENT_MANAGE",
    });
  });
  return getReview(deps.db, id);
}

// ---- Settings ----------------------------------------------------------

interface AccountSupports {
  internationalPayments?: boolean;
  americanExpress?: boolean;
  usd?: boolean;
  applePay?: boolean;
  confirmedAt?: string;
  confirmedBy?: string;
}

export async function getPaymentSettings(db: Database, providerConfigured: boolean): Promise<PaymentSettings> {
  const [row] = await db.select().from(schema.paymentSettings).where(eq(schema.paymentSettings.id, 1));
  if (!row) throw new AppError("NOT_FOUND");
  const supports = row.accountSupports as AccountSupports;
  const [pending] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.paymentAttempts).where(inArray(schema.paymentAttempts.status, ["CREATED", "PENDING", "UNKNOWN"]));
  const changes = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, "payment.settings_changed"))
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(5);
  return {
    onlinePayments: row.onlinePayments,
    channels: row.channels as PaymentChannel[],
    internationalCards: row.internationalCards,
    usdEnabled: row.usdEnabled,
    accountSupports: {
      internationalPayments: Boolean(supports.internationalPayments),
      americanExpress: Boolean(supports.americanExpress),
      usd: Boolean(supports.usd),
      applePay: Boolean(supports.applePay),
    },
    accountConfirmedAt: supports.confirmedAt ?? null,
    accountConfirmedBy: supports.confirmedBy ?? null,
    checklist: row.checklist as Record<string, boolean>,
    version: row.version,
    pendingAttempts: pending?.n ?? 0,
    providerConfigured,
    recentChanges: changes.map((entry) => ({ summary: entry.summary, actorLabel: entry.actorLabel, occurredAt: entry.occurredAt.toISOString() })),
  };
}

/** What the change switched, in words, for the audit log and the Recent changes panel. */
function describeChange(before: typeof schema.paymentSettings.$inferSelect, input: PaymentSettingsInput) {
  const parts: string[] = [];
  if (before.onlinePayments !== input.onlinePayments) parts.push(input.onlinePayments ? "Online payments resumed" : "Online payments paused");
  const was = new Set(before.channels);
  for (const channel of input.channels) if (!was.has(channel)) parts.push(`${channel.replace("_", " ")} switched on`);
  for (const channel of before.channels) if (!input.channels.includes(channel as PaymentChannel)) parts.push(`${channel.replace("_", " ")} switched off`);
  if (before.internationalCards !== input.internationalCards) parts.push(`International cards ${input.internationalCards ? "on" : "off"}`);
  if (before.usdEnabled !== input.usdEnabled) parts.push(`USD quotes ${input.usdEnabled ? "on" : "off"}`);
  return parts.length ? parts.join("; ") : "Account details or checklist updated";
}

/**
 * Saves payment settings (TECH-05 §13, OPS-FR-044, 047). High-risk: needs a
 * recent authenticator check. The site never offers what the Paystack account
 * doesn't support: Apple Pay, international cards and USD need staff to
 * confirm the account first.
 */
export async function savePaymentSettings(db: Database, actor: ActorContext, input: PaymentSettingsInput, providerConfigured: boolean) {
  requireRecentMfa(actor);
  const errors: Record<string, string> = {};
  if (input.channels.includes("apple_pay") && !input.accountSupports.applePay) errors.channels = "Apple Pay isn't enabled on the Paystack account, so it can't be switched on";
  if (input.internationalCards && !input.accountSupports.internationalPayments) errors.internationalCards = "International payments aren't approved on the Paystack account yet";
  if (input.usdEnabled && !input.accountSupports.usd) errors.usdEnabled = "USD quotes need USD enabled on Paystack and a Zenith Bank USD account";
  if (Object.keys(errors).length) throw new AppError("VALIDATION_FAILED", { fieldErrors: errors });

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.paymentSettings).where(eq(schema.paymentSettings.id, 1)).for("update");
    if (!before) throw new AppError("NOT_FOUND");
    if (before.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { reason: "STALE_VERSION" } });
    const previous = before.accountSupports as AccountSupports;
    const supportsChanged = ["internationalPayments", "americanExpress", "usd", "applePay"].some((key) => Boolean(previous[key as keyof AccountSupports]) !== input.accountSupports[key as keyof typeof input.accountSupports]);
    const staffName = actor.type === "user" ? (actor.staff?.displayName ?? "Staff") : "Staff";
    const accountSupports: AccountSupports = supportsChanged ? { ...input.accountSupports, confirmedAt: actor.now.toISOString(), confirmedBy: staffName } : { ...previous, ...input.accountSupports };
    await tx
      .update(schema.paymentSettings)
      .set({
        onlinePayments: input.onlinePayments,
        channels: input.channels,
        internationalCards: input.internationalCards,
        usdEnabled: input.usdEnabled,
        accountSupports,
        checklist: input.checklist,
        version: sql`${schema.paymentSettings.version} + 1`,
        updatedByUserId: actor.type === "user" ? actor.session.userId : null,
      })
      .where(eq(schema.paymentSettings.id, 1));
    await recordAudit(tx, actor, {
      action: "payment.settings_changed",
      summary: describeChange(before, input),
      recordType: "payment_settings",
      recordId: null,
      before: { onlinePayments: before.onlinePayments, channels: before.channels, internationalCards: before.internationalCards, usdEnabled: before.usdEnabled, accountSupports: previous },
      after: { onlinePayments: input.onlinePayments, channels: input.channels, internationalCards: input.internationalCards, usdEnabled: input.usdEnabled, accountSupports },
      permission: "PAYMENT_MANAGE",
    });
  });
  return getPaymentSettings(db, providerConfigured);
}
