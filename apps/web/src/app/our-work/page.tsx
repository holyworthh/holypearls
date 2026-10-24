import type { CaseStudyData, ContentCard } from "@holypearls/contracts";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import c from "../../components/content/content.module.css";
import { AutoSubmit } from "../../components/content/AutoSubmit";
import { FilterSelect } from "../../components/content/FilterSelect";
import { Crumbs, Photo } from "../../components/content/Parts";
import { JsonLd } from "../../components/seo/JsonLd";
import { SiteShell } from "../../components/site/SiteShell";
import { getContentIndex } from "../../lib/content";
import { breadcrumbLd, pageMetadata } from "../../lib/seo";

// Rendered per request (like the home page): the build has no API to read published content from.
export const dynamic = "force-dynamic";

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

const FILTERS = [
  { name: "sector", label: "Sector" },
  { name: "capability", label: "Capability" },
  { name: "type", label: "Project type" },
] as const;

/** Filtered views are the same page narrowed down: never indexed (Stage 3 §54). */
export async function generateMetadata({ searchParams }: Params): Promise<Metadata> {
  const params = await searchParams;
  const filtered = FILTERS.some((filter) => one(params[filter.name]));
  return {
    ...pageMetadata({ kind: "page", name: "Our work", path: "/our-work", seoTitle: "Our work: uniforms, events, packaging and signage | HolyPearls", summary: "Projects HolyPearls has made for businesses. Real projects appear once clients give permission." }),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

const values = (cards: ContentCard[], pick: (data: Partial<CaseStudyData>, card: ContentCard) => string[]) =>
  [...new Set(cards.flatMap((card) => pick(card.data as Partial<CaseStudyData>, card)).filter(Boolean))].sort();
const typeOf = (data: Partial<CaseStudyData>) => (data.facts ?? []).find((fact) => fact.label === "Project type")?.value ?? "";

/**
 * Our Work (Pen 54 · j9dFP, PUB-FR-012): image-led, no metrics. Every entry
 * says "Demo" until real, approved work replaces it; nothing claims a client.
 */
export default async function OurWorkPage({ searchParams }: Params) {
  const params = await searchParams;
  const all = await getContentIndex("CASE_STUDY");
  const options = {
    sector: values(all, (data) => [data.sector ?? ""]),
    capability: values(all, (data) => data.capabilities ?? []),
    type: values(all, (data) => [typeOf(data)]),
  };
  const chosen = { sector: one(params.sector), capability: one(params.capability), type: one(params.type) };
  const shown = all.filter((card) => {
    const data = card.data as Partial<CaseStudyData>;
    return (
      (!chosen.sector || data.sector === chosen.sector) &&
      (!chosen.capability || (data.capabilities ?? []).includes(chosen.capability)) &&
      (!chosen.type || typeOf(data) === chosen.type)
    );
  });
  const filtered = Object.values(chosen).some(Boolean);
  const featured = filtered ? null : shown.find((card) => card.featured) ?? null;
  const grid = shown.filter((card) => card !== featured);
  return (
    <SiteShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Our work", path: "/our-work" }])} />
      <div className={`${c.workHead} ${c.pad}`}>
        <Crumbs items={[{ label: "Home", href: "/" }, { label: "Our work" }]} />
        <div className={c.workTitleRow}>
          <h1 className={c.h1} data-enter>
            Work we&apos;ve made
          </h1>
          <p className={c.lead}>Uniforms, events, packaging and signage for businesses. Real projects appear here once clients give permission.</p>
        </div>
        <form className={c.filters} action="/our-work" aria-label="Filter our work">
          {FILTERS.map((filter) => (
            <FilterSelect key={filter.name} label={filter.label} name={filter.name} value={chosen[filter.name]} options={options[filter.name]} className={c.filter} selectClassName={c.filterSelect} />
          ))}
          <AutoSubmit label="Show projects" className={`${c.outline} ${c.filterApply}`} />
          <span className={c.count} role="status">
            {shown.length} {shown.length === 1 ? "project" : "projects"}
          </span>
        </form>
      </div>
      {featured ? (
        <section className={`${c.featured} ${c.onDark}`} aria-labelledby="featured-title">
          <Photo image={featured.image ? { ...featured.image, alt: "" } : null} eager>
            {featured.demo ? (
              <span className={c.ticket} aria-hidden="true">
                DEMO PROJECT · NOT A CLIENT CLAIM
              </span>
            ) : null}
          </Photo>
          <div className={c.featuredText}>
            <p className={c.featuredEyebrow}>FEATURED · {(featured.data as Partial<CaseStudyData>).sector ?? ""}</p>
            <h2 id="featured-title" className={c.featuredTitle}>
              {featured.title}
            </h2>
            <p className={c.featuredBody}>{featured.summary}</p>
            {featured.demo ? <p className="hp-visually-hidden">Demo project, not a client claim.</p> : null}
            <a className={c.red} href={featured.href}>
              Read the project
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </section>
      ) : null}
      {grid.length ? (
        <ul className={`${c.workGrid} ${c.pad}`} role="list">
          {grid.map((card, index) => (
            <li key={card.slug} className={`${c.card} ${c.workCard}`}>
              <Photo image={card.image ? { ...card.image, alt: "" } : null} eager={index < 3}>
                {card.demo ? (
                  <span className={c.ticket} aria-hidden="true">
                    DEMO
                  </span>
                ) : null}
              </Photo>
              <h2 className={c.workTitle}>
                <a className={c.stretch} href={card.href}>
                  {card.title}
                  {card.demo ? <span className="hp-visually-hidden"> (demo project)</span> : null}
                </a>
              </h2>
              <p className={c.workMeta}>{card.label}</p>
            </li>
          ))}
        </ul>
      ) : !featured ? (
        <div className={`${c.emptyState} ${c.pad}`}>
          <p className={c.lead}>No projects match these filters yet.</p>
          <a className={c.outline} href="/our-work">
            Show all work
          </a>
        </div>
      ) : null}
    </SiteShell>
  );
}
