import { boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { STAFF_PERMISSIONS } from "@holypearls/contracts";
import { createdAt, idColumn, updatedAt } from "../columns.js";

/*
 * Identity tables (TECH-01 §2). users, sessions, accounts, verifications and
 * two_factors belong to Better Auth and are only touched through the
 * IdentityAdapter in packages/auth (TECH-03 §3). Their property names follow
 * Better Auth's field names; the SQL columns are snake_case.
 */

const at = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: idColumn(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: at("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** Last successful authenticator check in this session (TECH-03 §9, §10). */
    mfaVerifiedAt: at("mfa_verified_at"),
    /** Last email code confirmed in this session; important actions need one within 24 hours (TECH-03 §5). */
    emailCodeVerifiedAt: at("email_code_verified_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: at("access_token_expires_at"),
    refreshTokenExpiresAt: at("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: idColumn(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: at("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const twoFactors = pgTable(
  "two_factors",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").notNull().default(false),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: at("locked_until"),
  },
  (table) => [index("two_factors_user_id_idx").on(table.userId)],
);


export const staffPermission = pgEnum("staff_permission", STAFF_PERMISSIONS);
export const staffStatus = pgEnum("staff_status", ["ACTIVE", "DEACTIVATED"]);

export const staffProfiles = pgTable("staff_profiles", {
  id: idColumn(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(),
  status: staffStatus("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const staffPermissionGrants = pgTable(
  "staff_permission_grants",
  {
    id: idColumn(),
    staffProfileId: uuid("staff_profile_id")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    permission: staffPermission("permission").notNull(),
    /** Null only for grants made by the seed or the first-admin bootstrap. */
    grantedByStaffId: uuid("granted_by_staff_id").references(() => staffProfiles.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [unique("staff_permission_grants_unique").on(table.staffProfileId, table.permission)],
);
