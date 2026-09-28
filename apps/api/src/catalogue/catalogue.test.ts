import { adminCategoryListSchema, adminCategorySchema, adminProductPageSchema, adminProductSchema, bulkProductStatusResultSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { canChangeStatus } from "./products.js";

let harness: Harness;
let actors: Partial<Actors>;
let staff: string;

const patch = (path: string, body: object) =>
  request(harness.url).patch(path).set("origin", TEST_WEB_ORIGIN).set("cookie", staff).send(body);

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["adminAda", "customerChidi"]);
  // Ada holds CATALOGUE_MANAGE in the seed; Tunde (STAFF_ADMIN only) doesn't.
  staff = await harness.signInAs("adminAda");
});

afterAll(async () => {
  await harness?.close();
});

describe("catalogue seed (T02-01)", () => {
  it("loads the nine categories and one published product per family", async () => {
    const page = adminProductPageSchema.parse((await as(harness, staff).get("/v1/admin/catalogue/products?limit=100")).body);
    expect(new Set(page.entries.map((product) => product.family)).size).toBe(10);
    expect(page.entries.find((product) => product.slug === "business-cards")).toMatchObject({
      buyingMode: "SIMPLE_CONFIGURABLE",
      status: "PUBLISHED",
    });
  });
});

describe("product statuses (TECH-01 §4)", () => {
  it("allows only the designed transitions", () => {
    expect(canChangeStatus("DRAFT", "PUBLISHED")).toBe(true);
    expect(canChangeStatus("PUBLISHED", "TEMPORARILY_UNAVAILABLE")).toBe(true);
    expect(canChangeStatus("TEMPORARILY_UNAVAILABLE", "PUBLISHED")).toBe(true);
    // No way back to DRAFT: products leave the site by being archived (owner decision).
    expect(canChangeStatus("PUBLISHED", "DRAFT")).toBe(false);
    expect(canChangeStatus("TEMPORARILY_UNAVAILABLE", "DRAFT")).toBe(false);
    expect(canChangeStatus("PUBLISHED", "ARCHIVED")).toBe(true);
    expect(canChangeStatus("DRAFT", "TEMPORARILY_UNAVAILABLE")).toBe(false);
    expect(canChangeStatus("ARCHIVED", "PUBLISHED")).toBe(false);
  });

  it("creates a draft, refuses publishing until it's ready, then publishes, pauses and archives", async () => {
    const categories = await harness.database.db.select().from(schema.categories).where(eq(schema.categories.slug, "caps-headwear"));
    const [category] = categories.length
      ? categories
      : await harness.database.db.insert(schema.categories).values({ slug: "caps-headwear", name: "Caps & headwear", status: "PUBLISHED" }).returning();
    const created = await as(harness, staff).post("/v1/admin/catalogue/products", {
      sku: "HP-EMB-099",
      slug: "puff-embroidery-cap",
      name: "Puff Embroidery Cap",
      family: "EMBROIDERY",
      buyingMode: "CONFIGURABLE_QUOTE",
      categoryId: category!.id,
    });
    expect(created.status).toBe(201);
    let product = adminProductSchema.parse(created.body);
    expect(product.status).toBe("DRAFT");

    const blocked = await as(harness, staff).post(`/v1/admin/catalogue/products/${product.id}/status`, { to: "PUBLISHED", version: product.version });
    expect(blocked.status).toBe(422);
    expect(blocked.body.fieldErrors).toEqual({ media: "Add at least one image", seoTitle: "Add an SEO title", summary: "Add a short description" });

    const edited = await patch(`/v1/admin/catalogue/products/${product.id}`, {
      version: product.version,
      seoTitle: "Puff embroidery caps | HolyPearls",
      summary: "Structured cap with raised 3D embroidery.",
    });
    expect(edited.status).toBe(200);
    product = adminProductSchema.parse(edited.body);

    // Someone else's older version is refused, not silently overwritten.
    const stale = await patch(`/v1/admin/catalogue/products/${product.id}`, { version: product.version - 1, name: "Old name" });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");

    const [file] = await harness.database.db
      .insert(schema.files)
      .values({ purpose: "PRODUCT_MEDIA", status: "READY", bucket: "public", originalName: "cap.png", safeName: "cap.png", declaredType: "image/png", declaredSize: 10, storageKey: "files/source/cap" })
      .returning();
    await harness.database.db.insert(schema.productMedia).values({ productId: product.id, fileId: file!.id, alt: "Navy cap with raised logo" });

    const step = async (to: string) => {
      const response = await as(harness, staff).post(`/v1/admin/catalogue/products/${product.id}/status`, { to, version: product.version });
      expect({ to, status: response.status }).toEqual({ to, status: 200 });
      product = adminProductSchema.parse(response.body);
      expect(product.status).toBe(to);
    };
    await step("PUBLISHED");
    await step("TEMPORARILY_UNAVAILABLE");
    await step("PUBLISHED");
    await step("ARCHIVED");

    const reopen = await as(harness, staff).post(`/v1/admin/catalogue/products/${product.id}/status`, { to: "PUBLISHED", version: product.version });
    expect(reopen.status).toBe(409);

    const audit = await harness.database.db.select().from(schema.auditLog).where(eq(schema.auditLog.recordId, product.id));
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["catalogue.product_created", "catalogue.product_updated", "catalogue.product_status_changed"]),
    );
    expect(audit.filter((entry) => entry.action === "catalogue.product_status_changed")).toHaveLength(4);
  }, 180_000);
});

describe("catalogue admin access", () => {
  it("is 403 for staff without CATALOGUE_MANAGE and 404 for customers", async () => {
    const tunde = await harness.signInAs("adminTunde");
    expect((await as(harness, tunde).get("/v1/admin/catalogue/products")).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/catalogue/products"));
  });
});

/** A READY product-media file, as the worker leaves it. */
async function mediaFile(name: string, width = 2400) {
  const [file] = await harness.database.db
    .insert(schema.files)
    .values({
      purpose: "PRODUCT_MEDIA",
      status: "READY",
      bucket: "public",
      originalName: name,
      safeName: name,
      declaredType: "image/png",
      detectedType: "image/png",
      declaredSize: 10,
      storageKey: `files/source/${name}`,
      metadata: { width, height: 1600 },
    })
    .returning();
  return file!;
}

const productBySlug = async (slug: string) => {
  const page = adminProductPageSchema.parse((await as(harness, staff).get(`/v1/admin/catalogue/products?limit=100&q=${slug}`)).body);
  return adminProductSchema.parse((await as(harness, staff).get(`/v1/admin/catalogue/products/${page.entries[0]!.id}`)).body);
};

describe("product images, text and related products (Pen frames 98 and 104)", () => {
  it("adds, describes, reorders and removes images, and keeps the last image of a published product", async () => {
    const product = await productBySlug("standard-mug");
    const base = `/v1/admin/catalogue/products/${product.id}`;
    const first = await mediaFile("mug-front.png");
    const second = await mediaFile("mug-side.png");
    let saved = adminProductSchema.parse((await as(harness, staff).post(`${base}/media`, { fileId: first.id, alt: "White mug, front" })).body);
    saved = adminProductSchema.parse((await as(harness, staff).post(`${base}/media`, { fileId: second.id, alt: "White mug, side" })).body);
    expect(saved.media.map((item) => item.alt)).toEqual(["White mug, front", "White mug, side"]);

    const order = await request(harness.url)
      .put(`${base}/media-order`)
      .set("origin", TEST_WEB_ORIGIN)
      .set("cookie", staff)
      .send({ mediaIds: [saved.media[1]!.id, saved.media[0]!.id] });
    expect(adminProductSchema.parse(order.body).media.map((item) => item.alt)).toEqual(["White mug, side", "White mug, front"]);

    const alt = await patch(`${base}/media/${saved.media[0]!.id}`, { alt: "White ceramic mug, front" });
    expect(adminProductSchema.parse(alt.body).media.find((item) => item.fileId === first.id)!.alt).toBe("White ceramic mug, front");

    const remove = (id: string) => request(harness.url).delete(`${base}/media/${id}`).set("origin", TEST_WEB_ORIGIN).set("cookie", staff);
    expect((await remove(saved.media[0]!.id)).status).toBe(200);
    const last = await remove(saved.media[1]!.id);
    expect(last.status).toBe(422);
    expect(last.body.context.reason).toBe("LAST_IMAGE");
  }, 180_000);

  it("refuses files that aren't product media or were rejected", async () => {
    const product = await productBySlug("label-sticker");
    const [artwork] = await harness.database.db
      .insert(schema.files)
      .values({ purpose: "ARTWORK", status: "READY", bucket: "private", originalName: "a.png", safeName: "a.png", declaredType: "image/png", declaredSize: 1, storageKey: "k" })
      .returning();
    // Someone else's file looks the same as a missing one.
    expectHidden(await as(harness, staff).post(`/v1/admin/catalogue/products/${product.id}/media`, { fileId: artwork!.id, alt: "x" }));
    const small = await mediaFile("small.png", 800);
    await harness.database.db.update(schema.files).set({ status: "REJECTED", reason: "This image is smaller than 1600 px wide. Upload a larger file." }).where(eq(schema.files.id, small.id));
    const rejected = await as(harness, staff).post(`/v1/admin/catalogue/products/${product.id}/media`, { fileId: small.id, alt: "x" });
    expect(rejected.status).toBe(422);
    expect(rejected.body.message).toContain("1600 px");
  });

  it("saves specifications, FAQs, SEO text and related products", async () => {
    const product = await productBySlug("business-cards");
    const edited = await patch(`/v1/admin/catalogue/products/${product.id}`, {
      version: product.version,
      specifications: [{ label: "Size", value: "85 × 55 mm" }],
      faqs: [{ question: "Can I print both sides?", answer: "Yes." }],
      seoDescription: "Premium business cards printed in Lagos.",
    });
    expect(adminProductSchema.parse(edited.body)).toMatchObject({ specifications: [{ label: "Size", value: "85 × 55 mm" }], seoDescription: "Premium business cards printed in Lagos." });
    const mug = await productBySlug("standard-mug");
    const related = await request(harness.url)
      .put(`/v1/admin/catalogue/products/${product.id}/related`)
      .set("origin", TEST_WEB_ORIGIN)
      .set("cookie", staff)
      .send({ productIds: [mug.id, product.id] });
    // A product is never related to itself.
    expect(adminProductSchema.parse(related.body).related.map((item) => item.id)).toEqual([mug.id]);
  });
});

describe("bulk status changes (Pen frame 96)", () => {
  it("changes each product it can and explains the ones it can't", async () => {
    const canvas = await productBySlug("landscape-canvas");
    const banner = await productBySlug("roll-up-banner");
    const result = bulkProductStatusResultSchema.parse(
      (await as(harness, staff).post("/v1/admin/catalogue/products/bulk-status", { ids: [canvas.id, banner.id], to: "TEMPORARILY_UNAVAILABLE" })).body,
    );
    expect(result.changed.sort()).toEqual([canvas.id, banner.id].sort());
    const again = bulkProductStatusResultSchema.parse(
      (await as(harness, staff).post("/v1/admin/catalogue/products/bulk-status", { ids: [canvas.id], to: "TEMPORARILY_UNAVAILABLE" })).body,
    );
    expect(again.skipped).toEqual([{ id: canvas.id, name: "Landscape Canvas", reason: "Already TEMPORARILY_UNAVAILABLE" }]);
    const tunde = await harness.signInAs("adminTunde");
    expect((await as(harness, tunde).post("/v1/admin/catalogue/products/bulk-status", { ids: [canvas.id], to: "ARCHIVED" })).status).toBe(403);
  }, 180_000);
});

describe("categories (Pen frame 104)", () => {
  it("creates, publishes and archives categories, with the parent and product rules", async () => {
    const list = adminCategoryListSchema.parse((await as(harness, staff).get("/v1/admin/catalogue/categories")).body);
    const apparel = list.entries.find((entry) => entry.slug === "apparel-garment-production")!;
    expect(apparel.productCount).toBeGreaterThan(0);

    const parent = adminCategorySchema.parse((await as(harness, staff).post("/v1/admin/catalogue/categories", { name: "Seasonal gifts 2025", slug: "seasonal-gifts-2025" })).body);
    const child = adminCategorySchema.parse(
      (await as(harness, staff).post("/v1/admin/catalogue/categories", { name: "Christmas hampers", slug: "christmas-hampers", parentId: parent.id })).body,
    );
    expect(child).toMatchObject({ status: "DRAFT", parentName: "Seasonal gifts 2025" });
    const status = (id: string, to: string, version: number) => as(harness, staff).post(`/v1/admin/catalogue/categories/${id}/status`, { to, version });

    const early = await status(child.id, "PUBLISHED", child.version);
    expect(early.body.context.reason).toBe("PARENT_NOT_PUBLISHED");
    const published = adminCategorySchema.parse((await status(parent.id, "PUBLISHED", parent.version)).body);
    const blocked = await status(parent.id, "ARCHIVED", published.version);
    expect(blocked.body.context.reason).toBe("HAS_SUBCATEGORIES");
    expect((await status(child.id, "ARCHIVED", child.version)).status).toBe(200);
    expect((await status(parent.id, "ARCHIVED", published.version)).status).toBe(200);

    const withProducts = await status(apparel.id, "ARCHIVED", apparel.version);
    expect(withProducts.status).toBe(422);
    expect(withProducts.body.context.reason).toBe("HAS_PRODUCTS");

    const nested = await as(harness, staff).post("/v1/admin/catalogue/categories", { name: "Too deep", slug: "too-deep", parentId: child.id });
    expect(nested.body.fieldErrors.parentId).toBe("Choose a top-level category");
    const audit = await harness.database.db.select().from(schema.auditLog).where(eq(schema.auditLog.recordId, parent.id));
    expect(audit.map((entry) => entry.action)).toEqual(expect.arrayContaining(["catalogue.category_created", "catalogue.category_status_changed"]));
  }, 180_000);

  it("is 403 for staff without CATALOGUE_MANAGE and 404 for customers", async () => {
    const tunde = await harness.signInAs("adminTunde");
    expect((await as(harness, tunde).get("/v1/admin/catalogue/categories")).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/catalogue/categories"));
  });
});
