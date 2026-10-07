import { slugSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContentPage } from "../../../lib/content";
import { pageMetadata } from "../../../lib/seo";
import { ProjectView } from "../../../components/content/views/ProjectView";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  return slugSchema.safeParse(slug).success ? getContentPage("PROJECT", slug) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return { title: "Project not found", robots: { index: false } };
  return pageMetadata({
    kind: "project",
    name: page.title,
    path: page.href,
    summary: page.summary,
    seoTitle: page.seo.title,
    seoDescription: page.seo.description,
    canonicalPath: page.seo.canonicalPath,
    indexable: page.seo.indexable,
    image: page.hero ?? page.products.find((product) => product.image)?.image ?? null,
  });
}

/**
 * Project / solution page (Pen 12B · SZbrl, PUB-FR-011): the goal, an example
 * kit with typical quantities, how the weeks usually go, real (or labelled
 * demo) work, and the way into Start a Project. Projects are always quoted,
 * so no total is shown. Editing the kit is the project builder's job (T05-01).
 */
export default async function ProjectPage({ params }: Params) {
  const page = await load((await params).slug);
  if (!page) notFound();
  return <ProjectView page={page} />;
}
