import { readFile } from "node:fs/promises";
import { eq, schema, type Transaction } from "@holypearls/db";
import { SEED_PRODUCTS } from "./catalogue.js";

/** Where seeded images are written: the public-media bucket (TECH-04 §2). */
export interface SeedMediaStore {
  write(key: string, body: Buffer, contentType: string): Promise<void>;
}

/** Generated sample photos, 2000 × 1500 with 400 px thumbnails (TEST DATA, see assets/products). */
const ASSETS = new URL("../../assets/products/", import.meta.url);
/** Subcategory photos (TEST DATA): Pen's reference photography and product samples, until real HolyPearls photos arrive. */
const CATEGORY_ASSETS = new URL("../../assets/categories/", import.meta.url);

/**
 * Each subcategory's hero image, by slug: the category page shows the
 * category's own image (categories.hero_file_id), never one picked by its
 * position in a list (its alt text is the category name). Staff replace them in admin.
 */
const CATEGORY_IMAGES: Record<string, [width: number, height: number, thumbWidth: number, thumbHeight: number]> = {
  headwear: [928, 1152, 400, 497],
  "t-shirts-tops": [928, 1152, 322, 400],
  workwear: [1408, 768, 400, 218],
  "apparel-printing": [928, 1152, 322, 400],
  embroidery: [1408, 768, 400, 218],
  "business-stationery": [928, 1152, 322, 400],
  "id-event": [1408, 768, 400, 218],
  "roll-ups": [928, 1152, 322, 400],
  "paper-presentation-packaging": [928, 1152, 322, 400],
  stickers: [928, 1152, 322, 400],
  drinkware: [2000, 1500, 400, 300],
  canvas: [2000, 1500, 400, 300],
  solutions: [2000, 1500, 400, 300],
};

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
  // Subcategory images: only where staff haven't set one.
  for (const [slug, size] of Object.entries(CATEGORY_IMAGES)) {
    const [category] = await tx.select({ id: schema.categories.id, heroFileId: schema.categories.heroFileId }).from(schema.categories).where(eq(schema.categories.slug, slug));
    if (!category || category.heroFileId) continue;
    const fileId = await storeImage(tx, store, { base: CATEGORY_ASSETS, name: slug, key: `seed-category-${slug}`, size, owner: { type: "CATEGORY", id: category.id } });
    await tx.update(schema.categories).set({ heroFileId: fileId }).where(eq(schema.categories.id, category.id));
  }
}

async function addImage(tx: Transaction, store: SeedMediaStore, productId: string, name: string, alt: string, position: number) {
  const fileId = await storeImage(tx, store, { base: ASSETS, name, key: `seed-${name}`, size: SIZES[name] ?? [2000, 1500, 400, 300], owner: { type: "PRODUCT", id: productId } });
  await tx.insert(schema.productMedia).values({ productId, fileId, alt, position });
}

/** Writes a READY public image with its preview and thumbnail renditions; returns its file ID. */
async function storeImage(
  tx: Transaction,
  store: SeedMediaStore,
  image: { base: URL; name: string; key: string; size: [number, number, number, number]; owner: { type: "PRODUCT" | "CATEGORY"; id: string } },
): Promise<string> {
  const { name } = image;
  const [width, height, thumbWidth, thumbHeight] = image.size;
  const source = await readFile(new URL(`${name}.webp`, image.base));
  const thumb = await readFile(new URL(`${name}.thumb.webp`, image.base));
  const key = `files/source/${image.key}`;
  const [file] = await tx
    .insert(schema.files)
    .values({
      purpose: "PRODUCT_MEDIA",
      status: "READY",
      bucket: "public",
      ownerType: image.owner.type,
      ownerId: image.owner.id,
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
  return file!.id;
}
