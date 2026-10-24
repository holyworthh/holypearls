import { TEST_PEOPLE } from "@holypearls/auth";
import { cartSchema, checkoutSchema, configurationSchema } from "@holypearls/contracts";
import { eq, ilike, inArray, schema } from "@holypearls/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RETENTION } from "../sales/retention.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { recordAudit, REMOVED } from "./audit.js";
import { runDailyCleanup } from "./cleanup.js";

/*
 * Review P1-08 (anonymous writes are limited by address, which a forged
 * header can't change), P2-02 (quote items are requested all together or not
 * at all), P2-03 (checkout and draft retention) and P2-09 (no personal data in
 * the audit log).
 */

vi.setConfig({ testTimeout: 240_000 });

const SECRET = "test-web-proxy-secret-0123456789abcdef";
let harness: Harness;
let limited: Harness;

const deviceCookie = (response: request.Response) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((cookie) => cookie.split(";")[0]).find((cookie) => cookie.startsWith("hp.device="));

function browser(target: () => Harness) {
  let cookie = "";
  const send = (req: request.Test) => {
    req.set("origin", TEST_WEB_ORIGIN);
    if (cookie) req.set("cookie", cookie);
    return req.then((response) => {
      cookie = deviceCookie(response) ?? cookie;
      return response;
    });
  };
  return {
    post: (path: string, body: object = {}) => send(request(target().url).post(path).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body)),
    patch: (path: string, body: object) => send(request(target().url).patch(path).send(body)),
    get: (path: string) => send(request(target().url).get(path)),
  };
}

beforeAll(async () => {
  harness = await createHarness();
  limited = await createHarness({ rateLimit: true, proxySecret: SECRET, database: harness.database });
});

afterAll(async () => {
  await limited?.close();
  await harness?.close();
});

describe("anonymous commercial writes are limited by address (review P1-08)", () => {
  const createDraft = (headers: Record<string, string> = {}) =>
    request(limited.url).post("/v1/configurations").set("origin", TEST_WEB_ORIGIN).set(headers).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send({ productSlug: "business-cards" });

  it("stops a burst of drafts from one address, whatever the browser does with its cookie or X-Forwarded-For", async () => {
    // Each request has a new forged X-Forwarded-For and no device cookie: still one address.
    // One frozen minute, however long the requests take against a remote test database.
    limited.now.value = new Date();
    const statuses: number[] = [];
    for (let index = 0; index < 62; index += 1) statuses.push((await createDraft({ "x-forwarded-for": `203.0.113.${index}` })).status);
    expect(statuses.slice(0, 60).every((status) => status === 201)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
    // A forged client-address header without the proxy's secret changes nothing either.
    expect((await createDraft({ "x-hp-client-ip": "198.51.100.7", "x-hp-proxy-secret": "wrong-secret-wrong-secret-wrong-secret" })).status).toBe(429);
  });

  it("counts each visitor separately when the web app's proxy vouches for the address", async () => {
    // Still the same frozen minute: the connecting address is used up, a vouched-for visitor isn't.
    expect((await createDraft({ "x-hp-client-ip": "198.51.100.8", "x-hp-proxy-secret": SECRET })).status).toBe(201);
    limited.now.value = null;
  });
});

describe("quote items are requested all together or not at all (review P2-02)", () => {
  it("leaves every item as it was when one can't be quoted", async () => {
    const b = browser(() => harness);
    const designs = [];
    for (const quantity of [50, 60]) {
      const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "polo-shirt", choices: { colour: "navy", fabric: "pique-cotton" } })).body);
      const draft = configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity })).body.draft);
      await b.post("/v1/cart/items", { configurationId: draft.id });
      designs.push(draft);
    }
    // The second design can't be quoted any more: its product stopped offering its route.
    await harness.database.db.update(schema.configurations).set({ sourcing: "CUSTOMER_SUPPLIED" }).where(eq(schema.configurations.id, designs[1]!.id));
    const [polo] = await harness.database.db.select().from(schema.products).where(eq(schema.products.slug, "polo-shirt"));
    const routes = polo!.routes;
    await harness.database.db.update(schema.products).set({ routes: routes.filter((route) => route !== "CUSTOMER_SUPPLIED") }).where(eq(schema.products.id, polo!.id));
    try {
      const refused = await b.post("/v1/cart/quote-request", { email: "both@example.com", name: "Both" });
      expect(refused.status).toBeGreaterThanOrEqual(400);
      const rows = await harness.database.db.select().from(schema.configurations).where(inArray(schema.configurations.id, designs.map((design) => design.id)));
      expect(rows.every((row) => row.status === "IN_CART")).toBe(true);
      expect(await harness.database.db.select().from(schema.quotes).where(inArray(schema.quotes.configurationId, designs.map((design) => design.id)))).toHaveLength(0);
      expect(cartSchema.parse((await b.get("/v1/cart")).body).items).toHaveLength(2);
    } finally {
      await harness.database.db.update(schema.products).set({ routes }).where(eq(schema.products.id, polo!.id));
    }
  });
});

describe("checkout and draft retention (review P2-03)", () => {
  it("closes an open checkout after 72 hours, erases an abandoned one's details after 90 days, and closes drafts untouched for 90 days", async () => {
    expect(RETENTION).toEqual({ openCheckoutHours: 72, abandonedCheckoutDays: 90, untouchedDraftDays: 90 });
    const b = browser(() => harness);
    const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
    const cards = configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body.draft);
    await b.post("/v1/cart/items", { configurationId: cards.id });
    let checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
    checkout = checkoutSchema.parse(
      (await request(harness.url).put(`/v1/checkouts/${checkout.id}/contact`).set("origin", TEST_WEB_ORIGIN).set("cookie", (await b.get("/v1/cart")).request.getHeader("cookie") as string).send({ name: "Ada Guest", email: "ada.guest@example.com", phone: "0800 000 0000", version: checkout.version })).body,
    );
    const [row] = await harness.database.db.select().from(schema.checkouts).where(eq(schema.checkouts.id, checkout.id));
    // 72 hours from when the checkout was made (the database stamps created_at a moment later).
    expect(Math.abs(row!.expiresAt!.getTime() - row!.createdAt.getTime() - 72 * 3_600_000)).toBeLessThan(60_000);

    const deps = { db: harness.database.db, storage: harness.storage, publicStorage: harness.publicStorage };
    // 73 hours later the checkout is closed; its details stay until the 90 days are up.
    const later = new Date(Date.now() + 73 * 3_600_000);
    expect((await runDailyCleanup(deps, later)).expiredCheckouts).toBeGreaterThanOrEqual(1);
    const [closed] = await harness.database.db.select().from(schema.checkouts).where(eq(schema.checkouts.id, checkout.id));
    expect(closed).toMatchObject({ status: "ABANDONED", personalDataPurgedAt: null });
    expect(closed!.contact).not.toBeNull();

    // 91 days later: details erased, amounts and frozen items kept; the draft is still in the cart, so it stays.
    const muchLater = new Date(Date.now() + 91 * 86_400_000);
    await runDailyCleanup(deps, muchLater);
    const [purged] = await harness.database.db.select().from(schema.checkouts).where(eq(schema.checkouts.id, checkout.id));
    expect(purged).toMatchObject({ contact: null, address: null, billing: null });
    expect(purged!.personalDataPurgedAt).not.toBeNull();
    expect(purged!.totalMinor).toBe(row!.totalMinor);
    expect(purged!.items).toEqual(row!.items);

    // An untouched draft (not in a cart) closes after 90 days and lets go of its personalisation.
    const stale = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards" })).body);
    await harness.database.db.insert(schema.configurationPersonalizationRows).values({ configurationId: stale.id, row: 1, name: "Named Person" });
    await harness.database.db.update(schema.configurations).set({ updatedAt: new Date(Date.now() - 91 * 86_400_000) }).where(eq(schema.configurations.id, stale.id));
    expect((await runDailyCleanup(deps)).closedDrafts).toBeGreaterThanOrEqual(1);
    const [closedDraft] = await harness.database.db.select().from(schema.configurations).where(eq(schema.configurations.id, stale.id));
    expect(closedDraft!.status).toBe("ABANDONED");
    expect(await harness.database.db.select().from(schema.configurationPersonalizationRows).where(eq(schema.configurationPersonalizationRows.configurationId, stale.id))).toHaveLength(0);
  });

  it("refuses answers to a checkout past its expiry even before the clean-up runs", async () => {
    const b = browser(() => harness);
    const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
    const cards = configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body.draft);
    await b.post("/v1/cart/items", { configurationId: cards.id });
    const checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
    await harness.database.db.update(schema.checkouts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.checkouts.id, checkout.id));
    const cookie = (await b.get("/v1/cart")).request.getHeader("cookie") as string;
    const refused = await request(harness.url).put(`/v1/checkouts/${checkout.id}/contact`).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).send({ name: "Late", email: "late@example.com", phone: "0800 000 0000", version: checkout.version });
    expect(refused.status).toBe(409);
    expect(refused.body.context.reason).toBe("CHECKOUT_CLOSED");
  });
});

describe("expired links and codes (T15-03; TECH-06 §12)", () => {
  it("deletes expired guest links (with their sessions) and Better Auth verifications, keeps the rest, and is safe to repeat", async () => {
    const db = harness.database.db;
    const [customer] = await db.insert(schema.customers).values({ email: "retention.links@example.com", emailNormalized: "retention.links@example.com" }).returning();
    const link = (hash: string, expiresAt: Date) => ({ secretHash: hash, purpose: "QUOTE" as const, targetType: "QUOTE", targetId: randomUUID(), customerId: customer!.id, expiresAt });
    const [expired, live] = await db
      .insert(schema.guestLinks)
      .values([link(`h-${randomUUID()}`, new Date(Date.now() - 1000)), link(`h-${randomUUID()}`, new Date(Date.now() + 3_600_000))])
      .returning();
    await db.insert(schema.guestSessions).values({ tokenHash: `t-${randomUUID()}`, guestLinkId: expired!.id, customerId: customer!.id, targetType: "QUOTE", targetId: expired!.targetId, expiresAt: new Date(Date.now() + 3_600_000) });
    await db.insert(schema.verifications).values([
      { identifier: `old-${randomUUID()}`, value: "x", expiresAt: new Date(Date.now() - 1000) },
      { identifier: `new-${randomUUID()}`, value: "x", expiresAt: new Date(Date.now() + 3_600_000) },
    ]);
    const deps = { db, storage: harness.storage, publicStorage: harness.publicStorage };
    const first = await runDailyCleanup(deps);
    expect(first.guestLinks).toBe(1);
    expect(first.verifications).toBe(1);
    expect((await db.select().from(schema.guestLinks).where(eq(schema.guestLinks.customerId, customer!.id))).map((row) => row.id)).toEqual([live!.id]);
    expect(await db.select().from(schema.guestSessions).where(eq(schema.guestSessions.customerId, customer!.id))).toHaveLength(0);
    expect(await db.select().from(schema.verifications).where(ilike(schema.verifications.identifier, "new-%"))).toHaveLength(1);
    expect(await db.select().from(schema.verifications).where(ilike(schema.verifications.identifier, "old-%"))).toHaveLength(0);
    expect(await runDailyCleanup(deps)).toMatchObject({ guestLinks: 0, verifications: 0, participantContacts: 0 });
  });
});

describe("no personal data in the audit log (review P2-09)", () => {
  it("removes emails, phones, addresses and contact blocks, and names a customer by ID only", async () => {
    const [user] = await harness.database.db.select().from(schema.users).where(eq(schema.users.email, TEST_PEOPLE.customerChidi.email));
    const actor = {
      type: "user" as const,
      requestId: "req_test",
      now: new Date(),
      staff: null,
      session: { sessionId: "s", userId: user!.id, email: user!.email, name: user!.name, emailVerified: true, mfaEnabled: false, mfaVerifiedAt: null, createdAt: new Date(), expiresAt: new Date() },
    };
    const id = await recordAudit(harness.database.db, actor as never, {
      action: "test.personal_data",
      summary: "Checked the audit filter",
      recordType: "TEST",
      recordLabel: "Order for chidi.customer@holypearls.test",
      before: { email: "a@example.com", contact: { name: "Ada", phone: "0800 000 0000" }, status: "OPEN" },
      after: { street: "12 Admiralty Way", note: "Call +234 800 000 0000 or write to b@example.com", status: "DONE" },
    });
    const [row] = await harness.database.db.select().from(schema.auditLog).where(eq(schema.auditLog.id, id));
    const stored = JSON.stringify(row);
    for (const leaked of ["a@example.com", "b@example.com", "chidi.customer@holypearls.test", "0800 000 0000", "800 000 0000", "Admiralty", "Ada", user!.name]) expect(stored).not.toContain(leaked);
    expect(row!.actorLabel).toBe("Customer");
    expect(row!.actorUserId).toBe(user!.id);
    expect(row!.before).toEqual({ email: REMOVED, contact: REMOVED, status: "OPEN" });
    expect((row!.after as { status: string }).status).toBe("DONE");
  });
});
