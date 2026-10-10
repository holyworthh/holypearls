import { z } from "zod";

/*
 * Group collections (T12-01; PRD-05 B2B-FR-050–052, 060; TECH-01 §4; Pen
 * frame 132). An organizer starts a collection from an approved template or
 * a saved design, chooses what participants fill in, the deadline, who pays
 * and where it's delivered, then shares one link. Participants never see
 * each other (T12-01b).
 */

const isoDate = z.iso.datetime();

/** DRAFT → OPEN ⇄ PAUSED → CLOSED → NEEDS_REVIEW ⇄ READY_TO_ORDER → ORDER_DRAFT_CREATED; any before → CANCELLED (TECH-01 §4). */
export const COLLECTION_STATUSES = ["DRAFT", "OPEN", "PAUSED", "CLOSED", "NEEDS_REVIEW", "READY_TO_ORDER", "ORDER_DRAFT_CREATED", "CANCELLED"] as const;
export const collectionStatusSchema = z.enum(COLLECTION_STATUSES);
export type CollectionStatus = z.infer<typeof collectionStatusSchema>;

/** What participants can fill in (B2B-FR-052). Delivery and payment follow the modes below. */
export const PARTICIPANT_FIELDS = ["SIZE", "PERSONALIZATION", "QUANTITY", "COLOUR"] as const;
export const participantFieldSchema = z.enum(PARTICIPANT_FIELDS);
export type ParticipantField = z.infer<typeof participantFieldSchema>;

export const PARTICIPANT_FIELD_LABELS: Record<ParticipantField, string> = {
  SIZE: "Size",
  PERSONALIZATION: "Name personalisation",
  QUANTITY: "Quantity (1 each if off)",
  COLOUR: "Colour",
};

export const PAYMENT_MODES = ["ORGANIZATION", "PARTICIPANT"] as const;
export const paymentModeSchema = z.enum(PAYMENT_MODES);
export const DELIVERY_MODES = ["CENTRAL", "BRANCHES", "HOME"] as const;
export const deliveryModeSchema = z.enum(DELIVERY_MODES);
/** "Not sure of my size" (B2B-FR-062): the participant may say so and the organizer settles it, or a size is required. */
export const UNSURE_SIZE_RULES = ["ALLOW_UNSURE", "REQUIRE_SIZE"] as const;
export const unsureSizeRuleSchema = z.enum(UNSURE_SIZE_RULES);

export const collectionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: collectionStatusSchema,
  productName: z.string(),
  locationName: z.string(),
  deadline: isoDate.nullable(),
  submittedCount: z.number().int(),
  updatedAt: isoDate,
});
export type CollectionSummary = z.infer<typeof collectionSummarySchema>;

export const collectionListSchema = z.object({ collections: z.array(collectionSummarySchema), canManage: z.boolean() });
export type CollectionList = z.infer<typeof collectionListSchema>;

export const collectionSchema = collectionSummarySchema.extend({
  locationId: z.string(),
  source: z.object({ kind: z.enum(["TEMPLATE", "CONFIGURATION"]), label: z.string(), templateId: z.string().nullable() }),
  fields: z.array(participantFieldSchema),
  /** Each field, and why it can't be offered when it can't ("Locked by the template", "This product has no sizes"). */
  availableFields: z.array(z.object({ field: participantFieldSchema, available: z.boolean(), reason: z.string().nullable() })),
  paymentMode: paymentModeSchema,
  deliveryMode: deliveryModeSchema,
  /** Central delivery goes here; for BRANCHES, participants choose among `branchLocations`. */
  centralLocationId: z.string().nullable(),
  branchLocations: z.array(z.object({ id: z.string(), name: z.string() })),
  unsureSizeRule: unsureSizeRuleSchema,
  /** The link participants open; only for people who manage the collection, while it's OPEN or PAUSED. */
  shareUrl: z.string().nullable(),
  canManage: z.boolean(),
  version: z.number().int(),
});
export type Collection = z.infer<typeof collectionSchema>;

export const createCollectionSchema = z
  .object({
    title: z.string().trim().min(1, "Name the collection, for example Lekki staff polos 2026").max(80, "Use 80 characters or fewer"),
    locationId: z.uuid("Choose the location it's for"),
    templateId: z.uuid().nullable().default(null),
    configurationId: z.uuid().nullable().default(null),
  })
  .refine((value) => Boolean(value.templateId) !== Boolean(value.configurationId), { message: "Start from an approved template or a saved design", path: ["templateId"] });
export type CreateCollection = z.infer<typeof createCollectionSchema>;

export const updateCollectionSchema = z.object({
  title: z.string().trim().min(1, "Name the collection").max(80),
  fields: z.array(participantFieldSchema).max(PARTICIPANT_FIELDS.length),
  deadline: isoDate.nullable(),
  paymentMode: paymentModeSchema,
  deliveryMode: deliveryModeSchema,
  centralLocationId: z.uuid().nullable(),
  branchLocationIds: z.array(z.uuid()).max(100).default([]),
  unsureSizeRule: unsureSizeRuleSchema,
  version: z.number().int(),
});
export type UpdateCollection = z.infer<typeof updateCollectionSchema>;

export const collectionActionSchema = z.object({ version: z.number().int() });

/** What a participant sees on opening the share link, before starting (B2B-FR-060–061): only the allowed fields, nothing about anyone else. */
export const collectionInviteSchema = z.object({
  title: z.string(),
  organizationName: z.string(),
  productName: z.string(),
  status: z.enum(["OPEN", "PAUSED", "CLOSED"]),
  deadline: isoDate.nullable(),
  fields: z.array(participantFieldSchema),
  paymentMode: paymentModeSchema,
  deliveryMode: deliveryModeSchema,
  /** Branches to choose from (BRANCHES only). */
  branches: z.array(z.object({ id: z.string(), name: z.string() })),
  unsureSizeRule: unsureSizeRuleSchema,
});
export type CollectionInvite = z.infer<typeof collectionInviteSchema>;
