import { z } from "zod";

/*
 * Group collections (T12-01; PRD-05 B2B-FR-050–052, 060; TECH-01 §4; Pen
 * frame 132). An organizer starts a collection from an approved template or
 * a saved design, chooses what participants fill in, the deadline and where
 * it's delivered, then shares one link. The organization always pays. Participants never see
 * each other (T12-01b).
 */

const isoDate = z.iso.datetime();

/** DRAFT → OPEN ⇄ PAUSED → CLOSED → NEEDS_REVIEW ⇄ READY_TO_ORDER → ORDER_DRAFT_CREATED; any before → CANCELLED (TECH-01 §4). */
export const COLLECTION_STATUSES = ["DRAFT", "OPEN", "PAUSED", "CLOSED", "NEEDS_REVIEW", "READY_TO_ORDER", "ORDER_DRAFT_CREATED", "CANCELLED"] as const;
export const collectionStatusSchema = z.enum(COLLECTION_STATUSES);
export type CollectionStatus = z.infer<typeof collectionStatusSchema>;

/** What participants can fill in (B2B-FR-052). Delivery follows the mode below; there is no payment (owner decision 2026-10-10). */
export const PARTICIPANT_FIELDS = ["SIZE", "PERSONALIZATION", "QUANTITY", "COLOUR"] as const;
export const participantFieldSchema = z.enum(PARTICIPANT_FIELDS);
export type ParticipantField = z.infer<typeof participantFieldSchema>;

export const PARTICIPANT_FIELD_LABELS: Record<ParticipantField, string> = {
  SIZE: "Size",
  PERSONALIZATION: "Name personalisation",
  QUANTITY: "Quantity (1 each if off)",
  COLOUR: "Colour",
};

/**
 * Owner decision (2026-10-10, confirming frame 76's 27 Sep note): the
 * organization pays for every group item, and group orders go to the
 * organization: one central location or the participant's approved branch.
 * Participant payment and home delivery are retired.
 */
export const DELIVERY_MODES = ["CENTRAL", "BRANCHES"] as const;
export const deliveryModeSchema = z.enum(DELIVERY_MODES);
/** "Not sure of my size" (B2B-FR-062): the participant may say so and the organizer settles it, or a size is required. */
export const UNSURE_SIZE_RULES = ["ALLOW_UNSURE", "REQUIRE_SIZE"] as const;
export const unsureSizeRuleSchema = z.enum(UNSURE_SIZE_RULES);

export const collectionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  /** The approved template it was started from, if any (company stores link items to collections by template, T12-06). */
  templateId: z.string().nullable(),
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
  deliveryMode: deliveryModeSchema,
  /** Branches to choose from (BRANCHES only). */
  branches: z.array(z.object({ id: z.string(), name: z.string() })),
  unsureSizeRule: unsureSizeRuleSchema,
});
export type CollectionInvite = z.infer<typeof collectionInviteSchema>;

/* Participants (T12-01b; PRD-05 B2B-FR-060–064; Pen 31, 76). */

/** NOT_STARTED → IN_PROGRESS → SUBMITTED ⇄ NEEDS_CORRECTION; any → REMOVED (TECH-01 §4). */
export const PARTICIPANT_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "NEEDS_CORRECTION", "REMOVED"] as const;
export const participantStatusSchema = z.enum(PARTICIPANT_STATUSES);
export type ParticipantStatus = z.infer<typeof participantStatusSchema>;

/** Up to 12 letters for embroidery, spelled exactly as stitched (frame 31). */
export const PERSONALIZATION_MAX = 12;

export const participantAnswersSchema = z.object({
  size: z.string().max(8).nullable().default(null),
  /** "I'm not sure" (frame 76 A), when the organizer allows it. */
  sizeUnsure: z.boolean().default(false),
  personalization: z.string().trim().max(PERSONALIZATION_MAX, `Up to ${PERSONALIZATION_MAX} letters, including spaces`).nullable().default(null),
  quantity: z.number().int().min(1).max(50).nullable().default(null),
  colour: z.string().max(80).nullable().default(null),
  /** The approved branch, when delivery is by branch. */
  branchLocationId: z.uuid().nullable().default(null),
});
export type ParticipantAnswers = z.infer<typeof participantAnswersSchema>;

export const joinCollectionSchema = z.object({
  secret: z.string().min(16).max(200),
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.email("Enter your email address").max(254),
});

/** The participant's own view: the collection as they may see it, and only their own answers (B2B-FR-061). */
export const participationSchema = z.object({
  participantId: z.string(),
  name: z.string(),
  status: participantStatusSchema,
  answers: participantAnswersSchema,
  /** What the organizer asked them to fix (frame 76 B). */
  correction: z.string().nullable(),
  collection: collectionInviteSchema,
  sizes: z.array(z.string()),
  colours: z.array(z.object({ value: z.string(), label: z.string() })),
  /** Whether they can still change their answers (open and before the deadline). */
  canEdit: z.boolean(),
  version: z.number().int(),
});
export type Participation = z.infer<typeof participationSchema>;

export const saveParticipationSchema = z.object({ answers: participantAnswersSchema, version: z.number().int() });
export const submitParticipationSchema = z.object({ version: z.number().int() });

/* The organizer's dashboard (T12-03; PRD-05 B2B-FR-053–055; Pen 30, 74, 133, 134). */

export const ISSUE_KINDS = ["NOT_SUBMITTED", "SIZE_TO_CONFIRM", "NEEDS_CORRECTION"] as const;

export const collectionParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  status: participantStatusSchema,
  size: z.string().nullable(),
  sizeUnsure: z.boolean(),
  personalization: z.string().nullable(),
  quantity: z.number().int(),
  colour: z.string().nullable(),
  branchName: z.string().nullable(),
  /** Left out of the order by the organizer during review; still in the list and history. */
  excluded: z.boolean(),
  origin: z.string(),
  submittedAt: isoDate.nullable(),
  removedAt: isoDate.nullable(),
  version: z.number().int(),
});
export type CollectionParticipant = z.infer<typeof collectionParticipantSchema>;

export const collectionDashboardSchema = z.object({
  progress: z.object({ total: z.number().int(), submitted: z.number().int(), incomplete: z.number().int(), notStarted: z.number().int(), removed: z.number().int(), excluded: z.number().int() }),
  /** What stops the order: people who haven't sent, sizes to confirm, corrections asked for (only people still in the order). */
  issues: z.array(z.object({ participantId: z.string(), name: z.string(), kind: z.enum(ISSUE_KINDS), message: z.string() })),
  /** Live counts of the people in the order; not an order until closed and reviewed. */
  sizes: z.array(z.object({ size: z.string(), count: z.number().int() })),
  sizesToConfirm: z.number().int(),
  withNames: z.number().int(),
  pieces: z.number().int(),
  delivery: z.array(z.object({ name: z.string(), count: z.number().int() })),
  participants: z.array(collectionParticipantSchema),
  lastRemindedAt: isoDate.nullable(),
  closedAt: isoDate.nullable(),
});
export type CollectionDashboard = z.infer<typeof collectionDashboardSchema>;

export const correctionSchema = z.object({ note: z.string().trim().min(1, "Tell them what to fix").max(500), version: z.number().int() });
export const settleSizeSchema = z.object({ size: z.string().max(8), version: z.number().int() });
export const participantActionSchema = z.object({ version: z.number().int() });
export const reopenCollectionSchema = z.object({ deadline: isoDate, version: z.number().int() });

/* The Order Draft (T12-03b; PRD-05 B2B-FR-054–055; OPS-FR-090; Pen 133). */

/** CURRENT → STALE (collection reopened) | SUBMITTED (turned into an order request or quote request) (TECH-01 §4). */
export const ORDER_DRAFT_STATUSES = ["CURRENT", "STALE", "SUBMITTED"] as const;
export const orderDraftStatusSchema = z.enum(ORDER_DRAFT_STATUSES);

export const orderDraftSchema = z.object({
  id: z.string(),
  status: orderDraftStatusSchema,
  pieces: z.number().int(),
  sizes: z.array(z.object({ size: z.string(), count: z.number().int() })),
  withNames: z.number().int(),
  delivery: z.array(z.object({ name: z.string(), count: z.number().int() })),
  includedCount: z.number().int(),
  excludedCount: z.number().int(),
  createdAt: isoDate,
  submittedAt: isoDate.nullable(),
  /** After submitting: an order request waiting for the organization's approval, or a quote request with HolyPearls. */
  route: z.enum(["APPROVAL", "QUOTE"]).nullable(),
  orderRequestId: z.string().nullable(),
  quoteReference: z.string().nullable(),
  version: z.number().int(),
});
export type OrderDraft = z.infer<typeof orderDraftSchema>;

export const orderDraftStateSchema = z.object({ current: orderDraftSchema.nullable(), stale: z.number().int() });
export type OrderDraftState = z.infer<typeof orderDraftStateSchema>;

/** Where an Order Draft came from, for HolyPearls staff (OPS-FR-090; Pen 133 · u3BRd). Read only. */
export const orderDraftOriginSchema = z.object({
  id: z.string(),
  status: orderDraftStatusSchema,
  collectionTitle: z.string(),
  organizationName: z.string(),
  pieces: z.number().int(),
  fromLink: z.number().int(),
  fromImports: z.array(z.object({ name: z.string(), count: z.number().int() })),
  excluded: z.array(z.object({ name: z.string(), reason: z.string() })),
  quoteReference: z.string().nullable(),
});
export type OrderDraftOrigin = z.infer<typeof orderDraftOriginSchema>;

/* CSV import (T12-03c; PRD-05 B2B-FR-070–073; TECH-04 §12; Pen 75). */

/** What a column can be matched to. Name and email are needed; the rest follow the collection's fields. */
export const IMPORT_FIELDS = ["name", "email", "size", "personalization", "quantity", "colour", "branch"] as const;
export const importFieldSchema = z.enum(IMPORT_FIELDS);
export type ImportField = z.infer<typeof importFieldSchema>;
export const IMPORT_FIELD_LABELS: Record<ImportField, string> = { name: "Name", email: "Email", size: "Size", personalization: "Name on chest", quantity: "Quantity", colour: "Colour", branch: "Delivery branch" };

export const DUPLICATE_DECISIONS = ["MERGE", "KEEP_BOTH", "REPLACE", "SKIP"] as const;
export const duplicateDecisionSchema = z.enum(DUPLICATE_DECISIONS);

export const importRowSchema = z.object({
  id: z.string(),
  line: z.number().int(),
  values: z.record(z.string(), z.string().nullable()),
  problems: z.array(z.object({ field: z.string(), message: z.string() })),
  /** Someone already in the collection (or earlier in the file) with the same email. */
  duplicateOf: z.string().nullable(),
  decision: duplicateDecisionSchema.nullable(),
  outcome: z.enum(["PENDING", "IMPORTED", "SKIPPED"]),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const importBatchSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  status: z.enum(["UPLOADED", "CHECKED", "IMPORTED", "CANCELLED"]),
  headers: z.array(z.string()),
  /** Column header for each field, or null. */
  mapping: z.partialRecord(importFieldSchema, z.string().nullable()),
  /** Which fields this collection uses. */
  fields: z.array(importFieldSchema),
  counts: z.object({ rows: z.number().int(), ready: z.number().int(), problems: z.number().int(), duplicates: z.number().int(), imported: z.number().int(), skipped: z.number().int() }),
  rows: z.array(importRowSchema),
  version: z.number().int(),
});
export type ImportBatch = z.infer<typeof importBatchSchema>;

export const importBatchListSchema = z.object({ batches: z.array(z.object({ id: z.string(), fileName: z.string(), status: z.string(), rows: z.number().int(), imported: z.number().int(), createdAt: isoDate })) });

export const startImportSchema = z.object({ fileId: z.uuid("Upload the file first") });
export const matchColumnsSchema = z.object({ mapping: z.partialRecord(importFieldSchema, z.string().nullable()), version: z.number().int() });
export const fixImportRowSchema = z.object({ values: z.partialRecord(importFieldSchema, z.string().trim().max(200).nullable()).optional(), decision: duplicateDecisionSchema.nullable().optional(), version: z.number().int() });
/** Import: with `partial`, valid rows go in now and problem rows wait to be fixed (B2B-FR-071). */
export const runImportSchema = z.object({ partial: z.boolean(), version: z.number().int() });

/* Company store (T12-06; PRD-05 B2B-FR-080–083; TECH-01 §4; Pen 32, 77, 78). */

/** DRAFT → ACTIVE ⇄ PAUSED → ARCHIVED (TECH-01 §4). */
export const STORE_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export const storeStatusSchema = z.enum(STORE_STATUSES);
export type StoreStatus = z.infer<typeof storeStatusSchema>;
/** Procurement: buyers order for a location. Self-order: each employee orders for themselves (B2B-FR-081). */
export const STORE_MODES = ["PROCUREMENT", "SELF_ORDER"] as const;
export const storeModeSchema = z.enum(STORE_MODES);
export type StoreMode = z.infer<typeof storeModeSchema>;
/** Where self-order picks go: individual orders, or into a group collection (B2B-FR-082). Employees never see or choose this. */
export const STORE_ROUTINGS = ["INDIVIDUAL", "COLLECTION"] as const;
export const storeRoutingSchema = z.enum(STORE_ROUTINGS);
export type StoreRouting = z.infer<typeof storeRoutingSchema>;

const option = z.object({ id: z.string(), name: z.string() });

/** One approved product in the store, as the person looking at it can use it. */
export const storeItemSchema = z.object({
  templateId: z.string(),
  name: z.string(),
  productName: z.string(),
  image: z.object({ url: z.string(), thumbnailUrl: z.string(), alt: z.string() }).nullable(),
  /** What the company set, in words ("Navy · ACME logo · left-chest embroidery"). */
  locked: z.string(),
  /** Today's price for one at the template's usual quantity, when it has a direct price; otherwise HolyPearls prices it. */
  unitMinor: z.string().nullable(),
  currency: z.string(),
  /** Why it can't be ordered now ("Temporarily unavailable"), or null. Shown, never hidden (Pen 78 D). */
  unavailable: z.string().nullable(),
  /** Self-order: what the employee fills in (B2B-FR-083), the sizes, and where it can go. */
  fields: z.array(participantFieldSchema),
  sizes: z.array(z.string()),
  sizeUnsureAllowed: z.boolean(),
  colours: z.array(z.object({ value: z.string(), label: z.string() })),
  branches: z.array(option),
  /** The button and the line under it, in outcome words, never routing words ("Add to ACME team order" · "Joins the 2027 team order, not a separate purchase"). */
  action: z.string(),
  note: z.string(),
});
export type StoreItem = z.infer<typeof storeItemSchema>;

export const storeSummarySchema = z.object({ id: z.string(), name: z.string(), status: storeStatusSchema, mode: storeModeSchema, itemCount: z.number().int(), updatedAt: isoDate });
export type StoreSummary = z.infer<typeof storeSummarySchema>;
export const storeListSchema = z.object({ stores: z.array(storeSummarySchema), canManage: z.boolean() });
export type StoreList = z.infer<typeof storeListSchema>;

export const storeSetupItemSchema = z.object({ templateId: z.uuid(), collectionId: z.uuid().nullable().default(null) });

export const storeSchema = storeSummarySchema.extend({
  organizationName: z.string(),
  items: z.array(storeItemSchema),
  /** In plain words: "Ordering for yourself", or "Your choices are added to your team's order". */
  modeNote: z.string(),
  /** Procurement: the locations the buyer can order for. */
  locations: z.array(option),
  /** The organization's approval rule as it applies to this person (as for template orders). */
  approval: z.object({ applies: z.enum(["ALWAYS", "NEVER", "ABOVE_AMOUNT"]), thresholdMinor: z.string().nullable() }),
  /** Why this person can't order here, or null. */
  blocked: z.string().nullable(),
  /** Only for people who manage stores: routing and each item's collection. */
  setup: z.object({ routing: storeRoutingSchema, items: z.array(storeSetupItemSchema) }).nullable(),
  canManage: z.boolean(),
  version: z.number().int(),
});
export type Store = z.infer<typeof storeSchema>;

export const createStoreSchema = z.object({ name: z.string().trim().min(1, "Name the store, for example ACME Team Store").max(80, "Use 80 characters or fewer"), mode: storeModeSchema });
export type CreateStore = z.infer<typeof createStoreSchema>;
export const updateStoreSchema = z.object({
  name: z.string().trim().min(1, "Name the store").max(80, "Use 80 characters or fewer"),
  mode: storeModeSchema,
  routing: storeRoutingSchema,
  items: z.array(storeSetupItemSchema).max(100),
  version: z.number().int(),
});
export type UpdateStore = z.infer<typeof updateStoreSchema>;
export const storeActionSchema = z.object({ version: z.number().int() });

/** A procurement order: several items for one location (Pen 77). */
export const storeProcurementSchema = z.object({
  locationId: z.uuid("Choose the location you're ordering for"),
  lines: z.array(z.object({ templateId: z.uuid(), quantity: z.number().int().min(1).max(100_000) })).min(1, "Add at least one item").max(50),
});
export type StoreProcurement = z.infer<typeof storeProcurementSchema>;
/** A self-order pick: one item with the employee's own answers (Pen 32, 78). */
export const storePickSchema = z.object({ templateId: z.uuid(), answers: participantAnswersSchema });
export type StorePick = z.infer<typeof storePickSchema>;
export const storeOrderResultSchema = z.object({
  /** CHECKOUT / QUOTE / APPROVAL as for template orders; COLLECTION when the pick joined a group collection. */
  route: z.enum(["CHECKOUT", "QUOTE", "APPROVAL", "COLLECTION"]),
  next: z.string(),
  reference: z.string().nullable(),
  /** What happened, in the employee's words. */
  message: z.string(),
});
export type StoreOrderResult = z.infer<typeof storeOrderResultSchema>;
