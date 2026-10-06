import { z } from "zod";

/*
 * Product rules, prices, VAT and price calculation (T03-01). Amounts travel as
 * strings of whole minor units (bigint isn't JSON, TECH-05 §2); percentages
 * are basis points (7.5% = 750).
 */

const minor = z.string().regex(/^\d{1,15}$/, "Enter a whole number of minor units");
const bps = z.number().int().min(0).max(100_000);
const key = z.string().trim().min(1).max(60);

export const productRulesSchema = z
  .object({
    moq: z.number().int().min(1).max(1_000_000),
    belowMoq: z.enum(["BLOCK", "MANUAL_REVIEW", "SURCHARGE"]),
    belowMoqSurchargeBps: bps,
    maxAutoQuantity: z.number().int().min(1).max(10_000_000).nullable(),
    leadMinDays: z.number().int().min(0).max(365),
    leadMaxDays: z.number().int().min(0).max(365),
    rush: z.enum(["NONE", "AVAILABLE", "MANUAL_REVIEW"]),
    rushSurchargeBps: bps,
    priorityRush: z.enum(["NONE", "AVAILABLE", "MANUAL_REVIEW"]),
    priorityRushSurchargeBps: bps,
    artworkLater: z.boolean(),
    sample: z.enum(["NOT_OFFERED", "OPTIONAL", "RECOMMENDED", "REQUIRED"]),
    sampleMultiplierBps: bps,
    sampleMinimumMinor: minor,
    proof: z.enum(["NOT_REQUIRED", "OPTIONAL", "REQUIRED"]),
    proofSkippableOnReorder: z.boolean(),
  })
  .refine((rules) => rules.leadMaxDays >= rules.leadMinDays, { message: "The longest lead time can't be shorter than the shortest", path: ["leadMaxDays"] })
  .refine((rules) => rules.maxAutoQuantity === null || rules.maxAutoQuantity >= rules.moq, {
    message: "The automatic limit can't be below the minimum order",
    path: ["maxAutoQuantity"],
  });
export type ProductRules = z.infer<typeof productRulesSchema>;

export const adminProductRulesSchema = z.object({
  productId: z.string(),
  rules: productRulesSchema.nullable(),
  version: z.number().int(),
  compatibility: z.array(
    z.object({
      ifOption: z.string(),
      ifValue: z.string(),
      thenOption: z.string(),
      thenValues: z.array(z.string()),
      effect: z.enum(["NOT_ALLOWED", "NEEDS_REVIEW"]),
      message: z.string(),
    }),
  ),
});
export type AdminProductRules = z.infer<typeof adminProductRulesSchema>;

/** Version 0 creates the rules for a product that has none. */
export const saveProductRulesSchema = z.object({ rules: productRulesSchema, version: z.number().int().min(0) });

export const compatibilityRuleSchema = z.object({
  ifOption: key,
  ifValue: key,
  thenOption: key,
  thenValues: z.array(key).min(1).max(20),
  effect: z.enum(["NOT_ALLOWED", "NEEDS_REVIEW"]),
  message: z.string().trim().min(1, "Explain the rule to the customer").max(200),
});
/** The whole set is replaced; saving bumps the product rules' version so calculations record it. */
export const saveCompatibilitySchema = z.object({ rules: z.array(compatibilityRuleSchema).max(50), version: z.number().int().min(1) });

export const priceRuleInputSchema = z
  .object({
    effectiveFrom: z.iso.datetime({ offset: true }),
    currency: z.enum(["NGN", "USD"]),
    basis: z.enum(["PER_UNIT", "PER_PACK", "FIXED"]),
    packSize: z.number().int().min(1).max(100_000),
    baseMinor: minor,
    tiers: z.array(z.object({ minQuantity: z.number().int().min(2).max(10_000_000), amountMinor: minor })).max(20),
    addOns: z.array(z.object({ option: key, value: key, per: z.enum(["UNIT", "ORDER"]), amountMinor: minor })).max(50),
    state: z.enum(["PRICE_READY", "ESTIMATE_READY"]),
    includesVat: z.boolean(),
    note: z.string().trim().max(300).nullable(),
  })
  .refine((rule) => new Set(rule.tiers.map((tier) => tier.minQuantity)).size === rule.tiers.length, {
    message: "Each tier needs a different starting quantity",
    path: ["tiers"],
  });

export const adminPriceRuleSchema = z.object({
  id: z.string(),
  productId: z.string(),
  effectiveFrom: z.iso.datetime(),
  currency: z.enum(["NGN", "USD"]),
  basis: z.enum(["PER_UNIT", "PER_PACK", "FIXED"]),
  packSize: z.number().int(),
  baseMinor: z.string(),
  tiers: z.array(z.object({ minQuantity: z.number().int(), amountMinor: z.string() })),
  addOns: z.array(z.object({ option: z.string(), value: z.string(), per: z.enum(["UNIT", "ORDER"]), amountMinor: z.string() })),
  state: z.enum(["PRICE_READY", "ESTIMATE_READY"]),
  includesVat: z.boolean(),
  note: z.string().nullable(),
  /** The rule in force now; later ones are scheduled, earlier ones are history. */
  current: z.boolean(),
  createdAt: z.iso.datetime(),
});
export const adminPriceRuleListSchema = z.object({ entries: z.array(adminPriceRuleSchema) });

export const taxSettingInputSchema = z.object({
  effectiveFrom: z.iso.datetime({ offset: true }),
  vatRateBps: z.number().int().min(0).max(10_000),
  vatOnDelivery: z.boolean(),
  note: z.string().trim().max(300).nullable(),
});
export const adminTaxSettingSchema = taxSettingInputSchema.extend({ id: z.string(), current: z.boolean(), createdAt: z.iso.datetime(), effectiveFrom: z.iso.datetime() });
export const adminTaxSettingListSchema = z.object({ entries: z.array(adminTaxSettingSchema) });

/** What a customer (or later the configurator) sends to price a configuration. */
export const priceRequestSchema = z.object({
  choices: z.record(z.string().max(60), z.string().max(60)).refine((value) => Object.keys(value).length <= 30, "Too many choices"),
  quantity: z.number().int().min(1).max(10_000_000),
  rush: z.enum(["STANDARD", "RUSH", "PRIORITY"]).default("STANDARD"),
  sample: z.boolean().default(false),
});

export const priceReasonSchema = z.object({ code: z.string(), message: z.string(), blocking: z.boolean() });

/** A calculation result on the wire: amounts as strings, null when there is no automatic price. */
export const priceResultSchema = z.object({
  id: z.string(),
  state: z.enum(["PRICE_READY", "ESTIMATE_READY", "QUOTE_REQUIRED", "CONSULTATION_REQUIRED"]),
  valid: z.boolean(),
  currency: z.enum(["NGN", "USD"]).nullable(),
  quantity: z.number().int(),
  lines: z.array(z.object({ label: z.string(), amountMinor: z.string() })),
  goodsMinor: z.string().nullable(),
  deliveryMinor: z.string().nullable(),
  vatMinor: z.string().nullable(),
  totalMinor: z.string().nullable(),
  perUnitMinor: z.string().nullable(),
  vatRateBps: z.number().int().nullable(),
  leadDays: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
  proof: z.enum(["NOT_REQUIRED", "OPTIONAL", "REQUIRED"]).nullable(),
  artworkLater: z.boolean().nullable(),
  reasons: z.array(priceReasonSchema),
  ruleVersions: z.object({ priceRuleId: z.string().nullable(), productRulesVersion: z.number().int().nullable(), taxSettingId: z.string().nullable() }),
});
export type PriceResult = z.infer<typeof priceResultSchema>;

/* ——— Courier prices through Shipbubble (T08-05) ——— */

export const courierRuleSchema = z.enum(["CHEAPEST", "FASTEST"]);
export const courierSettingsInputSchema = z.object({
  enabled: z.boolean(),
  rule: courierRuleSchema,
  categoryId: z.number().int().positive("Choose what HolyPearls ships"),
  pickup: z.object({
    name: z.string().trim().min(1, "Enter the pickup contact's name").max(120),
    email: z.email("Enter a valid email address").max(254),
    phone: z.string().trim().min(7, "Enter a phone number").max(40),
    address: z.string().trim().min(10, "Enter the full pickup address, with area and state").max(300),
  }),
  version: z.number().int(),
});
export const courierSettingsSchema = z.object({
  enabled: z.boolean(),
  rule: courierRuleSchema,
  categoryId: z.number().int().nullable(),
  pickup: z.object({ name: z.string(), email: z.string(), phone: z.string(), address: z.string(), addressCode: z.number().int() }).nullable(),
  /** False when no Shipbubble key is set: checkout falls back to staff pricing. */
  available: z.boolean(),
  version: z.number().int(),
});
export const courierCategoriesSchema = z.object({ categories: z.array(z.object({ id: z.number().int(), name: z.string() })) });
export type CourierSettings = z.infer<typeof courierSettingsSchema>;
