import { notFound } from "next/navigation";
import { SITEMAPS, type SitemapKind, sitemapFor } from "../../../lib/sitemaps";

export const dynamic = "force-dynamic";

/** /sitemaps/pages.xml, /sitemaps/categories.xml and /sitemaps/products.xml. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const kind = file.replace(/\.xml$/, "") as SitemapKind;
  if (!file.endsWith(".xml") || !SITEMAPS.includes(kind)) notFound();
  return sitemapFor(kind);
}
