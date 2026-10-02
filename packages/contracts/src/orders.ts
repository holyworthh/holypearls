import { z } from "zod";
import { customerPaymentStatusSchema, paymentChannelSchema } from "./payments.js";
import { changeRequestSchema, orderProofSummarySchema } from "./proofs.js";
import { paymentSummarySchema } from "./quotes.js";
import { customerProblemSchema, customerShipmentSchema } from "./shipments.js";

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

/** PRD-00 §8 order summary: worked out from items, holds, installments and shipments, never edited. */
export const orderSummaryStatusSchema = z.enum([
  "CONFIRMED",
  "AWAITING_PREREQUISITE",
  "IN_PRODUCTION",
  "PARTIALLY_READY",
  "BALANCE_REQUIRED",
  "READY_TO_DISPATCH",
  "ON_HOLD",
  "PARTIALLY_DISPATCHED",
  "DISPATCHED",
  "PARTIALLY_DELIVERED",
  "DELIVERED",
  "CANCELLED",
]);
export type OrderSummaryStatus = z.infer<typeof orderSummaryStatusSchema>;

/** What a customer sees of an open hold (FUL-FR-013): never the internal note. */
export const customerHoldSchema = z.object({
  explanation: z.string(),
  whoActs: z.enum(["CUSTOMER", "HOLYPEARLS"]),
  timingImpactDays: z.number().int().nullable(),
  since: isoDate,
});

/** Find my order (FUL-FR-033): the order number and the email used at checkout. */
export const findOrderSchema = z.object({
  number: z.string().trim().min(1, "Enter your order number").max(40),
  email: z.string().trim().min(1, "Enter the email you used").max(254).email("Enter the email you used, like name@example.com"),
});
export const findOrderResultSchema = z.object({ sentTo: z.string() });

export const cancelOrderSchema = z.object({ reason: z.string().trim().max(500).optional() });
export const staffCancelOrderSchema = z.object({ reason: z.string().trim().min(1, "Say why the order is cancelled").max(500) });

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
  /** The summary at the top of the order (T07-01). */
  summaryStatus: orderSummaryStatusSchema,
  items: z.array(
    z.object({
      productName: z.string(),
      summary: z.string(),
      quantity: z.number().int(),
      totalMinor: minor,
      status: orderItemStatusSchema,
      /** An open hold shows the item as ON_HOLD (PRD-00 §8). */
      hold: customerHoldSchema.nullable(),
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
  /** Each item's proof (T06-01). */
  proofs: z.array(orderProofSummarySchema),
  /** Changes asked for after approval (T06-03) and scope changes (T07-03). */
  changeRequests: z.array(changeRequestSchema),
  /** Set once the order is cancelled (FUL-FR-050). */
  cancellation: z.object({ at: isoDate, by: z.enum(["CUSTOMER", "STAFF"]), refundDueMinor: minor }).nullable(),
  /** Whether the customer can cancel online now, and if not why (T07-03). */
  cancel: z.object({ allowed: z.boolean(), blockedBy: z.enum(["STARTED", "PAYMENT_IN_PROGRESS", "CANCELLED", "DISPATCHED"]).nullable(), refundMinor: minor }),
  /** Scope changes go through a change request for orders from a quote (FUL-FR-052). */
  canChangeScope: z.boolean(),
  /** Shipments with their items and status history (T08-01, FUL-FR-031). */
  shipments: z.array(customerShipmentSchema),
  /** Problems reported on this order (FUL-FR-070). */
  problems: z.array(customerProblemSchema),
  /** Each item can be reordered: exactly or with changes (FUL-FR-060–062). Quote lines can't. */
  reorderable: z.array(z.number().int()),
  /** The detailed activity history, newest first; it can't be edited (FUL-FR-040). */
  activity: z.array(z.object({ at: isoDate, text: z.string() })),
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
