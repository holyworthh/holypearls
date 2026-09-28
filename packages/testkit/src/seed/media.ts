import { readFile } from "node:fs/promises";
import { eq, schema, type Transaction } from "@holypearls/db";
import { SEED_PRODUCTS } from "./catalogue.js";

/** Where seeded images are written: the public-media bucket (TECH-04 §2). */
export interface SeedMediaStore {
  write(key: string, body: Buffer, contentType: string): Promise<void>;
}

/** Generated sample photos, 2000 × 1500 with 400 px thumbnails (TEST DATA, see assets/products). */
const ASSETS = new URL("../../assets/products/", import.meta.url);

const ALT: Record<string, string> = {
  "polo-shirt": "Navy polo shirt with a small embroidered logo on the chest",
  "heat-transfer-printing": "Black t-shirt with a full-colour heat transfer print",
  "flat-embroidery": "Close-up of a flat embroidered logo on a cap",
  "business-cards": "Stack of matte white business cards with a red and black logo",
  "roll-up-banner": "Red and black roll-up banner standing in an office lobby",
  "small-paper-bag": "Small white paper bag with twisted handles and a printed logo",
  "label-sticker": "Sheet of round glossy label stickers",
  "standard-mug": "White ceramic mug with a printed red logo",
  "landscape-canvas": "Landscape canvas print of a sunset hanging on a wall",
  "team-staff-branding": "Matching branded polos, lanyards, cap and mug laid out together",
};

/**
 * Gives each seeded product one image, so product pages and the admin have
 * real pictures (T02-01). Products that already have images are left alone.
 */
export async function seedCatalogueMedia(tx: Transaction, store: SeedMediaStore): Promise<void> {
  for (const seeded of SEED_PRODUCTS) {
    const [product] = await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, seeded.slug));
    if (!product) continue;
    const [existing] = await tx.select({ id: schema.productMedia.id }).from(schema.productMedia).where(eq(schema.productMedia.productId, product.id));
    if (existing) continue;
    const source = await readFile(new URL(`${seeded.slug}.webp`, ASSETS));
    const thumb = await readFile(new URL(`${seeded.slug}.thumb.webp`, ASSETS));
    const key = `files/source/seed-${seeded.slug}`;
    const [file] = await tx
      .insert(schema.files)
      .values({
        purpose: "PRODUCT_MEDIA",
        status: "READY",
        bucket: "public",
        ownerType: "PRODUCT",
        ownerId: product.id,
        attachedAt: new Date(),
        originalName: `${seeded.slug}.webp`,
        safeName: `${seeded.slug}.webp`,
        declaredType: "image/webp",
        detectedType: "image/webp",
        declaredSize: source.length,
        sizeBytes: source.length,
        storageKey: key,
        metadata: { width: 2000, height: 1500 },
      })
      .returning({ id: schema.files.id });
    const previewKey = `files/preview/${file!.id}/preview-1.webp`;
    const thumbKey = `files/preview/${file!.id}/thumbnail-1.webp`;
    await store.write(key, source, "image/webp");
    await store.write(previewKey, source, "image/webp");
    await store.write(thumbKey, thumb, "image/webp");
    await tx.insert(schema.fileRenditions).values([
      { fileId: file!.id, kind: "PREVIEW", page: 1, storageKey: previewKey, contentType: "image/webp", width: 2000, height: 1500 },
      { fileId: file!.id, kind: "THUMBNAIL", page: 1, storageKey: thumbKey, contentType: "image/webp", width: 400, height: 300 },
    ]);
    await tx.insert(schema.productMedia).values({ productId: product.id, fileId: file!.id, alt: ALT[seeded.slug] ?? seeded.name, position: 0 });
  }
}
