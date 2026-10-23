import { accountHistorySchema, apiErrorSchema, configurationSchema, meSchema, profileSchema } from "@holypearls/contracts";
import { and, eq, schema } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, signInActors, type Actors } from "../testing/actors.js";
import { orderFlows } from "../testing/flows.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T09-01: customer accounts, history and guest linking (PRD-00 §5; TECH-03
 * §3–4, §6, §17). Done when: AUTH rate limits apply; a password reset ends
 * other sessions; an unverified email links nothing; a verified email links
 * all earlier records.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
const db = () => harness.database.db;
const flows = orderFlows(
  () => harness,
  () => gateway,
);
const PASSWORD = "a-long-test-password-123";

const cookiesFrom = (response: request.Response, previous = "") => {
  const jar = new Map(previous.split("; ").filter(Boolean).map((pair) => [pair.split("=")[0]!, pair] as const));
  for (const line of (response.headers["set-cookie"] as unknown as string[] | undefined) ?? []) {
    const pair = line.split(";")[0]!;
    if (/max-age=0/i.test(line) || pair.endsWith("=")) jar.delete(pair.split("=")[0]!);
    else jar.set(pair.split("=")[0]!, pair);
  }
  return [...jar.values()].join("; ");
};
const auth = (path: string, body: object, cookie = "", url = harness.url) =>
  request(url).post(`/v1/auth${path}`).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).set("content-type", "application/json").send(body);
/** The API path of a link the sign-in library emailed (it points at the web app's /api forwarding). */
const apiPath = (url: string) => url.replace(`${TEST_WEB_ORIGIN}/api`, "");
const latestAuthEmail = (to: string, kind: "VERIFY_EMAIL" | "PASSWORD_RESET") => harness.outbox.sent.filter((email) => email.to === to && email.kind === kind).at(-1);

async function signUp(email: string, name = "New Customer (TEST DATA)") {
  const response = await auth("/sign-up/email", { name, email, password: PASSWORD, callbackURL: "/account" });
  expect(response.status).toBe(200);
  return cookiesFrom(response);
}

/** Opens the verification link from the email, as the browser would; returns the signed-in cookie. */
async function verify(email: string) {
  const mail = latestAuthEmail(email, "VERIFY_EMAIL");
  expect(mail).toBeTruthy();
  const response = await request(harness.url).get(apiPath(mail!.url)).set("origin", TEST_WEB_ORIGIN);
  expect([200, 302]).toContain(response.status);
  return cookiesFrom(response);
}

const history = async (cookie: string) => accountHistorySchema.parse((await as(harness, cookie).get("/v1/me/history")).body);

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["adminAda", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("sign-up and guest linking (TECH-03 §6)", () => {
  it("an unverified email links nothing: the guest's order stays closed and its record stays unlinked", async () => {
    const { orderId, contact } = await flows.paidOrder();
    const cookie = await signUp(contact.email);

    const me = meSchema.parse((await as(harness, cookie).get("/v1/me")).body);
    expect(me.emailVerified).toBe(false);
    const view = await history(cookie);
    expect(view.linking).toEqual({ state: "UNVERIFIED" });
    expect(view.orders).toEqual([]);
    expect(view.receipts).toEqual([]);
    expect((await as(harness, cookie).get(`/v1/orders/${orderId}`)).status).toBe(404);
    const [record] = await db().select().from(schema.customers).where(eq(schema.customers.emailNormalized, contact.email));
    expect(record!.userId).toBeNull();
    // A phone can't be written to a record the account doesn't own yet.
    const phone = await as(harness, cookie).patch("/v1/me/profile").send({ name: "New Customer", phone: "+234 803 000 0000" });
    expect(phone.status).toBe(422);
    expect(apiErrorSchema.parse(phone.body).context).toMatchObject({ reason: "VERIFY_EMAIL_FIRST" });
    // Product news can't be turned on for a record the account doesn't own yet either (T15-03).
    const news = await as(harness, cookie).patch("/v1/me/profile").send({ name: "New Customer", phone: null, marketingConsent: true });
    expect(news.status).toBe(422);
    expect(apiErrorSchema.parse(news.body).context).toMatchObject({ reason: "VERIFY_EMAIL_FIRST" });
  });

  it("verifying the email links every earlier order, receipt, quote, project and design, and audits it", async () => {
    const { orderId, contact } = await flows.paidOrder();
    const quote = await flows.acceptedQuote(flows.staff(actors.adminAda!));
    // A design started as a guest and emailed to the quote's address belongs to that customer record.
    const guest = flows.browser();
    const design = configurationSchema.parse((await guest.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
    expect((await guest.post(`/v1/configurations/${design.id}/email`, { email: quote.email })).status).toBeLessThan(300);

    await signUp(contact.email);
    const first = await verify(contact.email);
    const linked = await history(first);
    expect(linked.linking).toMatchObject({ state: "LINKED", orders: 1, recent: true });
    expect(linked.orders.map((order) => order.id)).toEqual([orderId]);
    expect(linked.orders[0]).toMatchObject({ paymentStatus: "PAID" });
    expect(linked.receipts).toHaveLength(1);
    expect((await as(harness, first).get(`/v1/orders/${orderId}`)).status).toBe(200);

    await signUp(quote.email);
    const second = await verify(quote.email);
    const fromQuote = await history(second);
    expect(fromQuote.linking).toMatchObject({ state: "LINKED", quotes: 1 });
    expect(fromQuote.orders.map((order) => order.id)).toEqual([quote.orderId]);
    expect(fromQuote.quotes.map((row) => row.kind).sort()).toEqual(["PROJECT", "QUOTE"]);
    expect(fromQuote.quotes.find((row) => row.kind === "QUOTE")).toMatchObject({ version: 1, status: "ACCEPTED" });
    expect(fromQuote.drafts.map((draft) => draft.id)).toContain(design.id);
    expect((await as(harness, second).get(`/v1/configurations/${design.id}`)).status).toBe(200);

    const audits = await db().select().from(schema.auditLog).where(eq(schema.auditLog.action, "account.guest_records_linked"));
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it("a verified account with no guest history says so, and never shows another customer's records", async () => {
    const email = `fresh.${randomUUID().slice(0, 8)}@example.com`;
    await signUp(email);
    const cookie = await verify(email);
    const view = await history(cookie);
    expect(view).toMatchObject({ linking: { state: "NOTHING_LINKED" }, orders: [], quotes: [], receipts: [], drafts: [] });

    const chidi = await history(actors.customerChidi!);
    expect(chidi.orders).toEqual([]);
    expect((await as(harness, "").get("/v1/me/history")).status).toBe(401);
  });

  it("sign-up with an email in use is refused, and resending the check is limited to the account's own email flow", async () => {
    const email = `taken.${randomUUID().slice(0, 8)}@example.com`;
    await signUp(email);
    const again = await auth("/sign-up/email", { name: "Someone", email, password: PASSWORD, callbackURL: "/account" });
    expect(again.status).toBe(422);
    expect(apiErrorSchema.parse(again.body).context).toMatchObject({ reason: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" });
    const short = await auth("/sign-up/email", { name: "Someone", email: `short.${randomUUID().slice(0, 8)}@example.com`, password: "short", callbackURL: "/account" });
    expect(short.status).toBe(400);

    const before = harness.outbox.sent.filter((mail) => mail.to === email && mail.kind === "VERIFY_EMAIL").length;
    expect((await auth("/send-verification-email", { email, callbackURL: "/account" })).status).toBe(200);
    expect(harness.outbox.sent.filter((mail) => mail.to === email && mail.kind === "VERIFY_EMAIL").length).toBe(before + 1);
  });
});

describe("password reset (TECH-03 §4)", () => {
  it("ends every other session, signs nobody in with the old password, and answers the same for unknown emails", async () => {
    const email = `reset.${randomUUID().slice(0, 8)}@example.com`;
    await signUp(email);
    const phone = await signIn(email, PASSWORD);
    const laptop = await signIn(email, PASSWORD);
    expect((await as(harness, phone).get("/v1/me")).status).toBe(200);

    const asked = await auth("/request-password-reset", { email, redirectTo: "/reset-password" });
    const unknown = await auth("/request-password-reset", { email: `nobody.${randomUUID().slice(0, 8)}@example.com`, redirectTo: "/reset-password" });
    expect(asked.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(asked.body);

    const mail = latestAuthEmail(email, "PASSWORD_RESET");
    const token = new URL(mail!.url).pathname.split("/").at(-1)!;
    const reset = await auth("/reset-password", { token, newPassword: "a-brand-new-password-456" });
    expect(reset.status).toBe(200);

    expect((await as(harness, phone).get("/v1/me")).status).toBe(401);
    expect((await as(harness, laptop).get("/v1/me")).status).toBe(401);
    expect((await auth("/sign-in/email", { email, password: PASSWORD })).status).toBe(401);
    expect((await auth("/sign-in/email", { email, password: "a-brand-new-password-456" })).status).toBe(200);
    expect((await auth("/reset-password", { token, newPassword: "yet-another-password-789" })).status).toBe(400);

    const [user] = await db().select().from(schema.users).where(eq(schema.users.email, email));
    const audit = await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "security.password_reset"), eq(schema.auditLog.recordId, user!.id)));
    expect(audit).toHaveLength(1);
  });
});

async function signIn(email: string, password: string) {
  const response = await auth("/sign-in/email", { email, password });
  expect(response.status).toBe(200);
  return cookiesFrom(response);
}

describe("profile (Pen frame 91)", () => {
  it("saves the name and phone of a verified account, validates them, and needs a session", async () => {
    const chidi = as(harness, actors.customerChidi!);
    const saved = profileSchema.parse((await chidi.patch("/v1/me/profile").send({ name: "Chidi Eze (TEST DATA)", phone: "+234 803 000 0000" })).body);
    expect(saved).toMatchObject({ phone: "+234 803 000 0000", email: "chidi.customer@holypearls.test" });
    expect(meSchema.parse((await chidi.get("/v1/me")).body)).toMatchObject({ phone: "+234 803 000 0000", emailVerified: true });
    expect((await chidi.patch("/v1/me/profile").send({ name: "Chidi Eze (TEST DATA)", phone: "" })).status).toBe(200);
    expect(meSchema.parse((await chidi.get("/v1/me")).body).phone).toBeNull();

    const blank = await chidi.patch("/v1/me/profile").send({ name: "  ", phone: "letters" });
    expect(blank.status).toBe(400);
    expect((await as(harness, "").patch("/v1/me/profile").send({ name: "Anyone" })).status).toBe(401);
  });
});

describe("limits and front ends (TECH-02 §14, ADR-017)", () => {
  let limited: Harness;
  beforeAll(async () => {
    limited = await createHarness({ rateLimit: true, adminOrigin: "http://localhost:3002", database: harness.database });
  });
  afterAll(async () => {
    await limited?.close();
  });

  it("the AUTH limit covers sign-up, reset requests, new passwords and resent checks", async () => {
    for (const [path, body] of [
      ["/sign-up/email", (n: number) => ({ name: "Limit", email: `limit.${n}.${randomUUID().slice(0, 6)}@example.com`, password: PASSWORD, callbackURL: "/account" })],
      ["/request-password-reset", () => ({ email: "same.person@example.com", redirectTo: "/reset-password" })],
      ["/reset-password", () => ({ token: "not-a-token", newPassword: PASSWORD })],
      ["/send-verification-email", () => ({ email: "same.person@example.com", callbackURL: "/account" })],
      ["/change-email", () => ({ newEmail: "same.person@example.com", callbackURL: "/account/profile" })],
    ] as const) {
      const codes: number[] = [];
      // 21 calls: even split across a minute boundary, one 60-second window gets 11 (the IP limit is 10).
      for (let n = 0; n < 21; n++) codes.push((await auth(path, body(n), "", limited.url).set("x-forwarded-for", `198.51.100.${path.length}`)).status);
      expect({ path, limited: codes.includes(429) }).toEqual({ path, limited: true });
    }
  });

  it("sign-up, its email check and email changes are never served on the admin", async () => {
    const response = await request(limited.url)
      .post("/v1/auth/sign-up/email")
      .set("origin", "http://localhost:3002")
      .set("content-type", "application/json")
      .send({ name: "Staff?", email: `admin.${randomUUID().slice(0, 8)}@example.com`, password: PASSWORD, callbackURL: "/" });
    expect(response.status).toBe(404);
    const check = await request(limited.url).get("/v1/auth/verify-email?token=x").set("origin", "http://localhost:3002");
    expect(check.status).toBe(404);
    const change = await request(limited.url).post("/v1/auth/change-email").set("origin", "http://localhost:3002").set("content-type", "application/json").send({ newEmail: "someone@example.com" });
    expect(change.status).toBe(404);
  });
});
