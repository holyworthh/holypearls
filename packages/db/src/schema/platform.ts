import { index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt } from "../columns.js";

export const demoSliceStatus = pgEnum("demo_slice_status", ["PENDING", "DONE", "FAILED"]);

/**
 * T00-04 end-to-end slice (TECH-00 §14): one request goes web → API →
 * database → background job → visible result. Demo data only; the routes that
 * use it are off in production.
 */
export const demoSliceRequests = pgTable("demo_slice_requests", {
  id: idColumn(),
  message: text("message").notNull(),
  status: demoSliceStatus("status").notNull().default("PENDING"),
  result: text("result"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const auditActorType = pgEnum("audit_actor_type", ["STAFF", "USER", "GUEST", "SYSTEM"]);

/**
 * Insert-only audit log (TECH-03 §15, OPS-FR-120). A database trigger refuses
 * UPDATE, DELETE and TRUNCATE for every user, so nobody can change history
 * through the application. Never store passwords, codes or secrets here.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: idColumn(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorType: auditActorType("actor_type").notNull(),
    actorUserId: uuid("actor_user_id"),
    /** Name at the time, so the entry reads correctly after renames. */
    actorLabel: text("actor_label").notNull(),
    /** Stable machine name, for example `staff.permission_granted`. */
    action: text("action").notNull(),
    /** Human sentence shown in the viewer, for example "Permission granted: REFUND_ISSUE". */
    summary: text("summary").notNull(),
    recordType: text("record_type").notNull(),
    recordId: text("record_id"),
    recordLabel: text("record_label"),
    before: jsonb("before"),
    after: jsonb("after"),
    /** The permission the action needed, when there is one. */
    permission: text("permission"),
    mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
    requestId: text("request_id"),
  },
  (table) => [
    index("audit_log_occurred_at_idx").on(table.occurredAt.desc(), table.id.desc()),
    index("audit_log_record_idx").on(table.recordType, table.recordId),
    index("audit_log_action_idx").on(table.action),
  ],
);

/** Fixed-window counters shared by every API instance (TECH-02 §14, ADR-013). Keys are hashed. */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] }), index("rate_limit_buckets_expires_idx").on(table.expiresAt)],
);

/** Safe retries (TECH-02 §4): one row per actor and key, kept 24 hours. */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    actorKey: text("actor_key").notNull(),
    key: text("key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    /** Null while the first request is still running. */
    statusCode: integer("status_code"),
    responseBody: jsonb("response_body"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.actorKey, table.key] }), index("idempotency_keys_expires_idx").on(table.expiresAt)],
);
