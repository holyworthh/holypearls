import { z } from "zod";
import { createHash } from "node:crypto";
import { displayMoney, SHIPMENT_NEXT, type ShipmentStatus, type bookCourierSchema } from "@holypearls/contracts";
import { and, asc, type Database, eq, inArray, schema, sql } from "@holypearls/db";
import { AppError } from "../errors.js";
import type { ActorContext } from "../identity/actor.js";
import type { OrderEmailDeps } from "../orders/orders.js";
import { recordAudit } from "../platform/audit.js";
import { chooseRate, type Courier, CourierError, type CourierRate } from "../sales/courier.js";
import { liveQuote } from "../sales/courier-pricing.js";
import { moveShipment, shipmentView } from "./shipments.js";

/*
 * Booking couriers through Shipbubble (T08-06; owner, 2026-10-05). A shipment
 * of an order whose delivery was priced by courier at checkout (T08-05) can
 * be booked from Shipments. The checkout's rate has gone stale by then (its
 * pickup date has passed), so the rate is asked for again for the items in
 * this shipment, and the same courier service is booked when it's still
 * offered. The customer never pays more after paying: when the courier now
 * costs more than delivery was priced at, the difference is HolyPearls' cost
 * and is recorded (owner, 2026-10-07). Shipbubble's webhooks then move the
 * shipment along TECH-01 §4, one legal step at a time, so its history never
 * skips a status (OPS-FR-073).
 */

export type CourierBookingDeps = OrderEmailDeps & { courier?: Courier | null };

interface CheckoutDelivery {
  source?: string;
  rateMinor?: string | null;
  courier?: { name: string; serviceCode: string } | null;
}

interface OrderSnapshot {
  product: { id: string };
  choices: { option: string; value: string }[];
}

/** The rate to book: the service the checkout priced if it's still offered, else the one the courier rule picks. */
function rateToBook(rates: CourierRate[], serviceCode: string | undefined, rule: "CHEAPEST" | "FASTEST") {
  const same = rates.find((rate) => rate.serviceCode === serviceCode && rate.serviceType === "pickup" && rate.totalMinor > 0n);
  return same ?? chooseRate(rates, rule);
}

/** Books a PREPARING shipment with Shipbubble and moves it to LABEL_CREATED (FULFILMENT_MANAGE). */
const activeBooking = (shipmentId: string) => and(eq(schema.courierBookings.shipmentId, shipmentId), inArray(schema.courierBookings.status, ["SENDING", "UNKNOWN", "ACCEPTED"]));
const resultSchema = z.object({ orderId: z.string().min(1).max(200), status: z.string(), trackingCode: z.string().nullable(), trackingUrl: z.url().nullable() });
const unclearMessage = "Check this booking in Shipbubble before booking again. Its result is unclear; another booking could charge twice.";

export async function bookCourier(deps: CourierBookingDeps, actor: ActorContext, id: string, input: z.infer<typeof bookCourierSchema>) {
  const courier = deps.courier ?? null;
  const prepared = await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.shipments).where(eq(schema.shipments.id, id)).for("update");
    if (!row) throw new AppError("NOT_FOUND");
    if (row.version !== input.version) throw new AppError("VERSION_CONFLICT", { context: { latest: await shipmentView(tx, id) } });
    if (row.courierOrderId) throw new AppError("RULE_FAILED", { message: `${row.number} is already booked with the courier.`, context: { reason: "ALREADY_BOOKED" } });
    if (row.status !== "PREPARING") throw new AppError("RULE_FAILED", { message: `${row.number} can only be booked before it has a label.`, context: { reason: "NOT_PREPARING" } });
    const [operation] = await tx.select().from(schema.courierBookings).where(activeBooking(id)).for("update");
    if (input.reconciliation) {
      if (!operation || operation.status === "ACCEPTED" || (operation.status === "SENDING" && actor.now.getTime() - operation.createdAt.getTime() < 60_000))
        throw new AppError("CONFLICT", { message: "Refresh the shipment after the booking finishes before reconciling it." });
      const decision = input.reconciliation;
      const result =
        decision.outcome === "BOOKED"
          ? { orderId: decision.orderId!, status: "pending", trackingUrl: decision.trackingUrl ?? null, trackingCode: decision.trackingCode ?? null }
          : null;
      const [saved] = await tx
        .update(schema.courierBookings)
        .set({ status: result ? "ACCEPTED" : "NOT_BOOKED", result, updatedAt: actor.now })
        .where(eq(schema.courierBookings.id, operation.id))
        .returning();
      await recordAudit(tx, actor, {
        action: "shipment.courier_reconciled",
        summary: `${row.number}: ${decision.note}`,
        recordType: "SHIPMENT",
        recordId: id,
        recordLabel: row.number,
        before: { operationId: operation.id, status: operation.status, requestToken: operation.requestToken },
        after: { outcome: decision.outcome, result, note: decision.note },
        permission: "FULFILMENT_MANAGE",
      });
      return { operation: result ? saved! : null, send: false };
    }
    if (operation) {
      if (operation.status === "ACCEPTED") return { operation, send: false };
      throw new AppError("CONFLICT", { message: unclearMessage, context: { reason: "COURIER_BOOKING_UNCLEAR" } });
    }
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, row.orderId));
    if (!order) throw new AppError("NOT_FOUND");
    if (order.cancelledAt) throw new AppError("RULE_FAILED", { message: "This order is cancelled.", context: { reason: "CANCELLED" } });
    const delivery = (order.delivery ?? {}) as CheckoutDelivery;
    if (delivery.source !== "COURIER")
      throw new AppError("RULE_FAILED", {
        message: "Only orders priced by courier at checkout can be booked here. Arrange this delivery by hand.",
        context: { reason: "NOT_COURIER_PRICED" },
      });
    if (!courier) throw new AppError("RULE_FAILED", { message: "Add the Shipbubble key to the API's settings before booking couriers.", context: { reason: "NO_COURIER_KEY" } });

    const lines = await tx
      .select({ quantity: schema.shipmentItems.quantity, item: schema.orderItems })
      .from(schema.shipmentItems)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.shipmentItems.orderItemId))
      .where(eq(schema.shipmentItems.shipmentId, id))
      .orderBy(asc(schema.orderItems.position));
    const live = await liveQuote(deps.db, courier, {
      items: lines.map(({ quantity, item }) => {
        const snapshot = item.snapshot as OrderSnapshot;
        return {
          productId: snapshot.product.id,
          productName: item.productName,
          quantity,
          // This shipment's share of the line, before VAT.
          goodsMinor: (item.goodsMinor * BigInt(quantity)) / BigInt(item.quantity),
          choices: Object.fromEntries(snapshot.choices.map((choice) => [choice.option, choice.value])),
        };
      }),
      contact: order.contact as { name: string; email: string; phone: string },
      address: order.address as { street: string; area: string; state: string; country: string },
      now: actor.now,
    });
    if (!live.ok)
      throw new AppError("RULE_FAILED", {
        message: live.problem ?? "Courier prices are switched off. Switch them on in Delivery & installation, or arrange this delivery by hand.",
        context: { reason: "COURIER_UNAVAILABLE" },
      });
    const rate = rateToBook(live.quote.rates, delivery.courier?.serviceCode, live.rule);
    if (!rate)
      throw new AppError("RULE_FAILED", {
        message: "No courier collects from the workshop for this address now. Arrange this delivery by hand.",
        context: { reason: "NO_COURIER" },
      });

    const costMinor = rate.totalMinor - rate.vatMinor;
    const pricedMinor = delivery.rateMinor ? BigInt(delivery.rateMinor) : null;
    const notes = [`Booked with ${rate.courierName} for ${displayMoney(costMinor, "NGN")} before VAT.`];
    if (delivery.courier && delivery.courier.serviceCode !== rate.serviceCode) notes.push(`${delivery.courier.name} no longer collects for this address.`);
    if (pricedMinor !== null && costMinor > pricedMinor)
      notes.push(`Delivery was priced at ${displayMoney(pricedMinor, "NGN")}; the ${displayMoney(costMinor - pricedMinor, "NGN")} difference is HolyPearls' cost.`);
    const [saved] = await tx
      .insert(schema.courierBookings)
      .values({
        shipmentId: id,
        status: "SENDING",
        requestToken: live.quote.requestToken,
        serviceCode: rate.serviceCode,
        courierId: rate.courierId,
        courierName: rate.courierName,
        costMinor,
        pricedMinor,
        note: notes.join(" "),
      })
      .returning();
    return { operation: saved!, send: true };
  });
  const operation = prepared.operation;
  if (!operation) return shipmentView(deps.db, id);
  if (prepared.send) {
    let result;
    try {
      result = resultSchema.parse(await courier!.book({ requestToken: operation.requestToken, serviceCode: operation.serviceCode, courierId: operation.courierId }));
    } catch (error) {
      await deps.db
        .update(schema.courierBookings)
        .set({ status: "UNKNOWN", failureMessage: error instanceof CourierError ? error.message : "No reliable provider result.", updatedAt: actor.now })
        .where(eq(schema.courierBookings.id, operation.id));
      throw new AppError("CONFLICT", { message: unclearMessage, context: { reason: "COURIER_BOOKING_UNCLEAR" } });
    }
    await deps.db.update(schema.courierBookings).set({ status: "ACCEPTED", result, updatedAt: actor.now }).where(eq(schema.courierBookings.id, operation.id));
  }
  await finalizeBooking(deps, actor, id);
  return shipmentView(deps.db, id);
}

/** Local retries and signed webhooks use the same durable provider result. */
async function finalizeBooking(deps: CourierBookingDeps, actor: ActorContext, id: string) {
  await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.shipments).where(eq(schema.shipments.id, id)).for("update");
    if (!row || row.courierOrderId) return;
    const [operation] = await tx
      .select()
      .from(schema.courierBookings)
      .where(and(activeBooking(id), eq(schema.courierBookings.status, "ACCEPTED")))
      .for("update");
    if (!operation) return;
    const result = resultSchema.parse(operation.result);
    await tx
      .update(schema.shipments)
      .set({
        courierOrderId: result.orderId,
        courierService: operation.serviceCode,
        courierTrackingUrl: result.trackingUrl,
        courierCostMinor: operation.costMinor,
        courierBookedAt: operation.createdAt,
      })
      .where(eq(schema.shipments.id, id));
    await recordAudit(tx, actor, {
      action: "shipment.courier_booked",
      summary: `${row.number} booked with ${operation.courierName} (${result.orderId})`,
      recordType: "SHIPMENT",
      recordId: id,
      recordLabel: row.number,
      after: { courierOrderId: result.orderId, service: operation.serviceCode, costMinor: operation.costMinor.toString(), pricedMinor: operation.pricedMinor?.toString() ?? null },
      permission: "FULFILMENT_MANAGE",
    });
    await moveShipment(tx, deps, actor, row, "LABEL_CREATED", {
      note: `${operation.note} Shipbubble ${result.orderId}.`,
      carrier: operation.courierName,
      trackingNumber: result.trackingCode ?? row.trackingNumber,
    });
    await tx.update(schema.courierBookings).set({ status: "FINALIZED", updatedAt: actor.now }).where(eq(schema.courierBookings.id, operation.id));
  });
}

/* ---- Webhooks ---- */

/** Shipbubble's statuses on the TECH-01 path. Anything not listed changes no status. */
const STATUS_FROM_COURIER: Record<string, ShipmentStatus> = {
  pending: "LABEL_CREATED",
  confirmed: "LABEL_CREATED",
  picked_up: "IN_TRANSIT",
  in_transit: "IN_TRANSIT",
  completed: "DELIVERED",
  cancelled: "EXCEPTION",
};

/** Statuses a webhook never passes through on the way somewhere else: they need a person to have seen them. */
const NOT_ON_THE_WAY: ShipmentStatus[] = ["ATTEMPTED_DELIVERY", "EXCEPTION", "RETURNED"];

/** The shortest run of legal moves from one status to another, or null when there's none. */
export function legalPath(from: ShipmentStatus, to: ShipmentStatus): ShipmentStatus[] | null {
  if (from === to) return [];
  const previous = new Map<ShipmentStatus, ShipmentStatus>();
  const queue: ShipmentStatus[] = [from];
  while (queue.length) {
    const status = queue.shift()!;
    for (const next of SHIPMENT_NEXT[status]) {
      if (previous.has(next) || next === from) continue;
      previous.set(next, status);
      if (next === to) {
        const path: ShipmentStatus[] = [to];
        for (let step = status; step !== from; step = previous.get(step)!) path.unshift(step);
        return path;
      }
      if (!NOT_ON_THE_WAY.includes(next)) queue.push(next);
    }
  }
  return null;
}

interface WebhookBody {
  event?: unknown;
  order_id?: unknown;
  status?: unknown;
  tracking_url?: unknown;
  courier?: { tracking_code?: unknown } | null;
  data?: WebhookBody;
}

const text = (value: unknown, max = 200) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

/**
 * Shipbubble's webhook: checks the signature, keeps the event once, then
 * applies it. Returns false for a bad signature. Shipbubble wants an answer
 * within 15 seconds, and the work is a few rows, so it's done here.
 */
export async function receiveShipbubbleWebhook(deps: CourierBookingDeps, rawBody: Buffer, signature: string | undefined, requestId: string, now = new Date()) {
  if (!deps.courier || !deps.courier.verifyWebhook(rawBody, signature)) return false;
  let parsed: WebhookBody;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return false;
  }
  // Shipment fields sit at the top level; some events nest them in data.
  const body = parsed.order_id === undefined && parsed.data ? { ...parsed.data, event: parsed.event ?? parsed.data.event } : parsed;
  const event = text(body.event, 100) ?? "unknown";
  const courierOrderId = text(body.order_id);
  const actor: ActorContext = { type: "anonymous", requestId, now };
  if (courierOrderId) {
    const [pending] = await deps.db
      .select({ shipmentId: schema.courierBookings.shipmentId })
      .from(schema.courierBookings)
      .where(and(eq(schema.courierBookings.status, "ACCEPTED"), sql`${schema.courierBookings.result}->>'orderId' = ${courierOrderId}`));
    if (pending) await finalizeBooking(deps, actor, pending.shipmentId);
  }
  await deps.db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(schema.courierEvents)
      .values({ eventKey: createHash("sha256").update(rawBody).digest("hex"), event, courierOrderId, rawBody: rawBody.toString("utf8") })
      .onConflictDoNothing()
      .returning({ id: schema.courierEvents.id });
    // A resent event is already saved and applied.
    if (!saved) return;
    const outcome = await applyEvent(tx, deps, actor, {
      event,
      courierOrderId,
      status: text(body.status, 50),
      trackingCode: text(body.courier?.tracking_code, 120),
      trackingUrl: text(body.tracking_url, 500),
    });
    await tx.update(schema.courierEvents).set({ outcome, processedAt: now }).where(eq(schema.courierEvents.id, saved.id));
  });
  return true;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function applyEvent(
  tx: Tx,
  deps: CourierBookingDeps,
  actor: ActorContext,
  input: { event: string; courierOrderId: string | null; status: string | null; trackingCode: string | null; trackingUrl: string | null },
) {
  if (!input.event.startsWith("shipment.")) return "Not a shipment event.";
  if (!input.courierOrderId) return "No Shipbubble order ID.";
  let [row] = await tx.select().from(schema.shipments).where(eq(schema.shipments.courierOrderId, input.courierOrderId)).for("update");
  if (!row) return "No shipment has this Shipbubble order.";
  const done: string[] = [];

  const tracking = input.trackingCode && input.trackingCode !== row.trackingNumber;
  const trackingUrl = input.trackingUrl && input.trackingUrl !== row.courierTrackingUrl;
  if (tracking || trackingUrl) {
    [row] = await tx
      .update(schema.shipments)
      .set({
        ...(tracking && { trackingNumber: input.trackingCode! }),
        ...(trackingUrl && { courierTrackingUrl: input.trackingUrl }),
        version: row.version + 1,
        updatedAt: actor.now,
      })
      .where(eq(schema.shipments.id, row.id))
      .returning();
    done.push("Tracking updated.");
  }

  const target =
    input.event === "shipment.cancelled"
      ? "EXCEPTION"
      : input.event === "shipment.status.changed" || input.event === "shipment.label.created"
        ? (STATUS_FROM_COURIER[input.status ?? ""] ?? null)
        : null;
  if (!target || target === row!.status) return [...done, target ? `Already ${target}.` : "No status change."].join(" ");
  const path = legalPath(row!.status, target);
  if (!path) {
    const why = `Shipbubble reported "${input.status ?? input.event}", but ${row!.number} can't move from ${row!.status} to ${target}. Check it by hand.`;
    // A note on the shipment's history, where staff look; the status stays as it is.
    await tx.insert(schema.shipmentEvents).values({ shipmentId: row!.id, fromStatus: row!.status, toStatus: row!.status, note: why });
    await recordAudit(tx, actor, { action: "shipment.courier_update_refused", summary: why, recordType: "SHIPMENT", recordId: row!.id, recordLabel: row!.number });
    return [...done, why].join(" ");
  }
  for (const step of path) {
    row = await moveShipment(tx, deps, actor, row!, step, { note: `From Shipbubble: ${input.event === "shipment.cancelled" ? "cancelled" : input.status}.` });
  }
  return [...done, `Moved to ${path.join(" → ")}.`].join(" ");
}
