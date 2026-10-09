import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { APPROVAL_DECISIONS, APPROVAL_RULES, ASSET_VERSION_STATUSES, BRAND_ASSET_KINDS, ORDER_REQUEST_STATUSES, FIELD_CONTROLS, INVITATION_STATUSES, TEMPLATE_STATUSES, MEMBERSHIP_STATUSES, ORGANIZATION_PERMISSIONS, ORGANIZATION_REQUEST_STATUSES, ORGANIZATION_ROLES, TEAM_SIZES } from "@holypearls/contracts";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { products } from "./catalogue.js";
import { configurations } from "./configuration.js";
import { files } from "./files.js";
import { staffProfiles, users } from "./identity.js";

const at = (name: string) => timestamp(name, { withTimezone: true });

export const organizationRole = pgEnum("organization_role", ORGANIZATION_ROLES);
export const organizationPermission = pgEnum("organization_permission", ORGANIZATION_PERMISSIONS);
export const membershipStatus = pgEnum("membership_status", MEMBERSHIP_STATUSES);
export const invitationStatus = pgEnum("invitation_status", INVITATION_STATUSES);

/** A business with one or more locations (PRD-05 B2B-FR-001). */
export const organizations = pgTable("organizations", {
  id: idColumn(),
  name: text("name").notNull(),
  archivedAt: at("archived_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** B2B-FR-002. (id, organization_id) is unique so other tables can point at a location of one organization only. */
export const locations = pgTable(
  "locations",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    city: text("city").notNull(),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("locations_organization_name_unique").on(table.organizationId, sql`lower(${table.name})`),
    unique("locations_id_organization_unique").on(table.id, table.organizationId),
  ],
);

/**
 * A person's place in an organization (TECH-03 §7): ACTIVE ⇄ DEACTIVATED
 * (TECH-01 §4). Owners always hold All locations. Deactivated rows stay, so
 * past actions keep their author (B2B-FR-093).
 */
export const memberships = pgTable(
  "memberships",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: organizationRole("role").notNull(),
    status: membershipStatus("status").notNull().default("ACTIVE"),
    allLocations: boolean("all_locations").notNull().default(false),
    deactivatedAt: at("deactivated_at"),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("memberships_organization_user_unique").on(table.organizationId, table.userId),
    unique("memberships_id_organization_unique").on(table.id, table.organizationId),
    index("memberships_user_status_idx").on(table.userId, table.status),
    check("memberships_owner_all_locations", sql`${table.role} <> 'OWNER' OR ${table.allLocations}`),
  ],
);

/** Locations a member is limited to. The composite keys refuse a location or membership of another organization. */
export const membershipLocations = pgTable(
  "membership_locations",
  {
    membershipId: uuid("membership_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    locationId: uuid("location_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.membershipId, table.locationId] }),
    foreignKey({ columns: [table.membershipId, table.organizationId], foreignColumns: [memberships.id, memberships.organizationId], name: "membership_locations_membership_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.locationId, table.organizationId], foreignColumns: [locations.id, locations.organizationId], name: "membership_locations_location_fk" }).onDelete("cascade"),
    index("membership_locations_location_idx").on(table.locationId),
  ],
);

/** The member's permissions: the role preset, or the Owner's adjustment of it (TECH-03 §7). */
export const membershipPermissions = pgTable(
  "membership_permissions",
  {
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    permission: organizationPermission("permission").notNull(),
  },
  (table) => [primaryKey({ columns: [table.membershipId, table.permission] })],
);

/**
 * Organization invitations (TECH-03 §11). The identity module owns them
 * (TECH-01 §2); they live here beside the tables their keys point at. Only
 * the SHA-256 of the 32-byte secret is stored. PENDING → ACCEPTED | EXPIRED |
 * REVOKED (TECH-01 §4).
 */
export const invitations = pgTable(
  "invitations",
  {
    id: idColumn(),
    secretHash: text("secret_hash").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    status: invitationStatus("status").notNull().default("PENDING"),
    expiresAt: at("expires_at").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: organizationRole("role").notNull(),
    allLocations: boolean("all_locations").notNull().default(false),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: at("accepted_at"),
    revokedAt: at("revoked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("invitations_secret_hash_unique").on(table.secretHash),
    uniqueIndex("invitations_pending_email_unique").on(table.organizationId, table.emailNormalized).where(sql`${table.status} = 'PENDING'`),
    unique("invitations_id_organization_unique").on(table.id, table.organizationId),
    index("invitations_status_expires_idx").on(table.status, table.expiresAt),
    check("invitations_not_owner", sql`${table.role} <> 'OWNER'`),
  ],
);

export const invitationLocations = pgTable(
  "invitation_locations",
  {
    invitationId: uuid("invitation_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    locationId: uuid("location_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.invitationId, table.locationId] }),
    foreignKey({ columns: [table.invitationId, table.organizationId], foreignColumns: [invitations.id, invitations.organizationId], name: "invitation_locations_invitation_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.locationId, table.organizationId], foreignColumns: [locations.id, locations.organizationId], name: "invitation_locations_location_fk" }).onDelete("cascade"),
  ],
);

export const organizationRequestStatus = pgEnum("organization_request_status", ORGANIZATION_REQUEST_STATUSES);
export const teamSize = pgEnum("team_size", TEAM_SIZES);

/**
 * A customer's request for a workspace (owner decision 2026-10-08). PENDING →
 * APPROVED (creates the organization) | DECLINED (with a reason). One PENDING
 * request per person. The requested locations are a saved copy of the form.
 */
export const organizationRequests = pgTable(
  "organization_requests",
  {
    id: idColumn(),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: organizationRequestStatus("status").notNull().default("PENDING"),
    companyName: text("company_name").notNull(),
    requestedLocations: jsonb("requested_locations").$type<{ name: string; city: string }[]>().notNull(),
    teamSize: teamSize("team_size").notNull(),
    note: text("note"),
    decidedAt: at("decided_at"),
    decidedByStaffId: uuid("decided_by_staff_id").references(() => staffProfiles.id, { onDelete: "restrict" }),
    declineReason: text("decline_reason"),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("organization_requests_one_pending").on(table.requesterUserId).where(sql`${table.status} = 'PENDING'`),
    index("organization_requests_status_created_idx").on(table.status, table.createdAt),
    check("organization_requests_decline_reason", sql`${table.status} <> 'DECLINED' OR ${table.declineReason} IS NOT NULL`),
  ],
);

export const brandAssetKind = pgEnum("brand_asset_kind", BRAND_ASSET_KINDS);
export const assetVersionStatus = pgEnum("asset_version_status", ASSET_VERSION_STATUSES);

/** A logo or artwork as a concept (PRD-05 B2B-FR-020; TECH-04 §9). Organization-wide: brand assets have no location. */
export const brandAssets = pgTable(
  "brand_assets",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: brandAssetKind("kind").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("brand_assets_organization_idx").on(table.organizationId, table.kind)],
);

/**
 * One version of an asset, pointing to exactly one file (TECH-04 §9).
 * Replacing adds V(n+1); earlier versions are never overwritten or deleted
 * (B2B-FR-023). PROCESSING → NEEDS_REVIEW → PRODUCTION_READY → SUPERSEDED |
 * RETIRED; any → ARCHIVED (TECH-01 §4).
 */
export const brandAssetVersions = pgTable(
  "brand_asset_versions",
  {
    id: idColumn(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => brandAssets.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "restrict" }),
    status: assetVersionStatus("status").notNull().default("PROCESSING"),
    /** HolyPearls' production note, shown to the organization (frame 116). */
    reviewNote: text("review_note"),
    reviewedByStaffId: uuid("reviewed_by_staff_id").references(() => staffProfiles.id, { onDelete: "restrict" }),
    reviewedAt: at("reviewed_at"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("brand_asset_versions_number_unique").on(table.assetId, table.number),
    uniqueIndex("brand_asset_versions_file_unique").on(table.fileId),
    index("brand_asset_versions_status_idx").on(table.status, table.createdAt),
  ],
);

export const templateStatus = pgEnum("template_status", TEMPLATE_STATUSES);
export const fieldControl = pgEnum("field_control", FIELD_CONTROLS);

/**
 * A Workspace Product Template (PRD-05 B2B-FR-030–032): a catalogue product
 * with an approved configuration and specific asset versions, each field
 * locked or buyer-editable with a reason. `specification` is the saved copy
 * of the configuration it started from (TECH-01 §5).
 */
export const templates = pgTable(
  "templates",
  {
    id: idColumn(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: templateStatus("status").notNull().default("DRAFT"),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    sourceConfigurationId: uuid("source_configuration_id")
      .notNull()
      .references(() => configurations.id, { onDelete: "restrict" }),
    specification: jsonb("specification").notNull(),
    allLocations: boolean("all_locations").notNull().default(true),
    reviewNote: text("review_note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    approvedByStaffId: uuid("approved_by_staff_id").references(() => staffProfiles.id, { onDelete: "restrict" }),
    approvedAt: at("approved_at"),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("templates_id_organization_unique").on(table.id, table.organizationId),
    index("templates_organization_idx").on(table.organizationId, table.status),
    index("templates_status_idx").on(table.status, table.updatedAt),
  ],
);

export const templateLocations = pgTable(
  "template_locations",
  {
    templateId: uuid("template_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    locationId: uuid("location_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.templateId, table.locationId] }),
    foreignKey({ columns: [table.templateId, table.organizationId], foreignColumns: [templates.id, templates.organizationId], name: "template_locations_template_fk" }).onDelete("cascade"),
    foreignKey({ columns: [table.locationId, table.organizationId], foreignColumns: [locations.id, locations.organizationId], name: "template_locations_location_fk" }).onDelete("cascade"),
  ],
);

/** Each field's control and the reason buyers see (B2B-FR-031). */
export const templateFields = pgTable(
  "template_fields",
  {
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    control: fieldControl("control").notNull(),
    reason: text("reason").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.templateId, table.key] })],
);

/** The exact asset versions a template uses (B2B-FR-030); never moved by a newer version (TECH-04 §9). */
export const templateAssetLinks = pgTable(
  "template_asset_links",
  {
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    assetVersionId: uuid("asset_version_id")
      .notNull()
      .references(() => brandAssetVersions.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.templateId, table.assetVersionId] }), index("template_asset_links_version_idx").on(table.assetVersionId)],
);

/**
 * A Template Order (PRD-05 B2B-FR-033; TECH-01 §5 "a template order is
 * placed"): the new configuration a buyer made from an approved template,
 * where it's for, and the saved copy of the template as it was ordered.
 */
export const templateOrders = pgTable(
  "template_orders",
  {
    id: idColumn(),
    templateId: uuid("template_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    locationId: uuid("location_id").notNull(),
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => configurations.id, { onDelete: "restrict" }),
    orderedByUserId: uuid("ordered_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** CHECKOUT (bought directly), QUOTE (sent for a quote) or APPROVAL (an order request waiting for the organization's approval, T11-04). */
    route: text("route").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("template_orders_configuration_unique").on(table.configurationId),
    index("template_orders_template_idx").on(table.templateId, table.createdAt),
    foreignKey({ columns: [table.templateId, table.organizationId], foreignColumns: [templates.id, templates.organizationId], name: "template_orders_template_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.locationId, table.organizationId], foreignColumns: [locations.id, locations.organizationId], name: "template_orders_location_fk" }).onDelete("restrict"),
    check("template_orders_route", sql`${table.route} in ('CHECKOUT', 'QUOTE', 'APPROVAL')`),
  ],
);

export const approvalRule = pgEnum("approval_rule", APPROVAL_RULES);
export const orderRequestStatus = pgEnum("order_request_status", ORDER_REQUEST_STATUSES);
export const approvalDecision = pgEnum("approval_decision", APPROVAL_DECISIONS);

/** The organization's one approval rule (PRD-05 B2B-FR-040–041). No row means no approval. */
export const approvalPolicies = pgTable(
  "approval_policies",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    rule: approvalRule("rule").notNull().default("NONE"),
    thresholdMinor: bigint("threshold_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("NGN"),
    separateRequesterApprover: boolean("separate_requester_approver").notNull().default(true),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [check("approval_policies_threshold", sql`${table.rule} <> 'ABOVE_AMOUNT' or ${table.thresholdMinor} > 0`)],
);

/** Members whose requests need approval under the REQUESTERS rule. */
export const approvalPolicyRequesters = pgTable(
  "approval_policy_requesters",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => approvalPolicies.organizationId, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.membershipId] })],
);

/**
 * An order request (TECH-01 §4): what a member wants to order for a
 * location, waiting for the organization's approval before it goes to
 * HolyPearls. `configurationIds` are the designs; `snapshot` is the saved
 * copy of what was asked for.
 */
export const orderRequests = pgTable(
  "order_requests",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").notNull(),
    locationId: uuid("location_id").notNull(),
    title: text("title").notNull(),
    status: orderRequestStatus("status").notNull().default("DRAFT"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    requestedByMembershipId: uuid("requested_by_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    estimatedTotalMinor: bigint("estimated_total_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("NGN"),
    configurationIds: uuid("configuration_ids").array().notNull(),
    snapshot: jsonb("snapshot").notNull(),
    /** The quote request it became once sent to HolyPearls. */
    quoteId: uuid("quote_id"),
    submittedAt: at("submitted_at"),
    sentAt: at("sent_at"),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({ columns: [table.locationId, table.organizationId], foreignColumns: [locations.id, locations.organizationId], name: "order_requests_location_fk" }).onDelete("restrict"),
    index("order_requests_organization_idx").on(table.organizationId, table.status, table.createdAt),
    index("order_requests_quote_idx").on(table.quoteId),
  ],
);

/** An organization's decision on an order request (B2B-FR-042). Insert-only: re-approval is a new row and the old one is kept. */
export const organizationApprovals = pgTable(
  "organization_approvals",
  {
    id: idColumn(),
    orderRequestId: uuid("order_request_id")
      .notNull()
      .references(() => orderRequests.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    decision: approvalDecision("decision").notNull(),
    approvedAmountMinor: bigint("approved_amount_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("NGN"),
    /** What was approved: the items, quantities and location. */
    scope: jsonb("scope").notNull(),
    note: text("note"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("organization_approvals_request_idx").on(table.orderRequestId, table.createdAt),
    check("organization_approvals_amount", sql`${table.decision} <> 'APPROVED' or ${table.approvedAmountMinor} >= 0`),
  ],
);
