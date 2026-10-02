import { adminQuoteSchema } from "@holypearls/contracts";
import { ErrorState, PermissionDenied } from "@holypearls/ui";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import { requireAdmin } from "../../admin-session";
import { QuoteBuilder } from "./QuoteBuilder";

/** The quote builder and version editor (Pen 111 · p8eBI: V2 draft MaLb0, states nDS2r; OPS-FR-031–034, 040). QUOTE_MANAGE. */
export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const admin = await requireAdmin();
  if (!admin.permissions.includes("QUOTE_MANAGE")) return <PermissionDenied permission="QUOTE_MANAGE" />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const quote = await serverApi(`/v1/admin/quotes/${id}`, adminQuoteSchema);
  if (!quote.ok) {
    if (quote.status === 404) notFound();
    return <ErrorState title="We couldn't load this quote" body="Something went wrong on our side. Try again, or share the request ID with support." requestId={quote.error.requestId} />;
  }
  const { v } = await searchParams;
  return <QuoteBuilder initial={quote.data} selected={v ? Number(v) : null} />;
}
