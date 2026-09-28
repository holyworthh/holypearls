import { z } from "zod";
import { priceResultSchema } from "./pricing.js";

/* Configuration drafts (T03-03, COM-FR-010–014) and garments (T03-05, COM-FR-020–029, 050–054). */

export const GARMENT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
export const sourcingSchema = z.enum(["SOURCE_CUSTOMIZE", "MAKE_FROM_SCRATCH", "CUSTOMER_SUPPLIED", "HELP_ME_CHOOSE"]);
export const decorationSchema = z.enum(["EMBROIDERY", "PRINT", "BOTH", "RECOMMEND"]);
export const positionSchema = z.enum(["LEFT_CHEST", "RIGHT_CHEST", "CENTRE_CHEST", "FULL_FRONT", "UPPER_BACK", "FULL_BACK", "LEFT_SLEEVE", "RIGHT_SLEEVE", "CUSTOM"]);
export const placementSchema = z.object({
  position: positionSchema,
  size: z.enum(["SMALL", "STANDARD", "LARGE"]),
  method: decorationSchema.nullable(),
  note: z.string().trim().max(120).nullable(),
});
export type PlacementInput = z.infer<typeof placementSchema>;
export const artworkChoiceSchema = z.enum(["UPLOAD", "LOGO", "REFERENCE", "DESIGN_HELP", "LATER"]);

/** Sourcing details (COM-FR-021–023): plain answers, kept with the draft. */
export const garmentDetailsSchema = z
  .object({
    garmentType: z.string().trim().max(60),
    fit: z.string().trim().max(60),
    fabric: z.string().trim().max(60),
    colour: z.string().trim().max(60),
    reference: z.string().trim().max(500),
    labels: z.string().trim().max(200),
    sampleFirst: z.boolean(),
    suppliedItems: z.string().trim().max(500),
    receiveMethod: z.enum(["DROP_OFF", "PICKUP", "COURIER"]),
  })
  .partial();

/** Answers for other product families and delivery (T03-08, COM-FR-045–047, 060, 070–072). */
export const detailsSchema = garmentDetailsSchema.extend({
  sizeMode: z.enum(["STANDARD", "CUSTOM"]),
  widthCm: z.number().positive().max(10_000),
  heightCm: z.number().positive().max(10_000),
  /** The unit the customer typed in; sizes are stored in centimetres. */
  sizeUnit: z.enum(["CM", "M", "IN"]),
  service: z.enum(["PRINT_ONLY", "DELIVERED", "INSTALLATION"]),
  installSite: z.string().trim().max(200),
  installSurface: z.string().trim().max(100),
  installHeightM: z.number().min(0).max(200),
  installAccess: z.string().trim().max(200),
  installDate: z.iso.date(),
  packagingType: z.enum(["STANDARD", "CUSTOM"]),
  /** Custom structure (COM-FR-046): dimensions, use, material, closure, handles, insert, sample. */
  packagingSpec: z.string().trim().max(500),
  packagingUse: z.string().trim().max(200),
  packagingMaterial: z.string().trim().max(120),
  packagingClosure: z.string().trim().max(120),
  packagingHandles: z.string().trim().max(120),
  packagingInsert: z.string().trim().max(120),
  packagingSample: z.boolean(),
  promoSource: z.enum(["CATALOGUE", "SOURCE_SIMILAR"]),
  similarItem: z.string().trim().max(500),
  garmentOwner: z.enum(["OURS", "CUSTOMER"]),
  destination: z.enum(["LAGOS", "NIGERIA", "INTERNATIONAL"]),
  city: z.string().trim().max(80),
  country: z.string().trim().max(80),
  deadline: z.iso.date(),
}).partial();
export type ConfigurationDetails = z.infer<typeof detailsSchema>;

const days = z.object({ min: z.number().int(), max: z.number().int() });
export const timingSchema = z.object({
  production: days.nullable(),
  transit: days.nullable(),
  transitQuoted: z.boolean(),
  expectedBy: z.string().nullable(),
  verdict: z.enum(["NO_DEADLINE", "ON_TIME", "RUSH_NEEDED", "REVIEW"]),
  suggestedRush: z.enum(["STANDARD", "RUSH", "PRIORITY"]).nullable(),
  message: z.string().nullable(),
});

const key = z.string().max(60);

export const configurationSchema = z.object({
  id: z.string(),
  productSlug: z.string(),
  productName: z.string(),
  family: z.string(),
  status: z.enum(["DRAFT", "IN_CART", "QUOTE_REQUESTED", "ABANDONED"]),
  choices: z.record(z.string(), z.string()),
  quantity: z.number().int().nullable(),
  rush: z.enum(["STANDARD", "RUSH", "PRIORITY"]),
  artwork: artworkChoiceSchema.nullable(),
  step: z.string(),
  version: z.number().int(),
  price: priceResultSchema.nullable(),
  /** A draft link was emailed to this address (masked). */
  emailedTo: z.string().nullable(),
  /** Garment answers; null for other products. */
  garment: z
    .object({
      sourcing: sourcingSchema.nullable(),
      decoration: decorationSchema.nullable(),
      details: garmentDetailsSchema,
      sizesUnknown: z.boolean(),
      sizes: z.array(z.object({ size: z.string(), quantity: z.number().int() })),
      placements: z.array(placementSchema),
      conflicts: z.array(
        z.object({
          positions: z.array(positionSchema),
          message: z.string(),
          fixes: z.array(z.object({ label: z.string(), position: positionSchema, change: z.record(z.string(), z.unknown()) })),
        }),
      ),
      personalization: z.object({ count: z.number().int(), preview: z.array(z.object({ row: z.number().int(), name: z.string().nullable(), number: z.string().nullable(), department: z.string().nullable(), size: z.string().nullable() })) }),
    })
    .nullable(),
  files: z.array(
    z.object({
      id: z.string(),
      fileId: z.string(),
      role: z.enum(["ARTWORK", "LOGO", "REFERENCE", "GARMENT_PHOTO"]),
      name: z.string(),
      status: z.string(),
      lowResolution: z.object({ neededPixels: z.number().int(), actualPixels: z.number().int().nullable(), message: z.string() }).nullable(),
      lowResolutionAction: z.enum(["REPLACE", "CLEANUP", "REVIEW"]).nullable(),
    }),
  ),
  /** Family and delivery answers (all products). */
  details: detailsSchema,
  timing: timingSchema,
  /** The quote request made from this design, once requested (COM-FR-061). */
  quote: z.object({ reference: z.string(), status: z.string() }).nullable(),
  /** Send-later is allowed for this product (COM-FR-050). */
  artworkLaterAllowed: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type Configuration = z.infer<typeof configurationSchema>;

export const createConfigurationSchema = z.object({
  productSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  choices: z.record(key, key).optional(),
  quantity: z.number().int().min(1).max(10_000_000).optional(),
});

/** Send the version you started from (TECH-02 §5). A null choice clears that answer. */
export const updateConfigurationSchema = z.object({
  version: z.number().int().positive(),
  choices: z.record(key, key.nullable()).optional(),
  quantity: z.number().int().min(1).max(10_000_000).nullable().optional(),
  rush: z.enum(["STANDARD", "RUSH", "PRIORITY"]).optional(),
  artwork: artworkChoiceSchema.nullable().optional(),
  step: z.enum(["product", "options", "customize", "quantity", "artwork", "delivery", "review"]).optional(),
  sourcing: sourcingSchema.nullable().optional(),
  decoration: decorationSchema.nullable().optional(),
  details: detailsSchema.optional(),
  sizesUnknown: z.boolean().optional(),
  sizes: z.array(z.object({ size: z.enum(GARMENT_SIZES), quantity: z.number().int().min(0).max(100_000) })).max(GARMENT_SIZES.length).optional(),
  placements: z.array(placementSchema).max(9).optional(),
  /** After the customer has seen which later answers a change removes (COM-FR-011). */
  confirmRemovals: z.boolean().default(false),
});

/** A later answer that an earlier change would remove, with why. */
export const answerConflictSchema = z.object({ option: z.string(), value: z.string(), message: z.string() });
export type AnswerConflict = z.infer<typeof answerConflictSchema>;

export const emailDraftSchema = z.object({ email: z.email("Enter a valid email address").max(254) });

/** What the product page's configurator needs (options, quantities, rules the browser can check early). */
export const configuratorSchema = z.object({
  options: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      required: z.boolean(),
      values: z.array(z.object({ key: z.string(), label: z.string(), isDefault: z.boolean() })),
    }),
  ),
  moq: z.number().int(),
  maxAutoQuantity: z.number().int().nullable(),
  leadDays: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
  /** Standard quantity buttons with their per-unit price at the default choices (COM-FR-043). */
  quantityPresets: z.array(z.object({ quantity: z.number().int(), perUnitMinor: z.string().nullable() })),
  /** Combinations that can't be produced, blocked before Review (COM-FR-042). */
  blocked: z.array(z.object({ ifOption: z.string(), ifValue: z.string(), thenOption: z.string(), thenValues: z.array(z.string()), message: z.string() })),
  currency: z.enum(["NGN", "USD"]).nullable(),
  fromPerUnitMinor: z.string().nullable(),
});
export type Configurator = z.infer<typeof configuratorSchema>;

export const attachConfigurationFileSchema = z.object({ fileId: z.uuid(), role: z.enum(["ARTWORK", "LOGO", "REFERENCE", "GARMENT_PHOTO"]) });
export const lowResolutionActionSchema = z.object({ action: z.enum(["REPLACE", "CLEANUP", "REVIEW"]) });
export const personalizationImportSchema = z.object({ fileId: z.uuid() });
export const personalizationResultSchema = z.object({
  accepted: z.boolean(),
  count: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), field: z.string(), message: z.string() })),
});

/** Request Final Quote (COM-FR-061): every choice is kept; contact details go with it. */
export const quoteRequestSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
  name: z.string().trim().min(1, "Enter your name").max(120),
  phone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(2_000).optional(),
});
export const quoteRequestResultSchema = z.object({ reference: z.string(), status: z.literal("PENDING_REVIEW") });
