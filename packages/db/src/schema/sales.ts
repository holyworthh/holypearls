import { index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { configurations } from "./configuration.js";
import { customers } from "./customers.js";

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
