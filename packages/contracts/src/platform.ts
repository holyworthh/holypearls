import { z } from "zod";
import { staffPermissionSchema } from "./identity.js";

const isoDate = z.iso.datetime();

export const auditEntrySchema = z.object({
  id: z.string(),
  occurredAt: isoDate,
  actorType: z.enum(["STAFF", "USER", "GUEST", "SYSTEM"]),
  actorLabel: z.string(),
  action: z.string(),
  summary: z.string(),
  recordType: z.string(),
  recordId: z.string().nullable(),
  recordLabel: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  permission: z.string().nullable(),
  mfaVerifiedAt: isoDate.nullable(),
  requestId: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  nextCursor: z.string().nullable(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;

/** Cursor paging for working lists: at most 100 per page (TECH-02 §3). */
export const auditQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  action: z.string().max(80).optional(),
  sinceDays: z.coerce.number().int().refine((value) => [1, 7, 30, 90, 365].includes(value)).optional(),
  recordType: z.string().max(40).optional(),
  recordId: z.string().max(80).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const grantPermissionSchema = z.object({ permission: staffPermissionSchema });

export const staffAccessSchema = z.object({
  staffProfileId: z.string(),
  displayName: z.string(),
  permissions: z.array(staffPermissionSchema),
  mfaEnabled: z.boolean(),
});
export type StaffAccess = z.infer<typeof staffAccessSchema>;

/** Header for safe retries (TECH-02 §4). */
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";

export const notificationStatusSchema = z.enum(["QUEUED", "SENT", "DELIVERED", "FAILED"]);

export const notificationEntrySchema = z.object({
  id: z.string(),
  template: z.string(),
  templateLabel: z.string(),
  recipient: z.string(),
  recordType: z.string().nullable(),
  recordId: z.string().nullable(),
  recordLabel: z.string().nullable(),
  linkLabel: z.string().nullable(),
  status: notificationStatusSchema,
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  providerMessageId: z.string().nullable(),
  lastError: z.string().nullable(),
  resendable: z.boolean(),
  resendOfId: z.string().nullable(),
  lastAttemptAt: isoDate.nullable(),
  createdAt: isoDate,
});
export type NotificationEntry = z.infer<typeof notificationEntrySchema>;

export const notificationPageSchema = z.object({ entries: z.array(notificationEntrySchema), nextCursor: z.string().nullable() });
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const notificationQuerySchema = z.object({
  status: notificationStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
