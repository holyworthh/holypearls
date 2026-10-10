import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { COLLECTION_STATUSES, DELIVERY_MODES, ORDER_DRAFT_STATUSES, PARTICIPANT_STATUSES, UNSURE_SIZE_RULES } from "@holypearls/contracts";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { configurations } from "./configuration.js";
import { customers } from "./customers.js";
import { users } from "./identity.js";
import { locations, organizations, templates } from "./organizations.js";

/*
 * Group collections (T12-01; PRD-05 B2B-FR-050–052; TECH-01 §2 groups,
 * §4 statuses). A collection belongs to one organization and location and
 * starts from an approved template or a saved design. Participants
 * (T12-01b) reach it through one share link, stored hashed for lookup and
 * sealed so the organizer can copy it again.
 */

export const collectionStatus = pgEnum("collection_status", COLLECTION_STATUSES);
export const collectionDeliveryMode = pgEnum("collection_delivery_mode", DELIVERY_MODES);
export const unsureSizeRule = pgEnum("unsure_size_rule", UNSURE_SIZE_RULES);

export const groupCollections = pgTable(
  "group_collections",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull(),
    title: text("title").notNull(),
    status: collectionStatus("status").notNull().default("DRAFT"),
    templateId: uuid("template_id").references(() => templates.id, { onDelete: "restrict" }),
    sourceConfigurationId: uuid("source_configuration_id")
      .notNull()
      .references(() => configurations.id, { onDelete: "restrict" }),
    /** The participant fields the organizer allows (B2B-FR-052). */
    fields: text("fields").array().notNull().default(sql`'{}'::text[]`),
    deadline: timestamp("deadline", { withTimezone: true }),
    deliveryMode: collectionDeliveryMode("delivery_mode").notNull().default("CENTRAL"),
    centralLocationId: uuid("central_location_id").references(() => locations.id, { onDelete: "restrict" }),
    branchLocationIds: uuid("branch_location_ids").array().notNull().default(sql`'{}'::uuid[]`),
    unsureSizeRule: unsureSizeRule("unsure_size_rule").notNull().default("ALLOW_UNSURE"),
    /** SHA-256 of the share link's secret, and the secret sealed with DATA_ENCRYPTION_KEY. */
    shareSecretHash: text("share_secret_hash"),
    shareSecretSealed: text("share_secret_sealed"),
    /** The source's saved copy when the collection was set up (TECH-01 §5). */
    snapshot: jsonb("snapshot").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({ columns: [table.locationId, table.organizationId], foreignColumns: [locations.id, locations.organizationId], name: "group_collections_location_fk" }).onDelete("restrict"),
    index("group_collections_organization_idx").on(table.organizationId, table.status, table.updatedAt),
    uniqueIndex("group_collections_share_unique").on(table.shareSecretHash),
    check("group_collections_central", sql`${table.deliveryMode} <> 'CENTRAL' or ${table.centralLocationId} is not null or ${table.status} = 'DRAFT'`),
  ],
);

export const participantStatus = pgEnum("participant_status", PARTICIPANT_STATUSES);

/**
 * A person taking part in a collection (T12-01b; PRD-05 B2B-FR-060–061). No
 * account: they join through the share link and get a guest session for
 * their own submission only. Several people can share an email (a family
 * address), so nothing is looked up by email.
 */
export const participants = pgTable(
  "participants",
  {
    id: idColumn(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => groupCollections.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    /** Set when they joined while signed in: a signed-in session always wins over a guest one (TECH-03 §5). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    status: participantStatus("status").notNull().default("NOT_STARTED"),
    /** How they arrived: the share link now, a CSV import row later (T12-03). */
    origin: text("origin").notNull().default("LINK"),
    /** Left out of the order during review (T12-03); kept in the list and history. */
    excludedAt: timestamp("excluded_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedByUserId: uuid("removed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("participants_collection_idx").on(table.collectionId, table.status)],
);

/** A participant's answers: only the fields the organizer allowed (B2B-FR-052, 062–063). */
export const participantSubmissions = pgTable("participant_submissions", {
  participantId: uuid("participant_id")
    .primaryKey()
    .references(() => participants.id, { onDelete: "cascade" }),
  answers: jsonb("answers").notNull().default({}),
  /** What the organizer asked them to fix (NEEDS_CORRECTION). */
  correction: text("correction"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const orderDraftStatus = pgEnum("order_draft_status", ORDER_DRAFT_STATUSES);

/**
 * An Order Draft (T12-03b; PRD-05 B2B-FR-054; TECH-01 §4–5): the saved copy of
 * a reviewed collection's totals and the participants in it. Reopening the
 * collection marks it STALE; submitting turns it into one design and an
 * order request or quote request.
 */
export const orderDrafts = pgTable(
  "order_drafts",
  {
    id: idColumn(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => groupCollections.id, { onDelete: "cascade" }),
    status: orderDraftStatus("status").notNull().default("CURRENT"),
    /** Totals and every included participant's answers as they were (TECH-01 §5). */
    snapshot: jsonb("snapshot").notNull(),
    configurationId: uuid("configuration_id").references(() => configurations.id, { onDelete: "set null" }),
    orderRequestId: uuid("order_request_id"),
    quoteId: uuid("quote_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("order_drafts_collection_idx").on(table.collectionId, table.status), index("order_drafts_configuration_idx").on(table.configurationId)],
);
