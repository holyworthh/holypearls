import { z } from "zod";
import { relativePathSchema } from "./identity.js";

const isoDate = z.iso.datetime();
const label = z.string().trim().max(160);
const id = z.string().max(80);
const ref = z.object({ id, label }).strict();

/** Guest links open one record (TECH-03 §5). */
export const guestLinkPurposeSchema = z.enum([
  "QUOTE",
  "ORDER",
  "PROOF",
  "CONFIGURATION",
  "PROJECT",
  "COLLECTION_SUBMISSION",
  "HELP_REQUEST",
]);
export type GuestLinkPurpose = z.infer<typeof guestLinkPurposeSchema>;

export const redeemGuestLinkSchema = z.object({ secret: z.string().regex(/^[A-Za-z0-9_-]{40,64}$/, "This link isn't complete") });
export const redeemResultSchema = z.object({
  purpose: guestLinkPurposeSchema,
  targetId: z.string(),
  /** A clean URL without the secret. */
  redirectTo: relativePathSchema,
});

export const emailCodePurposeSchema = z.enum([
  "VERIFY_ACTION",
  "ACCEPT_QUOTE",
  "APPROVE_PROOF",
  "CHANGE_ADDRESS",
  "PARTICIPANT_PAYMENT",
  "FIND_ORDER",
]);
export type EmailCodePurpose = z.infer<typeof emailCodePurposeSchema>;
export const requestEmailCodeSchema = z.object({ purpose: emailCodePurposeSchema });
export const verifyEmailCodeSchema = z.object({
  purpose: emailCodePurposeSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export const emailCodeSentSchema = z.object({ sentTo: z.string(), expiresAt: isoDate });
export const emailCodeVerifiedSchema = z.object({ verifiedAt: isoDate });

/**
 * What a "Need help" button attaches (PRD-00 §18): IDs and short labels only,
 * never full records, payment details or file contents.
 */
export const helpContextSchema = z
  .object({
    page: z.object({ path: z.string().max(300), title: label }).strict(),
    step: label.optional(),
    product: ref.optional(),
    configuration: ref.extend({ summary: label.optional() }).strict().optional(),
    project: ref.optional(),
    quote: ref.extend({ version: z.number().int().optional() }).strict().optional(),
    proof: ref.extend({ version: z.number().int().optional() }).strict().optional(),
    order: ref.optional(),
    organization: ref.optional(),
    location: ref.optional(),
    files: z.array(ref.extend({ status: z.string().max(40).optional() }).strict()).max(20).optional(),
  })
  .strict();
export type HelpContext = z.infer<typeof helpContextSchema>;

/** What a contact-page enquiry is about (Pen 60 · Czozq). */
export const helpTopicSchema = z.enum(["NEW_ORDER", "EXISTING_ORDER", "COMPANY_ACCOUNT", "SOMETHING_ELSE"]);
export type HelpTopic = z.infer<typeof helpTopicSchema>;
export const HELP_TOPIC_LABEL: Record<HelpTopic, string> = {
  NEW_ORDER: "New order",
  EXISTING_ORDER: "An existing order",
  COMPANY_ACCOUNT: "Company account",
  SOMETHING_ELSE: "Something else",
};

export const createHelpRequestSchema = z.object({
  message: z.string().trim().min(1, "Tell us what you need help with").max(4000, "Use 4,000 characters or fewer"),
  /** Guests give an email so HolyPearls can reply; signed-in customers use their account's. */
  email: z.email("Enter an email like name@example.com").optional(),
  name: z.string().trim().max(120).optional(),
  topic: helpTopicSchema.optional(),
  company: z.string().trim().max(120, "Use 120 characters or fewer").optional(),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^\+?[0-9 ()-]{7,30}$/, "Enter a phone number like +234 800 000 0000")
    .optional(),
  /** Uploaded files to attach (logo, references, brief); they join the request when it's sent. */
  fileIds: z.array(z.uuid()).max(5, "Attach up to 5 files").optional(),
  context: helpContextSchema,
});

export const helpStatusSchema = z.enum(["OPEN", "ANSWERED", "CLOSED"]);

export const helpReplySchema = z.object({ id: z.string(), author: z.string(), body: z.string(), createdAt: isoDate });

export const helpRequestSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: helpStatusSchema,
  message: z.string(),
  topic: helpTopicSchema.nullable(),
  company: z.string().nullable(),
  phone: z.string().nullable(),
  context: helpContextSchema,
  createdAt: isoDate,
  replies: z.array(helpReplySchema),
});
export type HelpRequest = z.infer<typeof helpRequestSchema>;

export const adminHelpRequestSchema = helpRequestSchema.extend({
  requester: z.object({
    name: z.string().nullable(),
    email: z.string(),
    kind: z.enum(["guest", "account"]),
  }),
  answeredAt: isoDate.nullable(),
  closedAt: isoDate.nullable(),
});
export type AdminHelpRequest = z.infer<typeof adminHelpRequestSchema>;

export const helpInboxSchema = z.object({
  counts: z.object({ OPEN: z.number(), ANSWERED: z.number(), CLOSED: z.number() }),
  entries: z.array(adminHelpRequestSchema.omit({ replies: true })),
  nextCursor: z.string().nullable(),
});
export type HelpInbox = z.infer<typeof helpInboxSchema>;

export const helpInboxQuerySchema = z.object({
  status: helpStatusSchema.default("OPEN"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const replyToHelpSchema = z.object({ body: z.string().trim().min(1, "Write a reply").max(5000) });
