import { type ContentCard, type SearchResults, type SearchScope, searchQuerySchema } from "@holypearls/contracts";
import { ArrowRight, BookOpen, CornerDownRight, Folder, Info, Package, SearchX } from "lucide-react";
import type { Metadata } from "next";
import { ProductCard, priceLine } from "../../components/catalogue/ProductCard";
import { ClickTracker } from "../../components/search/ClickTracker";
import { SuggestInput } from "../../components/search/SearchSuggest";
import r from "../../components/search/results.module.css";
import { SiteShell } from "../../components/site/SiteShell";
import { getSearchResults } from "../../lib/content";

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function parse(params: Record<string, string | string[] | undefined>) {
  const parsed = searchQuerySchema.safeParse({ q: one(params.q) ?? "", scope: one(params.scope), page: one(params.page), exact: one(params.exact) });
  return parsed.success ? parsed.data : null;
}

/** Search results are never indexed (PUB-FR-006, PUB-SEO-008); the proxy also sends X-Robots-Tag. */
export async function generateMetadata({ searchParams }: Params): Promise<Metadata> {
  const query = parse(await searchParams);
  return { title: query ? `Results for ‘${query.q}’` : "Search", robots: { index: false, follow: true } };
}

const href = (q: string, extra: Record<string, string> = {}) => `/search?${new URLSearchParams({ q, ...extra })}`;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (count: number, word: string) => `${count.toLocaleString("en-NG")} ${word}${count === 1 ? "" : "s"}`;

const SCOPES: { value: SearchScope; label: string; count: (results: SearchResults) => number }[] = [
  { value: "all", label: "All", count: (results) => results.counts.all },
  { value: "products", label: "Products", count: (results) => results.counts.products },
  { value: "projects", label: "Projects", count: (results) => results.counts.projects },
  { value: "guides", label: "Guides", count: (results) => results.counts.guides },
];

function GroupHead({ id, title, total, more }: { id: string; title: string; total: number; more?: { label: string; href: string } }) {
  return (
    <div className={r.groupHead}>
      <div className={r.groupTitle}>
        <h2 id={id}>{title}</h2>
        <span>{plural(total, "result")}</span>
      </div>
      {more ? (
        <a className={r.groupMore} href={more.href}>
          {more.label}
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

function ProjectRow({ card, position }: { card: ContentCard; position: number }) {
  return (
    <article className={r.project} data-result-type={card.type} data-result-slug={card.slug} data-result-position={position}>
      <div className={r.projectImage} style={card.image ? { backgroundImage: `url("${card.image.thumbnailUrl}")` } : undefined} aria-hidden="true" />
      <div className={r.projectText}>
        <p className={r.eyebrow}>{card.type === "CASE_STUDY" ? (card.demo ? "OUR WORK · DEMO" : "OUR WORK") : "PROJECT"}</p>
        <h3>
          <a className={r.stretch} href={card.href}>
            {card.title}
          </a>
        </h3>
        <p className={r.projectSummary}>{card.summary}</p>
      </div>
    </article>
  );
}

function GuideRow({ card, position }: { card: ContentCard; position: number }) {
  return (
    <li className={r.guide} data-result-type="GUIDE" data-result-slug={card.slug} data-result-position={position}>
      <BookOpen size={20} aria-hidden="true" className={r.guideIcon} />
      <div className={r.guideText}>
        <h3>
          <a className={r.stretch} href={card.href}>
            {card.title}
          </a>
        </h3>
        <p>{card.summary}</p>
      </div>
      <ArrowRight size={18} aria-hidden="true" className={r.guideArrow} />
    </li>
  );
}

function Pages({ results }: { results: SearchResults }) {
  if (results.pages <= 1) return null;
  const at = (page: number) => href(results.q, { scope: results.scope, page: String(page) });
  return (
    <nav className={r.pages} aria-label="Result pages">
      {results.page > 1 ? (
        <a className={r.pageLink} href={at(results.page - 1)} rel="prev">
          Previous
        </a>
      ) : null}
      <span className={r.pageNow}>
        Page {results.page} of {results.pages}
      </span>
      {results.page < results.pages ? (
        <a className={r.pageLink} href={at(results.page + 1)} rel="next">
          Next
        </a>
      ) : null}
    </nav>
  );
}

/** Pen 07 · S82uZc: grouped results with "Narrow it down" and "Not sure what you need?". */
function Results({ results }: { results: SearchResults }) {
  const all = results.scope === "all";
  const show = (scope: SearchScope) => (all || results.scope === scope) && results.counts[scope as "products" | "projects" | "guides"] > 0;
  let position = 0;
  return (
    <div className={r.body}>
      <div className={r.results} data-search-q={results.q}>
        {show("products") ? (
          <section className={r.group} aria-labelledby="results-products">
            <GroupHead
              id="results-products"
              title="Products"
              total={results.products.total}
              more={all && results.products.total > results.products.entries.length ? { label: `See all ${plural(results.products.total, "product")}`, href: href(results.q, { scope: "products" }) } : undefined}
            />
            <div className={all ? r.productRow : r.productGrid}>
              {results.products.entries.map((product) => (
                <div key={product.slug} data-result-type="PRODUCT" data-result-slug={product.slug} data-result-position={position++}>
                  <ProductCard product={product} square />
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {show("projects") ? (
          <section className={r.group} aria-labelledby="results-projects">
            <GroupHead
              id="results-projects"
              title="Projects"
              total={results.projects.total}
              more={all ? { label: results.projects.total > results.projects.entries.length ? `See all ${plural(results.projects.total, "project")}` : "All projects", href: all && results.projects.total > results.projects.entries.length ? href(results.q, { scope: "projects" }) : "/projects" } : undefined}
            />
            <div className={r.projectRow}>
              {results.projects.entries.map((card) => (
                <ProjectRow key={card.href} card={card} position={position++} />
              ))}
            </div>
          </section>
        ) : null}
        {show("guides") ? (
          <section className={`${r.group} ${r.guides}`} aria-labelledby="results-guides">
            <GroupHead
              id="results-guides"
              title="Guides"
              total={results.guides.total}
              more={all ? { label: results.guides.total > results.guides.entries.length ? `See all ${plural(results.guides.total, "guide")}` : "All guides", href: results.guides.total > results.guides.entries.length ? href(results.q, { scope: "guides" }) : "/resources" } : undefined}
            />
            <ul className={r.guideList}>
              {results.guides.entries.map((card) => (
                <GuideRow key={card.href} card={card} position={position++} />
              ))}
            </ul>
          </section>
        ) : null}
        <Pages results={results} />
      </div>
      <aside className={r.rail} aria-label="More ways to find it">
        {results.narrow.categories.length || results.narrow.searches.length ? (
          <nav className={r.narrow} aria-labelledby="narrow-title">
            <h2 id="narrow-title">Narrow it down</h2>
            <ul>
              {results.narrow.categories.map((category) => (
                <li key={category.slug}>
                  <a href={`/products?${new URLSearchParams({ q: results.q, category: category.slug })}`}>
                    <CornerDownRight size={16} aria-hidden="true" />
                    {capital(results.q)} in {category.name}
                  </a>
                </li>
              ))}
              {results.narrow.searches.map((phrase) => (
                <li key={phrase}>
                  <a href={href(phrase)}>
                    <CornerDownRight size={16} aria-hidden="true" />
                    {capital(phrase)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <div className={r.notSure}>
          <h2>Not sure what you need?</h2>
          <p>Tell us who it&apos;s for and how many. We&apos;ll suggest the right products and a price.</p>
          <a className={r.redButton} href="/start">
            Start a project
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </aside>
    </div>
  );
}

/** Pen 10 · ZW64K (desktop) and Pen 08 C (phone): never a blank page (PUB-FR-016). */
function NoResults({ results }: { results: SearchResults }) {
  const closest = results.closest;
  const options = [
    ...(closest?.product
      ? [
          {
            key: "product",
            eyebrow: "CLOSEST PRODUCT",
            title: closest.product.name,
            detail: [closest.product.summary, priceLine(closest.product).text, closest.product.moq && closest.product.moq > 1 ? `Min ${closest.product.moq}` : null].filter(Boolean).join(" · "),
            href: `/products/${closest.product.slug}`,
            image: closest.product.image?.url ?? null,
            icon: <Package size={20} aria-hidden="true" />,
          },
        ]
      : []),
    ...(closest?.category
      ? [
          {
            key: "category",
            eyebrow: "BROWSE CATEGORY",
            title: closest.category.name,
            detail: plural(closest.category.count, "product"),
            href: `/categories/${closest.category.slug}`,
            image: null,
            icon: <Folder size={20} aria-hidden="true" />,
          },
        ]
      : []),
    ...(closest?.guide
      ? [
          {
            key: "guide",
            eyebrow: "READ THE GUIDE",
            title: closest.guide.title,
            detail: closest.guide.summary,
            href: closest.guide.href,
            image: closest.guide.image?.url ?? null,
            icon: <Info size={20} aria-hidden="true" />,
          },
        ]
      : []),
  ];
  return (
    <div className={`${r.body} ${r.emptyBody}`}>
      <div className={r.empty}>
        <span className={r.emptyIcon} aria-hidden="true">
          <SearchX size={28} />
        </span>
        <h1 className={r.emptyTitle}>
          <span className={r.onlyDesktop}>No exact result for ‘{results.q}’</span>
          <span className={r.onlyPhone}>No exact match for ‘{results.q}’</span>
        </h1>
        <p className={r.emptyLead}>
          We may still be able to make or source this.{options.length ? " Here's what's closest:" : ""}
        </p>
        {options.length ? (
          <ul className={r.options}>
            {options.map((option) => (
              <li key={option.key} className={r.option}>
                <div className={r.optionImage} style={option.image ? { backgroundImage: `url("${option.image}")` } : undefined} aria-hidden="true" />
                <span className={r.optionIcon}>{option.icon}</span>
                <div className={r.optionText}>
                  <p className={r.eyebrow}>{option.eyebrow}</p>
                  <h2>
                    <a className={r.stretch} href={option.href}>
                      {option.title}
                    </a>
                  </h2>
                  <p className={r.optionDetail}>{option.detail}</p>
                </div>
                <ArrowRight size={16} aria-hidden="true" className={r.optionArrow} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <form className={r.tellUs} action="/contact" method="get">
        <h2>
          <span className={r.onlyDesktop}>Tell us what you need</span>
          <span className={r.onlyPhone}>Still want it?</span>
        </h2>
        <p>
          <span className={r.onlyDesktop}>Describe the item, quantity and date. We&apos;ll tell you if we can source or make something close, usually with a quote.</span>
          <span className={r.onlyPhone}>Describe it and we&apos;ll check if we can source or make something similar.</span>
        </p>
        <input type="hidden" name="topic" value="NEW_ORDER" />
        <label className="hp-visually-hidden" htmlFor="tell-us-need">
          Tell us what you need
        </label>
        <textarea id="tell-us-need" name="need" className={r.tellUsText} rows={4} defaultValue={results.q} placeholder="e.g. 200 glass cups with our logo for a launch in March" maxLength={4000} />
        <button type="submit" className={r.tellUsButton}>
          <span className={r.onlyDesktop}>Send to our team</span>
          <span className={r.onlyPhone}>Tell us what you need</span>
          <ArrowRight size={16} aria-hidden="true" className={r.onlyDesktop} />
        </button>
      </form>
    </div>
  );
}

/** Site search (T02-06, PUB-FR-006, 007, 016): Pen 07 results, Pen 10 no results, Pen 08 on phones. */
export default async function SearchPage({ searchParams }: Params) {
  const query = parse(await searchParams);
  const found = query ? await getSearchResults(query) : null;
  const busy = found === "RATE_LIMITED";
  const results = busy ? null : found;
  return (
    <SiteShell>
      <div className={r.head}>
        <form className={r.field} action="/search" role="search" aria-label="Search">
          <svg className={r.fieldIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <SuggestInput id="site-search" className={r.fieldInput} defaultValue={results?.q ?? query?.q ?? ""} placeholder="Search products, projects, guides" label="Search" autoFocus={!results} />
          <button type="submit" className={r.fieldButton}>
            Search
          </button>
        </form>
        {results?.typed ? (
          <div className={r.correction}>
            <p>
              Showing results for <strong>{results.q}</strong>
            </p>
            <p className={r.typed}>
              You typed ‘{results.typed}’.{" "}
              <a href={href(results.typed, { exact: "1" })}>Search for that instead</a>
            </p>
          </div>
        ) : null}
        {results && results.counts.all > 0 ? (
          <nav className={r.scopes} aria-label="Result types">
            <ul>
              {SCOPES.map((scope) => {
                const count = scope.count(results);
                if (scope.value !== "all" && count === 0) return null;
                return (
                  <li key={scope.value}>
                    <a className={r.scope} href={href(results.q, scope.value === "all" ? {} : { scope: scope.value })} aria-current={results.scope === scope.value ? "page" : undefined}>
                      {scope.label}
                      <span className={r.scopeCount}>{count}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
        {results && results.counts.all > 0 ? <h1 className="hp-visually-hidden">Results for ‘{results.q}’</h1> : null}
        {busy ? (
          <>
            <h1 className={r.prompt}>Search is busy right now</h1>
            <p role="status">You&apos;ve searched a lot in a short time. Wait a minute, then search again.</p>
          </>
        ) : null}
        {!results && !busy ? <h1 className={r.prompt}>What are you looking for?</h1> : null}
      </div>
      {results ? results.counts.all > 0 ? <Results results={results} /> : <NoResults results={results} /> : null}
      {results ? <ClickTracker q={results.q} /> : null}
    </SiteShell>
  );
}
