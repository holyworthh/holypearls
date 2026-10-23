import { adminQuoteSchema, cartSchema, checkoutSchema, configurationSchema, deliveryPriceQueueSchema, deliveryZoneListSchema } from "@holypearls/contracts";
import { and, eq, schema } from "@holypearls/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectForbidden, expectHidden, expectNoIdentity, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T04-01 Done when: quote items can't be checked out; the checkout snapshot is
 * unchanged when a catalogue price changes; a total sent by the browser is
 * ignored; the VAT line is correct; a double submit makes one checkout. Plus
 * the TECH-03 §17 negative tests for carts, checkouts and the zones admin.
 */

// Each checkout test walks several steps; against a remote test database that takes a while.
vi.setConfig({ testTimeout: 180_000 });

let harness: Harness;
let actors: Partial<Actors>;
let staff: string;

const deviceCookie = (response: request.Response) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((cookie) => cookie.split(";")[0]).find((cookie) => cookie.startsWith("hp.device="));

/** An anonymous browser that keeps its device cookie. */
function browser(initial = "") {
  let cookie = initial;
  const send = (req: request.Test) => {
    req.set("origin", TEST_WEB_ORIGIN);
    if (cookie) req.set("cookie", cookie);
    return req.then((response) => {
      cookie = deviceCookie(response) ?? cookie;
      return response;
    });
  };
  return {
    post: (path: string, body: object = {}, key = `test_${randomUUID().replaceAll("-", "")}`) => send(request(harness.url).post(path).set("idempotency-key", key).send(body)),
    patch: (path: string, body: object) => send(request(harness.url).patch(path).send(body)),
    put: (path: string, body: object) => send(request(harness.url).put(path).send(body)),
    delete: (path: string) => send(request(harness.url).delete(path)),
    get: (path: string) => send(request(harness.url).get(path)),
    cookie: () => cookie,
  };
}
type Browser = ReturnType<typeof browser>;

async function cardsDraft(b: Browser, quantity = 250) {
  const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
  return configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity })).body.draft);
}

async function poloDraft(b: Browser) {
  const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } })).body);
  return configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 50 })).body.draft);
}

const contact = { name: "Adaeze Okafor", email: "adaeze@example.com", phone: "0800 000 0000" };
const lekki = { country: "NG", name: "Adaeze Okafor", phone: "0800 000 0000", street: "12 Admiralty Way", area: "Eti-Osa", state: "Lagos", landmark: "Opposite the filling station" };

/** Cart with one ready and one quote item, then a checkout through billing. */
async function readyCheckout(b: Browser) {
  const cards = await cardsDraft(b);
  const polo = await poloDraft(b);
  await b.post("/v1/cart/items", { configurationId: cards.id });
  await b.post("/v1/cart/items", { configurationId: polo.id });
  let checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/contact`, { ...contact, version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/address`, { ...lekki, version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/delivery`, { option: "STANDARD", version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: checkout.version })).body);
  return { cards, polo, checkout };
}

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["customerChidi", "customerAmaka", "adminTunde", "catalogueNoMfa"]);
  staff = await harness.signInAs("adminAda");
});

afterAll(async () => {
  await harness?.close();
});

describe("cart groups (COM-FR-080–081, Pen 41)", () => {
  it("keeps ready and quote items apart, and totals only the ready ones", async () => {
    const b = browser();
    const cards = await cardsDraft(b);
    const polo = await poloDraft(b);
    await b.post("/v1/cart/items", { configurationId: cards.id });
    const cart = cartSchema.parse((await b.post("/v1/cart/items", { configurationId: polo.id })).body);

    expect(cart.items.map((item) => [item.productName, item.group])).toEqual([
      ["Business Cards", "READY"],
      ["Polo Shirt", "QUOTE"],
    ]);
    expect(cart.items[0]).toMatchObject({ quantity: 250, totalMinor: "3750000", summary: expect.stringContaining("350") });
    expect(cart.ready).toEqual({ goodsMinor: "3750000", vatMinor: "281250", totalMinor: "4031250", vatRateBps: 750 });
    expect(cart.quoteEstimateMinor).not.toBeNull();

    const draft = configurationSchema.parse((await b.get(`/v1/configurations/${cards.id}`)).body);
    expect(draft.status).toBe("IN_CART");
  });

  it("keeps the saved copy of the design and refreshes it when the design is edited", async () => {
    const b = browser();
    const cards = await cardsDraft(b);
    const [item] = cartSchema.parse((await b.post("/v1/cart/items", { configurationId: cards.id })).body).items;
    const [row] = await harness.database.db.select().from(schema.cartItems).where(eq(schema.cartItems.id, item!.id));
    expect(row!.snapshot).toMatchObject({ choices: { paper: "350gsm-matte", sides: "both-sides" }, price: { totalMinor: "4031250", ruleVersions: expect.any(Object) } });

    // "Edit" goes back to the configurator; the design is still editable in the cart.
    const current = configurationSchema.parse((await b.get(`/v1/configurations/${cards.id}`)).body);
    const edited = await b.patch(`/v1/configurations/${cards.id}`, { version: current.version, quantity: 500 });
    expect(edited.status).toBe(200);
    const cart = cartSchema.parse((await b.get("/v1/cart")).body);
    expect(cart.items[0]).toMatchObject({ quantity: 500, editHref: `/products/business-cards?draft=${cards.id}` });
  });

  it("removes an item, or saves it for later as a draft, and can put it back", async () => {
    const b = browser();
    const cards = await cardsDraft(b);
    const [item] = cartSchema.parse((await b.post("/v1/cart/items", { configurationId: cards.id })).body).items;

    let cart = cartSchema.parse((await b.post(`/v1/cart/items/${item!.id}/save-for-later`)).body);
    expect(cart.items).toEqual([]);
    expect(cart.savedForLater).toEqual([expect.objectContaining({ configurationId: cards.id, productName: "Business Cards" })]);
    expect(configurationSchema.parse((await b.get(`/v1/configurations/${cards.id}`)).body).status).toBe("DRAFT");

    cart = cartSchema.parse((await b.post("/v1/cart/items", { configurationId: cards.id })).body);
    expect(cart.savedForLater).toEqual([]);
    expect(cart.items).toHaveLength(1);

    cart = cartSchema.parse((await b.delete(`/v1/cart/items/${cart.items[0]!.id}`)).body);
    expect(cart.items).toEqual([]);
    expect(cart.savedForLater).toEqual([]);
  });

  it("refuses a design without a quantity, and one that already has a quote request", async () => {
    const b = browser();
    const bare = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte" } })).body);
    expect((await b.post("/v1/cart/items", { configurationId: bare.id })).status).toBe(400);

    const polo = await poloDraft(b);
    await b.post(`/v1/configurations/${polo.id}/quote-request`, { email: "q@example.com", name: "Q" });
    expect((await b.post("/v1/cart/items", { configurationId: polo.id })).status).toBe(409);
  });

  it("sends the quote items as quote requests and keeps the ready items (Submit quote items)", async () => {
    const b = browser();
    const cards = await cardsDraft(b);
    const polo = await poloDraft(b);
    await b.post("/v1/cart/items", { configurationId: cards.id });
    await b.post("/v1/cart/items", { configurationId: polo.id });
    const sent = await b.post("/v1/cart/quote-request", { email: "buyer@example.com", name: "Buyer" });
    expect(sent.status).toBe(200);
    expect(sent.body.references).toHaveLength(1);
    const cart = cartSchema.parse((await b.get("/v1/cart")).body);
    expect(cart.items.map((item) => item.group)).toEqual(["READY"]);
    expect(configurationSchema.parse((await b.get(`/v1/configurations/${polo.id}`)).body).status).toBe("QUOTE_REQUESTED");
  });

  it("sends several quote items as ONE quote request with one reference and one email (owner, 2026-10-05)", async () => {
    const b = browser();
    const first = await poloDraft(b);
    const second = await poloDraft(b);
    await b.post("/v1/cart/items", { configurationId: first.id });
    await b.post("/v1/cart/items", { configurationId: second.id });
    const sent = await b.post("/v1/cart/quote-request", { email: "two.items@example.com", name: "Two Items (TEST DATA)" });
    expect(sent.status).toBe(200);
    expect(sent.body.references).toHaveLength(1);
    const reference = sent.body.references[0] as string;
    for (const design of [first, second]) {
      const view = configurationSchema.parse((await b.get(`/v1/configurations/${design.id}`)).body);
      expect(view.status).toBe("QUOTE_REQUESTED");
      expect(view.quote?.reference).toBe(reference);
    }
    const quotes = await harness.database.db.select().from(schema.quotes).where(eq(schema.quotes.reference, reference));
    expect(quotes).toHaveLength(1);
    expect([...quotes[0]!.configurationIds].sort()).toEqual([first.id, second.id].sort());
    const emails = await harness.database.db.select().from(schema.notifications).where(eq(schema.notifications.recordLabel, `Quote request ${reference}`));
    expect(emails).toHaveLength(1);
    // Staff can build one line from each design.
    const admin = adminQuoteSchema.parse((await as(harness, staff).get(`/v1/admin/quotes/${quotes[0]!.id}`)).body);
    expect(admin.candidates.map((candidate) => candidate.sourceKey).sort()).toEqual([first.id, second.id].sort());
    expect(admin.candidates.every((candidate) => candidate.source === "CONFIGURATION" && candidate.quantity === 50)).toBe(true);
  });

  it("brings the browser's cart into the account on sign-in", async () => {
    const b = browser();
    const cards = await cardsDraft(b);
    await b.post("/v1/cart/items", { configurationId: cards.id });
    const signedIn = await request(harness.url).get("/v1/cart").set("origin", TEST_WEB_ORIGIN).set("cookie", `${actors.customerAmaka!}; ${b.cookie()}`);
    expect(cartSchema.parse(signedIn.body).items.map((item) => item.configurationId)).toContain(cards.id);
    // Now the account's: the same account on another device sees it.
    expect(cartSchema.parse((await as(harness, actors.customerAmaka!).get("/v1/cart")).body).items.map((item) => item.configurationId)).toContain(cards.id);
  });
});

describe("checkout (COM-FR-083–084, TECH-05 §1)", () => {
  it("charges only the ready items; quote items stay in the cart", async () => {
    const b = browser();
    const { checkout } = await readyCheckout(b);
    expect(checkout.items.map((item) => item.productName)).toEqual(["Business Cards"]);
    expect(checkout.quoteItemsLeftInCart).toBe(true);
  });

  it("works out VAT and delivery on the server: Lagos Island, VAT on delivery", async () => {
    const b = browser();
    const { checkout } = await readyCheckout(b);
    expect(checkout.delivery).toMatchObject({ zoneName: "Lagos Island", pricing: "FIXED", rateMinor: "650000", transitDays: { min: 1, max: 2 }, chosen: true });
    // ₦37,500 cards + ₦6,500 delivery; VAT 7.5% on both = ₦3,300; total ₦47,300.
    expect(checkout.totals).toEqual({ goodsMinor: "3750000", deliveryMinor: "650000", vatMinor: "330000", totalMinor: "4730000", vatRateBps: 750 });
    expect(checkout.step).toBe("review");
    expect(checkout.productionDays).toEqual({ min: 2, max: 5 });
  });

  it("ignores any amount the browser sends", async () => {
    const b = browser();
    const { checkout } = await readyCheckout(b);
    const tampered = await b.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: checkout.version, totalMinor: "100", vatMinor: "0" });
    expect(tampered.status).toBe(200);
    expect(checkoutSchema.parse(tampered.body).totals.totalMinor).toBe("4730000");
    const [row] = await harness.database.db.select().from(schema.checkouts).where(eq(schema.checkouts.id, checkout.id));
    expect(row!.totalMinor).toBe(4_730_000n);
  });

  it("keeps the checkout's prices when a catalogue price changes", async () => {
    const b = browser();
    const { checkout } = await readyCheckout(b);
    const db = harness.database.db;
    const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, "business-cards"));
    const [rule] = await db.select().from(schema.priceRules).where(eq(schema.priceRules.productId, product!.id));
    const copy: Omit<typeof rule & object, "id" | "createdAt"> & { id?: string; createdAt?: Date } = { ...rule! };
    delete copy.id;
    delete copy.createdAt;
    const [doubled] = await db.insert(schema.priceRules).values({ ...copy, effectiveFrom: new Date(Date.now() - 1000), baseMinor: rule!.baseMinor * 2n, tiers: [] }).returning();
    try {
      const after = checkoutSchema.parse((await b.get(`/v1/checkouts/${checkout.id}`)).body);
      expect(after.totals).toEqual(checkout.totals);
      expect(after.items).toEqual(checkout.items);
      // Checking out again with the same items keeps the open checkout too.
      expect(checkoutSchema.parse((await b.post("/v1/checkouts")).body).id).toBe(checkout.id);
    } finally {
      // Prices are insert-only: a newer rule puts the old price back for the other tests.
      await db.insert(schema.priceRules).values({ ...copy, effectiveFrom: new Date(doubled!.effectiveFrom.getTime() + 500) });
    }
  });

  it("a double submit makes one checkout", async () => {
    const b = browser();
    const cards = await cardsDraft(b);
    await b.post("/v1/cart/items", { configurationId: cards.id });
    const [first, second] = await Promise.all([b.post("/v1/checkouts"), b.post("/v1/checkouts")]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(first.body.id).toBe(second.body.id);
    // The same idempotency key replays the first answer.
    const key = `test_${randomUUID().replaceAll("-", "")}`;
    const [a, c] = [await b.post("/v1/checkouts", {}, key), await b.post("/v1/checkouts", {}, key)];
    expect(c.body.id).toBe(a.body.id);
    const open = await harness.database.db.select().from(schema.checkouts).where(eq(schema.checkouts.id, first.body.id));
    expect(open).toHaveLength(1);
  });

  it("refuses to check out a cart with only quote items", async () => {
    const b = browser();
    const polo = await poloDraft(b);
    await b.post("/v1/cart/items", { configurationId: polo.id });
    const refused = await b.post("/v1/checkouts");
    expect(refused.status).toBe(422);
    expect(refused.body.context.reason).toBe("NOTHING_READY");
  });

  it("marks delivery as quote required outside the zones, and international freight by quote", async () => {
    const b = browser();
    const { checkout } = await readyCheckout(b);
    const kano = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/address`, { ...lekki, state: "Kano", area: "Nassarawa", version: checkout.version })).body);
    expect(kano.delivery).toMatchObject({ zoneName: "Other Nigerian states", pricing: "QUOTE", chosen: false });
    expect(kano.step).toBe("delivery");
    expect(kano.totals.deliveryMinor).toBeNull();

    const accra = checkoutSchema.parse(
      (await b.put(`/v1/checkouts/${checkout.id}/address`, { ...lekki, country: "GH", state: "Greater Accra", area: "Accra", phone: "+233 20 000 0000", version: kano.version })).body,
    );
    expect(accra.international).toBe(true);
    expect(accra.delivery).toMatchObject({ zoneName: "International", pricing: "QUOTE" });
    const chosen = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/delivery`, { option: "STANDARD", version: accra.version })).body);
    expect(chosen.blockers.map((blocker) => blocker.code)).toContain("DELIVERY_QUOTE_REQUIRED");
    expect(chosen.totals.totalMinor).toBe("4031250");
  });

  it("checks Nigerian phone numbers and LGAs, keeping the answers (Pen 45 A)", async () => {
    const b = browser();
    const { checkout } = await readyCheckout(b);
    const invalid = await b.put(`/v1/checkouts/${checkout.id}/address`, { ...lekki, phone: "+234 800 000", area: "Somewhere", version: checkout.version });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fieldErrors).toMatchObject({ phone: "Enter all 11 digits, e.g. 0800 000 0000", area: "Choose your area or LGA" });
  });

  it("closes the checkout when a design in it changes, so an old copy can't be paid for", async () => {
    const b = browser();
    const { cards, checkout } = await readyCheckout(b);
    const current = configurationSchema.parse((await b.get(`/v1/configurations/${cards.id}`)).body);
    await b.patch(`/v1/configurations/${cards.id}`, { version: current.version, quantity: 500 });
    expect(checkoutSchema.parse((await b.get(`/v1/checkouts/${checkout.id}`)).body).status).toBe("ABANDONED");
    expect((await b.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: checkout.version })).status).toBe(409);

    // Checking out again prices the new quantity and keeps the customer's answers.
    const fresh = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
    expect(fresh.id).not.toBe(checkout.id);
    expect(fresh.items[0]).toMatchObject({ quantity: 500 });
    expect(fresh.contact).toMatchObject({ email: contact.email });
    expect(fresh.step).toBe("delivery");
  });

  it("refuses a stale version", async () => {
    const b = browser();
    const { checkout } = await readyCheckout(b);
    const stale = await b.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: checkout.version - 1 });
    expect(stale.status).toBe(409);
  });
});

describe("carts and checkouts are private (TECH-03 §17)", () => {
  it("another browser or account can't see or change them", async () => {
    const b = browser();
    const { checkout } = await readyCheckout(b);
    const cart = cartSchema.parse((await b.get("/v1/cart")).body);
    const stranger = browser();
    expectHidden(await stranger.get(`/v1/checkouts/${checkout.id}`));
    expectNoIdentity(await stranger.put(`/v1/checkouts/${checkout.id}/contact`, { ...contact, version: checkout.version }));
    expectNoIdentity(await stranger.delete(`/v1/cart/items/${cart.items[0]!.id}`));
    expectHidden(await as(harness, actors.customerChidi!).get(`/v1/checkouts/${checkout.id}`));
    expectHidden(await as(harness, actors.customerChidi!).delete(`/v1/cart/items/${cart.items[0]!.id}`));
    // Someone else's design can't be put into your cart.
    const draft = await cardsDraft(browser());
    expectNoIdentity(await stranger.post("/v1/cart/items", { configurationId: draft.id }));
    expect(cartSchema.parse((await stranger.get("/v1/cart")).body).items).toEqual([]);
  });
});

describe("delivery priced by staff for addresses outside the zones (owner, 2026-10-05)", () => {
  const staffApi = () => as(harness, staff);
  const kanoCheckout = async (b: Browser) => {
    const { checkout } = await readyCheckout(b);
    let row = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/address`, { ...lekki, state: "Kano", area: "Nassarawa", version: checkout.version })).body);
    row = checkoutSchema.parse((await b.put(`/v1/checkouts/${row.id}/delivery`, { option: "STANDARD", version: row.version })).body);
    return checkoutSchema.parse((await b.put(`/v1/checkouts/${row.id}/billing`, { sameAsDelivery: true, version: row.version })).body);
  };
  const emails = (template: string, recordId: string) =>
    harness.database.db.select().from(schema.notifications).where(and(eq(schema.notifications.template, template), eq(schema.notifications.recordId, recordId)));

  it("holds payment, tells staff once, and lets them set the price; the customer is emailed and can pay", async () => {
    const b = browser();
    const held = await kanoCheckout(b);
    expect(held.blockers.map((blocker) => blocker.code)).toContain("DELIVERY_QUOTE_REQUIRED");
    expect((await b.post(`/v1/checkouts/${held.id}/payments`)).status).toBeGreaterThanOrEqual(400);
    expect(await emails("delivery_price_needed", held.id)).toHaveLength(1);

    const queue = deliveryPriceQueueSchema.parse((await staffApi().get("/v1/admin/delivery-prices")).body);
    const entry = queue.items.find((item) => item.checkoutId === held.id)!;
    expect(entry).toMatchObject({ place: expect.stringContaining("Kano"), zoneName: "Other Nigerian states" });

    const priced = await staffApi().post(`/v1/admin/delivery-prices/${held.id}`, { rateMinor: "900000", transitMinDays: 3, transitMaxDays: 5, version: entry.version });
    expect(priced.status).toBe(200);
    const view = checkoutSchema.parse((await b.get(`/v1/checkouts/${held.id}`)).body);
    expect(view.blockers.map((blocker) => blocker.code)).not.toContain("DELIVERY_QUOTE_REQUIRED");
    expect(view.totals.deliveryMinor).toBe("900000");
    expect(view.delivery).toMatchObject({ rateMinor: "900000", transitDays: { min: 3, max: 5 } });
    expect(await emails("delivery_price_ready", held.id)).toHaveLength(1);
    expect(deliveryPriceQueueSchema.parse((await staffApi().get("/v1/admin/delivery-prices")).body).items.map((item) => item.checkoutId)).not.toContain(held.id);

    // A new address means a new price.
    const moved = checkoutSchema.parse((await b.put(`/v1/checkouts/${held.id}/address`, { ...lekki, state: "Kano", area: "Fagge", version: view.version })).body);
    expect(moved.totals.deliveryMinor).toBeNull();
  });

  it("refuses a stale version, a fixed-rate checkout, and anyone without PRICING_MANAGE", async () => {
    const b = browser();
    const held = await kanoCheckout(b);
    expect((await staffApi().post(`/v1/admin/delivery-prices/${held.id}`, { rateMinor: "900000", transitMinDays: 3, transitMaxDays: 5, version: held.version - 1 })).status).toBe(409);
    const fixed = (await readyCheckout(browser())).checkout;
    expect((await staffApi().post(`/v1/admin/delivery-prices/${fixed.id}`, { rateMinor: "1", transitMinDays: 1, transitMaxDays: 1, version: fixed.version })).status).toBe(422);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/delivery-prices"));
    expectForbidden(await as(harness, actors.catalogueNoMfa!).get("/v1/admin/delivery-prices"));
    expectForbidden(await as(harness, actors.catalogueNoMfa!).post(`/v1/admin/delivery-prices/${held.id}`, { rateMinor: "1", transitMinDays: 1, transitMaxDays: 1, version: held.version }));
  });
});

describe("delivery zones admin (OPS-FR-100–101, Pen 108)", () => {
  const admin = () => ({
    get: (path: string) => request(harness.url).get(path).set("origin", TEST_WEB_ORIGIN).set("cookie", staff),
    post: (path: string, body: object) => request(harness.url).post(path).set("origin", TEST_WEB_ORIGIN).set("cookie", staff).send(body),
    patch: (path: string, body: object) => request(harness.url).patch(path).set("origin", TEST_WEB_ORIGIN).set("cookie", staff).send(body),
    delete: (path: string) => request(harness.url).delete(path).set("origin", TEST_WEB_ORIGIN).set("cookie", staff),
  });

  it("lists the zones in order", async () => {
    const list = deliveryZoneListSchema.parse((await admin().get("/v1/admin/delivery-zones")).body);
    expect(list.zones.map((zone) => [zone.name, zone.pricing, zone.rateMinor])).toEqual([
      ["Lagos Mainland", "FIXED", "500000"],
      ["Lagos Island", "FIXED", "650000"],
      ["Abuja FCT", "FIXED", "1200000"],
      ["Other Nigerian states", "QUOTE", null],
      ["International", "QUOTE", null],
    ]);
  });

  it("refuses overlapping zones with the Pen message", async () => {
    const refused = await admin().post("/v1/admin/delivery-zones", { name: "Lekki Corridor", covers: [{ state: "Lagos", lga: "Eti-Osa" }], pricing: "FIXED", rateMinor: "700000", transitMinDays: 1, transitMaxDays: 2 });
    expect(refused.status).toBe(400);
    expect(refused.body.fieldErrors.covers).toBe("Eti-Osa is already in Lagos Island. Remove it from one zone.");
  });

  it("creates, changes and removes a zone, audited; new rates apply to new checkouts only", async () => {
    const b = browser();
    const { checkout } = await readyCheckout(b);

    const created = await admin().post("/v1/admin/delivery-zones", { name: "Ogun", covers: [{ state: "Ogun", lga: null }], pricing: "FIXED", rateMinor: "800000", transitMinDays: 2, transitMaxDays: 3 });
    expect(created.status).toBe(201);
    const [island] = deliveryZoneListSchema.parse((await admin().get("/v1/admin/delivery-zones")).body).zones.filter((zone) => zone.name === "Lagos Island");
    const changed = await admin().patch(`/v1/admin/delivery-zones/${island!.id}`, { ...island, rateMinor: "700000", version: island!.version });
    expect(changed.status).toBe(200);
    expect(checkoutSchema.parse((await b.get(`/v1/checkouts/${checkout.id}`)).body).totals.deliveryMinor).toBe("650000");

    expect((await admin().patch(`/v1/admin/delivery-zones/${island!.id}`, { ...island, rateMinor: "750000", version: island!.version })).status).toBe(409);
    expect((await admin().delete(`/v1/admin/delivery-zones/${created.body.id}`)).status).toBe(204);
    const audit = await harness.database.db.select().from(schema.auditLog).where(eq(schema.auditLog.recordId, island!.id));
    expect(audit.map((event) => event.action)).toContain("delivery.zone_changed");
    await admin().patch(`/v1/admin/delivery-zones/${island!.id}`, { ...island, rateMinor: "650000", version: island!.version + 1 });
  });

  it("changes the quote-only rows' pricing but never removes them", async () => {
    const zones = deliveryZoneListSchema.parse((await admin().get("/v1/admin/delivery-zones")).body).zones;
    const rest = zones.find((zone) => zone.kind === "REST_OF_NIGERIA")!;
    expect((await admin().delete(`/v1/admin/delivery-zones/${rest.id}`)).status).toBe(404);
    const priced = await admin().patch(`/v1/admin/delivery-zones/${rest.id}`, { pricing: "FIXED", rateMinor: "1500000", transitMinDays: 2, transitMaxDays: 5, version: rest.version });
    expect(priced.status).toBe(200);
    await admin().patch(`/v1/admin/delivery-zones/${rest.id}`, { pricing: "QUOTE", rateMinor: null, transitMinDays: 2, transitMaxDays: 5, version: rest.version + 1 });
  });

  it("is staff with PRICING_MANAGE only", async () => {
    expectForbidden(await as(harness, actors.adminTunde!).get("/v1/admin/delivery-zones"));
    expect([401, 403, 404]).toContain((await as(harness, actors.customerChidi!).get("/v1/admin/delivery-zones")).status);
    expect([401, 404]).toContain((await request(harness.url).get("/v1/admin/delivery-zones")).status);
  });
});
