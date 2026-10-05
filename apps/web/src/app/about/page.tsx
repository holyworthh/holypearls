import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContentPage } from "../../lib/content";
import { pageMetadata } from "../../lib/seo";
import { AboutView } from "../../components/content/views/AboutView";

// Rendered per request (like the home page): the build has no API to read published content from.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getContentPage("ABOUT", "about");
  if (!page) return { title: "About", robots: { index: false } };
  return pageMetadata({ kind: "page", name: page.title, path: "/about", summary: page.summary, seoTitle: page.seo.title, seoDescription: page.seo.description, indexable: page.seo.indexable, image: page.hero });
}

/**
 * About (Pen 59 · LXw1v): what HolyPearls makes itself and what it manages,
 * how every order is made, and where it delivers. No invented history or
 * "biggest" claims; team photos appear only with consent.
 */
export default async function AboutPage() {
  const page = await getContentPage("ABOUT", "about");
  if (!page) notFound();
  return <AboutView page={page} />;
}
