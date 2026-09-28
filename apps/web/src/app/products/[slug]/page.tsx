import { configurationSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "../../../components/catalogue/catalogue.module.css";
import { Configurator } from "../../../components/catalogue/Configurator";
import cfg from "../../../components/catalogue/configurator.module.css";
import { Gallery } from "../../../components/catalogue/Gallery";
import { ProductCard } from "../../../components/catalogue/ProductCard";
import { categoryHref } from "../../../components/site/nav";
import { DELIVERY_COVERAGE, SiteShell } from "../../../components/site/SiteShell";
import { serverApi } from "../../../lib/server-api";
import { getProduct } from "../../../lib/storefront";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ draft?: string }> };
const validSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

const PROCESS = [
  ["Configure", "Choose options and quantity; the price updates as you go."],
  ["Artwork", "Upload your design, send it later, or ask for design help."],
  ["Proof", "We check your file and send a proof. Nothing is printed until you approve it."],
  ["Make and deliver", "We produce, check every item and deliver to your address."],
] as const;

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
 * The shared product page (T03-03, COM-FR-001–005; Pen 21 · VSjt2, 20 · XX8rq):
 * gallery, title and price state, the inline configurator with the price next
 * to the choices, MOQ and lead time, how it works, specifications, FAQ and
 * related products. A `?draft=` address reopens a saved design (owners only).
 */
export default async function ProductPage({ params, searchParams }: Params) {
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const product = await getProduct(slug);
  if (!product) notFound();
  const { draft: draftId } = await searchParams;
  const draft =
    draftId && /^[0-9a-f-]{36}$/.test(draftId) && product.configurator ? await serverApi(`/v1/configurations/${draftId}`, configurationSchema) : null;
  const initialDraft = draft?.ok && draft.data.productSlug === product.slug ? draft.data : null;

  return (
    <SiteShell>
      <div className={styles.container}>
        <header className={styles.pageHead}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <ol>
              <li>
                <a href="/products">Products</a>
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

        <div className={cfg.top}>
          <Gallery images={product.images} name={product.name} />
          <div className={cfg.configurator}>
            <div className={cfg.titleBlock}>
              <h1 className={cfg.title}>{product.name}</h1>
              {product.summary ? <p className={styles.lead}>{product.summary}</p> : null}
              {product.configurator ? (
                <dl className={cfg.facts}>
                  <div>
                    <dt>Minimum</dt>
                    <dd>{product.configurator.moq.toLocaleString("en-NG")}</dd>
                  </div>
                  {product.configurator.leadDays ? (
                    <div>
                      <dt>Lead time</dt>
                      <dd>
                        {product.configurator.leadDays.min}–{product.configurator.leadDays.max} working days
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </div>
            {!product.available ? (
              <p className={cfg.placeholder} role="status">
                This product can&apos;t be ordered right now. Ask us when it&apos;s back or for an alternative.
              </p>
            ) : null}
            {product.configurator && product.available ? (
              <Configurator productSlug={product.slug} productName={product.name} data={product.configurator} initialDraft={initialDraft} />
            ) : (
              <div className={styles.actions}>
                <a className={styles.primary} href={`/contact?topic=${product.configurator ? "product" : "project"}&product=${product.slug}`}>
                  {product.configurator ? "Ask about this product" : "Start a project"}
                </a>
              </div>
            )}
          </div>
        </div>

        {product.description ? (
          <section className={styles.section} aria-labelledby="about-title">
            <h2 id="about-title" className={styles.sectionTitle}>
              About {product.name.toLowerCase()}
            </h2>
            <p className={`${styles.lead} ${styles.muted}`}>{product.description}</p>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="process-title">
          <div className={styles.sectionHead}>
            <h2 id="process-title" className={styles.sectionTitle}>
              How it works
            </h2>
          </div>
          <ol className={styles.numbered}>
            {PROCESS.map(([title, body], index) => (
              <li key={title} className={styles.tile}>
                <span className={styles.tileNumber}>{String(index + 1).padStart(2, "0")}</span>
                <h3 className={styles.tileTitle}>{title}</h3>
                <p className={styles.tileBody}>{body}</p>
              </li>
            ))}
          </ol>
          <p className={styles.note}>{DELIVERY_COVERAGE}</p>
        </section>

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
