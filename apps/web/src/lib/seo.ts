import { loadWebEnv } from "@holypearls/config";
import { customerPriceState, type PublicContentPage, type PublicProduct, type PublicProductCard } from "@holypearls/contracts";
import type { Metadata } from "next";

/*
 * SEO foundations (T02-06, PUB-SEO-001–009; Stage 3 §48, §53, §58–60). Titles,
 * descriptions, canonical addresses and structured data come from these fixed
 * rules, never typed per page. Staff SEO fields, when set, win.
 */

const env = loadWebEnv();

/** The site's public address; the local address until a domain is set. */
export const SITE_URL = (env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * The business identity, identical everywhere it appears (PUB-SEO-006). No
 * street address or phone until they're verified (Pen 60): service area only.
 */
export const BUSINESS = {
  name: "HolyPearls",
  description: "Branded uniforms, print and merch for businesses, from brief to delivery. Made in Lagos, delivered across Nigeria.",
  areaServed: { "@type": "Country", name: "Nigeria" },
  city: "Lagos",
};

export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export type PageKind = "product" | "category" | "project" | "guide" | "case-study" | "page";

/**
 * Stage 3 §58: "Custom Polo Shirts in Nigeria | HolyPearls". Buying pages say
 * where we make and deliver; reading pages keep their own title.
 */
export function titleFor(kind: PageKind, name: string, staff?: string | null): string {
  if (staff?.trim()) return staff.trim();
  const where = kind === "product" || kind === "category" || kind === "project" ? " in Nigeria" : "";
  return `${name}${where} | ${BUSINESS.name}`;
}

/** Stage 3 §59: product or topic, what's different, how you order, delivery. At most about 160 characters. */
export function descriptionFor(kind: PageKind, name: string, summary: string | null | undefined, staff?: string | null): string {
  if (staff?.trim()) return staff.trim();
  const lead = summary?.trim() ? summary.trim().replace(/\.?$/, ".") : `${name} from ${BUSINESS.name}.`;
  const tail =
    kind === "product"
      ? " Configure yours or ask for a quote, with delivery across Nigeria."
      : kind === "project" || kind === "case-study"
        ? " Tell us what it's for and get one quote, with delivery across Nigeria."
        : kind === "category"
          ? " Browse, compare and order, with delivery across Nigeria."
          : "";
  const text = `${lead}${tail}`;
  return text.length <= 160 ? text : `${text.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

/** The standard metadata for a public page: title, description, canonical address and social preview. */
export function pageMetadata(input: {
  kind: PageKind;
  name: string;
  path: string;
  summary?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalPath?: string | null;
  indexable?: boolean;
  image?: { url: string; alt: string } | null;
}): Metadata {
  const title = titleFor(input.kind, input.name, input.seoTitle);
  const description = descriptionFor(input.kind, input.name, input.summary, input.seoDescription);
  const canonical = input.canonicalPath?.trim() || input.path;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: input.indexable === false ? { index: false, follow: true } : undefined,
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: BUSINESS.name,
      type: input.kind === "guide" || input.kind === "case-study" ? "article" : "website",
      ...(input.image ? { images: [{ url: input.image.url, alt: input.image.alt }] } : {}),
    },
  };
}

type Ld = Record<string, unknown>;

export function organizationLd(): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: BUSINESS.name,
    url: SITE_URL,
    description: BUSINESS.description,
    areaServed: BUSINESS.areaServed,
    address: { "@type": "PostalAddress", addressLocality: BUSINESS.city, addressCountry: "NG" },
  };
}

/** WebSite with a search action: search engines may link straight into site search; the results page itself is noindex. */
export function websiteLd(): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: BUSINESS.name,
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/search?q={search_term_string}`, "query-input": "required name=search_term_string" },
  };
}

/** Stage 3 §60: the path a person would take, not the URL's folders. */
export function breadcrumbLd(items: { name: string; path: string }[]): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: absoluteUrl(item.path) })),
  };
}

/**
 * Product structured data (PUB-SEO-003, 004): an Offer only when the price is
 * real and the product can be bought now (PRICE_READY). Estimates and quoted
 * products describe the product without a price.
 */
export function productLd(product: PublicProduct | PublicProductCard): Ld {
  const state = customerPriceState(product);
  const images = "images" in product ? product.images.map((image) => absoluteUrl(image.url)) : product.image ? [absoluteUrl(product.image.url)] : [];
  const ld: Ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.summary ?? undefined,
    url: absoluteUrl(`/products/${product.slug}`),
    brand: { "@type": "Brand", name: BUSINESS.name },
    category: product.category.name,
    ...(images.length ? { image: images } : {}),
  };
  if (state === "PRICE_READY" && product.price) {
    ld.offers = {
      "@type": "Offer",
      price: (Number(BigInt(product.price.amountMinor)) / 100).toFixed(2),
      priceCurrency: product.price.currency,
      availability: product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: absoluteUrl(`/products/${product.slug}`),
      seller: { "@id": `${SITE_URL}/#organization` },
      ...(product.moq && product.moq > 1 ? { eligibleQuantity: { "@type": "QuantitativeValue", minValue: product.moq } } : {}),
    };
  }
  return ld;
}

/** Category hubs and the directory: a collection with its listed products. */
export function collectionLd(name: string, path: string, products: PublicProductCard[], description?: string | null): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    url: absoluteUrl(path),
    ...(description ? { description } : {}),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: products.map((product, index) => ({ "@type": "ListItem", position: index + 1, url: absoluteUrl(`/products/${product.slug}`), name: product.name })),
    },
  };
}

export function articleLd(page: PublicContentPage): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.summary,
    url: absoluteUrl(page.href),
    datePublished: page.publishedAt,
    dateModified: page.updatedAt,
    author: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    ...(page.hero ? { image: [absoluteUrl(page.hero.url)] } : {}),
  };
}

/** Project / solution pages are services (Stage 3 §48). No price: projects are always quoted. */
export function serviceLd(page: PublicContentPage): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.title,
    description: page.summary,
    url: absoluteUrl(page.href),
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed: BUSINESS.areaServed,
  };
}

/** Serialised for a <script type="application/ld+json">; "<" is escaped so text can't close the tag. */
export const ldJson = (data: Ld | Ld[]) => JSON.stringify(data).replace(/</g, "\\u003c");
