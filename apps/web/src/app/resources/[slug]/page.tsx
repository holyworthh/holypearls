import { slugSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContentPage } from "../../../lib/content";
import { pageMetadata } from "../../../lib/seo";
import { GuideView } from "../../../components/content/views/GuideView";

type Params = { params: Promise<{ slug: string }> };
const load = async (slug: string) => (slugSchema.safeParse(slug).success ? getContentPage("GUIDE", slug) : null);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return { title: "Guide not found", robots: { index: false } };
  return pageMetadata({
    kind: "guide",
    name: page.title,
    path: page.href,
    summary: page.summary,
    seoTitle: page.seo.title,
    seoDescription: page.seo.description,
    canonicalPath: page.seo.canonicalPath,
    indexable: page.seo.indexable,
    image: page.hero,
  });
}

/**
 * Guide (Pen 57 · nbOI4 desktop, 58 · C43mU9 phone; PUB-FR-013): reading
 * first, with sticky contents on desktop and a jump menu on phones. Products
 * and projects to put it into practice come after the text.
 */
export default async function GuidePage({ params }: Params) {
  const page = await load((await params).slug);
  if (!page) notFound();
  return <GuideView page={page} />;
}
