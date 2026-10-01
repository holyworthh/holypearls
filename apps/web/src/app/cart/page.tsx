import { cartSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { CartView } from "../../components/sales/CartView";
import { SiteShell } from "../../components/site/SiteShell";
import { serverApi } from "../../lib/server-api";

export const metadata: Metadata = { title: "Your cart", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Cart (Pen 41 desktop, Pen 42 mobile; COM-FR-080–081). */
export default async function CartPage() {
  const cart = await serverApi("/v1/cart", cartSchema);
  return (
    <SiteShell>
      <CartView initial={cart.ok ? cart.data : null} />
    </SiteShell>
  );
}
