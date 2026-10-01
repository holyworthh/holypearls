import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { configurations } from "./configuration.js";
import { customers } from "./customers.js";
import { users } from "./identity.js";
import { deliveryZones } from "./pricing.js";

/*
 * Quotes, minimal (T03-08): a "Request Final Quote" creates a quote in
 * PENDING_REVIEW with a saved copy of the configuration and its price
 * (TECH-01 §5). Staff build versions in T05-03; the full quote flow extends
 * this table there.
 */

/** TECH-01 §4 quote statuses. */
export const quoteStatus = pgEnum("quote_status", ["PENDING_REVIEW", "READY", "REVISION_REQUESTED", "ACCEPTED", "DECLINED", "EXPIRED"]);

export const quotes = pgTable(
  "quotes",
  {
    id: idColumn(),
    /** Customer-facing reference, for example HP-Q-2026-0031. Never used for access (TECH-01 §1). */
    reference: text("reference").notNull(),
    status: quoteStatus("status").notNull().default("PENDING_REVIEW"),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    configurationId: uuid("configuration_id").references(() => configurations.id, { onDelete: "set null" }),
    /** Unchangeable copy of what the customer asked for: product, choices, garment answers, files, price shown (TECH-01 §5). */
    requestSnapshot: jsonb("request_snapshot").notNull(),
    /** The customer's note, phone and preferred contact. */
    contact: jsonb("contact").notNull(),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("quotes_reference_unique").on(table.reference), index("quotes_status_idx").on(table.status, table.createdAt)],
);

/*
 * Cart and checkout (T04-01, COM-FR-080–084, TECH-05 §1). A cart belongs to an
 * account or, before sign-in, to the browser's device key (stored hashed),
 * like configuration drafts. Each item keeps a copy of the configuration and
 * its price as they were when added. A checkout copies the ready items again,
 * repriced by the server at that moment, and never changes after that except
 * for the customer's contact, address and delivery answers.
 */
export const carts = pgTable(
  "carts",
  {
    id: idColumn(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    ownerDeviceHash: text("owner_device_hash"),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("carts_owner_user_unique").on(table.ownerUserId),
    uniqueIndex("carts_owner_device_unique").on(table.ownerDeviceHash),
  ],
);

/** READY can be paid at checkout; QUOTE needs a quote first and is never charged (COM-FR-081). */
export const cartItemGroup = pgEnum("cart_item_group", ["READY", "QUOTE"]);

export const cartItems = pgTable(
  "cart_items",
  {
    id: idColumn(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => configurations.id, { onDelete: "cascade" }),
    group: cartItemGroup("group").notNull(),
    /** The configuration and its price when added (COM-FR-080). */
    snapshot: jsonb("snapshot").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("cart_items_configuration_unique").on(table.configurationId), index("cart_items_cart_idx").on(table.cartId, table.createdAt)],
);

export const checkoutStatus = pgEnum("checkout_status", ["OPEN", "COMPLETED", "ABANDONED"]);

export const checkouts = pgTable(
  "checkouts",
  {
    id: idColumn(),
    cartId: uuid("cart_id").references(() => carts.id, { onDelete: "set null" }),
    status: checkoutStatus("status").notNull().default("OPEN"),
    /** Who may open it: copied from the cart. */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    ownerDeviceHash: text("owner_device_hash"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    currency: text("currency").notNull().default("NGN"),
    /** The ready items, repriced by the server when the checkout was created. Never changes. */
    items: jsonb("items").notNull(),
    /** The configurations those items came from, for the one-open-checkout rule. */
    configurationIds: uuid("configuration_ids").array().notNull(),
    contact: jsonb("contact"),
    address: jsonb("address"),
    deliveryZoneId: uuid("delivery_zone_id").references(() => deliveryZones.id, { onDelete: "set null" }),
    /** The delivery choice and the zone's name, pricing and rate as they were when chosen. */
    delivery: jsonb("delivery"),
    billing: jsonb("billing"),
    /** Server-calculated amounts in kobo (TECH-05 §1–2). */
    goodsMinor: bigint("goods_minor", { mode: "bigint" }).notNull(),
    deliveryMinor: bigint("delivery_minor", { mode: "bigint" }),
    vatMinor: bigint("vat_minor", { mode: "bigint" }).notNull(),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    vatRateBps: integer("vat_rate_bps").notNull(),
    vatOnDelivery: boolean("vat_on_delivery").notNull(),
    taxSettingId: uuid("tax_setting_id"),
    step: text("step").notNull().default("contact"),
    version: versionColumn(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("checkouts_open_cart_unique").on(table.cartId).where(sql`${table.status} = 'OPEN'`),
    index("checkouts_customer_idx").on(table.customerId),
  ],
);
