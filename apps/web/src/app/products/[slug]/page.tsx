import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "../../../components/catalogue/catalogue.module.css";
import { ProductCard } from "../../../components/catalogue/ProductCard";
import { categoryHref } from "../../../components/site/nav";
import { SiteShell } from "../../../components/site/SiteShell";
import { getProduct } from "../../../lib/storefront";

type Params = { params: Promise<{ slug: string }> };
const validSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

const NEXT_STEP: Record<string, { line: string; action: string; href: (slug: string) => string }> = {
  PRICE_ON_CONFIGURATION: { line: "Choose your options and see the price as you go.", action: "Ask about this product", href: (slug) => `/contact?topic=product&product=${slug}` },
  QUOTE_REQUIRED: { line: "Tell us what you need and we'll send a quote after reviewing it.", action: "Ask for a quote", href: (slug) => `/contact?topic=quote&product=${slug}` },
  CONSULTATION_REQUIRED: { line: "We plan this with you: tell us about your team, dates and budget.", action: "Start a project", href: (slug) => `/contact?topic=project&product=${slug}` },
  UNAVAILABLE: { line: "This product can't be ordered right now.", action: "Ask when it's back", href: (slug) => `/contact?topic=product&product=${slug}` },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = validSlug(slug) ? await getProduct(slug).catch(() => null) : null;
  if (!product) return { title: "Product not found", robots: { index: false } };
  return {
    title: { absolute: product.seoTitle },
    description: product.seoDescription ?? undefined,
    alternates: { canonical: `/products/${slug}` },
    openGraph: product.images[0] ? { images: [{ url: product.images[0].url, alt: product.images[0].alt }] } : undefined,
  };
}

/**
 * The product page's first version (T02-03): what the product is, its images,
 * specifications and questions, and how to order it. The configurator,
 * prices and structured data arrive with T03-03.
 */
export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const product = await getProduct(slug);
  if (!product) notFound();
  const next = NEXT_STEP[product.priceState]!;
  return (
    <SiteShell>
      <div className={styles.container}>
        <header className={styles.pageHead}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <ol>
              <li>
                <a href="/">Home</a>
              </li>
              {product.categoryParent ? (
                <li>
                  <a href={categoryHref(product.categoryParent.slug)}>{product.categoryParent.name}</a>
                </li>
              ) : null}
              <li>
                <a href={categoryHref(product.category.slug)}>{product.category.name}</a>
              </li>
              <li aria-current="page">{product.name}</li>
            </ol>
          </nav>
        </header>
        <div className={styles.hero}>
          <div className={styles.heroMedia}>
            {product.images[0] ? <img src={product.images[0].url} alt={product.images[0].alt} width={product.images[0].width ?? 2000} height={product.images[0].height ?? 1500} /> : null}
          </div>
          <div className={styles.heroText}>
            <h1 className={styles.h1}>{product.name}</h1>
            {product.summary ? <p className={styles.lead}>{product.summary}</p> : null}
            <p className={styles.priceRow}>{next.line}</p>
            <div className={styles.actions}>
              <a className={styles.primary} href={next.href(product.slug)}>
                {next.action}
              </a>
            </div>
            {product.description ? <p className={styles.muted}>{product.description}</p> : null}
          </div>
        </div>
        {product.specifications.length ? (
          <section className={styles.section} aria-labelledby="specs-title">
            <h2 id="specs-title" className={styles.sectionTitle}>
              Specifications
            </h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <tbody>
                  {product.specifications.map((spec) => (
                    <tr key={spec.label}>
                      <th scope="row">{spec.label}</th>
                      <td>{spec.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        {product.faqs.length ? (
          <section className={styles.section} aria-labelledby="faq-title">
            <h2 id="faq-title" className={styles.sectionTitle}>
              Questions
            </h2>
            <div className={styles.faq}>
              {product.faqs.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}
        {product.related.length ? (
          <section className={styles.section} aria-labelledby="related-title">
            <div className={styles.sectionHead}>
              <h2 id="related-title" className={styles.sectionTitle}>
                You may also need
              </h2>
            </div>
            <ul className={styles.grid}>
              {product.related.map((item) => (
                <li key={item.slug}>
                  <ProductCard product={item} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}
