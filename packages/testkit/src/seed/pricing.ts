import { and, eq, schema, type Transaction } from "@holypearls/db";

/*
 * Pricing TEST DATA (T03-01) from the Stage 1.4 seed sheet: starting prices,
 * MOQ, lead times, rush, proof and sample rules per product, and the Business
 * Rules tab (VAT 7.5% exclusive, rush 25%, priority rush 50%, sample 1.5× or
 * ₦25,000). Tiers and add-ons marked "illustrative" aren't in the sheet; they
 * exist so the calculator has something to show and must be replaced by real
 * prices before launch.
 */

const EFFECTIVE = new Date("2026-01-01T00:00:00Z");
const naira = (amount: number) => (BigInt(Math.round(amount * 100))).toString();

type Rules = Partial<typeof schema.productRules.$inferInsert> & { moq: number; leadMinDays: number; leadMaxDays: number };
type Price = {
  basis: "PER_UNIT" | "PER_PACK" | "FIXED";
  packSize?: number;
  base: number;
  tiers?: [number, number][];
  addOns?: [option: string, value: string, per: "UNIT" | "ORDER", amount: number][];
  state: "PRICE_READY" | "ESTIMATE_READY";
  note: string;
};

const COMMON = { rush: "AVAILABLE", rushSurchargeBps: 2_500, priorityRush: "MANUAL_REVIEW", priorityRushSurchargeBps: 5_000, proof: "REQUIRED" } as const;
const SAMPLE = { sample: "OPTIONAL", sampleMultiplierBps: 15_000, sampleMinimumMinor: 2_500_000n } as const;

const PRICING: Record<string, { rules: Rules; price: Price | null }> = {
  "polo-shirt": {
    rules: { ...COMMON, ...SAMPLE, moq: 10, belowMoq: "SURCHARGE", belowMoqSurchargeBps: 3_000, leadMinDays: 3, leadMaxDays: 7 },
    price: { basis: "PER_UNIT", base: 8_500, tiers: [[50, 8_000], [100, 7_500]], state: "ESTIMATE_READY", note: "Stage 1.4: from ₦8,500 per piece. Tiers illustrative." },
  },
  "heat-transfer-printing": {
    rules: { ...COMMON, moq: 5, belowMoq: "SURCHARGE", belowMoqSurchargeBps: 3_000, leadMinDays: 3, leadMaxDays: 5 },
    price: { basis: "PER_UNIT", base: 2_500, addOns: [["placement", "full-back", "UNIT", 1_500]], state: "ESTIMATE_READY", note: "Stage 1.4: from ₦2,500 per standard placement. Full-back add-on illustrative." },
  },
  "flat-embroidery": {
    rules: { ...COMMON, ...SAMPLE, moq: 5, belowMoq: "SURCHARGE", belowMoqSurchargeBps: 3_000, leadMinDays: 3, leadMaxDays: 7 },
    price: { basis: "PER_UNIT", base: 2_500, state: "ESTIMATE_READY", note: "Stage 1.4: from ₦2,500 per placement; digitisation from ₦5,000 is quoted." },
  },
  "business-cards": {
    rules: { ...COMMON, moq: 100, belowMoq: "BLOCK", leadMinDays: 2, leadMaxDays: 5 },
    price: {
      basis: "PER_PACK",
      packSize: 100,
      base: 15_000,
      tiers: [[500, 13_000], [1_000, 11_000]],
      addOns: [["paper", "400gsm-soft-touch", "UNIT", 30], ["finish", "foil", "ORDER", 5_000], ["finish", "spot-uv", "ORDER", 4_000]],
      state: "PRICE_READY",
      note: "Stage 1.4: ₦15,000 per 100 double-sided. Tiers and soft-touch add-on illustrative.",
    },
  },
  "roll-up-banner": {
    rules: { ...COMMON, moq: 1, leadMinDays: 1, leadMaxDays: 4 },
    price: { basis: "PER_UNIT", base: 55_000, addOns: [["size", "100-200-cm", "UNIT", 10_000], ["size", "120-200-cm", "UNIT", 20_000]], state: "PRICE_READY", note: "Stage 1.4: ₦55,000 per unit, small base. Larger sizes illustrative." },
  },
  "small-paper-bag": {
    rules: { ...COMMON, ...SAMPLE, moq: 100, belowMoq: "MANUAL_REVIEW", leadMinDays: 5, leadMaxDays: 10 },
    price: { basis: "PER_UNIT", base: 1_000, tiers: [[500, 850]], state: "ESTIMATE_READY", note: "Stage 1.4: ₦1,000 per piece at MOQ. Tier illustrative." },
  },
  "label-sticker": {
    rules: { ...COMMON, moq: 100, belowMoq: "BLOCK", leadMinDays: 2, leadMaxDays: 5 },
    price: { basis: "PER_PACK", packSize: 100, base: 15_000, tiers: [[1_000, 12_000]], state: "PRICE_READY", note: "Stage 1.4: ₦15,000 per 100. Tier illustrative." },
  },
  "standard-mug": {
    rules: { ...COMMON, moq: 10, belowMoq: "BLOCK", leadMinDays: 3, leadMaxDays: 7 },
    price: { basis: "PER_UNIT", base: 4_500, tiers: [[50, 4_000]], state: "PRICE_READY", note: "Stage 1.4: ₦4,500 per piece. Tier illustrative." },
  },
  "landscape-canvas": {
    rules: { ...COMMON, moq: 1, leadMinDays: 3, leadMaxDays: 7 },
    price: { basis: "PER_UNIT", base: 18_000, addOns: [["size", "60-40-cm", "UNIT", 7_000], ["size", "90-60-cm", "UNIT", 16_000]], state: "PRICE_READY", note: "Stage 1.4: from ₦18,000 per piece. Size add-ons illustrative." },
  },
  // Consultative: planned with the customer, so no automatic price.
  "team-staff-branding": { rules: { ...COMMON, ...SAMPLE, rush: "MANUAL_REVIEW", moq: 1, leadMinDays: 10, leadMaxDays: 30 }, price: null },
};

/** Combinations that can't be produced or need review (OPS-FR-013), for the Business Cards flow. */
const COMPATIBILITY: Record<string, (typeof schema.compatibilityRules.$inferInsert)[]> = {
  "business-cards": [
    { productId: "", ifOption: "paper", ifValue: "350gsm-gloss", thenOption: "finish", thenValues: ["foil"], effect: "NOT_ALLOWED", message: "Foil doesn't hold on gloss paper. Choose matte or soft-touch paper for foil." },
    { productId: "", ifOption: "paper", ifValue: "400gsm-soft-touch", thenOption: "finish", thenValues: ["spot-uv"], effect: "NEEDS_REVIEW", message: "Spot UV on soft-touch needs a check by our print team; we'll confirm the price." },
  ],
};

/** Adds an option (and its values) that older seeds didn't have. */
async function ensureOption(tx: Transaction, productId: string, key: string, label: string, values: string[]) {
  const [existing] = await tx.select({ id: schema.productOptions.id }).from(schema.productOptions).where(and(eq(schema.productOptions.productId, productId), eq(schema.productOptions.key, key)));
  if (existing) return;
  const [option] = await tx.insert(schema.productOptions).values({ productId, key, label, required: false, position: 10 }).returning({ id: schema.productOptions.id });
  await tx.insert(schema.productOptionValues).values(
    values.map((value, index) => ({ optionId: option!.id, key: value.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: value, position: index, isDefault: index === 0 })),
  );
}

/** Product rules, one price per product and VAT. Kept if they already exist. */
export async function seedPricing(tx: Transaction): Promise<void> {
  const [tax] = await tx.select({ id: schema.taxSettings.id }).from(schema.taxSettings).limit(1);
  if (!tax) await tx.insert(schema.taxSettings).values({ effectiveFrom: EFFECTIVE, vatRateBps: 750, vatOnDelivery: true, note: "Stage 1.4: VAT 7.5%, prices exclusive (TEST DATA)" });

  for (const [slug, { rules, price }] of Object.entries(PRICING)) {
    const [product] = await tx.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, slug));
    if (!product) continue;
    await tx.insert(schema.productRules).values({ productId: product.id, ...rules }).onConflictDoNothing();
    if (slug === "business-cards") await ensureOption(tx, product.id, "finish", "Finish", ["None", "Foil", "Spot UV"]);
    const compatibility = COMPATIBILITY[slug];
    if (compatibility) {
      const [anyRule] = await tx.select({ id: schema.compatibilityRules.id }).from(schema.compatibilityRules).where(eq(schema.compatibilityRules.productId, product.id)).limit(1);
      if (!anyRule) await tx.insert(schema.compatibilityRules).values(compatibility.map((rule) => ({ ...rule, productId: product.id })));
    }
    if (!price) continue;
    const [existing] = await tx.select({ id: schema.priceRules.id }).from(schema.priceRules).where(eq(schema.priceRules.productId, product.id)).limit(1);
    if (existing) continue;
    await tx.insert(schema.priceRules).values({
      productId: product.id,
      effectiveFrom: EFFECTIVE,
      currency: "NGN",
      basis: price.basis,
      packSize: price.packSize ?? 1,
      baseMinor: BigInt(naira(price.base)),
      tiers: (price.tiers ?? []).map(([minQuantity, amount]) => ({ minQuantity, amountMinor: naira(amount) })),
      addOns: (price.addOns ?? []).map(([option, value, per, amount]) => ({ option, value, per, amountMinor: naira(amount) })),
      state: price.state,
      includesVat: false,
      note: `${price.note} TEST DATA.`,
    });
  }
}
