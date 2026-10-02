import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { customers } from "./customers.js";
import { staffProfiles } from "./identity.js";
import { orderItems } from "./orders.js";

/*
 * Proofs (T06-01; FUL-FR-001–004, 006, TECH-01 §4, TECH-04 §10). One proof per
 * order item. Staff build a DRAFT version; publishing freezes it (a trigger in
 * migration 0031 refuses changes to anything but its status), and decisions
 * and comments stay on the version they were made on.
 */

export const proofStatus = pgEnum("proof_status", ["NOT_REQUIRED", "PREPARING", "AWAITING_APPROVAL", "APPROVED", "CHANGES_REQUESTED", "REVISION_IN_PROGRESS"]);

export const proofs = pgTable(
  "proofs",
  {
    id: idColumn(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    status: proofStatus("status").notNull(),
    /** REQUIRED, OPTIONAL or NOT_REQUIRED, from the product rule when the order was made (OPS-FR-018). */
    requirement: text("requirement").notNull(),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("proofs_order_item_unique").on(table.orderItemId), index("proofs_status_idx").on(table.status, table.updatedAt)],
);

export const proofVersionStatus = pgEnum("proof_version_status", ["DRAFT", "PUBLISHED", "APPROVED", "CHANGES_REQUESTED", "SUPERSEDED"]);

export const proofVersions = pgTable(
  "proof_versions",
  {
    id: idColumn(),
    proofId: uuid("proof_id")
      .notNull()
      .references(() => proofs.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    status: proofVersionStatus("status").notNull().default("DRAFT"),
    /** [{ label, fileId }]: the exact files shown (TECH-04 §10). */
    views: jsonb("views").notNull().default([]),
    /** Placement, dimensions, colour reference, quantity, notes (FUL-FR-002). */
    details: jsonb("details").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedByStaffId: uuid("published_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    createdByStaffId: uuid("created_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("proof_versions_number_unique").on(table.proofId, table.number),
    uniqueIndex("proof_versions_one_draft").on(table.proofId).where(sql`${table.status} = 'DRAFT'`),
  ],
);

export const proofCommentKind = pgEnum("proof_comment_kind", ["QUESTION", "CHANGE_REQUEST", "REPLY", "COMMENT"]);

/** Questions, change requests and staff replies, on the version they were made on (OPS-FR-052). Pins arrive with T06-03. */
export const proofComments = pgTable(
  "proof_comments",
  {
    id: idColumn(),
    proofVersionId: uuid("proof_version_id")
      .notNull()
      .references(() => proofVersions.id, { onDelete: "restrict" }),
    kind: proofCommentKind("kind").notNull(),
    body: text("body").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    staffProfileId: uuid("staff_profile_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [index("proof_comments_version_idx").on(table.proofVersionId, table.createdAt)],
);

export const proofDecision = pgEnum("proof_decision", ["APPROVED", "CHANGES_REQUESTED"]);

/** The customer's decision on a version: insert-only, one per version (FUL-FR-003–004). */
export const proofDecisions = pgTable(
  "proof_decisions",
  {
    id: idColumn(),
    proofVersionId: uuid("proof_version_id")
      .notNull()
      .references(() => proofVersions.id, { onDelete: "restrict" }),
    decision: proofDecision("decision").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    actorType: text("actor_type").notNull(),
    decidedBy: text("decided_by").notNull(),
    acknowledgement: text("acknowledgement"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("proof_decisions_version_unique").on(table.proofVersionId)],
);
