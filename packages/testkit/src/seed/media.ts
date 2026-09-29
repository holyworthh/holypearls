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
  apron: "Charcoal bib apron with adjustable straps",
  "baseball-cap": "Navy baseball cap with a small white logo",
  "event-badges": "Three printed name badges on black lanyards",
  "individual-bagging": "Polos being folded and bagged by name in the studio",
};

/** Size of each sample photo and its thumbnail; the default is 2000 × 1500 with a 400 × 300 thumbnail. */
const SIZES: Record<string, [number, number, number, number]> = {
  "polo-shirt-1": [1408, 768, 400, 218],
  "polo-shirt-3": [928, 1152, 400, 497],
  "polo-shirt-4": [928, 1152, 400, 497],
  "polo-shirt-5": [1408, 768, 400, 218],
  "polo-shirt-6": [1408, 768, 400, 218],
  apron: [928, 1152, 400, 497],
  "baseball-cap": [928, 1152, 400, 497],
  "event-badges": [928, 1152, 400, 497],
  "individual-bagging": [1408, 768, 400, 218],
};

/** Gallery photos beyond the first, in order (Pen 19 shows six for the polo). */
const GALLERY: Record<string, [file: string, alt: string][]> = {
  "polo-shirt": [
    ["polo-shirt-1", "Staff member at a front desk wearing a navy polo with an embroidered chest logo"],
    ["polo-shirt", ALT["polo-shirt"]!],
    ["polo-shirt-3", "Navy polo folded flat"],
    ["polo-shirt-4", "Close-up of an embroidered logo on navy fabric"],
    ["polo-shirt-5", "Close-up of navy pique knit"],
    ["polo-shirt-6", "Polos being folded and packed in the production studio"],
  ],
};

/**
 * Gives each seeded product its sample images, so product pages and the admin
 * have real pictures (T02-01). Images already there are kept; missing ones are added.
 */
export async function seedCatalogueMedia(tx: Transaction, store: SeedMediaStore): Promise<void> {
  for (const seeded of SEED_PRODUCTS) {
    const [product] = await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, seeded.slug));
    if (!product) continue;
    const existing = await tx
      .select({ id: schema.productMedia.id, name: schema.files.originalName })
      .from(schema.productMedia)
      .innerJoin(schema.files, eq(schema.files.id, schema.productMedia.fileId))
      .where(eq(schema.productMedia.productId, product.id));
    const gallery = GALLERY[seeded.slug] ?? [[seeded.slug, ALT[seeded.slug] ?? seeded.name]];
    for (const [position, [name, alt]] of gallery.entries()) {
      const found = existing.find((row) => row.name === `${name}.webp`);
      if (found) {
        await tx.update(schema.productMedia).set({ position }).where(eq(schema.productMedia.id, found.id));
        continue;
      }
      await addImage(tx, store, product.id, name, alt, position);
    }
  }
}

async function addImage(tx: Transaction, store: SeedMediaStore, productId: string, name: string, alt: string, position: number) {
  const [width, height, thumbWidth, thumbHeight] = SIZES[name] ?? [2000, 1500, 400, 300];
  const source = await readFile(new URL(`${name}.webp`, ASSETS));
  const thumb = await readFile(new URL(`${name}.thumb.webp`, ASSETS));
  const key = `files/source/seed-${name}`;
  const [file] = await tx
    .insert(schema.files)
    .values({
      purpose: "PRODUCT_MEDIA",
      status: "READY",
      bucket: "public",
      ownerType: "PRODUCT",
      ownerId: productId,
      attachedAt: new Date(),
      originalName: `${name}.webp`,
      safeName: `${name}.webp`,
      declaredType: "image/webp",
      detectedType: "image/webp",
      declaredSize: source.length,
      sizeBytes: source.length,
      storageKey: key,
      metadata: { width, height },
    })
    .returning({ id: schema.files.id });
  const previewKey = `files/preview/${file!.id}/preview-1.webp`;
  const thumbKey = `files/preview/${file!.id}/thumbnail-1.webp`;
  await store.write(key, source, "image/webp");
  await store.write(previewKey, source, "image/webp");
  await store.write(thumbKey, thumb, "image/webp");
  await tx.insert(schema.fileRenditions).values([
    { fileId: file!.id, kind: "PREVIEW", page: 1, storageKey: previewKey, contentType: "image/webp", width, height },
    { fileId: file!.id, kind: "THUMBNAIL", page: 1, storageKey: thumbKey, contentType: "image/webp", width: thumbWidth, height: thumbHeight },
  ]);
  await tx.insert(schema.productMedia).values({ productId, fileId: file!.id, alt, position });
}
