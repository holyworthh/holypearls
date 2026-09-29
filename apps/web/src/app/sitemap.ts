import type { MetadataRoute } from "next";
import { getSitemap } from "../lib/content";
import { absoluteUrl } from "../lib/seo";

/** The XML sitemap (PUB-SEO-009): only published, indexable pages; refreshed when content is published or removed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getSitemap().catch(() => null);
  return (data?.entries ?? [{ path: "/", updatedAt: new Date().toISOString() }]).map((entry) => ({
    url: absoluteUrl(entry.path),
    lastModified: entry.updatedAt,
  }));
}

export const revalidate = 300;
