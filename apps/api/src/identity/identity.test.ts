import { Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { STAFF_SESSION_SECONDS, TEST_PEOPLE, totpCode } from "@holypearls/auth";
import { adminMeSchema, apiErrorSchema, meSchema, sessionListSchema } from "@holypearls/contracts";
import type { Request } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { requireRecentMfa } from "./actor.js";
import { StaffGuard } from "./staff.guard.js";

// Test-only routes that exercise the staff guard and the MFA recency helper.
@Controller("admin/_probe")
class ProbeController {
  @Get("payments")
  @UseGuards(StaffGuard("PAYMENT_MANAGE"))
  payments() {
    return { ok: true };
  }

  @Get("catalogue")
  @UseGuards(StaffGuard("CATALOGUE_MANAGE"))
  catalogue() {
    return { ok: true };
  }

  @Post("high-risk")
  @HttpCode(200)
  @UseGuards(StaffGuard("STAFF_ADMIN"))
  async highRisk(@Req() req: Request) {
    requireRecentMfa(await req.getActor!());
    return { ok: true };
  }
}

let harness: Harness;
const http = () => request(harness.url);
const post = (path: string, cookie = "") =>
  http().post(path).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).set("content-type", "application/json");
const errorOf = (body: unknown) => apiErrorSchema.parse(body);

/** Applies a response's Set-Cookie headers to a Cookie header, replacing by name. */
function mergeCookies(cookie: string, setCookies: string[] | undefined): string {
  const jar = new Map(cookie.split("; ").filter(Boolean).map((pair) => [pair.split("=")[0]!, pair] as const));
  for (const line of setCookies ?? []) {
    const pair = line.split(";")[0]!;
    jar.set(pair.split("=")[0]!, pair);
  }
  return [...jar.values()].join("; ");
}

beforeAll(async () => {
  harness = await createHarness({ controllers: [ProbeController] });
});

afterAll(async () => {
  await harness?.close();
});

describe("sign-in (TECH-03 §3)", () => {
  it("signs in with email and password and serves the signed-in person", async () => {
    const cookie = await harness.signInAs("customerChidi");
    const response = await http().get("/v1/me").set("cookie", cookie);
    expect(response.status).toBe(200);
    const me = meSchema.parse(response.body);
    expect(me).toMatchObject({ email: TEST_PEOPLE.customerChidi.email, isStaff: false, mfa: { enabled: false } });
  });

  it("sets an HttpOnly, SameSite=Lax session cookie on the site's own domain", async () => {
    const response = await post(`/v1/auth/sign-in/email`).send({
      email: TEST_PEOPLE.customerChidi.email,
      password: TEST_PEOPLE.customerChidi.password,
    });
    expect(response.status).toBe(200);
    const sessionCookie = (response.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("hp.session_token="),
    )!;
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).not.toMatch(/Domain=/i);
    // No token in the response body for scripts to store (no localStorage tokens).
    const token = decodeURIComponent(sessionCookie.split(";")[0]!.split("=")[1]!).split(".")[0]!;
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(response.body).not.toHaveProperty("token");
  });

  it("returns 401 in the error shape for a wrong password", async () => {
    const response = await post("/v1/auth/sign-in/email").send({
      email: TEST_PEOPLE.customerChidi.email,
      password: "not-the-password-at-all",
    });
    expect(response.status).toBe(401);
    expect(errorOf(response.body)).toMatchObject({ code: "NOT_SIGNED_IN", context: { reason: "INVALID_EMAIL_OR_PASSWORD" } });
  });

  it("returns 401 for /v1/me without a session", async () => {
    const response = await http().get("/v1/me");
    expect(response.status).toBe(401);
    expect(errorOf(response.body).code).toBe("NOT_SIGNED_IN");
  });

  it("does not allow sign-up before the customer sign-up screens exist", async () => {
    const response = await post("/v1/auth/sign-up/email").send({
      email: "new.person@holypearls.test",
      password: "a-long-enough-password",
      name: "New",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("signs in with a magic link sent to the outbox", async () => {
    const email = TEST_PEOPLE.customerChidi.email;
    const send = await post("/v1/auth/sign-in/magic-link").send({ email, callbackURL: "/account/security" });
    expect(send.status).toBe(200);
    const link = harness.outbox.latestTo(email);
    expect(link?.url).toContain("/api/v1/auth/magic-link/verify?token=");

    // The link points at the web app's /api forwarding; call the API path directly.
    const verifyPath = new URL(link!.url).pathname.replace(/^\/api/, "") + new URL(link!.url).search;
    const verify = await http().get(verifyPath);
    expect(verify.status).toBe(302);
    expect(verify.headers.location).toBe(`${TEST_WEB_ORIGIN}/account/security`);
    const cookie = (verify.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");
    expect((await http().get("/v1/me").set("cookie", cookie)).status).toBe(200);

    // Links work once.
    const reuse = await http().get(verifyPath);
    expect(reuse.headers.location).toMatch(/error=/);
  });

  it("never logs passwords, links or cookies", () => {
    const output = harness.logs.join("\n");
    expect(output).not.toContain(TEST_PEOPLE.customerChidi.password);
    expect(output).not.toContain("hp.session_token=");
    expect(output).not.toContain("magic-link/verify?token=");
  });
});

describe("sessions (TECH-03 §4)", () => {
  it("customer sessions last 30 days", async () => {
    const me = meSchema.parse((await http().get("/v1/me").set("cookie", await harness.signInAs("customerChidi"))).body);
    const days = (Date.parse(me.session.expiresAt) - Date.parse(me.session.createdAt)) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it("staff sessions last 12 hours", async () => {
    const me = meSchema.parse((await http().get("/v1/me").set("cookie", await harness.signInAs("adminTunde"))).body);
    const hours = (Date.parse(me.session.expiresAt) - Date.parse(me.session.createdAt)) / 3_600_000;
    expect(Math.round(hours)).toBe(12);
  });

  it("ends a staff session after 12 hours even if it was refreshed", async () => {
    const cookie = await harness.signInAs("adminTunde");
    harness.now.value = new Date(Date.now() + STAFF_SESSION_SECONDS * 1000 + 60_000);
    try {
      expect((await http().get("/v1/me").set("cookie", cookie)).status).toBe(401);
    } finally {
      harness.now.value = null;
    }
  });

  it("lists sessions, then signs out everywhere", async () => {
    const first = await harness.signInAs("customerChidi");
    const second = await harness.signInAs("customerChidi");
    const list = sessionListSchema.parse((await http().get("/v1/me/sessions").set("cookie", second)).body);
    expect(list.sessions.length).toBeGreaterThanOrEqual(2);
    expect(list.sessions.filter((session) => session.current)).toHaveLength(1);

    const revoke = await post("/v1/me/sessions/revoke-all", second);
    expect(revoke.status).toBe(200);
    expect((await http().get("/v1/me").set("cookie", first)).status).toBe(401);
    expect((await http().get("/v1/me").set("cookie", second)).status).toBe(401);
  });

  it("signs out one session", async () => {
    const cookie = await harness.signInAs("customerChidi");
    const signOut = await post("/v1/auth/sign-out", cookie).send({});
    expect(signOut.status).toBe(200);
    expect((await http().get("/v1/me").set("cookie", cookie)).status).toBe(401);
  });
});

describe("cross-site request protection (TECH-03 §13)", () => {
  it("refuses a state-changing request from another origin", async () => {
    const cookie = await harness.signInAs("customerChidi");
    const response = await http()
      .post("/v1/me/sessions/revoke-all")
      .set("origin", "https://evil.example")
      .set("cookie", cookie);
    expect(response.status).toBe(403);
    expect(errorOf(response.body)).toMatchObject({ code: "FORBIDDEN", context: { reason: "ORIGIN_NOT_ALLOWED" } });
    expect((await http().get("/v1/me").set("cookie", cookie)).status).toBe(200);
  });

  it("refuses a cookie-carrying state change with no Origin", async () => {
    const cookie = await harness.signInAs("customerChidi");
    const response = await http().post("/v1/me/sessions/revoke-all").set("cookie", cookie);
    expect(response.status).toBe(403);
  });

  it("refuses a sign-in attempt from another origin", async () => {
    const response = await http()
      .post("/v1/auth/sign-in/email")
      .set("origin", "https://evil.example")
      .send({ email: TEST_PEOPLE.customerChidi.email, password: TEST_PEOPLE.customerChidi.password });
    expect(response.status).toBe(403);
  });
});

describe("staff access (TECH-03 §8, §10)", () => {
  it("returns 404 on admin routes to signed-out people and non-staff", async () => {
    expect((await http().get("/v1/admin/me")).status).toBe(404);
    const customer = await harness.signInAs("customerChidi");
    const response = await http().get("/v1/admin/me").set("cookie", customer);
    expect(response.status).toBe(404);
    expect(errorOf(response.body).code).toBe("NOT_FOUND");
  });

  it("blocks staff without MFA with MFA_REQUIRED", async () => {
    const cookie = await harness.signInAs("catalogueNoMfa");
    const response = await http().get("/v1/admin/me").set("cookie", cookie);
    expect(response.status).toBe(403);
    expect(errorOf(response.body)).toMatchObject({ code: "MFA_REQUIRED", context: { mfaEnabled: false } });
  });

  it("requires the authenticator code before a staff session exists", async () => {
    const person = TEST_PEOPLE.adminAda;
    const response = await post("/v1/auth/sign-in/email").send({ email: person.email, password: person.password });
    expect(response.body).toMatchObject({ twoFactorRedirect: true });
    const cookie = (response.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");
    expect((await http().get("/v1/me").set("cookie", cookie)).status).toBe(401);

    const wrong = await post("/v1/auth/two-factor/verify-totp", cookie).send({ code: "000000" });
    expect(wrong.status).toBe(401);
    expect(errorOf(wrong.body).code).toBe("NOT_SIGNED_IN");
  });

  it("lets staff with MFA into admin and returns their permissions", async () => {
    const cookie = await harness.signInAs("adminAda");
    const response = await http().get("/v1/admin/me").set("cookie", cookie);
    expect(response.status).toBe(200);
    const me = adminMeSchema.parse(response.body);
    expect(me.permissions).toEqual(["AUDIT_VIEW", "CUSTOMER_SUPPORT", "PAYMENT_VIEW", "SECURITY_ADMIN", "STAFF_ADMIN"]);
  });

  it("returns 403 when staff lack the route's permission", async () => {
    const cookie = await harness.signInAs("adminAda");
    const response = await http().get("/v1/admin/_probe/payments").set("cookie", cookie);
    expect(response.status).toBe(403);
    expect(errorOf(response.body)).toMatchObject({ code: "FORBIDDEN", context: { permission: "PAYMENT_MANAGE" } });
    expect((await http().get("/v1/admin/_probe/catalogue").set("cookie", cookie)).status).toBe(403);
  });

  it("allows a high-risk action within 15 minutes of MFA and asks again after", async () => {
    const cookie = await harness.signInAs("adminAda");
    expect((await post("/v1/admin/_probe/high-risk", cookie).send({})).status).toBe(200);

    await harness.database.db.execute(
      (await import("@holypearls/db")).sql`update sessions set mfa_verified_at = now() - interval '16 minutes'`,
    );
    const stale = await post("/v1/admin/_probe/high-risk", cookie).send({});
    expect(stale.status).toBe(403);
    expect(errorOf(stale.body).code).toBe("RECENT_MFA_REQUIRED");

    // Step-up: verify the authenticator again in the same session.
    const stepUp = await post("/v1/auth/two-factor/verify-totp", cookie).send({
      code: await totpCode(TEST_PEOPLE.adminAda.totpSecret),
    });
    expect(stepUp.status).toBe(200);
    expect((await post("/v1/admin/_probe/high-risk", cookie).send({})).status).toBe(200);
  });

  it("lets staff without MFA enrol an authenticator and then enter admin", async () => {
    const person = TEST_PEOPLE.catalogueNoMfa;
    const cookie = await harness.signInAs("catalogueNoMfa");
    const enable = await post("/v1/auth/two-factor/enable", cookie).send({ password: person.password });
    expect(enable.status).toBe(200);
    const secret = new URL(enable.body.totpURI as string).searchParams.get("secret")!;

    const { createOTP } = await import("@better-auth/utils/otp");
    const { base32 } = await import("@better-auth/utils/base32");
    const raw = new TextDecoder().decode(base32.decode(secret));
    const code = await createOTP(raw, { digits: 6, period: 30 }).totp();
    const verify = await post("/v1/auth/two-factor/verify-totp", cookie).send({ code });
    expect(verify.status).toBe(200);
    const verifiedCookie = mergeCookies(cookie, verify.headers["set-cookie"] as unknown as string[] | undefined);

    const response = await http().get("/v1/admin/_probe/catalogue").set("cookie", verifiedCookie);
    expect(response.status).toBe(200);
  });

  it("returns 404 for a deactivated staff member", async () => {
    const cookie = await harness.signInAs("adminTunde");
    await harness.database.db.execute(
      (await import("@holypearls/db")).sql`update staff_profiles set status = 'DEACTIVATED' where display_name like 'Tunde%'`,
    );
    try {
      expect((await http().get("/v1/admin/me").set("cookie", cookie)).status).toBe(404);
    } finally {
      await harness.database.db.execute(
        (await import("@holypearls/db")).sql`update staff_profiles set status = 'ACTIVE' where display_name like 'Tunde%'`,
      );
    }
  });
});

describe("monitoring test error (T00-04)", () => {
  it("lets SECURITY_ADMIN staff raise a deliberate 500 and refuses everyone else", async () => {
    const ada = await harness.signInAs("adminAda");
    const response = await post("/v1/admin/monitoring/test-error", ada).send({});
    expect(response.status).toBe(500);
    expect(errorOf(response.body).code).toBe("INTERNAL");
    expect(harness.logs.some((line) => line.includes("Monitoring test error"))).toBe(true);

    const tunde = await harness.signInAs("adminTunde");
    expect((await post("/v1/admin/monitoring/test-error", tunde).send({})).status).toBe(403);
    expect((await post("/v1/admin/monitoring/test-error").send({})).status).toBe(404);
  });
});

describe("sign-in rate limits", () => {
  it("returns 429 RATE_LIMITED after repeated failed sign-ins", { timeout: 180_000 }, async () => {
    const limited = await createHarness({ rateLimit: true });
    try {
      let last = 0;
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const response = await request(limited.url)
          .post("/v1/auth/sign-in/email")
          .set("origin", TEST_WEB_ORIGIN)
          .send({ email: TEST_PEOPLE.customerChidi.email, password: "wrong-password-attempt" });
        last = response.status;
        if (last === 429) {
          expect(errorOf(response.body).code).toBe("RATE_LIMITED");
          break;
        }
      }
      expect(last).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
