import type { CustomerPaymentStatus, OrderSummaryStatus } from "@holypearls/contracts";

type Tone = "success" | "info" | "neutral" | "warning" | "error";

/** Order status chips, shared by the order page and the account overview. */
export const ORDER_SUMMARY: Record<OrderSummaryStatus, { label: string; tone: Tone }> = {
  CONFIRMED: { label: "CONFIRMED", tone: "neutral" },
  AWAITING_PREREQUISITE: { label: "PREPARING", tone: "neutral" },
  IN_PRODUCTION: { label: "IN PRODUCTION", tone: "info" },
  PARTIALLY_READY: { label: "PARTLY READY", tone: "info" },
  BALANCE_REQUIRED: { label: "BALANCE REQUIRED", tone: "warning" },
  READY_TO_DISPATCH: { label: "READY TO DISPATCH", tone: "success" },
  ON_HOLD: { label: "ON HOLD", tone: "warning" },
  PARTIALLY_DISPATCHED: { label: "PARTLY DISPATCHED", tone: "info" },
  DISPATCHED: { label: "DISPATCHED", tone: "success" },
  PARTIALLY_DELIVERED: { label: "PARTLY DELIVERED", tone: "info" },
  DELIVERED: { label: "DELIVERED", tone: "success" },
  CANCELLED: { label: "CANCELLED", tone: "neutral" },
};

/** Payment status chips (TECH-01 customer payment statuses). */
export const PAYMENT_STATUS: Record<CustomerPaymentStatus, { label: string; tone: Tone }> = {
  NOT_DUE: { label: "NOT DUE", tone: "neutral" },
  PAYMENT_DUE: { label: "PAYMENT DUE", tone: "warning" },
  DEPOSIT_DUE: { label: "DEPOSIT DUE", tone: "warning" },
  PAYMENT_PENDING: { label: "PAYMENT PENDING", tone: "info" },
  DEPOSIT_PAID: { label: "DEPOSIT PAID", tone: "success" },
  PARTIALLY_PAID: { label: "PARTLY PAID", tone: "info" },
  BALANCE_DUE: { label: "BALANCE DUE", tone: "warning" },
  PAID: { label: "PAID", tone: "success" },
  PAYMENT_FAILED: { label: "PAYMENT FAILED", tone: "error" },
  PARTIALLY_REFUNDED: { label: "PARTLY REFUNDED", tone: "neutral" },
  REFUNDED: { label: "REFUNDED", tone: "neutral" },
  PAYMENT_RESOLUTION_REQUIRED: { label: "PAYMENT CHECK NEEDED", tone: "warning" },
};
