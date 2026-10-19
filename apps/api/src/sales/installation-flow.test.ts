import { cartSchema, configurationSchema, deliveryZoneSchema, installationSetupSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectForbidden, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T13-01c: installation and international freight (OPS-FR-101–102; Pen 119).
 * Done when: installation products follow the rules in checkout and quotes.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
const staff = () => as(harness, actors.adminAda!);

function browser() {
  let cookie = "";
  const keep = (response: request.Response) => {
    const set = (response.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    if (set.length) cookie = set.map((line) => line.split(";")[0]).join("; ");
    return response;
  };
  return {
    get: async (path: string) => keep(await request(harness.url).get(path).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie)),
    post: async (path: string, body: object = {}) => keep(await request(harness.url).post(path).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).send(body)),
    patch: async (path: string, body: object) => keep(await request(harness.url).patch(path).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).send(body)),
  };
}
const draftOf = (body: { draft?: unknown }) => configurationSchema.parse(body.draft ?? body);

/** A roll-up banner design with installation answers. */
async function banner(details: Record<string, unknown>, quantity = 2) {
  const b = browser();
  let draft = draftOf((await b.post("/v1/configurations", { productSlug: "roll-up-banner", choices: { size: "85-200-cm" }, quantity })).body);
  draft = draftOf((await b.patch(`/v1/configurations/${draft.id}`, { version: draft.version, details: { service: "INSTALLATION", installSite: "Eko Hotel, Victoria Island", installDate: "2027-03-15", ...details } })).body);
  return { b, draft };
}

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["adminAda", "financeFolake", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("installation (OPS-FR-102)", () => {
  it("installation products follow the rules in checkout and quotes", async () => {
    // Staff: Lagos installs roll-up banners at ₦15,000 a piece; the seeded rules (6 m² survey, 5 days' notice) are on.
    const [rollUp] = await harness.database.db.select().from(schema.products).where(eq(schema.products.slug, "roll-up-banner"));
    let setup = installationSetupSchema.parse((await staff().get("/v1/admin/installation")).body);
    expect(setup.rules).toMatchObject({ surveyAboveSqM: 6, noticeWorkingDays: 5 });
    expect(setup.installable.map((product) => product.id)).toContain(rollUp!.id);
    setup = installationSetupSchema.parse((await staff().post("/v1/admin/installation/areas", { name: "Lagos", states: ["Lagos"], productIds: [rollUp!.id], pricing: "FIXED", rateMinor: "1500000", travelMinor: null, version: 0 })).body);
    expect(setup.areas[0]).toMatchObject({ name: "Lagos", products: [{ id: rollUp!.id, name: "Roll-Up Banner" }], pricing: "FIXED", rateMinor: "1500000" });

    // Checkout: in Lagos the installation is priced (two pieces) and the design goes to the cart ready to pay.
    const lagos = await banner({ installState: "Lagos" });
    expect(lagos.draft.price).toMatchObject({ state: "PRICE_READY", valid: true });
    expect(lagos.draft.price!.lines).toContainEqual({ label: "Installation (Lagos)", amountMinor: "3000000" });
    expect((await lagos.b.post("/v1/cart/items", { configurationId: lagos.draft.id })).status).toBe(200);
    const cart = cartSchema.parse((await lagos.b.get("/v1/cart")).body);
    expect(cart.items.find((item) => item.configurationId === lagos.draft.id)?.group).toBe("READY");

    // Quotes: outside the areas it's quoted, with the reason, and the quote request goes through.
    const kano = await banner({ installState: "Kano" });
    expect(kano.draft.price!.state).toBe("QUOTE_REQUIRED");
    expect(kano.draft.price!.reasons.map((reason) => reason.message)).toContain("We don't install roll-up banner in Kano at a set price yet. We'll quote it after checking the site.");
    const requested = await kano.b.post(`/v1/configurations/${kano.draft.id}/quote-request`, { email: "install.quote@example.com", name: "Install Tester (TEST DATA)" });
    expect(requested.status).toBe(200);

    // A graphic over the survey size is quoted; a date inside the notice period can't be booked.
    const big = await banner({ installState: "Lagos", sizeMode: "CUSTOM", widthCm: 400, heightCm: 200 }, 1);
    expect(big.draft.price!.reasons.map((reason) => reason.message)).toContain("Over 6 m², we survey the site first and then send a quote.");
    const soon = await banner({ installState: "Lagos", installDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) });
    expect(soon.draft.price!.valid).toBe(false);
    expect((await soon.b.post("/v1/cart/items", { configurationId: soon.draft.id })).status).toBe(422);

    // Turning the notice rule off lets that date through on the customer's next change.
    const rules = installationSetupSchema.parse((await staff().get("/v1/admin/installation")).body).rules;
    expect((await staff().put("/v1/admin/installation/rules", { surveyAboveSqM: 6, noticeWorkingDays: null, version: rules.version })).status).toBe(200);
    const resaved = draftOf((await soon.b.patch(`/v1/configurations/${soon.draft.id}`, { version: soon.draft.version, details: { installSite: "Eko Hotel, main hall" } })).body);
    expect(resaved.price!.valid).toBe(true);
  });

  it("a state is in one area; PRICING_MANAGE only", async () => {
    await staff().post("/v1/admin/installation/areas", { name: "Abuja FCT", states: ["FCT"], productIds: [], pricing: "FIXED_PLUS_TRAVEL", rateMinor: "2000000", travelMinor: "5000000", version: 0 });
    const twice = await staff().post("/v1/admin/installation/areas", { name: "North", states: ["FCT", "Kano"], productIds: [], pricing: "QUOTE", rateMinor: null, travelMinor: null, version: 0 });
    expect(twice.body.fieldErrors).toEqual({ states: "FCT is already in Abuja FCT. Remove it from one area." });
    expect((await staff().post("/v1/admin/installation/areas", { name: "Travel", states: ["Oyo"], productIds: [], pricing: "FIXED_PLUS_TRAVEL", rateMinor: "100", travelMinor: null, version: 0 })).body.fieldErrors).toEqual({ travelMinor: "Enter the travel fee" });
    expectForbidden(await as(harness, actors.financeFolake!).get("/v1/admin/installation"), "PRICING_MANAGE");
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/installation"));
  });
});

describe("international freight (OPS-FR-101)", () => {
  it("a group of countries gets its own calculated rate or staff quote; a country is in one group", async () => {
    const created = await staff().post("/v1/admin/delivery-zones/countries", { name: "Ghana, Togo, Benin", countries: ["gh", "TG", "BJ"], pricing: "FIXED", rateMinor: "4500000", transitMinDays: 5, transitMaxDays: 10 });
    expect(created.status).toBe(201);
    const zone = deliveryZoneSchema.parse(created.body);
    expect(zone).toMatchObject({ kind: "COUNTRIES", countries: ["GH", "TG", "BJ"], pricing: "FIXED", rateMinor: "4500000" });
    const again = await staff().post("/v1/admin/delivery-zones/countries", { name: "West Africa", countries: ["GH"], pricing: "QUOTE", rateMinor: null, transitMinDays: null, transitMaxDays: null });
    expect(again.body.fieldErrors).toEqual({ countries: "GH is already in Ghana, Togo, Benin. Remove it from one group." });
    expect((await staff().post("/v1/admin/delivery-zones/countries", { name: "Home", countries: ["NG"], pricing: "QUOTE", rateMinor: null, transitMinDays: null, transitMaxDays: null })).status).toBe(400);
    const changed = deliveryZoneSchema.parse((await staff().put(`/v1/admin/delivery-zones/countries/${zone.id}`, { name: "Ghana and Togo", countries: ["GH", "TG"], pricing: "QUOTE", rateMinor: null, transitMinDays: null, transitMaxDays: null, version: zone.version })).body);
    expect(changed).toMatchObject({ name: "Ghana and Togo", countries: ["GH", "TG"], pricing: "QUOTE", rateMinor: null });
    expect((await staff().delete(`/v1/admin/delivery-zones/${zone.id}`)).status).toBe(204);
  });
});
