import { sitemapIndex } from "../../lib/sitemaps";

// Rendered per request: the build has no API to read published content from.
export const dynamic = "force-dynamic";

/** The sitemap index (Stage 3 §53), listed in robots.txt and submitted to Search Console and Bing. */
export const GET = () => sitemapIndex();
