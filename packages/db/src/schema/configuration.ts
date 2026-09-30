import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
/** UPLOAD = ready artwork; LOGO and REFERENCE are files staff build from (COM-FR-050). */
export const artworkChoice = pgEnum("artwork_choice", ["UPLOAD", "DESIGN_HELP", "LATER", "LOGO", "REFERENCE"]);
/** How the garment is sourced (COM-FR-020). */
export const garmentSourcing = pgEnum("garment_sourcing", ["SOURCE_CUSTOMIZE", "MAKE_FROM_SCRATCH", "CUSTOMER_SUPPLIED", "HELP_ME_CHOOSE"]);
export const decorationMethod = pgEnum("decoration_method", ["EMBROIDERY", "PRINT", "BOTH", "RECOMMEND"]);
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
    sourcing: garmentSourcing("sourcing"),
    decoration: decorationMethod("decoration"),
    /** Sourcing details: reference, fit, fabric, labels, sample first; or supplied items and how we receive them. */
    details: jsonb("details").notNull().default({}),
    /** "I don't know the sizes yet" is a valid answer (COM-FR-027). */
    sizesUnknown: boolean("sizes_unknown").notNull().default(false),
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

export const placementPosition = pgEnum("placement_position", [
  "LEFT_CHEST",
  "RIGHT_CHEST",
  "CENTRE_CHEST",
  "FULL_FRONT",
  "UPPER_BACK",
  "FULL_BACK",
  "LEFT_SLEEVE",
  "RIGHT_SLEEVE",
  "CUSTOM",
]);
export const placementSize = pgEnum("placement_size", ["SMALL", "STANDARD", "LARGE"]);

/** Where the decoration goes (COM-FR-025). One row per position. */
export const configurationPlacements = pgTable(
  "configuration_placements",
  {
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => configurations.id, { onDelete: "cascade" }),
    position: placementPosition("position").notNull(),
    size: placementSize("size").notNull().default("STANDARD"),
    method: decorationMethod("method"),
    /** Text to add (a name or slogan), or the description of a custom position. */
    note: text("note"),
  },
  (table) => [primaryKey({ columns: [table.configurationId, table.position] })],
);

/** Quantities per size (COM-FR-027; TECH-01 configuration_sizes). */
export const configurationSizes = pgTable(
  "configuration_sizes",
  {
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => configurations.id, { onDelete: "cascade" }),
    size: text("size").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => [primaryKey({ columns: [table.configurationId, table.size] })],
);

/** Per-item names, numbers and departments (COM-FR-029; TECH-01 configuration_personalization_rows). */
export const configurationPersonalizationRows = pgTable(
  "configuration_personalization_rows",
  {
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => configurations.id, { onDelete: "cascade" }),
    row: integer("row").notNull(),
    name: text("name"),
    number: text("number"),
    department: text("department"),
    size: text("size"),
  },
  (table) => [primaryKey({ columns: [table.configurationId, table.row] })],
);

export const configurationFileRole = pgEnum("configuration_file_role", ["ARTWORK", "LOGO", "REFERENCE", "GARMENT_PHOTO"]);
/** What the customer chose for a low-resolution file; it never blocks the order (COM-FR-051). */
export const lowResolutionAction = pgEnum("low_resolution_action", ["REPLACE", "CLEANUP", "REVIEW"]);

/** Files attached to a configuration (TECH-01 configuration_files). */
export const configurationFiles = pgTable(
  "configuration_files",
  {
    id: idColumn(),
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => configurations.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    role: configurationFileRole("role").notNull(),
    lowResolutionAction: lowResolutionAction("low_resolution_action"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("configuration_files_unique").on(table.configurationId, table.fileId)],
);
