import { TEST_PEOPLE } from "@holypearls/auth";
import { apiErrorSchema } from "@holypearls/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness, TEST_ADMIN_PROXY_SECRET as ADMIN_SECRET, TEST_WEB_ORIGIN, TEST_WEB_PROXY_SECRET as WEB_SECRET } from "../testing/harness.js";

/*
 * T00-10, ADR-017: two front ends. The API serves admin routes and staff
 * sign-in only through the admin app's proxy (its own secret), customer
 * sign-in only through the customer site, and checks each one's origin.
 * Negative tests per TECH-03 §17.
 */

vi.setConfig({ testTimeout: 120_000 });

const ADMIN_ORIGIN = "http://localhost:3002";

let harness: Harness;
let staff: string;
let customer: string;

/** Through the admin app's proxy: its origin and its secret. */
const viaAdmin = (test: request.Test, cookie = staff) => test.set("origin", ADMIN_ORIGIN).set("x-hp-surface", "admin").set("x-hp-proxy-secret", ADMIN_SECRET).set("cookie", cookie);
/** Through the customer site's proxy. */
const viaWeb = (test: request.Test, cookie = customer) => test.set("origin", TEST_WEB_ORIGIN).set("x-hp-surface", "web").set("x-hp-proxy-secret", WEB_SECRET).set("cookie", cookie);

const expectHidden = (response: request.Response) => {
  expect(response.status).toBe(404);
  expect(apiErrorSchema.parse(response.body).code).toBe("NOT_FOUND");
};

beforeAll(async () => {
  harness = await createHarness({ adminOrigin: ADMIN_ORIGIN, adminProxySecret: ADMIN_SECRET, proxySecret: WEB_SECRET });
  staff = await harness.signInAs("adminAda");
  customer = await harness.signInAs("customerChidi");
});

afterAll(async () => {
  await harness?.close();
});

describe("admin routes answer only through the admin app (ADR-017)", () => {
  it("serves staff through the admin proxy", async () => {
    expect((await viaAdmin(request(harness.url).get("/v1/admin/me"))).status).toBe(200);
  });

  it("hides admin routes from the customer site, from no proxy, and from a forged surface header", async () => {
    expectHidden(await viaWeb(request(harness.url).get("/v1/admin/me"), staff));
    expectHidden(await request(harness.url).get("/v1/admin/me").set("cookie", staff));
    // The surface header alone proves nothing: the secret decides.
    expectHidden(await request(harness.url).get("/v1/admin/me").set("origin", ADMIN_ORIGIN).set("x-hp-surface", "admin").set("cookie", staff));
    expectHidden(await request(harness.url).get("/v1/admin/me").set("x-hp-proxy-secret", WEB_SECRET).set("x-hp-surface", "admin").set("cookie", staff));
  });

  it("hides the authenticator steps from the customer site", async () => {
    expectHidden(await viaWeb(request(harness.url).post("/v1/auth/two-factor/verify-totp").send({ code: "123456" })));
  });

  it("checks each front end's own origin", async () => {
    const wrong = await request(harness.url)
      .post("/v1/admin/monitoring/test-error")
      .set("origin", TEST_WEB_ORIGIN)
      .set("x-hp-proxy-secret", ADMIN_SECRET)
      .set("cookie", staff)
      .send({});
    expect(wrong.status).toBe(403);
    expect(apiErrorSchema.parse(wrong.body).context).toMatchObject({ reason: "ORIGIN_NOT_ALLOWED" });
    const crossed = await request(harness.url).post("/v1/cart/items").set("origin", ADMIN_ORIGIN).set("x-hp-proxy-secret", WEB_SECRET).set("cookie", customer).send({});
    expect(crossed.status).toBe(403);
  });
});

describe("sign-in on the right front end only", () => {
  const signIn = (via: "admin" | "web", email: string, password: string) => {
    const test = request(harness.url).post("/v1/auth/sign-in/email").set("content-type", "application/json");
    const routed = via === "admin" ? test.set("origin", ADMIN_ORIGIN).set("x-hp-proxy-secret", ADMIN_SECRET) : test.set("origin", TEST_WEB_ORIGIN).set("x-hp-proxy-secret", WEB_SECRET);
    return routed.send({ email, password });
  };

  it("refuses staff at the customer sign-in, exactly like a wrong password", async () => {
    const ada = TEST_PEOPLE.adminAda;
    const refused = await signIn("web", ada.email, ada.password);
    const wrong = await signIn("web", ada.email, "not-the-password");
    expect(refused.status).toBe(401);
    expect(apiErrorSchema.parse(refused.body)).toMatchObject({ code: "NOT_SIGNED_IN", context: { reason: "INVALID_EMAIL_OR_PASSWORD" } });
    expect({ status: refused.status, code: refused.body.code, reason: refused.body.context?.reason }).toEqual({ status: wrong.status, code: wrong.body.code, reason: wrong.body.context?.reason });
    expect(refused.headers["set-cookie"]).toBeUndefined();
  });

  it("refuses customers at the admin sign-in, and lets each in on their own side", async () => {
    const chidi = TEST_PEOPLE.customerChidi;
    expect((await signIn("admin", chidi.email, chidi.password)).status).toBe(401);
    expect((await signIn("web", chidi.email, chidi.password)).status).toBe(200);
    const ada = TEST_PEOPLE.adminAda;
    const staffSignIn = await signIn("admin", ada.email, ada.password);
    expect(staffSignIn.status).toBe(200);
    expect(staffSignIn.body).toMatchObject({ twoFactorRedirect: true });
  });

  it("keeps email sign-in links on the customer site", async () => {
    expectHidden(await request(harness.url).post("/v1/auth/sign-in/magic-link").set("origin", ADMIN_ORIGIN).set("x-hp-proxy-secret", ADMIN_SECRET).send({ email: "someone@example.com" }));
  });
});

describe("customer flows are unchanged", () => {
  it("serves the catalogue and the cart through the customer site", async () => {
    expect((await viaWeb(request(harness.url).get("/v1/catalogue/products"))).status).toBe(200);
    expect((await viaWeb(request(harness.url).get("/v1/cart"))).status).toBe(200);
  });
});
