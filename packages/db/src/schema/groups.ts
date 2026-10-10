import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { COLLECTION_STATUSES, DELIVERY_MODES, UNSURE_SIZE_RULES } from "@holypearls/contracts";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { configurations } from "./configuration.js";
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
