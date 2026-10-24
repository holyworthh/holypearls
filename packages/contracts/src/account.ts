import { z } from "zod";
import { orderSummaryStatusSchema } from "./orders.js";
import { customerPaymentStatusSchema } from "./payments.js";

const isoDate = z.iso.datetime();

/** Profile fields a customer edits (Pen frame 91). The email changes through its own check (T09-01b). */
export const profileInputSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120, "Use 120 characters or fewer"),
  phone: z
    .string()
    .trim()
    .max(30, "Use 30 characters or fewer")
    .regex(/^$|^\+?[0-9 ()-]{7,}$/, "Enter a phone number like +234 803 000 0000")
    .nullable()
    .default(null),
  /** Product news, off unless the person turns it on (TECH-06 §12). */
  marketingConsent: z.boolean().optional(),
});
/** An empty phone removes it. Leaving `marketingConsent` out changes nothing. */
export type ProfileInput = z.infer<typeof profileInputSchema>;

/** `pendingEmail`: a new email waiting for its check link (Pen 91 "Email change pending"); the account keeps `email` until then. */
export const profileSchema = z.object({ name: z.string(), email: z.string(), phone: z.string().nullable(), pendingEmail: z.string().nullable(), marketingConsent: z.boolean() });
export type Profile = z.infer<typeof profileSchema>;

/**
 * Whether earlier guest records joined the account (TECH-03 §6): nothing joins
 * until the email is verified. LINKED counts what joined, and `recent` says it
 * happened in the last 14 days, when the overview announces it.
 */
export const accountLinkingSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("UNVERIFIED") }),
  z.object({ state: z.literal("NOTHING_LINKED") }),
  z.object({ state: z.literal("LINKED"), orders: z.number().int().nonnegative(), quotes: z.number().int().nonnegative(), recent: z.boolean() }),
]);
export type AccountLinking = z.infer<typeof accountLinkingSchema>;

export const accountDraftSchema = z.object({
  kind: z.enum(["CONFIGURATION", "PROJECT"]),
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  status: z.string(),
  savedAt: isoDate,
  href: z.string(),
});

export const accountOrderSchema = z.object({
  id: z.string(),
  number: z.string(),
  title: z.string(),
  summaryStatus: orderSummaryStatusSchema,
  paymentStatus: customerPaymentStatusSchema.nullable(),
  placedAt: isoDate,
});

export const accountQuoteSchema = z.object({
  kind: z.enum(["QUOTE", "PROJECT"]),
  id: z.string(),
  reference: z.string(),
  /** The version the customer last received, for quotes. */
  version: z.number().int().nullable(),
  title: z.string(),
  status: z.string(),
  validUntil: isoDate.nullable(),
  href: z.string(),
});

export const accountReceiptSchema = z.object({
  id: z.string(),
  number: z.string(),
  orderId: z.string().nullable(),
  amountMinor: z.string(),
  currency: z.enum(["NGN", "USD"]),
  paidAt: isoDate,
  paystackReference: z.string(),
});

/** The account overview (Pen frame 92): the newest of each, never anyone else's. */
export const accountHistorySchema = z.object({
  linking: accountLinkingSchema,
  drafts: z.array(accountDraftSchema),
  orders: z.array(accountOrderSchema),
  quotes: z.array(accountQuoteSchema),
  receipts: z.array(accountReceiptSchema),
});
export type AccountHistory = z.infer<typeof accountHistorySchema>;

/** One history list in full (T09-01b): its own page when the overview's newest few aren't enough. */
export const ACCOUNT_LISTS = ["orders", "quotes", "projects", "drafts", "receipts"] as const;
export const accountListNameSchema = z.enum(ACCOUNT_LISTS);
export type AccountListName = z.infer<typeof accountListNameSchema>;
export const accountListSchema = accountHistorySchema.omit({ linking: true });
export type AccountList = z.infer<typeof accountListSchema>;
export type AccountDraft = z.infer<typeof accountDraftSchema>;
export type AccountOrder = z.infer<typeof accountOrderSchema>;
export type AccountQuote = z.infer<typeof accountQuoteSchema>;
export type AccountReceipt = z.infer<typeof accountReceiptSchema>;
