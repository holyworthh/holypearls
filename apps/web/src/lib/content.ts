import { loadWebEnv } from "@holypearls/config";
import {
  type ContentType,
  contentHref,
  contentIndexSchema,
  publicContentPageSchema,
  searchResultsSchema,
  type SearchScope,
  sitemapSchema,
} from "@holypearls/contracts";
import { headers } from "next/headers";
import type { z } from "zod";

const env = loadWebEnv();

/**
 * Published content (T02-06) from server components. Like the catalogue,
 * responses are the same for everyone and cached under tags; publishing
 * refreshes `content`, the type and the page's address. Pages also carry
 * `catalogue`, since they show product prices.
 */
async function published<T extends z.ZodType>(path: string, schema: T, tags: string[]): Promise<z.output<T> | null> {
  const response = await fetch(`${env.API_URL}${path}`, {
    headers: { accept: "application/json" },
    next: { tags: ["content", "catalogue", ...tags], revalidate: 300 },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Content request failed (${response.status})`);
  return schema.parse(await response.json());
}

export async function getContentIndex(type: "PROJECT" | "GUIDE" | "CASE_STUDY") {
  return (await published(`/v1/content?type=${type}`, contentIndexSchema, [`content:${type}`]))?.entries ?? [];
}

export function getContentPage(type: ContentType, slug: string) {
  return published(`/v1/content/${type}/${encodeURIComponent(slug)}`, publicContentPageSchema, [`content:${type}`, `page:${contentHref(type, slug)}`]);
}

export function getSitemap() {
  return published("/v1/seo/sitemap", sitemapSchema, ["sitemap"]);
}

/** Search is never cached: results depend on the query and are private (PUB-SEO-008). */
export async function getSearchResults(query: { q: string; scope: SearchScope; page: number; exact: boolean }) {
  const params = new URLSearchParams({ q: query.q, scope: query.scope, page: String(query.page) });
  if (query.exact) params.set("exact", "1");
  const incoming = await headers();
  const response = await fetch(`${env.API_URL}/v1/search?${params}`, {
    headers: { accept: "application/json", ...(incoming.get("x-request-id") ? { "x-request-id": incoming.get("x-request-id")! } : {}) },
    cache: "no-store",
  });
  // A busy moment (rate limit) is shown as a message on the page, not an error page.
  if (response.status === 429) return "RATE_LIMITED" as const;
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  return searchResultsSchema.parse(await response.json());
}
