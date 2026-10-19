import { TEST_PEOPLE } from "@holypearls/auth";
import { accountListSchema, meSchema } from "@holypearls/contracts";
import { and, eq, schema } from "@holypearls/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { as, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T09-01b: changing the account email and the full history lists (PRD-00 §5;
 * TECH-03 §4; Pen 91). Done when: a new email is used only after it is
 * verified, and changing it ends other sessions.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let actors: Partial<Actors>;
const db = () => harness.database.db;
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
const auth = (path: string, body: object, cookie = "") =>
  request(harness.url).post(`/v1/auth${path}`).set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).set("content-type", "application/json").send(body);
const apiPath = (url: string) => url.replace(`${TEST_WEB_ORIGIN}/api`, "");
const mails = (to: string, kind: "VERIFY_EMAIL" | "CHANGE_EMAIL") => harness.outbox.sent.filter((email) => email.to === to && email.kind === kind);
const me = async (cookie: string) => {
  const response = await as(harness, cookie).get("/v1/me");
  return response.status === 200 ? meSchema.parse(response.body) : null;
};

/** A verified account signed in on two devices. */
async function verifiedOnTwoDevices() {
  const email = `change.${randomUUID().slice(0, 8)}@example.com`;
  expect((await auth("/sign-up/email", { name: "Changer (TEST DATA)", email, password: PASSWORD, callbackURL: "/account" })).status).toBe(200);
  const opened = await request(harness.url).get(apiPath(mails(email, "VERIFY_EMAIL").at(-1)!.url)).set("origin", TEST_WEB_ORIGIN);
  const laptop = cookiesFrom(opened);
  const phone = cookiesFrom(await auth("/sign-in/email", { email, password: PASSWORD }));
  expect((await me(laptop))?.emailVerified).toBe(true);
  expect(await me(phone)).not.toBeNull();
  return { email, laptop, phone };
}

beforeAll(async () => {
  harness = await createHarness();
  actors = await signInActors(harness, ["customerChidi"]);
});

afterEach(() => {
  harness.now.value = null;
});

afterAll(async () => {
  await harness?.close();
});

describe("changing the account email (TECH-03 §4)", () => {
  it("a new email is used only after it is verified, and verifying it ends every other session", async () => {
    const { email, laptop, phone } = await verifiedOnTwoDevices();
    const newEmail = `new.${randomUUID().slice(0, 8)}@example.com`;

    // Asking for the change: a check goes to the new address; the account keeps the old one (Pen 91 "Email change pending").
    expect((await auth("/change-email", { newEmail, callbackURL: "/account/profile?email=changed" }, laptop)).status).toBe(200);
    expect(mails(newEmail, "CHANGE_EMAIL")).toHaveLength(1);
    expect(mails(email, "CHANGE_EMAIL")).toHaveLength(0);
    expect(await me(laptop)).toMatchObject({ email, pendingEmail: newEmail });
    // Until it's verified the new address signs nobody in, and the old one still works.
    expect((await auth("/sign-in/email", { email: newEmail, password: PASSWORD })).status).toBe(401);
    expect((await auth("/sign-in/email", { email, password: PASSWORD })).status).toBe(200);

    // The link is opened on another device: the email changes, that device is signed in, and every other session ends.
    const opened = await request(harness.url).get(apiPath(mails(newEmail, "CHANGE_EMAIL")[0]!.url)).set("origin", TEST_WEB_ORIGIN);
    expect([200, 302]).toContain(opened.status);
    const tablet = cookiesFrom(opened);
    expect(await me(tablet)).toMatchObject({ email: newEmail, emailVerified: true, pendingEmail: null });
    expect(await me(laptop)).toBeNull();
    expect(await me(phone)).toBeNull();
    expect((await auth("/sign-in/email", { email: newEmail, password: PASSWORD })).status).toBe(200);
    expect((await auth("/sign-in/email", { email, password: PASSWORD })).status).toBe(401);
    const [user] = await db().select().from(schema.users).where(eq(schema.users.email, newEmail));
    const audit = await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.recordId, user!.id), eq(schema.auditLog.action, "security.email_changed")));
    expect(audit).toHaveLength(1);
  });

  it("an address that already has an account looks the same, and a pending change lapses with its link", async () => {
    const { email, laptop } = await verifiedOnTwoDevices();
    const taken = TEST_PEOPLE.customerChidi.email;
    // Same reply and same pending state, so nobody learns whether the address has an account; no check is sent to it.
    expect((await auth("/change-email", { newEmail: taken, callbackURL: "/account/profile" }, laptop)).status).toBe(200);
    expect(await me(laptop)).toMatchObject({ email, pendingEmail: taken });
    expect(mails(taken, "CHANGE_EMAIL")).toHaveLength(0);
    // After the 24-hour link expires, nothing is pending.
    harness.now.value = new Date(Date.now() + 25 * 3_600_000);
    expect((await as(harness, laptop).get("/v1/me")).body.pendingEmail ?? null).toBeNull();
    // Signed out, nothing can be changed.
    expect((await auth("/change-email", { newEmail: `x.${randomUUID().slice(0, 6)}@example.com` })).status).toBe(401);
  });
});

describe("history lists (PRD-00 §5)", () => {
  it("each list is the account's own, in full; unknown lists are 404 and signed-out requests 401", async () => {
    for (const list of ["orders", "quotes", "projects", "drafts", "receipts"]) {
      const response = await as(harness, actors.customerChidi!).get(`/v1/me/history/${list}`);
      expect(response.status).toBe(200);
      accountListSchema.parse(response.body);
    }
    expect((await as(harness, actors.customerChidi!).get("/v1/me/history/payments")).status).toBe(404);
    expect((await as(harness, "").get("/v1/me/history/orders")).status).toBe(401);
  });
});
