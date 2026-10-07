import { slugSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContentPage } from "../../../lib/content";
import { pageMetadata } from "../../../lib/seo";
import { CaseStudyView } from "../../../components/content/views/CaseStudyView";

type Params = { params: Promise<{ slug: string }> };
const load = async (slug: string) => (slugSchema.safeParse(slug).success ? getContentPage("CASE_STUDY", slug) : null);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return { title: "Project not found", robots: { index: false } };
  return pageMetadata({
    kind: "case-study",
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
 * Case study (Pen 55 · nnXfJ, PUB-FR-012): the story, what was made, photos,
 * verified facts and a way to start something similar. Demo entries say so
 * at the top; no results, revenue or clients are ever invented.
 */
export default async function CaseStudyPage({ params }: Params) {
  const page = await load((await params).slug);
  if (!page) notFound();
  return <CaseStudyView page={page} />;
}
