import type { AdminCategory } from "@holypearls/contracts";
import { and, asc, type Database, eq, ne, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";

type CategoryStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** DRAFT → PUBLISHED → ARCHIVED; a draft can also be archived. Archived is final. */
const ALLOWED: Record<CategoryStatus, readonly CategoryStatus[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};
export const canChangeCategoryStatus = (from: CategoryStatus, to: CategoryStatus) => ALLOWED[from].includes(to);

// Written out in full: Drizzle leaves the table name off columns in single-table queries.
const parent = sql<string | null>`(select p.name from categories p where p.id = "categories"."parent_id")`;
/** Products in the category or its direct subcategories that aren't archived. */
const productCount = sql<number>`(
  select count(*)::int from products pr
  where pr.status <> 'ARCHIVED'
    and (pr.category_id = "categories"."id"
      or pr.category_id in (select c.id from categories c where c.parent_id = "categories"."id"))
)`;

const toAdmin = (row: typeof schema.categories.$inferSelect, parentName: string | null, count: number): AdminCategory => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  parentId: row.parentId,
  parentName,
  position: row.position,
  status: row.status,
  seoTitle: row.seoTitle,
  seoDescription: row.seoDescription,
  heroFileId: row.heroFileId,
  productCount: count,
  version: row.version,
  updatedAt: row.updatedAt.toISOString(),
});

/** Every category, top level first, then by position (a catalogue has tens, not thousands). */
export async function listCategories(db: Database) {
  const rows = await db
    .select({ category: schema.categories, parentName: parent, productCount })
    .from(schema.categories)
    .orderBy(sql`${schema.categories.parentId} nulls first`, asc(schema.categories.position), asc(schema.categories.name));
  return { entries: rows.map((row) => toAdmin(row.category, row.parentName, row.productCount)) };
}

export async function getCategory(db: Database, id: string) {
  const [row] = await db
    .select({ category: schema.categories, parentName: parent, productCount })
    .from(schema.categories)
    .where(eq(schema.categories.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return toAdmin(row.category, row.parentName, row.productCount);
}

const taken = (error: unknown) => (error as { cause?: { code?: string } }).cause?.code === "23505";

async function checkParent(db: Database, id: string | null, parentId: string | null | undefined) {
  if (!parentId) return;
  if (parentId === id) throw new AppError("VALIDATION_FAILED", { fieldErrors: { parentId: "A category can't be its own parent" } });
  const [row] = await db.select({ parentId: schema.categories.parentId }).from(schema.categories).where(eq(schema.categories.id, parentId));
  if (!row) throw new AppError("VALIDATION_FAILED", { fieldErrors: { parentId: "Choose an existing category" } });
  // Two levels only: top-level categories and their subcategories (Stage 1.2).
  if (row.parentId) throw new AppError("VALIDATION_FAILED", { fieldErrors: { parentId: "Choose a top-level category" } });
}

async function checkHero(db: Database, heroFileId: string | null | undefined) {
  if (!heroFileId) return;
  const [file] = await db.select().from(schema.files).where(eq(schema.files.id, heroFileId));
  if (!file || file.purpose !== "PRODUCT_MEDIA" || file.status === "REJECTED") {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { heroFileId: "Upload a product-media image" } });
  }
}

export async function createCategory(db: Database, actor: ActorContext, input: Record<string, unknown> & { name: string; slug: string; parentId?: string | null; heroFileId?: string | null }) {
  await checkParent(db, null, input.parentId);
  await checkHero(db, input.heroFileId);
  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.categories).values(input as never).returning({ id: schema.categories.id });
      await recordAudit(tx, actor, {
        action: "catalogue.category_created",
        summary: `Category created: ${input.name}`,
        recordType: "CATEGORY",
        recordId: row!.id,
        recordLabel: input.name,
        after: { status: "DRAFT" },
        permission: "CATALOGUE_MANAGE",
      });
      return row!.id;
    });
    return getCategory(db, id);
  } catch (error) {
    if (taken(error)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { slug: "Another category already uses this slug" } });
    throw error;
  }
}

export async function updateCategory(db: Database, actor: ActorContext, id: string, input: Record<string, unknown> & { version: number }) {
  const before = await getCategory(db, id);
  const { version, ...changes } = input;
  if ("parentId" in changes) await checkParent(db, id, changes.parentId as string | null);
  if ("heroFileId" in changes) await checkHero(db, changes.heroFileId as string | null);
  try {
    const saved = await db.transaction(async (tx) => {
      const rows = await tx
        .update(schema.categories)
        .set({ ...changes, version: sql`${schema.categories.version} + 1` } as never)
        .where(and(eq(schema.categories.id, id), eq(schema.categories.version, version)))
        .returning({ id: schema.categories.id });
      if (!rows.length) return false;
      await recordAudit(tx, actor, {
        action: "catalogue.category_updated",
        summary: `Category edited: ${before.name}`,
        recordType: "CATEGORY",
        recordId: id,
        recordLabel: before.name,
        before: Object.fromEntries(Object.keys(changes).map((key) => [key, before[key as keyof AdminCategory] ?? null])),
        after: changes,
        permission: "CATALOGUE_MANAGE",
      });
      return true;
    });
    if (!saved) throw new AppError("VERSION_CONFLICT", { context: { latest: await getCategory(db, id) } });
    return getCategory(db, id);
  } catch (error) {
    if (taken(error)) throw new AppError("VALIDATION_FAILED", { fieldErrors: { slug: "Another category already uses this slug" } });
    throw error;
  }
}

/**
 * Publish or archive (Pen frame 104). A category with products that aren't
 * archived can't be archived: move or archive them first, so no product loses
 * its place on the site.
 */
export async function changeCategoryStatus(
  db: Database,
  actor: ActorContext,
  id: string,
  to: "PUBLISHED" | "ARCHIVED",
  version: number,
  onPublicChange: (slug: string) => Promise<void>,
) {
  const category = await getCategory(db, id);
  if (category.version !== version) throw new AppError("VERSION_CONFLICT", { context: { latest: category } });
  if (!canChangeCategoryStatus(category.status, to)) {
    throw new AppError("CONFLICT", { message: `A ${category.status} category can't become ${to}.`, context: { reason: "STATUS_CHANGE_NOT_ALLOWED" } });
  }
  if (to === "ARCHIVED" && category.productCount > 0) {
    throw new AppError("RULE_FAILED", {
      message: `${category.name} still has ${category.productCount} ${category.productCount === 1 ? "product" : "products"}. Move or archive them first.`,
      context: { reason: "HAS_PRODUCTS", productCount: category.productCount },
    });
  }
  if (to === "PUBLISHED" && category.parentId) {
    const [parentRow] = await db.select({ status: schema.categories.status }).from(schema.categories).where(eq(schema.categories.id, category.parentId));
    if (parentRow?.status !== "PUBLISHED") {
      throw new AppError("RULE_FAILED", { message: `Publish ${category.parentName} first.`, context: { reason: "PARENT_NOT_PUBLISHED" } });
    }
  }
  if (to === "ARCHIVED") {
    const children = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(and(eq(schema.categories.parentId, id), ne(schema.categories.status, "ARCHIVED")));
    if (children.length) {
      throw new AppError("RULE_FAILED", { message: "Archive its subcategories first.", context: { reason: "HAS_SUBCATEGORIES" } });
    }
  }
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.categories)
      .set({ status: to, version: sql`${schema.categories.version} + 1` })
      .where(and(eq(schema.categories.id, id), eq(schema.categories.version, version)))
      .returning({ id: schema.categories.id });
    if (!rows.length) throw new AppError("VERSION_CONFLICT");
    await recordAudit(tx, actor, {
      action: "catalogue.category_status_changed",
      summary: `${category.name}: ${category.status} → ${to}`,
      recordType: "CATEGORY",
      recordId: id,
      recordLabel: category.name,
      before: { status: category.status },
      after: { status: to },
      permission: "CATALOGUE_MANAGE",
    });
  });
  await onPublicChange(category.slug);
  return getCategory(db, id);
}

