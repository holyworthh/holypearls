import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ draft?: string; sourcing?: string; colour?: string }> };

export const metadata: Metadata = { robots: { index: false } };

/**
 * Garments now configure on their product page (Pen Stage 4.3 · mfOQO), so
 * the old configurator address sends people there, keeping a saved draft and
 * any route or colour carried in the link (the product page re-checks them).
 */
export default async function ConfigurePage({ params, searchParams }: Params) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const query = await searchParams;
  const keep = new URLSearchParams(
    Object.entries({ draft: query.draft, sourcing: query.sourcing, colour: query.colour }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(entry[1])),
  ).toString();
  permanentRedirect(`/products/${slug}${keep ? `?${keep}` : ""}`);
}
