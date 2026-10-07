import { adminShipmentSchema, apiErrorSchema, courierSettingsSchema, orderSchema, productionItemSchema } from "@holypearls/contracts";
import { and, eq, schema } from "@holypearls/db";
import { FakeGateway } from "@holypearls/testkit";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FakeCourier, shipbubbleSignature } from "../sales/courier.js";
import { as, expectHidden, signInActors, type Actors } from "../testing/actors.js";
import { orderFlows } from "../testing/flows.js";
import { createHarness, type Harness, TEST_WEB_ORIGIN } from "../testing/harness.js";
import { legalPath } from "./courier-booking.js";

/*
 * T08-06 (owner, 2026-10-05 and 2026-10-07): a shipment of a courier-priced
 * order is booked with Shipbubble from Shipments, after checking the rate
 * again; Shipbubble's webhooks move it along TECH-01 §4 only. Done when: a
 * booking returns tracking, and webhooks move the shipment along TECH-01 §4
 * only. Written against the fake courier.
 */

vi.setConfig({ testTimeout: 300_000 });

let harness: Harness;
let gateway: FakeGateway;
let actors: Partial<Actors>;
const courier = new FakeCourier();
const db = () => harness.database.db;
const flows = orderFlows(
  () => harness,
  () => gateway,
);
const ada = () => flows.staff(actors.adminAda!);

const kano = { country: "NG", name: "Order Tester (TEST DATA)", phone: "0800 000 0000", street: "4 Bompai Road", area: "Nassarawa", state: "Kano", landmark: null, postcode: null };

async function makeReady(itemId: string) {
  await db().update(schema.proofs).set({ status: "NOT_REQUIRED" }).where(eq(schema.proofs.orderItemId, itemId));
  for (const move of ["QUEUE", "START", "TO_QUALITY_CHECK"] as const) {
    const item = productionItemSchema.parse((await ada().get(`/v1/admin/production/items/${itemId}`)).body);
    if (item.moves.includes(move)) await ada().post(`/v1/admin/production/items/${itemId}/moves`, { move, version: item.version });
  }
  const item = productionItemSchema.parse((await ada().get(`/v1/admin/production/items/${itemId}`)).body);
  await ada().post(`/v1/admin/production/items/${itemId}/qc`, { outcome: "PASSED", note: "", version: item.version });
}

/**
 * A paid order whose delivery a courier priced at checkout (T08-05), with a
 * shipment of `quantity` cards ready to book. The checkout's rate token is
 * stale on purpose: booking must ask again.
 */
async function courierShipment(input: { courierPriced?: boolean; quantity?: number } = {}) {
  const made = await flows.paidOrder();
  const [order] = await db().select().from(schema.orders).where(eq(schema.orders.id, made.orderId));
  if (input.courierPriced !== false) {
    const delivery = { ...(order!.delivery as object), source: "COURIER", rateMinor: "450000", courier: { name: "Cheap Collect", serviceCode: "cheap", eta: null, requestToken: "stale_token", pricedAt: "2026-10-01T09:00:00.000Z" } };
    await db().update(schema.orders).set({ delivery, address: kano }).where(eq(schema.orders.id, made.orderId));
  }
  const [item] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.orderId, made.orderId));
  await makeReady(item!.id);
  const created = await ada().post(`/v1/admin/shipments/orders/${made.orderId}`, { items: [{ orderItemId: item!.id, quantity: input.quantity ?? item!.quantity }], destination: "4 Bompai Road, Nassarawa, Kano" });
  return { ...made, item: item!, shipment: adminShipmentSchema.parse(created.body) };
}

const book = (shipment: { id: string; version: number }, cookie = actors.adminAda!) => flows.staff(cookie).post(`/v1/admin/shipments/${shipment.id}/courier`, { version: shipment.version });

async function shipmentRow(id: string) {
  const [row] = await db().select().from(schema.shipments).where(eq(schema.shipments.id, id));
  return row!;
}

function webhook(body: object, signature?: string) {
  const raw = JSON.stringify(body);
  return request(harness.url)
    .post("/v1/webhooks/shipbubble")
    .set("content-type", "application/json")
    .set("x-ship-signature", signature ?? shipbubbleSignature(Buffer.from(raw), FakeCourier.webhookKey))
    .send(raw);
}

const statusEvent = (orderId: string, status: string, extra: object = {}) => ({ event: "shipment.status.changed", order_id: orderId, status, date: "2026-10-08T10:00:00Z", ...extra });

beforeAll(async () => {
  gateway = new FakeGateway();
  harness = await createHarness({ payments: gateway, courier });
  await db().update(schema.paymentSettings).set({ onlinePayments: true }).where(eq(schema.paymentSettings.id, 1));
  actors = await signInActors(harness, ["adminAda", "adminTunde", "customerChidi"]);
  const current = courierSettingsSchema.parse((await as(harness, actors.adminAda!).get("/v1/admin/courier-settings")).body);
  const saved = await request(harness.url)
    .put("/v1/admin/courier-settings")
    .set("origin", TEST_WEB_ORIGIN)
    .set("cookie", actors.adminAda!)
    .send({ enabled: true, rule: "CHEAPEST", categoryId: 98246239, pickup: { name: "HolyPearls Workshop (TEST DATA)", email: "dispatch@holypearls.test", phone: "08000000000", address: "1 Workshop Close, Ikeja, Lagos, Nigeria" }, version: current.version });
  expect(saved.status).toBe(200);
});

afterAll(async () => {
  await harness?.close();
});

describe("the shortest legal run of statuses (TECH-01 §4)", () => {
  it("passes only through statuses a shipment goes through on its way", () => {
    expect(legalPath("PREPARING", "LABEL_CREATED")).toEqual(["LABEL_CREATED"]);
    expect(legalPath("LABEL_CREATED", "DELIVERED")).toEqual(["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"]);
    expect(legalPath("IN_TRANSIT", "IN_TRANSIT")).toEqual([]);
    expect(legalPath("LABEL_CREATED", "EXCEPTION")).toEqual(["EXCEPTION"]);
    // Never backwards, never out of a finished shipment, never through an exception.
    expect(legalPath("IN_TRANSIT", "LABEL_CREATED")).toBeNull();
    expect(legalPath("DELIVERED", "EXCEPTION")).toBeNull();
    expect(legalPath("EXCEPTION", "DELIVERED")).toEqual(["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"]);
  });
});

describe("booking a courier from Shipments (T08-06)", () => {
  it("asks for the rate again, books the same service and returns tracking", async () => {
    courier.reset();
    const { shipment, orderId, b } = await courierShipment();
    expect(shipment.bookable).toBe(true);
    const booked = await book(shipment);
    expect(booked.status).toBe(200);
    const view = adminShipmentSchema.parse(booked.body);
    expect(view).toMatchObject({ status: "LABEL_CREATED", carrier: "Cheap Collect", bookable: false, courier: { service: "cheap", costMinor: "450000" } });
    expect(view.courier!.orderId).toMatch(/^SB-FAKE/);
    expect(view.courier!.trackingUrl).toContain(view.courier!.orderId);
    // The fresh rate's token was booked, not the checkout's stale one.
    expect(courier.rateCalls).toHaveLength(1);
    expect(courier.bookings).toEqual([{ requestToken: courier.lastToken, serviceCode: "cheap", courierId: "101" }]);
    expect(view.history[0]).toMatchObject({ from: "PREPARING", status: "LABEL_CREATED", by: "Ada Okafor (TEST DATA)" });
    expect(view.history[0]!.note).toContain("Booked with Cheap Collect");
    const [audit] = await db()
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, "shipment.courier_booked"), eq(schema.auditLog.recordId, shipment.id)));
    expect(audit!.after).toMatchObject({ service: "cheap", costMinor: "450000", pricedMinor: "450000" });
    // The customer sees the carrier, never the booking details.
    const customer = orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body);
    expect(customer.shipments[0]).toMatchObject({ status: "LABEL_CREATED", carrier: "Cheap Collect" });
    expect(JSON.stringify(customer)).not.toContain(view.courier!.orderId);
  });

  it("books one shipment of a split order with only its own items", async () => {
    courier.reset();
    const { shipment } = await courierShipment({ quantity: 100 });
    expect((await book(shipment)).status).toBe(200);
    expect(courier.rateCalls[0]!.parcel.items).toEqual([expect.objectContaining({ name: "Business Cards", quantity: 100 })]);
  });

  it("can't book twice, even when asked twice", async () => {
    courier.reset();
    const { shipment } = await courierShipment();
    const [first, second] = await Promise.all([book(shipment), book(shipment)]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const again = await book(adminShipmentSchema.parse((first.status === 200 ? first : second).body));
    expect(apiErrorSchema.parse(again.body).context).toMatchObject({ reason: "ALREADY_BOOKED" });
    expect(courier.bookings).toHaveLength(1);
  });

  it("records a higher price as HolyPearls' cost; the customer isn't charged again", async () => {
    courier.reset();
    courier.priceChangeMinor = 107_500n; // ₦1,075 more with VAT: ₦1,000 before VAT.
    const { shipment, orderId } = await courierShipment();
    const [before] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const view = adminShipmentSchema.parse((await book(shipment)).body);
    expect(view.courier!.costMinor).toBe("550000");
    expect(view.history[0]!.note).toContain("Delivery was priced at ₦4,500; the ₦1,000 difference is HolyPearls' cost.");
    const [after] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(after!.totalMinor).toBe(before!.totalMinor);
    expect(after!.deliveryMinor).toBe(before!.deliveryMinor);
  });

  it("books by the courier rule when the checkout's service is no longer offered", async () => {
    courier.reset();
    courier.withdrawn = "cheap";
    const { shipment } = await courierShipment();
    const view = adminShipmentSchema.parse((await book(shipment)).body);
    expect(view).toMatchObject({ carrier: "Quick Collect", courier: { service: "quick" } });
    expect(view.history[0]!.note).toContain("Cheap Collect no longer collects for this address.");
  });

  it("leaves the shipment as it was when the courier fails", async () => {
    courier.reset();
    const { shipment } = await courierShipment();
    courier.failNext("Courier network unavailable");
    const failed = await book(shipment);
    expect(failed.status).toBe(422);
    expect(apiErrorSchema.parse(failed.body)).toMatchObject({ code: "RULE_FAILED", context: { reason: "COURIER_UNAVAILABLE" } });
    expect(apiErrorSchema.parse(failed.body).message).toContain("unavailable");
    const row = await shipmentRow(shipment.id);
    expect(row).toMatchObject({ status: "PREPARING", courierOrderId: null, version: shipment.version });
    // It can be booked once the courier answers again.
    expect((await book(shipment)).status).toBe(200);
  });

  it("refuses orders that weren't priced by courier", async () => {
    const { shipment } = await courierShipment({ courierPriced: false });
    expect(shipment.bookable).toBe(false);
    expect(apiErrorSchema.parse((await book(shipment)).body).context).toMatchObject({ reason: "NOT_COURIER_PRICED" });
  });

  it("refuses a shipment that already has a label", async () => {
    const { shipment } = await courierShipment();
    const moved = adminShipmentSchema.parse((await ada().post(`/v1/admin/shipments/${shipment.id}/status`, { status: "LABEL_CREATED", version: shipment.version })).body);
    expect(moved.bookable).toBe(false);
    expect(apiErrorSchema.parse((await book(moved)).body).context).toMatchObject({ reason: "NOT_PREPARING" });
  });

  it("needs FULFILMENT_MANAGE (TECH-03 §17)", async () => {
    courier.reset();
    const { shipment } = await courierShipment();
    expect((await book(shipment, actors.adminTunde!)).status).toBe(403);
    expectHidden(await as(harness, actors.customerChidi!).post(`/v1/admin/shipments/${shipment.id}/courier`, { version: shipment.version }));
    expect([401, 404]).toContain((await as(harness, "").post(`/v1/admin/shipments/${shipment.id}/courier`, { version: shipment.version })).status);
    expect(courier.bookings).toHaveLength(0);
    expect((await shipmentRow(shipment.id)).status).toBe("PREPARING");
  });
});

describe("Shipbubble's webhooks (T08-06, TECH-01 §4, OPS-FR-073)", () => {
  async function booked() {
    courier.reset();
    const made = await courierShipment();
    const view = adminShipmentSchema.parse((await book(made.shipment)).body);
    return { ...made, courierOrderId: view.courier!.orderId };
  }

  it("refuses a body without Shipbubble's signature", async () => {
    const { shipment, courierOrderId } = await booked();
    expect((await webhook(statusEvent(courierOrderId, "picked_up"), "0".repeat(128))).status).toBe(403);
    expect((await webhook(statusEvent(courierOrderId, "picked_up"), "")).status).toBe(403);
    expect((await shipmentRow(shipment.id)).status).toBe("LABEL_CREATED");
  });

  it("moves the shipment on, one legal step at a time, and applies a resent event once", async () => {
    const { shipment, courierOrderId, item } = await booked();
    const pickedUp = statusEvent(courierOrderId, "picked_up");
    expect((await webhook(pickedUp)).status).toBe(200);
    expect((await webhook(pickedUp)).status).toBe(200);
    let row = await shipmentRow(shipment.id);
    expect(row.status).toBe("IN_TRANSIT");
    expect(row.dispatchedAt).not.toBeNull();
    const events = await db().select().from(schema.courierEvents).where(eq(schema.courierEvents.courierOrderId, courierOrderId));
    expect(events).toHaveLength(1);
    expect(events[0]!.outcome).toBe("Moved to IN_TRANSIT.");
    const dispatched = await db()
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.template, "shipment_dispatched"), eq(schema.notifications.recordId, row.orderId)));
    expect(dispatched).toHaveLength(1);

    // Shipbubble has no "out for delivery": completed passes through it, so no status is skipped.
    expect((await webhook(statusEvent(courierOrderId, "completed"))).status).toBe(200);
    row = await shipmentRow(shipment.id);
    expect(row.status).toBe("DELIVERED");
    const history = await db().select().from(schema.shipmentEvents).where(eq(schema.shipmentEvents.shipmentId, shipment.id));
    expect(history.map((event) => event.toStatus).sort()).toEqual(["DELIVERED", "IN_TRANSIT", "LABEL_CREATED", "OUT_FOR_DELIVERY", "PREPARING"]);
    expect(history.find((event) => event.toStatus === "OUT_FOR_DELIVERY")!.note).toBe("From Shipbubble: completed.");
    const [delivered] = await db().select().from(schema.orderItems).where(eq(schema.orderItems.id, item.id));
    expect(delivered!.status).toBe("DELIVERED");
  });

  it("never moves a shipment backwards: the update is a note for staff, hidden from the customer", async () => {
    const { shipment, courierOrderId, orderId, b } = await booked();
    await webhook(statusEvent(courierOrderId, "completed"));
    expect((await webhook({ event: "shipment.cancelled", order_id: courierOrderId, status: "cancelled" })).status).toBe(200);
    expect((await shipmentRow(shipment.id)).status).toBe("DELIVERED");
    const staffView = adminShipmentSchema.parse((await ada().get(`/v1/admin/shipments/orders/${orderId}`)).body.shipments[0]);
    expect(staffView.history[0]).toMatchObject({ from: "DELIVERED", status: "DELIVERED", by: "System" });
    expect(staffView.history[0]!.note).toContain("can't move from DELIVERED to EXCEPTION");
    const customerView = orderSchema.parse((await b.get(`/v1/orders/${orderId}`)).body);
    const statuses = customerView.shipments.flatMap((one) => one.history.map((event) => event.status));
    expect(statuses.filter((status) => status === "DELIVERED")).toHaveLength(1);
  });

  it("marks a cancelled booking as an exception", async () => {
    const { shipment, courierOrderId } = await booked();
    await webhook({ event: "shipment.cancelled", order_id: courierOrderId, status: "cancelled" });
    expect((await shipmentRow(shipment.id)).status).toBe("EXCEPTION");
  });

  it("takes the tracking code when Shipbubble sends it later", async () => {
    const { shipment, courierOrderId } = await booked();
    await webhook({ event: "shipment.waybill.updated", order_id: courierOrderId, status: "confirmed", courier: { tracking_code: "GIGL-77120" }, tracking_url: "https://track.example.test/GIGL-77120" });
    const row = await shipmentRow(shipment.id);
    expect(row).toMatchObject({ status: "LABEL_CREATED", trackingNumber: "GIGL-77120", courierTrackingUrl: "https://track.example.test/GIGL-77120" });
  });

  it("accepts, and ignores, events for orders it doesn't know", async () => {
    const unknown = statusEvent("SB-NOT-OURS", "completed");
    expect((await webhook(unknown)).status).toBe(200);
    const [event] = await db().select().from(schema.courierEvents).where(eq(schema.courierEvents.courierOrderId, "SB-NOT-OURS"));
    expect(event!.outcome).toBe("No shipment has this Shipbubble order.");
    expect((await webhook({ event: "wallet.threshold.alert", amount: 5000, currency: "NGN" })).status).toBe(200);
  });
});
