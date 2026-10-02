import { z } from "zod";
import { customerPaymentStatusSchema, paymentChannelSchema } from "./payments.js";
import { paymentSummarySchema } from "./quotes.js";

/*
 * Orders, receipts and the payments admin (T04-05; COM-FR-082, 085,
 * PAY-FR-006, OPS-FR-041, 044–047).
 */

const isoDate = z.iso.datetime();
const minor = z.string();

export const orderItemStatusSchema = z.enum([
  "AWAITING_PREREQUISITE",
  "QUEUED",
  "IN_PRODUCTION",
  "QUALITY_CHECK",
  "READY_AWAITING_RELEASE",
  "READY_TO_DISPATCH",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
]);

export const receiptSummarySchema = z.object({
  id: z.string(),
  number: z.string(),
  amountMinor: minor,
  currency: z.enum(["NGN", "USD"]),
  paidAt: isoDate,
  channel: z.string().nullable(),
  paystackReference: z.string(),
});

/** What the customer sees of their order: the confirmation (COM-FR-085). Tracking arrives with T07-03. */
export const orderSchema = z.object({
  id: z.string(),
  number: z.string(),
  placedAt: isoDate,
  paymentStatus: customerPaymentStatusSchema.nullable(),
  items: z.array(
    z.object({
      productName: z.string(),
      summary: z.string(),
      quantity: z.number().int(),
      totalMinor: minor,
      status: orderItemStatusSchema,
      leadDays: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
    }),
  ),
  totals: z.object({ goodsMinor: minor, deliveryMinor: minor.nullable(), vatMinor: minor, totalMinor: minor, vatRateBps: z.number().int() }),
  currency: z.enum(["NGN", "USD"]),
  contactName: z.string(),
  deliverTo: z.string().nullable(),
  receipts: z.array(receiptSummarySchema),
  /** For an order from a quote: its payment schedule (PAY-FR-003); null for a paid checkout. */
  payments: paymentSummarySchema.nullable(),
  quote: z.object({ id: z.string(), reference: z.string(), version: z.number().int() }).nullable(),
});
export type Order = z.infer<typeof orderSchema>;

/** The receipt page: everything printed on the receipt, from the receipt record (TECH-05 §9). */
export const receiptSchema = receiptSummarySchema.extend({
  orderNumber: z.string().nullable(),
  payer: z.object({ name: z.string(), email: z.string() }),
  lines: z.array(z.object({ label: z.string(), quantity: z.number().int().nullable(), totalMinor: minor })),
  totals: z.object({ goodsMinor: minor, deliveryMinor: minor.nullable(), vatMinor: minor, totalMinor: minor, vatRateBps: z.number().int() }).nullable(),
});
export type Receipt = z.infer<typeof receiptSchema>;

// ---- Admin -------------------------------------------------------------

export const attemptStatusSchema = z.enum(["CREATED", "PENDING", "SUCCEEDED", "FAILED", "ABANDONED", "UNKNOWN"]);
export const intentStatusSchema = z.enum(["OPEN", "PROCESSING", "SUCCEEDED", "REVIEW_REQUIRED", "CANCELLED"]);
export const reviewReasonSchema = z.enum(["UNCLEAR_RESULT", "AMOUNT_MISMATCH", "DUPLICATE_PAYMENT", "PAID_PARTICIPANT_REMOVED"]);

/** One row of the payments list (Pen 109): an attempt and what it was for. */
export const adminPaymentRowSchema = z.object({
  attemptId: z.string(),
  intentId: z.string(),
  reference: z.string(),
  /** Order number, or the checkout when no order exists yet. */
  forLabel: z.string(),
  customer: z.string(),
  amountMinor: minor,
  currency: z.string(),
  attemptStatus: attemptStatusSchema,
  channel: z.string().nullable(),
  customerSees: customerPaymentStatusSchema.nullable(),
  createdAt: isoDate,
});
export const adminPaymentListSchema = z.object({
  items: z.array(adminPaymentRowSchema),
  nextCursor: z.string().nullable(),
  openReviews: z.number().int(),
  paymentsPaused: z.boolean(),
});
export type AdminPaymentList = z.infer<typeof adminPaymentListSchema>;

/** Intent detail (Pen 97): attempts, Paystack events, checks, receipt and history (OPS-FR-045). */
export const adminIntentSchema = z.object({
  id: z.string(),
  status: intentStatusSchema,
  amountMinor: minor,
  currency: z.string(),
  forLabel: z.string(),
  orderId: z.string().nullable(),
  installment: z.object({ label: z.string(), position: z.number().int(), of: z.number().int(), status: z.string() }),
  customer: z.string(),
  customerSees: customerPaymentStatusSchema.nullable(),
  succeededAttemptReference: z.string().nullable(),
  attempts: z.array(
    z.object({
      id: z.string(),
      reference: z.string(),
      status: attemptStatusSchema,
      channel: z.string().nullable(),
      amountMinor: minor,
      paidAmountMinor: minor.nullable(),
      paidCurrency: z.string().nullable(),
      gatewayResponse: z.string().nullable(),
      createdAt: isoDate,
      finishedAt: isoDate.nullable(),
      checks: z.array(z.object({ at: z.string(), source: z.string(), status: z.string(), amountMinor: z.string().nullable(), currency: z.string().nullable() })),
    }),
  ),
  events: z.array(z.object({ id: z.string(), event: z.string(), reference: z.string().nullable(), receivedAt: isoDate, processedAt: isoDate.nullable() })),
  reviews: z.array(z.object({ id: z.string(), reason: reviewReasonSchema, status: z.enum(["OPEN", "RESOLVED"]) })),
  receipt: receiptSummarySchema.nullable(),
  history: z.array(z.object({ action: z.string(), summary: z.string(), actorLabel: z.string(), occurredAt: isoDate })),
});
export type AdminIntent = z.infer<typeof adminIntentSchema>;

/** A payment review (Pen 99): what happened, and the decision (OPS-FR-046). */
export const adminReviewSchema = z.object({
  id: z.string(),
  intentId: z.string(),
  reason: reviewReasonSchema,
  status: z.enum(["OPEN", "RESOLVED"]),
  forLabel: z.string(),
  customer: z.string(),
  details: z.record(z.string(), z.unknown()),
  attempts: z.array(z.object({ id: z.string(), reference: z.string(), status: attemptStatusSchema, amountMinor: minor, paidAmountMinor: minor.nullable(), channel: z.string().nullable(), credited: z.boolean() })),
  createdAt: isoDate,
  resolution: z.enum(["SUCCEEDED", "OPEN"]).nullable(),
  note: z.string().nullable(),
  resolvedBy: z.string().nullable(),
  resolvedAt: isoDate.nullable(),
});
export type AdminReview = z.infer<typeof adminReviewSchema>;
export const adminReviewListSchema = z.object({ items: z.array(adminReviewSchema) });

export const resolveReviewSchema = z.discriminatedUnion("resolution", [
  /** Keep the payment: the named successful attempt satisfies the intent. */
  z.object({ resolution: z.literal("SUCCEEDED"), attemptId: z.string().uuid(), note: z.string().trim().min(1, "Add a decision note").max(2000) }),
  /** No payment counts: the intent can be paid again. */
  z.object({ resolution: z.literal("OPEN"), note: z.string().trim().min(1, "Add a decision note").max(2000) }),
]);
export type ResolveReview = z.infer<typeof resolveReviewSchema>;

/** What staff confirm the Paystack account supports (OPS-FR-047). */
export const accountSupportsSchema = z.object({
  internationalPayments: z.boolean(),
  americanExpress: z.boolean(),
  usd: z.boolean(),
  applePay: z.boolean(),
});

export const PAYSTACK_CHECKLIST = [
  { key: "businessVerified", label: "Business verified on Paystack (Registered Business)", where: "Paystack dashboard" },
  { key: "internationalApproved", label: "International payments requested and approved", where: "Settings → Preferences" },
  { key: "americanExpress", label: "American Express turned on (if wanted)", where: "Settings → Preferences" },
  { key: "usdDomiciliary", label: "USD enabled + Zenith Bank USD domiciliary account", where: "Only if USD quotes are wanted" },
  { key: "applePay", label: "Apple Pay enabled (if offered)", where: "Paystack dashboard" },
  { key: "webhooks", label: "Webhook URL set for live and test separately", where: "https://<api domain>/v1/webhooks/paystack" },
  { key: "separateKeys", label: "Separate test and live keys in hosting secret store", where: "Hosting secrets (never in the browser)" },
] as const;
export type ChecklistKey = (typeof PAYSTACK_CHECKLIST)[number]["key"];

/** Payment settings (Pen 100; TECH-05 §13). */
export const paymentSettingsSchema = z.object({
  onlinePayments: z.boolean(),
  channels: z.array(paymentChannelSchema),
  internationalCards: z.boolean(),
  usdEnabled: z.boolean(),
  accountSupports: accountSupportsSchema,
  accountConfirmedAt: isoDate.nullable(),
  accountConfirmedBy: z.string().nullable(),
  checklist: z.record(z.string(), z.boolean()),
  version: z.number().int(),
  /** Attempts still being checked while payments are paused. */
  pendingAttempts: z.number().int(),
  providerConfigured: z.boolean(),
  recentChanges: z.array(z.object({ summary: z.string(), actorLabel: z.string(), occurredAt: isoDate })),
});
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

export const paymentSettingsInputSchema = z.object({
  version: z.number().int(),
  onlinePayments: z.boolean(),
  channels: z.array(paymentChannelSchema).min(1, "Switch on at least one method"),
  internationalCards: z.boolean(),
  usdEnabled: z.boolean(),
  accountSupports: accountSupportsSchema,
  checklist: z.record(z.string(), z.boolean()),
});
export type PaymentSettingsInput = z.infer<typeof paymentSettingsInputSchema>;
