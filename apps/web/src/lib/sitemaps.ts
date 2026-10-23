import { getSitemap } from "./content";
import { absoluteUrl } from "./seo";

/*
 * The XML sitemap index and its sitemaps (PUB-SEO-009; Stage 3 §53): one each
 * for pages, categories and products, so search consoles report coverage per
 * kind. Only published, indexable pages; refreshed when content changes.
 */

export const SITEMAPS = ["pages", "categories", "products"] as const;
export type SitemapKind = (typeof SITEMAPS)[number];

const kindOf = (path: string): SitemapKind => (path.startsWith("/products/") ? "products" : path.startsWith("/categories/") ? "categories" : "pages");
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const xml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" } });

async function entries() {
  const data = await getSitemap().catch(() => null);
  return data?.entries ?? [{ path: "/", updatedAt: null }];
}

/** The index: each sitemap, with the newest change in it. */
export async function sitemapIndex() {
  const all = await entries();
  const items = SITEMAPS.map((kind) => {
    const dates = all.filter((entry) => kindOf(entry.path) === kind && entry.updatedAt).map((entry) => entry.updatedAt!);
    const latest = dates.sort().at(-1);
    return `  <sitemap><loc>${escape(absoluteUrl(`/sitemaps/${kind}.xml`))}</loc>${latest ? `<lastmod>${latest}</lastmod>` : ""}</sitemap>`;
  });
  return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>`);
}

/** One sitemap. Pages without editable content carry no date rather than a made-up one. */
export async function sitemapFor(kind: SitemapKind) {
  const urls = (await entries())
    .filter((entry) => kindOf(entry.path) === kind)
    .map((entry) => `  <url><loc>${escape(absoluteUrl(entry.path))}</loc>${entry.updatedAt ? `<lastmod>${entry.updatedAt}</lastmod>` : ""}</url>`);
  return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`);
}
