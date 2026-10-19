import { adminPriceRuleListSchema, adminProductRulesSchema, configurationSchema, orderSchema, pricingProductListSchema, priceResultSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectForbidden, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { orderFlows } from "../testing/flows.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T13-01: rules and prices (OPS-FR-010–019, 130; Pen 107). Done when: a rule
 * change doesn't alter an accepted order.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
const flows = orderFlows(
  () => harness,
  () => gateway,
);
const staff = () => as(harness, actors.adminAda!);
const cardsId = async () => (await harness.database.db.select().from(schema.products).where(eq(schema.products.slug, "business-cards")))[0]!.id;
const price = async (quantity: number) => priceResultSchema.parse((await request(harness.url).post("/v1/catalogue/products/business-cards/price").set("origin", TEST_WEB_ORIGIN).send({ choices: { paper: "350gsm-matte", sides: "both-sides" }, quantity })).body);

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await harness.database.db.update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["adminAda", "financeFolake", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("rule changes (OPS-FR-130)", () => {
  it("new prices, rules and VAT never change an accepted order or quote; new prices apply to new calculations", async () => {
    const { b, orderId } = await flows.paidOrder();
    const quoted = await flows.acceptedQuote(flows.staff(actors.adminAda!));
    const before = orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body);
    const quoteBefore = orderSchema.parse((await quoted.guest.get(`/v1/orders/${quoted.orderId}`)).body);
    const priceBefore = await price(250);

    // Staff double the price from now, raise the minimum, require proofs and change VAT.
    const id = await cardsId();
    const prices = adminPriceRuleListSchema.parse((await staff().get(`/v1/admin/pricing/products/${id}/prices`)).body);
    const current = prices.entries.find((entry) => entry.current)!;
    const doubled = await staff().post(`/v1/admin/pricing/products/${id}/prices`, {
      effectiveFrom: new Date().toISOString(),
      currency: current.currency,
      basis: current.basis,
      packSize: current.packSize,
      baseMinor: (BigInt(current.baseMinor) * 2n).toString(),
      tiers: current.tiers.map((tier) => ({ minQuantity: tier.minQuantity, amountMinor: (BigInt(tier.amountMinor) * 2n).toString() })),
      addOns: current.addOns,
      state: current.state,
      includesVat: current.includesVat,
      note: "Doubled for the T13-01 test",
    });
    expect(doubled.status).toBe(201);
    const rules = adminProductRulesSchema.parse((await staff().get(`/v1/admin/pricing/products/${id}/rules`)).body);
    expect((await staff().put(`/v1/admin/pricing/products/${id}/rules`, { rules: { ...rules.rules!, moq: 1000, belowMoq: "BLOCK", proof: "REQUIRED" }, version: rules.version })).status).toBe(200);
    expect((await staff().post("/v1/admin/pricing/vat", { effectiveFrom: new Date().toISOString(), vatRateBps: 1000, vatOnDelivery: true, note: "Test" })).status).toBe(201);

    // The paid order and the accepted quote's order are exactly as they were.
    expect(orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body)).toEqual(before);
    expect(orderSchema.parse((await quoted.guest.get(`/v1/orders/${quoted.orderId}`)).body)).toEqual(quoteBefore);
    // New calculations follow the new rules: 250 is now below the minimum.
    const after = await price(250);
    expect(after.valid).toBe(false);
    expect(after.reasons.some((reason) => reason.blocking)).toBe(true);
    const thousand = await price(1000);
    expect(thousand.vatRateBps).toBe(1000);
    expect(priceBefore.vatRateBps).not.toBe(1000);
  });
});

describe("the Rules & prices section (Pen 107)", () => {
  it("lists every product with its price now; the rules carry the product and its options; PRICING_MANAGE only", async () => {
    const list = pricingProductListSchema.parse((await staff().get("/v1/admin/pricing/products")).body);
    const cards = list.products.find((product) => product.slug === "business-cards")!;
    expect(cards).toMatchObject({ hasRules: true, price: { currency: "NGN" } });
    const rules = adminProductRulesSchema.parse((await staff().get(`/v1/admin/pricing/products/${cards.id}/rules`)).body);
    expect(rules.product).toMatchObject({ name: cards.name, slug: "business-cards", buyingMode: cards.buyingMode });
    expect(rules.options.find((option) => option.key === "paper")?.values.length).toBeGreaterThan(0);
    expectForbidden(await as(harness, actors.financeFolake!).get("/v1/admin/pricing/products"), "PRICING_MANAGE");
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/pricing/products"));
  });
});
