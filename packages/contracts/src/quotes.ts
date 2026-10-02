import { z } from "zod";
import { projectQuoteSummarySchema, projectStatusSchema, projectTypeSchema, quoteStatusSchema } from "./projects.js";

/*
 * Project submission, the staff request queue and the quote builder (T05-03;
 * PROJ-FR-008, 010–012, OPS-FR-030–034, 040, QUOTE-FR-001, PAY-FR-001–002;
 * TECH-01 §4, TECH-05 §4). Every amount is minor units as a string and is
 * worked out by the server.
 */

const isoDate = z.iso.datetime();
const minor = z.string().regex(/^\d+$/);
const currency = z.enum(["NGN", "USD"]);

export const quoteVersionStatusSchema = z.enum(["DRAFT", "SENT", "SUPERSEDED", "ACCEPTED", "DECLINED", "EXPIRED"]);
export type QuoteVersionStatus = z.infer<typeof quoteVersionStatusSchema>;

/* ------------------------------------------------------------------ */
/* Submitting a project (PROJ-FR-010–011, Pen 124)                     */
/* ------------------------------------------------------------------ */

export const submitProjectSchema = z.object({
  version: z.number().int(),
  /** Guests give the email the quote goes to; signed-in customers can leave it out to use their account's. */
  email: z.email("Enter an email like name@example.com").optional(),
  name: z.string().trim().max(120).optional(),
});
export type SubmitProject = z.infer<typeof submitProjectSchema>;


/* ------------------------------------------------------------------ */
/* Payment schedule (PAY-FR-001–002, TECH-05 §4)                       */
/* ------------------------------------------------------------------ */

export const installmentTriggerSchema = z.enum(["ON_ACCEPTANCE", "BEFORE_PRODUCTION", "BEFORE_DISPATCH", "ON_DATE"]);
export type InstallmentTrigger = z.infer<typeof installmentTriggerSchema>;
export const TRIGGER_LABEL: Record<InstallmentTrigger, string> = {
  ON_ACCEPTANCE: "On acceptance",
  BEFORE_PRODUCTION: "Before production",
  BEFORE_DISPATCH: "Before dispatch",
  ON_DATE: "On a date",
};

/** One payment in a schedule: a percentage of the total (basis points) or a fixed amount. No percentage is fixed in code. */
export const scheduleEntrySchema = z
  .object({
    label: z.string().trim().min(1, "Name the payment").max(60),
    kind: z.enum(["PERCENT", "AMOUNT"]),
    /** Basis points for PERCENT (5000 = 50%), minor units for AMOUNT. */
    value: z.string().regex(/^\d+$/, "Enter a whole number"),
    trigger: installmentTriggerSchema,
    dueDate: z.iso.date().nullable().optional(),
  })
  .refine((entry) => entry.trigger !== "ON_DATE" || Boolean(entry.dueDate), { message: "Choose the date", path: ["dueDate"] });
export type ScheduleEntry = z.infer<typeof scheduleEntrySchema>;
export const scheduleSchema = z.array(scheduleEntrySchema).min(1, "Add at least one payment").max(8, "Use 8 payments or fewer");

/* ------------------------------------------------------------------ */
/* Quote settings (admin default, QUOTE-FR-006, TECH-05 §4)            */
/* ------------------------------------------------------------------ */

export const quoteSettingsSchema = z.object({
  validDays: z.number().int(),
  expiringNoticeDays: z.number().int(),
  defaultSchedule: scheduleSchema,
  defaultTerms: z.string(),
  version: z.number().int(),
  updatedAt: isoDate.nullable(),
  updatedBy: z.string().nullable(),
});
export type QuoteSettings = z.infer<typeof quoteSettingsSchema>;

export const quoteSettingsInputSchema = z.object({
  version: z.number().int(),
  validDays: z.number().int().min(1, "At least 1 day").max(180, "180 days at most"),
  expiringNoticeDays: z.number().int().min(0).max(30, "30 days at most"),
  defaultSchedule: scheduleSchema,
  defaultTerms: z.string().trim().max(4000),
});
export type QuoteSettingsInput = z.infer<typeof quoteSettingsInputSchema>;

/* ------------------------------------------------------------------ */
/* Quote versions and lines (QUOTE-FR-001–002, OPS-FR-031–032)         */
/* ------------------------------------------------------------------ */

export const quoteLineSourceSchema = z.enum(["PROJECT_RECOMMENDATION", "PROJECT_ITEM", "CONFIGURATION", "MANUAL"]);

export const quoteLineInputSchema = z.object({
  source: quoteLineSourceSchema,
  sourceKey: z.string().max(80).nullable(),
  title: z.string().trim().min(1, "Name the line").max(160),
  summary: z.string().trim().max(600),
  quantity: z.number().int().min(1, "At least 1").max(1_000_000),
  unitMinor: minor,
});
export type QuoteLineInput = z.infer<typeof quoteLineInputSchema>;

export const quoteLineSchema = quoteLineInputSchema.extend({ id: z.string(), totalMinor: minor });

export const quoteFeesSchema = z.object({
  designMinor: minor,
  deliveryMinor: minor,
  deliveryNote: z.string().max(160),
  installationMinor: minor,
  installationNote: z.string().max(160),
  otherMinor: minor,
  otherLabel: z.string().max(80),
});
export type QuoteFees = z.infer<typeof quoteFeesSchema>;

export const quoteTotalsSchema = z.object({
  goodsMinor: minor,
  feesMinor: minor,
  vatRateBps: z.number().int(),
  vatMinor: minor,
  totalMinor: minor,
});

export const scheduledPaymentSchema = z.object({
  label: z.string(),
  trigger: installmentTriggerSchema,
  dueDate: z.string().nullable(),
  percentBps: z.number().int().nullable(),
  amountMinor: minor,
});

export const quoteVersionSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  status: quoteVersionStatusSchema,
  currency,
  lines: z.array(quoteLineSchema),
  fees: quoteFeesSchema,
  totals: quoteTotalsSchema,
  validDays: z.number().int(),
  validUntil: isoDate.nullable(),
  terms: z.string(),
  assumptions: z.string(),
  productionSequence: z.string(),
  schedule: scheduleSchema,
  /** The schedule in money; null while it doesn't add up to the total. */
  payments: z.array(scheduledPaymentSchema).nullable(),
  scheduleProblem: z.string().nullable(),
  sentAt: isoDate.nullable(),
  sentBy: z.string().nullable(),
  version: z.number().int(),
});
export type QuoteVersion = z.infer<typeof quoteVersionSchema>;

export const saveQuoteVersionSchema = z.object({
  version: z.number().int(),
  currency,
  lines: z.array(quoteLineInputSchema).max(100, "Use 100 lines or fewer"),
  fees: quoteFeesSchema,
  validDays: z.number().int().min(1, "At least 1 day").max(180, "180 days at most"),
  terms: z.string().trim().max(4000),
  assumptions: z.string().trim().max(4000),
  productionSequence: z.string().trim().max(2000),
  schedule: scheduleSchema,
});
export type SaveQuoteVersion = z.infer<typeof saveQuoteVersionSchema>;

/** Something from the project or configuration that can become a line ("Add line from project item"). */
export const quoteLineCandidateSchema = z.object({
  source: quoteLineSourceSchema,
  sourceKey: z.string(),
  title: z.string(),
  summary: z.string(),
  quantity: z.number().int().nullable(),
  unitMinor: minor.nullable(),
});

/* ------------------------------------------------------------------ */
/* The staff queue (OPS-FR-030, Pen 124B)                              */
/* ------------------------------------------------------------------ */

export const requestKindSchema = z.enum(["PROJECT", "CONFIGURATION"]);

export const adminRequestSummarySchema = z.object({
  kind: requestKindSchema,
  /** The project's id, or the quote's for a configuration quote request. */
  id: z.string(),
  reference: z.string(),
  title: z.string(),
  customer: z.string(),
  guest: z.boolean(),
  submittedAt: isoDate,
  status: z.string(),
  quote: projectQuoteSummarySchema.nullable(),
  neededBy: z.string().nullable(),
});
export const adminRequestListSchema = z.object({ items: z.array(adminRequestSummarySchema), nextCursor: z.string().nullable() });
export type AdminRequestSummary = z.infer<typeof adminRequestSummarySchema>;

export const adminProjectSchema = z.object({
  id: z.string(),
  reference: z.string(),
  type: projectTypeSchema,
  title: z.string().nullable(),
  status: projectStatusSchema,
  submittedAt: isoDate,
  contact: z.object({ name: z.string().nullable(), email: z.string(), guest: z.boolean() }),
  /** Every answer as question and answer, in step order. */
  brief: z.array(z.object({ step: z.string(), question: z.string(), answer: z.string() })),
  items: z.array(z.object({ name: z.string(), detail: z.string(), quantity: z.number().int().nullable(), kind: z.string() })),
  files: z.array(z.object({ id: z.string(), name: z.string(), status: z.string(), item: z.string().nullable() })),
  openItems: z.array(z.string()),
  quote: projectQuoteSummarySchema.nullable(),
  version: z.number().int(),
});
export type AdminProject = z.infer<typeof adminProjectSchema>;

export const adminQuoteSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: quoteStatusSchema,
  source: z.object({ kind: requestKindSchema, id: z.string(), reference: z.string().nullable(), title: z.string() }),
  contact: z.object({ name: z.string().nullable(), email: z.string() }),
  versions: z.array(quoteVersionSchema),
  candidates: z.array(quoteLineCandidateSchema),
  usdEnabled: z.boolean(),
  vatRateBps: z.number().int(),
  createdAt: isoDate,
  /** The customer's change requests, questions, decline and renewal requests (OPS-FR-034). */
  requests: z.array(z.object({ kind: z.string(), version: z.number().int().nullable(), line: z.string().nullable(), changeType: z.string().nullable(), note: z.string(), createdAt: isoDate })),
});
export type AdminQuote = z.infer<typeof adminQuoteSchema>;

export const adminQuoteListSchema = z.object({
  items: z.array(z.object({ id: z.string(), reference: z.string(), status: quoteStatusSchema, title: z.string(), customer: z.string(), latestVersion: z.number().int().nullable(), totalMinor: minor.nullable(), currency: currency.nullable(), updatedAt: isoDate })),
  nextCursor: z.string().nullable(),
});

/* ------------------------------------------------------------------ */
/* The customer's quote page (T05-05; QUOTE-FR-002–008, Pen 25/46/47)  */
/* ------------------------------------------------------------------ */

export const quoteBlockerSchema = z.enum(["NOT_READY", "NOT_CURRENT_VERSION", "EXPIRED", "EMAIL_CODE_REQUIRED", "ALREADY_ACCEPTED"]);

export const customerQuoteSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: quoteStatusSchema,
  title: z.string(),
  projectReference: z.string().nullable(),
  /** The version shown: the current sent one, or the last one the customer saw. Null while the first is being prepared. */
  version: quoteVersionSchema.omit({ version: true, sentBy: true, scheduleProblem: true }).nullable(),
  versions: z.array(z.object({ number: z.number().int(), status: quoteVersionStatusSchema, sentAt: isoDate.nullable() })),
  /** Plain words: "Roll-up banners 4 → 2", "Backdrop installation added" (QUOTE-FR-005). */
  changes: z.array(z.string()),
  canAccept: z.boolean(),
  blockers: z.array(z.object({ code: quoteBlockerSchema, message: z.string() })),
  order: z.object({ id: z.string(), number: z.string() }).nullable(),
  requests: z.array(z.object({ kind: z.enum(["CHANGE", "QUESTION", "DECLINE", "UPDATE"]), note: z.string(), line: z.string().nullable(), createdAt: isoDate, status: z.enum(["OPEN", "ANSWERED"]) })),
});
export type CustomerQuote = z.infer<typeof customerQuoteSchema>;

export const acceptQuoteSchema = z.object({
  versionNumber: z.number().int(),
  acknowledged: z.literal(true, { error: "Tick the box to confirm you've reviewed the quote." }),
});

export const CHANGE_TYPES = ["Quantity", "Item or product", "Price", "Delivery or installation", "Timing", "Something else"] as const;

export const customerQuoteRequestSchema = z.object({
  kind: z.enum(["CHANGE", "QUESTION"]),
  lineId: z.string().uuid().nullable().optional(),
  changeType: z.enum(CHANGE_TYPES).nullable().optional(),
  note: z.string().trim().min(1, "Tell us what you'd like changed or what you'd like to know").max(4000),
  fileIds: z.array(z.string().uuid()).max(10).optional(),
});

export const declineQuoteSchema = z.object({ reason: z.string().trim().max(2000).optional() });

/* ------------------------------------------------------------------ */
/* Paying an accepted quote (PAY-FR-001–004, TECH-05 §4)               */
/* ------------------------------------------------------------------ */

export const installmentViewSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  label: z.string(),
  amountMinor: minor,
  trigger: installmentTriggerSchema,
  dueOn: z.string().nullable(),
  status: z.enum(["NOT_DUE", "DUE", "PROCESSING", "PAID", "CANCELLED"]),
  paidAt: isoDate.nullable(),
  /** Only the next unpaid payment can be paid; paying early is allowed. */
  payable: z.boolean(),
});

/** Total, paid, remaining, next payment and history (PAY-FR-003). */
export const paymentSummarySchema = z.object({
  currency,
  totalMinor: minor,
  paidMinor: minor,
  remainingMinor: minor,
  next: installmentViewSchema.nullable(),
  installments: z.array(installmentViewSchema),
});
export type PaymentSummary = z.infer<typeof paymentSummarySchema>;
