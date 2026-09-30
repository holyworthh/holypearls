import { type AdminHub, type Hub, hubSchema, MERCHANDISING_LISTS, type MerchandisingListKey } from "@holypearls/contracts";
import { and, type Database, eq, inArray, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import { defaultHub } from "./storefront.js";

/* Staff editing of category hubs (Pen 105) and admin-managed product lists (PUB-FR-004). */

async function categoryRow(db: Database, id: string) {
  const [row] = await db.select().from(schema.categories).where(eq(schema.categories.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

const toAdminHub = (row: typeof schema.categories.$inferSelect): AdminHub => {
  const published = row.hub ? hubSchema.parse(row.hub) : null;
  const draft = row.hubDraft ? hubSchema.parse(row.hubDraft) : (published ?? defaultHub(row));
  return {
    categoryId: row.id,
    categoryName: row.name,
    slug: row.slug,
    draft,
    published,
    publishedAt: row.hubPublishedAt?.toISOString() ?? null,
    unpublishedChanges: JSON.stringify(draft) !== JSON.stringify(published),
    version: row.version,
  };
};

export const getAdminHub = async (db: Database, categoryId: string) => toAdminHub(await categoryRow(db, categoryId));

/** Saves the draft; the public page doesn't change until it's published. */
export async function saveHubDraft(db: Database, actor: ActorContext, categoryId: string, hub: Hub, version: number) {
  const row = await categoryRow(db, categoryId);
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.categories)
      .set({ hubDraft: hub, version: sql`${schema.categories.version} + 1` })
      .where(and(eq(schema.categories.id, categoryId), eq(schema.categories.version, version)))
      .returning();
    if (!rows.length) return null;
    await recordAudit(tx, actor, {
      action: "catalogue.hub_draft_saved",
      summary: `Hub draft saved: ${row.name}`,
      recordType: "CATEGORY",
      recordId: categoryId,
      recordLabel: row.name,
      permission: "CATALOGUE_MANAGE",
    });
    return rows[0]!;
  });
  if (!updated) throw new AppError("VERSION_CONFLICT", { context: { latest: toAdminHub(await categoryRow(db, categoryId)) } });
  return toAdminHub(updated);
}

/** Makes the draft live and refreshes the hub page. */
export async function publishHub(db: Database, actor: ActorContext, categoryId: string, version: number, onPublicChange: (slug: string) => Promise<void>) {
  const row = await categoryRow(db, categoryId);
  const current = toAdminHub(row);
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.categories)
      .set({ hub: current.draft, hubDraft: null, hubPublishedAt: new Date(), version: sql`${schema.categories.version} + 1` })
      .where(and(eq(schema.categories.id, categoryId), eq(schema.categories.version, version)))
      .returning();
    if (!rows.length) return null;
    await recordAudit(tx, actor, {
      action: "catalogue.hub_published",
      summary: `Hub published: ${row.name}`,
      recordType: "CATEGORY",
      recordId: categoryId,
      recordLabel: row.name,
      before: { sections: current.published?.sections.filter((s) => s.visible).map((s) => s.type) ?? null },
      after: { sections: current.draft.sections.filter((s) => s.visible).map((s) => s.type) },
      permission: "CATALOGUE_MANAGE",
    });
    return rows[0]!;
  });
  if (!updated) throw new AppError("VERSION_CONFLICT", { context: { latest: toAdminHub(await categoryRow(db, categoryId)) } });
  await onPublicChange(row.slug);
  return toAdminHub(updated);
}

export async function getMerchandisingLists(db: Database) {
  const rows = await db.select().from(schema.merchandisingLists);
  const lists = [];
  for (const [key, meta] of Object.entries(MERCHANDISING_LISTS) as [MerchandisingListKey, (typeof MERCHANDISING_LISTS)[MerchandisingListKey]][]) {
    const row = rows.find((candidate) => candidate.key === key);
    const ids = row?.productIds ?? [];
    const products = ids.length
      ? await db.select({ id: schema.products.id, name: schema.products.name, status: schema.products.status }).from(schema.products).where(inArray(schema.products.id, ids))
      : [];
    lists.push({
      key,
      label: meta.label,
      max: meta.max,
      products: ids.flatMap((id) => products.filter((product) => product.id === id)),
      version: row?.version ?? 0,
    });
  }
  return { lists };
}

/** Replaces a list. Version 0 means "the list doesn't exist yet". */
export async function saveMerchandisingList(db: Database, actor: ActorContext, key: MerchandisingListKey, productIds: string[], version: number) {
  const ids = [...new Set(productIds)];
  if (ids.length) {
    const found = await db.select({ id: schema.products.id }).from(schema.products).where(inArray(schema.products.id, ids));
    if (found.length !== ids.length) throw new AppError("VALIDATION_FAILED", { fieldErrors: { productIds: "One of these products doesn't exist" } });
  }
  const saved = await db.transaction(async (tx) => {
    const rows =
      version === 0
        ? await tx.insert(schema.merchandisingLists).values({ key, productIds: ids }).onConflictDoNothing().returning()
        : await tx
            .update(schema.merchandisingLists)
            .set({ productIds: ids, version: sql`${schema.merchandisingLists.version} + 1` })
            .where(and(eq(schema.merchandisingLists.key, key), eq(schema.merchandisingLists.version, version)))
            .returning();
    if (!rows.length) return false;
    await recordAudit(tx, actor, {
      action: "catalogue.list_changed",
      summary: `${MERCHANDISING_LISTS[key].label} changed`,
      recordType: "MERCHANDISING_LIST",
      recordId: key,
      recordLabel: MERCHANDISING_LISTS[key].label,
      after: { productIds: ids },
      permission: "CATALOGUE_MANAGE",
    });
    return true;
  });
  if (!saved) throw new AppError("VERSION_CONFLICT");
  return getMerchandisingLists(db);
}
