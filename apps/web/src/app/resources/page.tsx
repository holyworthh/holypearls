import { type ContentCard, GUIDE_TOPIC_LABEL, type GuideData, type GuideTopic, guideTopicSchema } from "@holypearls/contracts";
import { ArrowRight, FileText, Package, Presentation, Search, Shirt, Sparkles, Upload } from "lucide-react";
import type { Metadata } from "next";
import c from "../../components/content/content.module.css";
import { Crumbs, Photo } from "../../components/content/Parts";
import { JsonLd } from "../../components/seo/JsonLd";
import { SiteShell } from "../../components/site/SiteShell";
import { getContentIndex } from "../../lib/content";
import { breadcrumbLd, pageMetadata } from "../../lib/seo";

// Rendered per request (like the home page): the build has no API to read published content from.
export const dynamic = "force-dynamic";

type Params = { searchParams: Promise<{ topic?: string }> };

const ICON: Record<GuideTopic, typeof Shirt> = { APPAREL: Shirt, EMBROIDERY: Sparkles, PRINT: FileText, LARGE_FORMAT: Presentation, PACKAGING: Package, ORDERING: Upload };
const ORDER = guideTopicSchema.options;
const topicOf = (card: ContentCard) => ((card.data as Partial<GuideData>).topic ?? "ORDERING") as GuideTopic;
const parseTopic = (value?: string) => guideTopicSchema.safeParse(value?.toUpperCase()).data;

export async function generateMetadata({ searchParams }: Params): Promise<Metadata> {
  const topic = parseTopic((await searchParams).topic);
  return {
    ...pageMetadata({ kind: "page", name: "Resources", path: "/resources", seoTitle: "Buying and production guides | HolyPearls", summary: "Practical guides to garments, embroidery, print, large format and packaging, so you know before you order." }),
    // One topic is a narrowed view of the same page (Stage 3 §54).
    ...(topic ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Resources index (Pen 56 · IkI3Y, PUB-FR-013): topic-led buying help, not a dated blog. */
export default async function ResourcesPage({ searchParams }: Params) {
  const topic = parseTopic((await searchParams).topic);
  const guides = await getContentIndex("GUIDE");
  const featured = topic ? null : (guides.find((guide) => guide.featured) ?? null);
  const topics = ORDER.filter((key) => !topic || key === topic)
    .map((key) => ({ key, guides: guides.filter((guide) => topicOf(guide) === key) }))
    .filter((entry) => entry.guides.length);
  return (
    <SiteShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Resources", path: "/resources" }])} />
      <div className={`${c.resourcesHead} ${c.pad}`}>
        <div>
          <Crumbs items={topic ? [{ label: "Home", href: "/" }, { label: "Resources", href: "/resources" }, { label: GUIDE_TOPIC_LABEL[topic] }] : [{ label: "Home", href: "/" }, { label: "Resources" }]} />
          <h1 className={c.h1} data-enter>
            {topic ? `${GUIDE_TOPIC_LABEL[topic]} guides` : "Know before you order"}
          </h1>
        </div>
        <form className={c.guideSearch} action="/search" role="search" aria-label="Search guides">
          <input type="hidden" name="scope" value="guides" />
          <label className="hp-visually-hidden" htmlFor="guide-search">
            Search guides
          </label>
          <input id="guide-search" name="q" type="search" placeholder="Search guides" required maxLength={100} enterKeyHint="search" />
          <button type="submit" aria-label="Search">
            <Search size={20} aria-hidden="true" />
          </button>
        </form>
      </div>
      {featured ? (
        <div className={c.pad}>
          <article className={`${c.card} ${c.featuredGuide}`}>
            {featured.image ? <Photo image={{ ...featured.image, alt: "" }} eager /> : null}
            <div className={c.featuredGuideText}>
              <p className={c.caseHeroEyebrow}>MOST READ · {GUIDE_TOPIC_LABEL[topicOf(featured)]}</p>
              <h2 className={c.featuredGuideTitle}>{featured.title}</h2>
              <p className={c.lead}>{featured.summary}</p>
              <a className={c.red} href={featured.href}>
                Read the guide
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </article>
        </div>
      ) : null}
      <div className={`${c.topics} ${c.pad}`}>
        {topics.map(({ key, guides: list }) => {
          const Icon = ICON[key];
          const shown = topic ? list : list.slice(0, 3);
          return (
            <section key={key} className={c.topic} aria-labelledby={`topic-${key}`}>
              <h2 id={`topic-${key}`} className={c.topicHead}>
                <Icon size={22} aria-hidden="true" />
                {GUIDE_TOPIC_LABEL[key]}
              </h2>
              <ul className={c.topicList}>
                {shown.map((guide) => (
                  <li key={guide.slug}>
                    <a href={guide.href}>
                      <span>{guide.title}</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
              {!topic ? (
                <a className={c.topicAll} href={`/resources?topic=${key.toLowerCase()}`}>
                  All {GUIDE_TOPIC_LABEL[key].toLowerCase()} guides
                </a>
              ) : null}
            </section>
          );
        })}
      </div>
    </SiteShell>
  );
}
