import type { Metadata } from "next";
import { TrackOrder } from "../../components/orders/TrackOrder";
import { SiteShell } from "../../components/site/SiteShell";

export const metadata: Metadata = {
  title: "Track an order",
  description: "Find your HolyPearls order with its number and the email you used at checkout.",
  robots: { index: false },
};

/** Find my order (Pen 53 · m0t8za; FUL-FR-033). No sign-in needed. */
export default function TrackPage() {
  return (
    <SiteShell>
      <TrackOrder />
    </SiteShell>
  );
}
