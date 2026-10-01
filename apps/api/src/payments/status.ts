import type { CustomerPaymentStatus } from "@holypearls/contracts";

type InstallmentStatus = "NOT_DUE" | "DUE" | "PROCESSING" | "PAID" | "CANCELLED";
type AttemptStatus = "CREATED" | "PENDING" | "SUCCEEDED" | "FAILED" | "ABANDONED" | "UNKNOWN";

export interface PaymentFacts {
  /** In schedule order. */
  installments: { position: number; status: InstallmentStatus; latestAttempt: AttemptStatus | null }[];
  /** An open payment review, or a removed participant who paid. */
  needsResolution: boolean;
  /** Refunded and paid totals, in minor units (refunds arrive with T13-05). */
  refundedMinor?: bigint;
  paidMinor?: bigint;
}

/**
 * The customer-facing payment status (PRD-00 §8), worked out in the order
 * TECH-01 §4 lists: the first rule that matches wins. Null when nothing is
 * payable yet.
 */
export function customerPaymentStatus(facts: PaymentFacts): CustomerPaymentStatus | null {
  const parts = [...facts.installments].filter((part) => part.status !== "CANCELLED").sort((a, b) => a.position - b.position);
  const refunded = facts.refundedMinor ?? 0n;
  const paid = facts.paidMinor ?? 0n;
  if (facts.needsResolution) return "PAYMENT_RESOLUTION_REQUIRED";
  if (refunded > 0n && paid > 0n && refunded >= paid) return "REFUNDED";
  if (refunded > 0n) return "PARTIALLY_REFUNDED";
  if (!parts.length) return null;
  if (parts.some((part) => part.status === "PROCESSING")) return "PAYMENT_PENDING";
  const due = parts.filter((part) => part.status === "DUE");
  if (due.some((part) => part.latestAttempt === "FAILED" || part.latestAttempt === "ABANDONED")) return "PAYMENT_FAILED";
  if (due.length && parts.length === 1) return "PAYMENT_DUE";
  if (due.length && due[0]!.position === parts[0]!.position) return "DEPOSIT_DUE";
  if (due.length) return "BALANCE_DUE";
  const paidParts = parts.filter((part) => part.status === "PAID");
  if (paidParts.length === parts.length) return "PAID";
  if (parts[0]!.status === "PAID" && parts[1]?.status === "NOT_DUE" && paidParts.length === 1) return "DEPOSIT_PAID";
  if (paidParts.length) return "PARTIALLY_PAID";
  return "NOT_DUE";
}
