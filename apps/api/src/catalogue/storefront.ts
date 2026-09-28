import type {
  Hub,
  HubSection,
  PriceState,
  PublicCategory,
  PublicImage,
  PublicProductCard,
  PublicProductQuery,
} from "@holypearls/contracts";
import { hubSchema } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, isNull, schema, sql, type SQL } from "@holypearls/db";
import { AppError } from "../errors.js";

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

const image = (fileId: string | null, alt: string | null, width: number | null, height: number | null): PublicImage | null =>
  fileId ? { url: mediaUrl(fileId, "preview"), thumbnailUrl: mediaUrl(fileId, "thumbnail"), alt: alt ?? "", width, height } : null;

/** Visible product, in a published category (and a published parent, if it has one). */
function visibleProduct(): SQL {
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

const cardColumns = {
  slug: schema.products.slug,
  name: schema.products.name,
  summary: schema.products.summary,
  family: schema.products.family,
  buyingMode: schema.products.buyingMode,
  status: schema.products.status,
  categorySlug: schema.categories.slug,
  categoryName: schema.categories.name,
  image: mainImage,
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
};

const toCard = (row: CardRow): PublicProductCard => ({
  slug: row.slug,
  name: row.name,
  summary: row.summary,
  family: row.family,
  buyingMode: row.buyingMode,
  category: { slug: row.categorySlug, name: row.categoryName },
  image: row.image ? image(row.image.fileId, row.image.alt, row.image.width, row.image.height) : null,
  available: row.status === "PUBLISHED",
  priceState: row.status === "PUBLISHED" ? (PRICE_STATE[row.buyingMode] ?? "QUOTE_REQUIRED") : "UNAVAILABLE",
});

const escapeLike = (text: string) => `%${text.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;

/** Name, summary and staff-added everyday phrases (PUB-FR-007 phrases are used here too). */
function searchCondition(q: string): SQL {
  const term = escapeLike(q);
  return sql`(${schema.products.name} ilike ${term} or ${schema.products.summary} ilike ${term}
    or exists (select 1 from unnest(${schema.products.searchPhrases}) phrase where phrase ilike ${term}))`;
}

/** A category slug matches the category itself and its subcategories. */
function categoryCondition(slug: string): SQL {
  return sql`${schema.products.categoryId} in (
    select c.id from categories c where c.slug = ${slug}
    union select child.id from categories child join categories p on p.id = child.parent_id where p.slug = ${slug}
  )`;
}

async function listOrder(db: Database, key: string): Promise<string[]> {
  const [row] = await db.select({ ids: schema.merchandisingLists.productIds }).from(schema.merchandisingLists).where(eq(schema.merchandisingLists.key, key));
  return row?.ids ?? [];
}

/** The Product Directory (PUB-FR-008): search, filters, sort and numbered pages, with facet counts. */
export async function listPublicProducts(db: Database, query: PublicProductQuery) {
  const filters: Record<"q" | "category" | "family" | "mode", SQL | undefined> = {
    q: query.q ? searchCondition(query.q) : undefined,
    category: query.category ? categoryCondition(query.category) : undefined,
    family: query.family ? eq(schema.products.family, query.family) : undefined,
    mode: query.mode ? eq(schema.products.buyingMode, query.mode) : undefined,
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
    },
  };
}

async function cardsBySlugs(db: Database, slugs: string[]): Promise<PublicProductCard[]> {
  if (!slugs.length) return [];
  const rows = (await db
    .select(cardColumns)
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(and(visibleProduct(), inArray(schema.products.slug, slugs)))) as CardRow[];
  return slugs.flatMap((slug) => rows.filter((row) => row.slug === slug)).map(toCard);
}

async function cardsByIds(db: Database, ids: string[]): Promise<PublicProductCard[]> {
  if (!ids.length) return [];
  const rows = (await db
    .select({ ...cardColumns, id: schema.products.id })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(and(visibleProduct(), inArray(schema.products.id, ids)))) as (CardRow & { id: string })[];
  return ids.flatMap((id) => rows.filter((row) => row.id === id)).map(toCard);
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
  const mostOrdered = await cardsByIds(db, await listOrder(db, "home.most-ordered"));
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
  return { sections };
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
    .where(and(visibleProduct(), categoryCondition(slug)))
    .orderBy(asc(schema.products.name))
    .limit(48)) as CardRow[];
  return {
    category,
    parent,
    sections: hub.sections.filter((section) => section.visible),
    featured,
    products: products.map(toCard),
    seoTitle: row.seoTitle ?? `${row.name} | HolyPearls`,
    seoDescription: row.seoDescription,
  };
}

/**
 * Public images: a READY product-media file that belongs to a visible product
 * or a published category. Anything else is 404, so drafts' images stay private.
 */
export async function publicMediaFile(db: Database, fileId: string) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.id, fileId), eq(schema.files.purpose, "PRODUCT_MEDIA"), eq(schema.files.status, "READY")));
  if (!file) throw new AppError("NOT_FOUND");
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
  if (!onCategory) throw new AppError("NOT_FOUND");
  return file;
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
    seoTitle: row.seoTitle ?? `${row.name} | HolyPearls`,
    seoDescription: row.seoDescription ?? row.summary,
  };
}
