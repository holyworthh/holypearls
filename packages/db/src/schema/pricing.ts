import { sql } from "drizzle-orm";
import { bigint, boolean, char, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt, versionColumn } from "../columns.js";
import { products } from "./catalogue.js";
import { staffProfiles } from "./identity.js";

const at = (name: string) => timestamp(name, { withTimezone: true });

/*
 * Product rules, prices and VAT (T03-01; TECH-01 §2 catalogue; OPS-FR-010–019).
 * Money is whole minor units plus a currency; percentages are basis points
 * (7.5% = 750). Price rules and tax settings are insert-only with an
 * effective date, so a past calculation can always name the rules it used.
 */

export const belowMoqBehaviour = pgEnum("below_moq_behaviour", ["BLOCK", "MANUAL_REVIEW", "SURCHARGE"]);
export const rushAvailability = pgEnum("rush_availability", ["NONE", "AVAILABLE", "MANUAL_REVIEW"]);
export const sampleRule = pgEnum("sample_rule", ["NOT_OFFERED", "OPTIONAL", "RECOMMENDED", "REQUIRED"]);
export const proofRule = pgEnum("proof_rule", ["NOT_REQUIRED", "OPTIONAL", "REQUIRED"]);
export const priceBasis = pgEnum("price_basis", ["PER_UNIT", "PER_PACK", "FIXED"]);
export const priceRuleState = pgEnum("price_rule_state", ["PRICE_READY", "ESTIMATE_READY"]);
export const vatMode = pgEnum("vat_mode", ["EXCLUSIVE", "INCLUSIVE"]);

/** One row per product; edited in place with a version (audited). */
export const productRules = pgTable(
  "product_rules",
  {
    productId: uuid("product_id")
      .primaryKey()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Minimum order quantity (OPS-FR-011). */
    moq: integer("moq").notNull().default(1),
    belowMoq: belowMoqBehaviour("below_moq").notNull().default("BLOCK"),
    /** Small-run surcharge in basis points, used when below_moq is SURCHARGE. */
    belowMoqSurchargeBps: integer("below_moq_surcharge_bps").notNull().default(0),
    /** Above this quantity the price becomes QUOTE_REQUIRED; null means no limit. */
    maxAutoQuantity: integer("max_auto_quantity"),
    /** Standard lead time in working days (OPS-FR-012). */
    leadMinDays: integer("lead_min_days").notNull().default(1),
    leadMaxDays: integer("lead_max_days").notNull().default(5),
    rush: rushAvailability("rush").notNull().default("NONE"),
    rushSurchargeBps: integer("rush_surcharge_bps").notNull().default(0),
    priorityRush: rushAvailability("priority_rush").notNull().default("NONE"),
    priorityRushSurchargeBps: integer("priority_rush_surcharge_bps").notNull().default(0),
    /** Artwork can be sent after ordering (OPS-FR-016). */
    artworkLater: boolean("artwork_later").notNull().default(true),
    sample: sampleRule("sample").notNull().default("NOT_OFFERED"),
    /** Sample price: the larger of unit price × multiplier and the minimum (OPS-FR-017). */
    sampleMultiplierBps: integer("sample_multiplier_bps").notNull().default(10_000),
    sampleMinimumMinor: bigint("sample_minimum_minor", { mode: "bigint" }).notNull().default(sql`0`),
    proof: proofRule("proof").notNull().default("REQUIRED"),
    /** An exact reorder of an approved design can skip the proof (OPS-FR-018). */
    proofSkippableOnReorder: boolean("proof_skippable_on_reorder").notNull().default(true),
    version: versionColumn(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("product_rules_moq_positive", sql`${table.moq} >= 1`),
    check("product_rules_lead_order", sql`${table.leadMinDays} >= 0 and ${table.leadMaxDays} >= ${table.leadMinDays}`),
    check("product_rules_bps_range", sql`${table.belowMoqSurchargeBps} between 0 and 100000 and ${table.rushSurchargeBps} between 0 and 100000 and ${table.priorityRushSurchargeBps} between 0 and 100000`),
    check("product_rules_max_auto", sql`${table.maxAutoQuantity} is null or ${table.maxAutoQuantity} >= ${table.moq}`),
  ],
);

/** Which choices work together (OPS-FR-013). Replaced as a set, with the product rules' version. */
export const compatibilityEffect = pgEnum("compatibility_effect", ["NOT_ALLOWED", "NEEDS_REVIEW"]);
export const compatibilityRules = pgTable(
  "compatibility_rules",
  {
    id: idColumn(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** When this option has this value… */
    ifOption: text("if_option").notNull(),
    ifValue: text("if_value").notNull(),
    /** …this option can't have (or needs review for) these values. */
    thenOption: text("then_option").notNull(),
    thenValues: text("then_values").array().notNull(),
    effect: compatibilityEffect("effect").notNull(),
    /** What the customer reads, for example "Soft-touch lamination isn't available on 350gsm gloss." */
    message: text("message").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("compatibility_rules_product_idx").on(table.productId)],
);

/**
 * A product's price from a date (OPS-FR-010). Insert-only: a change is a new
 * row with a later effective_from; the calculation uses the latest row that
 * has started.
 */
export const priceRules = pgTable(
  "price_rules",
  {
    id: idColumn(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    effectiveFrom: at("effective_from").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("NGN"),
    basis: priceBasis("basis").notNull(),
    /** PER_PACK: how many units one pack price covers (for example 100 business cards). */
    packSize: integer("pack_size").notNull().default(1),
    /** PER_UNIT and PER_PACK: price below the first tier; FIXED: the whole price. */
    baseMinor: bigint("base_minor", { mode: "bigint" }).notNull(),
    /** Quantity tiers: [{ minQuantity, amountMinor }], amount per unit or per pack like the base. */
    tiers: jsonb("tiers").notNull().default(sql`'[]'::jsonb`),
    /** Option add-ons: [{ option, value, per: "UNIT" | "ORDER", amountMinor }]. */
    addOns: jsonb("add_ons").notNull().default(sql`'[]'::jsonb`),
    /** PRICE_READY charges this price; ESTIMATE_READY shows it as an estimate to confirm (OPS-FR-015). */
    state: priceRuleState("state").notNull(),
    /** Catalogue prices include VAT when true (OPS-FR-019). */
    includesVat: boolean("includes_vat").notNull().default(false),
    note: text("note"),
    createdByStaffId: uuid("created_by_staff_id").references(() => staffProfiles.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("price_rules_product_effective_unique").on(table.productId, table.effectiveFrom),
    check("price_rules_pack_size", sql`${table.packSize} >= 1`),
    check("price_rules_base_nonnegative", sql`${table.baseMinor} >= 0`),
  ],
);

/** VAT rate from a date (OPS-FR-019). Insert-only like price rules. */
export const taxSettings = pgTable(
  "tax_settings",
  {
    id: idColumn(),
    effectiveFrom: at("effective_from").notNull(),
    vatRateBps: integer("vat_rate_bps").notNull(),
    /** Whether VAT is charged on delivery as well as goods. */
    vatOnDelivery: boolean("vat_on_delivery").notNull().default(true),
    note: text("note"),
    createdByStaffId: uuid("created_by_staff_id").references(() => staffProfiles.id),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("tax_settings_effective_unique").on(table.effectiveFrom), check("tax_settings_rate_range", sql`${table.vatRateBps} between 0 and 10000`)],
);

/**
 * Saved result of one price calculation, with the rule versions it used
 * (TECH-01 §2 configuration). Insert-only. Carts and quotes keep their own
 * snapshots; unreferenced results are cleaned up after 30 days.
 */
export const priceResults = pgTable(
  "price_results",
  {
    id: idColumn(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    input: jsonb("input").notNull(),
    result: jsonb("result").notNull(),
    state: text("state").notNull(),
    currency: char("currency", { length: 3 }),
    totalMinor: bigint("total_minor", { mode: "bigint" }),
    priceRuleId: uuid("price_rule_id").references(() => priceRules.id),
    productRulesVersion: integer("product_rules_version"),
    taxSettingId: uuid("tax_setting_id").references(() => taxSettings.id),
    createdAt: createdAt(),
  },
  (table) => [index("price_results_created_idx").on(table.createdAt)],
);

export const deliveryZoneKind = pgEnum("delivery_zone_kind", ["AREA", "REST_OF_NIGERIA", "INTERNATIONAL"]);
export const deliveryPricing = pgEnum("delivery_pricing", ["FIXED", "QUOTE"]);

/**
 * Delivery zones and rates (T04-01, OPS-FR-100–101, Pen 108). An AREA zone
 * covers whole states or single LGAs; every Nigerian address resolves to
 * exactly one zone (an LGA match beats a whole-state match, and anything not
 * covered falls to the REST_OF_NIGERIA zone). INTERNATIONAL is freight by
 * quote. Checkouts copy the rate they used, so changing a rate never changes
 * an existing checkout.
 */
export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: idColumn(),
    name: text("name").notNull(),
    kind: deliveryZoneKind("kind").notNull().default("AREA"),
    /** For AREA zones: `{ state, lga }` pairs; `lga: null` covers the whole state. */
    covers: jsonb("covers").notNull().default([]),
    pricing: deliveryPricing("pricing").notNull(),
    /** NGN kobo, before VAT; null when pricing is QUOTE. */
    rateMinor: bigint("rate_minor", { mode: "bigint" }),
    /** Working days in transit, shown separately from production time (COM-FR-070). */
    transitMinDays: integer("transit_min_days"),
    transitMaxDays: integer("transit_max_days"),
    position: integer("position").notNull().default(0),
    version: versionColumn(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("delivery_zones_name_unique").on(sql`lower(${table.name})`),
    uniqueIndex("delivery_zones_rest_unique").on(table.kind).where(sql`${table.kind} <> 'AREA'`),
    check("delivery_zones_rate", sql`(${table.pricing} = 'FIXED' and ${table.rateMinor} >= 0) or (${table.pricing} = 'QUOTE' and ${table.rateMinor} is null)`),
  ],
);

/**
 * Courier prices through Shipbubble (T08-05). One row. The pickup address is
 * checked with the courier when saved, and its code kept for rate requests.
 */
export const courierSettings = pgTable("courier_settings", {
  id: idColumn(),
  enabled: boolean("enabled").notNull().default(false),
  /** Which courier a checkout gets: the cheapest or the fastest that collects from the workshop. */
  rule: text("rule").notNull().default("CHEAPEST"),
  /** Shipbubble's package category for HolyPearls' goods. */
  categoryId: integer("category_id"),
  /** { name, email, phone, address, addressCode }. */
  pickup: jsonb("pickup"),
  version: versionColumn(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
