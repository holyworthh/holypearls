import { TEST_PEOPLE } from "@holypearls/auth";
import { apiErrorSchema, checkoutSchema, configurationSchema, paymentStartSchema, privacyPersonSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { type Browser, orderFlows } from "../testing/flows.js";
import { createHarness, type Harness } from "../testing/harness.js";
import { checkPaymentAttempt } from "../payments/payments.js";

/*
 * T15-03: privacy requests (TECH-06 §12, TECH-03 §8–9, §17). Done when:
 * erasure keeps payment and tax records but removes name and contact details.
 */

vi.setConfig({ testTimeout: 240_000 });

let harness: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
const flows = orderFlows(
  () => harness,
  () => gateway,
);
const db = () => harness.database.db;
const ada = () => as(harness, actors.adminAda!);
const lookup = (email: string, who = ada()) => who.post("/v1/admin/privacy/lookup", { email });
const exportOf = (email: string, who = ada()) => who.post("/v1/admin/privacy/export", { email });
const erase = (email: string, who = ada()) => who.post("/v1/admin/privacy/erase", { email, confirm: true });
const rows = async <T = Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db().execute(query)).rows as T[];

/** Every public table whose rows, read as text, contain any of the terms: table name to row count. */
async function tablesHolding(terms: string[]) {
  const tables = await rows<{ table_name: string }>(sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
  const found: Record<string, number> = {};
  for (const { table_name: table } of tables) {
    const name = sql.raw(`"${table}"`);
    const [hit] = await rows<{ n: number }>(sql`select count(*)::int as n from ${name} where ${name}::text ilike any(array[${sql.join(terms.map((term) => sql`${`%${term}%`}`), sql`, `)}])`);
    if (hit!.n) found[table] = hit!.n;
  }
  return found;
}

/** A checkout up to the Pay button, for a person with the given details. */
async function readyCheckout(person: { name: string; email: string; phone: string; street: string }) {
  const b = flows.browser();
  const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
  const cards = configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body.draft);
  await b.post("/v1/cart/items", { configurationId: cards.id });
  let checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
  const step = async (method: "put", path: string, body: object) => {
    checkout = checkoutSchema.parse((await b[method](`/v1/checkouts/${checkout.id}/${path}`, { ...body, version: checkout.version })).body);
  };
  await step("put", "contact", { name: person.name, email: person.email, phone: person.phone });
  await step("put", "address", { country: "NG", name: person.name, phone: person.phone, street: person.street, area: "Eti-Osa", state: "Lagos", landmark: "", });
  await step("put", "delivery", { option: "STANDARD" });
  await step("put", "billing", { sameAsDelivery: true });
  return { b, checkout };
}

/** Starts the payment; with `pay`, settles it as a success and applies the result. */
async function startPayment(b: Browser, checkoutId: string, pay: boolean) {
  const started = paymentStartSchema.parse((await b.post(`/v1/checkouts/${checkoutId}/payments`)).body);
  const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, started.reference));
  if (pay) {
    gateway.settle(started.reference, { status: "success" });
    await checkPaymentAttempt({ db: db(), gateway, notify: flows.notify() }, attempt!.id, 1);
  }
  return attempt!;
}

const newPerson = () => {
  const tag = randomUUID().slice(0, 8);
  const phone = `0803 ${randomInt(100, 999)} ${randomInt(1000, 9999)}`;
  return { name: `Zuri Quillfeather ${tag}`, email: `zuri.${tag}@example.com`, phone, street: `${tag} Quillfeather Close`, tag };
};

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["adminAda", "adminTunde", "financeFolake", "customerChidi", "customerAmaka"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("privacy requests: lookup and export", () => {
  it("a lookup counts what is held; an unknown email finds nothing", async () => {
    const person = newPerson();
    const { b, checkout } = await readyCheckout(person);
    await startPayment(b, checkout.id, true);
    const found = privacyPersonSchema.parse((await lookup(person.email.toUpperCase())).body);
    expect(found).toMatchObject({ found: true, erasedAt: null, hasAccount: false, marketingConsentAt: null, counts: { customers: 1, orders: 1, receipts: 1, checkouts: 1 } });
    // The order is placed and not yet delivered: erasing is refused until it is.
    expect(found.blockers.map((blocker) => blocker.code)).toEqual(["OPEN_ORDERS"]);
    expect(privacyPersonSchema.parse((await lookup("nobody.here@example.com")).body)).toMatchObject({ found: false, blockers: [] });
  });

  it("exports a JSON file with the order, receipt and contact, never tokens or passwords, and audits it without the email", async () => {
    const person = newPerson();
    const { b, checkout } = await readyCheckout(person);
    await startPayment(b, checkout.id, true);
    const [order] = await db().select().from(schema.orders).where(eq(schema.orders.checkoutId, checkout.id));
    const response = await exportOf(person.email);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-disposition"]).toMatch(/^attachment; filename="holypearls-person-\d{4}-\d{2}-\d{2}\.json"$/);
    const text = JSON.stringify(response.body);
    expect(response.body).toMatchObject({ schema: "person-export/v1", email: person.email });
    expect(text).toContain(order!.number);
    expect(text).toContain(person.name);
    expect(response.body.orders.receipts[0].number).toMatch(/^HP-R-/);
    expect(response.body.orders.orders[0].contact.email).toBe(person.email);
    expect(response.body.payments.attempts[0].reference).toMatch(/^HPPAY-/);
    expect(text).not.toMatch(/"(token|password|secret|backupCodes|sealedData|sealed_data)"/);
    const [audit] = await rows<{ record_label: string | null; before: unknown; after: unknown }>(sql`select record_label, "before", "after" from audit_log where action = 'privacy.exported' order by occurred_at desc limit 1`);
    expect(audit).toBeDefined();
    expect(JSON.stringify(audit)).not.toContain(person.email);
    expect(JSON.stringify(audit)).not.toContain(person.name);
  });
});

describe("Done when: erasure keeps payment and tax records but removes name and contact details", () => {
  it("keeps every amount, number and reference, and no table holds the person's email, phone, name or street", async () => {
    const person = newPerson();
    const { b, checkout } = await readyCheckout(person);
    const attempt = await startPayment(b, checkout.id, true);
    const [order] = await db().select().from(schema.orders).where(eq(schema.orders.checkoutId, checkout.id));
    const [customer] = await db().select().from(schema.customers).where(eq(schema.customers.emailNormalized, person.email));
    // Things a real customer leaves behind: Paystack's customer block, a help request, a problem report.
    await db().insert(schema.paystackEvents).values({
      eventKey: `charge.success:${randomUUID()}`,
      event: "charge.success",
      reference: attempt.reference,
      rawBody: JSON.stringify({ event: "charge.success", data: { reference: attempt.reference, customer: { email: person.email, first_name: "Zuri", last_name: `Quillfeather ${person.tag}`, phone: person.phone }, authorization: { account_name: person.name, last4: "4081" }, ip_address: "203.0.113.9" } }),
    });
    await db().insert(schema.helpRequests).values({ reference: `HR-T-${person.tag}`, customerId: customer!.id, name: person.name, phone: person.phone, message: `Please call ${person.name}`, context: {} });
    const [item] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order!.id));
    await db().insert(schema.problemReports).values({ number: `HP-RP-T-${person.tag}`, orderId: order!.id, orderItemId: item!.id, customerId: customer!.id, type: "DAMAGED", quantity: 1, description: `Reach me on ${person.email}` });
    await db().update(schema.orderItems).set({ status: "DELIVERED" }).where(eq(schema.orderItems.orderId, order!.id));

    const records = () =>
      rows(sql`
        select 'orders' as t, json_agg(r order by r.number) as v from (select number, total_minor, vat_minor, goods_minor, vat_rate_bps, currency from orders where id = ${order!.id}) r
        union all select 'receipts', json_agg(r order by r.number) from (select number, amount_minor, paystack_reference, currency, lines, paid_at from receipts where order_id = ${order!.id}) r
        union all select 'attempts', json_agg(r order by r.reference) from (select reference, amount_minor, status, paid_amount_minor from payment_attempts where intent_id = ${attempt.intentId}) r
        union all select 'items', json_agg(r order by r.position) from (select position, product_name, summary, quantity, total_minor, snapshot from order_items where order_id = ${order!.id}) r`);
    const before = await records();
    const terms = [person.email, person.phone, person.phone.replaceAll(" ", ""), person.name, person.street];
    // The scan can find things: before the erasure the person is all over the database.
    expect(Object.keys(await tablesHolding(terms))).toEqual(expect.arrayContaining(["customers", "orders", "receipts", "checkouts", "paystack_events", "help_requests", "notifications"]));

    expect(privacyPersonSchema.parse((await lookup(person.email)).body).blockers).toEqual([]);
    const done = await erase(person.email);
    expect(done.status).toBe(200);
    expect(privacyPersonSchema.parse(done.body).erasedAt).not.toBeNull();

    expect(await records()).toEqual(before);
    const [after] = await db().select().from(schema.customers).where(eq(schema.customers.id, customer!.id));
    expect(after).toMatchObject({ name: null, phone: null, email: `erased+${customer!.id}@erased.invalid` });
    expect(after!.erasedAt).not.toBeNull();
    const [receipt] = await rows<{ payer: unknown }>(sql`select payer from receipts where order_id = ${order!.id}`);
    expect(receipt!.payer).toEqual({ name: "Erased customer", email: null });

    expect(await tablesHolding(terms)).toEqual({});  });

  it("a quote customer: the frozen quote versions and proofs hold no contact details, so nothing needs unfreezing", async () => {
    const { orderId, items, email } = await flows.acceptedQuote(flows.staff(actors.adminAda!));
    expect(Object.keys(await tablesHolding([email]))).toEqual(expect.arrayContaining(["customers", "orders", "quotes", "projects"]));
    await db().update(schema.orderItems).set({ status: "DELIVERED" }).where(eq(schema.orderItems.orderId, orderId));
    expect(items.length).toBeGreaterThan(0);
    const person = privacyPersonSchema.parse((await lookup(email)).body);
    expect(person.blockers).toEqual([]);
    expect(person.counts).toMatchObject({ orders: 1, quotes: 1 });
    expect((await erase(email)).status).toBe(200);
    expect(await tablesHolding([email])).toEqual({});
    const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(order!.contact).toEqual({ name: "Erased customer", email: expect.stringMatching(/^erased\+.+@erased\.invalid$/) });
  });

  it("erasing again changes nothing, and no email is queued to the erased address", async () => {
    const person = newPerson();
    const { b, checkout } = await readyCheckout(person);
    await startPayment(b, checkout.id, true);
    const [order] = await db().select().from(schema.orders).where(eq(schema.orders.checkoutId, checkout.id));
    await db().update(schema.orderItems).set({ status: "DELIVERED" }).where(eq(schema.orderItems.orderId, order!.id));
    expect((await erase(person.email)).status).toBe(200);
    const again = privacyPersonSchema.parse((await erase(person.email)).body);
    expect(again).toMatchObject({ found: false, erasedAt: null });
    expect(privacyPersonSchema.parse((await lookup(person.email)).body).found).toBe(false);
    const audited = await rows<{ n: number }>(sql`select count(*)::int as n from audit_log where action = 'privacy.erased' and record_id = ${order!.customerId}`);
    expect(audited[0]!.n).toBe(1);
    const { queueEmail } = await import("./notifications.js");
    const queued = await queueEmail(flows.notify(), db(), { template: "test_email", to: "erased+x@erased.invalid", data: { requestedBy: "test" }, requestId: "r1" });
    expect(queued).toBeNull();
  });

  it("an account: sessions, passwords and authenticator are gone, the user row is anonymized, and the old password fails", async () => {
    const amaka = TEST_PEOPLE.customerAmaka;
    const [user] = await db().select().from(schema.users).where(eq(schema.users.email, amaka.email));
    await db().insert(schema.verifications).values({ identifier: `email-verification-${amaka.email}`, value: "x", expiresAt: new Date(Date.now() + 60_000) });
    const found = privacyPersonSchema.parse((await lookup(amaka.email)).body);
    expect(found.hasAccount).toBe(true);
    expect((await erase(amaka.email)).status).toBe(200);
    expect(await db().select().from(schema.sessions).where(eq(schema.sessions.userId, user!.id))).toEqual([]);
    expect(await db().select().from(schema.accounts).where(eq(schema.accounts.userId, user!.id))).toEqual([]);
    expect(await db().select().from(schema.twoFactors).where(eq(schema.twoFactors.userId, user!.id))).toEqual([]);
    expect(await rows(sql`select 1 from verifications where identifier ilike ${`%${amaka.email}%`}`)).toEqual([]);
    const [anonymized] = await db().select().from(schema.users).where(eq(schema.users.id, user!.id));
    expect(anonymized).toMatchObject({ name: "Erased customer", email: `erased+${user!.id}@erased.invalid`, emailVerified: false, image: null });
    const signIn = await fetch(`${harness.authUrl}/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify({ email: amaka.email, password: amaka.password }) });
    expect(signIn.ok).toBe(false);
    expect((await as(harness, actors.customerAmaka!).get("/v1/me")).status).toBe(401);
  });
});

describe("privacy requests: what blocks an erasure", () => {
  const blockers = async (email: string) => privacyPersonSchema.parse((await lookup(email)).body).blockers.map((blocker) => blocker.code);
  const refused = async (email: string, reason: string) => {
    const response = await erase(email);
    expect(response.status).toBe(422);
    expect(apiErrorSchema.parse(response.body).context).toMatchObject({ reason });
  };

  it("an open order, a staff account, an organization member and a payment in progress each refuse it", async () => {
    const open = newPerson();
    const paid = await readyCheckout(open);
    await startPayment(paid.b, paid.checkout.id, true);
    expect(await blockers(open.email)).toEqual(["OPEN_ORDERS"]);
    await refused(open.email, "OPEN_ORDERS");
    const [kept] = await db().select().from(schema.customers).where(eq(schema.customers.emailNormalized, open.email));
    expect(kept!.erasedAt).toBeNull();

    expect(await blockers(TEST_PEOPLE.adminTunde.email)).toContain("STAFF_ACCOUNT");
    await refused(TEST_PEOPLE.adminTunde.email, "STAFF_ACCOUNT");
    expect(await blockers(TEST_PEOPLE.acmeBuyer.email)).toContain("ORGANIZATION_MEMBER");
    await refused(TEST_PEOPLE.acmeBuyer.email, "ORGANIZATION_MEMBER");

    const paying = newPerson();
    const pending = await readyCheckout(paying);
    await startPayment(pending.b, pending.checkout.id, false);
    expect(await blockers(paying.email)).toEqual(["PAYMENT_IN_PROGRESS"]);
    await refused(paying.email, "PAYMENT_IN_PROGRESS");
  });
});

describe("privacy requests: who may (TECH-03 §17)", () => {
  const email = TEST_PEOPLE.customerChidi.email;

  it("signed out and a customer is turned away, and staff without EXPORT_PERSONAL_DATA get 403 on all three routes", async () => {
    for (const send of [(who: ReturnType<typeof as>) => lookup(email, who), (who: ReturnType<typeof as>) => exportOf(email, who), (who: ReturnType<typeof as>) => erase(email, who)]) {
      expect([401, 404]).toContain((await send(as(harness, actors.signedOut!))).status);
      expect([401, 403, 404]).toContain((await send(as(harness, actors.customerChidi!))).status);
      const folake = await send(as(harness, actors.financeFolake!));
      expect(folake.status).toBe(403);
      expect(JSON.stringify(apiErrorSchema.parse(folake.body).context)).toContain("EXPORT_PERSONAL_DATA");
    }
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/privacy"));
  });

  it("export and erase need a recent MFA check; lookup needs only the permission", async () => {
    harness.now.value = new Date(Date.now() + 16 * 60_000);
    try {
      expect((await lookup(email)).status).toBe(200);
      for (const send of [exportOf, erase]) {
        const stale = await send(email);
        expect(stale.status).toBe(403);
        expect(apiErrorSchema.parse(stale.body).code).toBe("RECENT_MFA_REQUIRED");
      }
    } finally {
      harness.now.value = null;
    }
    expect(privacyPersonSchema.parse((await lookup(email)).body).erasedAt).toBeNull();
  });

  it("an erase without the confirmation is refused", async () => {
    expect((await ada().post("/v1/admin/privacy/erase", { email, confirm: false })).status).toBe(400);
  });
});
