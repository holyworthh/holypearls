import { checkoutSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PaymentStatusView } from "../../../../components/sales/PaymentStatusView";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Where Paystack sends the customer back to (TECH-05 §6, Pen 45 states B–D).
 * Arriving here proves nothing: the page shows what the server knows and waits
 * until a verified webhook or a payment check settles it. Not yours: 404.
 */
export default async function PaymentProcessingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const checkout = await serverApi(`/v1/checkouts/${id}`, checkoutSchema);
  if (!checkout.ok) notFound();
  // Nothing has been paid yet: the checkout is where to pay.
  if (!checkout.data.payment.attempt) redirect(`/checkout/${id}`);
  return <PaymentStatusView initial={checkout.data} />;
}
