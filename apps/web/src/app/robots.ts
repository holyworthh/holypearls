import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo";

/**
 * robots.txt (Stage 3 §53). Public content and the assets it needs stay
 * crawlable; admin and API routes are off limits. Other private pages stay
 * crawlable so search engines can see their noindex instruction.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/internal/", "/dev/", "/design-system"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
