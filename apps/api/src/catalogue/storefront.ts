import type {
  Hub,
  HubSection,
  PriceState,
  PublicCategory,
  PublicImage,
  PublicProductCard,
  PublicProductQuery,
  QuantityBand,
  SearchSuggestions,

} from "@holypearls/contracts";
import { BUSINESS_TIME_ZONE, businessDate, decorationMethodSchema, hubSchema, listPriceFilterSchema, makingRouteSchema, quantityBandSchema } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, isNull, schema, sql, type SQL, type Transaction } from "@holypearls/db";
import { AppError } from "../errors.js";
import { configuratorFor } from "../configuration/pricing.js";
import { mostOrderedIds } from "./most-ordered.js";

/*
 * Public catalogue reads (T02-03). Only PUBLISHED and TEMPORARILY_UNAVAILABLE
 * products in PUBLISHED categories are ever returned; drafts and archived
 * records never leave the API (PUB-FR-008 "Draft products never appear").
 */

const VISIBLE = ["PUBLISHED", "TEMPORARILY_UNAVAILABLE"] as const;

const PRICE_STATE: Record<string, PriceState> = {
  SIMPLE_CONFIGURABLE: "PRICE_ON_CONFIGURATION",
  CONFIGURABLE_QUOTE: "QUOTE_REQUIRED",
  CONSULTATIVE_PROJECT: "CONSULTATION_REQUIRED",
};

export const mediaUrl = (fileId: string, kind: "preview" | "thumbnail") => `/api/v1/media/${fileId}/${kind}`;

export const image = (fileId: string | null, alt: string | null, width: number | null, height: number | null): PublicImage | null =>
  fileId ? { url: mediaUrl(fileId, "preview"), thumbnailUrl: mediaUrl(fileId, "thumbnail"), alt: alt ?? "", width, height } : null;

/** Visible product, in a published category (and a published parent, if it has one). */
export function visibleProduct(): SQL {
  return sql`${schema.products.status} in ('PUBLISHED', 'TEMPORARILY_UNAVAILABLE')
    and ${schema.products.listed}
    and exists (
      select 1 from categories c
      left join categories parent on parent.id = c.parent_id
      where c.id = ${schema.products.categoryId}
        and c.status = 'PUBLISHED'
        and (c.parent_id is null or parent.status = 'PUBLISHED')
    )`;
}

/** The main image: the first product image whose file is READY. */
const mainImage = sql<{ fileId: string; alt: string; width: number | null; height: number | null } | null>`(
  select json_build_object('fileId', m.file_id, 'alt', m.alt, 'width', (f.metadata->>'width')::int, 'height', (f.metadata->>'height')::int)
  from product_media m join files f on f.id = m.file_id
  where m.product_id = ${schema.products.id} and f.status = 'READY'
  order by m.position, m.created_at limit 1
)`;

/** The price rule in effect now (TECH-05: the latest that has started). */
const listPrice = sql<{ amountMinor: string; currency: "NGN" | "USD"; basis: "PER_UNIT" | "PER_PACK" | "FIXED"; packSize: number; state: "PRICE_READY" | "ESTIMATE_READY" } | null>`(
  select json_build_object('amountMinor', r.base_minor::text, 'currency', r.currency, 'basis', r.basis, 'packSize', r.pack_size, 'state', r.state)
  from price_rules r
  where r.product_id = ${schema.products.id} and r.effective_from <= now()
  order by r.effective_from desc limit 1
)`;

const minimumOrder = sql<number | null>`(select pr.moq from product_rules pr where pr.product_id = ${schema.products.id})`;

/** The card's price state as a filter value; consultative products and products without a price are quoted. */
const priceState = sql<string>`(case when ${schema.products.buyingMode} = 'CONSULTATIVE_PROJECT' then 'QUOTE_REQUIRED'
  else coalesce((select r.state::text from price_rules r where r.product_id = ${schema.products.id} and r.effective_from <= now()
    order by r.effective_from desc limit 1), 'QUOTE_REQUIRED') end)`;

/** Standard lead time; products without rules use the rules' default of 5 working days. */
const leadMaxDays = sql<number>`coalesce((select pr.lead_max_days from product_rules pr where pr.product_id = ${schema.products.id}), 5)`;

/** A band fits when the product's minimum is within it ("1–9" needs a minimum of 9 or less). */
const QUANTITY_MAX: Record<QuantityBand, number | null> = { "1-9": 9, "10-49": 49, "50+": null };
function quantityCondition(band: QuantityBand): SQL {
  const max = QUANTITY_MAX[band];
  return max === null ? sql`true` : sql`coalesce(${minimumOrder}, 1) <= ${max}`;
}

/**
 * Monday–Friday days after today up to the date. "Today" is the business date
 * in Lagos, not the server's or UTC's. Public holidays are not excluded here:
 * this is a storefront filter, and the final quote applies the full calendar.
 */
export function workingDaysUntil(date: string, { now = new Date(), timeZone = BUSINESS_TIME_ZONE }: { now?: Date; timeZone?: string } = {}): number {
  // Both ends are calendar dates, so the count itself runs on plain UTC days.
  const end = new Date(`${date}T00:00:00Z`);
  const day = new Date(`${businessDate(now, timeZone)}T00:00:00Z`);
  let days = 0;
  while (day < end) {
    day.setUTCDate(day.getUTCDate() + 1);
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

const textArray = (values: readonly string[]) => sql`${`{${values.join(",")}}`}::text[]`;

export const cardColumns = {
  slug: schema.products.slug,
  name: schema.products.name,
  summary: schema.products.summary,
  family: schema.products.family,
  buyingMode: schema.products.buyingMode,
  status: schema.products.status,
  categorySlug: schema.categories.slug,
  categoryName: schema.categories.name,
  image: mainImage,
  price: listPrice,
  moq: minimumOrder,
};

type CardRow = {
  slug: string;
  name: string;
  summary: string | null;
  family: PublicProductCard["family"];
  buyingMode: PublicProductCard["buyingMode"];
  status: string;
  categorySlug: string;
  categoryName: string;
  image: { fileId: string; alt: string; width: number | null; height: number | null } | null;
  price: PublicProductCard["price"];
  moq: number | null;
};

export const toCard = (row: CardRow): PublicProductCard => ({
  slug: row.slug,
  name: row.name,
  summary: row.summary,
  family: row.family,
  buyingMode: row.buyingMode,
  category: { slug: row.categorySlug, name: row.categoryName },
  image: row.image ? image(row.image.fileId, row.image.alt, row.image.width, row.image.height) : null,
  available: row.status === "PUBLISHED",
  priceState: row.status === "PUBLISHED" ? (PRICE_STATE[row.buyingMode] ?? "QUOTE_REQUIRED") : "UNAVAILABLE",
  price: row.buyingMode === "CONSULTATIVE_PROJECT" ? null : (row.price ?? null),
  moq: row.moq ?? null,
});

const escapeLikeText = (text: string) => text.replace(/[%_\\]/g, (match) => `\\${match}`);
const escapeLike = (text: string) => `%${escapeLikeText(text)}%`;

/** Name, summary and staff-added everyday phrases (PUB-FR-007 phrases are used here too). */
function searchCondition(q: string): SQL {
  const term = escapeLike(q);
  return sql`(${schema.products.name} ilike ${term} or ${schema.products.summary} ilike ${term}
    or exists (select 1 from unnest(${schema.products.searchPhrases}) phrase where phrase ilike ${term}))`;
}

/** A category slug matches the category itself and its subcategories; several slugs match any of them. */
function categoryCondition(slugs: string[]): SQL {
  const list = `{${slugs.join(",")}}`;
  return sql`${schema.products.categoryId} in (
    select c.id from categories c where c.slug = any(${list}::text[])
    union select child.id from categories child join categories p on p.id = child.parent_id where p.slug = any(${list}::text[])
  )`;
}

export async function listOrder(db: Database, key: string): Promise<string[]> {
  const [row] = await db.select({ ids: schema.merchandisingLists.productIds }).from(schema.merchandisingLists).where(eq(schema.merchandisingLists.key, key));
  return row?.ids ?? [];
}

/** The Product Directory (PUB-FR-008): search, filters, sort and numbered pages, with facet counts. */
export async function listPublicProducts(db: Database, query: PublicProductQuery) {
  const filters: Record<"q" | "category" | "family" | "mode" | "route" | "price" | "qty" | "decoration" | "neededBy", SQL | undefined> = {
    q: query.q ? searchCondition(query.q) : undefined,
    category: query.category ? categoryCondition(query.category) : undefined,
    family: query.family ? inArray(schema.products.family, query.family) : undefined,
    mode: query.mode ? inArray(schema.products.buyingMode, query.mode) : undefined,
    route: query.route ? sql`${schema.products.routes} && ${textArray(query.route)}` : undefined,
    price: query.price ? sql`${priceState} = any(${textArray(query.price)})` : undefined,
    qty: query.qty ? quantityCondition(query.qty) : undefined,
    decoration: query.decoration ? sql`${schema.products.decorations} && ${textArray(query.decoration)}` : undefined,
    neededBy: query.neededBy ? sql`${leadMaxDays} <= ${workingDaysUntil(query.neededBy)}` : undefined,
  };
  const where = (skip?: keyof typeof filters) =>
    and(visibleProduct(), ...Object.entries(filters).flatMap(([key, condition]) => (key === skip || !condition ? [] : [condition])));

  // One array parameter; Drizzle would expand a JavaScript array into a list (and an empty one into "()").
  const popular = await listOrder(db, "home.most-ordered");
  const order =
    query.sort === "name"
      ? [asc(schema.products.name)]
      : query.sort === "newest"
        ? [desc(schema.products.publishedAt), asc(schema.products.name)]
        : [sql`array_position(${`{${popular.join(",")}}`}::uuid[], ${schema.products.id}) nulls last`, asc(schema.products.name)];

  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(where())) as [{ total: number }];
  const pages = Math.max(1, Math.ceil(total / query.limit));
  const page = Math.min(query.page, pages);
  const rows = (await db
    .select(cardColumns)
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(where())
    .orderBy(...order)
    .limit(query.limit)
    .offset((page - 1) * query.limit)) as CardRow[];

  // Facets count top-level categories (a product in a subcategory counts for its parent).
  const topCategory = sql<string>`coalesce((select p.slug from categories p where p.id = ${schema.categories.parentId}), ${schema.categories.slug})`;
  const categoryFacet = await db
    .select({ slug: topCategory, count: sql<number>`count(*)::int` })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(where("category"))
    .groupBy(topCategory);
  const topNames = await db
    .select({ slug: schema.categories.slug, name: schema.categories.name, position: schema.categories.position })
    .from(schema.categories)
    .where(and(isNull(schema.categories.parentId), eq(schema.categories.status, "PUBLISHED")))
    .orderBy(asc(schema.categories.position));
  const familyFacet = await db
    .select({ value: schema.products.family, count: sql<number>`count(*)::int` })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(where("family"))
    .groupBy(schema.products.family);
  // One query per rail group: each value's count, ignoring that group's own filter.
  const facet = async <V extends string>(skip: keyof typeof filters, values: readonly V[], condition: (value: V) => SQL) => {
    const [row] = (await db
      .select(Object.fromEntries(values.map((value, index) => [`c${index}`, sql<number>`(count(*) filter (where ${condition(value)}))::int`])))
      .from(schema.products)
      .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
      .where(where(skip))) as Record<string, number>[];
    return values.map((value, index) => ({ value, count: row?.[`c${index}`] ?? 0 }));
  };
  const routes = await facet("route", makingRouteSchema.options, (value) => sql`${value} = any(${schema.products.routes})`);
  const prices = await facet("price", listPriceFilterSchema.options, (value) => sql`${priceState} = ${value}`);
  const quantities = await facet("qty", quantityBandSchema.options, quantityCondition);
  const decorations = await facet("decoration", decorationMethodSchema.options, (value) => sql`${value} = any(${schema.products.decorations})`);
  const modeFacet = await db
    .select({ value: schema.products.buyingMode, count: sql<number>`count(*)::int` })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(where("mode"))
    .groupBy(schema.products.buyingMode);

  return {
    entries: rows.map(toCard),
    total,
    page,
    pages,
    facets: {
      categories: topNames.map((top) => ({ slug: top.slug, name: top.name, count: categoryFacet.find((row) => row.slug === top.slug)?.count ?? 0 })),
      families: familyFacet.sort((a, b) => b.count - a.count),
      modes: modeFacet,
      routes,
      prices,
      quantities,
      decorations,
    },
  };
}

/**
 * Typeahead (Pen 09 · R8Aqc): up to four everyday searches, three categories and
 * three products for what's typed so far. Only visible products and their
 * phrases are used, so drafts never leak through suggestions.
 */
export async function searchSuggestions(db: Database, q: string): Promise<SearchSuggestions> {
  const term = escapeLike(q);
  const lower = q.toLowerCase();
  const phraseRows = (await db.execute(sql`
    select distinct phrase from products
      join categories on categories.id = products.category_id,
      unnest(products.search_phrases) phrase
    where ${visibleProduct()} and phrase ilike ${term}`)) as unknown as { rows?: { phrase: string }[] } | { phrase: string }[];
  const phrases = (Array.isArray(phraseRows) ? phraseRows : (phraseRows.rows ?? [])).map((row) => row.phrase);
  const searches = phrases
    .filter((phrase) => phrase.toLowerCase() !== lower)
    .sort((a, b) => Number(!a.toLowerCase().startsWith(lower)) - Number(!b.toLowerCase().startsWith(lower)) || a.length - b.length || a.localeCompare(b))
    .slice(0, 4);

  // Categories named like the query, then those holding matching products; counts are all visible products in them.
  const matching = await db
    .select({ categoryId: schema.products.categoryId, parentId: schema.categories.parentId })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(and(visibleProduct(), searchCondition(q)));
  const holding = new Set(matching.flatMap((row) => [row.categoryId, ...(row.parentId ? [row.parentId] : [])]));
  const rows = await db
    .select({
      id: schema.categories.id,
      slug: schema.categories.slug,
      name: schema.categories.name,
      parentId: schema.categories.parentId,
      direct: sql<number>`(select count(*)::int from products where category_id = "categories"."id" and ${sql.raw(`status in ('PUBLISHED','TEMPORARILY_UNAVAILABLE')`)} and listed)`,
    })
    .from(schema.categories)
    .where(eq(schema.categories.status, "PUBLISHED"));
  const published = new Set(rows.map((row) => row.id));
  const flat = rows
    .filter((row) => !row.parentId || published.has(row.parentId))
    .map((row) => ({
      ...row,
      depth: row.parentId ? 1 : 0,
      count: row.direct + rows.filter((child) => child.parentId === row.id).reduce((sum, child) => sum + child.direct, 0),
    }));
  const categories = flat
    .filter((category) => category.count > 0 && (category.name.toLowerCase().includes(lower) || holding.has(category.id)))
    .sort((a, b) => Number(!a.name.toLowerCase().includes(lower)) - Number(!b.name.toLowerCase().includes(lower)) || a.depth - b.depth || b.count - a.count)
    .slice(0, 3)
    .map(({ slug, name, count }) => ({ slug, name, count }));

  return { q, searches, shortcuts: [], categories, products: await suggestedProducts(db, q, 3), guides: [] };
}

/**
 * The typeahead's products: one ranked, limited query, without the
 * directory's count, pages or facets, since it runs as the visitor types.
 * Names starting with the query come first, then names containing it, then
 * summary and phrase matches; the "Most ordered" list breaks ties, then name.
 */
export async function suggestedProducts(db: Database, q: string, limit = 3): Promise<PublicProductCard[]> {
  const popular = await mostOrderedIds(db, await listOrder(db, "home.most-ordered"));
  const rank = sql`case when ${schema.products.name} ilike ${`${escapeLikeText(q)}%`} then 0 when ${schema.products.name} ilike ${escapeLike(q)} then 1 else 2 end`;
  const rows = (await db
    .select(cardColumns)
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(and(visibleProduct(), searchCondition(q)))
    .orderBy(rank, sql`array_position(${`{${popular.join(",")}}`}::uuid[], ${schema.products.id}) nulls last`, asc(schema.products.name))
    .limit(limit)) as CardRow[];
  return rows.map(toCard);
}

export async function cardsBySlugs(db: Database, slugs: string[]): Promise<PublicProductCard[]> {
  if (!slugs.length) return [];
  const rows = (await db
    .select(cardColumns)
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(and(visibleProduct(), inArray(schema.products.slug, slugs)))) as CardRow[];
  return slugs.flatMap((slug) => rows.filter((row) => row.slug === slug)).map(toCard);
}

export async function cardsByIds(db: Database, ids: string[]): Promise<PublicProductCard[]> {
  if (!ids.length) return [];
  const rows = (await db
    .select({ ...cardColumns, id: schema.products.id })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(and(visibleProduct(), inArray(schema.products.id, ids)))) as (CardRow & { id: string })[];
  return ids.flatMap((id) => rows.filter((row) => row.id === id)).map(toCard);
}

/** Each product's main image by ID, whatever its listing state (workspace templates show the product photo first, Pen 68). */
export async function productMainImages(db: Database | Transaction, ids: readonly string[]): Promise<Map<string, PublicImage | null>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ id: schema.products.id, main: mainImage }).from(schema.products).where(inArray(schema.products.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row.main ? image(row.main.fileId, row.main.alt, row.main.width, row.main.height) : null]));
}

/** Published categories as a two-level tree with visible product counts (menus, homepage, directory chips). */
export async function publicCategoryTree(db: Database): Promise<PublicCategory[]> {
  const rows = await db
    .select({
      id: schema.categories.id,
      slug: schema.categories.slug,
      name: schema.categories.name,
      description: schema.categories.description,
      parentId: schema.categories.parentId,
      heroFileId: schema.categories.heroFileId,
      direct: sql<number>`(select count(*)::int from products where category_id = "categories"."id" and ${sql.raw(`status in ('PUBLISHED','TEMPORARILY_UNAVAILABLE')`)} and listed)`,
    })
    .from(schema.categories)
    .where(eq(schema.categories.status, "PUBLISHED"))
    .orderBy(asc(schema.categories.position), asc(schema.categories.name));
  const tops = rows.filter((row) => !row.parentId);
  return tops.map((top) => {
    const children = rows.filter((row) => row.parentId === top.id);
    return {
      slug: top.slug,
      name: top.name,
      description: top.description,
      productCount: top.direct + children.reduce((sum, child) => sum + child.direct, 0),
      image: image(top.heroFileId, top.name, null, null),
      children: children.map((child) => ({ slug: child.slug, name: child.name, productCount: child.direct, image: image(child.heroFileId, child.name, null, null) })),
    };
  });
}

/** Header, mega-menu and homepage data in one call (cached under the "catalogue" tag). */
export async function storefrontNavigation(db: Database) {
  const categories = await publicCategoryTree(db);
  const popular = await cardsByIds(db, await listOrder(db, "menu.popular"));
  // Real order counts first, then the staff list (owner, 2026-10-05).
  const mostOrdered = await cardsByIds(db, await mostOrderedIds(db, await listOrder(db, "home.most-ordered")));
  return {
    categories,
    popular: popular.map((card) => ({ slug: card.slug, name: card.name })),
    mostOrdered,
    totalProducts: categories.reduce((sum, category) => sum + category.productCount, 0),
  };
}

/** Sections every new hub starts with; staff edit them in Pen 105's editor. */
export function defaultHub(category: { name: string; description: string | null }): Hub {
  const sections: HubSection[] = [
    { type: "summary", visible: true, heading: category.name, body: category.description ?? "", primaryLabel: "Browse products", secondaryLabel: "Start a project", secondaryHref: "/contact?topic=project" },
    { type: "subcategories", visible: true, heading: "What are you looking for?" },
    { type: "featured", visible: false, heading: "Popular choices", productSlugs: [] },
    { type: "process", visible: false, heading: "Choose how it's made", steps: [] },
    { type: "guidance", visible: false, heading: "How to choose", intro: "", columns: [], rows: [], note: "" },
    { type: "grid", visible: true, heading: `All ${category.name.toLowerCase()}` },
    { type: "faq", visible: false, heading: "Questions", items: [] },
    { type: "related", visible: false, heading: "Projects and guides", links: [] },
  ];
  return { layout: "CATALOGUE", sections };
}

/** A category hub page (PUB-FR-009): the published hub, or the default one if staff haven't published a hub yet. */
export async function publicHub(db: Database, slug: string) {
  const [row] = await db
    .select()
    .from(schema.categories)
    .where(and(eq(schema.categories.slug, slug), eq(schema.categories.status, "PUBLISHED")));
  if (!row) throw new AppError("NOT_FOUND");
  let parent: { slug: string; name: string } | null = null;
  if (row.parentId) {
    const [parentRow] = await db
      .select({ slug: schema.categories.slug, name: schema.categories.name, status: schema.categories.status })
      .from(schema.categories)
      .where(eq(schema.categories.id, row.parentId));
    if (parentRow?.status !== "PUBLISHED") throw new AppError("NOT_FOUND");
    parent = { slug: parentRow.slug, name: parentRow.name };
  }
  const tree = await publicCategoryTree(db);
  const category =
    tree.find((top) => top.slug === slug) ??
    (() => {
      const top = tree.find((candidate) => candidate.children.some((child) => child.slug === slug))!;
      const child = top.children.find((candidate) => candidate.slug === slug)!;
      return { slug: child.slug, name: child.name, description: row.description, productCount: child.productCount, image: child.image, children: [] };
    })();
  const hub = row.hub ? hubSchema.parse(row.hub) : defaultHub(row);
  const featuredSection = hub.sections.find((section) => section.type === "featured");
  const featured = featuredSection?.visible && featuredSection.type === "featured" ? await cardsBySlugs(db, featuredSection.productSlugs) : [];
  const products = (await db
    .select(cardColumns)
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(and(visibleProduct(), categoryCondition([slug])))
    .orderBy(asc(schema.products.name))
    .limit(48)) as CardRow[];
  return {
    category,
    parent,
    layout: hub.layout,
    sections: hub.sections.filter((section) => section.visible),
    featured,
    products: products.map(toCard),
    seoTitle: row.seoTitle ?? `${row.name} | HolyPearls`,
    seoDescription: row.seoDescription,
  };
}

/** A content image is public only while the live copy of a PUBLISHED page uses it (T02-06). Drafts never count. */
export async function isContentMediaPublic(db: Database, fileId: string): Promise<boolean> {
  const [onPage] = await db
    .select({ id: schema.contentPages.id })
    .from(schema.contentPagePublishedMedia)
    .innerJoin(schema.contentPages, eq(schema.contentPages.id, schema.contentPagePublishedMedia.pageId))
    .where(and(eq(schema.contentPagePublishedMedia.fileId, fileId), eq(schema.contentPages.status, "PUBLISHED")))
    .limit(1);
  return Boolean(onPage);
}

/**
 * Public images: a READY media file that belongs to a visible product, a
 * published category or a published content page's live copy. Anything else
 * is 404, so drafts' images stay private. `content` says the file is public
 * because of a content page, which can be unpublished at any time.
 */
export async function publicMediaFile(db: Database, fileId: string) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.id, fileId), inArray(schema.files.purpose, ["PRODUCT_MEDIA", "CONTENT_MEDIA"]), eq(schema.files.status, "READY")));
  if (!file) throw new AppError("NOT_FOUND");
  if (file.purpose === "CONTENT_MEDIA") {
    if (await isContentMediaPublic(db, fileId)) return { file, content: true };
    throw new AppError("NOT_FOUND");
  }
  const [onProduct] = await db
    .select({ id: schema.products.id })
    .from(schema.productMedia)
    .innerJoin(schema.products, eq(schema.products.id, schema.productMedia.productId))
    .where(and(eq(schema.productMedia.fileId, fileId), inArray(schema.products.status, [...VISIBLE])))
    .limit(1);
  const [onCategory] = onProduct
    ? [onProduct]
    : await db
        .select({ id: schema.categories.id })
        .from(schema.categories)
        .where(and(eq(schema.categories.heroFileId, fileId), eq(schema.categories.status, "PUBLISHED")))
        .limit(1);
  if (onCategory) return { file, content: false };
  // A photo of an option value on a visible product (owner, 2026-10-05).
  const [onOption] = await db
    .select({ id: schema.productOptionValues.id })
    .from(schema.productOptionValues)
    .innerJoin(schema.productOptions, eq(schema.productOptions.id, schema.productOptionValues.optionId))
    .innerJoin(schema.products, eq(schema.products.id, schema.productOptions.productId))
    .where(and(eq(schema.productOptionValues.imageFileId, fileId), inArray(schema.products.status, [...VISIBLE])))
    .limit(1);
  // Removing a value's photo takes it off the site within five minutes.
  if (onOption) return { file, content: true };
  // A product photo reused on a content page is public while that page is.
  if (await isContentMediaPublic(db, fileId)) return { file, content: true };
  throw new AppError("NOT_FOUND");
}

/** One visible product for its public page (images, specifications, FAQ, related). */
export async function publicProduct(db: Database, slug: string) {
  const [row] = (await db
    .select({ ...cardColumns, id: schema.products.id, description: schema.products.description, specifications: schema.products.specifications, faqs: schema.products.faqs, seoTitle: schema.products.seoTitle, seoDescription: schema.products.seoDescription, parentId: schema.categories.parentId })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(and(visibleProduct(), eq(schema.products.slug, slug)))) as (CardRow & {
    id: string;
    description: string | null;
    specifications: unknown;
    faqs: unknown;
    seoTitle: string | null;
    seoDescription: string | null;
    parentId: string | null;
  })[];
  if (!row) throw new AppError("NOT_FOUND");
  const media = await db
    .select({ fileId: schema.productMedia.fileId, alt: schema.productMedia.alt, metadata: schema.files.metadata })
    .from(schema.productMedia)
    .innerJoin(schema.files, eq(schema.files.id, schema.productMedia.fileId))
    .where(and(eq(schema.productMedia.productId, row.id), eq(schema.files.status, "READY")))
    .orderBy(asc(schema.productMedia.position));
  const [parent] = row.parentId
    ? await db.select({ slug: schema.categories.slug, name: schema.categories.name }).from(schema.categories).where(eq(schema.categories.id, row.parentId))
    : [];
  const relatedIds = await db
    .select({ id: schema.productRelations.relatedProductId })
    .from(schema.productRelations)
    .where(eq(schema.productRelations.productId, row.id))
    .orderBy(asc(schema.productRelations.position));
  return {
    ...toCard(row),
    description: row.description,
    images: media.map((item) => {
      const meta = (item.metadata ?? {}) as { width?: number; height?: number };
      return image(item.fileId, item.alt, meta.width ?? null, meta.height ?? null)!;
    }),
    specifications: row.specifications as { label: string; value: string }[],
    faqs: row.faqs as { question: string; answer: string }[],
    categoryParent: parent ?? null,
    related: await cardsByIds(db, relatedIds.map((item) => item.id)),
    configurator: row.buyingMode === "CONSULTATIVE_PROJECT" ? null : await configuratorFor(db, row.id, new Date()),
    seoTitle: row.seoTitle ?? `${row.name} | HolyPearls`,
    seoDescription: row.seoDescription ?? row.summary,
  };
}
