import { and, type Database, eq, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import { attachFile, findFileForActor } from "../files/files.js";
import type { ActorContext } from "../identity/actor.js";
import { recordAudit } from "../platform/audit.js";
import { getProduct } from "./products.js";

const MAX_IMAGES = 30;

async function audit(db: Parameters<typeof recordAudit>[0], actor: ActorContext, productId: string, name: string, action: string, summary: string, after?: Record<string, unknown>) {
  await recordAudit(db, actor, {
    action,
    summary: `${summary}: ${name}`,
    recordType: "PRODUCT",
    recordId: productId,
    recordLabel: name,
    ...(after && { after }),
    permission: "CATALOGUE_MANAGE",
  });
}

/**
 * Adds an uploaded product image (purpose PRODUCT_MEDIA, Pen frame 104). The
 * file may still be PROCESSING; a REJECTED file can't be added.
 */
export async function addProductMedia(db: Database, actor: ActorContext, productId: string, input: { fileId: string; alt: string }) {
  const product = await getProduct(db, productId);
  const file = await findFileForActor(db, actor, input.fileId);
  if (file.purpose !== "PRODUCT_MEDIA") {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { fileId: "Upload this image as product media" } });
  }
  if (file.status === "REJECTED" || file.status === "PENDING_UPLOAD") {
    throw new AppError("RULE_FAILED", { message: file.reason ?? "This image isn't ready.", context: { reason: file.status } });
  }
  if (product.media.length >= MAX_IMAGES) {
    throw new AppError("RULE_FAILED", { message: `A product can have up to ${MAX_IMAGES} images.`, context: { reason: "TOO_MANY_IMAGES" } });
  }
  if (product.media.some((item) => item.fileId === input.fileId)) return product;
  await db.transaction(async (tx) => {
    await tx.insert(schema.productMedia).values({ productId, fileId: input.fileId, alt: input.alt, position: product.media.length });
    await attachFile(tx, input.fileId, { type: "PRODUCT", id: productId });
    await audit(tx, actor, productId, product.name, "catalogue.product_media_added", "Image added", { fileId: input.fileId, alt: input.alt });
  });
  return getProduct(db, productId);
}

export async function updateProductMedia(db: Database, actor: ActorContext, productId: string, mediaId: string, alt: string) {
  const product = await getProduct(db, productId);
  const rows = await db
    .update(schema.productMedia)
    .set({ alt })
    .where(and(eq(schema.productMedia.id, mediaId), eq(schema.productMedia.productId, productId)))
    .returning({ id: schema.productMedia.id });
  if (!rows.length) throw new AppError("NOT_FOUND");
  await audit(db, actor, productId, product.name, "catalogue.product_media_updated", "Image text changed", { mediaId, alt });
  return getProduct(db, productId);
}

/** Removes the image from the product. The file stays, because past orders and audit entries may point at it. */
export async function removeProductMedia(db: Database, actor: ActorContext, productId: string, mediaId: string) {
  const product = await getProduct(db, productId);
  if (!product.media.some((item) => item.id === mediaId)) throw new AppError("NOT_FOUND");
  if (product.status === "PUBLISHED" && product.media.length === 1) {
    throw new AppError("RULE_FAILED", { message: "A published product needs at least one image.", context: { reason: "LAST_IMAGE" } });
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.productMedia).where(eq(schema.productMedia.id, mediaId));
    await audit(tx, actor, productId, product.name, "catalogue.product_media_removed", "Image removed", { mediaId });
  });
  return getProduct(db, productId);
}

/** Saves the display order; the first image is the main one. */
export async function reorderProductMedia(db: Database, actor: ActorContext, productId: string, mediaIds: string[]) {
  const product = await getProduct(db, productId);
  const current = new Set(product.media.map((item) => item.id));
  if (mediaIds.length !== current.size || !mediaIds.every((id) => current.has(id))) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: { mediaIds: "List every image of this product once" } });
  }
  await db.transaction(async (tx) => {
    for (const [position, id] of mediaIds.entries()) {
      await tx.update(schema.productMedia).set({ position }).where(eq(schema.productMedia.id, id));
    }
    await tx.update(schema.products).set({ updatedAt: sql`now()` }).where(eq(schema.products.id, productId));
    await audit(tx, actor, productId, product.name, "catalogue.product_media_reordered", "Images reordered", { mediaIds });
  });
  return getProduct(db, productId);
}
