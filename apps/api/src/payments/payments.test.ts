import { apiErrorSchema, checkoutSchema, configurationSchema, paymentStartSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { applyResult, CHECK_SCHEDULE_SECONDS, checkPaymentAttempt, processPaystackEvent } from "./payments.js";
import { customerPaymentStatus } from "./status.js";

/*
 * T04-03 payments core (TECH-05 §16, PAY-FR-001–011), against the fake
 * gateway. Webhooks go through the real route and signature check; the
 * worker's jobs are called directly.
 */

vi.setConfig({ testTimeout: 240_000 });

let harness: Harness;
let gateway: FakeGateway;
const db = () => harness.database.db;
const deps = () => ({ db: db(), gateway, notify: null });

const deviceCookie = (response: request.Response) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((cookie) => cookie.split(";")[0]).find((cookie) => cookie.startsWith("hp.device="));

/** An anonymous browser that keeps its device cookie. */
function browser() {
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
    post: (path: string, body: object = {}, key = `test_${randomUUID().replaceAll("-", "")}`) => send(request(harness.url).post(path).set("idempotency-key", key).send(body)),
    patch: (path: string, body: object) => send(request(harness.url).patch(path).send(body)),
    put: (path: string, body: object) => send(request(harness.url).put(path).send(body)),
    delete: (path: string) => send(request(harness.url).delete(path)),
    get: (path: string) => send(request(harness.url).get(path)),
    cookie: () => cookie,
  };
}
type Browser = ReturnType<typeof browser>;

const contact = { name: "Adaeze Okafor", email: "adaeze@example.com", phone: "0800 000 0000" };
const lekki = { country: "NG", name: "Adaeze Okafor", phone: "0800 000 0000", street: "12 Admiralty Way", area: "Eti-Osa", state: "Lagos", landmark: "Opposite the filling station" };

/** Business cards in a fresh browser's cart, with a checkout through billing (ready to pay). */
async function readyToPay() {
  const b = browser();
  const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
  const cards = configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body.draft);
  await b.post("/v1/cart/items", { configurationId: cards.id });
  let checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/contact`, { ...contact, version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/address`, { ...lekki, version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/delivery`, { option: "STANDARD", version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: checkout.version })).body);
  return { b, cards, checkout };
}

const pay = async (b: Browser, checkoutId: string, key?: string, body: object = {}) => b.post(`/v1/checkouts/${checkoutId}/payments`, body, key);
const startPayment = async (b: Browser, checkoutId: string) => paymentStartSchema.parse((await pay(b, checkoutId)).body);
const attemptOf = async (reference: string) => (await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, reference)))[0]!;
const intentOf = async (id: string) => (await db().select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, id)))[0]!;
const reviewsOf = async (intentId: string) => db().select().from(schema.paymentReviews).where(eq(schema.paymentReviews.intentId, intentId));
const checkoutOf = async (b: Browser, id: string) => checkoutSchema.parse((await b.get(`/v1/checkouts/${id}`)).body);
const setPayments = (on: boolean) => db().update(schema.paymentSettings).set({ onlinePayments: on }).where(eq(schema.paymentSettings.id, 1));

/** Paystack's webhook, as its servers would send it. */
const webhook = (body: Buffer, signature: string) =>
  request(harness.url).post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", signature).send(body.toString("utf8"));
const eventsFor = (reference: string) => db().select().from(schema.paystackEvents).where(eq(schema.paystackEvents.reference, reference));

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await setPayments(true);
});

afterAll(async () => {
  await harness?.close();
});

describe("starting a payment (TECH-05 §5)", () => {
  it("charges the checkout's own total, whatever the browser sends", async () => {
    const { b, checkout } = await readyToPay();
    expect(checkout.payment).toMatchObject({ available: true, status: "PAYMENT_DUE", attempt: null, channels: ["card", "bank_transfer", "ussd"] });
    const started = paymentStartSchema.parse((await pay(b, checkout.id, undefined, { amountMinor: "100", currency: "USD" })).body);
    expect(started.amountMinor).toBe(checkout.totals.totalMinor);
    expect(started.currency).toBe("NGN");
    const sent = gateway.transactions.get(started.reference)!.input;
    expect(sent.amountMinor.toString()).toBe(checkout.totals.totalMinor);
    expect(sent.email).toBe(contact.email);
    expect(sent.callbackUrl).toBe(`${TEST_WEB_ORIGIN}/checkout/${checkout.id}/processing`);
    expect(started.reference).toMatch(/^HPPAY-[0-9a-f-]{36}$/);

    const after = await checkoutOf(b, checkout.id);
    expect(after.payment).toMatchObject({ status: "PAYMENT_PENDING", attempt: { status: "PENDING", reference: started.reference } });
    const attempt = await attemptOf(started.reference);
    expect((await intentOf(attempt.intentId)).status).toBe("PROCESSING");
  });

  it("queues the checks in the TECH-05 §6 schedule", async () => {
    const { b, checkout } = await readyToPay();
    const started = await startPayment(b, checkout.id);
    const attempt = await attemptOf(started.reference);
    const jobs = await db().execute<{ check: number; delay: number }>(
      sql`select (data->>'check')::int as check, round(extract(epoch from start_after - created_on))::int as delay from pgboss.job where name = 'payment.check' and data->>'attemptId' = ${attempt.id} order by 1`,
    );
    expect(jobs.rows.map((row) => row.check)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    jobs.rows.forEach((row, index) => expect(Math.abs(row.delay - CHECK_SCHEDULE_SECONDS[index]!)).toBeLessThanOrEqual(2));
  });

  it("commits all checks before external initialization can be interrupted", async () => {
    const { b, checkout } = await readyToPay();
    let reference = "";
    const initialize = vi.spyOn(gateway, "initialize").mockImplementationOnce(async input => { reference = input.reference; throw new Error("process interrupted"); });
    try { expect((await pay(b, checkout.id)).status).toBe(500); }
    finally { initialize.mockRestore(); }
    const attempt = await attemptOf(reference);
    expect(attempt.status).toBe("CREATED");
    expect((await intentOf(attempt.intentId)).status).toBe("PROCESSING");
    const jobs = await db().execute<{ n: number }>(sql`select count(*)::int n from pgboss.job where name = 'payment.check' and data->>'attemptId' = ${attempt.id}`);
    expect(jobs.rows[0]!.n).toBe(CHECK_SCHEDULE_SECONDS.length);
    expect(await checkPaymentAttempt(deps(), attempt.id, CHECK_SCHEDULE_SECONDS.length, new Date(Date.now() + 49 * 60 * 60 * 1000))).toBe("unknown");
    expect((await intentOf(attempt.intentId)).status).toBe("REVIEW_REQUIRED");
  });

  it("keeps checks when the provider accepts but storing its response fails", async () => {
    const { b, checkout } = await readyToPay();
    let reference = "";
    let transaction: ReturnType<typeof vi.spyOn> | undefined;
    const original = gateway.initialize.bind(gateway);
    const initialize = vi.spyOn(gateway, "initialize").mockImplementationOnce(async input => {
      reference = input.reference;
      const result = await original(input);
      transaction = vi.spyOn(db(), "transaction").mockRejectedValueOnce(new Error("database commit unavailable"));
      return result;
    });
    try { expect((await pay(b, checkout.id)).status).toBe(500); }
    finally { initialize.mockRestore(); transaction?.mockRestore(); }
    const attempt = await attemptOf(reference);
    expect(attempt.status).toBe("CREATED");
    const jobs = await db().execute<{ n: number }>(sql`select count(*)::int n from pgboss.job where name = 'payment.check' and data->>'attemptId' = ${attempt.id}`);
    expect(jobs.rows[0]!.n).toBe(CHECK_SCHEDULE_SECONDS.length);
    gateway.settle(reference, { status: "success" });
    expect(await checkPaymentAttempt(deps(), attempt.id, 1)).toBe("succeeded");
    expect(await checkPaymentAttempt(deps(), attempt.id, 2)).toBe("skipped");
    expect((await db().select().from(schema.orders).where(eq(schema.orders.checkoutId, checkout.id))).length).toBe(1);
  });

  it("rolls back an unscheduled attempt before calling the provider", async () => {
    const { b, checkout } = await readyToPay();
    const initialize = vi.spyOn(gateway, "initialize");
    const send = vi.spyOn(harness.jobs, "send").mockRejectedValueOnce(new Error("queue write unavailable"));
    try {
      expect((await pay(b, checkout.id)).status).toBe(500);
      expect(initialize).not.toHaveBeenCalled();
      const rows = await db().execute<{ n: number }>(sql`select count(*)::int n from payment_attempts pa join payment_intents pi on pi.id = pa.intent_id join installments i on i.id = pi.installment_id join payment_schedules ps on ps.id = i.schedule_id where ps.checkout_id = ${checkout.id}`);
      expect(rows.rows[0]!.n).toBe(0);
    } finally { initialize.mockRestore(); send.mockRestore(); }
  });

  it("returns the same attempt for the same Idempotency-Key, and refuses a second payment while one is pending", async () => {
    const { b, checkout } = await readyToPay();
    const key = `test_${randomUUID().replaceAll("-", "")}`;
    const first = paymentStartSchema.parse((await pay(b, checkout.id, key)).body);
    const again = paymentStartSchema.parse((await pay(b, checkout.id, key)).body);
    expect(again.reference).toBe(first.reference);
    const attempts = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.intentId, (await attemptOf(first.reference)).intentId));
    expect(attempts).toHaveLength(1);

    const other = await pay(b, checkout.id);
    expect(other.status).toBe(409);
    expect(apiErrorSchema.parse(other.body).context).toMatchObject({ reason: "PAYMENT_IN_PROGRESS" });
    // After 10 minutes a new attempt may start; the double-payment rule protects the customer.
    harness.now.value = new Date(Date.now() + 11 * 60 * 1000);
    try {
      const later = await startPayment(b, checkout.id);
      expect(later.reference).not.toBe(first.reference);
    } finally {
      harness.now.value = null;
    }
  });

  it("fails the attempt and reopens the payment when Paystack can't start it", async () => {
    const { b, checkout } = await readyToPay();
    gateway.failNextInitialize = true;
    const refused = await pay(b, checkout.id);
    expect(refused.status).toBe(422);
    expect(apiErrorSchema.parse(refused.body)).toMatchObject({ message: "We couldn't start the payment. Try again.", context: { reason: "PAYMENT_START_FAILED" } });
    const view = await checkoutOf(b, checkout.id);
    expect(view.payment).toMatchObject({ status: "PAYMENT_FAILED", attempt: { status: "FAILED" } });
    const retry = await startPayment(b, checkout.id);
    expect((await attemptOf(retry.reference)).status).toBe("PENDING");
  });

  it("keeps the checkout as it is while a payment is under way", async () => {
    const { b, checkout } = await readyToPay();
    await startPayment(b, checkout.id);
    const current = await checkoutOf(b, checkout.id);
    const edit = await b.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: current.version });
    expect(edit.status).toBe(409);
    expect(apiErrorSchema.parse(edit.body).context).toMatchObject({ reason: "PAYMENT_IN_PROGRESS" });
    // "Check out" again returns the same checkout instead of replacing it.
    expect(checkoutSchema.parse((await b.post("/v1/checkouts")).body).id).toBe(checkout.id);
  });

  it("refuses to pay someone else's checkout (TECH-03 §17)", async () => {
    const { checkout } = await readyToPay();
    const stranger = browser();
    const response = await pay(stranger, checkout.id);
    expect([401, 404]).toContain(response.status);
  });

  it("shows payments as not available until they're set up, and paused when staff turn them off (TECH-05 §13)", async () => {
    const { b, checkout } = await readyToPay();
    await setPayments(false);
    try {
      const view = await checkoutOf(b, checkout.id);
      expect(view.payment.available).toBe(false);
      expect(view.blockers).toContainEqual({ code: "PAYMENTS_PAUSED", message: "Online payment is paused. We'll email you when it's back." });
      const refused = await pay(b, checkout.id);
      expect(refused.status).toBe(422);
      expect(apiErrorSchema.parse(refused.body).context).toMatchObject({ reason: "PAYMENTS_PAUSED" });
    } finally {
      await setPayments(true);
    }

    const unset = await createHarness({ payments: null, database: harness.database });
    try {
      const view = checkoutSchema.parse((await request(unset.url).get(`/v1/checkouts/${checkout.id}`).set("origin", TEST_WEB_ORIGIN).set("cookie", b.cookie())).body);
      expect(view.blockers.map((blocker) => blocker.code)).toContain("PAYMENTS_NOT_AVAILABLE");
    } finally {
      await unset.close();
    }
  });
});

describe("finding out the result (TECH-05 §6–7)", () => {
  it("credits a verified webhook once, however often Paystack sends it", async () => {
    const { b, cards, checkout } = await readyToPay();
    const started = await startPayment(b, checkout.id);
    gateway.settle(started.reference, { status: "success" });
    const { body, signature } = gateway.webhook("charge.success", started.reference, { id: 9001 });
    expect((await webhook(body, signature)).status).toBe(200);
    expect((await webhook(body, signature)).status).toBe(200);
    const events = await eventsFor(started.reference);
    expect(events).toHaveLength(1);
    expect(events[0]!.rawBody).toBe(body.toString());

    expect(await processPaystackEvent(deps(), events[0]!.id)).toBe("succeeded");
    expect(await processPaystackEvent(deps(), events[0]!.id)).toBe("skipped");

    const attempt = await attemptOf(started.reference);
    const intent = await intentOf(attempt.intentId);
    expect(attempt).toMatchObject({ status: "SUCCEEDED", channel: "card", gatewayResponse: "Approved" });
    expect(intent).toMatchObject({ status: "SUCCEEDED", succeededAttemptId: attempt.id });
    const view = await checkoutOf(b, checkout.id);
    expect(view.status).toBe("COMPLETED");
    expect(view.payment.status).toBe("PAID");
    // The paid design is ordered and has left the cart.
    const [design] = await db().select().from(schema.configurations).where(eq(schema.configurations.id, cards.id));
    expect(design!.status).toBe("ORDERED");
    expect(await db().select().from(schema.cartItems).where(eq(schema.cartItems.configurationId, cards.id))).toHaveLength(0);
    // A later check changes nothing.
    expect(await checkPaymentAttempt(deps(), attempt.id, 3)).toBe("skipped");
    const audit = await db().select().from(schema.auditLog).where(eq(schema.auditLog.recordId, intent.id));
    expect(audit.map((entry) => entry.action)).toContain("payment.succeeded");
  });

  it("rejects a forged webhook and saves nothing", async () => {
    const { b, checkout } = await readyToPay();
    const started = await startPayment(b, checkout.id);
    const forged = gateway.webhook("charge.success", started.reference, { signedWith: "sk_test_someone_else" });
    const response = await webhook(forged.body, forged.signature);
    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(response.body).context).toMatchObject({ reason: "BAD_SIGNATURE" });
    expect((await webhook(forged.body, "")).status).toBe(403);
    expect(await eventsFor(started.reference)).toHaveLength(0);
  });

  it("never trusts the webhook's own words: the verify API decides", async () => {
    const { b, checkout } = await readyToPay();
    const started = await startPayment(b, checkout.id);
    // The webhook claims success; Paystack's verify still says not paid.
    const { body, signature } = gateway.webhook("charge.success", started.reference);
    await webhook(body, signature);
    const [event] = await eventsFor(started.reference);
    expect(await processPaystackEvent(deps(), event!.id)).toBe("unchanged");
    expect((await attemptOf(started.reference)).status).toBe("PENDING");
  });

  it("leaves a closed popup as Processing until a check settles it", async () => {
    const { b, checkout } = await readyToPay();
    const started = await startPayment(b, checkout.id);
    const attempt = await attemptOf(started.reference);
    // Paystack says "abandoned" while the customer may still be choosing a method.
    expect(await checkPaymentAttempt(deps(), attempt.id, 1)).toBe("unchanged");
    expect((await checkoutOf(b, checkout.id)).payment.status).toBe("PAYMENT_PENDING");
    // Later checks settle it: the customer can try again.
    expect(await checkPaymentAttempt(deps(), attempt.id, 3, new Date(Date.now() + 31 * 60 * 1000))).toBe("abandoned");
    const view = await checkoutOf(b, checkout.id);
    expect(view.payment).toMatchObject({ status: "PAYMENT_FAILED", attempt: { status: "ABANDONED" } });
    expect((await intentOf(attempt.intentId)).status).toBe("OPEN");
    expect((await attemptOf(started.reference)).checks).toHaveLength(2);
  });

  it("marks a failed payment and lets the customer pay again on the same checkout", async () => {
    const { b, checkout } = await readyToPay();
    const first = await startPayment(b, checkout.id);
    gateway.settle(first.reference, { status: "failed" });
    expect(await checkPaymentAttempt(deps(), (await attemptOf(first.reference)).id, 1)).toBe("failed");
    expect((await checkoutOf(b, checkout.id)).payment).toMatchObject({ status: "PAYMENT_FAILED", attempt: { status: "FAILED", message: "Payment failed — try again" } });
    const second = await startPayment(b, checkout.id);
    gateway.settle(second.reference, { status: "success" });
    expect(await checkPaymentAttempt(deps(), (await attemptOf(second.reference)).id, 1)).toBe("succeeded");
    expect((await checkoutOf(b, checkout.id)).payment.status).toBe("PAID");
  });

  it("marks the attempt UNKNOWN after 48 hours without an answer and opens a review", async () => {
    const { b, checkout } = await readyToPay();
    const started = await startPayment(b, checkout.id);
    gateway.settle(started.reference, { status: "pending" });
    const attempt = await attemptOf(started.reference);
    for (let check = 1; check < CHECK_SCHEDULE_SECONDS.length; check += 1) expect(await checkPaymentAttempt(deps(), attempt.id, check)).toBe("unchanged");
    expect(await checkPaymentAttempt(deps(), attempt.id, CHECK_SCHEDULE_SECONDS.length)).toBe("unknown");
    expect((await attemptOf(started.reference)).status).toBe("UNKNOWN");
    expect((await intentOf(attempt.intentId)).status).toBe("REVIEW_REQUIRED");
    expect((await reviewsOf(attempt.intentId)).map((review) => review.reason)).toEqual(["UNCLEAR_RESULT"]);
    expect((await checkoutOf(b, checkout.id)).payment.status).toBe("PAYMENT_RESOLUTION_REQUIRED");
    // Running the last check again opens no second case.
    await checkPaymentAttempt(deps(), attempt.id, CHECK_SCHEDULE_SECONDS.length);
    expect(await reviewsOf(attempt.intentId)).toHaveLength(1);
  });

  it("opens a review and doesn't credit the order when the amount or currency is wrong", async () => {
    for (const wrong of [{ amountMinor: 100n }, { currency: "USD" }]) {
      const { b, checkout } = await readyToPay();
      const started = await startPayment(b, checkout.id);
      gateway.settle(started.reference, { status: "success", ...wrong });
      const attempt = await attemptOf(started.reference);
      expect(await checkPaymentAttempt(deps(), attempt.id, 1)).toBe("mismatch");
      expect((await attemptOf(started.reference)).status).toBe("SUCCEEDED");
      expect((await intentOf(attempt.intentId)).status).toBe("REVIEW_REQUIRED");
      expect((await reviewsOf(attempt.intentId)).map((review) => review.reason)).toEqual(["AMOUNT_MISMATCH"]);
      const view = await checkoutOf(b, checkout.id);
      expect(view.status).toBe("OPEN");
      expect(view.payment.status).toBe("PAYMENT_RESOLUTION_REQUIRED");
    }
  });

  it("credits two successful attempts once and opens a DUPLICATE_PAYMENT review", async () => {
    const { b, checkout } = await readyToPay();
    const first = await startPayment(b, checkout.id);
    harness.now.value = new Date(Date.now() + 11 * 60 * 1000);
    let second;
    try {
      second = await startPayment(b, checkout.id);
    } finally {
      harness.now.value = null;
    }
    gateway.settle(first.reference, { status: "success" });
    gateway.settle(second.reference, { status: "success" });
    const firstAttempt = await attemptOf(first.reference);
    const secondAttempt = await attemptOf(second.reference);
    // Both results arrive at once, as from two tabs.
    const results = await Promise.all([
      applyResult({ db: db(), notify: null }, firstAttempt.id, await gateway.verify(first.reference), { source: "webhook", now: new Date() }),
      applyResult({ db: db(), notify: null }, secondAttempt.id, await gateway.verify(second.reference), { source: "webhook", now: new Date() }),
    ]);
    expect(results.sort()).toEqual(["duplicate", "succeeded"]);
    const intent = await intentOf(firstAttempt.intentId);
    expect(intent.status).toBe("REVIEW_REQUIRED");
    expect([firstAttempt.id, secondAttempt.id]).toContain(intent.succeededAttemptId);
    expect((await reviewsOf(intent.id)).map((review) => review.reason)).toEqual(["DUPLICATE_PAYMENT"]);
    // Both records are kept; the checkout completed once.
    expect((await attemptOf(first.reference)).status).toBe("SUCCEEDED");
    expect((await attemptOf(second.reference)).status).toBe("SUCCEEDED");
    expect((await checkoutOf(b, checkout.id)).status).toBe("COMPLETED");
  });

  it("keeps checking old attempts while payments are paused", async () => {
    const { b, checkout } = await readyToPay();
    const started = await startPayment(b, checkout.id);
    await setPayments(false);
    try {
      gateway.settle(started.reference, { status: "success" });
      expect(await checkPaymentAttempt(deps(), (await attemptOf(started.reference)).id, 1)).toBe("succeeded");
    } finally {
      await setPayments(true);
    }
  });
});

describe("customer payment status (TECH-01 §4)", () => {
  const one = (status: "NOT_DUE" | "DUE" | "PROCESSING" | "PAID", latestAttempt: "FAILED" | "SUCCEEDED" | null = null, position = 1) => ({ position, status, latestAttempt });
  it("follows the listed order: the first rule that matches wins", () => {
    expect(customerPaymentStatus({ installments: [one("PROCESSING")], needsResolution: true })).toBe("PAYMENT_RESOLUTION_REQUIRED");
    expect(customerPaymentStatus({ installments: [one("PAID")], needsResolution: false, paidMinor: 100n, refundedMinor: 100n })).toBe("REFUNDED");
    expect(customerPaymentStatus({ installments: [one("PAID")], needsResolution: false, paidMinor: 100n, refundedMinor: 40n })).toBe("PARTIALLY_REFUNDED");
    expect(customerPaymentStatus({ installments: [one("PROCESSING")], needsResolution: false })).toBe("PAYMENT_PENDING");
    expect(customerPaymentStatus({ installments: [one("DUE", "FAILED")], needsResolution: false })).toBe("PAYMENT_FAILED");
    expect(customerPaymentStatus({ installments: [one("DUE")], needsResolution: false })).toBe("PAYMENT_DUE");
    expect(customerPaymentStatus({ installments: [one("DUE"), one("NOT_DUE", null, 2)], needsResolution: false })).toBe("DEPOSIT_DUE");
    expect(customerPaymentStatus({ installments: [one("PAID"), one("DUE", null, 2)], needsResolution: false })).toBe("BALANCE_DUE");
    expect(customerPaymentStatus({ installments: [one("PAID"), one("PAID", null, 2)], needsResolution: false })).toBe("PAID");
    expect(customerPaymentStatus({ installments: [one("PAID"), one("NOT_DUE", null, 2)], needsResolution: false })).toBe("DEPOSIT_PAID");
    expect(customerPaymentStatus({ installments: [], needsResolution: false })).toBeNull();
  });
});
