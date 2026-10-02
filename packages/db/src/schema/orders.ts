import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { amountMinorColumn, createdAt, currencyColumn, idColumn, updatedAt } from "../columns.js";
import { configurations } from "./configuration.js";
import { customers } from "./customers.js";
import { users } from "./identity.js";
import { paymentAttempts, paymentIntents } from "./payments.js";
import { quoteVersions } from "./quotes.js";
import { checkouts } from "./sales.js";

/*
 * Orders and receipts (T04-05, TECH-05 §8–9, COM-FR-082, 085, PAY-FR-006).
 * A direct order is created from the checkout's frozen snapshot in the same
 * transaction as the payment that pays for it, once per checkout. Quotes add
 * their own source (the accepted quote version) in T05-05. A receipt is the
 * financial record of one successful payment; its page, PDF and email are
 * made from this row (an email is never the record).
 */

/** TECH-01 §4 order item statuses. Production moves them from T07-01 on. */
export const orderItemStatus = pgEnum("order_item_status", [
  "AWAITING_PREREQUISITE",
  "QUEUED",
  "IN_PRODUCTION",
  "QUALITY_CHECK",
  "READY_AWAITING_RELEASE",
  "READY_TO_DISPATCH",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
]);

export const orders = pgTable(
  "orders",
  {
    id: idColumn(),
    /** Customer-facing number, HP-2026-0151. Never used for access (TECH-01 §1). */
    number: text("number").notNull(),
    /** The paid checkout it came from; one order per checkout (TECH-05 §8). */
    checkoutId: uuid("checkout_id").references(() => checkouts.id, { onDelete: "restrict" }),
    /** The accepted quote version it came from; one order per version (TECH-05 §8, QUOTE-FR-008). */
    quoteVersionId: uuid("quote_version_id").references(() => quoteVersions.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    /** Who may open it without a link: the account, or the browser that checked out (copied from the checkout). */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    ownerDeviceHash: text("owner_device_hash"),
    currency: currencyColumn(),
    goodsMinor: amountMinorColumn("goods_minor"),
    deliveryMinor: bigint("delivery_minor", { mode: "bigint" }),
    vatMinor: amountMinorColumn("vat_minor"),
    totalMinor: amountMinorColumn("total_minor"),
    vatRateBps: integer("vat_rate_bps").notNull(),
    /** Contact, delivery address, delivery choice and billing as they were when paid. */
    contact: jsonb("contact").notNull(),
    address: jsonb("address"),
    delivery: jsonb("delivery"),
    billing: jsonb("billing"),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("orders_number_unique").on(table.number),
    uniqueIndex("orders_checkout_unique").on(table.checkoutId),
    uniqueIndex("orders_quote_version_unique").on(table.quoteVersionId),
    index("orders_customer_idx").on(table.customerId, table.placedAt),
    index("orders_owner_user_idx").on(table.ownerUserId),
    check("orders_source", sql`num_nonnulls(${table.checkoutId}, ${table.quoteVersionId}) = 1`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: idColumn(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    configurationId: uuid("configuration_id").references(() => configurations.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    summary: text("summary").notNull(),
    quantity: integer("quantity").notNull(),
    goodsMinor: amountMinorColumn("goods_minor"),
    vatMinor: amountMinorColumn("vat_minor"),
    totalMinor: amountMinorColumn("total_minor"),
    /** Production working days after proof approval, when known. */
    leadDays: jsonb("lead_days"),
    /** What production makes: the checkout's OrderableConfigurationSnapshotV1, unchanged (review P1-06). */
    snapshot: jsonb("snapshot").notNull(),
    status: orderItemStatus("status").notNull().default("AWAITING_PREREQUISITE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("order_items_order_position_unique").on(table.orderId, table.position), check("order_items_quantity_positive", sql`${table.quantity} > 0`)],
);

export const receipts = pgTable(
  "receipts",
  {
    id: idColumn(),
    /** HP-R-2026-0311. */
    number: text("number").notNull(),
    /** The successful attempt this receipt records; one receipt each (PAY-FR-006). */
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => paymentAttempts.id, { onDelete: "restrict" }),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => paymentIntents.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    amountMinor: amountMinorColumn(),
    currency: currencyColumn(),
    paystackReference: text("paystack_reference").notNull(),
    channel: text("channel"),
    /** Payer name and email as given at checkout. */
    payer: jsonb("payer").notNull(),
    /** What was paid for, as shown on the receipt: order number and item lines. */
    lines: jsonb("lines").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("receipts_number_unique").on(table.number), uniqueIndex("receipts_attempt_unique").on(table.attemptId), index("receipts_order_idx").on(table.orderId)],
);
