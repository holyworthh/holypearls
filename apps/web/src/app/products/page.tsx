import type { Metadata } from "next";
import { BigSearch } from "../../components/catalogue/BigSearch";
import styles from "../../components/catalogue/catalogue.module.css";
import { ProductCard } from "../../components/catalogue/ProductCard";
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

const SORTS: Record<string, string> = { popular: "Most ordered", name: "Name (A–Z)", newest: "Newest" };

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

/** Product Directory (Pen 17 · bhA8B desktop, 06 · r2L62s mobile; PUB-FR-008, 010). */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = clean(await searchParams);
  const query = new URLSearchParams(params);
  if (!query.has("limit")) query.set("limit", "24");
  const data = await getProducts(query).catch(() => undefined);
  const category = params.get("category");
  const q = params.get("q") ?? "";
  const applied = [
    ...(q ? [{ label: `“${q}”`, remove: hrefWith(params, { q: null }) }] : []),
    ...(params.get("family") ? [{ label: FAMILIES[params.get("family")!] ?? params.get("family")!, remove: hrefWith(params, { family: null }) }] : []),
    ...(params.get("mode") ? [{ label: MODES[params.get("mode")!] ?? params.get("mode")!, remove: hrefWith(params, { mode: null }) }] : []),
  ];

  return (
    <SiteShell>
      <div className={styles.container}>
        <header className={styles.pageHead}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <ol>
              <li>
                <a href="/">Home</a>
              </li>
              <li aria-current="page">Products</li>
            </ol>
          </nav>
          <div className={styles.titleRow}>
            <h1 className={styles.h1}>Everything we make</h1>
            {data ? (
              <p className={styles.intro}>
                {data.facets.categories.reduce((sum, item) => sum + item.count, 0)} products in {data.facets.categories.length} categories. We can brand any of
                them, or make it from scratch.
              </p>
            ) : null}
          </div>
          <BigSearch
            id="directory-search"
            defaultValue={q}
            placeholder="Search products. Try “polo”, “roll-up” or “paper bag”"
            hidden={Object.fromEntries([...params].filter(([key]) => key !== "q" && key !== "page"))}
          />
          {data ? (
            <nav aria-label="Categories">
              <ul className={styles.tabs}>
                <li>
                  <a className={styles.tab} href={hrefWith(params, { category: null })} aria-current={!category ? "true" : undefined}>
                    All <span className={styles.count}>{data.facets.categories.reduce((sum, item) => sum + item.count, 0)}</span>
                  </a>
                </li>
                {data.facets.categories.map((item) => (
                  <li key={item.slug}>
                    <a className={styles.tab} href={hrefWith(params, { category: item.slug })} aria-current={category === item.slug ? "true" : undefined}>
                      {item.name} <span className={styles.count}>{item.count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </header>

        {!data ? (
          <div className={styles.empty} role="alert">
            <h2 className={styles.emptyTitle}>We couldn&apos;t load products</h2>
            <p>Try again in a moment.</p>
            <a className={styles.secondary} href={hrefWith(params, {})}>
              Try again
            </a>
          </div>
        ) : (
          <div className={styles.body}>
            <details className={styles.rail} open>
              <summary>Filters</summary>
              <form className={styles.railForm} action="/products" aria-label="Filter products">
                <div className={styles.railHead}>
                  <h2 className={styles.railTitle}>Filters</h2>
                  <a className={styles.headLink} href={category ? `/products?category=${category}` : "/products"}>
                    Clear all
                  </a>
                </div>
                {q ? <input type="hidden" name="q" value={q} /> : null}
                {category ? <input type="hidden" name="category" value={category} /> : null}
                {params.get("sort") ? <input type="hidden" name="sort" value={params.get("sort")!} /> : null}
                <fieldset className={styles.group}>
                  <legend>How it&apos;s bought</legend>
                  <label className={styles.option}>
                    <input type="radio" name="mode" value="" defaultChecked={!params.get("mode")} />
                    Any
                  </label>
                  {data.facets.modes.map((item) => (
                    <label key={item.value} className={styles.option}>
                      <input type="radio" name="mode" value={item.value} defaultChecked={params.get("mode") === item.value} />
                      {MODES[item.value]}
                      <span className={styles.count}>{item.count}</span>
                    </label>
                  ))}
                </fieldset>
                <fieldset className={styles.group}>
                  <legend>Product type</legend>
                  <label className={styles.option}>
                    <input type="radio" name="family" value="" defaultChecked={!params.get("family")} />
                    Any
                  </label>
                  {data.facets.families.map((item) => (
                    <label key={item.value} className={styles.option}>
                      <input type="radio" name="family" value={item.value} defaultChecked={params.get("family") === item.value} />
                      {FAMILIES[item.value]}
                      <span className={styles.count}>{item.count}</span>
                    </label>
                  ))}
                </fieldset>
                <button type="submit" className={styles.applyButton}>
                  Show results
                </button>
              </form>
            </details>

            <section className={styles.results} aria-labelledby="results-title">
              <h2 id="results-title" className="hp-visually-hidden">
                Results
              </h2>
              <div className={styles.toolbar}>
                <ul className={styles.applied} aria-label="Applied filters">
                  {applied.map((item) => (
                    <li key={item.label}>
                      <a className={styles.chip} href={item.remove} aria-label={`Remove filter ${item.label}`}>
                        {item.label} ×
                      </a>
                    </li>
                  ))}
                </ul>
                <form className={styles.sortForm} action="/products">
                  {[...params].filter(([key]) => key !== "sort" && key !== "page").map(([key, value]) => (
                    <input key={key} type="hidden" name={key} value={value} />
                  ))}
                  <label htmlFor="sort">Sort by</label>
                  <select id="sort" name="sort" defaultValue={params.get("sort") ?? "popular"}>
                    {Object.entries(SORTS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={styles.chip}>
                    Sort
                  </button>
                </form>
              </div>

              {data.entries.length === 0 ? (
                <div className={styles.empty}>
                  <h3 className={styles.emptyTitle}>Nothing matches these filters</h3>
                  <p>Try fewer filters or other words, or tell us what you need and we&apos;ll make it.</p>
                  <div className={styles.actions}>
                    <a className={styles.secondary} href="/products">
                      Clear filters
                    </a>
                    <a className={styles.primary} href="/contact?topic=custom-request">
                      Tell us what you need
                    </a>
                  </div>
                </div>
              ) : (
                <ul className={styles.grid}>
                  {data.entries.map((product) => (
                    <li key={product.slug}>
                      <ProductCard product={product} />
                    </li>
                  ))}
                </ul>
              )}

              {data.entries.length ? (
                <div className={styles.interrupt}>
                  <p className={styles.eyebrow}>CAN&apos;T FIND IT?</p>
                  <p className={styles.interruptTitle}>We can make it. If it can be made or sourced, tell us what you need.</p>
                  <div className={styles.actions}>
                    <a className={styles.secondary} href="/contact?topic=custom-request">
                      Start a custom request
                    </a>
                  </div>
                </div>
              ) : null}

              <nav className={styles.pagination} aria-label="Pages">
                <p className={styles.muted}>
                  Showing {data.entries.length} of {data.total}
                </p>
                {data.pages > 1 ? (
                  <ul className={styles.pages}>
                    {Array.from({ length: data.pages }, (_, index) => index + 1).map((number) => (
                      <li key={number}>
                        <a
                          className={styles.pageLink}
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
