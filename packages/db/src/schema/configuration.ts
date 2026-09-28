import { boolean, index, integer, pgEnum, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { products } from "./catalogue.js";
import { customers } from "./customers.js";
import { files } from "./files.js";
import { users } from "./identity.js";
import { priceResults } from "./pricing.js";

/*
 * Configuration drafts (T03-03, COM-FR-010–014; TECH-01 §2 configuration).
 * A draft belongs to an account, or to the browser that started it (a hashed
 * device key in an HttpOnly cookie), or to a guest who opened the emailed
 * draft link (a guest link targeting the configuration).
 */

export const configurationStatus = pgEnum("configuration_status", ["DRAFT", "IN_CART", "QUOTE_REQUESTED", "ABANDONED"]);
export const artworkChoice = pgEnum("artwork_choice", ["UPLOAD", "DESIGN_HELP", "LATER"]);
export const rushChoice = pgEnum("rush_choice", ["STANDARD", "RUSH", "PRIORITY"]);

export const configurations = pgTable(
  "configurations",
  {
    id: idColumn(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    status: configurationStatus("status").notNull().default("DRAFT"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    /** SHA-256 of the browser's device key, for drafts started without signing in. */
    ownerDeviceHash: text("owner_device_hash"),
    /** Set when a guest asks for the draft link by email. */
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    quantity: integer("quantity"),
    rush: rushChoice("rush").notNull().default("STANDARD"),
    artwork: artworkChoice("artwork"),
    artworkFileId: uuid("artwork_file_id").references(() => files.id, { onDelete: "set null" }),
    /** The step the customer last worked on, so they come back to it. */
    step: text("step").notNull().default("options"),
    lastPriceResultId: uuid("last_price_result_id").references(() => priceResults.id, { onDelete: "set null" }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("configurations_owner_user_idx").on(table.ownerUserId), index("configurations_device_idx").on(table.ownerDeviceHash)],
);

/** One chosen value per option (TECH-01 §2 configuration_selections). */
export const configurationSelections = pgTable(
  "configuration_selections",
  {
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => configurations.id, { onDelete: "cascade" }),
    optionKey: text("option_key").notNull(),
    valueKey: text("value_key").notNull(),
    /** Answered in the flow's order; later answers are the ones kept or removed when an earlier one changes. */
    position: integer("position").notNull().default(0),
    fromDefault: boolean("from_default").notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.configurationId, table.optionKey] })],
);
