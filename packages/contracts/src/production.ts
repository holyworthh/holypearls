import { z } from "zod";
import { orderItemStatusSchema, orderSummaryStatusSchema } from "./orders.js";

/*
 * Production (T07-01; FUL-FR-012–016, 020–021, OPS-FR-060–064). Staff move
 * each order item on its own; only the moves TECH-01 §4 allows are offered.
 */

const isoDate = z.iso.datetime();

/** OPS-FR-060 board groups. ON_HOLD is a group even though it isn't an item status. */
export const productionGroupSchema = z.enum(["WAITING", "QUEUED", "IN_PRODUCTION", "QUALITY_CHECK", "READY", "ON_HOLD"]);

/** What an item still needs before it can be queued (TECH-01 §4). */
export const prerequisiteSchema = z.enum(["PROOF_APPROVAL", "DEPOSIT", "ARTWORK"]);

export const productionCardSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  position: z.number().int(),
  productName: z.string(),
  quantity: z.number().int(),
  status: orderItemStatusSchema,
  group: productionGroupSchema,
  /** One short line: what it needs, the hold reason, or the balance due. */
  note: z.string().nullable(),
  updatedAt: isoDate,
});
export type ProductionCard = z.infer<typeof productionCardSchema>;

export const productionBoardSchema = z.object({
  groups: z.array(z.object({ group: productionGroupSchema, items: z.array(productionCardSchema) })),
});
export type ProductionBoard = z.infer<typeof productionBoardSchema>;

/** Moves a person can ask for; the server checks each one (TECH-01 §3). */
export const productionMoveSchema = z.enum(["QUEUE", "START", "TO_QUALITY_CHECK"]);
export type ProductionMove = z.infer<typeof productionMoveSchema>;

export const holdReasonSchema = z.enum(["CUSTOMER_INFORMATION", "ARTWORK", "MATERIALS", "EQUIPMENT", "PAYMENT", "OTHER"]);

export const staffHoldSchema = z.object({
  id: z.string(),
  status: z.enum(["OPEN", "RESOLVED"]),
  reason: holdReasonSchema,
  internalNote: z.string(),
  customerExplanation: z.string(),
  whoActs: z.enum(["CUSTOMER", "HOLYPEARLS"]),
  timingImpactDays: z.number().int().nullable(),
  placedBy: z.string().nullable(),
  createdAt: isoDate,
  resolution: z.string().nullable(),
  resolvedAt: isoDate.nullable(),
});

export const productionItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  position: z.number().int(),
  itemCount: z.number().int(),
  productName: z.string(),
  summary: z.string(),
  quantity: z.number().int(),
  status: orderItemStatusSchema,
  version: z.number().int(),
  orderSummary: orderSummaryStatusSchema,
  prerequisites: z.object({
    proof: z.object({ status: z.string(), versionNumber: z.number().int().nullable() }),
    deposit: z.enum(["PAID", "DUE", "NOT_NEEDED"]),
    artwork: z.enum(["READY", "WAITING", "NONE"]),
    missing: z.array(prerequisiteSchema),
  }),
  /** Balance owed before dispatch, if any (FUL-FR-021). */
  balance: z.object({ label: z.string(), amountMinor: z.string(), currency: z.enum(["NGN", "USD"]), status: z.string() }).nullable(),
  moves: z.array(productionMoveSchema),
  canRecordQc: z.boolean(),
  hold: staffHoldSchema.nullable(),
  history: z.array(
    z.object({
      kind: z.enum(["STATUS", "HOLD_PLACED", "HOLD_RESOLVED", "QC"]),
      from: orderItemStatusSchema.nullable(),
      to: orderItemStatusSchema.nullable(),
      note: z.string().nullable(),
      by: z.string(),
      at: isoDate,
    }),
  ),
});
export type ProductionItem = z.infer<typeof productionItemSchema>;

export const moveItemSchema = z.object({ move: productionMoveSchema, version: z.number().int(), note: z.string().trim().max(500).optional() });

export const qcResultInputSchema = z.object({
  outcome: z.enum(["PASSED", "REWORK"]),
  note: z.string().trim().max(1000).default(""),
  version: z.number().int(),
});

export const placeHoldSchema = z.object({
  reason: holdReasonSchema,
  internalNote: z.string().trim().max(2000).default(""),
  customerExplanation: z.string().trim().min(1, "Add an explanation for the customer. It's shown on their order page.").max(500),
  whoActs: z.enum(["CUSTOMER", "HOLYPEARLS"]),
  timingImpactDays: z.number().int().min(0).max(365).nullable(),
});

export const resolveHoldSchema = z.object({ resolution: z.string().trim().min(1, "Say how the hold was resolved.").max(1000) });
