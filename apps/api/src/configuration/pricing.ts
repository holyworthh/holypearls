import type { PriceResult } from "@holypearls/contracts";
import { and, asc, type Database, eq, inArray, lt, schema } from "@holypearls/db";
import { AppError } from "../errors.js";
import { currentPriceRule, currentTaxSetting } from "../catalogue/rules.js";
import { type CalculationInput, type CalculationResult, calculatePrice, type Rush } from "./calculate.js";

/*
 * Price calculation service (configuration module, TECH-00 §4). Loads the
 * rules in force at one moment, runs the pure calculator and saves the result
 * with the rule versions it used (TECH-01 §2 price_results). Carts and quotes
 * later snapshot a saved result; they never recalculate past prices.
 */

export interface PriceRequest {
  choices: Record<string, string>;
  quantity: number;
  rush: Rush;
  sample: boolean;
  delivery?: { amountMinor: bigint; currency: "NGN" | "USD" } | null;
}

/** Everything the calculator needs, as it stood at `at`. */
export async function pricingInputs(db: Database, productId: string, request: PriceRequest, at: Date): Promise<CalculationInput> {
  const [product] = await db.select({ buyingMode: schema.products.buyingMode }).from(schema.products).where(eq(schema.products.id, productId));
  if (!product) throw new AppError("NOT_FOUND");
  const optionRows = await db
    .select({ key: schema.productOptions.key, required: schema.productOptions.required, value: schema.productOptionValues.key })
    .from(schema.productOptions)
    .leftJoin(schema.productOptionValues, eq(schema.productOptionValues.optionId, schema.productOptions.id))
    .where(eq(schema.productOptions.productId, productId))
    .orderBy(asc(schema.productOptions.position));
  const options = new Map<string, { key: string; required: boolean; values: string[] }>();
  for (const row of optionRows) {
    const option = options.get(row.key) ?? { key: row.key, required: row.required, values: [] };
    if (row.value) option.values.push(row.value);
    options.set(row.key, option);
  }
  const [rules] = await db.select().from(schema.productRules).where(eq(schema.productRules.productId, productId));
  const compatibility = await db.select().from(schema.compatibilityRules).where(eq(schema.compatibilityRules.productId, productId));
  const price = await currentPriceRule(db, productId, at);
  const tax = await currentTaxSetting(db, at);
  return {
    buyingMode: product.buyingMode,
    options: [...options.values()],
    rules: rules
      ? {
          version: rules.version,
          moq: rules.moq,
          belowMoq: rules.belowMoq,
          belowMoqSurchargeBps: rules.belowMoqSurchargeBps,
          maxAutoQuantity: rules.maxAutoQuantity,
          leadMinDays: rules.leadMinDays,
          leadMaxDays: rules.leadMaxDays,
          rush: rules.rush,
          rushSurchargeBps: rules.rushSurchargeBps,
          priorityRush: rules.priorityRush,
          priorityRushSurchargeBps: rules.priorityRushSurchargeBps,
          sample: rules.sample,
          sampleMultiplierBps: rules.sampleMultiplierBps,
          sampleMinimumMinor: rules.sampleMinimumMinor,
          proof: rules.proof,
          artworkLater: rules.artworkLater,
        }
      : null,
    compatibility: compatibility.map(({ ifOption, ifValue, thenOption, thenValues, effect, message }) => ({ ifOption, ifValue, thenOption, thenValues, effect, message })),
    price: price
      ? {
          id: price.id,
          currency: price.currency as "NGN" | "USD",
          basis: price.basis,
          packSize: price.packSize,
          baseMinor: price.baseMinor,
          tiers: (price.tiers as { minQuantity: number; amountMinor: string }[]).map((tier) => ({ minQuantity: tier.minQuantity, amountMinor: BigInt(tier.amountMinor) })),
          addOns: (price.addOns as { option: string; value: string; per: "UNIT" | "ORDER"; amountMinor: string }[]).map((addOn) => ({ ...addOn, amountMinor: BigInt(addOn.amountMinor) })),
          state: price.state,
          includesVat: price.includesVat,
        }
      : null,
    tax: tax ? { id: tax.id, vatRateBps: tax.vatRateBps, vatOnDelivery: tax.vatOnDelivery } : null,
    choices: request.choices,
    quantity: request.quantity,
    rush: request.rush,
    sample: request.sample,
    delivery: request.delivery ?? null,
  };
}

const text = (value: bigint | null) => (value === null ? null : value.toString());

export function toWire(id: string, result: CalculationResult): PriceResult {
  return {
    id,
    state: result.state,
    valid: result.valid,
    currency: result.currency,
    quantity: result.quantity,
    lines: result.lines.map((line) => ({ label: line.label, amountMinor: line.amountMinor.toString() })),
    goodsMinor: text(result.goodsMinor),
    deliveryMinor: text(result.deliveryMinor),
    vatMinor: text(result.vatMinor),
    totalMinor: text(result.totalMinor),
    perUnitMinor: text(result.perUnitMinor),
    vatRateBps: result.vatRateBps,
    leadDays: result.leadDays,
    proof: result.proof,
    artworkLater: result.artworkLater,
    reasons: result.reasons,
    ruleVersions: result.ruleVersions,
  };
}

/** Calculates and saves the result. Returns it with its saved ID. */
export async function priceProduct(db: Database, productId: string, request: PriceRequest, at: Date): Promise<PriceResult> {
  const input = await pricingInputs(db, productId, request, at);
  const result = calculatePrice(input);
  const [saved] = await db
    .insert(schema.priceResults)
    .values({
      productId,
      input: { choices: request.choices, quantity: request.quantity, rush: request.rush, sample: request.sample, delivery: request.delivery ? { amountMinor: request.delivery.amountMinor.toString(), currency: request.delivery.currency } : null, at: at.toISOString() },
      result: toWire("", result),
      state: result.state,
      currency: result.currency,
      totalMinor: result.totalMinor,
      priceRuleId: result.ruleVersions.priceRuleId,
      productRulesVersion: result.ruleVersions.productRulesVersion,
      taxSettingId: result.ruleVersions.taxSettingId,
    })
    .returning({ id: schema.priceResults.id });
  return toWire(saved!.id, result);
}

/** Prices a published product by its page address (public). */
export async function pricePublishedProduct(db: Database, slug: string, request: PriceRequest, at: Date) {
  const [product] = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(and(eq(schema.products.slug, slug), inArray(schema.products.status, ["PUBLISHED", "TEMPORARILY_UNAVAILABLE"])));
  if (!product) throw new AppError("NOT_FOUND");
  return priceProduct(db, product.id, request, at);
}

/** Daily clean-up: saved results nothing refers to, older than 30 days. Carts and quotes keep snapshots, not references (yet). */
export async function removeOldPriceResults(db: Database, now: Date) {
  const before = new Date(now.getTime() - 30 * 86_400_000);
  const removed = await db.delete(schema.priceResults).where(lt(schema.priceResults.createdAt, before)).returning({ id: schema.priceResults.id });
  return removed.length;
}

/** Options with labels and each option's default value, in display order. */
export async function productOptions(db: Database, productId: string) {
  const rows = await db
    .select({
      key: schema.productOptions.key,
      label: schema.productOptions.label,
      required: schema.productOptions.required,
      valueKey: schema.productOptionValues.key,
      valueLabel: schema.productOptionValues.label,
      isDefault: schema.productOptionValues.isDefault,
    })
    .from(schema.productOptions)
    .innerJoin(schema.productOptionValues, eq(schema.productOptionValues.optionId, schema.productOptions.id))
    .where(eq(schema.productOptions.productId, productId))
    .orderBy(asc(schema.productOptions.position), asc(schema.productOptionValues.position));
  const options: { key: string; label: string; required: boolean; values: { key: string; label: string; isDefault: boolean }[] }[] = [];
  for (const row of rows) {
    let option = options.find((item) => item.key === row.key);
    if (!option) {
      option = { key: row.key, label: row.label, required: row.required, values: [] };
      options.push(option);
    }
    option.values.push({ key: row.valueKey, label: row.valueLabel, isDefault: row.isDefault });
  }
  return options;
}

export const defaultChoices = (options: Awaited<ReturnType<typeof productOptions>>) =>
  Object.fromEntries(options.flatMap((option) => (option.values.find((value) => value.isDefault) ?? option.values[0] ? [[option.key, (option.values.find((value) => value.isDefault) ?? option.values[0])!.key]] : [])));

/**
 * The product page's configurator data (T03-03): options, MOQ, lead time,
 * standard quantities priced at the default choices (COM-FR-043), and the
 * combinations that can't be made, so the page blocks them early (COM-FR-042).
 */
export async function configuratorFor(db: Database, productId: string, at: Date) {
  const options = await productOptions(db, productId);
  const choices = defaultChoices(options);
  const base = await pricingInputs(db, productId, { choices, quantity: 1, rush: "STANDARD", sample: false }, at);
  const moq = base.rules?.moq ?? 1;
  const tiers = base.price?.tiers.map((tier) => tier.minQuantity) ?? [];
  const quantities = [...new Set([moq, ...tiers].filter((quantity) => quantity >= moq))].sort((a, b) => a - b).slice(0, 3);
  const presets = quantities.map((quantity) => {
    const result = calculatePrice({ ...base, quantity });
    return { quantity, perUnitMinor: result.perUnitMinor === null ? null : result.perUnitMinor.toString() };
  });
  const perUnits = presets.flatMap((preset) => (preset.perUnitMinor ? [BigInt(preset.perUnitMinor)] : []));
  return {
    options,
    moq,
    maxAutoQuantity: base.rules?.maxAutoQuantity ?? null,
    leadDays: base.rules ? { min: base.rules.leadMinDays, max: base.rules.leadMaxDays } : null,
    quantityPresets: presets,
    blocked: base.compatibility.filter((rule) => rule.effect === "NOT_ALLOWED").map(({ ifOption, ifValue, thenOption, thenValues, message }) => ({ ifOption, ifValue, thenOption, thenValues, message })),
    currency: base.price?.currency ?? null,
    fromPerUnitMinor: perUnits.length ? perUnits.reduce((low, value) => (value < low ? value : low)).toString() : null,
  };
}
