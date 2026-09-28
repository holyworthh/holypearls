import { adminPriceRuleListSchema, adminProductRulesSchema, adminTaxSettingListSchema, priceResultSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

let harness: Harness;
let actors: Partial<Actors>;
let staff: string;

const price = async (slug: string, body: object) => {
  const response = await request(harness.url).post(`/v1/catalogue/products/${slug}/price`).set("origin", TEST_WEB_ORIGIN).send(body);
  return response;
};
const put = (path: string, body: object) => request(harness.url).put(path).set("origin", TEST_WEB_ORIGIN).set("cookie", staff).send(body);
const productId = async (slug: string) => (await harness.database.db.select().from(schema.products).where(eq(schema.products.slug, slug)))[0]!.id;

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["customerChidi"]);
  staff = await harness.signInAs("adminAda");
});

afterAll(async () => {
  await harness?.close();
});

describe("public price calculation (COM-FR-004, 005)", () => {
  it("prices 250 business cards from the seeded rules and saves the result", async () => {
    const response = await price("business-cards", { choices: { paper: "350gsm-matte", sides: "both-sides" }, quantity: 250 });
    expect(response.status).toBe(200);
    const result = priceResultSchema.parse(response.body);
    // ₦15,000 per 100 × 250 = ₦37,500; VAT 7.5% = ₦2,812.50; total ₦40,312.50; per card ₦161.25.
    expect(result).toMatchObject({ state: "PRICE_READY", valid: true, currency: "NGN", goodsMinor: "3750000", vatMinor: "281250", totalMinor: "4031250", perUnitMinor: "16125", leadDays: { min: 2, max: 5 } });
    const [saved] = await harness.database.db.select().from(schema.priceResults).where(eq(schema.priceResults.id, result.id));
    expect(saved).toMatchObject({ state: "PRICE_READY", totalMinor: 4_031_250n, priceRuleId: result.ruleVersions.priceRuleId, productRulesVersion: 1 });
    expect(saved!.taxSettingId).toBe(result.ruleVersions.taxSettingId);
  });

  it("applies add-ons, blocks below the minimum and shows estimates and consultation states", async () => {
    const softTouch = priceResultSchema.parse((await price("business-cards", { choices: { paper: "400gsm-soft-touch", sides: "one-side" }, quantity: 100 })).body);
    // ₦15,000 + 100 × ₦30 = ₦18,000; VAT ₦1,350.
    expect(softTouch.totalMinor).toBe("1935000");

    const small = priceResultSchema.parse((await price("business-cards", { choices: { paper: "350gsm-matte", sides: "one-side" }, quantity: 50 })).body);
    expect(small).toMatchObject({ valid: false, reasons: [expect.objectContaining({ code: "BELOW_MOQ_BLOCKED", blocking: true })] });

    const polo = priceResultSchema.parse((await price("polo-shirt", { choices: { colour: "navy", fabric: "pique-cotton" }, quantity: 20 })).body);
    expect(polo).toMatchObject({ state: "ESTIMATE_READY", valid: true, totalMinor: "18275000" });

    const project = priceResultSchema.parse((await price("team-staff-branding", { choices: {}, quantity: 30 })).body);
    expect(project).toMatchObject({ state: "CONSULTATION_REQUIRED", totalMinor: null });
  });

  it("refuses unpublished products and bad input", async () => {
    await harness.database.db.update(schema.products).set({ status: "DRAFT" }).where(eq(schema.products.slug, "standard-mug"));
    expect((await price("standard-mug", { choices: { colour: "white" }, quantity: 10 })).status).toBe(404);
    await harness.database.db.update(schema.products).set({ status: "PUBLISHED" }).where(eq(schema.products.slug, "standard-mug"));
    expect((await price("standard-mug", { choices: { colour: "white" }, quantity: 0 })).status).toBe(400);
  });
});

describe("rules and prices admin (OPS-FR-010–019)", () => {
  it("edits product rules with a version, and refuses a stale version", async () => {
    const id = await productId("standard-mug");
    const current = adminProductRulesSchema.parse((await as(harness, staff).get(`/v1/admin/pricing/products/${id}/rules`)).body);
    expect(current.rules).toMatchObject({ moq: 10, proof: "REQUIRED" });
    const saved = adminProductRulesSchema.parse((await put(`/v1/admin/pricing/products/${id}/rules`, { rules: { ...current.rules!, moq: 12 }, version: current.version })).body);
    expect(saved).toMatchObject({ rules: { moq: 12 }, version: current.version + 1 });
    const stale = await put(`/v1/admin/pricing/products/${id}/rules`, { rules: { ...current.rules!, moq: 15 }, version: current.version });
    expect(stale.status).toBe(409);
    const bad = await put(`/v1/admin/pricing/products/${id}/rules`, { rules: { ...current.rules!, leadMinDays: 9, leadMaxDays: 3 }, version: saved.version });
    expect(bad.status).toBe(400);
    expect(bad.body.fieldErrors["rules.leadMaxDays"]).toBe("The longest lead time can't be shorter than the shortest");
  });

  it("saves compatibility rules that name real options and uses them", async () => {
    const id = await productId("business-cards");
    const rules = adminProductRulesSchema.parse((await as(harness, staff).get(`/v1/admin/pricing/products/${id}/rules`)).body);
    const wrong = await put(`/v1/admin/pricing/products/${id}/compatibility`, {
      version: rules.version,
      rules: [{ ifOption: "paper", ifValue: "cardboard", thenOption: "sides", thenValues: ["both-sides"], effect: "NOT_ALLOWED", message: "x" }],
    });
    expect(wrong.status).toBe(400);
    const saved = await put(`/v1/admin/pricing/products/${id}/compatibility`, {
      version: rules.version,
      rules: [{ ifOption: "paper", ifValue: "350gsm-gloss", thenOption: "sides", thenValues: ["both-sides"], effect: "NEEDS_REVIEW", message: "Double-sided gloss is checked by our team." }],
    });
    expect(saved.status).toBe(200);
    const result = priceResultSchema.parse((await price("business-cards", { choices: { paper: "350gsm-gloss", sides: "both-sides" }, quantity: 100 })).body);
    expect(result).toMatchObject({ state: "QUOTE_REQUIRED", valid: true, reasons: [expect.objectContaining({ message: "Double-sided gloss is checked by our team." })] });
  });

  it("schedules a new price from a date and keeps using the old one until then", async () => {
    const id = await productId("label-sticker");
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const added = await as(harness, staff).post(`/v1/admin/pricing/products/${id}/prices`, {
      effectiveFrom: tomorrow,
      currency: "NGN",
      basis: "PER_PACK",
      packSize: 100,
      baseMinor: "1600000",
      tiers: [],
      addOns: [],
      state: "PRICE_READY",
      includesVat: false,
      note: "New paper cost",
    });
    expect(added.status).toBe(201);
    expect(added.body.current).toBe(false);

    const today = priceResultSchema.parse((await price("label-sticker", { choices: { finish: "gloss" }, quantity: 100 })).body);
    expect(today.goodsMinor).toBe("1500000");
    harness.now.value = new Date(Date.now() + 2 * 86_400_000);
    try {
      const later = priceResultSchema.parse((await price("label-sticker", { choices: { finish: "gloss" }, quantity: 100 })).body);
      expect(later.goodsMinor).toBe("1600000");
      expect(later.ruleVersions.priceRuleId).toBe(added.body.id);
    } finally {
      harness.now.value = null;
    }

    const list = adminPriceRuleListSchema.parse((await as(harness, staff).get(`/v1/admin/pricing/products/${id}/prices`)).body);
    expect(list.entries.map((entry) => entry.current)).toEqual([false, true]);

    const past = await as(harness, staff).post(`/v1/admin/pricing/products/${id}/prices`, { ...added.body, effectiveFrom: "2020-01-01T00:00:00Z", note: null });
    expect(past.status).toBe(400);
    expect(past.body.fieldErrors.effectiveFrom).toContain("past prices");
  });

  it("never lets price history be edited", async () => {
    await expect(harness.database.db.execute(sql`update price_rules set base_minor = 1`)).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringContaining("insert-only") }) });
    await expect(harness.database.db.execute(sql`delete from tax_settings`)).rejects.toBeTruthy();
  });

  it("schedules a VAT change", async () => {
    const nextMonth = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const saved = adminTaxSettingListSchema.parse((await as(harness, staff).post("/v1/admin/pricing/vat", { effectiveFrom: nextMonth, vatRateBps: 1_000, vatOnDelivery: true, note: "Test change" })).body);
    expect(saved.entries[0]).toMatchObject({ vatRateBps: 1_000, current: false });
    harness.now.value = new Date(Date.now() + 31 * 86_400_000);
    try {
      const result = priceResultSchema.parse((await price("standard-mug", { choices: { colour: "white" }, quantity: 12 })).body);
      // 12 × ₦4,500 = ₦54,000; VAT 10% = ₦5,400.
      expect(result).toMatchObject({ vatRateBps: 1_000, vatMinor: "540000", totalMinor: "5940000" });
    } finally {
      harness.now.value = null;
    }
  });

  it("audits every change", async () => {
    const actions = (await harness.database.db.select({ action: schema.auditLog.action }).from(schema.auditLog)).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["pricing.product_rules_changed", "pricing.compatibility_changed", "pricing.price_rule_added", "pricing.vat_changed"]));
  });

  it("is 403 for staff without PRICING_MANAGE and 404 for customers", async () => {
    const id = await productId("standard-mug");
    const tunde = await harness.signInAs("adminTunde");
    expect((await as(harness, tunde).get(`/v1/admin/pricing/products/${id}/rules`)).status).toBe(403);
    expect((await as(harness, tunde).get("/v1/admin/pricing/vat")).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get(`/v1/admin/pricing/products/${id}/prices`));
    expectHidden(await as(harness, actors.customerChidi!).post("/v1/admin/pricing/vat", {}));
  });
}, 180_000);
