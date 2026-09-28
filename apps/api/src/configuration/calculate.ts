/*
 * The price calculator (T03-01, COM-FR-004/005/060, OPS-FR-010–019).
 *
 * A pure function: product rules + choices + quantity + delivery → total, per
 * unit, VAT, price state, reasons and the rule versions used. No database, no
 * clock, no floating point: money is bigint minor units, percentages are
 * basis points, and every division rounds half up at one documented place.
 * The same input always gives the same output.
 */

export type PriceState = "PRICE_READY" | "ESTIMATE_READY" | "QUOTE_REQUIRED" | "CONSULTATION_REQUIRED";
export type BuyingMode = "SIMPLE_CONFIGURABLE" | "CONFIGURABLE_QUOTE" | "CONSULTATIVE_PROJECT";
export type Rush = "STANDARD" | "RUSH" | "PRIORITY";

export interface OptionDef {
  key: string;
  required: boolean;
  values: string[];
}

export interface ProductRulesInput {
  version: number;
  moq: number;
  belowMoq: "BLOCK" | "MANUAL_REVIEW" | "SURCHARGE";
  belowMoqSurchargeBps: number;
  maxAutoQuantity: number | null;
  leadMinDays: number;
  leadMaxDays: number;
  rush: "NONE" | "AVAILABLE" | "MANUAL_REVIEW";
  rushSurchargeBps: number;
  priorityRush: "NONE" | "AVAILABLE" | "MANUAL_REVIEW";
  priorityRushSurchargeBps: number;
  sample: "NOT_OFFERED" | "OPTIONAL" | "RECOMMENDED" | "REQUIRED";
  sampleMultiplierBps: number;
  sampleMinimumMinor: bigint;
  proof: "NOT_REQUIRED" | "OPTIONAL" | "REQUIRED";
  artworkLater: boolean;
}

export interface CompatibilityRuleInput {
  ifOption: string;
  ifValue: string;
  thenOption: string;
  thenValues: string[];
  effect: "NOT_ALLOWED" | "NEEDS_REVIEW";
  message: string;
}

export interface PriceRuleInput {
  id: string;
  currency: "NGN" | "USD";
  basis: "PER_UNIT" | "PER_PACK" | "FIXED";
  packSize: number;
  baseMinor: bigint;
  tiers: { minQuantity: number; amountMinor: bigint }[];
  addOns: { option: string; value: string; per: "UNIT" | "ORDER"; amountMinor: bigint }[];
  state: "PRICE_READY" | "ESTIMATE_READY";
  includesVat: boolean;
}

export interface TaxInput {
  id: string;
  vatRateBps: number;
  vatOnDelivery: boolean;
}

export interface CalculationInput {
  buyingMode: BuyingMode;
  options: OptionDef[];
  rules: ProductRulesInput | null;
  compatibility: CompatibilityRuleInput[];
  price: PriceRuleInput | null;
  tax: TaxInput | null;
  choices: Record<string, string>;
  quantity: number;
  rush: Rush;
  /** A sample instead of the order (OPS-FR-017). */
  sample: boolean;
  /** Delivery charge from the delivery module (T04-01); null when not chosen yet. */
  delivery: { amountMinor: bigint; currency: "NGN" | "USD" } | null;
  /** Answers outside the option list that change the price state (garment sourcing, extra placements…). */
  adjustments?: { state: PriceState; code: ReasonCode; message: string }[];
}

export type ReasonCode =
  | "FINAL_AFTER_INSPECTION"
  | "MADE_TO_ORDER"
  | "RECOMMENDATION"
  | "EXTRA_PLACEMENTS"
  | "SIZES_UNKNOWN"
  | "CONSULTATION_PRODUCT"
  | "NO_RULES"
  | "NO_PRICE"
  | "NO_TAX"
  | "INVALID_QUANTITY"
  | "MISSING_CHOICE"
  | "UNKNOWN_CHOICE"
  | "NOT_ALLOWED"
  | "NEEDS_REVIEW"
  | "BELOW_MOQ_BLOCKED"
  | "BELOW_MOQ_REVIEW"
  | "BELOW_MOQ_SURCHARGE"
  | "ABOVE_AUTO_QUANTITY"
  | "RUSH_NOT_OFFERED"
  | "RUSH_REVIEW"
  | "RUSH_SURCHARGE"
  | "SAMPLE_NOT_OFFERED"
  | "SAMPLE_PRICE"
  | "ESTIMATE"
  | "DELIVERY_CURRENCY";

export interface Reason {
  code: ReasonCode;
  message: string;
  /** Blocking reasons stop the order until the customer changes something. */
  blocking: boolean;
}

export interface Line {
  label: string;
  amountMinor: bigint;
}

export interface CalculationResult {
  state: PriceState;
  /** False when a blocking reason means this configuration can't be ordered or quoted as chosen. */
  valid: boolean;
  currency: "NGN" | "USD" | null;
  quantity: number;
  /** Goods before surcharges and VAT, and each add-on and surcharge. */
  lines: Line[];
  goodsMinor: bigint | null;
  deliveryMinor: bigint | null;
  vatMinor: bigint | null;
  totalMinor: bigint | null;
  /** Total ÷ quantity, rounded half up; shown next to the total (COM-FR-005). */
  perUnitMinor: bigint | null;
  vatRateBps: number | null;
  leadDays: { min: number; max: number } | null;
  proof: ProductRulesInput["proof"] | null;
  artworkLater: boolean | null;
  reasons: Reason[];
  ruleVersions: { priceRuleId: string | null; productRulesVersion: number | null; taxSettingId: string | null };
}

const BPS = 10_000n;

/** a × b ÷ c, rounded half up (away from zero for positive values). Inputs are non-negative. */
export function mulDivRound(a: bigint, b: bigint, c: bigint): bigint {
  if (c <= 0n) throw new RangeError("Division by a non-positive number");
  const product = a * b;
  return (product + c / 2n) / c;
}

/** Applies basis points to an amount, rounded half up. */
export const applyBps = (amount: bigint, bps: number) => mulDivRound(amount, BigInt(bps), BPS);

/** The unit (or pack) amount for a quantity: the highest tier the quantity reaches, else the base. */
export function tierAmount(price: PriceRuleInput, quantity: number): bigint {
  let amount = price.baseMinor;
  let reached = 0;
  for (const tier of price.tiers) {
    if (quantity >= tier.minQuantity && tier.minQuantity >= reached) {
      amount = tier.amountMinor;
      reached = tier.minQuantity;
    }
  }
  return amount;
}

/** Goods price before add-ons: per unit × quantity, per pack × quantity ÷ pack size (half up), or fixed. */
export function goodsFor(price: PriceRuleInput, quantity: number): bigint {
  const amount = tierAmount(price, quantity);
  if (price.basis === "FIXED") return amount;
  if (price.basis === "PER_UNIT") return amount * BigInt(quantity);
  return mulDivRound(amount, BigInt(quantity), BigInt(price.packSize));
}

const stateRank: Record<PriceState, number> = { PRICE_READY: 0, ESTIMATE_READY: 1, QUOTE_REQUIRED: 2, CONSULTATION_REQUIRED: 3 };
const worse = (a: PriceState, b: PriceState): PriceState => (stateRank[b] > stateRank[a] ? b : a);

const empty = (input: CalculationInput, state: PriceState, reasons: Reason[], extra: Partial<CalculationResult> = {}): CalculationResult => ({
  state,
  valid: !reasons.some((reason) => reason.blocking),
  currency: input.price?.currency ?? null,
  quantity: input.quantity,
  lines: [],
  goodsMinor: null,
  deliveryMinor: null,
  vatMinor: null,
  totalMinor: null,
  perUnitMinor: null,
  vatRateBps: input.tax?.vatRateBps ?? null,
  leadDays: input.rules ? { min: input.rules.leadMinDays, max: input.rules.leadMaxDays } : null,
  proof: input.rules?.proof ?? null,
  artworkLater: input.rules?.artworkLater ?? null,
  reasons,
  ruleVersions: { priceRuleId: input.price?.id ?? null, productRulesVersion: input.rules?.version ?? null, taxSettingId: input.tax?.id ?? null },
  ...extra,
});

export function calculatePrice(input: CalculationInput): CalculationResult {
  const reasons: Reason[] = [];
  const reason = (code: ReasonCode, message: string, blocking = false) => reasons.push({ code, message, blocking });

  // Consultative products are planned with staff; no automatic price (OPS-FR-015).
  if (input.buyingMode === "CONSULTATIVE_PROJECT") {
    reason("CONSULTATION_PRODUCT", "We plan this with you and send a quote.");
    return empty(input, "CONSULTATION_REQUIRED", reasons);
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) {
    reason("INVALID_QUANTITY", "Enter a quantity of at least 1.", true);
    return empty(input, "QUOTE_REQUIRED", reasons);
  }

  // Every required option needs a known value; unknown values are refused.
  for (const option of input.options) {
    const chosen = input.choices[option.key];
    if (chosen === undefined) {
      if (option.required) reason("MISSING_CHOICE", `Choose ${option.key}.`, true);
    } else if (!option.values.includes(chosen)) {
      reason("UNKNOWN_CHOICE", `That ${option.key} isn't available.`, true);
    }
  }
  for (const key of Object.keys(input.choices)) {
    if (!input.options.some((option) => option.key === key)) reason("UNKNOWN_CHOICE", `This product has no ${key} option.`, true);
  }

  let state: PriceState = "PRICE_READY";
  for (const adjustment of input.adjustments ?? []) {
    reason(adjustment.code, adjustment.message);
    state = worse(state, adjustment.state);
  }

  // Choices that don't work together (OPS-FR-013).
  for (const rule of input.compatibility) {
    if (input.choices[rule.ifOption] !== rule.ifValue) continue;
    const other = input.choices[rule.thenOption];
    if (other === undefined || !rule.thenValues.includes(other)) continue;
    if (rule.effect === "NOT_ALLOWED") reason("NOT_ALLOWED", rule.message, true);
    else {
      // Beyond automatic pricing: keep every choice and send it for a quote (COM-FR-060).
      reason("NEEDS_REVIEW", rule.message);
      state = worse(state, "QUOTE_REQUIRED");
    }
  }

  const rules = input.rules;
  if (!rules) {
    reason("NO_RULES", "We'll confirm the details and price in a quote.");
    return empty(input, "QUOTE_REQUIRED", reasons);
  }

  // Minimum order quantity (OPS-FR-011). A sample is exempt.
  let smallRunBps = 0;
  if (!input.sample && input.quantity < rules.moq) {
    if (rules.belowMoq === "BLOCK") reason("BELOW_MOQ_BLOCKED", `The minimum order is ${rules.moq}.`, true);
    else if (rules.belowMoq === "MANUAL_REVIEW") {
      reason("BELOW_MOQ_REVIEW", `Below the minimum of ${rules.moq}, we review small runs and send a quote.`);
      state = worse(state, "QUOTE_REQUIRED");
    } else {
      smallRunBps = rules.belowMoqSurchargeBps;
      reason("BELOW_MOQ_SURCHARGE", `Below the minimum of ${rules.moq}, a small-run charge applies.`);
    }
  }
  if (!input.sample && rules.maxAutoQuantity !== null && input.quantity > rules.maxAutoQuantity) {
    reason("ABOVE_AUTO_QUANTITY", `For more than ${rules.maxAutoQuantity}, we confirm capacity and send a quote.`);
    state = worse(state, "QUOTE_REQUIRED");
  }

  // Rush (OPS-FR-012).
  let rushBps = 0;
  if (input.rush !== "STANDARD") {
    const availability = input.rush === "RUSH" ? rules.rush : rules.priorityRush;
    const label = input.rush === "RUSH" ? "Rush" : "Priority rush";
    if (availability === "NONE") reason("RUSH_NOT_OFFERED", `${label} isn't available for this product.`, true);
    else if (availability === "MANUAL_REVIEW") {
      reason("RUSH_REVIEW", `${label} needs our production team to confirm; we'll send a quote.`);
      state = worse(state, "QUOTE_REQUIRED");
    } else {
      rushBps = input.rush === "RUSH" ? rules.rushSurchargeBps : rules.priorityRushSurchargeBps;
      reason("RUSH_SURCHARGE", `${label} adds ${rushBps / 100}% for a shorter lead time.`);
    }
  }

  // Samples (OPS-FR-017).
  if (input.sample && rules.sample === "NOT_OFFERED") reason("SAMPLE_NOT_OFFERED", "Samples aren't offered for this product.", true);

  const price = input.price;
  if (!price) {
    reason("NO_PRICE", "We'll price this in a quote.");
    return empty(input, worse(state, "QUOTE_REQUIRED"), reasons);
  }
  if (!input.tax) {
    reason("NO_TAX", "We'll confirm VAT in a quote.");
    return empty(input, worse(state, "QUOTE_REQUIRED"), reasons);
  }
  if (input.buyingMode === "CONFIGURABLE_QUOTE" || price.state === "ESTIMATE_READY") {
    state = worse(state, "ESTIMATE_READY");
    reason("ESTIMATE", "This is an estimate. We confirm the final price after reviewing your artwork and details.");
  }

  // Goods: tiered base plus add-ons for the chosen values.
  const quantity = input.sample ? 1 : input.quantity;
  const lines: Line[] = [];
  let goods = goodsFor(price, quantity);
  lines.push({ label: "Goods", amountMinor: goods });
  for (const addOn of price.addOns) {
    if (input.choices[addOn.option] !== addOn.value) continue;
    const amount = addOn.per === "UNIT" && price.basis !== "FIXED" ? addOn.amountMinor * BigInt(quantity) : addOn.amountMinor;
    lines.push({ label: `${addOn.option}: ${addOn.value}`, amountMinor: amount });
    goods += amount;
  }

  // Sample price: the larger of the unit price × multiplier and the minimum.
  if (input.sample) {
    const moq = Math.max(rules.moq, 1);
    const unit = mulDivRound(goodsFor(price, moq), 1n, BigInt(moq));
    const byMultiplier = applyBps(unit, rules.sampleMultiplierBps);
    goods = byMultiplier > rules.sampleMinimumMinor ? byMultiplier : rules.sampleMinimumMinor;
    lines.splice(0, lines.length, { label: "Sample", amountMinor: goods });
    reason("SAMPLE_PRICE", "Sample price: one piece made to your specification.");
  }

  // Surcharges apply to goods (not delivery), each rounded half up.
  if (smallRunBps) {
    const amount = applyBps(goods, smallRunBps);
    lines.push({ label: "Small-run charge", amountMinor: amount });
    goods += amount;
  }
  if (rushBps) {
    const amount = applyBps(goods, rushBps);
    lines.push({ label: input.rush === "RUSH" ? "Rush" : "Priority rush", amountMinor: amount });
    goods += amount;
  }

  // Delivery must be in the same currency; the code never converts currencies (TECH-05 §2).
  let delivery: bigint | null = null;
  if (input.delivery) {
    if (input.delivery.currency !== price.currency) {
      reason("DELIVERY_CURRENCY", "Delivery is priced in a different currency; we'll confirm in a quote.");
      state = worse(state, "QUOTE_REQUIRED");
    } else delivery = input.delivery.amountMinor;
  }

  // VAT (OPS-FR-019): exclusive adds it; inclusive extracts it from prices that already contain it.
  const rate = BigInt(input.tax.vatRateBps);
  let vat: bigint;
  let total: bigint;
  if (price.includesVat) {
    const gross = goods + (delivery ?? 0n);
    const taxableGross = goods + (input.tax.vatOnDelivery ? (delivery ?? 0n) : 0n);
    vat = mulDivRound(taxableGross, rate, BPS + rate);
    total = gross;
  } else {
    const taxable = goods + (input.tax.vatOnDelivery ? (delivery ?? 0n) : 0n);
    vat = mulDivRound(taxable, rate, BPS);
    total = goods + (delivery ?? 0n) + vat;
  }

  const leadDays = { min: rules.leadMinDays, max: rules.leadMaxDays };
  if (rushBps && input.rush === "RUSH") {
    // Rush aims at about half to three quarters of the standard lead time (Stage 1.4).
    leadDays.min = Math.max(1, Math.ceil(rules.leadMinDays / 2));
    leadDays.max = Math.max(leadDays.min, Math.ceil((rules.leadMaxDays * 3) / 4));
  } else if (rushBps && input.rush === "PRIORITY") {
    leadDays.min = Math.max(1, Math.floor(rules.leadMinDays / 2));
    leadDays.max = Math.max(leadDays.min, Math.ceil(rules.leadMaxDays / 2));
  }

  return {
    state,
    valid: !reasons.some((item) => item.blocking),
    currency: price.currency,
    quantity,
    lines,
    goodsMinor: goods,
    deliveryMinor: delivery,
    vatMinor: vat,
    totalMinor: total,
    perUnitMinor: mulDivRound(total, 1n, BigInt(quantity)),
    vatRateBps: input.tax.vatRateBps,
    leadDays,
    proof: rules.proof,
    artworkLater: rules.artworkLater,
    reasons,
    ruleVersions: { priceRuleId: price.id, productRulesVersion: rules.version, taxSettingId: input.tax.id },
  };
}
