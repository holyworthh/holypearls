import type { PublicProductCard } from "@holypearls/contracts";
import type { Metadata } from "next";
import s from "../../components/catalogue/directory.module.css";
import { FilterSheet } from "../../components/catalogue/FilterSheet";
import { priceLine, ProductCard } from "../../components/catalogue/ProductCard";
import { SortSelect } from "../../components/catalogue/SortSelect";
import { Icon } from "../../components/pen/Icon";
import { SiteShell } from "../../components/site/SiteShell";
import { getProducts } from "../../lib/storefront";

type Search = { q?: string; category?: string; family?: string; mode?: string; sort?: string; page?: string };

const FAMILIES: Record<string, string> = {
  GARMENT: "Garments",
  APPAREL_PRINT: "Apparel printing",
  EMBROIDERY: "Embroidery",
  PAPER_PRINT: "Print & stationery",
  LARGE_FORMAT: "Large format",
  PACKAGING: "Packaging",
  STICKER_LABEL: "Stickers & labels",
  PROMOTIONAL_ITEM: "Promotional items",
  WALL_ART: "Wall art",
  CUSTOM_PROJECT: "Custom projects",
};

const MODES: Record<string, string> = {
  SIMPLE_CONFIGURABLE: "Price as you configure",
  CONFIGURABLE_QUOTE: "Quote after review",
  CONSULTATIVE_PROJECT: "Planned with our team",
};

const KEYS = ["q", "category", "family", "mode", "sort", "page"] as const;

function clean(params: Search) {
  const out = new URLSearchParams();
  for (const key of KEYS) {
    const value = params[key];
    if (typeof value === "string" && value) out.set(key, value);
  }
  return out;
}

const hrefWith = (params: URLSearchParams, changes: Record<string, string | null>) => {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  if (!("page" in changes)) next.delete("page");
  const text = next.toString();
  return text ? `/products?${text}` : "/products";
};

/** Filtered, searched and later pages are not indexed (PUB-FR-008, PUB-SEO-008); the plain directory is. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const params = clean(await searchParams);
  return {
    title: "All products",
    description: "Everything HolyPearls makes: apparel, print, signage, packaging, labels and gifts. Branded, or made from scratch.",
    alternates: { canonical: "/products" },
    robots: params.toString() ? { index: false, follow: true } : undefined,
  };
}

/** The large photo card that opens the results (Pen 17 "Feature row"). */
function FeatureCard({ product }: { product: PublicProductCard }) {
  const line = priceLine(product);
  const moq = product.moq ? ` · Min ${product.moq.toLocaleString("en-NG")}` : "";
  return (
    <article className={s.feature} style={product.image ? { backgroundImage: `url("${product.image.url}")` } : undefined}>
      <div className={s.featurePanel}>
        <div className={s.featureTitleRow}>
          <h3 className={s.featureTitle}>
            <a className={s.featureLink} href={`/products/${product.slug}`}>
              {product.name}
            </a>
          </h3>
          <Icon name="arrow-right" size={20} />
        </div>
        {product.summary ? <p className={s.featureQ}>{product.summary}</p> : null}
        <p className={s.featurePrice}>
          <span className={s.dot} aria-hidden="true" />
          {line.text}
          {line.tone === "estimate" ? " · estimate ready" : ""}
          {moq}
        </p>
      </div>
    </article>
  );
}

/** Product Directory (Pen 17 · bhA8B desktop, 06 · r2L62s mobile; PUB-FR-008, 010). */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = clean(await searchParams);
  const query = new URLSearchParams(params);
  if (!query.has("limit")) query.set("limit", "24");
  const data = await getProducts(query).catch(() => undefined);
  const category = params.get("category");
  const q = params.get("q") ?? "";
  const all = data?.facets.categories.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const applied = [
    ...(q ? [{ label: `“${q}”`, remove: hrefWith(params, { q: null }) }] : []),
    ...(category ? [{ label: data?.facets.categories.find((item) => item.slug === category)?.name ?? category, remove: hrefWith(params, { category: null }) }] : []),
    ...(params.get("family") ? [{ label: FAMILIES[params.get("family")!] ?? params.get("family")!, remove: hrefWith(params, { family: null }) }] : []),
    ...(params.get("mode") ? [{ label: MODES[params.get("mode")!] ?? params.get("mode")!, remove: hrefWith(params, { mode: null }) }] : []),
  ];
  const keep = [...params].filter(([key]) => key !== "sort" && key !== "page");
  const sort = params.get("sort") ?? "popular";
  const entries = data?.entries ?? [];
  const firstPage = !params.get("page");
  const [lead, second, third] = entries;
  const showFeature = firstPage && entries.length >= 3;
  const rest = showFeature ? entries.slice(3) : entries;
  const beforeInterrupt = rest.slice(0, 4);
  const afterInterrupt = rest.slice(4);
  const categoryLink = (slug: string | null) => hrefWith(params, { category: slug });

  return (
    <SiteShell>
      <div className={s.page}>
      <header className={`${s.head} ${s.pad}`}>
        <nav className={s.breadcrumb} aria-label="Breadcrumb">
          <ol>
            <li>
              <a href="/">Home</a>
            </li>
            <li aria-current="page">Products</li>
          </ol>
        </nav>
        <div className={s.titleRow}>
          <h1 className={s.h1}>Everything we make</h1>
          {data ? (
            <p className={s.intro}>
              {all} products in {data.facets.categories.length} categories. We can brand any of them, or make it from scratch.
            </p>
          ) : null}
        </div>
        <form className={s.search} role="search" action="/products" id="directory-search">
          <Icon name="search" size={22} />
          {keep
            .filter(([key]) => key !== "q")
            .map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          <label className="hp-visually-hidden" htmlFor="directory-q">
            Search products
          </label>
          <input id="directory-q" className={s.searchInput} type="search" name="q" defaultValue={q} placeholder="Search products. Try “polo”, “roll-up” or “paper bag”" />
          <button type="submit" className={s.redButton}>
            Search
          </button>
        </form>
        {data ? (
          <nav aria-label="Categories">
            <ul className={s.tabs}>
              <li>
                <a className={s.tab} href={categoryLink(null)} aria-current={!category ? "true" : undefined}>
                  All <span className={s.count}>{all}</span>
                </a>
              </li>
              {data.facets.categories.map((item) => (
                <li key={item.slug}>
                  <a className={s.tab} href={categoryLink(item.slug)} aria-current={category === item.slug ? "true" : undefined}>
                    {item.name} <span className={s.count}>{item.count}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>
      {data ? (
        <ul className={s.chips} aria-label="Categories">
          <li>
            <a href={categoryLink(null)} aria-current={!category ? "true" : undefined}>
              All
            </a>
          </li>
          {data.facets.categories.map((item) => (
            <li key={item.slug}>
              <a href={categoryLink(item.slug)} aria-current={category === item.slug ? "true" : undefined}>
                {item.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {!data ? (
        <div className={s.pad}>
          <div className={s.empty} role="alert">
            <h2 className={s.emptyTitle}>We couldn&apos;t load products</h2>
            <p>Try again in a moment.</p>
            <a className={s.outlineButton} href={hrefWith(params, {})}>
              Try again
            </a>
          </div>
        </div>
      ) : (
        <div className={`${s.body} ${s.pad}`}>
          <FilterSheet count={`${data.total} products`} sort={<SortSelect id="sort-mobile" value={sort} keep={keep} compact />}>
            <form action="/products" aria-label="Filter products">
              <div className={s.railHead}>
                <h2 className={s.railTitle}>Filters</h2>
                <a className={s.link} href={category ? `/products?category=${category}` : "/products"}>
                  Clear all
                </a>
              </div>
              {q ? <input type="hidden" name="q" value={q} /> : null}
              {category ? <input type="hidden" name="category" value={category} /> : null}
              {params.get("sort") ? <input type="hidden" name="sort" value={params.get("sort")!} /> : null}
              <fieldset className={s.group}>
                <legend>How it&apos;s bought</legend>
                {data.facets.modes.map((item) => (
                  <label key={item.value} className={s.option}>
                    <input type="radio" name="mode" value={item.value} defaultChecked={params.get("mode") === item.value} />
                    <span className={s.optionLabel}>{MODES[item.value]}</span>
                    <span className={s.optionCount}>{item.count}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className={s.group}>
                <legend>Product type</legend>
                {data.facets.families.map((item) => (
                  <label key={item.value} className={s.option}>
                    <input type="radio" name="family" value={item.value} defaultChecked={params.get("family") === item.value} />
                    <span className={s.optionLabel}>{FAMILIES[item.value]}</span>
                    <span className={s.optionCount}>{item.count}</span>
                  </label>
                ))}
              </fieldset>
              <button type="submit" className={`${s.outlineButton} ${s.apply}`}>
                Show results
              </button>
            </form>
          </FilterSheet>

          <section className={s.results} aria-labelledby="results-title">
            <h2 id="results-title" className="hp-visually-hidden">
              Results
            </h2>
            <div className={s.toolbar}>
              <ul className={s.applied} aria-label="Applied filters">
                <li className={s.resultCount}>{data.total} products</li>
                {applied.map((item) => (
                  <li key={item.label}>
                    <a className={s.chip} href={item.remove} aria-label={`Remove filter ${item.label}`}>
                      {item.label}
                      <Icon name="x" size={14} />
                    </a>
                  </li>
                ))}
              </ul>
              <SortSelect id="sort" value={sort} keep={keep} />
            </div>

            {entries.length === 0 ? (
              <div className={s.empty}>
                <h3 className={s.emptyTitle}>Nothing matches these filters</h3>
                <p>Try fewer filters or other words, or tell us what you need and we&apos;ll make it.</p>
                <div className={s.emptyActions}>
                  <a className={s.outlineButton} href="/products">
                    Clear filters
                  </a>
                  <a className={s.outlineButton} href="/contact?topic=custom-request">
                    Tell us what you need
                  </a>
                </div>
              </div>
            ) : (
              <>
                <div className={s.desktopBlock}>
                {showFeature ? (
                  <div className={s.featureRow}>
                    <FeatureCard product={lead!} />
                    <ul className={`${s.list} ${s.pair}`}>
                      {[second!, third!].map((product) => (
                        <li key={product.slug}>
                          <ProductCard product={product} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {beforeInterrupt.length ? (
                  <ul className={`${s.list} ${s.compactRow}`}>
                    {beforeInterrupt.map((product) => (
                      <li key={product.slug}>
                        <ProductCard product={product} variant="compact" />
                      </li>
                    ))}
                  </ul>
                ) : null}
                </div>
                <ul className={`${s.list} ${s.mobileGrid}`}>
                  {entries.slice(0, 4).map((product) => (
                    <li key={product.slug}>
                      <ProductCard product={product} />
                    </li>
                  ))}
                </ul>
                <aside className={s.interrupt} aria-labelledby="scratch-title">
                  <span className={s.interruptPhoto} aria-hidden="true" />
                  <div className={s.interruptText}>
                    <span className={s.ticket}>MAKE FROM SCRATCH</span>
                    <h3 id="scratch-title" className={s.interruptTitle}>
                      Can&apos;t find it? We can make it<span className={s.onlyMobile}>.</span>
                    </h3>
                    <p className={s.interruptBody}>
                      <span className={s.onlyDesktop}>Send us your design, fabric and fit and we&apos;ll quote it. Minimum 20 pieces per style and colour.</span>
                      <span className={s.onlyMobile}>Describe it in a sentence and we&apos;ll quote it. Made-from-scratch garments start from 20 pieces per style and colour.</span>
                    </p>
                    <a className={s.interruptLink} href="/contact?topic=custom-request">
                      <span className={s.onlyDesktop}>Start a scratch brief →</span>
                      <span className={s.onlyMobile}>Tell us what you need →</span>
                    </a>
                  </div>
                </aside>
                <div className={s.desktopBlock}>
                {afterInterrupt.length ? (
                  <ul className={`${s.list} ${s.compactRow}`}>
                    {afterInterrupt.map((product) => (
                      <li key={product.slug}>
                        <ProductCard product={product} variant="compact" />
                      </li>
                    ))}
                  </ul>
                ) : null}
                </div>
                {entries.length > 4 ? (
                  <ul className={`${s.list} ${s.mobileGrid}`}>
                    {entries.slice(4).map((product) => (
                      <li key={product.slug}>
                        <ProductCard product={product} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}

            <nav className={s.pagination} aria-label="Pages">
              <p className={s.showing}>
                Showing {entries.length} of {data.total}
              </p>
              {data.page < data.pages ? (
                <a className={s.outlineButton} href={hrefWith(params, { page: String(data.page + 1) })}>
                  Load {Math.min(24, data.total - data.page * 24)} more
                </a>
              ) : null}
              {data.pages > 1 ? (
                <ul className={`${s.list} ${s.pages}`}>
                  {Array.from({ length: data.pages }, (_, index) => index + 1).map((number) => (
                    <li key={number}>
                      <a
                        className={s.pageLink}
                        href={hrefWith(params, { page: number === 1 ? null : String(number) })}
                        aria-current={number === data.page ? "page" : undefined}
                        aria-label={`Page ${number}`}
                      >
                        {number}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </nav>
          </section>
        </div>
      )}
      </div>
    </SiteShell>
  );
}
