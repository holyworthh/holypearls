import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, check, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { customers } from "./customers.js";
import { staffProfiles } from "./identity.js";
import { orderItems, orders } from "./orders.js";

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
    /** A pin: position relative to the image (0–1 across and down, TECH-04 §11), on which view, and its number. */
    pinX: numeric("pin_x", { precision: 6, scale: 5 }),
    pinY: numeric("pin_y", { precision: 6, scale: 5 }),
    pinView: integer("pin_view"),
    pinNumber: integer("pin_number"),
    /** A reply belongs to the comment it answers. */
    parentId: uuid("parent_id").references((): AnyPgColumn => proofComments.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("proof_comments_version_idx").on(table.proofVersionId, table.createdAt),
    uniqueIndex("proof_comments_pin_number_unique").on(table.proofVersionId, table.pinNumber),
    check("proof_comments_pin_range", sql`${table.pinX} is null or (${table.pinX} between 0 and 1 and ${table.pinY} between 0 and 1)`),
  ],
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

export const changeStage = pgEnum("change_stage", ["BEFORE_PRODUCTION", "AFTER_PRODUCTION_START"]);
export const changeRequestStatus = pgEnum("change_request_status", ["OPEN", "UNDER_REVIEW", "ACCEPTED", "DECLINED"]);
export const changeOutcome = pgEnum("change_outcome", ["NEW_PROOF_VERSION", "QUOTE_REVISION", "NONE"]);

/**
 * Changes after proof approval (FUL-FR-007, OPS-FR-054, TECH-01 §4): before
 * production starts a change request staff review; after it starts, a
 * feasibility review that may change cost or timing. The approved version is
 * always kept; accepting may start a new proof version or a quote revision.
 */
export const changeRequests = pgTable(
  "change_requests",
  {
    id: idColumn(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    proofId: uuid("proof_id").references(() => proofs.id, { onDelete: "restrict" }),
    stage: changeStage("stage").notNull(),
    status: changeRequestStatus("status").notNull().default("OPEN"),
    description: text("description").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    /** Recorded by staff when deciding (done when: cost and timing impact recorded). */
    costImpactMinor: bigint("cost_impact_minor", { mode: "bigint" }),
    timingImpactDays: integer("timing_impact_days"),
    outcome: changeOutcome("outcome"),
    staffNote: text("staff_note"),
    decidedByStaffId: uuid("decided_by_staff_id").references(() => staffProfiles.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("change_requests_status_idx").on(table.status, table.createdAt), index("change_requests_order_idx").on(table.orderId)],
);
