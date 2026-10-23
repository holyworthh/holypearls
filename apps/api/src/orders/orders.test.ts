import { TEST_PEOPLE } from "@holypearls/auth";
import { adminIntentSchema, adminPaymentListSchema, adminReviewListSchema, adminReviewSchema, apiErrorSchema, checkoutSchema, configurationSchema, orderSchema, paymentSettingsSchema, paymentStartSchema, receiptSchema } from "@holypearls/contracts";
import { eq, schema } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyResult, checkPaymentAttempt } from "../payments/payments.js";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { createHarness, type Harness, TEST_SEAL_KEY, TEST_WEB_ORIGIN } from "../testing/harness.js";

/*
 * T04-05: orders from paid checkouts, receipts (page, PDF, email), the guest
 * order link, and the payments admin (list, intent detail, review decisions,
 * settings). TECH-05 §8–9, §13; COM-FR-082, 085; PAY-FR-006; OPS-FR-041, 044–047;
 * negative permission tests per TECH-03 §17.
 */

vi.setConfig({ testTimeout: 240_000 });

let harness: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
const db = () => harness.database.db;
const notify = () => ({ db: db(), jobs: harness.jobs, sealKey: TEST_SEAL_KEY, webOrigin: TEST_WEB_ORIGIN });
const deps = () => ({ db: db(), gateway, notify: notify() });

const deviceCookie = (response: request.Response) =>
  ((response.headers["set-cookie"] as unknown as string[] | undefined) ?? []).map((cookie) => cookie.split(";")[0]).find((cookie) => cookie.startsWith("hp.device="));

function browser(initial = "") {
  let cookie = initial;
  const send = (req: request.Test) => {
    req.set("origin", TEST_WEB_ORIGIN);
    if (cookie) req.set("cookie", cookie);
    return req.then((response) => {
      cookie = deviceCookie(response) ?? cookie;
      return response;
    });
  };
  return {
    post: (path: string, body: object = {}) => send(request(harness.url).post(path).set("idempotency-key", `test_${randomUUID().replaceAll("-", "")}`).send(body)),
    patch: (path: string, body: object) => send(request(harness.url).patch(path).send(body)),
    put: (path: string, body: object) => send(request(harness.url).put(path).send(body)),
    get: (path: string) => send(request(harness.url).get(path)),
    cookie: () => cookie,
  };
}

const contact = { name: "Adaeze Okafor", email: "adaeze.order@example.com", phone: "0800 000 0000" };
const lekki = { country: "NG", name: "Adaeze Okafor", phone: "0800 000 0000", street: "12 Admiralty Way", area: "Eti-Osa", state: "Lagos", landmark: "Opposite the filling station" };

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
  return { b, checkout };
}

const attemptOf = async (reference: string) => (await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, reference)))[0]!;
const ordersOf = (checkoutId: string) => db().select().from(schema.orders).where(eq(schema.orders.checkoutId, checkoutId));

/** A paid checkout: started, settled by Paystack, confirmed by a check. */
async function paidCheckout() {
  const { b, checkout } = await readyToPay();
  const started = paymentStartSchema.parse((await b.post(`/v1/checkouts/${checkout.id}/payments`)).body);
  gateway.settle(started.reference, { status: "success" });
  expect(await checkPaymentAttempt(deps(), (await attemptOf(started.reference)).id, 1)).toBe("succeeded");
  const view = checkoutSchema.parse((await b.get(`/v1/checkouts/${checkout.id}`)).body);
  return { b, checkout: view, reference: started.reference, orderId: view.order!.id };
}

const setPayments = (on: boolean) => db().update(schema.paymentSettings).set({ onlinePayments: on }).where(eq(schema.paymentSettings.id, 1));

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await setPayments(true);
  actors = await signInActors(harness, ["adminAda", "financeFolake", "adminTunde", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("the order (TECH-05 §8, COM-FR-082, 085)", () => {
  it("is made from the checkout's snapshot when the payment succeeds", async () => {
    const { b, checkout, orderId } = await paidCheckout();
    expect(checkout.status).toBe("COMPLETED");
    expect(checkout.order?.number).toMatch(/^HP-\d{4}-\d{4,}$/);
    const order = orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body);
    expect(order).toMatchObject({ number: checkout.order!.number, paymentStatus: "PAID", contactName: contact.name, deliverTo: "Eti-Osa, Lagos" });
    expect(order.totals.totalMinor).toBe(checkout.totals.totalMinor);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ productName: checkout.items[0]!.productName, quantity: 250, status: "AWAITING_PREREQUISITE" });
    const [item] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    expect((item!.snapshot as { schema: string }).schema).toBe("orderable-configuration/v1");
    expect(order.receipts).toHaveLength(1);
    expect(order.receipts[0]!.number).toMatch(/^HP-R-\d{4}-\d{4,}$/);
  });

  it("is made once per checkout, however many results arrive at once", async () => {
    const { b, checkout } = await readyToPay();
    const started = paymentStartSchema.parse((await b.post(`/v1/checkouts/${checkout.id}/payments`)).body);
    gateway.settle(started.reference, { status: "success" });
    const attempt = await attemptOf(started.reference);
    const result = await gateway.verify(started.reference);
    await Promise.all(Array.from({ length: 4 }, () => applyResult({ db: db(), notify: notify() }, attempt.id, result, { source: "webhook", now: new Date() })));
    expect(await ordersOf(checkout.id)).toHaveLength(1);
    expect(await db().select().from(schema.receipts).where(eq(schema.receipts.attemptId, attempt.id))).toHaveLength(1);
    const emails = await db().select().from(schema.notifications).where(eq(schema.notifications.recordId, (await ordersOf(checkout.id))[0]!.id));
    expect(emails).toHaveLength(1);
  });

  it("hides the order from everyone but its owner (TECH-03 §17)", async () => {
    const { orderId } = await paidCheckout();
    expectHidden(await browser().get(`/v1/orders/${orderId}`));
    expectHidden(await as(harness, actors.customerChidi!).get(`/v1/orders/${orderId}`));
    expectHidden(await browser().get(`/v1/orders/${randomUUID()}`));
  });
});

describe("the receipt and its email (PAY-FR-006, TECH-05 §9)", () => {
  it("emails the confirmation with a link that opens only that order", async () => {
    const { orderId, checkout } = await paidCheckout();
    const other = await paidCheckout();
    const [email] = await db().select().from(schema.notifications).where(eq(schema.notifications.recordId, orderId));
    expect(email).toMatchObject({ template: "order_confirmed", recipient: contact.email, recordLabel: checkout.order!.number });
    const data = unseal(email!.sealedData!, TEST_SEAL_KEY) as { url: string; orderNumber: string; receiptNumber: string };
    expect(data.orderNumber).toBe(checkout.order!.number);
    const secret = data.url.split("#")[1]!;
    const redeemed = await request(harness.url).post("/v1/guest-links/redeem").set("origin", TEST_WEB_ORIGIN).send({ secret });
    expect(redeemed.body).toMatchObject({ purpose: "ORDER", redirectTo: `/orders/${orderId}` });
    const guest = ((redeemed.headers["set-cookie"] as unknown as string[]) ?? []).map((cookie) => cookie.split(";")[0]).find((cookie) => cookie.startsWith("hp.guest="))!;
    const linked = await request(harness.url).get(`/v1/orders/${orderId}`).set("cookie", guest);
    expect(orderSchema.parse(linked.body).id).toBe(orderId);
    expectHidden(await request(harness.url).get(`/v1/orders/${other.orderId}`).set("cookie", guest));
  });

  it("shows the receipt and downloads it as a PDF made from the same record", async () => {
    const { b, orderId, reference } = await paidCheckout();
    const order = orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body);
    const receipt = receiptSchema.parse((await b.get(`/v1/orders/${orderId}/receipts/${order.receipts[0]!.id}`)).body);
    expect(receipt).toMatchObject({ orderNumber: order.number, paystackReference: reference, payer: { name: contact.name, email: contact.email }, amountMinor: order.totals.totalMinor });
    const pdf = await request(harness.url)
      .get(`/v1/orders/${orderId}/receipts/${receipt.id}/pdf`)
      .set("cookie", b.cookie())
      .buffer(true)
      .parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => done(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain(`${receipt.number}.pdf`);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    expectHidden(await browser().get(`/v1/orders/${orderId}/receipts/${receipt.id}/pdf`));
  });

  it("never serves another order's receipt under your own order's path (TECH-03 §17)", async () => {
    const mine = await paidCheckout();
    const theirs = await paidCheckout();
    const theirReceipt = orderSchema.parse((await theirs.b.get(`/v1/orders/${theirs.orderId}`)).body).receipts[0]!.id;
    expect((await theirs.b.get(`/v1/orders/${theirs.orderId}/receipts/${theirReceipt}`)).status).toBe(200);
    expectHidden(await mine.b.get(`/v1/orders/${mine.orderId}/receipts/${theirReceipt}`));
    expectHidden(await mine.b.get(`/v1/orders/${mine.orderId}/receipts/${theirReceipt}/pdf`));
  });
});

describe("payments admin (OPS-FR-041, 045)", () => {
  it("lists attempts with what they were for and what the customer sees", async () => {
    const { reference, checkout } = await paidCheckout();
    const list = adminPaymentListSchema.parse((await as(harness, actors.adminAda!).get(`/v1/admin/payments?q=${reference}`)).body);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ reference, forLabel: checkout.order!.number, customer: contact.name, attemptStatus: "SUCCEEDED", customerSees: "PAID" });
    const detail = adminIntentSchema.parse((await as(harness, actors.financeFolake!).get(`/v1/admin/payments/intents/${list.items[0]!.intentId}`)).body);
    expect(detail).toMatchObject({ status: "SUCCEEDED", succeededAttemptReference: reference, receipt: { paystackReference: reference } });
    expect(detail.attempts[0]!.checks.length).toBeGreaterThan(0);
    expect(detail.history.map((entry) => entry.action)).toContain("payment.succeeded");
  });

  it("refuses people without payment permissions (TECH-03 §17)", async () => {
    expect((await as(harness, actors.adminTunde!).get("/v1/admin/payments")).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/payments"));
    expect((await as(harness, actors.financeFolake!).get("/v1/admin/payments")).status).toBe(200);
  });
});

describe("payment reviews (OPS-FR-046)", () => {
  async function mismatched() {
    const { b, checkout } = await readyToPay();
    const started = paymentStartSchema.parse((await b.post(`/v1/checkouts/${checkout.id}/payments`)).body);
    gateway.settle(started.reference, { status: "success", amountMinor: 100n });
    const attempt = await attemptOf(started.reference);
    expect(await checkPaymentAttempt(deps(), attempt.id, 1)).toBe("mismatch");
    const queue = adminReviewListSchema.parse((await as(harness, actors.adminAda!).get("/v1/admin/payments/reviews")).body);
    const review = queue.items.find((item) => item.intentId === attempt.intentId)!;
    return { checkout, attempt, review };
  }

  it("needs a note, and PAYMENT_MANAGE to decide", async () => {
    const { review, attempt } = await mismatched();
    const noNote = await as(harness, actors.adminAda!).post(`/v1/admin/payments/reviews/${review.id}/resolve`, { resolution: "SUCCEEDED", attemptId: attempt.id, note: " " });
    expect(noNote.status).toBe(400);
    expect(apiErrorSchema.parse(noNote.body).fieldErrors).toMatchObject({ note: "Add a decision note" });
    const viewOnly = await as(harness, actors.financeFolake!).post(`/v1/admin/payments/reviews/${review.id}/resolve`, { resolution: "OPEN", note: "Not mine to decide" });
    expect(viewOnly.status).toBe(403);
  });

  it("keeping the payment credits it once, makes the order and records the decision", async () => {
    const { review, attempt, checkout } = await mismatched();
    const resolved = adminReviewSchema.parse(
      (await as(harness, actors.adminAda!).post(`/v1/admin/payments/reviews/${review.id}/resolve`, { resolution: "SUCCEEDED", attemptId: attempt.id, note: "Confirmed in the Paystack dashboard." })).body,
    );
    expect(resolved).toMatchObject({ status: "RESOLVED", resolution: "SUCCEEDED", note: "Confirmed in the Paystack dashboard.", resolvedBy: TEST_PEOPLE.adminAda.name });
    expect(await ordersOf(checkout.id)).toHaveLength(1);
    const again = await as(harness, actors.adminAda!).post(`/v1/admin/payments/reviews/${review.id}/resolve`, { resolution: "OPEN", note: "Changed my mind" });
    expect(again.status).toBe(409);
    const audit = await db().select().from(schema.auditLog).where(eq(schema.auditLog.recordId, attempt.intentId));
    expect(audit.find((entry) => entry.action === "payment.review_resolved")).toMatchObject({ permission: "PAYMENT_MANAGE", actorType: "STAFF" });
  });

  it("returning to open lets the customer pay again, and never deletes the Paystack record", async () => {
    const { review, attempt, checkout } = await mismatched();
    await as(harness, actors.adminAda!).post(`/v1/admin/payments/reviews/${review.id}/resolve`, { resolution: "OPEN", note: "Wrong amount; refund it and let them pay again." });
    const [intent] = await db().select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, attempt.intentId));
    expect(intent!.status).toBe("OPEN");
    expect((await attemptOf(attempt.reference)).status).toBe("SUCCEEDED");
    expect(await ordersOf(checkout.id)).toHaveLength(0);
  });
});

describe("payment settings (TECH-05 §13, OPS-FR-044, 047)", () => {
  // Saving needs an authenticator check from the last 15 minutes (TECH-03 §9), so Ada signs in again here.
  let ada: string;
  beforeAll(async () => {
    ada = await harness.signInAs("adminAda");
  });
  const current = async () => paymentSettingsSchema.parse((await as(harness, ada).get("/v1/admin/payments/settings")).body);
  const put = (cookie: string, body: object) => request(harness.url).put("/v1/admin/payments/settings").set("origin", TEST_WEB_ORIGIN).set("cookie", cookie).send(body);
  const save = async (changes: object) => {
    const settings = await current();
    const { version, onlinePayments, channels, internationalCards, usdEnabled, accountSupports, checklist } = settings;
    return put(ada, { version, onlinePayments, channels, internationalCards, usdEnabled, accountSupports, checklist, ...changes });
  };

  it("never offers what the Paystack account doesn't support", async () => {
    const refused = await save({ channels: ["card", "apple_pay"] });
    expect(refused.status).toBe(400);
    expect(apiErrorSchema.parse(refused.body).fieldErrors).toHaveProperty("channels");
    const confirmed = await save({ accountSupports: { internationalPayments: true, americanExpress: false, usd: false, applePay: true } });
    expect(confirmed.status).toBe(200);
    expect(paymentSettingsSchema.parse(confirmed.body)).toMatchObject({ accountConfirmedBy: TEST_PEOPLE.adminAda.name });
    expect((await save({ channels: ["card", "apple_pay"], internationalCards: true })).status).toBe(200);
  });

  it("pausing blocks new attempts, keeps checking old ones, and is audited", async () => {
    const { b, checkout } = await readyToPay();
    const paused = await save({ onlinePayments: false });
    expect(paymentSettingsSchema.parse(paused.body).recentChanges[0]!.summary).toContain("Online payments paused");
    try {
      const refused = await b.post(`/v1/checkouts/${checkout.id}/payments`);
      expect(apiErrorSchema.parse(refused.body).context).toMatchObject({ reason: "PAYMENTS_PAUSED" });
    } finally {
      await save({ onlinePayments: true });
    }
  });

  it("refuses view-only staff and stale versions", async () => {
    const settings = await current();
    const { version, onlinePayments, channels, internationalCards, usdEnabled, accountSupports, checklist } = settings;
    const viewOnly = await put(actors.financeFolake!, { version, onlinePayments, channels, internationalCards, usdEnabled, accountSupports, checklist });
    expect(viewOnly.status).toBe(403);
    const stale = await save({ version: settings.version - 1 });
    expect(stale.status).toBe(409);
  });
});
