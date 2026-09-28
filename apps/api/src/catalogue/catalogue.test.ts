import { adminProductPageSchema, adminProductSchema } from "@holypearls/contracts";
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
    expect(canChangeStatus("PUBLISHED", "DRAFT")).toBe(true);
    expect(canChangeStatus("DRAFT", "TEMPORARILY_UNAVAILABLE")).toBe(false);
    expect(canChangeStatus("ARCHIVED", "PUBLISHED")).toBe(false);
  });

  it("creates a draft, refuses publishing until it's ready, then publishes, pauses, unpublishes and archives", async () => {
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
    await step("DRAFT");
    await step("ARCHIVED");

    const reopen = await as(harness, staff).post(`/v1/admin/catalogue/products/${product.id}/status`, { to: "PUBLISHED", version: product.version });
    expect(reopen.status).toBe(409);

    const audit = await harness.database.db.select().from(schema.auditLog).where(eq(schema.auditLog.recordId, product.id));
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["catalogue.product_created", "catalogue.product_updated", "catalogue.product_status_changed"]),
    );
    expect(audit.filter((entry) => entry.action === "catalogue.product_status_changed")).toHaveLength(5);
  });
});

describe("catalogue admin access", () => {
  it("is 403 for staff without CATALOGUE_MANAGE and 404 for customers", async () => {
    const tunde = await harness.signInAs("adminTunde");
    expect((await as(harness, tunde).get("/v1/admin/catalogue/products")).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/catalogue/products"));
  });
});
