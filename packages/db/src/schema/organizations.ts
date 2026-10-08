import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { INVITATION_STATUSES, MEMBERSHIP_STATUSES, ORGANIZATION_PERMISSIONS, ORGANIZATION_REQUEST_STATUSES, ORGANIZATION_ROLES, TEAM_SIZES } from "@holypearls/contracts";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
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
