import { checkoutSchema, configurationSchema, courierSettingsSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectForbidden, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { FakeCourier, parcelFor } from "./courier.js";

/*
 * T08-05 (owner, 2026-10-05): addresses outside the fixed delivery zones get a
 * live courier price from Shipbubble; anything that stops it falls back to
 * staff pricing (#80). Written before the code, against a fake courier.
 */

vi.setConfig({ testTimeout: 180_000 });

let harness: Harness;
let actors: Partial<Actors>;
let staff: string;
const courier = new FakeCourier();

function browser() {
  let cookie = "";
  const send = (req: request.Test) => {
    req.set("origin", TEST_WEB_ORIGIN);
    if (cookie) req.set("cookie", cookie);
    return req.then((response) => {
      const set = ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((line) => line.split(";")[0]).find((line) => line?.startsWith("hp.device="));
      cookie = set ?? cookie;
      return response;
    });
  };
  return {
    post: (path: string, body: object = {}) => send(request(harness.url).post(path).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body)),
    patch: (path: string, body: object) => send(request(harness.url).patch(path).send(body)),
    put: (path: string, body: object) => send(request(harness.url).put(path).send(body)),
    get: (path: string) => send(request(harness.url).get(path)),
  };
}

const contact = { name: "Courier Tester (TEST DATA)", email: "courier.test@example.com", phone: "0800 000 0000" };
const kano = { country: "NG", name: contact.name, phone: contact.phone, street: "4 Bompai Road", area: "Nassarawa", state: "Kano", landmark: "" };
const lekki = { country: "NG", name: contact.name, phone: contact.phone, street: "12 Admiralty Way", area: "Eti-Osa", state: "Lagos", landmark: "" };

/** Business cards (250) through to the delivery step at `address`. */
async function checkoutTo(address: object) {
  const b = browser();
  const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
  const cards = configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body.draft);
  await b.post("/v1/cart/items", { configurationId: cards.id });
  let checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/contact`, { ...contact, version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/address`, { ...address, version: checkout.version })).body);
  return { b, checkout };
}

const settingsBody = (version: number, enabled = true, rule: "CHEAPEST" | "FASTEST" = "CHEAPEST") => ({
  enabled,
  rule,
  categoryId: 98246239,
  pickup: { name: "HolyPearls Workshop (TEST DATA)", email: "dispatch@holypearls.test", phone: "08000000000", address: "1 Workshop Close, Ikeja, Lagos, Nigeria" },
  version,
});

async function saveSettings(enabled = true, rule: "CHEAPEST" | "FASTEST" = "CHEAPEST") {
  const current = courierSettingsSchema.parse((await as(harness, staff).get("/v1/admin/courier-settings")).body);
  const saved = await request(harness.url).put("/v1/admin/courier-settings").set("origin", TEST_WEB_ORIGIN).set("cookie", staff).send(settingsBody(current.version, enabled, rule));
  expect(saved.status).toBe(200);
  return courierSettingsSchema.parse(saved.body);
}

beforeAll(async () => {
  harness = await createHarness({ courier });
  actors = await signInActors(harness, ["customerChidi", "catalogueNoMfa"]);
  staff = await harness.signInAs("adminAda");
});

afterAll(async () => {
  await harness?.close();
});

describe("the parcel sent for a courier price", () => {
  it("adds up the weight and stacks the packages", () => {
    const parcel = parcelFor([
      { name: "Business Cards", quantity: 250, unitMinor: 15_000n, weightGrams: 2, packageCm: { length: 10, width: 7, height: 4 }, unitsPerPackage: 100 },
      { name: "Standard Mug", quantity: 3, unitMinor: 450_000n, weightGrams: 450, packageCm: { length: 15, width: 12, height: 12 }, unitsPerPackage: 1 },
    ]);
    expect(parcel.items).toEqual([
      { name: "Business Cards", description: "Business Cards × 250", unitWeightKg: 0.002, unitAmountNaira: 150, quantity: 250 },
      { name: "Standard Mug", description: "Standard Mug × 3", unitWeightKg: 0.45, unitAmountNaira: 4500, quantity: 3 },
    ]);
    // Three card boxes and three mug boxes on the largest footprint.
    expect(parcel.dimensionCm).toEqual({ length: 15, width: 12, height: 3 * 4 + 3 * 12 });
    expect(parcel.weightKg).toBeCloseTo(0.5 + 1.35, 5);
  });
});

describe("courier prices outside the zones (owner, 2026-10-05)", () => {
  it("prices a Kano address with the cheapest courier that collects, and the customer can pay", async () => {
    await saveSettings(true, "CHEAPEST");
    courier.reset();
    const { b, checkout } = await checkoutTo(kano);
    expect(courier.rateCalls).toHaveLength(1);
    expect(checkout.delivery).toMatchObject({ zoneName: "Other Nigerian states", source: "COURIER", courierName: "Cheap Collect", rateMinor: "450000" });
    let row = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/delivery`, { option: "STANDARD", version: checkout.version })).body);
    row = checkoutSchema.parse((await b.put(`/v1/checkouts/${row.id}/billing`, { sameAsDelivery: true, version: row.version })).body);
    expect(row.blockers.map((blocker) => blocker.code)).not.toContain("DELIVERY_QUOTE_REQUIRED");
    expect(row.totals.deliveryMinor).toBe("450000");
    // Delivery no longer holds payment (payments themselves are off in this test API).
    const pay = await b.post(`/v1/checkouts/${row.id}/payments`);
    expect(JSON.stringify(pay.body)).not.toContain("DELIVERY_QUOTE_REQUIRED");
    // The rate reference is kept for booking later (T08-06), never sent to the browser.
    const [saved] = await harness.database.db.select().from(schema.checkouts).where(eq(schema.checkouts.id, row.id));
    expect((saved!.delivery as { courier?: { requestToken?: string } }).courier?.requestToken).toBe(courier.lastToken);
    expect(JSON.stringify(row)).not.toContain(courier.lastToken!);
  });

  it("uses the fastest courier when staff choose it", async () => {
    await saveSettings(true, "FASTEST");
    const { checkout } = await checkoutTo(kano);
    expect(checkout.delivery).toMatchObject({ source: "COURIER", courierName: "Quick Collect", rateMinor: "800000" });
    await saveSettings(true, "CHEAPEST");
  });

  it("falls back to staff pricing when the courier fails, and says why to staff", async () => {
    await saveSettings();
    courier.failNext("Courier network unavailable");
    const { checkout } = await checkoutTo(kano);
    expect(checkout.delivery).toMatchObject({ source: "STAFF", rateMinor: null });
    const [saved] = await harness.database.db.select().from(schema.checkouts).where(eq(schema.checkouts.id, checkout.id));
    expect((saved!.delivery as { courierProblem?: string }).courierProblem).toContain("unavailable");
  });

  it("falls back without asking the courier when a product has no shipping weight", async () => {
    await saveSettings();
    const [cards] = await harness.database.db.select().from(schema.products).where(eq(schema.products.slug, "business-cards"));
    await harness.database.db.update(schema.products).set({ shippingWeightGrams: null }).where(eq(schema.products.id, cards!.id));
    try {
      courier.reset();
      const { checkout } = await checkoutTo(kano);
      expect(courier.rateCalls).toHaveLength(0);
      expect(checkout.delivery).toMatchObject({ source: "STAFF", rateMinor: null });
    } finally {
      await harness.database.db.update(schema.products).set({ shippingWeightGrams: cards!.shippingWeightGrams }).where(eq(schema.products.id, cards!.id));
    }
  });

  it("never asks the courier for a zone address, abroad, or when courier prices are off", async () => {
    await saveSettings();
    courier.reset();
    const lagos = await checkoutTo(lekki);
    expect(lagos.checkout.delivery).toMatchObject({ zoneName: "Lagos Island", source: "ZONE", rateMinor: "650000" });
    const accra = await checkoutTo({ ...kano, country: "GH", state: "Greater Accra", area: "Accra", phone: "+233 20 000 0000" });
    expect(accra.checkout.delivery).toMatchObject({ source: "STAFF", rateMinor: null });
    await saveSettings(false);
    const off = await checkoutTo(kano);
    expect(off.checkout.delivery).toMatchObject({ source: "STAFF", rateMinor: null });
    expect(courier.rateCalls).toHaveLength(0);
    await saveSettings(true);
  });
});

describe("courier settings (PRICING_MANAGE)", () => {
  it("checks the pickup address with the courier and keeps its code", async () => {
    const saved = await saveSettings();
    expect(saved.pickup?.addressCode).toBe(courier.pickupCode);
    expect(saved).toMatchObject({ enabled: true, rule: "CHEAPEST", categoryId: 98246239, available: true });
  });

  it("refuses an address the courier can't find, and anyone without PRICING_MANAGE", async () => {
    const current = courierSettingsSchema.parse((await as(harness, staff).get("/v1/admin/courier-settings")).body);
    courier.failNext("Address not found");
    const moved = settingsBody(current.version);
    moved.pickup.address = "2 Nowhere Lane, Ikeja, Lagos, Nigeria";
    const refused = await request(harness.url).put("/v1/admin/courier-settings").set("origin", TEST_WEB_ORIGIN).set("cookie", staff).send(moved);
    expect(refused.status).toBe(400);
    expect(refused.body.fieldErrors["pickup.address"]).toContain("Address not found");
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/courier-settings"));
    expectForbidden(await as(harness, actors.catalogueNoMfa!).get("/v1/admin/courier-settings"));
  });
});
