import type { IdentitySession } from "@holypearls/auth";
import { apiErrorSchema, auditPageSchema, incidentStateSchema, revokedCountSchema, uploadCreatedSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createGuestLink, ensureGuestCustomer, findGuestSession, redeemGuestLink } from "../identity/customers.js";
import { findActiveStaff } from "../identity/actor.js";
import { as, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { READ_ONLY_MESSAGE, setIncidentSwitch } from "./incidents.js";

/*
 * T15-05: incident switches (TECH-06 §14; Pen 123). Surfaces are real: staff
 * come through the admin proxy, customers through the web proxy.
 */

vi.setConfig({ testTimeout: 300_000 });

const ADMIN_ORIGIN = "http://localhost:3002";
const ADMIN_SECRET = "admin-proxy-secret-for-tests-0123456789";
const WEB_SECRET = "web-proxy-secret-for-tests-0123456789ab";

let harness: Harness;
let actors: Partial<Actors>;
const db = () => harness.database.db;

/** A staff request through the admin app's proxy. */
const admin = (cookie: string) => {
  const agent = request(harness.url);
  const headers = (test: request.Test) => test.set("origin", ADMIN_ORIGIN).set("x-hp-proxy-secret", ADMIN_SECRET).set("cookie", cookie);
  return {
    get: (path: string) => headers(agent.get(path)),
    post: (path: string, body: object = {}) => headers(agent.post(path)).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body),
  };
};
/** A customer request through the customer site's proxy. */
const customer = (cookie: string) => as(harness, cookie);

/** Staff with a fresh authenticator check, for calling the services directly. */
async function staffActor(email: string) {
  const [user] = await db().select().from(schema.users).where(eq(schema.users.email, email));
  const staff = await findActiveStaff(db(), user!.id);
  return { type: "user" as const, requestId: "test", now: new Date(), session: { userId: user!.id, mfaVerifiedAt: new Date() } as unknown as IdentitySession, staff };
}
const setSwitch = async (name: "READ_ONLY" | "UPLOADS_PAUSED", on: boolean) => setIncidentSwitch(db(), await staffActor("ada.staff@holypearls.test"), name, on);

beforeAll(async () => {
  harness = await createHarness({ adminOrigin: ADMIN_ORIGIN, adminProxySecret: ADMIN_SECRET, proxySecret: WEB_SECRET });
  actors = await signInActors(harness, ["adminAda", "adminTunde", "financeFolake", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("read-only mode", () => {
  it("lets people browse, sign in, open order links and send webhooks, and refuses other changes with a message", async () => {
    await setSwitch("READ_ONLY", true);
    try {
      const chidi = customer(actors.customerChidi!);
      const refused = await chidi.post("/v1/cart/items", {});
      expect(refused.status).toBe(422);
      expect(apiErrorSchema.parse(refused.body)).toMatchObject({ code: "RULE_FAILED", message: READ_ONLY_MESSAGE, context: { reason: "READ_ONLY" } });

      expect((await chidi.get("/v1/catalogue/products")).status).toBe(200);

      const person = await ensureGuestCustomer(db(), { email: `link.${randomUUID().slice(0, 8)}@holypearls.test` });
      const link = await createGuestLink(db(), TEST_WEB_ORIGIN, { purpose: "ORDER", targetType: "order", targetId: randomUUID(), customerId: person.id });
      expect((await chidi.post("/v1/guest-links/redeem", { secret: link.secret })).status).toBe(200);

      const gateway = harness.payments as FakeGateway;
      const { body, signature } = gateway.webhook("charge.success", `HPPAY-${randomUUID()}`, { id: 7001 });
      const hook = await request(harness.url).post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", signature).send(body.toString("utf8"));
      expect(hook.status).toBe(200);

      expect((await admin(actors.adminAda!).get("/v1/admin/me")).status).toBe(200);
      expect((await harness.signInAs("customerChidi")).length).toBeGreaterThan(0);
    } finally {
      await setSwitch("READ_ONLY", false);
    }
    expect((await customer(actors.customerChidi!).post("/v1/cart/items", {})).status).not.toBe(422);
    const [entry] = await db().select().from(schema.auditLog).where(eq(schema.auditLog.action, "security.incident_switch_changed")).limit(1);
    expect(entry).toMatchObject({ summary: "Read-only mode turned on", permission: "SECURITY_ADMIN", recordType: "INCIDENT_SWITCH" });
  });
});

describe("uploads paused", () => {
  it("refuses new uploads with a message and works again after resume", async () => {
    const intent = (cookie: string) => as(harness, cookie).post("/v1/files/uploads", { purpose: "ARTWORK", fileName: "a.png", size: 100, contentType: "image/png" });
    await setSwitch("UPLOADS_PAUSED", true);
    try {
      const refused = await intent(actors.customerChidi!);
      expect(refused.status).toBe(422);
      expect(apiErrorSchema.parse(refused.body).context).toMatchObject({ reason: "UPLOADS_PAUSED" });
    } finally {
      await setSwitch("UPLOADS_PAUSED", false);
    }
    const ok = await intent(actors.customerChidi!);
    expect(ok.status).toBe(201);
    uploadCreatedSchema.parse(ok.body);
  });
});

const freshMfa = () => db().execute(sql`update sessions set mfa_verified_at = now()`);
const switchBody = { switch: "UPLOADS_PAUSED", on: true };
const postsToTry: [string, object][] = [
  ["/v1/admin/incidents/switch", switchBody],
  ["/v1/admin/incidents/revoke-sessions", { scope: "PERSON", email: "nobody@holypearls.test" }],
  ["/v1/admin/incidents/revoke-guest-links", { recordId: randomUUID() }],
];

describe("who may use the switches (TECH-03 section 17)", () => {
  it("hides them from signed-out people and customers, and forbids staff without SECURITY_ADMIN", async () => {
    for (const cookie of ["", actors.customerChidi!]) {
      expect((await admin(cookie).get("/v1/admin/incidents")).status).toBe(404);
      for (const [path, body] of postsToTry) expect((await admin(cookie).post(path, body)).status).toBe(404);
    }
    expect((await admin(actors.adminTunde!).get("/v1/admin/incidents")).status).toBe(403);
    for (const [path, body] of postsToTry) expect((await admin(actors.adminTunde!).post(path, body)).status).toBe(403);
    expect((await admin(actors.financeFolake!).get("/v1/admin/incidents")).status).toBe(403);
  });

  it("asks for a recent authenticator check on every change", async () => {
    await db().execute(sql`update sessions set mfa_verified_at = now() - interval '16 minutes'`);
    try {
      for (const [path, body] of postsToTry) {
        const response = await admin(actors.adminAda!).post(path, body);
        expect(response.status).toBe(403);
        expect(apiErrorSchema.parse(response.body).code).toBe("RECENT_MFA_REQUIRED");
      }
    } finally {
      await freshMfa();
    }
  });
});

describe("the switches through the admin API", () => {
  it("shows state, and pauses and resumes payments through the payment settings switch", async () => {
    await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
    const ada = admin(actors.adminAda!);
    expect(incidentStateSchema.parse((await ada.get("/v1/admin/incidents")).body).paymentsPaused.on).toBe(false);
    const paused = incidentStateSchema.parse((await ada.post("/v1/admin/incidents/switch", { switch: "PAYMENTS_PAUSED", on: true })).body);
    expect(paused.paymentsPaused).toMatchObject({ on: true, since: expect.any(String) });
    const [settings] = await db().select().from(schema.paymentSettings);
    expect(settings!.onlinePayments).toBe(false);
    const [entry] = await db().select().from(schema.auditLog).where(eq(schema.auditLog.summary, "Online payments paused (incident switch)"));
    expect(entry).toMatchObject({ action: "payment.settings_changed", permission: "SECURITY_ADMIN" });
    const resumed = incidentStateSchema.parse((await ada.post("/v1/admin/incidents/switch", { switch: "PAYMENTS_PAUSED", on: false })).body);
    expect(resumed.paymentsPaused.on).toBe(false);
    expect((await db().select().from(schema.paymentSettings))[0]!.onlinePayments).toBe(true);
  });

  it("turns uploads on and off, keeps the original time when set twice, and finds entries by request ID", async () => {
    const ada = admin(actors.adminAda!);
    const first = incidentStateSchema.parse((await ada.post("/v1/admin/incidents/switch", { switch: "UPLOADS_PAUSED", on: true })).body);
    const again = incidentStateSchema.parse((await ada.post("/v1/admin/incidents/switch", { switch: "UPLOADS_PAUSED", on: true })).body);
    expect(first.uploadsPaused.on).toBe(true);
    expect(again.uploadsPaused.since).toBe(first.uploadsPaused.since);
    expect(incidentStateSchema.parse((await ada.post("/v1/admin/incidents/switch", { switch: "UPLOADS_PAUSED", on: false })).body).uploadsPaused).toEqual({ on: false, since: null });

    const [entry] = await db().select().from(schema.auditLog).where(eq(schema.auditLog.summary, "Uploads paused"));
    expect(entry!.requestId).toBeTruthy();
    const found = auditPageSchema.parse((await ada.get(`/v1/admin/audit?q=${entry!.requestId}`)).body);
    expect(found.entries.map((item) => item.id)).toContain(entry!.id);
  });
});

describe("turning off guest links", () => {
  const guestFor = async (email: string, targetId = randomUUID()) => {
    const customerRow = await ensureGuestCustomer(db(), { email });
    const link = await createGuestLink(db(), TEST_WEB_ORIGIN, { purpose: "ORDER", targetType: "order", targetId, customerId: customerRow.id });
    const redeemed = await redeemGuestLink(db(), link.secret, new Date());
    return { link, targetId, token: redeemed.session.token };
  };
  const redeemStatus = async (secret: string) => customer("").post("/v1/guest-links/redeem", { secret });

  it("works by record and by customer email, and stops live guest sessions", async () => {
    const ada = admin(actors.adminAda!);
    const one = await guestFor(`one.${randomUUID().slice(0, 8)}@holypearls.test`);
    expect(await findGuestSession(db(), one.token, new Date())).not.toBeNull();
    const byRecord = revokedCountSchema.parse((await ada.post("/v1/admin/incidents/revoke-guest-links", { recordId: one.targetId })).body);
    expect(byRecord.revoked).toBe(1);
    expect(apiErrorSchema.parse((await redeemStatus(one.link.secret)).body).context).toMatchObject({ reason: "LINK_REVOKED" });
    expect(await findGuestSession(db(), one.token, new Date())).toBeNull();

    const email = `two.${randomUUID().slice(0, 8)}@holypearls.test`;
    const two = await guestFor(email);
    const three = await guestFor(email);
    const byEmail = revokedCountSchema.parse((await ada.post("/v1/admin/incidents/revoke-guest-links", { customerEmail: email.toUpperCase() })).body);
    expect(byEmail.revoked).toBe(2);
    for (const link of [two.link, three.link]) expect(apiErrorSchema.parse((await redeemStatus(link.secret)).body).context).toMatchObject({ reason: "LINK_REVOKED" });
    expect(revokedCountSchema.parse((await ada.post("/v1/admin/incidents/revoke-guest-links", { customerEmail: email })).body).revoked).toBe(0);
  });
});

describe("signing people out", () => {
  it("ends one person's sessions, then everyone's including the caller's", async () => {
    const ada = admin(actors.adminAda!);
    expect((await customer(actors.customerChidi!).get("/v1/me")).status).toBe(200);
    const email = "chidi.customer@holypearls.test";
    const one = await ada.post("/v1/admin/incidents/revoke-sessions", { scope: "PERSON", email });
    expect(one.status).toBe(200);
    expect(revokedCountSchema.parse(one.body).revoked).toBeGreaterThan(0);
    expect((await customer(actors.customerChidi!).get("/v1/me")).status).toBe(401);
    expect((await ada.get("/v1/admin/me")).status).toBe(200);
    expect((await ada.post("/v1/admin/incidents/revoke-sessions", { scope: "PERSON", email: "nobody@holypearls.test" })).status).toBe(404);

    const guest = await (async () => {
      const row = await ensureGuestCustomer(db(), { email: `guest.${randomUUID().slice(0, 8)}@holypearls.test` });
      const link = await createGuestLink(db(), TEST_WEB_ORIGIN, { purpose: "ORDER", targetType: "order", targetId: randomUUID(), customerId: row.id });
      return (await redeemGuestLink(db(), link.secret, new Date())).session.token;
    })();
    const everyone = await ada.post("/v1/admin/incidents/revoke-sessions", { scope: "EVERYONE" });
    expect(revokedCountSchema.parse(everyone.body).revoked).toBeGreaterThan(0);
    expect((await ada.get("/v1/admin/me")).status).toBe(404);
    expect(await findGuestSession(db(), guest, new Date())).toBeNull();
    const [entry] = await db().select().from(schema.auditLog).where(eq(schema.auditLog.action, "security.sessions_revoked_all"));
    expect(entry).toMatchObject({ permission: "SECURITY_ADMIN" });
  });
});
