import { refundablePaymentSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { requireAdmin } from "../../admin-session";
import { RefundForm } from "./RefundForm";

const UUID = /^[0-9a-f-]{36}$/;

/** Issue a refund (Pen 121 · mRG8q; OPS-FR-043): from a payment, or from the review it settles. */
export default async function NewRefundPage({ searchParams }: { searchParams: Promise<{ attempt?: string; review?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("REFUND_ISSUE")) return <PermissionDenied permission="REFUND_ISSUE" />;
  const { attempt, review } = await searchParams;
  if (!attempt || !UUID.test(attempt) || (review && !UUID.test(review))) notFound();
  const result = await serverApi(`/v1/admin/refunds/payments/${attempt}${review ? `?review=${review}` : ""}`, refundablePaymentSchema);
  if (!result.ok) {
    if (result.status === 404 || result.status === 400) notFound();
    return <ErrorState title="We couldn't load this payment" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={result.error.requestId} />;
  }
  return <RefundForm payment={result.data} />;
}
