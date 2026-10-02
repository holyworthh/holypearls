import { customerQuoteSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuoteView } from "../../../components/quotes/QuoteView";
import { SiteShell } from "../../../components/site/SiteShell";
import { serverApi } from "../../../lib/server-api";

export const metadata: Metadata = { title: "Your quote", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** The customer's quote (Pen 25, 46, 47). Private and never indexed (PRD-03 §8). Not yours: 404. */
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const quote = await serverApi(`/v1/quotes/${id}`, customerQuoteSchema);
  if (!quote.ok) {
    if (quote.status === 404 || quote.status === 400) notFound();
    throw new Error(quote.error.message);
  }
  return (
    <SiteShell>
      <QuoteView initial={quote.data} />
    </SiteShell>
  );
}
