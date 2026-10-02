import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { amountMinorColumn, createdAt, currencyColumn, idColumn, updatedAt, versionColumn } from "../columns.js";
import { products } from "./catalogue.js";
import { customers } from "./customers.js";
import { staffProfiles } from "./identity.js";
import { quotes } from "./sales.js";

/*
 * Quote versions (T05-03; QUOTE-FR-001–002, OPS-FR-031–034, TECH-01 §4–5).
 * Staff build a DRAFT version; sending it saves an unchangeable copy and the
 * version becomes SENT. A sent version's content can never change: a database
 * trigger refuses it (migration 0029), so only its status moves on
 * (SUPERSEDED, ACCEPTED, DECLINED, EXPIRED). Only one version per quote can
 * be SENT at a time.
 */

export const quoteVersionStatus = pgEnum("quote_version_status", ["DRAFT", "SENT", "SUPERSEDED", "ACCEPTED", "DECLINED", "EXPIRED"]);

export const quoteVersions = pgTable(
  "quote_versions",
  {
    id: idColumn(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    status: quoteVersionStatus("status").notNull().default("DRAFT"),
    currency: currencyColumn(),
    designMinor: amountMinorColumn("design_minor"),
    deliveryMinor: amountMinorColumn("delivery_minor"),
    deliveryNote: text("delivery_note").notNull().default(""),
    installationMinor: amountMinorColumn("installation_minor"),
    installationNote: text("installation_note").notNull().default(""),
    otherMinor: amountMinorColumn("other_minor"),
    otherLabel: text("other_label").notNull().default(""),
    /** VAT copied from the tax setting when the version was made (TECH-05 §2). */
    vatRateBps: smallint("vat_rate_bps").notNull(),
    vatOnDelivery: boolean("vat_on_delivery").notNull().default(false),
    goodsMinor: amountMinorColumn("goods_minor"),
    feesMinor: amountMinorColumn("fees_minor"),
    vatMinor: amountMinorColumn("vat_minor"),
    totalMinor: amountMinorColumn("total_minor"),
    validDays: integer("valid_days").notNull(),
    /** Set when sent: valid-until for acceptance (QUOTE-FR-006). */
    validUntil: timestamp("valid_until", { withTimezone: true }),
    terms: text("terms").notNull().default(""),
    assumptions: text("assumptions").notNull().default(""),
    productionSequence: text("production_sequence").notNull().default(""),
    /** ScheduleEntry[] in @holypearls/contracts. */
    schedule: jsonb("schedule").notNull(),
    /** Everything the customer was sent, frozen at send (TECH-01 §5). */
    snapshot: jsonb("snapshot"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentByStaffId: uuid("sent_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    createdByStaffId: uuid("created_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("quote_versions_number_unique").on(table.quoteId, table.number),
    uniqueIndex("quote_versions_one_sent").on(table.quoteId).where(sql`${table.status} = 'SENT'`),
    uniqueIndex("quote_versions_one_draft").on(table.quoteId).where(sql`${table.status} = 'DRAFT'`),
    index("quote_versions_valid_until_idx").on(table.validUntil),
    check("quote_versions_amounts", sql`${table.designMinor} >= 0 and ${table.deliveryMinor} >= 0 and ${table.installationMinor} >= 0 and ${table.otherMinor} >= 0`),
  ],
);

export const quoteLineSource = pgEnum("quote_line_source", ["PROJECT_RECOMMENDATION", "PROJECT_ITEM", "CONFIGURATION", "MANUAL"]);

export const quoteLineItems = pgTable(
  "quote_line_items",
  {
    id: idColumn(),
    quoteVersionId: uuid("quote_version_id")
      .notNull()
      .references(() => quoteVersions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    source: quoteLineSource("source").notNull(),
    /** The project suggestion key, project item id or configuration id it came from. */
    sourceKey: text("source_key"),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    quantity: integer("quantity").notNull(),
    unitMinor: amountMinorColumn("unit_minor"),
    totalMinor: amountMinorColumn("total_minor"),
    createdAt: createdAt(),
  },
  (table) => [
    index("quote_line_items_version_idx").on(table.quoteVersionId, table.position),
    check("quote_line_items_quantity_positive", sql`${table.quantity} > 0`),
    check("quote_line_items_unit", sql`${table.unitMinor} >= 0`),
  ],
);

/** The admin defaults for new quote versions (QUOTE-FR-006, TECH-05 §4). One row. */
export const quoteSettings = pgTable(
  "quote_settings",
  {
    id: smallint("id").primaryKey().default(1),
    validDays: integer("valid_days").notNull().default(14),
    expiringNoticeDays: integer("expiring_notice_days").notNull().default(3),
    defaultSchedule: jsonb("default_schedule").notNull(),
    defaultTerms: text("default_terms").notNull().default(""),
    version: versionColumn(),
    updatedByStaffId: uuid("updated_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (table) => [check("quote_settings_single_row", sql`${table.id} = 1`)],
);

export const quoteRequestKind = pgEnum("quote_request_kind", ["CHANGE", "QUESTION", "DECLINE", "UPDATE"]);
export const quoteRequestStatus = pgEnum("quote_request_status", ["OPEN", "ANSWERED"]);

/**
 * What the customer asked about a quote version (QUOTE-FR-003–004,
 * OPS-FR-034): a change (optionally about one line), a question, a decline
 * reason, or a request for an updated quote after expiry. Kept with the
 * version and the project.
 */
export const quoteChangeRequests = pgTable(
  "quote_change_requests",
  {
    id: idColumn(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "restrict" }),
    quoteVersionId: uuid("quote_version_id").references(() => quoteVersions.id, { onDelete: "restrict" }),
    kind: quoteRequestKind("kind").notNull(),
    lineId: uuid("line_id").references(() => quoteLineItems.id, { onDelete: "set null" }),
    changeType: text("change_type"),
    note: text("note").notNull().default(""),
    /** Uploaded file ids attached to the request. */
    fileIds: jsonb("file_ids").notNull().default([]),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    status: quoteRequestStatus("status").notNull().default("OPEN"),
    createdAt: createdAt(),
  },
  (table) => [index("quote_change_requests_quote_idx").on(table.quoteId, table.createdAt)],
);

/** The customer's acceptance of one version (QUOTE-FR-007): insert-only, one per version. */
export const quoteAcceptances = pgTable(
  "quote_acceptances",
  {
    id: idColumn(),
    quoteVersionId: uuid("quote_version_id")
      .notNull()
      .references(() => quoteVersions.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    /** USER or GUEST, and when their email code was last checked. */
    actorType: text("actor_type").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    acknowledgement: text("acknowledgement").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("quote_acceptances_version_unique").on(table.quoteVersionId)],
);
