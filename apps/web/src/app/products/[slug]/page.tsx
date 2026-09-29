import { configurationSchema } from "@holypearls/contracts";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Configurator } from "../../../components/catalogue/Configurator";
import g from "../../../components/catalogue/garment.module.css";
import p from "../../../components/catalogue/pdp.module.css";
import { Gallery } from "../../../components/catalogue/Gallery";
import { GarmentGallery, GarmentStart, StickyConfigure } from "../../../components/catalogue/GarmentStart";
import { Icon } from "../../../components/pen/Icon";
import { ProductCard } from "../../../components/catalogue/ProductCard";
import { categoryHref } from "../../../components/site/nav";
import { DELIVERY_COVERAGE, SiteShell } from "../../../components/site/SiteShell";
import { serverApi } from "../../../lib/server-api";
import { getProduct } from "../../../lib/storefront";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ draft?: string }> };
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
 * Product pages (T03-03, COM-FR-001–005). Most products (Pen 21 · VSjt2):
 * gallery and the inline configurator with the price beside the choices.
 * Garments (Pen 19 · V3j7CP): a product page whose "Configure yours" opens the
 * stepped configurator (Pen 22) at /products/[slug]/configure. A `?draft=`
 * address reopens a saved design (owners only).
 */
/** What each quantity band says (Pen 19): the minimum, a worked example, a live estimate, or a production review. */
function bandNote(tier: { quantity: number; perUnitMinor: string | null }, index: number, count: number, moq: number) {
  if (index === 0) return `Standard minimum ${moq.toLocaleString("en-NG")}`;
  if (!tier.perUnitMinor || (index === count - 1 && count > 2)) return "Production review";
  if (index === 1) return `e.g. ${tier.quantity.toLocaleString("en-NG")} → est. ₦${((BigInt(tier.perUnitMinor) * BigInt(tier.quantity)) / 100n).toLocaleString("en-NG")}`;
  return "Live estimate";
}

export default async function ProductPage({ params, searchParams }: Params) {
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const product = await getProduct(slug);
  if (!product) notFound();
  const { draft: draftId } = await searchParams;
  const draft =
    draftId && /^[0-9a-f-]{36}$/.test(draftId) && product.configurator ? await serverApi(`/v1/configurations/${draftId}`, configurationSchema) : null;
  const initialDraft = draft?.ok && draft.data.productSlug === product.slug ? draft.data : null;

  const garment = product.family === "GARMENT" && product.configurator && product.available;
  if (!garment) {
    return (
      <SiteShell>
        <section className={p.top} aria-labelledby="product-title">
          <nav className={p.breadcrumb} aria-label="Breadcrumb">
            <ol>
              <li>
                <a href="/products">Products</a>
              </li>
              <li>
                <a href={categoryHref((product.categoryParent ?? product.category).slug)}>{(product.categoryParent ?? product.category).name}</a>
              </li>
              <li aria-current="page">{product.name}</li>
            </ol>
          </nav>
          <div className={p.split}>
            <Gallery images={product.images} name={product.name} />
            <div className={p.side}>
              <div className={p.titleBlock}>
                <h1 id="product-title" className={p.h1}>
                  {product.name}
                </h1>
              </div>
              {!product.available ? (
                <p className={p.hint} role="status">
                  This product can&apos;t be ordered right now. Ask us when it&apos;s back or for an alternative.
                </p>
              ) : null}
              {product.configurator && product.available ? (
                <Configurator productSlug={product.slug} productName={product.name} family={product.family} data={product.configurator} initialDraft={initialDraft} listState={product.price?.state ?? null} />
              ) : (
                <a className={p.add} href={`/contact?topic=${product.configurator ? "product" : "project"}&product=${product.slug}`}>
                  {product.configurator ? "Ask about this product" : "Start a project"}
                </a>
              )}
            </div>
          </div>
        </section>
        {product.description || product.specifications.length || product.faqs.length ? (
          <div className={p.more}>
            {product.description ? (
              <section aria-labelledby="about-title">
                <h2 id="about-title" className={p.moreTitle}>
                  About {product.name.toLowerCase()}
                </h2>
                <p className={p.moreBody}>{product.description}</p>
                <p className={p.hint}>{DELIVERY_COVERAGE}</p>
              </section>
            ) : null}
            {product.specifications.length ? (
              <section aria-labelledby="specs-title">
                <h2 id="specs-title" className={p.moreTitle}>
                  Specifications
                </h2>
                <table className={p.specs}>
                  <tbody>
                    {product.specifications.map((spec) => (
                      <tr key={spec.label}>
                        <th scope="row">{spec.label}</th>
                        <td>{spec.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
            {product.faqs.length ? (
              <section aria-labelledby="faq-title" className={p.faq}>
                <h2 id="faq-title" className={p.moreTitle}>
                  Questions
                </h2>
                {product.faqs.map((item) => (
                  <details key={item.question}>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
        {product.related.length ? (
          <section className={p.related} aria-labelledby="related-title">
            <h2 id="related-title" className={p.moreTitle}>
              Often ordered with
            </h2>
            <ul className={p.relatedRow}>
              {product.related.slice(0, 4).map((item) => (
                <li key={item.slug}>
                  <ProductCard product={item} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </SiteShell>
    );
  }

  // Garments (Pen 19): the product page leads to the configurator (Pen 22) on its own route.
  if (initialDraft) redirect(`/products/${slug}/configure?draft=${initialDraft.id}`);
  const config = product.configurator!;
  const tiers = config.quantityPresets;
  const from = product.price;
  const state = from?.state === "PRICE_READY" ? "PRICE READY" : "ESTIMATE READY";
  const pen = (n: number) => `/pen/generated-${n}.webp`;
  return (
    <SiteShell>
      <section className={g.top} aria-labelledby="product-title">
        <nav className={`${p.breadcrumb} ${g.crumbs}`} aria-label="Breadcrumb">
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
        <div className={g.split}>
          <GarmentGallery images={product.images} name={product.name} fallback={[49, 33, 54, 52, 60, 57].map(pen)} />
          <div className={g.panel}>
            <div className={g.titleBlock}>
              <h1 id="product-title" className={g.h1}>
                {product.name}
              </h1>
              {product.summary ? <p className={g.lead}>{product.summary}</p> : null}
            </div>
            <div className={g.priceBlock}>
              <span className={`${g.state} ${from?.state === "PRICE_READY" ? g.stateReady : ""}`}>{state}</span>
              {from ? (
                <p className={g.price}>
                  <span className={g.priceValue}>
                    {from.state === "ESTIMATE_READY" ? "From " : ""}₦{(BigInt(from.amountMinor) / 100n).toLocaleString("en-NG")}
                  </span>
                  <span className={`${g.priceUnit} ${g.wide}`}>per piece · {from.state === "ESTIMATE_READY" ? "estimate ready" : "price ready"}</span>
                  <span className={`${g.priceUnit} ${g.narrow}`}>/ piece · {from.state === "ESTIMATE_READY" ? "estimate" : "price ready"}</span>
                </p>
              ) : null}
              <p className={g.priceNote}>You&apos;ll see an estimate as you choose options. We confirm the final price before you pay.</p>
            </div>
            <ul className={g.chips} aria-label="At a glance">
              <li>
                <Icon name="boxes" size={15} />
                Min {config.moq.toLocaleString("en-NG")}
              </li>
              {config.leadDays ? (
                <li>
                  <Icon name="clock-3" size={15} />
                  {config.leadDays.min}–{config.leadDays.max} days
                </li>
              ) : null}
              <li>
                <Icon name="stamp" size={15} />
                Proof first
              </li>
            </ul>
            <GarmentStart
              slug={product.slug}
              data={config}
              compareHref={`${categoryHref((product.categoryParent ?? product.category).slug)}#compare`}
              facts={
              <dl className={g.facts}>
              <div className={g.fact}>
                <Icon name="boxes" size={18} className={g.factIcon} />
                <dt>Standard minimum</dt>
                <dd>{config.moq.toLocaleString("en-NG")} pieces</dd>
              </div>
              {config.leadDays ? (
                <div className={g.fact}>
                  <Icon name="clock-3" size={18} className={g.factIcon} />
                  <dt>Typical production</dt>
                  <dd>
                    {config.leadDays.min}–{config.leadDays.max} working days
                  </dd>
                </div>
              ) : null}
              <div className={g.fact}>
                <Icon name="stamp" size={18} className={g.factIcon} />
                <dt>Proof</dt>
                <dd>Before production</dd>
              </div>
            </dl>
              }
            />
          </div>
        </div>
      </section>

      <section className={g.material} aria-label="Material and process">
        <div className={g.materialCol}>
          <span className={g.materialPhoto} style={{ backgroundImage: `url("${pen(60)}")` }} />
          <h2 className={g.mt}>Fabric is chosen with you</h2>
          {product.specifications.length ? (
            <dl className={g.spec}>
              {product.specifications.map((spec) => (
                <div key={spec.label}>
                  <dt>{spec.label}</dt>
                  <dd>{spec.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={g.pb}>{product.description ?? "Fabric, fit and sizes are confirmed with you before production."}</p>
          )}
        </div>
        <div className={g.materialCol}>
          <span className={g.materialPhoto} style={{ backgroundImage: `url("${pen(58)}")` }} />
          <h2 className={g.mt}>We prepare your logo for embroidery</h2>
          <p className={g.pb}>
            Just send your logo. We convert it into an embroidery file and show you a proof before we stitch anything. When you reorder, we use the same approved file.
          </p>
        </div>
        <div className={g.tiers}>
          {tiers.length ? (
            <>
              <p className={g.monoLabel}>QUANTITY BANDS</p>
              <ul className={g.tierList}>
                {tiers.map((tier, index) => (
                  <li key={tier.quantity} className={`${g.tier} ${index === 1 ? g.tierOn : ""}`}>
                    <span>
                      {tier.quantity.toLocaleString("en-NG")}
                      {tiers[index + 1] ? `–${(tiers[index + 1]!.quantity - 1).toLocaleString("en-NG")}` : "+"} pieces
                    </span>
                    <span className={g.tierRight}>{bandNote(tier, index, tiers.length, config.moq)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {product.faqs.length ? (
            <div className={g.faq}>
              <p className={g.monoLabel}>QUESTIONS</p>
              {product.faqs.map((item) => (
                <details key={item.question}>
                  <summary>
                    {item.question}
                    <Icon name="plus" size={18} className={g.plus} />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Phones (Pen 20): material, process, bands, sizing and questions fold into accordions. */}
      <section className={g.folds} aria-label={`About the ${product.name}`}>
        {[
          { title: "Fabric & fit", body: product.specifications.filter((spec) => spec.label !== "Sizes") },
          { title: "How we brand it", text: "Just send your logo. We convert it into an embroidery file and show you a proof before we stitch anything. When you reorder, we use the same approved file." },
          { title: "Quantity bands", bands: true },
          { title: "Sizing", body: product.specifications.filter((spec) => spec.label === "Sizes") },
          { title: "Questions", faqs: true },
        ]
          .filter((fold) => (fold.body ? fold.body.length : fold.bands ? tiers.length : fold.faqs ? product.faqs.length : true))
          .map((fold) => (
            <details key={fold.title} className={g.fold}>
              <summary>
                {fold.title}
                <Icon name="plus" size={20} className={g.plus} />
              </summary>
              {fold.text ? <p className={g.pb}>{fold.text}</p> : null}
              {fold.body ? (
                <dl className={g.spec}>
                  {fold.body.map((spec) => (
                    <div key={spec.label}>
                      <dt>{spec.label}</dt>
                      <dd>{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {fold.bands ? (
                <ul className={g.tierList}>
                  {tiers.map((tier, index) => (
                    <li key={tier.quantity} className={g.tier}>
                      <span>
                        {tier.quantity.toLocaleString("en-NG")}
                        {tiers[index + 1] ? `–${(tiers[index + 1]!.quantity - 1).toLocaleString("en-NG")}` : "+"} pieces
                      </span>
                      <span className={g.tierRight}>{bandNote(tier, index, tiers.length, config.moq)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {fold.faqs
                ? product.faqs.map((item) => (
                    <div key={item.question} className={g.foldFaq}>
                      <h3>{item.question}</h3>
                      <p>{item.answer}</p>
                    </div>
                  ))
                : null}
            </details>
          ))}
        <span className={g.foldPhoto} style={{ backgroundImage: `url("${pen(60)}")` }} />
      </section>

      <StickyConfigure
        state={state}
        price={from ? `₦${(BigInt(from.amountMinor) / 100n).toLocaleString("en-NG")} / piece` : null}
        href={`/products/${product.slug}/configure`}
      />

      {product.related.length ? (
        <section className={g.related} aria-labelledby="related-title">
          <h2 id="related-title" className={g.sectionTitle}>
            Complete the uniform
          </h2>
          <ul className={g.row}>
            {product.related.slice(0, 4).map((item) => (
              <li key={item.slug}>
                <ProductCard product={item} short />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </SiteShell>
  );
}
