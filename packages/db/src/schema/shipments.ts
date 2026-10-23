import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { customers } from "./customers.js";
import { files } from "./files.js";
import { staffProfiles } from "./identity.js";
import { orderItems, orders } from "./orders.js";

/*
 * Shipments and problem reports (T08-01; FUL-FR-030–032, 060, 070,
 * OPS-FR-070–073, TECH-01 §4). Staff make shipments from ready items and
 * update their status by hand. A shipment of a courier-priced order can be
 * booked with Shipbubble instead (T08-06), whose webhooks then move it on.
 * Every status change is a new event row; history is never erased. A
 * customer can report a problem on their own order; staff triage it.
 */

export const shipmentStatus = pgEnum("shipment_status", ["PREPARING", "LABEL_CREATED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "ATTEMPTED_DELIVERY", "EXCEPTION", "RETURNED"]);

export const shipments = pgTable(
  "shipments",
  {
    id: idColumn(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    /** SHP-0162-1: the order's number and the shipment's position on it. */
    number: text("number").notNull(),
    status: shipmentStatus("status").notNull().default("PREPARING"),
    carrier: text("carrier").notNull().default(""),
    trackingNumber: text("tracking_number").notNull().default(""),
    destination: text("destination").notNull(),
    /** When it left us (first IN_TRANSIT) and when it arrived. */
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** Shipbubble booking (T08-06): its order ID, the service booked, the tracking page and what it cost before VAT. */
    courierOrderId: text("courier_order_id"),
    courierService: text("courier_service"),
    courierTrackingUrl: text("courier_tracking_url"),
    courierCostMinor: bigint("courier_cost_minor", { mode: "bigint" }),
    courierBookedAt: timestamp("courier_booked_at", { withTimezone: true }),
    createdByStaffId: uuid("created_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("shipments_number_unique").on(table.number),
    uniqueIndex("shipments_courier_order_unique").on(table.courierOrderId),
    index("shipments_order_idx").on(table.orderId),
    index("shipments_status_idx").on(table.status, table.updatedAt),
  ],
);

/** What is in a shipment: items and how many of each (FUL-FR-031). */
export const shipmentItems = pgTable(
  "shipment_items",
  {
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
  },
  (table) => [uniqueIndex("shipment_items_unique").on(table.shipmentId, table.orderItemId), index("shipment_items_item_idx").on(table.orderItemId), check("shipment_items_quantity_positive", sql`${table.quantity} > 0`)],
);

/** Insert-only status history (OPS-FR-073). */
export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: idColumn(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "restrict" }),
    fromStatus: shipmentStatus("from_status"),
    toStatus: shipmentStatus("to_status").notNull(),
    note: text("note"),
    staffProfileId: uuid("staff_profile_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [index("shipment_events_shipment_idx").on(table.shipmentId, table.createdAt)],
);

/**
 * Shipbubble webhook events (T08-06), kept as sent. Shipbubble gives events no
 * ID and resends a failed one unchanged, so the key is a hash of the body: a
 * resend is stored once and applied once.
 */
export const courierEvents = pgTable(
  "courier_events",
  {
    id: idColumn(),
    eventKey: text("event_key").notNull(),
    event: text("event").notNull(),
    courierOrderId: text("courier_order_id"),
    rawBody: text("raw_body").notNull(),
    /** What it did: the status moves made, or why nothing changed. */
    outcome: text("outcome"),
    receivedAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("courier_events_key_unique").on(table.eventKey), index("courier_events_order_idx").on(table.courierOrderId)],
);

export const problemType = pgEnum("problem_type", ["DAMAGED", "MISSING_OR_SHORT", "WRONG_ITEM_OR_SIZE", "INCORRECT_PRINTING", "QUALITY"]);
export const problemStatus = pgEnum("problem_status", ["NEW", "TRIAGED", "CLOSED"]);

export const problemReports = pgTable(
  "problem_reports",
  {
    id: idColumn(),
    /** HP-RP-2026-0012, from problem_report_seq. */
    number: text("number").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    type: problemType("type").notNull(),
    quantity: integer("quantity").notNull(),
    description: text("description").notNull(),
    status: problemStatus("status").notNull().default("NEW"),
    /** Internal; never shown to the customer. */
    triageNote: text("triage_note"),
    triagedByStaffId: uuid("triaged_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("problem_reports_number_unique").on(table.number), index("problem_reports_status_idx").on(table.status, table.createdAt), index("problem_reports_order_idx").on(table.orderId), check("problem_reports_quantity_positive", sql`${table.quantity} > 0`)],
);

export const problemReportPhotos = pgTable(
  "problem_report_photos",
  {
    problemReportId: uuid("problem_report_id")
      .notNull()
      .references(() => problemReports.id, { onDelete: "restrict" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
  },
  (table) => [uniqueIndex("problem_report_photos_unique").on(table.problemReportId, table.fileId)],
);

/** Staff replies to the customer, kept with the report. */
export const problemReplies = pgTable(
  "problem_replies",
  {
    id: idColumn(),
    problemReportId: uuid("problem_report_id")
      .notNull()
      .references(() => problemReports.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    staffProfileId: uuid("staff_profile_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [index("problem_replies_report_idx").on(table.problemReportId, table.createdAt)],
);

/** One durable provider call. Unclear outcomes block another call until staff reconcile them. */
export const courierBookings = pgTable("courier_bookings", {
  id: idColumn(),
  shipmentId: uuid("shipment_id").notNull().references(() => shipments.id, { onDelete: "restrict" }),
  status: text("status").notNull(),
  requestToken: text("request_token").notNull(),
  serviceCode: text("service_code").notNull(),
  courierId: text("courier_id").notNull(),
  courierName: text("courier_name").notNull(),
  costMinor: bigint("cost_minor", { mode: "bigint" }).notNull(),
  pricedMinor: bigint("priced_minor", { mode: "bigint" }),
  note: text("note").notNull(),
  result: jsonb("result"),
  failureMessage: text("failure_message"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("courier_bookings_active_unique").on(table.shipmentId).where(sql`${table.status} in ('SENDING', 'UNKNOWN', 'ACCEPTED')`),
  index("courier_bookings_shipment_idx").on(table.shipmentId, table.createdAt),
  check("courier_bookings_status", sql`${table.status} in ('SENDING', 'UNKNOWN', 'ACCEPTED', 'FINALIZED', 'NOT_BOOKED')`),
  check("courier_bookings_result", sql`${table.status} not in ('ACCEPTED', 'FINALIZED') or ${table.result} is not null`),
]);
