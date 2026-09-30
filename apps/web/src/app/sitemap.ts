import type { MetadataRoute } from "next";
import { getSitemap } from "../lib/content";
import { absoluteUrl } from "../lib/seo";

// Rendered per request (like the home page): the build has no API to read published content from.
export const dynamic = "force-dynamic";

/** The XML sitemap (PUB-SEO-009): only published, indexable pages; refreshed when content is published or removed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getSitemap().catch(() => null);
  return (data?.entries ?? [{ path: "/", updatedAt: null }]).map((entry) => ({
    url: absoluteUrl(entry.path),
    // Pages without editable content carry no date rather than a made-up one.
    ...(entry.updatedAt ? { lastModified: entry.updatedAt } : {}),
  }));
}

export const revalidate = 300;
