import type { ContentCard, ProjectData, PublicContentPage, PublicProductCard } from "@holypearls/contracts";
import { ArrowRight, FileText } from "lucide-react";
import { priceLine } from "../../../components/catalogue/ProductCard";
import c from "../../../components/content/content.module.css";
import { Crumbs, Photo } from "../../../components/content/Parts";
import { JsonLd } from "../../../components/seo/JsonLd";
import { SiteShell } from "../../../components/site/SiteShell";
import { breadcrumbLd, serviceLd } from "../../../lib/seo";

/** "From ₦8,500 each": the product's own price line, per item. */
function itemPrice(product: PublicProductCard | undefined) {
  if (!product) return "Priced in your quote";
  const line = priceLine(product);
  if (line.tone === "quote" || line.tone === "muted") return line.text;
  return `${line.amount ?? line.text} each`;
}

function CaseStudyLink({ card }: { card: ContentCard }) {
  return (
    <article className={`${c.card} ${c.proofRow}`}>
      <Photo image={card.image ? { ...card.image, alt: "" } : null} />
      <div className={c.proofText}>
        <p className={c.eyebrow}>{card.demo ? "DEMO PROJECT" : "OUR WORK"}</p>
        <h2 className={c.proofTitle}>
          <a className={c.stretch} href={card.href}>
            {card.title}
          </a>
        </h2>
        <span className={c.proofMore} aria-hidden="true">
          Read the example project →
        </span>
      </div>
    </article>
  );
}

/**
 * Project / solution page (Pen 12B · SZbrl, PUB-FR-011): the goal, an example
 * kit with typical quantities, how the weeks usually go, real (or labelled
 * demo) work, and the way into Start a Project. Projects are always quoted,
 * so no total is shown. Editing the kit is the project builder's job (T05-01).
 */
export async function ProjectView({ page }: { page: PublicContentPage }) {
  const data = page.data as Partial<ProjectData>;
  const kit = data.kit ?? [];
  const bySlug = new Map(page.products.map((product) => [product.slug, product]));
  const groups = (["RECOMMENDED", "USEFUL"] as const).map((group) => ({ group, items: kit.filter((item) => item.group === group) })).filter((entry) => entry.items.length);
  const hero = page.hero ?? page.products.find((product) => product.image)?.image ?? null;
  const caseStudy = page.linkedPages.find((card) => card.type === "CASE_STUDY");
  const start = `/contact?${new URLSearchParams({ topic: "project", project: page.slug })}`;
  const cta = data.ctaLabel || "Start this project";
  return (
    <SiteShell>
      <JsonLd data={[serviceLd(page), breadcrumbLd([{ name: "Projects", path: "/projects" }, { name: page.title, path: page.href }])]} />
      <section className={c.projectHero} aria-labelledby="project-title">
        <div className={c.projectHeroText}>
          <Crumbs items={[{ label: "Projects", href: "/projects" }, { label: page.title }]} />
          <h1 id="project-title" className={c.h1Page} data-enter>
            {data.headline || page.title}
          </h1>
          <p className={c.leadLarge}>{data.intro || page.summary}</p>
          <a className={c.red} href={start}>
            {cta}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <Photo className={c.projectHeroPhoto} image={hero ? { ...hero, alt: "" } : null} eager />
      </section>
      <div className={`${c.detailBody} ${c.pad}`}>
        <div className={c.detailMain}>
          {groups.length ? (
            <section className={c.section} aria-labelledby="kit-title">
              <h2 id="kit-title" className={c.h2}>
                {data.kitTitle || "What's usually in it"}
              </h2>
              {data.kitNote ? <p className={c.note}>{data.kitNote}</p> : null}
              {groups.map(({ group, items }) => (
                <div key={group} className={c.kitGroup}>
                  <p className={c.kitLabel} id={`kit-${group}`}>
                    {group}
                  </p>
                  <ul className={c.kitList} aria-labelledby={`kit-${group}`}>
                  {items.map((item) => {
                    const product = item.productSlug ? bySlug.get(item.productSlug) : undefined;
                    return (
                      <li key={`${item.label}-${item.productSlug ?? ""}`} className={c.kitItem}>
                        <div className={c.kitThumb}>{product?.image ? <img src={product.image.thumbnailUrl} alt="" loading="lazy" /> : null}</div>
                        <div className={c.kitText}>
                          <p className={c.kitName}>{product ? <a href={`/products/${product.slug}`}>{item.label}</a> : item.label}</p>
                          <p className={c.kitMeta}>{itemPrice(product)}</p>
                        </div>
                        <p className={c.kitQty}>
                          <span>Typical </span>
                          {item.quantity.toLocaleString("en-NG")}
                        </p>
                      </li>
                    );
                  })}
                  </ul>
                </div>
              ))}
            </section>
          ) : null}
          {data.timeline?.length ? (
            <section className={c.section} aria-labelledby="timeline-title">
              <h2 id="timeline-title" className={c.h2}>
                {data.timelineTitle || "How it usually goes"}
              </h2>
              <ol className={c.steps}>
                {data.timeline.map((step) => (
                  <li key={step.when} className={c.step}>
                    <p className={c.eyebrow}>{step.when}</p>
                    <p className={c.stepWhat}>{step.what}</p>
                  </li>
                ))}
              </ol>
              {data.timelineNote ? <p className={c.noteSmall}>{data.timelineNote}</p> : null}
            </section>
          ) : null}
          {page.body ? <div className={c.prose} dangerouslySetInnerHTML={{ __html: page.body }} /> : null}
          {caseStudy ? <CaseStudyLink card={caseStudy} /> : null}
        </div>
        <aside className={c.summary} aria-labelledby="summary-title">
          <h2 id="summary-title">Your {page.title.toLowerCase()} project</h2>
          <dl className={c.summaryRows}>
            <div>
              <dt>Items in the example</dt>
              <dd>{kit.length}</dd>
            </div>
            <div>
              <dt>Quantities</dt>
              <dd>You set them</dd>
            </div>
            <div>
              <dt>Dates</dt>
              <dd>In your quote</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>Across Nigeria</dd>
            </div>
          </dl>
          <span className={c.quoteChip}>
            <FileText size={14} aria-hidden="true" />
            QUOTE REQUIRED
          </span>
          <p className={c.summaryText}>No project total is shown until we&apos;ve reviewed your brief.</p>
          <a className={c.red} href={start}>
            {cta}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
          <p className={c.noteSmall}>Nothing is ordered until you accept a quote.</p>
        </aside>
      </div>
    </SiteShell>
  );
}

