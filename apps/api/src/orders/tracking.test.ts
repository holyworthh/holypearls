import { apiErrorSchema, findOrderResultSchema, orderSchema, productionItemSchema } from "@holypearls/contracts";
import { and, desc, eq, schema, sql } from "@holypearls/db";
import { unseal } from "@holypearls/email";
import { FakeGateway } from "@holypearls/testkit";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { as, expectHidden, expectNoIdentity, signInActors, type Actors } from "../testing/actors.js";
import { orderFlows } from "../testing/flows.js";
import { createHarness, type Harness, TEST_SEAL_KEY } from "../testing/harness.js";

/*
 * T07-03: order page data, Find my order, cancellation and scope changes
 * (FUL-FR-010–011, 033, 040, 050–052; TECH-03 §9). Done when: the accepted
 * quote is never edited; staff cancel needs MFA.
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
const ada = () => flows.staff(actors.adminAda!);
const view = async (b: ReturnType<typeof flows.browser>, orderId: string) => orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body);
const startProduction = async (itemId: string) => {
  for (const move of ["QUEUE", "START"] as const) {
    const item = productionItemSchema.parse((await ada().get(`/v1/admin/production/items/${itemId}`)).body);
    if (item.moves.includes(move)) await ada().post(`/v1/admin/production/items/${itemId}/moves`, { move, version: item.version });
  }
};

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["adminAda", "adminTunde", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("Find my order (FUL-FR-033)", () => {
  it("emails the order's link to the checkout address and says nothing about which detail was wrong", async () => {
    const { orderId, contact } = await flows.paidOrder();
    const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const stranger = flows.browser();

    const wrong = await stranger.post("/v1/orders/find", { number: order!.number, email: "someone.else@example.com" });
    expect(wrong.status).toBe(404);
    expect(apiErrorSchema.parse(wrong.body).message).toBe("We couldn't find an order with those details. Check the order number and the email used at checkout.");
    expect((await stranger.post("/v1/orders/find", { number: "HP-2026-9999", email: contact.email })).status).toBe(404);
    expect((await stranger.post("/v1/orders/find", { number: "", email: "nope" })).status).toBe(400);

    const found = findOrderResultSchema.parse((await stranger.post("/v1/orders/find", { number: order!.number.toLowerCase(), email: contact.email.toUpperCase() })).body);
    expect(found.sentTo).toBe(`${contact.email[0]}•••••@example.com`);
    // The page never shows the order; only the email's link opens it.
    expectHidden(await stranger.get(`/v1/orders/${orderId}`));
    const [mail] = await db()
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.recordId, orderId), eq(schema.notifications.template, "order_link")))
      .orderBy(desc(schema.notifications.createdAt));
    expect(mail!.recipient).toBe(contact.email);
    const { url } = unseal(mail!.sealedData!, TEST_SEAL_KEY) as { url: string };
    await stranger.post("/v1/guest-links/redeem", { secret: url.split("#")[1] });
    expect((await view(stranger, orderId)).number).toBe(order!.number);
  });
});

describe("the order page data (FUL-FR-010, 040)", () => {
  it("lists activity newest first, without internal notes, and says whether the order can be cancelled", async () => {
    const { b, orderId } = await flows.paidOrder();
    const before = await view(b, orderId);
    expect(before.cancel).toEqual({ allowed: true, blockedBy: null, refundMinor: before.totals.totalMinor });
    expect(before.canChangeScope).toBe(false);
    expect(before.activity.map((entry) => entry.text)).toEqual(expect.arrayContaining(["Order placed and paid", expect.stringMatching(/^Payment received · ₦/)]));

    const [item] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    await db().update(schema.proofs).set({ status: "NOT_REQUIRED" }).where(eq(schema.proofs.orderItemId, item!.id));
    await startProduction(item!.id);
    const current = productionItemSchema.parse((await ada().get(`/v1/admin/production/items/${item!.id}`)).body);
    await ada().post(`/v1/admin/production/items/${item!.id}/moves`, { move: "TO_QUALITY_CHECK", version: current.version });
    const qc = productionItemSchema.parse((await ada().get(`/v1/admin/production/items/${item!.id}`)).body);
    await ada().post(`/v1/admin/production/items/${item!.id}/qc`, { outcome: "REWORK", note: "Smudge on corner (internal)", version: qc.version });

    const after = await view(b, orderId);
    expect(after.activity[0]!.text).toBe("Business Cards went back into production after quality check");
    expect(JSON.stringify(after.activity)).not.toContain("Smudge");
    expect(after.cancel).toMatchObject({ allowed: false, blockedBy: "STARTED" });
  });
});

describe("customer cancellation (FUL-FR-050–051)", () => {
  it("cancels before production with the refund due recorded, once, and only for someone who can open the order", async () => {
    const { b, orderId } = await flows.paidOrder();
    expectHidden(await as(harness, actors.customerChidi!).post(`/v1/orders/${orderId}/cancel`, {}));
    expectNoIdentity(await flows.browser().post(`/v1/orders/${orderId}/cancel`, {}));

    expect((await b.post(`/v1/orders/${orderId}/cancel`, { reason: "Event postponed" })).status).toBe(200);
    const cancelled = await view(b, orderId);
    expect(cancelled).toMatchObject({ summaryStatus: "CANCELLED", cancellation: { by: "CUSTOMER", refundDueMinor: cancelled.totals.totalMinor }, cancel: { allowed: false, blockedBy: "CANCELLED" } });
    expect(cancelled.items.every((item) => item.status === "CANCELLED")).toBe(true);
    expect(cancelled.activity[0]!.text).toBe("You cancelled the order");
    const [mail] = await db().select().from(schema.notifications).where(and(eq(schema.notifications.recordId, orderId), eq(schema.notifications.template, "order_cancelled")));
    expect(mail).toBeTruthy();
    const again = await b.post(`/v1/orders/${orderId}/cancel`, {});
    expect(apiErrorSchema.parse(again.body)).toMatchObject({ code: "CONFLICT", context: { reason: "CANCELLED" } });
  });

  it("refuses online cancellation once production has started", async () => {
    const { b, orderId } = await flows.paidOrder();
    const [item] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    await db().update(schema.proofs).set({ status: "NOT_REQUIRED" }).where(eq(schema.proofs.orderItemId, item!.id));
    await startProduction(item!.id);
    const refused = await b.post(`/v1/orders/${orderId}/cancel`, {});
    expect(refused.status).toBe(422);
    expect(apiErrorSchema.parse(refused.body)).toMatchObject({ context: { reason: "STARTED" }, message: "Production has started, so this order can't be cancelled online. Contact us to talk about your options." });
    expect((await view(b, orderId)).items[0]!.status).toBe("IN_PRODUCTION");
  });
});

describe("scope changes after acceptance (FUL-FR-052)", () => {
  it("opens a change request and never edits the accepted quote version", async () => {
    const { guest, orderId } = await flows.acceptedQuote(ada());
    const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const [before] = await db().select().from(schema.quoteVersions).where(eq(schema.quoteVersions.id, order!.quoteVersionId!));
    const lines = await db().select().from(schema.quoteLineItems).where(eq(schema.quoteLineItems.quoteVersionId, before!.id));
    expect((await view(guest, orderId)).canChangeScope).toBe(true);

    const sent = await guest.post(`/v1/orders/${orderId}/change-requests`, { description: "Add 50 more lanyards" });
    expect(sent.status).toBe(200);
    expect((sent.body as { items: { status: string; stage: string; proofId: string | null }[] }).items[0]).toMatchObject({ status: "OPEN", stage: "BEFORE_PRODUCTION", proofId: null });
    const twice = await guest.post(`/v1/orders/${orderId}/change-requests`, { description: "And 10 more" });
    expect(apiErrorSchema.parse(twice.body).context).toMatchObject({ reason: "ALREADY_OPEN" });

    const [after] = await db().select().from(schema.quoteVersions).where(eq(schema.quoteVersions.id, before!.id));
    expect(after).toEqual(before);
    expect(await db().select().from(schema.quoteLineItems).where(eq(schema.quoteLineItems.quoteVersionId, before!.id))).toEqual(lines);

    // A paid checkout has no quote to change: changes go through the proof.
    const direct = await flows.paidOrder();
    const refused = await direct.b.post(`/v1/orders/${direct.orderId}/change-requests`, { description: "Different paper" });
    expect(apiErrorSchema.parse(refused.body).context).toMatchObject({ reason: "NOT_FROM_QUOTE" });
  });
});

describe("staff cancellation after commitment (TECH-03 §9)", () => {
  it("needs PRODUCTION_MANAGE, a reason and a recent MFA check; cancels unpaid payments and records the refund due", async () => {
    const { guest, orderId, items } = await flows.acceptedQuote(ada());
    const paid = await flows.payNext(guest, orderId);
    const deposit = paid.payments!.installments[0]!.amountMinor;
    await startProduction(items[0]!.id);
    expect((await view(guest, orderId)).cancel.blockedBy).toBe("STARTED");

    const path = `/v1/admin/production/orders/${orderId}/cancel`;
    expect((await flows.staff(actors.adminTunde!).post(path, { reason: "Customer request" })).status).toBe(403);
    expect((await ada().post(path, { reason: "" })).status).toBe(400);
    await db().execute(sql`update sessions set mfa_verified_at = now() - interval '16 minutes'`);
    const stale = await ada().post(path, { reason: "Customer request" });
    expect(apiErrorSchema.parse(stale.body).code).toBe("RECENT_MFA_REQUIRED");
    expect((await view(guest, orderId)).cancellation).toBeNull();
    await db().execute(sql`update sessions set mfa_verified_at = now()`);

    const done = await ada().post(path, { reason: "Customer request" });
    expect(done.body).toMatchObject({ ok: true, refundDueMinor: deposit });
    const after = await view(guest, orderId);
    expect(after).toMatchObject({ summaryStatus: "CANCELLED", cancellation: { by: "STAFF", refundDueMinor: deposit } });
    expect(after.payments!.installments.map((part) => part.status)).toEqual(["PAID", "CANCELLED"]);
    expect(after.activity[0]!.text).toBe("Order cancelled by HolyPearls");
    const [audit] = await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.recordId, orderId), eq(schema.auditLog.action, "order.cancelled_by_staff")));
    expect(audit).toBeTruthy();
    expect((await ada().post(path, { reason: "Again" })).status).toBe(409);
  });
});
