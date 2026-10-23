import { adminIntentSchema, adminRefundListSchema, adminRefundSchema, adminReviewSchema, apiErrorSchema, checkoutSchema, configurationSchema, orderSchema, paymentStartSchema, refundablePaymentSchema } from "@holypearls/contracts";
import { eq, schema, sql } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { orderFlows } from "../testing/flows.js";
import { createHarness, type Harness } from "../testing/harness.js";
import { applyResult, processPaystackEvent } from "./payments.js";
import { checkRefund, REFUND_CHECK_SECONDS } from "./refunds.js";

/*
 * T13-05: refunds (TECH-05 §11, §16; OPS-FR-043; PRD-06 §18; Pen 121). Done
 * when: the original payment is untouched, and the test-mode suite passes
 * (packages/payments: the adapter against Paystack test mode).
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
const flows = orderFlows(
  () => harness,
  () => gateway,
);
const db = () => harness.database.db;
const ada = () => as(harness, actors.adminAda!);
const deps = () => ({ db: db(), gateway, notify: null });
const attemptFor = async (orderId: string) => {
  const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
  const [receipt] = await db().select().from(schema.receipts).where(eq(schema.receipts.orderId, order!.id));
  return (await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, receipt!.attemptId)))[0]!;
};
const refund = (attemptId: string, amountMinor: string, extra: { reviewId?: string | null; reason?: string } = {}) =>
  ada().post("/v1/admin/refunds", { attemptId, amountMinor, reason: extra.reason ?? "Customer asked to drop a line (TEST DATA)", reviewId: extra.reviewId ?? null });
const issued = async (response: request.Response) => {
  expect(response.status).toBe(201);
  return adminRefundSchema.parse(response.body);
};
/** Paystack's refund webhook through the real route, then the follow-up job. */
const refundWebhook = async (event: "refund.processed" | "refund.failed", providerRefundId: string) => {
  const { body, signature } = gateway.refundWebhook(event, providerRefundId);
  expect((await request(harness.url).post("/v1/webhooks/paystack").set("content-type", "application/json").set("x-paystack-signature", signature).send(body.toString("utf8"))).status).toBe(200);
  const [saved] = await db().select().from(schema.paystackEvents).where(eq(schema.paystackEvents.eventKey, `${event}:${providerRefundId}`));
  return processPaystackEvent({ db: db(), gateway, notify: null }, saved!.id);
};
const providerIdOf = async (refundId: string) => (await db().select().from(schema.refunds).where(eq(schema.refunds.id, refundId)))[0]!.providerRefundId!;

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["adminAda", "financeFolake", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("refunds (TECH-05 §11)", () => {
  it("Done when: a partial refund keeps the original payment and shows PARTIALLY_REFUNDED; the rest makes it REFUNDED", async () => {
    const { b, orderId } = await flows.paidOrder();
    const attempt = await attemptFor(orderId);
    const before = {
      attempt,
      intent: (await db().select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, attempt.intentId)))[0],
      receipt: (await db().select().from(schema.receipts).where(eq(schema.receipts.attemptId, attempt.id)))[0],
    };
    const paid = attempt.paidAmountMinor ?? attempt.amountMinor;

    // Who may: REFUND_ISSUE only, with a recent MFA check and an Idempotency-Key.
    expect((await as(harness, actors.financeFolake!).post("/v1/admin/refunds", { attemptId: attempt.id, amountMinor: "100", reason: "x", reviewId: null })).status).toBe(403);
    expect((await as(harness, actors.financeFolake!).get("/v1/admin/refunds")).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).get("/v1/admin/refunds"));
    await db().execute(sql`update sessions set mfa_verified_at = now() - interval '16 minutes'`);
    const stale = await refund(attempt.id, "100000");
    expect(stale.status).toBe(403);
    expect(apiErrorSchema.parse(stale.body).code).toBe("RECENT_MFA_REQUIRED");
    await db().execute(sql`update sessions set mfa_verified_at = now()`);
    const noKey = await request(harness.url).post("/v1/admin/refunds").set("origin", "http://localhost:3000").set("cookie", actors.adminAda!).send({ attemptId: attempt.id, amountMinor: "100000", reason: "x", reviewId: null });
    expect(noKey.status).toBe(400);

    // The issue form: what was paid and what's left.
    const form = refundablePaymentSchema.parse((await ada().get(`/v1/admin/refunds/payments/${attempt.id}`)).body);
    expect(form).toMatchObject({ reference: attempt.reference, paidMinor: paid.toString(), leftMinor: paid.toString(), refundedMinor: "0", refunds: [] });

    // A partial refund: PENDING with Paystack, then processed by its webhook.
    const partial = await issued(await refund(attempt.id, "100000"));
    expect(partial).toMatchObject({ status: "PENDING", amountMinor: "100000", number: expect.stringMatching(/^RF-\d{4}$/) });
    expect(gateway.refunds.get(await providerIdOf(partial.id))?.input).toMatchObject({ reference: attempt.reference, amountMinor: 100000n, currency: "NGN" });
    // More than is left (pending refunds count) is refused before Paystack is asked.
    const over = await refund(attempt.id, (paid - 100000n + 1n).toString());
    expect(over.status).toBe(400);
    expect(apiErrorSchema.parse(over.body).fieldErrors?.amountMinor).toMatch(/^Can't refund more than the ₦[\d,.]+ left on this payment\.$/);

    gateway.settleRefund(await providerIdOf(partial.id), "processed");
    expect(await refundWebhook("refund.processed", await providerIdOf(partial.id))).toBe("processed");
    // A replayed webhook changes nothing.
    expect(await checkRefund({ db: db(), gateway }, partial.id, 1)).toBe("skipped");
    expect(orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body).paymentStatus).toBe("PARTIALLY_REFUNDED");

    // The original payment record isn't changed (TECH-05 §11).
    expect((await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, attempt.id)))[0]).toEqual(before.attempt);
    expect((await db().select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, attempt.intentId)))[0]).toEqual(before.intent);
    expect((await db().select().from(schema.receipts).where(eq(schema.receipts.attemptId, attempt.id)))[0]).toEqual(before.receipt);

    // The rest, settled by the check job: the order is REFUNDED.
    const rest = await issued(await refund(attempt.id, (paid - 100000n).toString()));
    gateway.settleRefund(await providerIdOf(rest.id), "processed");
    expect(await checkRefund({ db: db(), gateway }, rest.id, 1)).toBe("processed");
    expect(orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body).paymentStatus).toBe("REFUNDED");
    expect((await refund(attempt.id, "1")).status).toBe(400);

    // Listed, and on the intent with its history; every step audited.
    const list = adminRefundListSchema.parse((await ada().get("/v1/admin/refunds")).body);
    expect(list.items.find((item) => item.id === partial.id)).toMatchObject({ status: "PROCESSED", forLabel: expect.stringMatching(/ · partial$/), customerSees: "REFUNDED", issuedBy: "Ada Okafor (TEST DATA)" });
    const intent = adminIntentSchema.parse((await ada().get(`/v1/admin/payments/intents/${attempt.intentId}`)).body);
    expect(intent.refunds.map((entry) => entry.status)).toEqual(["PROCESSED", "PROCESSED"]);
    expect(intent.history.map((entry) => entry.action)).toEqual(expect.arrayContaining(["refund.issued", "refund.processed"]));
    const [audit] = await db().select().from(schema.auditLog).where(eq(schema.auditLog.recordLabel, partial.number));
    expect(audit).toMatchObject({ action: "refund.issued", permission: "REFUND_ISSUE" });
    expect(audit!.mfaVerifiedAt).not.toBeNull();
  });

  it("a refusal fails the refund; a lost answer stays PENDING until the check finds it, or fails if Paystack never made it", async () => {
    const { orderId } = await flows.paidOrder();
    const attempt = await attemptFor(orderId);
    const paid = (attempt.paidAmountMinor ?? attempt.amountMinor).toString();

    gateway.nextRefund = "refuse";
    const refused = await issued(await refund(attempt.id, paid));
    expect(refused).toMatchObject({ status: "FAILED", failure: "Paystack declined: Transaction has been fully reversed" });
    // A failed refund doesn't count: the full amount is still left.
    expect(refundablePaymentSchema.parse((await ada().get(`/v1/admin/refunds/payments/${attempt.id}`)).body).leftMinor).toBe(paid);

    // Created at Paystack, but the answer never arrived: PENDING without an id, still counted.
    gateway.nextRefund = "lose";
    const lost = await issued(await refund(attempt.id, "50000"));
    expect(lost).toMatchObject({ status: "PENDING", failure: expect.stringMatching(/^Paystack didn't answer/) });
    expect(await providerIdOf(lost.id)).toBeNull();
    expect(refundablePaymentSchema.parse((await ada().get(`/v1/admin/refunds/payments/${attempt.id}`)).body).leftMinor).toBe((BigInt(paid) - 50000n).toString());
    expect(await checkRefund({ db: db(), gateway }, lost.id, 1)).toBe("pending");
    const found = await providerIdOf(lost.id);
    expect(gateway.refunds.get(found)?.input.amountMinor).toBe(50000n);
    gateway.settleRefund(found, "failed");
    expect(await refundWebhook("refund.failed", found)).toBe("failed");
    expect(adminRefundListSchema.parse((await ada().get("/v1/admin/refunds")).body).items.find((item) => item.id === lost.id)).toMatchObject({ status: "FAILED", failure: "Paystack declined the refund. Try again or contact Paystack." });

    // Lost before Paystack made it: not found by the last check, so it fails and frees the amount.
    gateway.nextRefund = "lose";
    const never = await issued(await refund(attempt.id, "70000"));
    gateway.refunds.delete([...gateway.refunds.values()].find((entry) => entry.reference === attempt.reference && entry.amountMinor === 70000n)!.providerRefundId);
    expect(await checkRefund({ db: db(), gateway }, never.id, 1)).toBe("not found yet");
    expect(await checkRefund({ db: db(), gateway }, never.id, REFUND_CHECK_SECONDS.length)).toBe("failed");
    expect(refundablePaymentSchema.parse((await ada().get(`/v1/admin/refunds/payments/${attempt.id}`)).body).leftMinor).toBe(paid);
  });

  it("refunds the extra attempt of a DUPLICATE_PAYMENT review, which resolves when Paystack processes it", async () => {
    // Two successful attempts on one checkout, as from two tabs (TECH-05 §7).
    const b = flows.browser();
    const created = configurationSchema.parse((await b.post("/v1/configurations", { productSlug: "business-cards", choices: { paper: "350gsm-matte", sides: "both-sides" } })).body);
    const cards = configurationSchema.parse((await b.patch(`/v1/configurations/${created.id}`, { version: created.version, quantity: 250 })).body.draft);
    await b.post("/v1/cart/items", { configurationId: cards.id });
    let checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
    const contact = { name: "Duplicate Payer (TEST DATA)", email: "duplicate.payer@example.com", phone: "0800 000 0000" };
    checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/contact`, { ...contact, version: checkout.version })).body);
    checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/address`, { country: "NG", name: contact.name, phone: contact.phone, street: "12 Admiralty Way", area: "Eti-Osa", state: "Lagos", landmark: "", version: checkout.version })).body);
    checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/delivery`, { option: "STANDARD", version: checkout.version })).body);
    checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: checkout.version })).body);
    const first = paymentStartSchema.parse((await b.post(`/v1/checkouts/${checkout.id}/payments`)).body);
    harness.now.value = new Date(Date.now() + 11 * 60 * 1000);
    let second;
    try {
      second = paymentStartSchema.parse((await b.post(`/v1/checkouts/${checkout.id}/payments`)).body);
    } finally {
      harness.now.value = null;
    }
    for (const started of [first, second]) {
      gateway.settle(started.reference, { status: "success" });
      const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, started.reference));
      await applyResult(deps(), attempt!.id, await gateway.verify(started.reference), { source: "webhook", now: new Date() });
    }
    const [review] = await db().select().from(schema.paymentReviews).where(eq(schema.paymentReviews.reason, "DUPLICATE_PAYMENT")).orderBy(sql`${schema.paymentReviews.createdAt} desc`).limit(1);
    const [intent] = await db().select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, review!.intentId));
    const extra = (await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.intentId, intent!.id))).find((attempt) => attempt.id !== intent!.succeededAttemptId)!;

    const form = refundablePaymentSchema.parse((await ada().get(`/v1/admin/refunds/payments/${extra.id}?review=${review!.id}`)).body);
    expect(form.review).toMatchObject({ reason: "DUPLICATE_PAYMENT", status: "OPEN" });
    const made = await issued(await refund(extra.id, form.leftMinor, { reviewId: review!.id, reason: "Duplicate payment for this order" }));
    expect(made.forLabel).toMatch(/ · duplicate$/);
    expect(made.customerSees).toBe("PAYMENT_RESOLUTION_REQUIRED");
    // Only a review of this payment can be attached.
    expect((await refund(extra.id, "1", { reviewId: randomUUID() })).status).toBe(400);

    gateway.settleRefund(await providerIdOf(made.id), "processed");
    expect(await checkRefund({ db: db(), gateway }, made.id, 1)).toBe("processed");
    const resolved = adminReviewSchema.parse((await ada().get(`/v1/admin/payments/reviews/${review!.id}`)).body);
    expect(resolved).toMatchObject({ status: "RESOLVED", resolution: "REFUNDED", note: `${made.number}: Duplicate payment for this order` });
    expect((await db().select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intent!.id)))[0]!.status).toBe("SUCCEEDED");
    // Both payments and their records are kept.
    expect((await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.intentId, intent!.id))).map((attempt) => attempt.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
  });
});
