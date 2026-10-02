import { FEATURED_PROJECT_TYPES, PROJECT_TYPE_INFO, PROJECT_TYPES, type ProjectType } from "@holypearls/contracts";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { JsonLd } from "../../components/seo/JsonLd";
import { SiteShell } from "../../components/site/SiteShell";
import { DescribeIt, FigureItOut, ResumeBanner, TypeCard } from "../../components/projects/StartActions";
import s from "../../components/projects/start.module.css";
import { getContentIndex } from "../../lib/content";
import { breadcrumbLd, pageMetadata } from "../../lib/seo";

// Rendered per request: the photos come from published project pages.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  kind: "page",
  name: "Start a Project",
  path: "/start",
  seoTitle: "Start a branding project: events, uniforms, launches | HolyPearls",
  summary: "Tell us what you're making. HolyPearls suggests what to order and how many, then sends one quote. Nothing is ordered until you accept it.",
});

/** The project pages whose photos illustrate each kind of project. */
const PHOTO_FROM: Partial<Record<ProjectType, string>> = {
  EVENT: "conference-kit",
  STAFF_UNIFORMS: "hospitality-programme",
  BUSINESS_LAUNCH: "business-launch",
  CORPORATE_GIFTS: "corporate-gifts",
  RETAIL_SPACE: "retail-branding",
  HOSPITALITY: "hospitality-programme",
  SCHOOL_UNIFORMS: "school-uniform-programme",
  FASHION_PRODUCTION: "fashion-brand-production",
};

/** The Ledger photos the home page uses for the same kinds of work (Pen 23 ph/event, ph/team, ph/packaging, ph/merch, ph/tees). */
const LEDGER_PHOTO: Partial<Record<ProjectType, string>> = {
  EVENT: "/ledger/tile-events.jpg",
  STAFF_UNIFORMS: "/ledger/tile-uniforms.jpg",
  BUSINESS_LAUNCH: "/ledger/tile-packaging.jpg",
  CORPORATE_GIFTS: "/ledger/tile-merch.jpg",
  MERCHANDISE: "/ledger/tile-tees.jpg",
};

const STEPS = [
  { title: "Brief", body: "What it's for, how many people, when and where." },
  { title: "Recommendations", body: "A suggested list with quantities, which you can edit." },
  { title: "One quote", body: "One quote covering every item." },
  { title: "Proof + produce", body: "Each item is proofed, made and checked separately." },
];

const img = (url: string | null, eager = false) => (url ? <img src={url} alt="" loading={eager ? "eager" : "lazy"} decoding="async" /> : null);

/**
 * Start a Project (Pen 23 · jRe2D; PROJ-FR-001, Stage 3.1D §3). Starts from
 * what the customer is trying to achieve, not from product categories. The
 * page stays indexable; the drafts it creates are not.
 */
export default async function StartPage() {
  const pages = await getContentIndex("PROJECT").catch(() => []);
  const photo = (type: ProjectType) => LEDGER_PHOTO[type] ?? pages.find((page) => page.slug === PHOTO_FROM[type])?.image?.url ?? null;
  const [lead, second, ...smaller] = FEATURED_PROJECT_TYPES;
  const more = PROJECT_TYPES.filter((type) => !FEATURED_PROJECT_TYPES.includes(type) && type !== "SOMETHING_ELSE");

  return (
    <SiteShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Start a Project", path: "/start" }])} />
      <section className={s.hero} aria-labelledby="start-title">
        <ResumeBanner />
        <div className={s.titleRow}>
          <div className={s.titleCol}>
            <span className={s.ticket}>START A PROJECT</span>
            <h1 id="start-title" className={s.h1} data-enter>
              What are we
              <br />
              making together?
            </h1>
          </div>
          <p className={s.intro}>Tell us what it&apos;s for: an event, your staff or a launch. We&apos;ll suggest what to order and how many, then send one quote. Nothing is ordered until you accept it.</p>
        </div>
        <div className={s.entryRow}>
          <div className={s.figure}>
            <div className={s.figureText}>
              <div className={s.figureTop}>
                <span className={s.ticketSun}>A FEW QUESTIONS · SAVED AS YOU GO</span>
                <h2 className={s.figureTitle}>Help me figure it out</h2>
                <p className={s.figureBody}>Answer two quick questions. We&apos;ll suggest the kind of project, then a list you can edit.</p>
              </div>
              <FigureItOut />
            </div>
            <div className={s.figurePhoto} aria-hidden="true">
              <img src="/ledger/workshop-cut-sew.jpg" alt="" loading="eager" decoding="async" />
            </div>
          </div>
          <DescribeIt variant="card" />
        </div>
      </section>

      <section className={s.common} aria-labelledby="common-title">
        <h2 id="common-title" className={s.h2}>
          Or start from a common order
        </h2>
        <div className={s.bigRow}>
          {[lead!, second!].map((type, index) => (
            <TypeCard key={type} type={type} className={s.bigCard}>
              {img(photo(type), index === 0)}
              <span className={s.panel}>
                <span className={s.kicker}>{PROJECT_TYPE_INFO[type].eyebrow}</span>
                <span className={s.panelRow}>
                  <span className={s.bigTitle}>{PROJECT_TYPE_INFO[type].label}</span>
                  <span className={s.go} aria-hidden="true">
                    <ArrowRight size={20} />
                  </span>
                </span>
                <span className={s.line}>{PROJECT_TYPE_INFO[type].line}</span>
              </span>
            </TypeCard>
          ))}
        </div>
        <div className={s.smallRow}>
          {smaller.map((type) => (
            <TypeCard key={type} type={type} className={s.smallCard}>
              <span className={s.smallPhoto}>{img(photo(type))}</span>
              <span className={s.smallText}>
                <span>
                  <span className={s.smallTitle}>{PROJECT_TYPE_INFO[type].label}</span>
                  <span className={s.line}>{PROJECT_TYPE_INFO[type].line}</span>
                </span>
                <ArrowRight size={20} aria-hidden="true" />
              </span>
            </TypeCard>
          ))}
        </div>
        <div className={s.more}>
          <h3 className={s.mono}>MORE KINDS OF PROJECT</h3>
          <ul className={s.moreGrid} role="list">
            {more.map((type) => (
              <li key={type}>
                <TypeCard type={type} className={s.moreCard}>
                  <span className={s.smallTitle}>{PROJECT_TYPE_INFO[type].label}</span>
                  <span className={s.line}>{PROJECT_TYPE_INFO[type].line}</span>
                </TypeCard>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={s.something} aria-labelledby="something-title">
        <div>
          <h2 id="something-title" className={s.somethingTitle}>
            Something else?
          </h2>
          <p className={s.somethingBody}>Not on the list? Describe it in a sentence and we&apos;ll work it out with you.</p>
        </div>
        <DescribeIt variant="band" />
      </section>

      <section className={s.how} aria-labelledby="how-title">
        <h2 id="how-title" className={s.mono}>
          HOW A PROJECT WORKS
        </h2>
        <ol className={s.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={s.step}>
              <span className={s.stepNumber} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={s.stepTitle}>{step.title}</h3>
              <p className={s.line}>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </SiteShell>
  );
}
