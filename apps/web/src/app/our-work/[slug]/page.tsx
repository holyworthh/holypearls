import type { CaseStudyData } from "@holypearls/contracts";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import c from "../../../components/content/content.module.css";
import { Crumbs, Photo } from "../../../components/content/Parts";
import { JsonLd } from "../../../components/seo/JsonLd";
import { SiteShell } from "../../../components/site/SiteShell";
import { getContentPage } from "../../../lib/content";
import { articleLd, breadcrumbLd, pageMetadata } from "../../../lib/seo";

type Params = { params: Promise<{ slug: string }> };
const validSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
const load = async (slug: string) => (validSlug(slug) ? getContentPage("CASE_STUDY", slug) : null);

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
  const data = page.data as Partial<CaseStudyData>;
  const bySlug = new Map(page.products.map((product) => [product.slug, product]));
  const project = page.linkedPages.find((card) => card.type === "PROJECT");
  const gallery = (data.gallery ?? []).flatMap((item) => (page.images[item.fileId] ? [page.images[item.fileId]!] : []));
  const eyebrow = [data.sector, data.location].filter(Boolean).join(" · ");
  // Until the case has its own photo, it shows a real photo of a product it names.
  const hero = page.hero ?? page.products.find((product) => product.image)?.image ?? null;
  return (
    <SiteShell>
      <JsonLd data={[articleLd(page), breadcrumbLd([{ name: "Our work", path: "/our-work" }, { name: page.title, path: page.href }])]} />
      <section className={`${c.caseHero} ${c.pad}`} style={hero ? { backgroundImage: `url("${hero.url}")` } : undefined} aria-labelledby="case-title">
        {page.demo ? <p className={c.darkTicket}>DEMO PROJECT · PLACEHOLDER CONTENT UNTIL A REAL CASE IS APPROVED</p> : <span />}
        <div className={c.caseHeroPanel}>
          <Crumbs items={[{ label: "Our work", href: "/our-work" }, { label: page.title }]} />
          {eyebrow ? <p className={c.caseHeroEyebrow}>{eyebrow}</p> : null}
          <h1 id="case-title" className={c.caseTitle} data-enter>
            {data.headline || page.title}
          </h1>
        </div>
      </section>
      <div className={`${c.caseBody} ${c.pad}`}>
        <div className={c.story}>
          {page.body ? <div className={c.prose} dangerouslySetInnerHTML={{ __html: page.body }} /> : null}
          {data.made?.length ? (
            <section className={c.section} aria-labelledby="made-title">
              <h2 id="made-title" className={c.h2}>
                What we made
              </h2>
              <ul className={c.madeRow}>
                {data.made.map((item) => {
                  const product = item.productSlug ? bySlug.get(item.productSlug) : undefined;
                  return (
                    <li key={item.label} className={`${c.card} ${c.made}`}>
                      <Photo image={product?.image ? { ...product.image, alt: "" } : null} />
                      <p className={c.madeName}>{product ? <a className={c.stretch} href={`/products/${product.slug}`}>{item.label}</a> : item.label}</p>
                      <p className={c.madeDetail}>{item.detail}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {gallery.length ? (
            <div className={c.gallery}>
              {gallery.slice(0, 3).map((image) => (
                <Photo key={image.url} image={image} />
              ))}
            </div>
          ) : null}
        </div>
        {data.facts?.length ? (
          <aside className={c.facts} aria-labelledby="facts-title">
            <h2 id="facts-title" className={c.caseHeroEyebrow}>
              VERIFIED FACTS
            </h2>
            <dl>
              {data.facts.map((fact) => (
                <div key={fact.label} className={c.fact}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
            {data.factsNote ? <p className={c.factsNote}>{data.factsNote}</p> : null}
          </aside>
        ) : null}
      </div>
      <section className={`${c.ctaBand} ${c.pad} ${c.onDark}`} aria-labelledby="similar-title">
        <div className={c.ctaText}>
          <h2 id="similar-title">Planning something similar?</h2>
          <p>{project ? `Start a project like this one. We'll suggest the items and quantities for what you need.` : "Tell us what it's for. We'll suggest the items and quantities and send one quote."}</p>
        </div>
        <div className={c.actions}>
          <a className={c.red} href={`/contact?${new URLSearchParams({ topic: "project", ...(project ? { project: project.slug } : {}) })}`}>
            Start a similar project
            <ArrowRight size={16} aria-hidden="true" />
          </a>
          {project ? (
            <a className={c.outlineLight} href={project.href}>
              {project.title} products
            </a>
          ) : null}
        </div>
      </section>
    </SiteShell>
  );
}
