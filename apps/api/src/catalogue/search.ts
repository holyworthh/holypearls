import {
  type ContentCard,
  type ContentFields,
  contentHref,
  type PublicProductCard,
  type SearchPhrase,
  type SearchResults,
  type SearchScope,
  type SearchSuggestions,
} from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, gte, inArray, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import { contentCardsByIds } from "./content.js";
import { plainText } from "./rich-text.js";
import { cardsByIds, listOrder, searchSuggestions, visibleProduct } from "./storefront.js";

/*
 * Search (T02-06, PUB-FR-006, 007, 016; TECH-00 §2: PostgreSQL full text,
 * pg_trgm and staff phrases). The index holds published records only and is
 * rebuilt by the search.refresh job; searching never reads drafts.
 */

type DocType = (typeof schema.searchDocType.enumValues)[number];
type Doc = { docType: DocType; refId: string; slug: string; title: string; summary: string; bodyText: string; phrasesText: string; categorySlug: string | null; boost: number };

const rowsOf = <T>(result: unknown): T[] => (Array.isArray(result) ? result : ((result as { rows?: T[] }).rows ?? [])) as T[];

/** Staff phrases grouped by what they lead to. */
async function staffPhrases(db: Database) {
  const rows = await db.select().from(schema.searchPhrases);
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(`${row.targetType}:${row.targetId}`, [...(map.get(`${row.targetType}:${row.targetId}`) ?? []), row.phrase]);
  return (type: string, id: string) => map.get(`${type}:${id}`) ?? [];
}

/** Every searchable record as it is published now. */
async function currentDocuments(db: Database): Promise<Doc[]> {
  const phrasesFor = await staffPhrases(db);
  const popular = await listOrder(db, "home.most-ordered");
  const products = await db
    .select({
      id: schema.products.id,
      slug: schema.products.slug,
      name: schema.products.name,
      summary: schema.products.summary,
      description: schema.products.description,
      phrases: schema.products.searchPhrases,
      categorySlug: sql<string>`coalesce((select p.slug from categories p where p.id = ${schema.categories.parentId}), ${schema.categories.slug})`,
      categoryName: schema.categories.name,
    })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(visibleProduct());
  const categories = await db
    .select({ id: schema.categories.id, slug: schema.categories.slug, name: schema.categories.name, description: schema.categories.description })
    .from(schema.categories)
    .where(and(eq(schema.categories.status, "PUBLISHED"), sql`(${schema.categories.parentId} is null or exists (select 1 from categories p where p.id = ${schema.categories.parentId} and p.status = 'PUBLISHED'))`));
  const pages = await db
    .select()
    .from(schema.contentPages)
    .where(and(eq(schema.contentPages.status, "PUBLISHED"), inArray(schema.contentPages.type, ["PROJECT", "GUIDE", "CASE_STUDY"])));

  return [
    ...products.map((product) => ({
      docType: "PRODUCT" as const,
      refId: product.id,
      slug: product.slug,
      title: product.name,
      summary: product.summary ?? "",
      bodyText: [product.description ?? "", product.categoryName].join(" "),
      phrasesText: [...product.phrases, ...phrasesFor("PRODUCT", product.id)].join(" "),
      categorySlug: product.categorySlug,
      boost: popular.includes(product.id) ? popular.length - popular.indexOf(product.id) : 0,
    })),
    ...categories.map((category) => ({
      docType: "CATEGORY" as const,
      refId: category.id,
      slug: category.slug,
      title: category.name,
      summary: category.description ?? "",
      bodyText: "",
      phrasesText: phrasesFor("CATEGORY", category.id).join(" "),
      categorySlug: category.slug,
      boost: 0,
    })),
    ...pages.map((page) => {
      const live = page.published as ContentFields;
      const data = live.data as Record<string, unknown>;
      // Kit items, facts and comparison rows are searchable words too.
      const extra = JSON.stringify(data)
        .replace(/"[a-zA-Z]+":/g, " ")
        .replace(/[{}[\]",]/g, " ");
      return {
        docType: page.type as DocType,
        refId: page.id,
        slug: live.slug,
        title: live.title,
        summary: live.summary,
        bodyText: `${plainText(live.body)} ${extra}`.slice(0, 20_000),
        phrasesText: phrasesFor("PAGE", page.id).join(" "),
        categorySlug: null,
        boost: live.featured ? 1 : 0,
      };
    }),
  ];
}

/**
 * search.refresh: rebuilds the index from published records. Safe to run any
 * time and to repeat; a failed run leaves the previous index in place.
 */
export async function refreshSearchIndex(db: Database): Promise<number> {
  const docs = await currentDocuments(db);
  await db.transaction(async (tx) => {
    await tx.delete(schema.searchDocuments);
    for (let start = 0; start < docs.length; start += 200) await tx.insert(schema.searchDocuments).values(docs.slice(start, start + 200));
  });
  return docs.length;
}

/* ---------- Query handling ---------- */

export const normalizeQuery = (q: string) => q.replace(/\s+/g, " ").trim().slice(0, 100);

/** What's kept for analytics: lower-case, no emails or phone-like numbers (PRD-01 §11). */
export function redactQuery(q: string): string {
  return normalizeQuery(q)
    .toLowerCase()
    .replace(/[^\s@]+@[^\s@]+/g, "[email]")
    .replace(/\+?\d[\d\s()-]{5,}\d/g, "[number]");
}

async function recordEvent(db: Database, event: { kind: "SEARCH" | "NO_RESULTS" | "CLICK"; query: string; scope?: string; results?: number; targetType?: string; targetSlug?: string; position?: number }) {
  await db.insert(schema.searchEvents).values({ ...event, query: redactQuery(event.query) });
}

const tsQuery = (q: string) => sql`websearch_to_tsquery('english', ${q})`;
const matches = (q: string) => sql`${schema.searchDocuments.tsv} @@ ${tsQuery(q)}`;

/** Words of the query that match nothing are replaced by the closest indexed word (one or two letters off). */
async function correct(db: Database, q: string): Promise<string | null> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const fixed: string[] = [];
  let changed = false;
  for (const word of words) {
    const clean = word.replace(/[^\p{L}\p{N}]/gu, "");
    if (clean.length < 3) {
      fixed.push(word);
      continue;
    }
    const [known] = rowsOf<{ known: boolean }>(
      await db.execute(sql`select (plainto_tsquery('english', ${clean})::text = '' or exists (select 1 from search_documents where tsv @@ plainto_tsquery('english', ${clean}))) as known`),
    );
    if (known?.known) {
      fixed.push(word);
      continue;
    }
    const max = clean.length <= 4 ? 1 : 2;
    const [best] = rowsOf<{ word: string }>(
      await db.execute(sql`
        select word from (select distinct regexp_split_to_table(terms, '[^[:alnum:]]+') as word from search_documents) lexicon
        where length(word) >= 3 and levenshtein_less_equal(word, ${clean}, ${max}) <= ${max}
        order by levenshtein(word, ${clean}), similarity(word, ${clean}) desc, word
        limit 1`),
    );
    if (best) {
      fixed.push(best.word);
      changed = true;
    } else fixed.push(word);
  }
  return changed ? fixed.join(" ") : null;
}

const GROUP: Record<Exclude<SearchScope, "all">, DocType[]> = {
  products: ["PRODUCT"],
  // Case studies are examples of projects, so they sit with them.
  projects: ["PROJECT", "CASE_STUDY"],
  guides: ["GUIDE"],
};
const ALL_LIMIT = { products: 3, projects: 2, guides: 3 };
const PAGE_SIZE = 12;

async function ranked(db: Database, q: string, types: DocType[], limit: number, offset = 0) {
  return db
    .select({ refId: schema.searchDocuments.refId, docType: schema.searchDocuments.docType })
    .from(schema.searchDocuments)
    .where(and(inArray(schema.searchDocuments.docType, types), matches(q)))
    .orderBy(desc(sql`ts_rank_cd(${schema.searchDocuments.tsv}, ${tsQuery(q)}, 32)`), desc(schema.searchDocuments.boost), asc(schema.searchDocuments.title))
    .limit(limit)
    .offset(offset);
}

async function countByGroup(db: Database, q: string) {
  const rows = await db
    .select({ docType: schema.searchDocuments.docType, count: sql<number>`count(*)::int` })
    .from(schema.searchDocuments)
    .where(matches(q))
    .groupBy(schema.searchDocuments.docType);
  const count = (types: DocType[]) => rows.filter((row) => types.includes(row.docType)).reduce((sum, row) => sum + row.count, 0);
  return { products: count(GROUP.products), projects: count(GROUP.projects), guides: count(GROUP.guides) };
}

async function pageCards(db: Database, ids: string[]): Promise<ContentCard[]> {
  return contentCardsByIds(db, ids);
}

/** "Narrow it down": top-level categories holding matching products, and related everyday searches. */
async function narrowing(db: Database, q: string) {
  const categories = rowsOf<{ slug: string; name: string; count: number }>(
    await db.execute(sql`
      select c.slug, c.name, count(*)::int as count
      from search_documents d join categories c on c.slug = d.category_slug
      where d.doc_type = 'PRODUCT' and d.tsv @@ ${tsQuery(q)}
      group by c.slug, c.name order by count desc, c.name limit 2`),
  );
  const words = q.toLowerCase().split(/\s+/).filter((word) => word.length >= 3);
  const phraseRows = rowsOf<{ phrase: string }>(
    await db.execute(sql`
      select distinct lower(phrase) as phrase from (
        select unnest(search_phrases) as phrase from products where ${visibleProduct()}
        union all select phrase from search_phrases
      ) phrases`),
  );
  const searches = phraseRows
    .map((row) => row.phrase)
    .filter((phrase) => phrase !== q.toLowerCase() && words.some((word) => phrase.includes(word)))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, 2);
  return { categories, searches };
}

/** For no results: the best product, category and guide matching any one word (Pen 10). */
async function closestTo(db: Database, q: string): Promise<SearchResults["closest"]> {
  const anyWord = sql`to_tsquery('english', ${q
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word.length >= 3)
    .join(" | ") || "zzzzzz"})`;
  const best = async (types: DocType[]) => {
    const [row] = await db
      .select({ refId: schema.searchDocuments.refId, slug: schema.searchDocuments.slug })
      .from(schema.searchDocuments)
      .where(and(inArray(schema.searchDocuments.docType, types), sql`${schema.searchDocuments.tsv} @@ ${anyWord}`))
      .orderBy(desc(sql`ts_rank_cd(${schema.searchDocuments.tsv}, ${anyWord}, 32)`), desc(schema.searchDocuments.boost))
      .limit(1);
    return row ?? null;
  };
  const [product, category, guide] = await Promise.all([best(["PRODUCT"]), best(["CATEGORY"]), best(["GUIDE"])]);
  const [productCard] = product ? await cardsByIds(db, [product.refId]) : [];
  const categoryHit = category
    ? rowsOf<{ slug: string; name: string; count: number }>(
        await db.execute(sql`
          select c.slug, c.name, (select count(*)::int from search_documents d where d.doc_type = 'PRODUCT' and d.category_slug = c.slug) as count
          from categories c where c.slug = ${category.slug}`),
      )[0]
    : null;
  const [guideCard] = guide ? await pageCards(db, [guide.refId]) : [];
  if (!productCard && !categoryHit && !guideCard) return null;
  return { product: productCard ?? null, category: categoryHit ?? null, guide: guideCard ?? null };
}

export async function search(db: Database, input: { q: string; scope: SearchScope; page: number; exact: boolean }): Promise<SearchResults> {
  const typedQuery = normalizeQuery(input.q);
  let q = typedQuery;
  let typed: string | null = null;
  let counts = await countByGroup(db, q);
  if (!input.exact && counts.products + counts.projects + counts.guides === 0) {
    const corrected = await correct(db, q);
    if (corrected) {
      const correctedCounts = await countByGroup(db, corrected);
      if (correctedCounts.products + correctedCounts.projects + correctedCounts.guides > 0) {
        typed = typedQuery;
        q = corrected;
        counts = correctedCounts;
      }
    }
  }
  const all = counts.products + counts.projects + counts.guides;
  const scoped = input.scope !== "all";
  const total = scoped ? counts[input.scope as keyof typeof counts] : all;
  const pages = scoped ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
  const page = Math.min(input.page, pages);
  const offset = (page - 1) * PAGE_SIZE;
  const take = (group: keyof typeof GROUP) => (scoped ? (input.scope === group ? PAGE_SIZE : 0) : ALL_LIMIT[group]);

  const [productRows, projectRows, guideRows] = await Promise.all(
    (["products", "projects", "guides"] as const).map((group) => (take(group) ? ranked(db, q, GROUP[group], take(group), scoped ? offset : 0) : Promise.resolve([]))),
  );
  const products: PublicProductCard[] = await cardsByIds(db, productRows!.map((row) => row.refId));
  const [projects, guides] = await Promise.all([pageCards(db, projectRows!.map((row) => row.refId)), pageCards(db, guideRows!.map((row) => row.refId))]);

  const results: SearchResults = {
    q,
    typed,
    scope: input.scope,
    page,
    pages,
    counts: { all, ...counts },
    products: { total: counts.products, entries: products },
    projects: { total: counts.projects, entries: projects },
    guides: { total: counts.guides, entries: guides },
    narrow: all ? await narrowing(db, q) : { categories: [], searches: [] },
    closest: all ? null : await closestTo(db, q),
  };
  // One event per search, not per page of results.
  if (page === 1) await recordEvent(db, { kind: all ? "SEARCH" : "NO_RESULTS", query: typedQuery, scope: input.scope, results: all });
  return results;
}

export async function recordSearchClick(db: Database, click: { q: string; type: string; slug: string; position: number }) {
  await recordEvent(db, { kind: "CLICK", query: click.q, targetType: click.type, targetSlug: click.slug, position: click.position });
}

/** Guides for the typeahead (Pen 09): titles containing what's typed, then full-text matches. */
export async function suggestedGuides(db: Database, q: string, limit = 1): Promise<{ title: string; href: string }[]> {
  const term = `%${q.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
  const rows = await db
    .select({ slug: schema.searchDocuments.slug, title: schema.searchDocuments.title })
    .from(schema.searchDocuments)
    .where(and(eq(schema.searchDocuments.docType, "GUIDE"), sql`(${schema.searchDocuments.title} ilike ${term} or ${schema.searchDocuments.tsv} @@ ${tsQuery(q)})`))
    .orderBy(asc(sql`case when ${schema.searchDocuments.title} ilike ${term} then 0 else 1 end`), desc(schema.searchDocuments.boost), asc(schema.searchDocuments.title))
    .limit(limit);
  return rows.map((row) => ({ title: row.title, href: contentHref("GUIDE", row.slug) }));
}

/** Staff phrases for the typeahead's "Searches". */
export async function staffPhrasesLike(db: Database, q: string): Promise<string[]> {
  const term = `%${q.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
  const rows = await db.select({ phrase: schema.searchPhrases.phrase }).from(schema.searchPhrases).where(sql`${schema.searchPhrases.phrase} ilike ${term}`);
  return [...new Set(rows.map((row) => row.phrase))];
}

/* ---------- Staff phrases (PUB-FR-007) ---------- */

async function describeTarget(db: Database, type: "PRODUCT" | "CATEGORY" | "PAGE", id: string): Promise<{ label: string; href: string } | null> {
  if (type === "PRODUCT") {
    const [row] = await db.select({ name: schema.products.name, slug: schema.products.slug }).from(schema.products).where(eq(schema.products.id, id));
    return row ? { label: row.name, href: `/products/${row.slug}` } : null;
  }
  if (type === "CATEGORY") {
    const [row] = await db.select({ name: schema.categories.name, slug: schema.categories.slug }).from(schema.categories).where(eq(schema.categories.id, id));
    return row ? { label: row.name, href: `/categories/${row.slug}` } : null;
  }
  const [row] = await db.select({ title: schema.contentPages.title, slug: schema.contentPages.slug, type: schema.contentPages.type }).from(schema.contentPages).where(eq(schema.contentPages.id, id));
  return row ? { label: row.title, href: contentHref(row.type, row.slug) } : null;
}

export async function listSearchPhrases(db: Database): Promise<SearchPhrase[]> {
  const rows = await db
    .select({ phrase: schema.searchPhrases, by: schema.staffProfiles.displayName })
    .from(schema.searchPhrases)
    .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.id, schema.searchPhrases.createdByStaffId))
    .orderBy(asc(sql`lower(${schema.searchPhrases.phrase})`));
  const entries: SearchPhrase[] = [];
  for (const row of rows) {
    const target = await describeTarget(db, row.phrase.targetType, row.phrase.targetId);
    entries.push({
      id: row.phrase.id,
      phrase: row.phrase.phrase,
      target: { type: row.phrase.targetType, id: row.phrase.targetId, label: target?.label ?? "Removed", href: target?.href ?? "" },
      createdAt: row.phrase.createdAt.toISOString(),
      createdBy: row.by,
    });
  }
  return entries;
}

export async function createSearchPhrase(db: Database, actor: ActorContext, input: { phrase: string; targetType: "PRODUCT" | "CATEGORY" | "PAGE"; targetId: string }) {
  const target = await describeTarget(db, input.targetType, input.targetId);
  if (!target) throw new AppError("VALIDATION_FAILED", { fieldErrors: { targetId: "Choose a product, category or page that exists" } });
  const phrase = input.phrase.replace(/\s+/g, " ").trim().toLowerCase();
  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.searchPhrases)
        .values({ phrase, targetType: input.targetType, targetId: input.targetId, createdByStaffId: actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null })
        .returning({ id: schema.searchPhrases.id });
      await recordAudit(tx, actor, {
        action: "search.phrase_added",
        summary: `Search phrase added: “${phrase}” → ${target.label}`,
        recordType: "SEARCH_PHRASE",
        recordId: row!.id,
        recordLabel: phrase,
        after: { phrase, target: input.targetType, href: target.href },
      });
      return row!.id;
    });
    return (await listSearchPhrases(db)).find((entry) => entry.id === id)!;
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
      throw new AppError("VALIDATION_FAILED", { fieldErrors: { phrase: "This phrase already leads there" } });
    }
    throw error;
  }
}

export async function deleteSearchPhrase(db: Database, actor: ActorContext, id: string) {
  const [row] = await db.select().from(schema.searchPhrases).where(eq(schema.searchPhrases.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  await db.transaction(async (tx) => {
    await tx.delete(schema.searchPhrases).where(eq(schema.searchPhrases.id, id));
    await recordAudit(tx, actor, {
      action: "search.phrase_removed",
      summary: `Search phrase removed: “${row.phrase}”`,
      recordType: "SEARCH_PHRASE",
      recordId: id,
      recordLabel: row.phrase,
      before: { phrase: row.phrase, target: row.targetType },
    });
  });
}

/** Products, categories and published pages staff can point a phrase at. */
export async function searchTargets(db: Database, q: string) {
  const term = `%${q.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
  const [products, categories, pages] = await Promise.all([
    db
      .select({ id: schema.products.id, label: schema.products.name, detail: schema.products.sku })
      .from(schema.products)
      .where(and(sql`${schema.products.name} ilike ${term}`, sql`${schema.products.status} <> 'ARCHIVED'`))
      .limit(6),
    db
      .select({ id: schema.categories.id, label: schema.categories.name, detail: schema.categories.slug })
      .from(schema.categories)
      .where(and(sql`${schema.categories.name} ilike ${term}`, sql`${schema.categories.status} <> 'ARCHIVED'`))
      .limit(4),
    db
      .select({ id: schema.contentPages.id, label: schema.contentPages.title, detail: schema.contentPages.type })
      .from(schema.contentPages)
      .where(and(sql`${schema.contentPages.title} ilike ${term}`, sql`${schema.contentPages.status} <> 'ARCHIVED'`))
      .limit(4),
  ]);
  return [
    ...products.map((row) => ({ type: "PRODUCT" as const, ...row, detail: `Product · ${row.detail}` })),
    ...categories.map((row) => ({ type: "CATEGORY" as const, ...row, detail: "Category" })),
    ...pages.map((row) => ({ type: "PAGE" as const, ...row, detail: row.detail === "GUIDE" ? "Guide" : row.detail === "PROJECT" ? "Project page" : row.detail === "CASE_STUDY" ? "Case study" : "Page" })),
  ];
}

/** Last 30 days: how many searches, how many found nothing, and the most common of each. */
export async function searchReport(db: Database, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const top = async (kinds: ("SEARCH" | "NO_RESULTS")[]) =>
    db
      .select({ query: schema.searchEvents.query, count: sql<number>`count(*)::int` })
      .from(schema.searchEvents)
      .where(and(inArray(schema.searchEvents.kind, kinds), gte(schema.searchEvents.createdAt, since)))
      .groupBy(schema.searchEvents.query)
      .orderBy(desc(sql`count(*)`), asc(schema.searchEvents.query))
      .limit(10);
  const totals = await db
    .select({ kind: schema.searchEvents.kind, count: sql<number>`count(*)::int` })
    .from(schema.searchEvents)
    .where(gte(schema.searchEvents.createdAt, since))
    .groupBy(schema.searchEvents.kind);
  const count = (kind: string) => totals.find((row) => row.kind === kind)?.count ?? 0;
  return {
    since: since.toISOString(),
    searches: count("SEARCH") + count("NO_RESULTS"),
    noResults: count("NO_RESULTS"),
    top: await top(["SEARCH", "NO_RESULTS"]),
    topNoResults: await top(["NO_RESULTS"]),
  };
}

/** The typeahead (Pen 09): the catalogue's suggestions plus staff phrases and a matching guide. */
export async function typeahead(db: Database, q: string): Promise<SearchSuggestions> {
  const [base, staff, guides] = await Promise.all([searchSuggestions(db, q), staffPhrasesLike(db, q), suggestedGuides(db, q, 1)]);
  const lower = q.toLowerCase();
  const searches = [...new Set([...base.searches, ...staff])]
    .filter((phrase) => phrase.toLowerCase() !== lower)
    .sort((a, b) => Number(!a.toLowerCase().startsWith(lower)) - Number(!b.toLowerCase().startsWith(lower)) || a.length - b.length || a.localeCompare(b))
    .slice(0, 4);
  return { ...base, searches, guides };
}
