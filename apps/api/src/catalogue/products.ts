import type { AdminProduct, AdminProductSummary } from "@holypearls/contracts";
import { and, asc, type Database, eq, ilike, inArray, or, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import { afterCursor, newestFirst, pageOf } from "../platform/cursor.js";

type Status = "DRAFT" | "PUBLISHED" | "TEMPORARILY_UNAVAILABLE" | "ARCHIVED";

/**
 * Product status changes (TECH-01 §4): DRAFT → PUBLISHED ⇄
 * TEMPORARILY_UNAVAILABLE; any → ARCHIVED. There's no way back to DRAFT: to
 * take a product off the site, archive it (owner decision, 2026-09-28).
 */
const ALLOWED: Record<Status, readonly Status[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["TEMPORARILY_UNAVAILABLE", "ARCHIVED"],
  TEMPORARILY_UNAVAILABLE: ["PUBLISHED", "ARCHIVED"],
  ARCHIVED: [],
};

export const canChangeStatus = (from: Status, to: Status) => ALLOWED[from].includes(to);

async function load(db: Database, id: string): Promise<AdminProduct> {
  const [row] = await db
    .select({
      product: schema.products,
      categoryName: schema.categories.name,
      mediaCount: sql<number>`(select count(*)::int from product_media m where m.product_id = ${schema.products.id})`,
    })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(eq(schema.products.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  const media = await db
    .select({
      id: schema.productMedia.id,
      fileId: schema.productMedia.fileId,
      alt: schema.productMedia.alt,
      position: schema.productMedia.position,
      fileStatus: schema.files.status,
    })
    .from(schema.productMedia)
    .innerJoin(schema.files, eq(schema.files.id, schema.productMedia.fileId))
    .where(eq(schema.productMedia.productId, id))
    .orderBy(asc(schema.productMedia.position), asc(schema.productMedia.createdAt));
  const related = await db
    .select({ id: schema.products.id, name: schema.products.name, sku: schema.products.sku, status: schema.products.status })
    .from(schema.productRelations)
    .innerJoin(schema.products, eq(schema.products.id, schema.productRelations.relatedProductId))
    .where(eq(schema.productRelations.productId, id))
    .orderBy(asc(schema.productRelations.position));
  return { ...toAdmin(row.product, row.categoryName, row.mediaCount), media, related };
}

function toAdmin(product: typeof schema.products.$inferSelect, categoryName: string, mediaCount: number): AdminProductSummary {
  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    family: product.family,
    buyingMode: product.buyingMode,
    categoryId: product.categoryId,
    categoryName,
    status: product.status,
    listed: product.listed,
    summary: product.summary,
    description: product.description,
    searchPhrases: product.searchPhrases,
    routes: product.routes as AdminProduct["routes"],
    decorations: product.decorations as AdminProduct["decorations"],
    specifications: product.specifications as AdminProduct["specifications"],
    faqs: product.faqs as AdminProduct["faqs"],
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    shippingWeightGrams: product.shippingWeightGrams,
    packageCm: product.packageCm ?? null,
    unitsPerPackage: product.unitsPerPackage,
    mediaCount,
    version: product.version,
    updatedAt: product.updatedAt.toISOString(),
  };
}

export const getProduct = load;

export async function listProducts(
  db: Database,
  query: { q?: string; status?: Status; family?: string; cursor?: string; limit: number },
) {
  const conditions = [];
  if (query.q) {
    const term = `%${query.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conditions.push(or(ilike(schema.products.name, term), ilike(schema.products.sku, term), ilike(schema.products.slug, term)));
  }
  if (query.status) conditions.push(eq(schema.products.status, query.status));
  if (query.family) conditions.push(eq(schema.products.family, query.family as never));
  const after = afterCursor(schema.products.updatedAt, schema.products.id, query.cursor);
  if (after) conditions.push(after);
  const rows = await db
    .select({
      product: schema.products,
      categoryName: schema.categories.name,
      mediaCount: sql<number>`(select count(*)::int from product_media m where m.product_id = ${schema.products.id})`,
    })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...newestFirst(schema.products.updatedAt, schema.products.id))
    .limit(query.limit + 1);
  const { page, nextCursor } = pageOf(rows, query.limit, (row) => ({ at: row.product.updatedAt, id: row.product.id }));
  return { entries: page.map((row) => toAdmin(row.product, row.categoryName, row.mediaCount)), nextCursor };
}

const slugTaken = (error: unknown) => (error as { cause?: { code?: string } }).cause?.code === "23505";

export async function createProduct(db: Database, actor: ActorContext, input: Record<string, unknown> & { name: string; sku: string }) {
  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.products).values(input as never).returning({ id: schema.products.id });
      await recordAudit(tx, actor, {
        action: "catalogue.product_created",
        summary: `Product created: ${input.name}`,
        recordType: "PRODUCT",
        recordId: row!.id,
        recordLabel: input.name,
        after: { status: "DRAFT" },
        permission: "CATALOGUE_MANAGE",
      });
      return row!.id;
    });
    return load(db, id);
  } catch (error) {
    if (slugTaken(error)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { slug: "Another product already uses this slug or SKU" } });
    throw error;
  }
}

/** Saves edits only if nobody else saved first (TECH-02 §5). */
export async function updateProduct(db: Database, actor: ActorContext, id: string, input: Record<string, unknown> & { version: number }) {
  const before = await load(db, id);
  const { version, ...changes } = input;
  try {
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(schema.products)
        .set({ ...changes, version: sql`${schema.products.version} + 1` } as never)
        .where(and(eq(schema.products.id, id), eq(schema.products.version, version)))
        .returning({ id: schema.products.id });
      if (rows.length === 0) return false;
      await recordAudit(tx, actor, {
        action: "catalogue.product_updated",
        summary: `Product edited: ${before.name}`,
        recordType: "PRODUCT",
        recordId: id,
        recordLabel: before.name,
        before: Object.fromEntries(Object.keys(changes).map((key) => [key, before[key as keyof AdminProduct] ?? null])),
        after: changes,
        permission: "CATALOGUE_MANAGE",
      });
      return true;
    });
    if (!updated) throw new AppError("VERSION_CONFLICT", { context: { latest: await load(db, id) } });
    return load(db, id);
  } catch (error) {
    if (slugTaken(error)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { slug: "Another product already uses this slug" } });
    throw error;
  }
}

/** Publishing needs an image and an SEO title (Pen frame 98, validation state). */
export function publishProblems(product: AdminProductSummary): Record<string, string> {
  const problems: Record<string, string> = {};
  if (product.mediaCount === 0) problems.media = "Add at least one image";
  if (!product.seoTitle) problems.seoTitle = "Add an SEO title";
  if (!product.summary) problems.summary = "Add a short description";
  return problems;
}

export async function changeProductStatus(
  db: Database,
  actor: ActorContext,
  id: string,
  to: Status,
  version: number,
  onPublicChange: (slug: string) => Promise<void>,
) {
  const product = await load(db, id);
  return applyStatus(db, actor, product, to, version, onPublicChange);
}

async function applyStatus(
  db: Database,
  actor: ActorContext,
  product: AdminProductSummary,
  to: Status,
  version: number,
  onPublicChange: (slug: string) => Promise<void>,
) {
  const id = product.id;
  if (product.version !== version) throw new AppError("VERSION_CONFLICT", { context: { latest: product } });
  if (!canChangeStatus(product.status, to)) {
    throw new AppError("CONFLICT", { message: `A ${product.status} product can't become ${to}.`, context: { reason: "STATUS_CHANGE_NOT_ALLOWED" } });
  }
  if (to === "PUBLISHED") {
    const problems = publishProblems(product);
    if (Object.keys(problems).length) throw new AppError("RULE_FAILED", { message: "Fix these before publishing.", fieldErrors: problems });
  }
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.products)
      .set({ status: to, version: sql`${schema.products.version} + 1`, ...(to === "PUBLISHED" ? { publishedAt: new Date() } : {}) })
      .where(and(eq(schema.products.id, id), eq(schema.products.version, version)))
      .returning({ id: schema.products.id });
    if (rows.length === 0) throw new AppError("VERSION_CONFLICT");
    await recordAudit(tx, actor, {
      action: "catalogue.product_status_changed",
      summary: `${product.name}: ${product.status} → ${to}`,
      recordType: "PRODUCT",
      recordId: id,
      recordLabel: product.name,
      before: { status: product.status },
      after: { status: to },
      permission: "CATALOGUE_MANAGE",
    });
  });
  // Public pages show the change within a minute (TECH-02 §6 cache tags).
  await onPublicChange(product.slug);
  return load(db, id);
}

const BULK_REASONS: Record<string, string> = {
  CONFLICT: "This status change isn't allowed",
  RULE_FAILED: "Not ready to publish",
};

/**
 * Bulk status change (Pen frame 96). Each product is checked and audited on
 * its own; the ones that can't change are listed with a reason.
 */
export async function bulkChangeStatus(
  db: Database,
  actor: ActorContext,
  ids: string[],
  to: Status,
  onPublicChange: (slug: string) => Promise<void>,
) {
  const rows = await db
    .select({ product: schema.products, categoryName: schema.categories.name, mediaCount: sql<number>`(select count(*)::int from product_media m where m.product_id = ${schema.products.id})` })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .where(inArray(schema.products.id, ids));
  const changed: string[] = [];
  const skipped: { id: string; name: string; reason: string }[] = [];
  for (const id of ids) {
    const row = rows.find((candidate) => candidate.product.id === id);
    if (!row) {
      skipped.push({ id, name: "Unknown product", reason: "Not found" });
      continue;
    }
    const product = toAdmin(row.product, row.categoryName, row.mediaCount);
    if (product.status === to) {
      skipped.push({ id, name: product.name, reason: `Already ${to}` });
      continue;
    }
    try {
      await applyStatus(db, actor, product, to, product.version, onPublicChange);
      changed.push(id);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      skipped.push({ id, name: product.name, reason: BULK_REASONS[error.code] ?? "Someone else changed it; reload and try again" });
    }
  }
  return { changed, skipped };
}

/** Related products shown on the product page, in order (up to 12). */
export async function setRelatedProducts(db: Database, actor: ActorContext, id: string, productIds: string[]) {
  const product = await load(db, id);
  const unique = [...new Set(productIds)].filter((other) => other !== id);
  if (unique.length) {
    const found = await db.select({ id: schema.products.id }).from(schema.products).where(inArray(schema.products.id, unique));
    if (found.length !== unique.length) throw new AppError("VALIDATION_FAILED", { fieldErrors: { productIds: "One of these products doesn't exist" } });
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.productRelations).where(eq(schema.productRelations.productId, id));
    if (unique.length) {
      await tx.insert(schema.productRelations).values(unique.map((relatedProductId, position) => ({ productId: id, relatedProductId, position })));
    }
    await recordAudit(tx, actor, {
      action: "catalogue.product_related_changed",
      summary: `Related products changed: ${product.name}`,
      recordType: "PRODUCT",
      recordId: id,
      recordLabel: product.name,
      before: { related: product.related.map((item) => item.sku) },
      after: { related: unique },
      permission: "CATALOGUE_MANAGE",
    });
  });
  return load(db, id);
}

/** Catalogue export (T13-03b): every product, as it is now. */
export async function catalogueForExport(db: Database): Promise<string[][]> {
  const rows = await db
    .select({ product: schema.products, category: schema.categories.name })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .orderBy(asc(schema.products.sku));
  return [
    ["SKU", "Name", "Category", "Family", "Buying mode", "Status", "Listed", "Address"],
    ...rows.map(({ product, category }) => [product.sku, product.name, category, product.family, product.buyingMode, product.status, product.listed ? "Yes" : "No", `/products/${product.slug}`]),
  ];
}
