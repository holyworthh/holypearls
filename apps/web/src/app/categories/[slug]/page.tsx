import type { HubSection, PublicHub } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "../../../components/catalogue/catalogue.module.css";
import { ProductCard } from "../../../components/catalogue/ProductCard";
import { categoryHref } from "../../../components/site/nav";
import { SiteShell } from "../../../components/site/SiteShell";
import { getHub } from "../../../lib/storefront";

type Params = { params: Promise<{ slug: string }> };

const validSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const hub = validSlug(slug) ? await getHub(slug).catch(() => null) : null;
  if (!hub) return { title: "Category not found", robots: { index: false } };
  return {
    title: { absolute: hub.seoTitle },
    description: hub.seoDescription ?? hub.category.description ?? undefined,
    alternates: { canonical: categoryHref(slug) },
  };
}

function Section({ section, hub }: { section: HubSection; hub: PublicHub }) {
  const id = `hub-${section.type}`;
  switch (section.type) {
    case "summary":
      return (
        <section className={styles.container} aria-labelledby={id}>
          <header className={styles.pageHead}>
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              <ol>
                <li>
                  <a href="/">Home</a>
                </li>
                <li>
                  <a href="/products">Products</a>
                </li>
                {hub.parent ? (
                  <li>
                    <a href={categoryHref(hub.parent.slug)}>{hub.parent.name}</a>
                  </li>
                ) : null}
                <li aria-current="page">{hub.category.name}</li>
              </ol>
            </nav>
            <div className={styles.heroText}>
              <h1 id={id} className={styles.h1}>
                {section.heading || hub.category.name}
              </h1>
              {section.body ? <p className={styles.lead}>{section.body}</p> : null}
              <div className={styles.actions}>
                <a className={styles.primary} href={`/products?category=${hub.category.slug}`}>
                  {section.primaryLabel || "Browse products"} ({hub.category.productCount})
                </a>
                {section.secondaryLabel && section.secondaryHref ? (
                  <a className={styles.secondary} href={section.secondaryHref.startsWith("/") ? section.secondaryHref : "/contact?topic=project"}>
                    {section.secondaryLabel}
                  </a>
                ) : null}
              </div>
            </div>
          </header>
        </section>
      );
    case "subcategories":
      return hub.category.children.length ? (
        <section className={`${styles.section} ${styles.bone}`} aria-labelledby={id}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 id={id} className={styles.sectionTitle}>
                {section.heading}
              </h2>
            </div>
            <ul className={styles.subGrid}>
              {hub.category.children.map((child) => (
                <li key={child.slug} className={styles.tile}>
                  <h3 className={styles.tileTitle}>
                    <a href={categoryHref(child.slug)}>{child.name}</a>
                  </h3>
                  <span className={styles.tileMeta}>{child.productCount}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null;
    case "featured":
      return hub.featured.length ? (
        <section className={styles.section} aria-labelledby={id}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 id={id} className={styles.sectionTitle}>
                {section.heading}
              </h2>
              <a className={styles.headLink} href={`/products?category=${hub.category.slug}`}>
                See all →
              </a>
            </div>
            <ul className={styles.grid}>
              {hub.featured.map((product) => (
                <li key={product.slug}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null;
    case "grid":
      return (
        <section className={styles.section} aria-labelledby={id}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 id={id} className={styles.sectionTitle}>
                {section.heading}
              </h2>
              <a className={styles.headLink} href={`/products?category=${hub.category.slug}`}>
                Filter and sort →
              </a>
            </div>
            {hub.products.length ? (
              <ul className={styles.grid}>
                {hub.products.map((product) => (
                  <li key={product.slug}>
                    <ProductCard product={product} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>Nothing listed here yet</p>
                <p>Tell us what you need and we&apos;ll make it.</p>
                <a className={styles.primary} href="/contact?topic=custom-request">
                  Tell us what you need
                </a>
              </div>
            )}
          </div>
        </section>
      );
    case "process":
      return section.steps.length ? (
        <section className={`${styles.section} ${styles.bone}`} aria-labelledby={id}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 id={id} className={styles.sectionTitle}>
                {section.heading}
              </h2>
            </div>
            <ol className={styles.numbered}>
              {section.steps.map((step, index) => (
                <li key={step.title} className={styles.tile}>
                  <span className={styles.tileNumber}>{String.fromCharCode(65 + index)}</span>
                  <h3 className={styles.tileTitle}>{step.title}</h3>
                  <p className={styles.tileBody}>{step.body}</p>
                  {step.detail ? <span className={styles.tileMeta}>{step.detail.toUpperCase()}</span> : null}
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null;
    case "guidance":
      return section.columns.length && section.rows.length ? (
        <section className={styles.section} aria-labelledby={id}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 id={id} className={styles.sectionTitle}>
                {section.heading}
              </h2>
            </div>
            {section.intro ? <p className={`${styles.lead} ${styles.muted}`}>{section.intro}</p> : null}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {section.columns.map((column) => (
                      <th key={column} scope="col">
                        {column.toUpperCase()}
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
                            {cell}
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
            {section.note ? <p className={styles.note}>{section.note}</p> : null}
          </div>
        </section>
      ) : null;
    case "faq":
      return section.items.length ? (
        <section className={styles.section} aria-labelledby={id}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 id={id} className={styles.sectionTitle}>
                {section.heading}
              </h2>
            </div>
            <div className={styles.faq}>
              {section.items.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null;
    case "related":
      return section.links.length ? (
        <section className={`${styles.section} ${styles.bone}`} aria-labelledby={id}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 id={id} className={styles.sectionTitle}>
                {section.heading}
              </h2>
            </div>
            <ul className={styles.numbered}>
              {section.links.map((link) => (
                <li key={link.href + link.title} className={styles.tile}>
                  <h3 className={styles.tileTitle}>
                    <a href={link.href.startsWith("/") ? link.href : "/"}>{link.title}</a>
                  </h3>
                  {link.body ? <p className={styles.tileBody}>{link.body}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null;
  }
}

/**
 * Category hub (Pen 18 · jUd9y, 11 · YBK8S; PUB-FR-009). Rendered on the
 * server from the published hub; staff edits refresh it through cache tags.
 */
export default async function CategoryHubPage({ params }: Params) {
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const hub = await getHub(slug);
  if (!hub) notFound();
  return (
    <SiteShell>
      {hub.sections.some((section) => section.type === "summary") ? null : (
        <Section
          section={{ type: "summary", visible: true, heading: hub.category.name, body: hub.category.description ?? "", primaryLabel: "", secondaryLabel: "", secondaryHref: "" }}
          hub={hub}
        />
      )}
      {hub.sections.map((section) => (
        <Section key={section.type} section={section} hub={hub} />
      ))}
    </SiteShell>
  );
}
