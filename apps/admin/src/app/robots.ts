import type { MetadataRoute } from "next";

/** The admin is never crawled (ADR-017). */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
