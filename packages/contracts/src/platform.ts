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

/* Operations home (T13-03; PRD-06 §17; Pen 95). */

export const OPS_QUEUES = ["NEW_REQUESTS", "QUOTES_TO_PREPARE", "PROOFS", "BLOCKED_ORDERS", "PRODUCTION", "QUALITY_CHECK", "READY_TO_DISPATCH", "PAYMENTS", "HELP", "PROBLEMS"] as const;

/** Only the queues this person may see; hidden queues and their counts are never sent. */
export const opsHomeSchema = z.object({
  queues: z.array(z.object({ key: z.enum(OPS_QUEUES), label: z.string(), count: z.number().int(), detail: z.string(), href: z.string() })),
});
export type OpsHome = z.infer<typeof opsHomeSchema>;

/* Exports (T13-03b; PRD-06 §19; TECH-07 §16; Pen 120). */

export const EXPORT_TYPES = ["ORDERS", "PAYMENTS", "CUSTOMERS", "PRODUCTION", "CATALOGUE", "COLLECTION_TOTALS"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];
export const EXPORT_LABELS: Record<ExportType, string> = {
  ORDERS: "Orders",
  PAYMENTS: "Payments",
  CUSTOMERS: "Customers",
  PRODUCTION: "Production",
  CATALOGUE: "Catalogue",
  COLLECTION_TOTALS: "Collection totals",
};
/** Types holding personal data: EXPORT_PERSONAL_DATA and a recent MFA check (TECH-03 §9). */
export const PERSONAL_EXPORTS: readonly ExportType[] = ["CUSTOMERS"];
/** The staff permissions that may export each type (any one). */
export const EXPORT_PERMISSIONS: Record<ExportType, readonly z.infer<typeof staffPermissionSchema>[]> = {
  ORDERS: ["PAYMENT_VIEW", "PAYMENT_MANAGE"],
  PAYMENTS: ["PAYMENT_VIEW", "PAYMENT_MANAGE"],
  CUSTOMERS: ["EXPORT_PERSONAL_DATA"],
  PRODUCTION: ["PRODUCTION_MANAGE"],
  CATALOGUE: ["CATALOGUE_MANAGE", "PRICING_MANAGE"],
  COLLECTION_TOTALS: ["PRODUCTION_MANAGE", "QUOTE_MANAGE"],
};

const day = z.iso.date();
/** The catalogue has no date range; every other type needs one, at most a year long. */
export const exportRequestSchema = z
  .object({ type: z.enum(EXPORT_TYPES), from: day.nullable(), to: day.nullable() })
  .strict()
  .superRefine((value, context) => {
    if (value.type === "CATALOGUE") return;
    if (!value.from || !value.to) return context.addIssue({ code: "custom", path: ["from"], message: "Choose the start and end dates" });
    if (value.from > value.to) return context.addIssue({ code: "custom", path: ["to"], message: "The end date is before the start date" });
    if (Date.parse(value.to) - Date.parse(value.from) > 366 * 86_400_000) context.addIssue({ code: "custom", path: ["to"], message: "Choose a range of a year or less" });
  });
export type ExportRequest = z.infer<typeof exportRequestSchema>;

export const exportItemSchema = z.object({
  id: z.string(),
  type: z.enum(EXPORT_TYPES),
  from: day.nullable(),
  to: day.nullable(),
  status: z.enum(["GENERATING", "READY", "EXPIRED", "FAILED"]),
  rows: z.number().int().nullable(),
  failure: z.string().nullable(),
  requestedBy: z.string(),
  requestedAt: isoDate,
  expiresAt: isoDate.nullable(),
});
export type ExportItem = z.infer<typeof exportItemSchema>;
/** Only exports of the types this person may request; `allowed` lists those types. */
export const exportListSchema = z.object({ items: z.array(exportItemSchema), allowed: z.array(z.enum(EXPORT_TYPES)) });
export type ExportList = z.infer<typeof exportListSchema>;
export const exportDownloadSchema = z.object({ url: z.string(), expiresInSeconds: z.number().int() });
