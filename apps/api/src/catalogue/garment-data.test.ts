import { adminPriceRuleListSchema, configurationSchema, type Fabric, fabricSchema, garmentDataSchema, scheduledChangesSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectForbidden, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T13-01b: garment and production data, and Price updated (OPS-FR-020–022,
 * 130; Pen 118). Done when: a repriced draft shows Price updated with old and
 * new amounts; accepted quotes and orders never change (T13-01's test).
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
const staff = () => as(harness, actors.adminAda!);
const productId = async (slug: string) => (await harness.database.db.select().from(schema.products).where(eq(schema.products.slug, slug)))[0]!.id;

/** A browser of its own (a cookie for its device), like a guest building a design. */
function browser() {
  let cookie = "";
  const keep = (response: request.Response) => {
    const set = (response.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    if (set.length) cookie = set.map((line) => line.split(";")[0]).join("; ");
    return response;
  };
  return {
    get: async (path: string) => keep(await request(harness.url).get(path).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie)),
    post: async (path: string, body: object) => keep(await request(harness.url).post(path).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).send(body)),
    patch: async (path: string, body: object) => keep(await request(harness.url).patch(path).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).send(body)),
  };
}
const draftOf = (body: { draft?: unknown }) => configurationSchema.parse(body.draft ?? body);

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["adminAda", "financeFolake", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("Price updated (OPS-FR-130)", () => {
  it("a draft opened after a price change is repriced and shows the old and new totals until the customer changes it", async () => {
    const b = browser();
    let draft = draftOf((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
    draft = draftOf((await b.patch(`/v1/configurations/${draft.id}`, { version: draft.version, quantity: 250 })).body);
    const was = draft.price!.totalMinor!;
    expect(draft.priceUpdate).toBeNull();

    // Opening it again with nothing changed: no notice.
    expect(draftOf((await b.get(`/v1/configurations/${draft.id}`)).body).priceUpdate).toBeNull();

    // Staff double the price from now.
    const id = await productId("business-cards");
    const current = adminPriceRuleListSchema.parse((await staff().get(`/v1/admin/pricing/products/${id}/prices`)).body).entries.find((entry) => entry.current)!;
    const doubled = await staff().post(`/v1/admin/pricing/products/${id}/prices`, {
      ...current,
      effectiveFrom: new Date().toISOString(),
      baseMinor: (BigInt(current.baseMinor) * 2n).toString(),
      tiers: current.tiers.map((tier) => ({ ...tier, amountMinor: (BigInt(tier.amountMinor) * 2n).toString() })),
      note: "T13-01b test",
    });
    expect(doubled.status).toBe(201);

    // The customer opens it: repriced, with the old total kept (Pen 118 "Was … now …"). Their choices are unchanged.
    draft = draftOf((await b.get(`/v1/configurations/${draft.id}`)).body);
    expect(draft.priceUpdate).toEqual({ wasMinor: was, nowMinor: draft.price!.totalMinor, currency: "NGN" });
    expect(BigInt(draft.price!.totalMinor!)).toBeGreaterThan(BigInt(was));
    expect(draft).toMatchObject({ choices: { paper: "350gsm-matte", sides: "both-sides" }, quantity: 250 });
    // It stays until they change the design.
    draft = draftOf((await b.get(`/v1/configurations/${draft.id}`)).body);
    expect(draft.priceUpdate?.wasMinor).toBe(was);
    draft = draftOf((await b.patch(`/v1/configurations/${draft.id}`, { version: draft.version, quantity: 500 })).body);
    expect(draft.priceUpdate).toBeNull();
  });

  it("staff see what a scheduled price change will touch", async () => {
    const b = browser();
    const draft = draftOf((await b.post("/v1/configurations", { productSlug: "standard-mug", choices: {} })).body);
    expect(draft.status).toBe("DRAFT");
    const id = await productId("standard-mug");
    const current = adminPriceRuleListSchema.parse((await staff().get(`/v1/admin/pricing/products/${id}/prices`)).body).entries.find((entry) => entry.current)!;
    const from = new Date(Date.now() + 30 * 86_400_000).toISOString();
    expect((await staff().post(`/v1/admin/pricing/products/${id}/prices`, { ...current, effectiveFrom: from, note: "Scheduled" })).status).toBe(201);
    const scheduled = scheduledChangesSchema.parse((await staff().get("/v1/admin/pricing/scheduled")).body);
    const change = scheduled.changes.find((entry) => entry.productId === id)!;
    expect(change).toMatchObject({ productName: "Standard Mug", effectiveFrom: from });
    expect(change.drafts).toBeGreaterThanOrEqual(1);
  });
});

describe("garment and production data (OPS-FR-020–022)", () => {
  it("fabrics keep staff-only supplier codes and show which products use them; keys are unique; CATALOGUE_MANAGE only", async () => {
    const added = await staff().post("/v1/admin/garment-data/fabrics", { key: "pique-cotton", name: "Piqué cotton", detail: "220 gsm", colours: ["Navy", "White", "Navy"], sizeRange: "XS–4XL", supplierCode: "SUP: TEXCO-PQ220", version: 0 });
    expect(added.status).toBe(201);
    let fabric: Fabric = fabricSchema.parse(added.body);
    expect(fabric).toMatchObject({ colours: ["Navy", "White"], supplierCode: "SUP: TEXCO-PQ220", status: "ACTIVE" });
    expect(fabric.usedBy.map((product) => product.name)).toContain("Polo Shirt");

    expect((await staff().post("/v1/admin/garment-data/fabrics", { key: "pique-cotton", name: "Copy", colours: [], version: 0 })).body.fieldErrors).toEqual({ key: "Another fabric already uses this key" });
    fabric = fabricSchema.parse((await staff().put(`/v1/admin/garment-data/fabrics/${fabric.id}`, { ...fabric, status: "ARCHIVED", version: fabric.version })).body);
    expect(fabric).toMatchObject({ status: "ARCHIVED", version: 2 });
    expect((await staff().put(`/v1/admin/garment-data/fabrics/${fabric.id}`, { ...fabric, version: 1 })).status).toBe(409);

    // The supplier code never reaches customer pages.
    const polo = await request(harness.url).get("/v1/catalogue/products/polo-shirt").set("origin", TEST_WEB_ORIGIN);
    expect(JSON.stringify(polo.body)).not.toContain("TEXCO");
    expectForbidden(await as(harness, actors.financeFolake!).get("/v1/admin/garment-data"), "CATALOGUE_MANAGE");
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/garment-data"));
  });

  it("the placements staff block are what the configurator refuses, with the other method as the fix", async () => {
    const data = garmentDataSchema.parse((await staff().get("/v1/admin/garment-data")).body);
    // The migration keeps the rule that used to be in code.
    expect(data.blocked.map((rule) => `${rule.method}:${rule.position}`)).toEqual(["EMBROIDERY:FULL_BACK", "EMBROIDERY:FULL_FRONT"]);
    expect(data.sourcing.find((product) => product.name === "Polo Shirt")?.routes.length).toBeGreaterThan(0);

    const b = browser();
    let draft = draftOf((await b.post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } })).body);
    draft = draftOf((await b.patch(`/v1/configurations/${draft.id}`, { version: draft.version, sourcing: "SOURCE_CUSTOMIZE", decoration: "EMBROIDERY" })).body);
    draft = draftOf((await b.patch(`/v1/configurations/${draft.id}`, { version: draft.version, placements: [{ position: "LEFT_SLEEVE", size: "SMALL", method: "PRINT", note: null }] })).body);
    expect(draft.garment!.conflicts).toEqual([]);

    // Staff block print on sleeves.
    const saved = garmentDataSchema.parse((await staff().put("/v1/admin/garment-data/placements", { blocked: [...data.blocked, { method: "PRINT", position: "LEFT_SLEEVE", message: "Sleeves are embroidered, not printed." }] })).body);
    expect(saved.blocked).toHaveLength(3);
    draft = draftOf((await b.get(`/v1/configurations/${draft.id}`)).body);
    expect(draft.garment!.conflicts).toEqual([{ positions: ["LEFT_SLEEVE"], message: "Sleeves are embroidered, not printed.", fixes: [{ label: "Embroider this area instead", position: "LEFT_SLEEVE", change: { method: "EMBROIDERY" } }] }]);

    // Back as it was.
    await staff().put("/v1/admin/garment-data/placements", { blocked: data.blocked });
    expect(draftOf((await b.get(`/v1/configurations/${draft.id}`)).body).garment!.conflicts).toEqual([]);
    expectForbidden(await as(harness, actors.financeFolake!).put("/v1/admin/garment-data/placements", { blocked: [] }), "CATALOGUE_MANAGE");
  });
});
