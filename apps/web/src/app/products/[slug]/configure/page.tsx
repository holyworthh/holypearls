import { configurationSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { GarmentConfigurator } from "../../../../components/catalogue/GarmentConfigurator";
import { hasSessionCookie, serverApi } from "../../../../lib/server-api";
import { getProduct } from "../../../../lib/storefront";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ draft?: string; sourcing?: string; colour?: string }> };
const SOURCING = ["SOURCE_CUSTOMIZE", "MAKE_FROM_SCRATCH", "CUSTOMER_SUPPLIED", "HELP_ME_CHOOSE"] as const;

/** Temporary reference photography from the Pen board (Pen 22), by product and colour. */
const REFERENCE_PHOTOS: Record<string, Record<string, string>> = { "polo-shirt": { navy: "/pen/generated-33.webp" } };

export const metadata: Metadata = { robots: { index: false } };

/**
 * The garment configurator (Pen 22 · O2tORo desktop, 40 · PeLav mobile): its
 * own header with the six steps, one step at a time, the preview beside it.
 * Products other than garments configure inline on their product page.
 */
export default async function ConfigurePage({ params, searchParams }: Params) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const product = await getProduct(slug);
  if (!product) notFound();
  if (product.family !== "GARMENT" || !product.configurator || !product.available) redirect(`/products/${slug}`);
  const query = await searchParams;
  const draft = query.draft && /^[0-9a-f-]{36}$/.test(query.draft) ? await serverApi(`/v1/configurations/${query.draft}`, configurationSchema) : null;
  const initialDraft = draft?.ok && draft.data.productSlug === product.slug ? draft.data : null;
  const sourcing = SOURCING.find((value) => value === query.sourcing) ?? null;
  const colour = product.configurator.options.find((option) => option.key === "colour")?.values.find((value) => value.key === query.colour)?.key;
  return (
    <GarmentConfigurator
      productSlug={product.slug}
      productName={product.name}
      data={product.configurator}
      initialDraft={initialDraft}
      signedIn={await hasSessionCookie()}
      startSourcing={initialDraft ? null : sourcing}
      startChoices={colour ? { colour } : {}}
      photos={REFERENCE_PHOTOS[product.slug]}
    />
  );
}
