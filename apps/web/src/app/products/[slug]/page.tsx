import { configurationSchema, customerPriceState, type PublicProduct } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Configurator } from "../../../components/catalogue/Configurator";
import { GarmentConfigurator } from "../../../components/catalogue/GarmentConfigurator";
import s from "../../../components/catalogue/ledger-pdp.module.css";
import { PdpGallery } from "../../../components/catalogue/PdpGallery";
import { ProductCard } from "../../../components/catalogue/ProductCard";
import { Icon } from "../../../components/pen/Icon";
import { JsonLd } from "../../../components/seo/JsonLd";
import { categoryHref } from "../../../components/site/nav";
import { DELIVERY_COVERAGE, SiteShell } from "../../../components/site/SiteShell";
import { breadcrumbLd, productLd } from "../../../lib/seo";
import { hasSessionCookie, serverApi } from "../../../lib/server-api";
import { getProduct } from "../../../lib/storefront";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ draft?: string; sourcing?: string; colour?: string }> };
const validSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

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
 * The "how we brand it" copy follows the decorations this product offers
 * (configurator.allowedDecorations), so a print-only garment never promises
 * embroidery.
 */
function brandingCopy(decorations: string[]) {
  const embroidery = decorations.includes("EMBROIDERY");
  const print = decorations.includes("PRINT");
  if (embroidery && print) {
    return {
      title: "Embroidery or print?",
      body: "Embroidery lasts and feels premium. It's best for logos on the chest. Print suits large or detailed artwork, like a design across the back. Not sure? Choose “Recommend for me” and we'll advise after seeing your logo.",
    };
  }
  if (embroidery) return { title: "We prepare your logo for embroidery", body: "Just send your logo. We convert it into an embroidery file and show you a proof before we stitch anything. When you reorder, we use the same approved file." };
  if (print) return { title: "We prepare your logo for print", body: "Just send your logo. We turn it into a print file and show you a proof before we print anything. When you reorder, we use the same approved file." };
  return { title: "We agree the branding with you", body: "Tell us what you'd like on it. We confirm how it's made and show you a proof before we produce anything." };
}

/** The stage tint follows the family (Pen): garments Holy Blue, print Brick, others white. */
const tintFor = (family: string) => (family === "GARMENT" ? "brand" : family === "PAPER_PRINT" || family === "LARGE_FORMAT" ? "print" : null);

function Crumbs({ product }: { product: PublicProduct }) {
  return (
    <nav className={s.crumbs} aria-label="Breadcrumb">
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
  );
}

/** Title, summary and the facts that hold for every configuration (Pen: minimum, production time). */
function Head({ product, from }: { product: PublicProduct; from: string | null }) {
  const config = product.configurator;
  const unit = product.family === "GARMENT" ? "piece" : "each";
  return (
    <>
      <h1 id="product-title" className={s.title} data-enter>
        {product.name}
      </h1>
      {product.summary ? <p className={s.lead}>{product.summary}</p> : null}
      <ul className={s.meta} aria-label="At a glance">
        {from ? <li>From {from} / {unit}</li> : null}
        {config ? (
          <li>
            <Icon name="boxes" size={14} />
            Minimum {config.moq.toLocaleString("en-NG")}
          </li>
        ) : null}
        {config?.leadDays ? (
          <li>
            <Icon name="clock-3" size={14} />
            {config.leadDays.min}–{config.leadDays.max} working days to produce
          </li>
        ) : null}
      </ul>
    </>
  );
}

function Questions({ product }: { product: PublicProduct }) {
  return (
    <section className={s.col} aria-labelledby="faq-title">
      <h2 id="faq-title" className={s.colTitle}>
        Questions
      </h2>
      {product.faqs.length ? (
        <div className={s.faq}>
          {product.faqs.map((item) => (
            <details key={item.question}>
              <summary>
                {item.question}
                <Icon name="plus" size={16} />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      ) : (
        <p className={s.colBody}>{DELIVERY_COVERAGE}</p>
      )}
      <a className={s.colLink} href={`/contact?topic=product&product=${product.slug}`}>
        Ask Holypearls about this product
      </a>
    </section>
  );
}

function Specifications({ product, title = "Specifications" }: { product: PublicProduct; title?: string }) {
  if (!product.specifications.length && !product.description) return null;
  return (
    <section className={s.col} aria-labelledby="specs-title">
      <h2 id="specs-title" className={s.colTitle}>
        {title}
      </h2>
      {product.description ? <p className={s.colBody}>{product.description}</p> : null}
      {product.specifications.length ? (
        <dl className={s.specs}>
          {product.specifications.map((spec) => (
            <div key={spec.label}>
              <dt>{spec.label}</dt>
              <dd>{spec.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function Related({ product, title, short = false }: { product: PublicProduct; title: string; short?: boolean }) {
  if (!product.related.length) return null;
  return (
    <div className={s.relatedWrap}>
      <section className={s.related} aria-labelledby="related-title">
        <h2 id="related-title" className={s.colTitle}>
          {title}
        </h2>
        <ul className={s.relatedRow}>
          {product.related.slice(0, 4).map((item) => (
            <li key={item.slug}>
              <ProductCard product={item} short={short} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Product pages (Pen Stage 4.3; COM-FR-001–005). One look for every product:
 * a framed gallery on the left; on the right the title, the choices and a
 * price ticket beside them. Garments (template mfOQO) configure in six
 * expanding steps beside a live garment map; everything else (template
 * gb4rz) uses the short one-page flow. A `?draft=` address reopens a saved
 * design (owners only).
 */
export default async function ProductPage({ params, searchParams }: Params) {
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const product = await getProduct(slug);
  if (!product) notFound();
  const query = await searchParams;
  const draft = query.draft && /^[0-9a-f-]{36}$/.test(query.draft) && product.configurator ? await serverApi(`/v1/configurations/${query.draft}`, configurationSchema) : null;
  const initialDraft = draft?.ok && draft.data.productSlug === product.slug ? draft.data : null;

  const priceState = customerPriceState(product);
  const listed = priceState === "PRICE_READY" || priceState === "ESTIMATE_READY" ? product.price : null;
  const from = listed ? `₦${(BigInt(listed.amountMinor) / 100n).toLocaleString("en-NG")}` : null;
  const ld = <JsonLd data={[productLd(product), breadcrumbLd([{ name: "Home", path: "/" }, { name: "Products", path: "/products" }, { name: product.name, path: `/products/${product.slug}` }])]} />;
  const garment = product.family === "GARMENT" && product.configurator && product.available;

  if (garment) {
    const config = product.configurator!;
    // Only a route or colour this product offers (from the API); the address can't choose another one.
    const sourcing = config.allowedRoutes.find((value) => value === query.sourcing) ?? null;
    const colour = config.options.find((option) => option.key === "colour")?.values.find((value) => value.key === query.colour)?.key;
    const branding = brandingCopy(config.allowedDecorations);
    return (
      <SiteShell>
        {ld}
        <div className={s.page}>
          <GarmentConfigurator
            productSlug={product.slug}
            productName={product.name}
            data={config}
            images={product.images}
            initialDraft={initialDraft}
            signedIn={await hasSessionCookie()}
            startSourcing={initialDraft ? null : sourcing}
            startChoices={colour ? { colour } : {}}
            listState={priceState}
            crumbs={<Crumbs product={product} />}
            head={<Head product={product} from={from} />}
          />
          <div className={s.belowWrap}>
            <div className={s.below}>
              <section className={s.col} aria-labelledby="branding-title">
                <h2 id="branding-title" className={s.colTitle}>
                  {branding.title}
                </h2>
                <p className={s.colBody}>{branding.body}</p>
                <a className={s.colLink} href="/resources">
                  Read the guides
                </a>
              </section>
              <Specifications product={product} title="Fabric & fit" />
              <Questions product={product} />
            </div>
          </div>
          <Related product={product} title="Complete the uniform" short />
        </div>
      </SiteShell>
    );
  }

  const config = product.configurator && product.available ? product.configurator : null;
  return (
    <SiteShell>
      {ld}
      <div className={s.page}>
        <div className={s.crumbRow}>
          <Crumbs product={product} />
        </div>
        <section className={`${s.split} ${s.splitFixed}`} aria-labelledby="product-title">
          <div className={s.stickyCol}>
            <PdpGallery
              images={product.images}
              name={product.name}
              slug={product.slug}
              tint={tintFor(product.family)}
              fixed
              caption={config ? "Stock, finish and size are confirmed in your proof" : undefined}
            />
          </div>
          <div className={`${s.side} ${s.sideFixed}`}>
            {config ? (
              <Configurator
                productSlug={product.slug}
                productName={product.name}
                family={product.family}
                data={config}
                initialDraft={initialDraft}
                listState={listed?.state ?? null}
                head={<Head product={product} from={null} />}
              />
            ) : (
              <>
                <div className={s.head}>
                  <Head product={product} from={from} />
                </div>
                {!product.available ? (
                  <p className={s.unavailable} role="status">
                    This product can&apos;t be ordered right now. Ask us when it&apos;s back or for an alternative.
                  </p>
                ) : null}
                <a className={s.primary} href={`/contact?topic=${product.configurator ? "product" : "project"}&product=${product.slug}`}>
                  {product.configurator ? "Ask about this product" : "Start a project"}
                </a>
              </>
            )}
          </div>
        </section>
        <div className={s.belowWrap}>
          <div className={s.below}>
            {config ? (
              <section className={s.col} aria-labelledby="next-title">
                <h2 id="next-title" className={s.colTitle}>
                  What happens next
                </h2>
                <ol className={s.next}>
                  <li>
                    <span>01</span>
                    <span>
                      <b>Order and upload.</b> Or send artwork later where the product allows it.
                    </span>
                  </li>
                  <li>
                    <span>02</span>
                    <span>
                      <b>Approve your proof.</b> We check your file and show you exactly what we&apos;ll make.
                    </span>
                  </li>
                  <li>
                    <span>03</span>
                    <span>
                      <b>Made and checked</b>
                      {config.leadDays ? ` in ${config.leadDays.min}–${config.leadDays.max} working days,` : ""} then dispatched.
                    </span>
                  </li>
                </ol>
              </section>
            ) : null}
            <Specifications product={product} />
            <Questions product={product} />
          </div>
        </div>
        <Related product={product} title="Often ordered with" />
      </div>
    </SiteShell>
  );
}
