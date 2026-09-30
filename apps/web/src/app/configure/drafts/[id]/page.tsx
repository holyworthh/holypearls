import { configurationSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { serverApi } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Your saved design", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Where an emailed draft link lands after the guest session starts (TECH-03
 * §5): opens the product page with the saved design. Not yours: 404.
 */
export default async function DraftRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const draft = await serverApi(`/v1/configurations/${id}`, configurationSchema);
  if (!draft.ok) notFound();
  redirect(`/products/${draft.data.productSlug}?draft=${draft.data.id}`);
}
