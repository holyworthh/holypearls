import { businessDate, type PublicProductCard } from "@holypearls/contracts";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import s from "../../components/catalogue/directory.module.css";
import { FilterSheet } from "../../components/catalogue/FilterSheet";
import { LoadMore } from "../../components/catalogue/LoadMore";
import { priceLine, ProductCard } from "../../components/catalogue/ProductCard";
import { SortSelect } from "../../components/catalogue/SortSelect";
import { Icon } from "../../components/pen/Icon";
import { SuggestInput } from "../../components/search/SearchSuggest";
import { SiteShell } from "../../components/site/SiteShell";
import { DECORATION_LABELS, PRICE_LABELS, QUANTITY_LABELS, ROUTE_LABELS } from "../../lib/catalogue-labels";
import { getProducts } from "../../lib/storefront";

type Search = Record<string, string | string[] | undefined>;

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

const KEYS = ["q", "category", "family", "mode", "route", "price", "qty", "decoration", "neededBy", "sort", "page", "limit"] as const;
const PAGE_SIZE = 24;

/** The query string as the directory understands it; repeated keys (`family=A&family=B`) are kept. */
function clean(params: Search) {
  const out = new URLSearchParams();
  for (const key of KEYS) {
    const value = params[key];
    for (const item of Array.isArray(value) ? value : [value]) if (typeof item === "string" && item) out.append(key, item);
  }
  return out;
}

/** A link to the directory with some keys changed (null removes the key; `drop` removes one value of a key). */
const hrefWith = (params: URLSearchParams, changes: Record<string, string | null> = {}, drop?: [string, string]) => {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  if (drop) next.delete(drop[0], drop[1]);
  if (!("page" in changes)) next.delete("page");
  const text = next.toString();
  return text ? `/products?${text}` : "/products";
};

const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

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

/** A rail group (Pen 17): title with a chevron, open by default, collapsible. */
function RailGroup({ title, collapsible = true, children }: { title: string; collapsible?: boolean; children: ReactNode }) {
  if (!collapsible)
    return (
      <fieldset className={s.group}>
        <legend>{title}</legend>
        {children}
      </fieldset>
    );
  return (
    <details className={s.fold} open>
      <summary className={s.foldHead}>
        {title}
        <Icon name="chevron-up" size={18} />
      </summary>
      <fieldset className={s.group} aria-label={title}>
        {children}
      </fieldset>
    </details>
  );
}

/** Pen's square checkbox row; several in a group combine (any of them matches). */
function Check({ name, value, label, count, checked }: { name: string; value: string; label: string; count?: number; checked: boolean }) {
  return (
    <label className={s.option}>
      <input type="checkbox" name={name} value={value} defaultChecked={checked} />
      <span className={s.optionLabel}>{label}</span>
      {count !== undefined ? <span className={s.optionCount}>{count}</span> : null}
    </label>
  );
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
  // "Today" is Lagos's date; an old needed-by link is ignored rather than refused.
  const today = businessDate(new Date());
  if ((params.get("neededBy") ?? today) < today) params.delete("neededBy");
  const pageSize = Math.min(48, Math.max(1, Number(params.get("limit")) || PAGE_SIZE));
  const query = new URLSearchParams(params);
  query.set("limit", String(pageSize));
  const data = await getProducts(query).catch(() => undefined);
  const category = params.get("category");
  const q = params.get("q") ?? "";
  const all = data?.facets.categories.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const chip = (key: string, value: string, label: string) => ({ key: `${key}:${value}`, label, remove: hrefWith(params, {}, [key, value]) });
  const each = (key: string, label: (value: string) => string) => params.getAll(key).map((value) => chip(key, value, label(value)));
  const applied = [
    ...(q ? [chip("q", q, `“${q}”`)] : []),
    ...each("category", (slug) => data?.facets.categories.find((item) => item.slug === slug)?.name ?? slug),
    ...each("route", (value) => ROUTE_LABELS[value as keyof typeof ROUTE_LABELS] ?? value),
    ...each("price", (value) => PRICE_LABELS[value as keyof typeof PRICE_LABELS] ?? value),
    ...each("qty", (value) => `${QUANTITY_LABELS[value as keyof typeof QUANTITY_LABELS] ?? value} pieces`),
    ...each("decoration", (value) => `${DECORATION_LABELS[value as keyof typeof DECORATION_LABELS] ?? value} available`),
    ...each("neededBy", (value) => `Needed by ${shortDate(value)}`),
    ...each("family", (value) => FAMILIES[value] ?? value),
    ...each("mode", (value) => MODES[value] ?? value),
  ];
  const keep = [...params].filter(([key]) => key !== "sort" && key !== "page" && key !== "limit");
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
          <h1 className={s.h1} data-enter>Everything we make</h1>
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
          <SuggestInput id="directory-q" className={s.searchInput} defaultValue={q} placeholder="Search products. Try “polo”, “roll-up” or “paper bag”" />
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
          <FilterSheet
            count={`${data.total} products`}
            total={data.total}
            formId="directory-filters"
            clearHref={hrefWith(new URLSearchParams([...params].filter(([key]) => key === "q" || key === "category" || key === "sort")))}
            sort={<SortSelect id="sort-mobile" value={sort} keep={keep} compact />}
          >
            <form id="directory-filters" action="/products" aria-label="Filter products">
              <div className={s.railHead}>
                <h2 className={s.railTitle}>Filters</h2>
                <a className={s.link} href={hrefWith(new URLSearchParams([...params].filter(([key]) => key === "q" || key === "category" || key === "sort")))}>
                  Clear all
                </a>
              </div>
              {[...params]
                .filter(([key]) => ["q", "category", "sort", "family", "mode", "limit"].includes(key))
                .map(([key, value]) => (
                  <input key={`${key}:${value}`} type="hidden" name={key} value={value} />
                ))}
              <RailGroup title="How it’s made">
                {data.facets.routes.map((item) => (
                  <Check key={item.value} name="route" value={item.value} label={ROUTE_LABELS[item.value]} checked={params.getAll("route").includes(item.value)} />
                ))}
              </RailGroup>
              <RailGroup title="Price">
                {data.facets.prices.map((item) => (
                  <Check key={item.value} name="price" value={item.value} label={PRICE_LABELS[item.value]} count={item.count} checked={params.getAll("price").includes(item.value)} />
                ))}
              </RailGroup>
              <RailGroup title="Quantity">
                <div className={s.qtyChips}>
                  {data.facets.quantities.map((item) => (
                    <label key={item.value} className={s.qtyChip}>
                      <input type="radio" name="qty" value={item.value} defaultChecked={params.get("qty") === item.value} />
                      <span>{QUANTITY_LABELS[item.value]}</span>
                    </label>
                  ))}
                </div>
              </RailGroup>
              <RailGroup title="Decoration">
                {data.facets.decorations.map((item) => (
                  <Check key={item.value} name="decoration" value={item.value} label={DECORATION_LABELS[item.value]} checked={params.getAll("decoration").includes(item.value)} />
                ))}
              </RailGroup>
              <RailGroup title="Needed by" collapsible={false}>
                <label className={s.date}>
                  <Icon name="calendar" size={18} />
                  <input type="date" name="neededBy" min={today} defaultValue={params.get("neededBy") ?? ""} aria-label="Needed by" />
                </label>
              </RailGroup>
              <button type="submit" className={`${s.outlineButton} ${s.apply}`}>
                Show results
              </button>
            </form>
          </FilterSheet>

          <section className={s.results} aria-labelledby="results-title" data-directory-results>
            <h2 id="results-title" className="hp-visually-hidden">
              Results
            </h2>
            <div className={s.toolbar}>
              <ul className={s.applied} aria-label="Applied filters">
                <li className={s.resultCount}>{data.total} products</li>
                {applied.map((item) => (
                  <li key={item.key}>
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
                  <span className={s.interruptPhoto} aria-hidden="true" data-unveil />
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

            <LoadMore
              query={new URLSearchParams([...params].filter(([key]) => key !== "page" && key !== "limit")).toString()}
              page={data.page}
              pages={data.pages}
              total={data.total}
              shown={entries.length}
              pageSize={pageSize}
              nextHref={hrefWith(params, { page: String(data.page + 1) })}
            >
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
            </LoadMore>
          </section>
        </div>
      )}
      </div>
    </SiteShell>
  );
}
