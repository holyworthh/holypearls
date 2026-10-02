import { z } from "zod";

/*
 * Proofs (T06-01; FUL-FR-001–004, 006, OPS-FR-050–051, TECH-01 §4, TECH-04
 * §10). One proof per order item; staff publish permanent versions with
 * their files and the production details the customer sees.
 */

const isoDate = z.iso.datetime();

export const proofStatusSchema = z.enum(["NOT_REQUIRED", "PREPARING", "AWAITING_APPROVAL", "APPROVED", "CHANGES_REQUESTED", "REVISION_IN_PROGRESS"]);
export type ProofStatus = z.infer<typeof proofStatusSchema>;
export const proofVersionStatusSchema = z.enum(["DRAFT", "PUBLISHED", "APPROVED", "CHANGES_REQUESTED", "SUPERSEDED"]);

/** Production details shown to the customer (FUL-FR-002). */
export const proofDetailsSchema = z.object({
  placement: z.string().trim().max(160),
  dimensions: z.string().trim().max(160),
  colourReference: z.string().trim().max(240),
  quantity: z.string().trim().max(80),
  notes: z.string().trim().max(2000),
});
export type ProofDetails = z.infer<typeof proofDetailsSchema>;

/** One view of the proof (Front, Back, Left chest detail…) and its file. */
export const proofViewInputSchema = z.object({ label: z.string().trim().min(1, "Name the view").max(60), fileId: z.string().uuid() });
export const proofViewSchema = proofViewInputSchema.extend({ fileName: z.string(), fileStatus: z.string(), pages: z.number().int() });

export const proofCommentSchema = z.object({
  id: z.string(),
  kind: z.enum(["QUESTION", "CHANGE_REQUEST", "REPLY", "COMMENT"]),
  author: z.string(),
  fromStaff: z.boolean(),
  body: z.string(),
  createdAt: isoDate,
});

export const proofVersionSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  status: proofVersionStatusSchema,
  views: z.array(proofViewSchema),
  details: proofDetailsSchema,
  publishedAt: isoDate.nullable(),
  publishedBy: z.string().nullable(),
  decision: z.object({ decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]), by: z.string(), at: isoDate, note: z.string() }).nullable(),
  comments: z.array(proofCommentSchema),
  version: z.number().int(),
});
export type ProofVersion = z.infer<typeof proofVersionSchema>;

/** The customer's proof page (Pen 26, 49, 50). Drafts are never shown. */
export const customerProofSchema = z.object({
  id: z.string(),
  status: proofStatusSchema,
  order: z.object({ id: z.string(), number: z.string() }),
  item: z.object({ position: z.number().int(), of: z.number().int(), name: z.string(), quantity: z.number().int(), summary: z.string() }),
  current: proofVersionSchema.omit({ version: true }).nullable(),
  history: z.array(proofVersionSchema.omit({ version: true, comments: true })),
  canDecide: z.boolean(),
});
export type CustomerProof = z.infer<typeof customerProofSchema>;

export const approveProofSchema = z.object({
  versionNumber: z.number().int(),
  acknowledged: z.literal(true, { error: "Tick the box to confirm you've reviewed the proof." }),
});
export const proofRequestSchema = z.object({ versionNumber: z.number().int(), note: z.string().trim().min(1, "Tell us what to change").max(4000) });
export const proofQuestionSchema = z.object({ versionNumber: z.number().int(), body: z.string().trim().min(1, "Type your question").max(4000) });

/** On the order page: each item's proof. */
export const orderProofSummarySchema = z.object({ id: z.string(), itemPosition: z.number().int(), status: proofStatusSchema, versionNumber: z.number().int().nullable() });

/* ---- Staff (Pen 112) ---- */

export const adminProofRowSchema = z.object({
  id: z.string(),
  status: proofStatusSchema,
  orderId: z.string(),
  orderNumber: z.string(),
  itemPosition: z.number().int(),
  itemName: z.string(),
  quantity: z.number().int(),
  latestVersion: z.number().int().nullable(),
  updatedAt: isoDate,
});
export const adminProofQueueSchema = z.object({
  proofs: z.array(adminProofRowSchema),
  files: z.array(z.object({ id: z.string(), name: z.string(), status: z.string(), purpose: z.string(), owner: z.string(), reason: z.string().nullable(), uploadedAt: isoDate })),
});

export const adminProofSchema = z.object({
  id: z.string(),
  status: proofStatusSchema,
  required: z.enum(["REQUIRED", "OPTIONAL", "NOT_REQUIRED"]),
  order: z.object({ id: z.string(), number: z.string() }),
  item: z.object({ position: z.number().int(), name: z.string(), quantity: z.number().int(), summary: z.string(), status: z.string() }),
  /** Files the customer sent with the order (artwork, logos, references). */
  customerFiles: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })),
  versions: z.array(proofVersionSchema),
});
export type AdminProof = z.infer<typeof adminProofSchema>;

export const saveProofDraftSchema = z.object({ version: z.number().int(), views: z.array(proofViewInputSchema).max(12), details: proofDetailsSchema });
export const fileDecisionSchema = z.object({ decision: z.enum(["READY", "REJECTED"]), note: z.string().trim().max(500).optional() });
export const proofReplySchema = z.object({ versionNumber: z.number().int(), body: z.string().trim().min(1).max(4000) });
