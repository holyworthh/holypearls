import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt } from "../columns.js";
import { staffProfiles, users } from "./identity.js";

const at = (name: string) => timestamp(name, { withTimezone: true });

/**
 * One row per person who buys, with or without an account (TECH-03 §2).
 * Guests have no user. A verified account links every customer row with the
 * same verified email (TECH-03 §6).
 */
export const customers = pgTable(
  "customers",
  {
    id: idColumn(),
    /** Lower-cased and trimmed; used to find and link the same person. */
    emailNormalized: text("email_normalized").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    emailVerifiedAt: at("email_verified_at"),
    /** When they agreed to product news; null means no (the default). TECH-06 §12. */
    marketingConsentAt: at("marketing_consent_at"),
    /** When their personal data was erased on request (T15-03). */
    erasedAt: at("erased_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("customers_email_normalized_unique").on(table.emailNormalized),
    index("customers_user_id_idx").on(table.userId),
  ],
);

export const guestLinkPurpose = pgEnum("guest_link_purpose", [
  "QUOTE",
  "ORDER",
  "PROOF",
  "CONFIGURATION",
  "PROJECT",
  "COLLECTION_SUBMISSION",
  "HELP_REQUEST",
]);

/** One secure link to one record (TECH-03 §5). Only the SHA-256 of the secret is stored. */
export const guestLinks = pgTable(
  "guest_links",
  {
    id: idColumn(),
    secretHash: text("secret_hash").notNull(),
    purpose: guestLinkPurpose("purpose").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    expiresAt: at("expires_at").notNull(),
    revokedAt: at("revoked_at"),
    revokedByStaffId: uuid("revoked_by_staff_id").references(() => staffProfiles.id),
    lastUsedAt: at("last_used_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("guest_links_secret_hash_unique").on(table.secretHash),
    index("guest_links_target_idx").on(table.targetType, table.targetId),
    index("guest_links_customer_idx").on(table.customerId),
  ],
);

/**
 * A short guest session made by redeeming a link: limited to the link's record
 * and its children (TECH-03 §5). The cookie holds a random token; only its
 * hash is stored.
 */
export const guestSessions = pgTable(
  "guest_sessions",
  {
    id: idColumn(),
    tokenHash: text("token_hash").notNull(),
    guestLinkId: uuid("guest_link_id")
      .notNull()
      .references(() => guestLinks.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    /** Last successful email code in this session; important actions need one within 24 hours. */
    emailVerifiedAt: at("email_verified_at"),
    expiresAt: at("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("guest_sessions_token_hash_unique").on(table.tokenHash)],
);

export const emailCodePurpose = pgEnum("email_code_purpose", [
  "VERIFY_ACTION",
  "ACCEPT_QUOTE",
  "APPROVE_PROOF",
  "CHANGE_ADDRESS",
  "PARTICIPANT_PAYMENT",
  "FIND_ORDER",
]);

/** 6-digit codes: 10 minutes, 5 tries (TECH-03 §5). Only a hash is stored. */
export const emailCodes = pgTable(
  "email_codes",
  {
    id: idColumn(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    purpose: emailCodePurpose("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: at("expires_at").notNull(),
    consumedAt: at("consumed_at"),
    createdAt: createdAt(),
  },
  (table) => [index("email_codes_customer_idx").on(table.customerId, table.purpose)],
);

export const notificationStatus = pgEnum("notification_status", ["QUEUED", "SENT", "DELIVERED", "FAILED"]);

/**
 * Every message HolyPearls sends (TECH-02 §10). `sealedData` holds the
 * template data encrypted, because some emails carry a link secret or code;
 * it is wiped once the email is sent.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: idColumn(),
    template: text("template").notNull(),
    channel: text("channel").notNull().default("EMAIL"),
    recipient: text("recipient").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    recordType: text("record_type"),
    recordId: text("record_id"),
    recordLabel: text("record_label"),
    /** Plain description of where the email's button goes, for the admin log. */
    linkLabel: text("link_label"),
    status: notificationStatus("status").notNull().default("QUEUED"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull(),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    sealedData: text("sealed_data"),
    /** Emails that carry a secret can't be resent; the person asks for a fresh one. */
    resendable: boolean("resendable").notNull().default(true),
    resendOfId: uuid("resend_of_id"),
    lastAttemptAt: at("last_attempt_at"),
    sentAt: at("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("notifications_created_idx").on(table.createdAt.desc(), table.id.desc()),
    index("notifications_status_idx").on(table.status),
    index("notifications_record_idx").on(table.recordType, table.recordId),
  ],
);

export const helpRequestStatus = pgEnum("help_request_status", ["OPEN", "ANSWERED", "CLOSED"]);

/** "Need help" with the customer's context attached (PRD-00 §18). */
export const helpRequests = pgTable(
  "help_requests",
  {
    id: idColumn(),
    reference: text("reference").notNull(),
    status: helpRequestStatus("status").notNull().default("OPEN"),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** The guest session that sent it, so that guest can see it and no one else. */
    guestSessionId: uuid("guest_session_id").references(() => guestSessions.id, { onDelete: "set null" }),
    name: text("name"),
    /** Contact page enquiry type (Pen 60): NEW_ORDER, EXISTING_ORDER, COMPANY_ACCOUNT, SOMETHING_ELSE. */
    topic: text("topic"),
    company: text("company"),
    phone: text("phone"),
    message: text("message").notNull(),
    /** IDs and short labels only: page, step, product, configuration, project, quote, proof, order, files. */
    context: jsonb("context").notNull(),
    answeredAt: at("answered_at"),
    closedAt: at("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("help_requests_reference_unique").on(table.reference),
    check("help_requests_topic_known", sql`${table.topic} IS NULL OR ${table.topic} IN ('NEW_ORDER','EXISTING_ORDER','COMPANY_ACCOUNT','SOMETHING_ELSE')`),
    index("help_requests_status_idx").on(table.status, table.createdAt.desc()),
    index("help_requests_customer_idx").on(table.customerId),
  ],
);

/** Staff replies are kept as history and never edited. */
export const helpReplies = pgTable("help_replies", {
  id: idColumn(),
  helpRequestId: uuid("help_request_id")
    .notNull()
    .references(() => helpRequests.id, { onDelete: "cascade" }),
  staffProfileId: uuid("staff_profile_id")
    .notNull()
    .references(() => staffProfiles.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
});
