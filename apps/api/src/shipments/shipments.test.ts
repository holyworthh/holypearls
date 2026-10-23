import {
  adminProblemListSchema,
  adminProblemSchema,
  adminShipmentSchema,
  apiErrorSchema,
  checkoutSchema,
  orderSchema,
  orderShippingSchema,
  paymentStartSchema,
  productionItemSchema,
  reorderCheckSchema,
  reorderResultSchema,
} from "@holypearls/contracts";
import { and, eq, schema } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkPaymentAttempt } from "../payments/payments.js";
import { as, expectHidden, expectNoIdentity, signInActors, type Actors } from "../testing/actors.js";
import { type Browser, orderFlows } from "../testing/flows.js";
import { createHarness, type Harness } from "../testing/harness.js";

/*
 * T08-01: shipments, delivered view, reorder and problem reports
 * (FUL-FR-030–032, 060–062, 070; OPS-FR-018, 070–073). Done when: partial
 * quantities are checked; history is never erased; changing the artwork turns
 * an exact reorder into a reorder with changes; the proof is skipped only when
 * the rule allows; guests can only report on their own order.
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
const view = async (b: Browser, orderId: string) => orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body);

/** Takes an item through production to READY_TO_DISPATCH (or READY_AWAITING_RELEASE with a balance due). */
async function makeReady(itemId: string) {
  await db().update(schema.proofs).set({ status: "NOT_REQUIRED" }).where(eq(schema.proofs.orderItemId, itemId));
  for (const move of ["QUEUE", "START", "TO_QUALITY_CHECK"] as const) {
    const item = productionItemSchema.parse((await ada().get(`/v1/admin/production/items/${itemId}`)).body);
    if (item.moves.includes(move)) await ada().post(`/v1/admin/production/items/${itemId}/moves`, { move, version: item.version });
  }
  const item = productionItemSchema.parse((await ada().get(`/v1/admin/production/items/${itemId}`)).body);
  return productionItemSchema.parse((await ada().post(`/v1/admin/production/items/${itemId}/qc`, { outcome: "PASSED", note: "", version: item.version })).body);
}

async function move(shipmentId: string, status: string, note?: string) {
  const [row] = await db().select().from(schema.shipments).where(eq(schema.shipments.id, shipmentId));
  return ada().post(`/v1/admin/shipments/${shipmentId}/status`, { status, version: row!.version, note });
}

async function walk(shipmentId: string, statuses: string[]) {
  for (const status of statuses) expect((await move(shipmentId, status)).status).toBe(200);
}

/** A delivered paid order (one item, 250 business cards, in two shipments). */
async function deliveredOrder() {
  const made = await flows.paidOrder();
  const [item] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, made.orderId));
  await makeReady(item!.id);
  const shipment = adminShipmentSchema.parse((await ada().post(`/v1/admin/shipments/orders/${made.orderId}`, { items: [{ orderItemId: item!.id, quantity: item!.quantity }], carrier: "GIG Logistics", trackingNumber: "GIG-1", destination: "12 Admiralty Way, Lagos" })).body);
  await walk(shipment.id, ["LABEL_CREATED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"]);
  return { ...made, item: item! };
}

/** Checks out whatever is in this browser's cart and pays for it. */
async function checkoutCart(b: Browser, contact: { name: string; email: string; phone: string }) {
  let checkout = checkoutSchema.parse((await b.post("/v1/checkouts")).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/contact`, { ...contact, version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/address`, { country: "NG", name: contact.name, phone: contact.phone, street: "12 Admiralty Way", area: "Eti-Osa", state: "Lagos", landmark: "", version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/delivery`, { option: "STANDARD", version: checkout.version })).body);
  checkout = checkoutSchema.parse((await b.put(`/v1/checkouts/${checkout.id}/billing`, { sameAsDelivery: true, version: checkout.version })).body);
  const started = paymentStartSchema.parse((await b.post(`/v1/checkouts/${checkout.id}/payments`)).body);
  gateway.settle(started.reference, { status: "success" });
  const [attempt] = await db().select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.reference, started.reference));
  await checkPaymentAttempt({ db: db(), gateway, notify: flows.notify() }, attempt!.id, 1);
  return checkoutSchema.parse((await b.get(`/v1/checkouts/${checkout.id}`)).body).order!.id;
}

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway });
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["adminAda", "adminTunde", "customerChidi"]);
});

afterAll(async () => {
  await harness?.close();
});

describe("shipments (FUL-FR-030–032, OPS-FR-070–073)", () => {
  it("ships partial quantities, never more than is ready, and moves items on only when every unit has gone", async () => {
    const { b, orderId } = await flows.paidOrder();
    const [item] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    expect(item!.quantity).toBe(250);
    const notReady = await ada().post(`/v1/admin/shipments/orders/${orderId}`, { items: [{ orderItemId: item!.id, quantity: 1 }], destination: "Lagos" });
    expect(apiErrorSchema.parse(notReady.body).fieldErrors).toMatchObject({ [`items.${item!.id}`]: "Business Cards isn't ready to ship." });
    await makeReady(item!.id);

    const over = await ada().post(`/v1/admin/shipments/orders/${orderId}`, { items: [{ orderItemId: item!.id, quantity: 300 }], destination: "Lagos" });
    expect(apiErrorSchema.parse(over.body).fieldErrors).toMatchObject({ [`items.${item!.id}`]: "Only 250 are ready. Ship 250 or fewer." });
    const first = adminShipmentSchema.parse((await ada().post(`/v1/admin/shipments/orders/${orderId}`, { items: [{ orderItemId: item!.id, quantity: 100 }], carrier: "GIG Logistics", trackingNumber: "GIG-448120931", destination: "Landmark Centre, VI" })).body);
    expect(first).toMatchObject({ status: "PREPARING", items: [{ name: "Business Cards", quantity: 100 }], next: ["LABEL_CREATED", "EXCEPTION"] });
    const second = adminShipmentSchema.parse((await ada().post(`/v1/admin/shipments/orders/${orderId}`, { items: [{ orderItemId: item!.id, quantity: 150 }], destination: "Landmark Centre, VI" })).body);
    expect(second.number).toMatch(/-2$/);
    const shipping = orderShippingSchema.parse((await ada().get(`/v1/admin/shipments/orders/${orderId}`)).body);
    expect(shipping.items[0]).toMatchObject({ shipped: 250, shippable: 0 });

    // Only TECH-01's next statuses; skipping one changes nothing.
    const skip = await move(first.id, "IN_TRANSIT");
    expect(apiErrorSchema.parse(skip.body).context).toMatchObject({ reason: "ILLEGAL_MOVE" });
    await walk(first.id, ["LABEL_CREATED", "IN_TRANSIT"]);
    let order = await view(b, orderId);
    expect(order.items[0]!.status).toBe("READY_TO_DISPATCH");
    expect(order.shipments[0]).toMatchObject({ status: "IN_TRANSIT", carrier: "GIG Logistics", trackingNumber: "GIG-448120931" });
    const [dispatched] = await db().select().from(schema.notifications).where(and(eq(schema.notifications.recordId, orderId), eq(schema.notifications.template, "shipment_dispatched")));
    expect(dispatched).toBeTruthy();

    await walk(second.id, ["LABEL_CREATED", "IN_TRANSIT"]);
    order = await view(b, orderId);
    expect(order).toMatchObject({ summaryStatus: "DISPATCHED", items: [{ status: "DISPATCHED" }] });

    expect((await move(first.id, "OUT_FOR_DELIVERY", "Rider en route")).status).toBe(200);
    await walk(first.id, ["DELIVERED"]);
    expect((await view(b, orderId)).items[0]!.status).toBe("DISPATCHED");
    await walk(second.id, ["OUT_FOR_DELIVERY", "ATTEMPTED_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"]);
    order = await view(b, orderId);
    expect(order).toMatchObject({ summaryStatus: "DELIVERED", items: [{ status: "DELIVERED" }], reorderable: [1] });
    expect((await move(second.id, "IN_TRANSIT")).status).toBe(422);

    // History is only ever added to, and customers never see staff notes.
    const events = await db().select().from(schema.shipmentEvents).where(eq(schema.shipmentEvents.shipmentId, second.id));
    expect(events.map((event) => event.toStatus).sort()).toEqual(["ATTEMPTED_DELIVERY", "DELIVERED", "IN_TRANSIT", "LABEL_CREATED", "OUT_FOR_DELIVERY", "OUT_FOR_DELIVERY", "PREPARING"].sort());
    expect(order.shipments[1]!.history).toHaveLength(7);
    expect(JSON.stringify(order.shipments)).not.toContain("Rider en route");
    const itemEvents = await db().select().from(schema.orderItemEvents).where(eq(schema.orderItemEvents.orderItemId, item!.id));
    expect(itemEvents.filter((event) => event.toStatus === "DISPATCHED" || event.toStatus === "DELIVERED")).toHaveLength(2);
  });

  it("won't ship items waiting for the balance", async () => {
    const { guest, orderId, items } = await flows.acceptedQuote(ada());
    await flows.payNext(guest, orderId);
    const held = await makeReady(items[0]!.id);
    expect(held.status).toBe("READY_AWAITING_RELEASE");
    const refused = await ada().post(`/v1/admin/shipments/orders/${orderId}`, { items: [{ orderItemId: items[0]!.id, quantity: 1 }], destination: "Lagos" });
    expect(apiErrorSchema.parse(refused.body).fieldErrors).toMatchObject({ [`items.${items[0]!.id}`]: expect.stringContaining("waiting for the balance") });
  });

  it("needs FULFILMENT_MANAGE", async () => {
    const { orderId } = await flows.paidOrder();
    expect((await flows.staff(actors.adminTunde!).get("/v1/admin/shipments")).status).toBe(403);
    expect((await flows.staff(actors.adminTunde!).post(`/v1/admin/shipments/orders/${orderId}`, { items: [], destination: "x" })).status).toBe(403);
    expect((await as(harness, actors.customerChidi!).get(`/v1/admin/shipments/orders/${orderId}`)).status).toBe(404);
  });
});

describe("problem reports (FUL-FR-070)", () => {
  it("gives a reference, only on the reporter's own order, and staff triage it", async () => {
    const { b, orderId, item } = await deliveredOrder();
    const report = { itemPosition: 1, type: "INCORRECT_PRINTING", quantity: 120, description: "Phone number printed with a missing digit." };
    expect((await b.post(`/v1/orders/${orderId}/problems`, { ...report, quantity: item.quantity + 1 })).status).toBe(400);
    expect((await b.post(`/v1/orders/${orderId}/problems`, { ...report, type: undefined })).status).toBe(400);
    // Someone else's file can't be attached.
    const [stranger] = await db().insert(schema.files).values({ purpose: "PROBLEM_PHOTO", status: "READY", originalName: "x.jpg", safeName: "x.jpg", declaredType: "image/jpeg", declaredSize: 10, storageKey: `p/${randomUUID()}`, bucket: "private" }).returning();
    expectHidden(await b.post(`/v1/orders/${orderId}/problems`, { ...report, photoFileIds: [stranger!.id] }));
    // Guests and other customers can't report on an order that isn't theirs.
    expectNoIdentity(await flows.browser().post(`/v1/orders/${orderId}/problems`, report));
    expectHidden(await as(harness, actors.customerChidi!).post(`/v1/orders/${orderId}/problems`, report));

    const sent = await b.post(`/v1/orders/${orderId}/problems`, report);
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ number: expect.stringMatching(/^HP-RP-\d{4}-\d{4,}$/), status: "NEW", quantity: 120, item: "Business Cards" });
    const [mail] = await db().select().from(schema.notifications).where(and(eq(schema.notifications.recordId, orderId), eq(schema.notifications.template, "problem_received")));
    expect(mail).toBeTruthy();
    expect((await view(b, orderId)).problems[0]).toMatchObject({ number: sent.body.number, status: "NEW" });

    const queue = adminProblemListSchema.parse((await ada().get("/v1/admin/problems")).body);
    const row = queue.items.find((entry) => entry.number === sent.body.number)!;
    expect(row).toMatchObject({ orderNumber: expect.any(String), ordered: 250, description: report.description });
    const triaged = adminProblemSchema.parse((await ada().post(`/v1/admin/problems/${row.id}/triage`, { version: row.version, status: "TRIAGED", triageNote: "Print file error. Reprint 120." })).body);
    expect(triaged).toMatchObject({ status: "TRIAGED", triageNote: "Print file error. Reprint 120." });
    expect(JSON.stringify(await view(b, orderId))).not.toContain("Print file error");
    const replied = adminProblemSchema.parse((await ada().post(`/v1/admin/problems/${row.id}/replies`, { body: "We'll reprint the 120 cards at no cost." })).body);
    expect(replied.replies).toHaveLength(1);
    const [reply] = await db().select().from(schema.notifications).where(and(eq(schema.notifications.recordId, orderId), eq(schema.notifications.template, "problem_reply")));
    expect(reply).toBeTruthy();
    const closed = adminProblemSchema.parse((await ada().post(`/v1/admin/problems/${row.id}/triage`, { version: replied.version, status: "CLOSED" })).body);
    expect(closed.status).toBe("CLOSED");
    expect((await ada().post(`/v1/admin/problems/${row.id}/triage`, { version: closed.version, status: "TRIAGED" })).status).toBe(422);
    expect((await flows.staff(actors.adminTunde!).get("/v1/admin/problems")).status).toBe(403);
  });
});

describe("reorder (FUL-FR-060–062, OPS-FR-018)", () => {
  it("reorders exactly with the proof skipped where the rule allows; any change makes it a reorder with changes", async () => {
    const { b, orderId, item, contact } = await deliveredOrder();
    const check = reorderCheckSchema.parse((await b.get(`/v1/orders/${orderId}/items/1/reorder`)).body);
    expect(check).toMatchObject({ exact: { available: true }, proof: "SKIPPED", withChanges: true, rows: expect.arrayContaining([{ label: "Artwork", same: true, note: null }]) });
    expect(check.priceMinor).not.toBeNull();
    expectHidden(await flows.browser().get(`/v1/orders/${orderId}/items/1/reorder`));

    // Exact: a linked copy goes into the cart; ordering it skips the proof.
    const exact = reorderResultSchema.parse((await b.post(`/v1/orders/${orderId}/items/1/reorder`, { mode: "EXACT" })).body);
    expect(exact.next).toBe("/cart");
    const [copy] = await db().select().from(schema.configurations).where(eq(schema.configurations.id, exact.configurationId));
    expect(copy).toMatchObject({ status: "IN_CART", reorderExact: true, reorderOfItemId: item.id });
    const second = await checkoutCart(b, contact);
    const [newItem] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, second));
    const [proof] = await db().select().from(schema.proofs).where(eq(schema.proofs.orderItemId, newItem!.id));
    expect(proof).toMatchObject({ status: "NOT_REQUIRED", requirement: "SKIPPED_ON_REORDER" });

    // With changes: an editable draft; editing an exact copy clears "exact", so its proof is required.
    const changes = reorderResultSchema.parse((await b.post(`/v1/orders/${orderId}/items/1/reorder`, { mode: "WITH_CHANGES" })).body);
    expect(changes.next).toBe(`/configure/drafts/${changes.configurationId}`);
    const exactAgain = reorderResultSchema.parse((await b.post(`/v1/orders/${orderId}/items/1/reorder`, { mode: "EXACT" })).body);
    const draft = (await b.get(`/v1/configurations/${exactAgain.configurationId}`)).body as { version: number };
    expect((await b.patch(`/v1/configurations/${exactAgain.configurationId}`, { version: draft.version, quantity: 500 })).status).toBe(200);
    const [changed] = await db().select().from(schema.configurations).where(eq(schema.configurations.id, exactAgain.configurationId));
    expect(changed!.reorderExact).toBe(false);

    // A product rule that doesn't allow skipping keeps the proof.
    const [config] = await db().select().from(schema.configurations).where(eq(schema.configurations.id, item.configurationId!));
    await db().update(schema.productRules).set({ proofSkippableOnReorder: false }).where(eq(schema.productRules.productId, config!.productId));
    expect(reorderCheckSchema.parse((await b.get(`/v1/orders/${orderId}/items/1/reorder`)).body).proof).toBe("REQUIRED");
    // A product no longer sold can't be reordered exactly.
    await db().update(schema.products).set({ status: "TEMPORARILY_UNAVAILABLE" }).where(eq(schema.products.id, config!.productId));
    const gone = reorderCheckSchema.parse((await b.get(`/v1/orders/${orderId}/items/1/reorder`)).body);
    expect(gone.exact).toMatchObject({ available: false, reason: expect.stringContaining("no longer available") });
    expect((await b.post(`/v1/orders/${orderId}/items/1/reorder`, { mode: "EXACT" })).status).toBe(422);
    await db().update(schema.products).set({ status: "PUBLISHED" }).where(eq(schema.products.id, config!.productId));
    await db().update(schema.productRules).set({ proofSkippableOnReorder: true }).where(eq(schema.productRules.productId, config!.productId));
  });
});
