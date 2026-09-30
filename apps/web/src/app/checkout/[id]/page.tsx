import { checkoutSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutView } from "../../../components/sales/CheckoutView";
import { hasSessionCookie, serverApi } from "../../../lib/server-api";

export const metadata: Metadata = { title: "Secure checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Checkout (Pen 43 desktop, Pen 44 mobile, Pen 45 states; COM-FR-083–084).
 * Enclosed: no site navigation, only the way back to help. Not yours: 404.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const checkout = await serverApi(`/v1/checkouts/${id}`, checkoutSchema);
  if (!checkout.ok) notFound();
  return <CheckoutView initial={checkout.data} signedIn={await hasSessionCookie()} />;
}
