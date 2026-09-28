import { adminHubSchema, adminMerchandisingListsSchema, publicHubSchema, publicProductPageSchema, storefrontNavigationSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

let harness: Harness;
let actors: Partial<Actors>;
let staff: string;

const get = (path: string) => request(harness.url).get(path);
const page = async (query = "") => {
  const response = await get(`/v1/catalogue/products${query}`);
  if (response.status !== 200) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);
  return publicProductPageSchema.parse(response.body);
};
const put = (path: string, body: object) => request(harness.url).put(path).set("origin", TEST_WEB_ORIGIN).set("cookie", staff).send(body);

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["customerChidi"]);
  staff = await harness.signInAs("adminAda");
});

afterAll(async () => {
  await harness?.close();
});

async function insertProduct(values: { slug: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; categorySlug: string; phrases?: string[] }) {
  const [category] = await harness.database.db.select().from(schema.categories).where(eq(schema.categories.slug, values.categorySlug));
  const [row] = await harness.database.db
    .insert(schema.products)
    .values({
      sku: `HP-TST-${values.slug}`,
      slug: values.slug,
      name: values.slug.replaceAll("-", " "),
      family: "PAPER_PRINT",
      buyingMode: "SIMPLE_CONFIGURABLE",
      categoryId: category!.id,
      status: values.status,
      searchPhrases: values.phrases ?? [],
    })
    .returning();
  return row!;
}

describe("public product directory (PUB-FR-008)", () => {
  it("never shows drafts or archived products, and shows them once published", async () => {
    const draft = await insertProduct({ slug: "secret-draft-flyer", status: "DRAFT", categorySlug: "business-stationery" });
    await insertProduct({ slug: "old-archived-flyer", status: "ARCHIVED", categorySlug: "business-stationery" });
    const all = await page("?limit=48");
    expect(all.entries.map((entry) => entry.slug)).not.toContain("secret-draft-flyer");
    expect(all.entries.map((entry) => entry.slug)).not.toContain("old-archived-flyer");
    expect(all.total).toBe(10);
    expect(all.entries[0]).not.toHaveProperty("sku");

    await harness.database.db.update(schema.products).set({ status: "PUBLISHED" }).where(eq(schema.products.id, draft.id));
    expect((await page("?limit=48")).entries.map((entry) => entry.slug)).toContain("secret-draft-flyer");
  });

  it("hides products whose category isn't published", async () => {
    await harness.database.db.update(schema.categories).set({ status: "DRAFT" }).where(eq(schema.categories.slug, "drinkware"));
    try {
      expect((await page("?limit=48")).entries.map((entry) => entry.slug)).not.toContain("standard-mug");
    } finally {
      await harness.database.db.update(schema.categories).set({ status: "PUBLISHED" }).where(eq(schema.categories.slug, "drinkware"));
    }
  });

  it("filters by category (including subcategories), family, buying mode and everyday phrases, with facet counts", async () => {
    await insertProduct({ slug: "office-letterhead", status: "PUBLISHED", categorySlug: "business-stationery", phrases: ["company paper"] });
    const print = await page("?category=print-business-stationery");
    expect(print.entries.map((entry) => entry.slug)).toEqual(expect.arrayContaining(["business-cards", "office-letterhead"]));
    expect(print.entries.every((entry) => entry.category.name === "Business Stationery")).toBe(true);
    // Facet counts ignore the category filter itself, so every chip shows its own count.
    expect(print.facets.categories.find((facet) => facet.slug === "apparel-garment-production")!.count).toBe(1);

    expect((await page("?q=company%20paper")).entries.map((entry) => entry.slug)).toEqual(["office-letterhead"]);
    expect((await page("?family=GARMENT")).entries.map((entry) => entry.slug)).toEqual(["polo-shirt"]);
    const consult = await page("?mode=CONSULTATIVE_PROJECT");
    expect(consult.entries).toEqual([expect.objectContaining({ slug: "team-staff-branding", priceState: "CONSULTATION_REQUIRED" })]);
  });

  it("pages through results and sorts by name", async () => {
    const first = await page("?limit=5&sort=name");
    const second = await page("?limit=5&sort=name&page=2");
    expect(first.pages).toBeGreaterThanOrEqual(3);
    const names = [...first.entries, ...second.entries].map((entry) => entry.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(new Set(names).size).toBe(10);
  });

  it("marks temporarily unavailable products as not orderable", async () => {
    await harness.database.db.update(schema.products).set({ status: "TEMPORARILY_UNAVAILABLE" }).where(eq(schema.products.slug, "landscape-canvas"));
    const canvas = (await page("?q=canvas")).entries.find((entry) => entry.slug === "landscape-canvas")!;
    expect(canvas).toMatchObject({ available: false, priceState: "UNAVAILABLE" });
  });

  it("sets public cache headers and needs no sign-in", async () => {
    const response = await get("/v1/catalogue/products");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("public");
  });
});

describe("public images", () => {
  it("serves images of visible products and hides draft products' images", async () => {
    const [mug] = await harness.database.db.select().from(schema.products).where(eq(schema.products.slug, "standard-mug"));
    const store = harness.publicStorage;
    const makeFile = async (name: string) => {
      const [file] = await harness.database.db
        .insert(schema.files)
        .values({ purpose: "PRODUCT_MEDIA", status: "READY", bucket: "public", originalName: name, safeName: name, declaredType: "image/webp", declaredSize: 4, storageKey: `files/source/${name}` })
        .returning();
      await store.write(`files/preview/${file!.id}/thumbnail-1.webp`, Buffer.from("RIFF"), "image/webp");
      await harness.database.db.insert(schema.fileRenditions).values({ fileId: file!.id, kind: "THUMBNAIL", storageKey: `files/preview/${file!.id}/thumbnail-1.webp`, contentType: "image/webp" });
      return file!;
    };
    const shown = await makeFile("mug.webp");
    await harness.database.db.insert(schema.productMedia).values({ productId: mug!.id, fileId: shown.id, alt: "White mug" });
    const ok = await get(`/v1/media/${shown.id}/thumbnail`);
    expect(ok.status).toBe(200);
    expect(ok.headers["cache-control"]).toContain("immutable");
    expect((await page("?q=mug")).entries[0]!.image).toMatchObject({ alt: "White mug", thumbnailUrl: `/api/v1/media/${shown.id}/thumbnail` });

    const draft = await insertProduct({ slug: "hidden-draft-mug", status: "DRAFT", categorySlug: "drinkware" });
    const hidden = await makeFile("draft.webp");
    await harness.database.db.insert(schema.productMedia).values({ productId: draft.id, fileId: hidden.id, alt: "Secret" });
    expect((await get(`/v1/media/${hidden.id}/thumbnail`)).status).toBe(404);
  });
});

describe("category hubs (PUB-FR-009, Pen 105)", () => {
  it("renders a default hub, keeps drafts private until published, and refuses unpublished categories", async () => {
    const hub = publicHubSchema.parse((await get("/v1/catalogue/hubs/apparel-garment-production")).body);
    expect(hub.sections.map((section) => section.type)).toEqual(["summary", "subcategories", "grid"]);
    expect(hub.products.map((product) => product.slug)).toContain("polo-shirt");
    expect(hub.category.children.map((child) => child.slug)).toContain("t-shirts-tops");

    const [category] = await harness.database.db.select().from(schema.categories).where(eq(schema.categories.slug, "apparel-garment-production"));
    const admin = adminHubSchema.parse((await as(harness, staff).get(`/v1/admin/catalogue/categories/${category!.id}/hub`)).body);
    const sections = admin.draft.sections.map((section) =>
      section.type === "faq"
        ? { ...section, visible: true, items: [{ question: "What's the minimum order?", answer: "10 pieces for most garments." }] }
        : section.type === "featured"
          ? { ...section, visible: true, productSlugs: ["polo-shirt"] }
          : section,
    );
    const saved = adminHubSchema.parse((await put(`/v1/admin/catalogue/categories/${category!.id}/hub`, { hub: { sections }, version: admin.version })).body);
    expect(saved.unpublishedChanges).toBe(true);
    // Saving a draft doesn't change the public page.
    expect(publicHubSchema.parse((await get("/v1/catalogue/hubs/apparel-garment-production")).body).sections.map((section) => section.type)).not.toContain("faq");

    const published = await as(harness, staff).post(`/v1/admin/catalogue/categories/${category!.id}/hub/publish`, { version: saved.version });
    expect(published.status).toBe(200);
    expect(adminHubSchema.parse(published.body).unpublishedChanges).toBe(false);
    const live = publicHubSchema.parse((await get("/v1/catalogue/hubs/apparel-garment-production")).body);
    expect(live.sections.map((section) => section.type)).toEqual(expect.arrayContaining(["faq", "featured"]));
    expect(live.featured.map((product) => product.slug)).toEqual(["polo-shirt"]);

    const stale = await put(`/v1/admin/catalogue/categories/${category!.id}/hub`, { hub: { sections }, version: saved.version });
    expect(stale.status).toBe(409);

    const bad = await put(`/v1/admin/catalogue/categories/${category!.id}/hub`, { hub: { sections: sections.slice(1) }, version: published.body.version });
    expect(bad.status).toBe(400);

    await harness.database.db.insert(schema.categories).values({ slug: "draft-category", name: "Draft", status: "DRAFT" });
    expect((await get("/v1/catalogue/hubs/draft-category")).status).toBe(404);
  }, 180_000);

  it("is 403 for staff without CATALOGUE_MANAGE and 404 for customers", async () => {
    const [category] = await harness.database.db.select().from(schema.categories).limit(1);
    const tunde = await harness.signInAs("adminTunde");
    expect((await as(harness, tunde).get(`/v1/admin/catalogue/categories/${category!.id}/hub`)).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get(`/v1/admin/catalogue/categories/${category!.id}/hub`));
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/catalogue/lists"));
  });
});

describe("admin-managed lists and navigation (PUB-FR-004)", () => {
  it("shows the saved popular list in navigation, skipping unpublished products", async () => {
    const products = await harness.database.db.select().from(schema.products);
    const id = (slug: string) => products.find((product) => product.slug === slug)!.id;
    const lists = adminMerchandisingListsSchema.parse((await as(harness, staff).get("/v1/admin/catalogue/lists")).body);
    const menu = lists.lists.find((list) => list.key === "menu.popular")!;
    const saved = await put("/v1/admin/catalogue/lists/menu.popular", { productIds: [id("business-cards"), id("secret-draft-flyer"), id("polo-shirt")], version: menu.version });
    expect(saved.status).toBe(200);
    await harness.database.db.update(schema.products).set({ status: "DRAFT" }).where(eq(schema.products.slug, "secret-draft-flyer")).catch(() => undefined);

    const nav = storefrontNavigationSchema.parse((await get("/v1/catalogue/navigation")).body);
    expect(nav.popular.map((item) => item.slug)).toEqual(["business-cards", "polo-shirt"]);
    expect(nav.categories.length).toBe(9);
    expect(nav.totalProducts).toBeGreaterThan(0);

    const again = await put("/v1/admin/catalogue/lists/menu.popular", { productIds: [], version: menu.version });
    expect(again.status).toBe(409);
  });
});
