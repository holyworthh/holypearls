import { TEST_PEOPLE } from "@holypearls/auth";
import { cartSchema, checkoutSchema, configurationSchema } from "@holypearls/contracts";
import { and, eq, inArray, schema } from "@holypearls/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureAccountCustomer, ensureGuestCustomer } from "../identity/customers.js";
import { as } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * Review P1-03 (a typed email never joins a customer record to an account)
 * and P1-04 (signing in claims the browser's designs, cart and checkout in
 * one transaction).
 */

vi.setConfig({ testTimeout: 180_000 });

let harness: Harness;
let chidi: string;
let amaka: string;

const deviceCookie = (response: request.Response) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((cookie) => cookie.split(";")[0]).find((cookie) => cookie.startsWith("hp.device="));

/** A browser that keeps its device cookie and, once signed in, its session cookie too. */
function browser(session = "") {
  let device = "";
  const cookies = () => [session, device].filter(Boolean).join("; ");
  const send = (req: request.Test) => {
    req.set("origin", TEST_WEB_ORIGIN);
    if (cookies()) req.set("cookie", cookies());
    return req.then((response) => {
      device = deviceCookie(response) ?? device;
      return response;
    });
  };
  return {
    post: (path: string, body: object = {}) => send(request(harness.url).post(path).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body)),
    patch: (path: string, body: object) => send(request(harness.url).patch(path).send(body)),
    put: (path: string, body: object) => send(request(harness.url).put(path).send(body)),
    get: (path: string) => send(request(harness.url).get(path)),
    signIn: (cookie: string) => {
      session = cookie;
    },
  };
}
type Browser = ReturnType<typeof browser>;

async function cardsDraft(b: Browser) {
  const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
  return configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body.draft);
}

async function poloDraft(b: Browser) {
  const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } })).body);
  return configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 50 })).body.draft);
}

const userId = async (email: string) => (await harness.database.db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)))[0]!.id;
const customerByEmail = async (email: string) => (await harness.database.db.select().from(schema.customers).where(eq(schema.customers.emailNormalized, email.toLowerCase())))[0];

beforeAll(async () => {
  harness = await createHarness();
  chidi = await harness.signInAs("customerChidi");
  amaka = await harness.signInAs("customerAmaka");
});

afterAll(async () => {
  await harness?.close();
});

describe("a typed email never joins a customer record to an account (review P1-03)", () => {
  it("a signed-in checkout keeps the account's customer and stores the typed email as contact only", async () => {
    const b = browser(chidi);
    const cards = await cardsDraft(b);
    await b.post("/v1/cart/items", { configurationId: cards.id });
    let checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
    checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/contact`, { name: "Someone Else", email: "future.customer@example.com", phone: "0800 000 0000", version: checkout.version })).body);
    expect(checkout.contact?.email).toBe("future.customer@example.com");

    const [row] = await harness.database.db.select().from(schema.checkouts).where(eq(schema.checkouts.id, checkout.id));
    const [owner] = await harness.database.db.select().from(schema.customers).where(eq(schema.customers.id, row!.customerId!));
    expect(owner!.userId).toBe(await userId(TEST_PEOPLE.customerChidi.email));
    // The typed address got no record at all, and certainly not one tied to Chidi.
    expect(await customerByEmail("future.customer@example.com")).toBeUndefined();
  });

  it("emailing a design to someone else doesn't link them to the account", async () => {
    const b = browser(chidi);
    const cards = await cardsDraft(b);
    expect((await b.post(`/v1/configurations/${cards.id}/email`, { email: "b.friend@example.com" })).status).toBe(200);
    const friend = await customerByEmail("b.friend@example.com");
    expect(friend!.userId).toBeNull();
    const [draft] = await harness.database.db.select().from(schema.configurations).where(eq(schema.configurations.id, cards.id));
    expect(draft!.customerId).not.toBe(friend!.id);
    const [link] = await harness.database.db.select().from(schema.guestLinks).where(eq(schema.guestLinks.targetId, cards.id));
    expect(link!.customerId).toBe(friend!.id);
  });

  it("a quote for another contact belongs to the account; only the email goes to the contact", async () => {
    const b = browser(chidi);
    const polo = await poloDraft(b);
    const result = await b.post(`/v1/configurations/${polo.id}/quote-request`, { email: "b.buyer@example.com", name: "B Buyer" });
    expect(result.status).toBeLessThan(300);
    const buyer = await customerByEmail("b.buyer@example.com");
    expect(buyer!.userId).toBeNull();
    const [quote] = await harness.database.db.select().from(schema.quotes).where(eq(schema.quotes.configurationId, polo.id));
    const [owner] = await harness.database.db.select().from(schema.customers).where(eq(schema.customers.id, quote!.customerId));
    expect(owner!.userId).toBe(await userId(TEST_PEOPLE.customerChidi.email));
    expect((quote!.contact as { email: string }).email).toBe("b.buyer@example.com");
    const [email] = await harness.database.db.select().from(schema.notifications).where(and(eq(schema.notifications.recordId, polo.id), eq(schema.notifications.template, "guest_link")));
    expect(email!.recipient).toBe("b.buyer@example.com");
    expect(email!.customerId).toBe(buyer!.id);
  });

  it("only a verified account email links that email's guest history", async () => {
    const db = harness.database.db;
    const guest = await ensureGuestCustomer(db, { email: "history.owner@example.com", name: "Guest history" });
    const unverified = await ensureAccountCustomer(db, { userId: await userId(TEST_PEOPLE.customerAmaka.email), email: "history.owner@example.com", name: "Amaka", emailVerified: false });
    expect(unverified.id).toBe(guest.id);
    expect((await customerByEmail("history.owner@example.com"))!.userId).toBeNull();

    const [user] = await db.insert(schema.users).values({ id: randomUUID(), name: "Verified owner", email: "history.owner@example.com", emailVerified: true }).returning();
    const verified = await ensureAccountCustomer(db, { userId: user!.id, email: user!.email, name: user!.name, emailVerified: true });
    expect(verified.id).toBe(guest.id);
    expect(verified.userId).toBe(user!.id);
    // Asking again finds the account's record directly.
    expect((await ensureAccountCustomer(db, { userId: user!.id, email: user!.email, name: user!.name, emailVerified: true })).id).toBe(guest.id);
  });
});

describe("signing in claims the browser's designs, cart and checkout (review P1-04)", () => {
  it("abandons the browser's checkout, and the account opens, edits and quotes the designs on another device", async () => {
    const b = browser();
    const cards = await cardsDraft(b);
    const polo = await poloDraft(b);
    await b.post("/v1/cart/items", { configurationId: cards.id });
    await b.post("/v1/cart/items", { configurationId: polo.id });
    const guestCheckout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);

    // Sign in on this browser: the first request with both cookies claims everything.
    b.signIn(amaka);
    expect(cartSchema.parse((await b.get("/v1/cart")).body).items.map((item) => item.configurationId)).toEqual(expect.arrayContaining([cards.id, polo.id]));
    const [old] = await harness.database.db.select().from(schema.checkouts).where(eq(schema.checkouts.id, guestCheckout.id));
    expect(old!.status).toBe("ABANDONED");
    expect(old!.ownerDeviceHash).toBeNull();
    const designs = await harness.database.db.select().from(schema.configurations).where(inArray(schema.configurations.id, [cards.id, polo.id]));
    const amakaId = await userId(TEST_PEOPLE.customerAmaka.email);
    expect(designs.every((design) => design.ownerUserId === amakaId && design.ownerDeviceHash === null)).toBe(true);

    // Another device, signed in only: the cart, the design, an edit and a quote request all work.
    const other = as(harness, amaka);
    expect(cartSchema.parse((await other.get("/v1/cart")).body).items).toHaveLength(2);
    const opened = configurationSchema.parse((await other.get(`/v1/configurations/${cards.id}`)).body);
    const edited = await request(harness.url).patch(`/v1/configurations/${cards.id}`).set("origin", TEST_WEB_ORIGIN).set("cookie", amaka).send({ version: opened.version, quantity: 500 });
    expect(edited.status).toBe(200);
    expect((await other.post("/v1/cart/quote-request", { email: TEST_PEOPLE.customerAmaka.email, name: "Amaka" })).status).toBeLessThan(300);
    // A new checkout starts from the account's cart.
    expect((await other.post("/v1/checkouts")).status).toBe(200);
  });

  it("joins the browser's cart to an existing account cart: no doubles, every design the account's, no orphan open checkout", async () => {
    const account = browser(chidi);
    const kept = await cardsDraft(account);
    await account.post("/v1/cart/items", { configurationId: kept.id });

    const b = browser();
    const added = await cardsDraft(b);
    await b.post("/v1/cart/items", { configurationId: added.id });
    const guestCheckout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);

    b.signIn(chidi);
    // Two requests at once: the claim runs once and the other finds nothing left to move.
    const [first, second] = await Promise.all([b.get("/v1/cart"), b.get("/v1/cart")]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const ids = cartSchema.parse((await b.get("/v1/cart")).body).items.map((item) => item.configurationId);
    expect(ids.filter((id) => id === added.id)).toHaveLength(1);
    expect(ids).toEqual(expect.arrayContaining([kept.id, added.id]));

    const chidiId = await userId(TEST_PEOPLE.customerChidi.email);
    const [design] = await harness.database.db.select().from(schema.configurations).where(eq(schema.configurations.id, added.id));
    expect(design!.ownerUserId).toBe(chidiId);
    const carts = await harness.database.db.select().from(schema.carts).where(eq(schema.carts.ownerUserId, chidiId));
    expect(carts).toHaveLength(1);
    const [old] = await harness.database.db.select().from(schema.checkouts).where(eq(schema.checkouts.id, guestCheckout.id));
    expect(old).toMatchObject({ status: "ABANDONED", ownerUserId: chidiId, ownerDeviceHash: null, cartId: carts[0]!.id });
  });
});
