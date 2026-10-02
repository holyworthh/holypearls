import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn } from "../columns.js";
import { staffProfiles } from "./identity.js";
import { orderItemStatus, orderItems } from "./orders.js";

/*
 * Production (T07-01; FUL-FR-012–016, 020–021, OPS-FR-060–064, TECH-01 §4).
 * Each order item moves on its own. Every move writes an event row (insert
 * only). A hold is a separate record that pauses an item without changing its
 * status; quality check results are kept, including rework.
 */

/** Who made a move: staff, or the system when prerequisites or the balance are met. */
export const orderItemEvents = pgTable(
  "order_item_events",
  {
    id: idColumn(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    fromStatus: orderItemStatus("from_status"),
    toStatus: orderItemStatus("to_status"),
    /** STATUS, HOLD_PLACED, HOLD_RESOLVED or QC. */
    kind: text("kind").notNull(),
    note: text("note"),
    staffProfileId: uuid("staff_profile_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [index("order_item_events_item_idx").on(table.orderItemId, table.createdAt), check("order_item_events_kind", sql`${table.kind} in ('STATUS', 'HOLD_PLACED', 'HOLD_RESOLVED', 'QC')`)],
);

export const holdStatus = pgEnum("hold_status", ["OPEN", "RESOLVED"]);

export const holds = pgTable(
  "holds",
  {
    id: idColumn(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    status: holdStatus("status").notNull().default("OPEN"),
    /** Reason category (OPS-FR-062). The list is the owner's to confirm. */
    reason: text("reason").notNull(),
    internalNote: text("internal_note").notNull().default(""),
    /** Shown on the customer's order page (FUL-FR-013). */
    customerExplanation: text("customer_explanation").notNull(),
    /** CUSTOMER or HOLYPEARLS. */
    whoActs: text("who_acts").notNull(),
    timingImpactDays: integer("timing_impact_days"),
    placedByStaffId: uuid("placed_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    resolvedByStaffId: uuid("resolved_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // One open hold per item at a time.
    uniqueIndex("holds_open_unique")
      .on(table.orderItemId)
      .where(sql`${table.status} = 'OPEN'`),
    index("holds_status_idx").on(table.status, table.createdAt),
    check("holds_who_acts", sql`${table.whoActs} in ('CUSTOMER', 'HOLYPEARLS')`),
    check("holds_timing", sql`${table.timingImpactDays} is null or ${table.timingImpactDays} >= 0`),
  ],
);

export const qcOutcome = pgEnum("qc_outcome", ["PASSED", "REWORK"]);

export const qcResults = pgTable(
  "qc_results",
  {
    id: idColumn(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    outcome: qcOutcome("outcome").notNull(),
    note: text("note").notNull().default(""),
    staffProfileId: uuid("staff_profile_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [index("qc_results_item_idx").on(table.orderItemId, table.createdAt)],
);
