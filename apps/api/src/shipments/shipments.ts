import { type AdminShipment, type CustomerShipment, type OrderShipping, SHIPMENT_NEXT, type ShipmentStatus } from "@holypearls/contracts";
import { and, asc, type Database, desc, eq, inArray, ne, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import { createGuestLink } from "../identity/customers.js";
import type { OrderEmailDeps } from "../orders/orders.js";
import { recordAudit } from "../platform/audit.js";
import { queueEmail } from "../platform/notifications.js";

/*
 * Shipments (T08-01; FUL-FR-030–032, OPS-FR-070–073, TECH-01 §4). Staff make
 * one or more shipments from items that are READY_TO_DISPATCH, never more
 * than is ready and not already shipped. Status is set by hand along the
 * TECH-01 path; each change is a new event row, so history is never erased.
 * When a shipment first leaves (IN_TRANSIT) its items become DISPATCHED once
 * every unit of the item is in a dispatched shipment, and DELIVERED once
 * every unit is delivered, so partial dispatch and delivery work per item.
 * Items waiting for a balance (READY_AWAITING_RELEASE) can't be shipped
 * (OPS-FR-064). The customer is emailed when a shipment is dispatched and
 * when it's delivered.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;
type Row = typeof schema.shipments.$inferSelect;

const staffOf = (actor: ActorContext) => (actor.type === "user" ? (actor.staff?.staffProfileId ?? null) : null);
const OPEN: ShipmentStatus[] = ["PREPARING", "LABEL_CREATED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "ATTEMPTED_DELIVERY", "EXCEPTION"];

/** Units of each item already in a shipment that wasn't returned. */
async function shippedByItem(db: Db, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, { shipped: number; dispatched: number; delivered: number }>();
  const rows = await db
    .select({ itemId: schema.shipmentItems.orderItemId, quantity: schema.shipmentItems.quantity, status: schema.shipments.status, dispatchedAt: schema.shipments.dispatchedAt })
    .from(schema.shipmentItems)
    .innerJoin(schema.shipments, eq(schema.shipments.id, schema.shipmentItems.shipmentId))
    .where(and(inArray(schema.shipmentItems.orderItemId, itemIds), ne(schema.shipments.status, "RETURNED")));
  const totals = new Map<string, { shipped: number; dispatched: number; delivered: number }>();
  for (const row of rows) {
    const total = totals.get(row.itemId) ?? { shipped: 0, dispatched: 0, delivered: 0 };
    total.shipped += row.quantity;
    if (row.dispatchedAt) total.dispatched += row.quantity;
    if (row.status === "DELIVERED") total.delivered += row.quantity;
    totals.set(row.itemId, total);
  }
  return totals;
}

async function views(db: Db, rows: Row[]): Promise<AdminShipment[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [lines, events, orders, staff, bookings] = await Promise.all([
    db
      .select({ shipmentId: schema.shipmentItems.shipmentId, quantity: schema.shipmentItems.quantity, name: schema.orderItems.productName, position: schema.orderItems.position })
      .from(schema.shipmentItems)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.shipmentItems.orderItemId))
      .where(inArray(schema.shipmentItems.shipmentId, ids))
      .orderBy(asc(schema.orderItems.position)),
    db.select().from(schema.shipmentEvents).where(inArray(schema.shipmentEvents.shipmentId, ids)).orderBy(desc(schema.shipmentEvents.createdAt)),
    db
      .select({ id: schema.orders.id, number: schema.orders.number, delivery: schema.orders.delivery })
      .from(schema.orders)
      .where(inArray(schema.orders.id, [...new Set(rows.map((row) => row.orderId))])),
    db.select({ id: schema.staffProfiles.id, name: schema.staffProfiles.displayName }).from(schema.staffProfiles),
    db.select().from(schema.courierBookings).where(and(inArray(schema.courierBookings.shipmentId, ids), inArray(schema.courierBookings.status, ["SENDING", "UNKNOWN", "ACCEPTED"]))),
  ]);
  const courierPriced = (orderId: string) => (orders.find((order) => order.id === orderId)?.delivery as { source?: string } | null)?.source === "COURIER";
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    status: row.status,
    carrier: row.carrier,
    trackingNumber: row.trackingNumber,
    destination: row.destination,
    dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    items: lines.filter((line) => line.shipmentId === row.id).map((line) => ({ name: line.name, quantity: line.quantity })),
    orderId: row.orderId,
    orderNumber: orders.find((order) => order.id === row.orderId)?.number ?? "",
    version: row.version,
    next: SHIPMENT_NEXT[row.status],
    courier: row.courierOrderId
      ? { orderId: row.courierOrderId, service: row.courierService, trackingUrl: row.courierTrackingUrl, costMinor: row.courierCostMinor?.toString() ?? null, bookedAt: row.courierBookedAt?.toISOString() ?? null }
      : null,
    // T08-06: a courier-priced order's shipment can be booked with Shipbubble until it has a label.
    bookable: !row.courierOrderId && row.status === "PREPARING" && courierPriced(row.orderId) && !bookings.some(booking => booking.shipmentId === row.id && booking.status !== "ACCEPTED"),
    bookingWarning: bookings.find(booking => booking.shipmentId === row.id)?.status === "ACCEPTED" ? "The courier accepted this booking. Finish saving it here; the courier won't be booked again." : bookings.some(booking => booking.shipmentId === row.id) ? `Check this booking in Shipbubble before booking again. Saved request token: ${bookings.find(booking => booking.shipmentId === row.id)!.requestToken}.` : null,
    bookingNeedsReconciliation: bookings.some(booking => booking.shipmentId === row.id && booking.status !== "ACCEPTED"),
    history: events
      .filter((event) => event.shipmentId === row.id)
      .map((event) => ({ from: event.fromStatus, status: event.toStatus, note: event.note, by: event.staffProfileId ? (staff.find((person) => person.id === event.staffProfileId)?.name ?? "Staff") : "System", at: event.createdAt.toISOString() })),
  }));
}

/** The customer's view: items, carrier, tracking and status history, never staff notes. */
export async function customerShipments(db: Db, orderId: string): Promise<CustomerShipment[]> {
  const rows = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, orderId)).orderBy(asc(schema.shipments.createdAt));
  return (await views(db, rows)).map((view) => ({
    id: view.id,
    number: view.number,
    status: view.status,
    carrier: view.carrier,
    trackingNumber: view.trackingNumber,
    destination: view.destination,
    dispatchedAt: view.dispatchedAt,
    deliveredAt: view.deliveredAt,
    items: view.items,
    // Notes that changed no status (a courier update staff must check) are for staff only.
    history: view.history.filter((event) => event.from !== event.status).map((event) => ({ status: event.status, at: event.at })),
  }));
}

/** Pen 115 queue: orders with items ready to ship, and shipments still on their way. */
export async function shippingQueue(db: Database) {
  const ready = await db
    .select({ orderId: schema.orders.id, orderNumber: schema.orders.number, contact: schema.orders.contact, readyItems: sql<number>`count(*)::int`, since: sql<Date>`min(${schema.orderItems.updatedAt})` })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(eq(schema.orderItems.status, "READY_TO_DISPATCH"))
    .groupBy(schema.orders.id)
    .orderBy(sql`min(${schema.orderItems.updatedAt})`)
    .limit(100);
  const active = await db.select().from(schema.shipments).where(inArray(schema.shipments.status, OPEN)).orderBy(asc(schema.shipments.updatedAt)).limit(100);
  return {
    ready: ready.map((row) => ({ orderId: row.orderId, orderNumber: row.orderNumber, contactName: (row.contact as { name: string }).name, readyItems: row.readyItems, since: new Date(row.since).toISOString() })),
    active: await views(db, active),
  };
}

function destinationOf(order: typeof schema.orders.$inferSelect) {
  const address = order.address as { street?: string; area?: string; state?: string; country?: string } | null;
  return address ? [address.street, address.area, address.state, address.country && address.country !== "NG" ? address.country : null].filter(Boolean).join(", ") : "";
}

/** One order's items with what can still ship, and its shipments (Pen 115 create). */
export async function orderShipping(db: Db, orderId: string): Promise<OrderShipping> {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) throw new AppError("NOT_FOUND");
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId)).orderBy(asc(schema.orderItems.position));
  const totals = await shippedByItem(
    db,
    items.map((item) => item.id),
  );
  const shipments = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, orderId)).orderBy(asc(schema.shipments.createdAt));
  return {
    orderId: order.id,
    orderNumber: order.number,
    contactName: (order.contact as { name: string }).name,
    destination: destinationOf(order),
    items: items.map((item) => {
      const shipped = totals.get(item.id)?.shipped ?? 0;
      return { id: item.id, position: item.position, name: item.productName, quantity: item.quantity, status: item.status, shipped, shippable: item.status === "READY_TO_DISPATCH" ? Math.max(item.quantity - shipped, 0) : 0 };
    }),
    shipments: await views(db, shipments),
  };
}

/** OPS-FR-070–071: a shipment from ready items, with destination, carrier and tracking. */
export async function createShipment(db: Database, actor: ActorContext, orderId: string, input: { items: { orderItemId: string; quantity: number }[]; carrier: string; trackingNumber: string; destination: string }) {
  const id = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!order) throw new AppError("NOT_FOUND");
    if (order.cancelledAt) throw new AppError("RULE_FAILED", { message: "This order is cancelled.", context: { reason: "CANCELLED" } });
    const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId)).for("update");
    const totals = await shippedByItem(
      tx,
      items.map((item) => item.id),
    );
    const fieldErrors: Record<string, string> = {};
    for (const line of input.items) {
      const item = items.find((row) => row.id === line.orderItemId);
      if (!item) throw new AppError("NOT_FOUND");
      const shippable = item.status === "READY_TO_DISPATCH" ? item.quantity - (totals.get(item.id)?.shipped ?? 0) : 0;
      if (item.status === "READY_AWAITING_RELEASE") fieldErrors[`items.${item.id}`] = `${item.productName} is waiting for the balance. It's released when the balance is paid.`;
      else if (shippable <= 0) fieldErrors[`items.${item.id}`] = `${item.productName} isn't ready to ship.`;
      else if (line.quantity > shippable) fieldErrors[`items.${item.id}`] = `Only ${shippable} ${shippable === 1 ? "is" : "are"} ready. Ship ${shippable} or fewer.`;
    }
    if (new Set(input.items.map((line) => line.orderItemId)).size !== input.items.length) fieldErrors.items = "Each item can appear once in a shipment.";
    if (Object.keys(fieldErrors).length) throw new AppError("VALIDATION_FAILED", { fieldErrors });
    const [{ count }] = (await tx.select({ count: sql<number>`count(*)::int` }).from(schema.shipments).where(eq(schema.shipments.orderId, orderId))) as [{ count: number }];
    const number = `SHP-${order.number.replace(/^HP-/, "")}-${count + 1}`;
    const staffId = staffOf(actor);
    const [shipment] = await tx.insert(schema.shipments).values({ orderId, number, carrier: input.carrier, trackingNumber: input.trackingNumber, destination: input.destination, createdByStaffId: staffId }).returning();
    await tx.insert(schema.shipmentItems).values(input.items.map((line) => ({ shipmentId: shipment!.id, orderItemId: line.orderItemId, quantity: line.quantity })));
    const summary = input.items.map((line) => `${items.find((item) => item.id === line.orderItemId)!.productName} × ${line.quantity}`).join(", ");
    await tx.insert(schema.shipmentEvents).values({ shipmentId: shipment!.id, fromStatus: null, toStatus: "PREPARING", note: `Shipment created · ${summary}`, staffProfileId: staffId });
    await recordAudit(tx, actor, { action: "shipment.created", summary: `${number} created for ${order.number}: ${summary}`, recordType: "SHIPMENT", recordId: shipment!.id, recordLabel: number, permission: "FULFILMENT_MANAGE" });
    return shipment!.id;
  });
  const [row] = await db.select().from(schema.shipments).where(eq(schema.shipments.id, id));
  return (await views(db, [row!]))[0]!;
}

/** Moves items on once every unit is dispatched or delivered (partial shipments leave them where they are). */
async function syncItems(tx: Tx, orderId: string, staffId: string | null) {
  const items = await tx.select().from(schema.orderItems).where(and(eq(schema.orderItems.orderId, orderId), inArray(schema.orderItems.status, ["READY_TO_DISPATCH", "DISPATCHED"])));
  const totals = await shippedByItem(
    tx,
    items.map((item) => item.id),
  );
  for (const item of items) {
    const total = totals.get(item.id);
    if (!total) continue;
    let to: "DISPATCHED" | "DELIVERED" | null = null;
    if (total.delivered >= item.quantity) to = "DELIVERED";
    else if (item.status === "READY_TO_DISPATCH" && total.dispatched >= item.quantity) to = "DISPATCHED";
    if (!to || to === item.status) continue;
    // READY_TO_DISPATCH → DELIVERED passes through DISPATCHED, so both steps are in the history.
    const steps: ("DISPATCHED" | "DELIVERED")[] = item.status === "READY_TO_DISPATCH" && to === "DELIVERED" ? ["DISPATCHED", "DELIVERED"] : [to];
    let from = item.status;
    for (const step of steps) {
      await tx.insert(schema.orderItemEvents).values({ orderItemId: item.id, fromStatus: from, toStatus: step, kind: "STATUS", note: step === "DISPATCHED" ? "All units dispatched" : "All units delivered", staffProfileId: staffId });
      from = step;
    }
    await tx
      .update(schema.orderItems)
      .set({ status: to, version: sql`${schema.orderItems.version} + 1`, updatedAt: new Date() })
      .where(eq(schema.orderItems.id, item.id));
  }
}

/**
 * One legal status move, inside the caller's transaction: the shipment, a new
 * history row, its items, the audit entry and the customer's email when it
 * leaves or arrives. Staff moves and Shipbubble's webhooks both come here.
 */
export async function moveShipment(tx: Tx, deps: OrderEmailDeps, actor: ActorContext, row: Row, to: ShipmentStatus, input: { note?: string | null; carrier?: string; trackingNumber?: string } = {}) {
  const now = actor.now;
  const leaving = to === "IN_TRANSIT" && !row.dispatchedAt;
  const staffId = staffOf(actor);
  const [saved] = await tx
    .update(schema.shipments)
    .set({
      status: to,
      ...(input.carrier !== undefined && { carrier: input.carrier }),
      ...(input.trackingNumber !== undefined && { trackingNumber: input.trackingNumber }),
      ...(leaving && { dispatchedAt: now }),
      ...(to === "DELIVERED" && { deliveredAt: now }),
      version: sql`${schema.shipments.version} + 1`,
      updatedAt: now,
    })
    .where(eq(schema.shipments.id, row.id))
    .returning();
  await tx.insert(schema.shipmentEvents).values({ shipmentId: row.id, fromStatus: row.status, toStatus: to, note: input.note?.trim() || null, staffProfileId: staffId });
  await syncItems(tx, row.orderId, staffId);
  const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, row.orderId));
  await recordAudit(tx, actor, { action: "shipment.status_changed", summary: `${row.number}: ${row.status} → ${to}`, recordType: "SHIPMENT", recordId: row.id, recordLabel: row.number, before: { status: row.status }, after: { status: to }, permission: staffId ? "FULFILMENT_MANAGE" : null });
  if (leaving || to === "DELIVERED") {
    const view = (await views(tx, [saved!]))[0]!;
    const contact = order!.contact as { email: string };
    const link = await createGuestLink(tx, deps.webOrigin, { purpose: "ORDER", targetType: "ORDER", targetId: order!.id, customerId: order!.customerId, now });
    await queueEmail(deps, tx, {
      template: leaving ? "shipment_dispatched" : "shipment_delivered",
      to: contact.email,
      customerId: order!.customerId,
      data: { orderNumber: order!.number, items: view.items.map((item) => `${item.name} × ${item.quantity}`).join(", "), carrier: view.carrier, trackingNumber: view.trackingNumber, url: link.url },
      record: { type: "ORDER", id: order!.id, label: order!.number },
      linkLabel: `Opens order ${order!.number}`,
      requestId: actor.requestId,
    });
  }
  return saved!;
}

/** OPS-FR-072–073: the next status by hand, with an optional note; history is only ever added to. */
export async function updateShipment(deps: OrderEmailDeps, actor: ActorContext, id: string, input: { status: ShipmentStatus; version: number; note?: string; carrier?: string; trackingNumber?: string }) {
  await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.shipments).where(eq(schema.shipments.id, id)).for("update");
    if (!row) throw new AppError("NOT_FOUND");
    if (row.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { latest: (await views(tx, [row]))[0] } });
    if (!SHIPMENT_NEXT[row.status].includes(input.status)) {
      throw new AppError("RULE_FAILED", { message: `${row.number} can't move from ${row.status} to ${input.status}.`, context: { reason: "ILLEGAL_MOVE", allowed: SHIPMENT_NEXT[row.status] } });
    }
    const [booking] = await tx.select({ id: schema.courierBookings.id }).from(schema.courierBookings).where(and(eq(schema.courierBookings.shipmentId, id), inArray(schema.courierBookings.status, ["SENDING", "UNKNOWN", "ACCEPTED"])));
    if (booking) throw new AppError("CONFLICT", { message: "Finish or reconcile the courier booking before changing this shipment." });
    await moveShipment(tx, deps, actor, row, input.status, { note: input.note, carrier: input.carrier, trackingNumber: input.trackingNumber });
  });
  return shipmentView(deps.db, id);
}

export async function shipmentView(db: Db, id: string) {
  const [row] = await db.select().from(schema.shipments).where(eq(schema.shipments.id, id));
  if (!row) throw new AppError("NOT_FOUND");
  return (await views(db, [row]))[0]!;
}
