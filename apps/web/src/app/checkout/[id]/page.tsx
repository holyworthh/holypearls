import { checkoutSchema, myOrganizationsSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutView } from "../../../components/sales/CheckoutView";
import { placeableWorkspaces } from "../../../components/workspace/placeable";
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
  const signedIn = await hasSessionCookie();
  // Workspace members can place the order for one of their locations (T10-03).
  const mine = signedIn ? await serverApi("/v1/me/organizations", myOrganizationsSchema) : null;
  return <CheckoutView initial={checkout.data} signedIn={signedIn} workspaces={mine?.ok ? placeableWorkspaces(mine.data.organizations) : []} />;
}
