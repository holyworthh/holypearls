import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T15-01, TECH-06 §13: the abuse limits of TECH-02 §14 for guest links, email
 * codes, uploads and contact forms, and the front end's own cached reads.
 * (Sign-in is covered in identity.test.ts; drafts in abuse-quotes-retention.test.ts.)
 */

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

const SECRET = "web-proxy-secret-for-tests-0123456789ab";

let harness: Harness;
let limited: Harness;

/** Through the customer site's proxy, vouching for one visitor's address (or for none, as the site's own server does). */
const asVisitor = (test: request.Test, ip?: string) => {
  test.set("origin", TEST_WEB_ORIGIN).set("x-hp-proxy-secret", SECRET);
  return ip ? test.set("x-hp-client-ip", ip) : test;
};

const post = (path: string, ip: string, body: object = {}) => asVisitor(request(limited.url).post(path), ip).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body);

/** Sends `count` requests and returns each status; one frozen clock keeps them in one window. */
async function burst(count: number, send: () => request.Test) {
  const statuses: number[] = [];
  for (let index = 0; index < count; index += 1) statuses.push((await send()).status);
  return statuses;
}

beforeAll(async () => {
  harness = await createHarness();
  limited = await createHarness({ rateLimit: true, proxySecret: SECRET, database: harness.database });
  limited.now.value = new Date();
});

afterAll(async () => {
  await limited?.close();
  await harness?.close();
});

describe("guest links and email codes (TECH-06 §13)", () => {
  it("stops guessing at guest links: the 11th try in a minute is 429 with a retry time", async () => {
    const secret = "A".repeat(43);
    const statuses = await burst(10, () => post("/v1/guest-links/redeem", "198.51.100.1", { secret }));
    expect(statuses.every((status) => status !== 429)).toBe(true);
    const blocked = await post("/v1/guest-links/redeem", "198.51.100.1", { secret });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    // Another visitor is not affected.
    expect((await post("/v1/guest-links/redeem", "198.51.100.2", { secret })).status).not.toBe(429);
  });

  it("stops asking for codes: the 11th request in a minute is 429", async () => {
    const statuses = await burst(10, () => post("/v1/email-codes", "198.51.100.3", { purpose: "ACCEPT_QUOTE" }));
    expect(statuses.every((status) => status !== 429)).toBe(true);
    expect((await post("/v1/email-codes", "198.51.100.3", { purpose: "ACCEPT_QUOTE" })).status).toBe(429);
  });
});

describe("uploads and contact forms (TECH-06 §13)", () => {
  it("allows 30 upload intents an hour per person, then 429", async () => {
    const chidi = await limited.signInAs("customerChidi");
    const intent = () =>
      request(limited.url)
        .post("/v1/files/uploads")
        .set("origin", TEST_WEB_ORIGIN)
        .set("cookie", chidi)
        .set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`)
        .send({ purpose: "ARTWORK", fileName: "logo.png", size: 1000, contentType: "image/png" });
    const statuses = await burst(30, intent);
    expect(statuses.every((status) => status === 201)).toBe(true);
    expect((await intent()).status).toBe(429);
  });

  it("allows 5 help requests from one address in ten minutes, then 429", async () => {
    const statuses = await burst(5, () => post("/v1/help-requests", "198.51.100.4"));
    expect(statuses.every((status) => status !== 429)).toBe(true);
    expect((await post("/v1/help-requests", "198.51.100.4")).status).toBe(429);
  });
});

describe("the site's own catalogue reads", () => {
  const read = (ip?: string) => asVisitor(request(limited.url).get("/v1/catalogue/categories"), ip);

  it("are not counted against one address, but a visitor's own reads are (300 a minute)", async () => {
    expect((await burst(305, () => read())).includes(429)).toBe(false);
    const statuses = await burst(301, () => read("198.51.100.5"));
    expect(statuses.slice(0, 300).includes(429)).toBe(false);
    expect(statuses[300]).toBe(429);
  });
});
