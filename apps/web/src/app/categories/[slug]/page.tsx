import { slugSchema } from "@holypearls/contracts";
import type { HubSection, PublicHub } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import h from "../../../components/catalogue/hub.module.css";
import { ProductCard } from "../../../components/catalogue/ProductCard";
import { Icon } from "../../../components/pen/Icon";
import { categoryHref } from "../../../components/site/nav";
import { SiteShell } from "../../../components/site/SiteShell";
import { JsonLd } from "../../../components/seo/JsonLd";
import { breadcrumbLd, collectionLd } from "../../../lib/seo";
import { getHub } from "../../../lib/storefront";

type Params = { params: Promise<{ slug: string }> };
type Of<T extends HubSection["type"]> = Extract<HubSection, { type: T }>;


export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const hub = slugSchema.safeParse(slug).success ? await getHub(slug).catch(() => null) : null;
  if (!hub) return { title: "Category not found", robots: { index: false } };
  return {
    title: { absolute: hub.seoTitle },
    description: hub.seoDescription ?? hub.category.description ?? undefined,
    alternates: { canonical: categoryHref(slug) },
  };
}

/**
 * The design's labelled reference photos for hub sections that don't carry
 * images yet (temporary; see DESIGN-FIDELITY). Subcategory cards use each
 * subcategory's own image from the catalogue, never one picked by position.
 */
const PHOTOS = {
  editorial: { hero: [50, 52, 60], routes: [33, 51, 47], table: [52, 61, 59], related: [50, 57] },
  catalogue: { band: 45, related: [91, 87] },
};

const bg = (url: string | null | undefined, fallback: number | undefined): CSSProperties | undefined =>
  url ? { backgroundImage: `url("${url}")` } : fallback ? { backgroundImage: `url("/pen/generated-${fallback}.webp")` } : undefined;

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;
const safeHref = (href: string) => (href.startsWith("/") ? href : "/contact?topic=project");
const lines = (text: string) => {
  const words = text.split(" ");
  if (words.length < 3) return text;
  const cut = Math.ceil(words.length / 2);
  return (
    <>
      {words.slice(0, cut).join(" ")}
      <br />
      {words.slice(cut).join(" ")}
    </>
  );
};

function Breadcrumb({ hub }: { hub: PublicHub }) {
  return (
    <nav className={h.breadcrumb} aria-label="Breadcrumb">
      <ol>
        <li>
          <a href="/">Home</a>
        </li>
        {hub.parent ? (
          <li>
            <a href={categoryHref(hub.parent.slug)}>{hub.parent.name}</a>
          </li>
        ) : null}
        <li aria-current="page">{hub.category.name}</li>
      </ol>
    </nav>
  );
}

function Summary({ section, hub, editorial }: { section: Of<"summary">; hub: PublicHub; editorial: boolean }) {
  const browse = `/products?category=${hub.category.slug}`;
  const primary = `${section.primaryLabel || "Browse"} ${editorial ? "" : ""}`.trim();
  if (editorial) {
    const [a, b, c] = PHOTOS.editorial.hero;
    return (
      <section className={`${h.hero} ${h.pad}`} aria-labelledby="hub-title">
        <div className={h.heroText}>
          <h1 id="hub-title" className={h.h1} data-enter>
            {lines(section.heading || hub.category.name)}
          </h1>
          {section.body ? <p className={h.intro}>{section.body}</p> : null}
          <div className={h.heroActions}>
            <a className={h.inkButton} href={browse}>
              {primary === "Browse products" ? `Browse ${plural(hub.category.productCount, "product")}` : primary}
            </a>
            {section.secondaryLabel ? (
              <a className={h.outlineButton} href={safeHref(section.secondaryHref)}>
                {section.secondaryLabel}
              </a>
            ) : null}
          </div>
        </div>
        <div className={h.heroMedia} aria-hidden="true">
          <span className={`${h.heroMain} ${h.photo}`} style={bg(hub.category.image?.url, a)} />
          <span className={h.heroCol}>
            <span className={h.photo} style={bg(null, b)} />
            <span className={h.photo} style={bg(null, c)} />
          </span>
        </div>
      </section>
    );
  }
  return (
    <section className={`${h.catHead} ${h.pad}`} aria-labelledby="hub-title">
      <Breadcrumb hub={hub} />
      <div className={h.catTitleRow}>
        <h1 id="hub-title" className={h.h1} data-enter>
          {section.heading || hub.category.name}
        </h1>
        {section.body ? <p className={h.catIntro}>{section.body}</p> : null}
      </div>
      {hub.category.children.length ? (
        <ul className={`${h.list} ${h.catCards}`}>
          {hub.category.children.map((child) => (
            <li key={child.slug} className={h.catCard}>
              <span className={`${h.catPhoto} ${h.photo}`} style={bg(child.image?.url, undefined)} />
              <div className={h.catText}>
                <h2 className={h.catName}>
                  <a className={h.cardLink} href={categoryHref(child.slug)}>
                    {child.name}
                  </a>
                  <Icon name="arrow-right" size={18} />
                </h2>
                <p className={h.catMeta}>{plural(child.productCount, "product")}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Subcategories({ section, hub, editorial }: { section: Of<"subcategories">; hub: PublicHub; editorial: boolean }) {
  // The catalogue layout shows its subcategories as cards in the header.
  if (!editorial || !hub.category.children.length) return null;
  return (
    <section className={`${h.subs} ${h.pad}`} aria-labelledby="hub-subs">
      <div className={h.sectionHead}>
        <h2 id="hub-subs" className={h.sectionTitle}>
          {section.heading}
        </h2>
        <a className={h.headLink} href={`/products?category=${hub.category.slug}`}>
          All {hub.category.productCount} →
        </a>
      </div>
      <ul className={`${h.list} ${h.subRow}`}>
        {hub.category.children.map((child) => (
          <li key={child.slug} className={h.sub}>
            <span className={`${h.subPhoto} ${h.photo}`} style={bg(child.image?.url, undefined)} />
            <span className={h.subName}>
              <a className={h.cardLink} href={categoryHref(child.slug)}>
                {child.name}
              </a>
              <span className={h.subCount}>{child.productCount}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Featured({ section, hub }: { section: Of<"featured">; hub: PublicHub }) {
  const products = hub.featured.length ? hub.featured : hub.products.slice(0, 4);
  if (!products.length) return null;
  return (
    <section className={`${h.featured} ${h.pad}`} aria-labelledby="hub-featured">
      <div className={h.sectionHead}>
        <h2 id="hub-featured" className={h.sectionTitle}>
          {section.heading}
        </h2>
        <a className={h.headLink} href={`/products?category=${hub.category.slug}`}>
          See all →
        </a>
      </div>
      <ul className={`${h.list} ${h.productRow}`}>
        {[...products, ...hub.products.filter((product) => !products.some((item) => item.slug === product.slug))].slice(0, 4).map((product) => (
          <li key={product.slug}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Process({ section, editorial }: { section: Of<"process">; editorial: boolean }) {
  if (!section.steps.length) return null;
  if (editorial) {
    return (
      <section className={`${h.routes} ${h.pad}`} aria-labelledby="hub-process">
        <h2 id="hub-process" className={h.routesTitle}>
          {section.heading}
        </h2>
        <ol className={`${h.list} ${h.routeGrid}`}>
          {section.steps.map((step, index) => (
            <li key={step.title} className={h.route}>
              <span className={`${h.routePhoto} ${h.photo}`} style={bg(null, PHOTOS.editorial.routes[index % 3])} />
              <span className={h.routeHead}>
                <span className={h.letter} aria-hidden="true">
                  {String.fromCharCode(65 + index)}
                </span>
                <h3 className={h.routeTitle}>{step.title}</h3>
              </span>
              {step.body ? <p className={h.routeBody}>{step.body}</p> : null}
              {step.detail ? <p className={h.best}>{step.detail}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    );
  }
  const note = section.steps.map((step) => step.body).filter(Boolean);
  return (
    <section className={h.band} aria-labelledby="hub-process">
      <span className={`${h.bandPhoto} ${h.photo}`} data-unveil style={bg(null, PHOTOS.catalogue.band)} aria-hidden="true" />
      <div className={h.bandText}>
        <p className={h.bandEyebrow}>PRINTED IN OUR OWN PRODUCTION</p>
        <h2 id="hub-process" className={h.bandTitle}>
          {section.heading}
        </h2>
        <ol className={h.bandSteps}>
          {section.steps.map((step, index) => (
            <li key={step.title}>
              <span className={h.bandNum} aria-hidden="true">
                {index + 1}
              </span>
              {step.title}
            </li>
          ))}
        </ol>
        {note.length ? <p className={h.bandNote}>{note.join(" ")}</p> : null}
      </div>
    </section>
  );
}

function Guidance({ section, editorial }: { section: Of<"guidance">; editorial: boolean }) {
  if (!section.columns.length || !section.rows.length) return null;
  if (editorial) {
    return (
      <section id="compare" className={`${h.compare} ${h.pad}`} aria-labelledby="hub-guidance">
        <div className={h.sectionHead}>
          <h2 id="hub-guidance" className={h.sectionTitle}>
            {section.heading}
          </h2>
        </div>
        {section.intro ? <p className={h.intro}>{section.intro}</p> : null}
        <div className={h.tableWrap} tabIndex={0} role="region" aria-label="Route comparison, scrolls sideways">
          <table className={h.table}>
            <thead>
              <tr>
                {section.columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) =>
                    cellIndex === 0 ? (
                      <th key={cellIndex} scope="row">
                        <span className={h.methodCell}>
                          <span className={`${h.thumb} ${h.photo}`} style={bg(null, PHOTOS.editorial.table[index % 3])} aria-hidden="true" />
                          {cell}
                        </span>
                      </th>
                    ) : (
                      <td key={cellIndex}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {section.note ? <p className={h.note}>{section.note}</p> : null}
      </section>
    );
  }
  return (
    <section className={`${h.format} ${h.pad}`} aria-labelledby="hub-guidance">
      <div className={h.formatText}>
        <h2 id="hub-guidance" className={h.sectionTitle}>
          {section.heading}
        </h2>
        {section.intro ? <p className={h.formatIntro}>{section.intro}</p> : null}
      </div>
      <table className={h.formatTable}>
        <thead>
          <tr>
            {section.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {section.note ? <p className={h.note}>{section.note}</p> : null}
    </section>
  );
}

function Guides({ section }: { section: Of<"faq"> }) {
  return (
    <div className={h.guides}>
      <h2 className={h.guidesLabel}>{section.heading}</h2>
      {section.items.map((item) => (
        <details key={item.question} className={h.guide}>
          <summary>
            <Icon name="book-open" size={18} />
            <span className={h.guideText}>{item.question}</span>
            <Icon name="arrow-right" size={18} className={h.guideArrow} />
          </summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

function RelatedAndGuides({ related, faq, editorial }: { related?: Of<"related">; faq?: Of<"faq">; editorial: boolean }) {
  const links = related?.visible ? related.links : [];
  const items = faq?.visible && faq.items.length ? faq : undefined;
  if (!links.length && !items) return null;
  const photos = editorial ? PHOTOS.editorial.related : PHOTOS.catalogue.related;
  return (
    <section className={`${editorial ? h.pg : h.bigger} ${h.pad}`} aria-labelledby="hub-related">
      <div className={editorial ? h.projects : h.biggerCol}>
        <h2 id="hub-related" className={editorial ? h.pjTitle : h.biggerTitle}>
          {related?.heading}
        </h2>
        {editorial ? (
          <ul className={`${h.list} ${h.relatedGrid}`}>
            {links.map((link, index) => (
              <li key={link.title} className={h.relatedCard}>
                <span className={`${h.relatedPhoto} ${h.photo}`} style={bg(null, photos[index % photos.length])} />
                <h3 className={h.relatedTitle}>
                  <a className={h.cardLink} href={safeHref(link.href)}>
                    {link.title}
                  </a>
                </h3>
                {link.body ? <p className={h.relatedBody}>{link.body}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <ul className={h.list}>
            {links.map((link, index) => (
              <li key={link.title} className={`${h.rowCard} ${h.relatedCard}`}>
                <span className={`${h.rowPhoto} ${h.photo}`} style={bg(null, photos[index % photos.length])} />
                <span className={h.rowText}>
                  <h3 className={h.relatedTitle}>
                    <a className={h.cardLink} href={safeHref(link.href)}>
                      {link.title}
                    </a>
                  </h3>
                  {link.body ? <p className={h.relatedBody}>{link.body}</p> : null}
                </span>
                <Icon name="arrow-right" size={18} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {items ? editorial ? <Guides section={items} /> : <div className={h.biggerCol}><h2 className={h.biggerTitle}>{items.heading}</h2><Guides section={{ ...items, heading: "" }} /></div> : null}
    </section>
  );
}

function Grid({ section, hub }: { section: Of<"grid">; hub: PublicHub }) {
  return (
    <section className={`${h.featured} ${h.pad}`} aria-labelledby="hub-grid">
      <div className={h.sectionHead}>
        <h2 id="hub-grid" className={h.sectionTitle}>
          {section.heading}
        </h2>
        <a className={h.headLink} href={`/products?category=${hub.category.slug}`}>
          Filter and sort →
        </a>
      </div>
      {hub.products.length ? (
        <ul className={`${h.list} ${h.productRow}`}>
          {hub.products.map((product) => (
            <li key={product.slug}>
              <ProductCard product={product} variant="compact" />
            </li>
          ))}
        </ul>
      ) : (
        <p className={h.intro}>
          Nothing listed here yet. <a className={h.textLink} href="/contact?topic=custom-request">Tell us what you need</a> and we&apos;ll make it.
        </p>
      )}
    </section>
  );
}

/**
 * Category hub (Pen 18 · jUd9y editorial, 11 · YBK8S catalogue; PUB-FR-009).
 * The hub's `layout` picks the design.
 * Sections, their order and visibility come from the published hub.
 */
export default async function CategoryHubPage({ params }: Params) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();
  const hub = await getHub(slug);
  if (!hub) notFound();
  // The layout is the hub's own setting (staff choose it in the hub editor), not the category's address.
  const editorial = hub.layout === "EDITORIAL";
  const visible = hub.sections.filter((section) => section.visible);
  const summary = visible.find((section) => section.type === "summary") as Of<"summary"> | undefined;
  const related = hub.sections.find((section) => section.type === "related") as Of<"related"> | undefined;
  const faq = hub.sections.find((section) => section.type === "faq") as Of<"faq"> | undefined;
  let pairShown = false;
  const path = categoryHref(hub.category.slug);
  return (
    <SiteShell>
      {/* Category: CollectionPage with its products, and the breadcrumb (Stage 3 §48; T14-01). */}
      <JsonLd
        data={[
          collectionLd(hub.category.name, path, hub.products, hub.seoDescription ?? hub.category.description),
          breadcrumbLd([{ name: "Home", path: "/" }, ...(hub.parent ? [{ name: hub.parent.name, path: categoryHref(hub.parent.slug) }] : []), { name: hub.category.name, path }]),
        ]}
      />
      {summary ? null : (
        <Summary
          section={{ type: "summary", visible: true, heading: hub.category.name, body: hub.category.description ?? "", primaryLabel: "Browse products", secondaryLabel: "", secondaryHref: "" }}
          hub={hub}
          editorial={editorial}
        />
      )}
      {visible.map((section) => {
        switch (section.type) {
          case "summary":
            return <Summary key="summary" section={section} hub={hub} editorial={editorial} />;
          case "subcategories":
            return <Subcategories key="subs" section={section} hub={hub} editorial={editorial} />;
          case "featured":
            return <Featured key="featured" section={section} hub={hub} />;
          case "grid":
            return <Grid key="grid" section={section} hub={hub} />;
          case "process":
            return <Process key="process" section={section} editorial={editorial} />;
          case "guidance":
            return <Guidance key="guidance" section={section} editorial={editorial} />;
          case "related":
          case "faq":
            if (pairShown) return null;
            pairShown = true;
            return <RelatedAndGuides key="pair" related={related} faq={faq} editorial={editorial} />;
        }
      })}
    </SiteShell>
  );
}
