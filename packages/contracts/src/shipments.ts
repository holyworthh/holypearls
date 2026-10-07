import { z } from "zod";

/*
 * Shipments, reorder and problem reports (T08-01; FUL-FR-030–032, 060–062,
 * 070, OPS-FR-018, 070–073).
 */

const isoDate = z.iso.datetime();
const minor = z.string();

export const shipmentStatusSchema = z.enum(["PREPARING", "LABEL_CREATED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "ATTEMPTED_DELIVERY", "EXCEPTION", "RETURNED"]);
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>;

/** TECH-01 §4: the statuses staff can move a shipment to from each status. */
export const SHIPMENT_NEXT: Record<ShipmentStatus, ShipmentStatus[]> = {
  PREPARING: ["LABEL_CREATED", "EXCEPTION"],
  LABEL_CREATED: ["IN_TRANSIT", "EXCEPTION"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "ATTEMPTED_DELIVERY", "EXCEPTION"],
  OUT_FOR_DELIVERY: ["DELIVERED", "ATTEMPTED_DELIVERY", "EXCEPTION"],
  ATTEMPTED_DELIVERY: ["OUT_FOR_DELIVERY", "EXCEPTION"],
  EXCEPTION: ["IN_TRANSIT", "RETURNED"],
  DELIVERED: [],
  RETURNED: [],
};

/** A shipment as the customer sees it (FUL-FR-031): no staff notes. */
export const customerShipmentSchema = z.object({
  id: z.string(),
  number: z.string(),
  status: shipmentStatusSchema,
  carrier: z.string(),
  trackingNumber: z.string(),
  destination: z.string(),
  dispatchedAt: isoDate.nullable(),
  deliveredAt: isoDate.nullable(),
  items: z.array(z.object({ name: z.string(), quantity: z.number().int() })),
  history: z.array(z.object({ status: shipmentStatusSchema, at: isoDate })),
});
export type CustomerShipment = z.infer<typeof customerShipmentSchema>;

/* ---- Staff shipments (Pen 115) ---- */

export const adminShipmentSchema = customerShipmentSchema.extend({
  orderId: z.string(),
  orderNumber: z.string(),
  version: z.number().int(),
  next: z.array(shipmentStatusSchema),
  /** The Shipbubble booking (T08-06): its order ID, the service, the tracking page and the cost before VAT. */
  courier: z
    .object({ orderId: z.string(), service: z.string().nullable(), trackingUrl: z.string().nullable(), costMinor: minor.nullable(), bookedAt: isoDate.nullable() })
    .nullable(),
  /** Whether "Book courier" applies: a courier-priced order's shipment that has no label yet. */
  bookable: z.boolean(),
  history: z.array(z.object({ from: shipmentStatusSchema.nullable(), status: shipmentStatusSchema, note: z.string().nullable(), by: z.string(), at: isoDate })),
});
export type AdminShipment = z.infer<typeof adminShipmentSchema>;

export const shippingQueueSchema = z.object({
  /** Orders with items ready to ship. */
  ready: z.array(z.object({ orderId: z.string(), orderNumber: z.string(), contactName: z.string(), readyItems: z.number().int(), since: isoDate })),
  /** Shipments not yet delivered or returned. */
  active: z.array(adminShipmentSchema),
});

export const orderShippingSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  contactName: z.string(),
  destination: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      position: z.number().int(),
      name: z.string(),
      quantity: z.number().int(),
      status: z.string(),
      /** How many can go in a new shipment now: ready and not already shipped (OPS-FR-070). */
      shippable: z.number().int(),
      shipped: z.number().int(),
    }),
  ),
  shipments: z.array(adminShipmentSchema),
});
export type OrderShipping = z.infer<typeof orderShippingSchema>;

export const createShipmentSchema = z.object({
  items: z.array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().min(1) })).min(1, "Choose at least one item to ship"),
  carrier: z.string().trim().max(120).default(""),
  trackingNumber: z.string().trim().max(120).default(""),
  destination: z.string().trim().min(1, "Enter the destination").max(300),
});

export const updateShipmentSchema = z.object({
  status: shipmentStatusSchema,
  version: z.number().int(),
  note: z.string().trim().max(500).optional(),
  carrier: z.string().trim().max(120).optional(),
  trackingNumber: z.string().trim().max(120).optional(),
});

/** Book a shipment with Shipbubble (T08-06). */
export const bookCourierSchema = z.object({ version: z.number().int() });

/* ---- Reorder (Pen 128) ---- */

export const reorderCheckSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  position: z.number().int(),
  productName: z.string(),
  quantity: z.number().int(),
  /** Each part of what was made, and whether it's still available unchanged (FUL-FR-061). */
  rows: z.array(z.object({ label: z.string(), same: z.boolean(), note: z.string().nullable() })),
  exact: z.object({ available: z.boolean(), reason: z.string().nullable() }),
  /** Whether an exact reorder skips the proof (OPS-FR-018). */
  proof: z.enum(["SKIPPED", "REQUIRED"]),
  /** Today's price for the same thing, when it can be priced. */
  priceMinor: minor.nullable(),
  /** Reorder with changes is offered for every catalogue item (FUL-FR-062). */
  withChanges: z.boolean(),
});
export type ReorderCheck = z.infer<typeof reorderCheckSchema>;

export const reorderSchema = z.object({ mode: z.enum(["EXACT", "WITH_CHANGES"]) });
export const reorderResultSchema = z.object({ configurationId: z.string(), next: z.string() });

/* ---- Problem reports (Pen 129) ---- */

export const problemTypeSchema = z.enum(["DAMAGED", "MISSING_OR_SHORT", "WRONG_ITEM_OR_SIZE", "INCORRECT_PRINTING", "QUALITY"]);
export const PROBLEM_TYPE_LABEL: Record<z.infer<typeof problemTypeSchema>, string> = {
  DAMAGED: "Damaged item",
  MISSING_OR_SHORT: "Missing items or short quantity",
  WRONG_ITEM_OR_SIZE: "Wrong item or size",
  INCORRECT_PRINTING: "Incorrect printing or customization",
  QUALITY: "Quality problem",
};
export const problemStatusSchema = z.enum(["NEW", "TRIAGED", "CLOSED"]);

export const newProblemSchema = z.object({
  itemPosition: z.number().int().min(1),
  type: problemTypeSchema,
  quantity: z.number().int().min(1, "Say how many are affected"),
  description: z.string().trim().min(1, "Tell us what happened").max(4000),
  photoFileIds: z.array(z.string().uuid()).max(10).default([]),
});

export const customerProblemSchema = z.object({
  id: z.string(),
  number: z.string(),
  status: problemStatusSchema,
  type: problemTypeSchema,
  item: z.string(),
  quantity: z.number().int(),
  createdAt: isoDate,
});

export const adminProblemSchema = customerProblemSchema.extend({
  orderId: z.string(),
  orderNumber: z.string(),
  ordered: z.number().int(),
  customerName: z.string(),
  description: z.string(),
  triageNote: z.string().nullable(),
  version: z.number().int(),
  photos: z.array(z.object({ id: z.string(), name: z.string() })),
  replies: z.array(z.object({ body: z.string(), by: z.string(), at: isoDate })),
});
export type AdminProblem = z.infer<typeof adminProblemSchema>;
export const adminProblemListSchema = z.object({ items: z.array(adminProblemSchema) });

export const triageProblemSchema = z.object({
  version: z.number().int(),
  status: z.enum(["TRIAGED", "CLOSED"]),
  triageNote: z.string().trim().max(4000).optional(),
});
export const problemReplySchema = z.object({ body: z.string().trim().min(1, "Write a reply").max(4000) });
