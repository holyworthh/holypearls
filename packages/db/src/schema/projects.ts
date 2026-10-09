import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { locations } from "./organizations.js";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { products } from "./catalogue.js";
import { customers } from "./customers.js";
import { files } from "./files.js";
import { staffProfiles, users } from "./identity.js";

/*
 * Start a Project (T05-01; PROJ-FR-001–007, TECH-01 §2 sales). A project
 * belongs to an account, to the browser that started it (hashed device key),
 * or to a guest who opened its emailed link, like configuration drafts. The
 * reference (HP-P-…) is given when it is submitted (PROJ-FR-011, T05-03).
 */

/** TECH-01 §4 project statuses. */
export const projectStatus = pgEnum("project_status", ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "ORDERED", "COMPLETED", "CANCELLED", "EXPIRED"]);

/** Stage 3.1D §3 project types (the owner chose the full list, 2 October 2026). */
export const projectType = pgEnum("project_type", [
  "EVENT",
  "STAFF_UNIFORMS",
  "BUSINESS_LAUNCH",
  "CORPORATE_GIFTS",
  "RETAIL_SPACE",
  "MERCHANDISE",
  "PACKAGING",
  "FASHION_PRODUCTION",
  "SCHOOL_UNIFORMS",
  "HOSPITALITY",
  "WEDDING",
  "CAMPAIGN",
  "SOMETHING_ELSE",
]);

export const projectStep = pgEnum("project_step", ["PROJECT", "SCALE", "DATE_LOCATION", "BRAND", "RECOMMENDATIONS", "REVIEW"]);

export const projects = pgTable(
  "projects",
  {
    id: idColumn(),
    /** HP-P-2026-0088, set on submit. Never used for access (TECH-01 §1). */
    reference: text("reference"),
    status: projectStatus("status").notNull().default("DRAFT"),
    type: projectType("type").notNull(),
    title: text("title"),
    /** The step the customer was on, so resuming lands there (PROJ-FR-007). */
    step: projectStep("step").notNull().default("PROJECT"),
    /** Every answer, keyed by the question keys in @holypearls/contracts PROJECT_QUESTIONS. */
    answers: jsonb("answers").notNull().default({}),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    /** SHA-256 of the browser's device key, for projects started without signing in. */
    ownerDeviceHash: text("owner_device_hash"),
    /** Set when a guest asks for the project link by email. */
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    /** The organization and location it was placed for (T10-03); both null for a personal purchase. */
    organizationId: uuid("organization_id"),
    locationId: uuid("location_id"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** The brief exactly as submitted (TECH-01 §5): staff quote from this, not from later edits. */
    submittedSnapshot: jsonb("submitted_snapshot"),
    /** Who the quote goes to: { name, email }. */
    contact: jsonb("contact"),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("projects_reference_unique").on(table.reference),
    index("projects_owner_user_idx").on(table.ownerUserId),
    index("projects_device_idx").on(table.ownerDeviceHash),
    index("projects_status_idx").on(table.status, table.lastActivityAt),
    foreignKey({ columns: [table.locationId, table.organizationId], foreignColumns: [locations.id, locations.organizationId], name: "projects_location_fk" }).onDelete("restrict"),
    check("projects_placement", sql`(${table.organizationId} is null) = (${table.locationId} is null)`),
    index("projects_organization_idx").on(table.organizationId, table.locationId),
  ],
);

export const recommendationGroup = pgEnum("recommendation_group", ["RECOMMENDED", "USEFUL", "OPTIONAL"]);

/**
 * What the builder suggests for a project type (PROJ-FR-003, Pen 110). Staff
 * edit them in admin. A rule's id is the stable key projects remember their
 * customer's choice by, so saving keeps ids.
 */
export const recommendationRules = pgTable(
  "recommendation_rules",
  {
    id: idColumn(),
    projectType: projectType("project_type").notNull(),
    group: recommendationGroup("group").notNull(),
    /** A catalogue product, or null for a described item staff will quote ("Main backdrop"). */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    itemName: text("item_name").notNull(),
    /** RuleCondition in @holypearls/contracts. */
    condition: jsonb("condition").notNull(),
    /** RuleQuantity in @holypearls/contracts. */
    quantity: jsonb("quantity").notNull(),
    reason: text("reason").notNull(),
    position: integer("position").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("recommendation_rules_type_idx").on(table.projectType, table.position)],
);

/** One row per project type, for the version check when staff save its rules. */
export const recommendationRuleSets = pgTable("recommendation_rule_sets", {
  projectType: projectType("project_type").primaryKey(),
  version: versionColumn(),
  updatedByStaffId: uuid("updated_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

export const recommendationState = pgEnum("recommendation_state", ["SUGGESTED", "INCLUDED", "REMOVED"]);

/**
 * A suggestion for one project and what the customer did with it (TECH-01 §2
 * project_recommendations). Once `customer_overridden`, a later change to the
 * brief never undoes the customer's choice or quantity (PROJ-FR-004).
 */
export const projectRecommendations = pgTable(
  "project_recommendations",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The rule's id; kept as text so the row outlives a deleted rule. */
    ruleKey: text("rule_key").notNull(),
    group: recommendationGroup("group").notNull(),
    name: text("name").notNull(),
    reason: text("reason").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    suggestedQuantity: integer("suggested_quantity"),
    customerQuantity: integer("customer_quantity"),
    state: recommendationState("state").notNull(),
    customerOverridden: boolean("customer_overridden").notNull().default(false),
    stillSuggested: boolean("still_suggested").notNull().default(true),
    position: integer("position").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("project_recommendations_rule_unique").on(table.projectId, table.ruleKey)],
);

export const projectItemKind = pgEnum("project_item_kind", ["CATALOGUE", "CUSTOM"]);

/** Items the customer added themselves: a catalogue product or a custom item (PROJ-FR-005), loosely described (PROJ-FR-006). */
export const projectItems = pgTable(
  "project_items",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: projectItemKind("kind").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    quantity: integer("quantity"),
    /** "About 30, sizes later". */
    quantityNote: text("quantity_note"),
    position: integer("position").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("project_items_project_idx").on(table.projectId, table.position),
    check("project_items_quantity_positive", sql`${table.quantity} is null or ${table.quantity} > 0`),
    check("project_items_catalogue_product", sql`${table.kind} = 'CUSTOM' or ${table.productId} is not null`),
  ],
);

/** Brand files and custom items' reference files. */
export const projectFiles = pgTable(
  "project_files",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => projectItems.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.fileId] })],
);
