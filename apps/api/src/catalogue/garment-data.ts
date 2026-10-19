import type { Fabric, GarmentData } from "@holypearls/contracts";
import type { fabricInputSchema, placementBlockSchema } from "@holypearls/contracts";
import { and, asc, type Database, eq, inArray, schema, type Transaction } from "@holypearls/db";
import type { z } from "zod";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";

/*
 * Garment and production data (T13-01b; OPS-FR-020–022; Pen 118). Fabrics
 * with their colours and size range (supplier codes are staff-only and never
 * leave the admin), and the decoration methods that can't go on a placement,
 * which the configurator checks (COM-FR-026). How each product is made and
 * decorated stays on the product (COM-FR-020).
 */

type Db = Database | Transaction;
/** The product options that name a fabric or material. */
const FABRIC_OPTIONS = ["fabric", "material"];

async function fabricViews(db: Db, rows: (typeof schema.fabrics.$inferSelect)[]): Promise<Fabric[]> {
  const keys = rows.map((row) => row.key);
  const uses = keys.length
    ? await db
        .selectDistinct({ key: schema.productOptionValues.key, id: schema.products.id, name: schema.products.name })
        .from(schema.productOptionValues)
        .innerJoin(schema.productOptions, eq(schema.productOptions.id, schema.productOptionValues.optionId))
        .innerJoin(schema.products, eq(schema.products.id, schema.productOptions.productId))
        .where(and(inArray(schema.productOptions.key, FABRIC_OPTIONS), inArray(schema.productOptionValues.key, keys)))
        .orderBy(asc(schema.products.name))
    : [];
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    detail: row.detail,
    colours: row.colours,
    sizeRange: row.sizeRange,
    supplierCode: row.supplierCode,
    status: row.status as Fabric["status"],
    usedBy: uses.filter((use) => use.key === row.key).map(({ id, name }) => ({ id, name })),
    version: row.version,
  }));
}

/** The placements each decoration method can't take, for the configurator. */
export async function placementBlocks(db: Db) {
  const rows = await db.select().from(schema.placementBlocks).orderBy(asc(schema.placementBlocks.method), asc(schema.placementBlocks.position));
  return rows.map(({ method, position, message }) => ({ method: method as "EMBROIDERY" | "PRINT", position, message }));
}

export async function getGarmentData(db: Database): Promise<GarmentData> {
  const [fabrics, blocked, products] = await Promise.all([
    db.select().from(schema.fabrics).orderBy(asc(schema.fabrics.name)),
    placementBlocks(db),
    db.select({ id: schema.products.id, name: schema.products.name, routes: schema.products.routes, decorations: schema.products.decorations }).from(schema.products).orderBy(asc(schema.products.name)),
  ]);
  return {
    fabrics: await fabricViews(db, fabrics),
    blocked: blocked as GarmentData["blocked"],
    // Only products that are made or decorated: garments and promotional items.
    sourcing: products.filter((product) => product.routes.length || product.decorations.length),
  };
}

/** Adds (version 0) or changes a fabric. Keys are unique; an archived fabric keeps its history. */
export async function saveFabric(db: Database, actor: ActorContext, id: string | null, input: z.infer<typeof fabricInputSchema>): Promise<Fabric> {
  const values = { key: input.key, name: input.name, detail: input.detail, colours: [...new Set(input.colours)], sizeRange: input.sizeRange, supplierCode: input.supplierCode || null, status: input.status };
  const row = await db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: schema.fabrics.id }).from(schema.fabrics).where(eq(schema.fabrics.key, input.key));
    if (taken && taken.id !== id) throw new AppError("VALIDATION_FAILED", { fieldErrors: { key: "Another fabric already uses this key" } });
    let saved: typeof schema.fabrics.$inferSelect;
    if (id === null) {
      if (input.version !== 0) throw new AppError("VERSION_CONFLICT");
      [saved] = (await tx.insert(schema.fabrics).values(values).returning()) as [typeof schema.fabrics.$inferSelect];
    } else {
      const [current] = await tx.select().from(schema.fabrics).where(eq(schema.fabrics.id, id)).for("update");
      if (!current) throw new AppError("NOT_FOUND");
      if (current.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { currentVersion: current.version } });
      [saved] = (await tx
        .update(schema.fabrics)
        .set({ ...values, version: current.version + 1, updatedAt: actor.now })
        .where(eq(schema.fabrics.id, id))
        .returning()) as [typeof schema.fabrics.$inferSelect];
    }
    await recordAudit(tx, actor, {
      action: id === null ? "garment.fabric_created" : "garment.fabric_updated",
      summary: `${id === null ? "Fabric added" : "Fabric changed"}: ${values.name}`,
      recordType: "FABRIC",
      recordId: saved.id,
      recordLabel: values.name,
      after: { key: values.key, colours: values.colours.length, sizeRange: values.sizeRange, status: values.status },
    });
    return saved;
  });
  const [view] = await fabricViews(db, [row]);
  return view!;
}

/** Replaces the blocked placements (OPS-FR-022). The configurator checks them on the next open or change. */
export async function savePlacementBlocks(db: Database, actor: ActorContext, blocked: z.infer<typeof placementBlockSchema>[]) {
  const unique = new Map(blocked.map((rule) => [`${rule.method}:${rule.position}`, rule]));
  await db.transaction(async (tx) => {
    const before = await placementBlocks(tx);
    await tx.delete(schema.placementBlocks);
    if (unique.size) await tx.insert(schema.placementBlocks).values([...unique.values()]);
    await recordAudit(tx, actor, {
      action: "garment.placements_updated",
      summary: `Decoration placements changed: ${unique.size} blocked`,
      recordType: "GARMENT_DATA",
      recordId: "placements",
      before: { blocked: before.map((rule) => `${rule.method}:${rule.position}`) },
      after: { blocked: [...unique.keys()] },
    });
  });
  return getGarmentData(db);
}
