import { z } from "zod";
import { priceResultSchema } from "./pricing.js";

/* Configuration drafts (T03-03, COM-FR-010–014). */

const key = z.string().max(60);

export const configurationSchema = z.object({
  id: z.string(),
  productSlug: z.string(),
  productName: z.string(),
  status: z.enum(["DRAFT", "IN_CART", "QUOTE_REQUESTED", "ABANDONED"]),
  choices: z.record(z.string(), z.string()),
  quantity: z.number().int().nullable(),
  rush: z.enum(["STANDARD", "RUSH", "PRIORITY"]),
  artwork: z.enum(["UPLOAD", "DESIGN_HELP", "LATER"]).nullable(),
  step: z.string(),
  version: z.number().int(),
  price: priceResultSchema.nullable(),
  /** A draft link was emailed to this address (masked). */
  emailedTo: z.string().nullable(),
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
  artwork: z.enum(["UPLOAD", "DESIGN_HELP", "LATER"]).nullable().optional(),
  step: z.enum(["options", "quantity", "artwork", "delivery", "review"]).optional(),
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
