import { z } from "zod";

/** What the customer sees for an order or accepted quote (PRD-00 §8). Worked out, never stored (TECH-01 §4). */
export const customerPaymentStatusSchema = z.enum([
  "NOT_DUE",
  "PAYMENT_DUE",
  "DEPOSIT_DUE",
  "PAYMENT_PENDING",
  "DEPOSIT_PAID",
  "PARTIALLY_PAID",
  "BALANCE_DUE",
  "PAID",
  "PAYMENT_FAILED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "PAYMENT_RESOLUTION_REQUIRED",
]);
export type CustomerPaymentStatus = z.infer<typeof customerPaymentStatusSchema>;

/** Paystack channels staff can switch on (PAY-FR-007). */
export const paymentChannelSchema = z.enum(["card", "bank_transfer", "ussd", "apple_pay"]);
export type PaymentChannel = z.infer<typeof paymentChannelSchema>;

/** A checkout's payment, as the checkout and processing pages show it. */
export const checkoutPaymentSchema = z.object({
  /** Whether Pay can be pressed now (provider set up and online payments on). */
  available: z.boolean(),
  /** Methods to list before payment; only what's switched on. */
  channels: z.array(paymentChannelSchema),
  internationalCards: z.boolean(),
  status: customerPaymentStatusSchema.nullable(),
  /** The latest attempt: enough for "Processing payment", "Payment failed" and "already in progress". */
  attempt: z
    .object({
      status: z.enum(["CREATED", "PENDING", "SUCCEEDED", "FAILED", "ABANDONED", "UNKNOWN"]),
      reference: z.string(),
      startedAt: z.string(),
      /** When a new attempt may start while this one is still pending (TECH-05 §6). */
      newAttemptFrom: z.string().nullable(),
      message: z.string().nullable(),
    })
    .nullable(),
  amountMinor: z.string(),
  currency: z.enum(["NGN", "USD"]),
});
export type CheckoutPayment = z.infer<typeof checkoutPaymentSchema>;

/** What the browser needs to open Paystack's checkout for a new attempt. */
export const paymentStartSchema = z.object({
  reference: z.string(),
  accessCode: z.string(),
  /** Paystack's hosted page, for devices where the popup can't open. */
  authorizationUrl: z.url(),
  amountMinor: z.string(),
  currency: z.enum(["NGN", "USD"]),
});
export type PaymentStart = z.infer<typeof paymentStartSchema>;
