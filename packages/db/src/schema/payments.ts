import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { amountMinorColumn, createdAt, currencyColumn, idColumn, updatedAt, versionColumn } from "../columns.js";
import { users } from "./identity.js";
import { quoteVersions } from "./quotes.js";
import { checkouts } from "./sales.js";

/*
 * Payments (T04-03, TECH-05 §3–7, statuses in TECH-01 §4). A schedule plans
 * one checkout's (later, one accepted quote's) money as installments; each
 * installment is paid through one intent; every press of Pay is an attempt
 * with its own Paystack reference. Webhooks are kept exactly as received.
 * Nothing here is ever deleted to tidy the history (TECH-05 §7).
 */

/** One row: what staff have switched on (TECH-05 §13). Payments start off. */
export const paymentSettings = pgTable(
  "payment_settings",
  {
    id: smallint("id").primaryKey().default(1),
    onlinePayments: boolean("online_payments").notNull().default(false),
    /** Paystack channels offered, as confirmed on the account: card, bank_transfer, ussd, apple_pay. */
    channels: text("channels").array().notNull().default(sql`'{card,bank_transfer,ussd}'::text[]`),
    internationalCards: boolean("international_cards").notNull().default(false),
    usdEnabled: boolean("usd_enabled").notNull().default(false),
    /** The default schedule for quotes: labelled parts in basis points that add up to 10,000. */
    defaultSchedule: jsonb("default_schedule").notNull().default(sql`'[{"label":"Pay in full","shareBps":10000,"trigger":"ON_ACCEPTANCE"}]'::jsonb`),
    /**
     * What the Paystack account supports, as confirmed by staff (TECH-05 §13, OPS-FR-047):
     * internationalPayments, americanExpress, usd, applePay, with who confirmed and when.
     * The site never offers a method the account doesn't support.
     */
    accountSupports: jsonb("account_supports").notNull().default(sql`'{}'::jsonb`),
    /** The TECH-05 §14 setup checklist: item key to done, as staff-confirmed notes, not live checks. */
    checklist: jsonb("checklist").notNull().default(sql`'{}'::jsonb`),
    version: versionColumn(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (table) => [check("payment_settings_single_row", sql`${table.id} = 1`)],
);

export const paymentSchedules = pgTable(
  "payment_schedules",
  {
    id: idColumn(),
    /** The direct checkout this schedule pays for. Quotes (T05-05) add their own source. */
    checkoutId: uuid("checkout_id").references(() => checkouts.id, { onDelete: "restrict" }),
    /** The accepted quote version this schedule pays for (T05-05). */
    quoteVersionId: uuid("quote_version_id").references(() => quoteVersions.id, { onDelete: "restrict" }),
    currency: currencyColumn(),
    totalMinor: amountMinorColumn("total_minor"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("payment_schedules_checkout_unique").on(table.checkoutId),
    uniqueIndex("payment_schedules_quote_version_unique").on(table.quoteVersionId),
    check("payment_schedules_source", sql`num_nonnulls(${table.checkoutId}, ${table.quoteVersionId}) = 1`),
  ],
);

export const installmentStatus = pgEnum("installment_status", ["NOT_DUE", "DUE", "PROCESSING", "PAID", "CANCELLED"]);

export const installments = pgTable(
  "installments",
  {
    id: idColumn(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => paymentSchedules.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    /** "Pay in full", "Deposit", "Balance", "Milestone 2". */
    label: text("label").notNull(),
    amountMinor: amountMinorColumn(),
    currency: currencyColumn(),
    /** ON_ACCEPTANCE, BEFORE_PRODUCTION, BEFORE_DISPATCH or ON_DATE (TECH-05 §3). */
    trigger: text("trigger").notNull(),
    status: installmentStatus("status").notNull().default("NOT_DUE"),
    /** For ON_DATE: the day it falls due. */
    dueOn: text("due_on"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("installments_schedule_position_unique").on(table.scheduleId, table.position),
    check("installments_amount_positive", sql`${table.amountMinor} > 0`),
    check("installments_trigger", sql`${table.trigger} in ('ON_ACCEPTANCE', 'BEFORE_PRODUCTION', 'BEFORE_DISPATCH', 'ON_DATE')`),
  ],
);

export const paymentIntentStatus = pgEnum("payment_intent_status", ["OPEN", "PROCESSING", "SUCCEEDED", "REVIEW_REQUIRED", "CANCELLED"]);

export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: idColumn(),
    installmentId: uuid("installment_id")
      .notNull()
      .references(() => installments.id, { onDelete: "restrict" }),
    amountMinor: amountMinorColumn(),
    currency: currencyColumn(),
    status: paymentIntentStatus("status").notNull().default("OPEN"),
    /** The one attempt that satisfied this intent; unique, so no second can (TECH-05 §7). */
    succeededAttemptId: uuid("succeeded_attempt_id").references((): AnyPgColumn => paymentAttempts.id, { onDelete: "restrict" }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("payment_intents_installment_unique").on(table.installmentId),
    uniqueIndex("payment_intents_succeeded_attempt_unique").on(table.succeededAttemptId),
    check("payment_intents_amount_positive", sql`${table.amountMinor} > 0`),
    check("payment_intents_succeeded", sql`${table.status} <> 'SUCCEEDED' or ${table.succeededAttemptId} is not null`),
  ],
);

export const paymentAttemptStatus = pgEnum("payment_attempt_status", ["CREATED", "PENDING", "SUCCEEDED", "FAILED", "ABANDONED", "UNKNOWN"]);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: idColumn(),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => paymentIntents.id, { onDelete: "restrict" }),
    /** HPPAY-<uuid>: the Paystack reference (TECH-05 §5). */
    reference: text("reference").notNull(),
    provider: text("provider").notNull().default("paystack"),
    status: paymentAttemptStatus("status").notNull().default("CREATED"),
    /** What we asked Paystack to charge. */
    amountMinor: amountMinorColumn(),
    currency: currencyColumn(),
    /** What Paystack reported, once known (PAY-FR-010). */
    paidAmountMinor: bigint("paid_amount_minor", { mode: "bigint" }),
    paidCurrency: text("paid_currency"),
    channel: text("channel"),
    gatewayResponse: text("gateway_response"),
    accessCode: text("access_code"),
    authorizationUrl: text("authorization_url"),
    /** Every check with Paystack: when, why and what it said (PAY-FR-010). */
    checks: jsonb("checks").notNull().default(sql`'[]'::jsonb`),
    failureMessage: text("failure_message"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("payment_attempts_reference_unique").on(table.reference),
    index("payment_attempts_intent_idx").on(table.intentId, table.createdAt),
    check("payment_attempts_currency", sql`${table.currency} in ('NGN', 'USD')`),
  ],
);

export const paystackEvents = pgTable(
  "paystack_events",
  {
    id: idColumn(),
    /** The event and Paystack's transaction ID: a resend of the same event has the same key (TECH-02 §9). */
    eventKey: text("event_key").notNull(),
    event: text("event").notNull(),
    reference: text("reference"),
    /** The body exactly as Paystack sent it. */
    rawBody: text("raw_body").notNull(),
    receivedAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("paystack_events_key_unique").on(table.eventKey), index("paystack_events_reference_idx").on(table.reference)],
);

export const paymentReviewReason = pgEnum("payment_review_reason", ["UNCLEAR_RESULT", "AMOUNT_MISMATCH", "DUPLICATE_PAYMENT", "PAID_PARTICIPANT_REMOVED"]);
export const paymentReviewStatus = pgEnum("payment_review_status", ["OPEN", "RESOLVED"]);

export const paymentReviews = pgTable(
  "payment_reviews",
  {
    id: idColumn(),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => paymentIntents.id, { onDelete: "restrict" }),
    attemptId: uuid("attempt_id").references(() => paymentAttempts.id, { onDelete: "restrict" }),
    reason: paymentReviewReason("reason").notNull(),
    status: paymentReviewStatus("status").notNull().default("OPEN"),
    /** What the system saw: expected and reported amounts, the provider's words. */
    details: jsonb("details").notNull(),
    /** The staff decision (T04-05): SUCCEEDED or OPEN, with a note. */
    resolution: text("resolution"),
    note: text("note"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // One open case per attempt and reason, so a replayed check never opens a second.
    uniqueIndex("payment_reviews_open_unique").on(table.intentId, table.attemptId, table.reason).where(sql`${table.status} = 'OPEN'`),
    index("payment_reviews_status_idx").on(table.status, table.createdAt),
  ],
);

export const refundStatus = pgEnum("refund_status", ["PENDING", "PROCESSED", "FAILED"]);

/**
 * Refunds (T13-05; TECH-05 §11; OPS-FR-043; Pen 121). Each is a new record
 * linked to the original successful attempt, which is never changed. Status
 * follows Paystack (webhook, then the refund.check job confirms with its API).
 * PENDING and PROCESSED refunds count against what's left on the attempt.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: idColumn(),
    /** RF-0019, from refund_number_seq. */
    number: text("number").notNull(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => paymentAttempts.id, { onDelete: "restrict" }),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => paymentIntents.id, { onDelete: "restrict" }),
    /** The payment review it settles (DUPLICATE_PAYMENT, PAID_PARTICIPANT_REMOVED), when it came from one. */
    reviewId: uuid("review_id").references(() => paymentReviews.id, { onDelete: "restrict" }),
    amountMinor: amountMinorColumn(),
    currency: currencyColumn(),
    /** Shown in the history and sent to Paystack as the merchant note. */
    reason: text("reason").notNull(),
    status: refundStatus("status").notNull().default("PENDING"),
    /** Paystack's refund id; null until Paystack confirms it created the refund. */
    providerRefundId: text("provider_refund_id"),
    providerStatus: text("provider_status"),
    failure: text("failure"),
    /** Every check with Paystack: when, why and what it said. */
    checks: jsonb("checks").notNull().default(sql`'[]'::jsonb`),
    issuedByUserId: uuid("issued_by_user_id").references(() => users.id, { onDelete: "set null" }),
    issuedByName: text("issued_by_name").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("refunds_number_unique").on(table.number),
    uniqueIndex("refunds_provider_unique").on(table.providerRefundId),
    index("refunds_attempt_idx").on(table.attemptId),
    index("refunds_created_idx").on(table.createdAt.desc()),
    check("refunds_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);
