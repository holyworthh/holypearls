import { describe, expect, it } from "vitest";
import { applyBps, type CalculationInput, type CalculationResult, calculatePrice, mulDivRound, type ReasonCode } from "./calculate.js";

/*
 * Table-driven tests for the price calculator (T03-01 "Done when": at least 50
 * cases, same input gives the same output, no floating point). Every expected
 * amount is worked out by hand in kobo; the working is in the case name or a
 * comment.
 */

const base = (): CalculationInput => ({
  buyingMode: "SIMPLE_CONFIGURABLE",
  options: [
    { key: "paper", required: true, values: ["350-matte", "350-gloss", "400-soft"] },
    { key: "sides", required: true, values: ["one", "both"] },
    { key: "finish", required: false, values: ["none", "soft-touch"] },
  ],
  rules: {
    version: 3,
    moq: 100,
    belowMoq: "BLOCK",
    belowMoqSurchargeBps: 0,
    maxAutoQuantity: 10_000,
    leadMinDays: 2,
    leadMaxDays: 5,
    rush: "AVAILABLE",
    rushSurchargeBps: 2_500,
    priorityRush: "MANUAL_REVIEW",
    priorityRushSurchargeBps: 5_000,
    sample: "NOT_OFFERED",
    sampleMultiplierBps: 15_000,
    sampleMinimumMinor: 2_500_000n,
    proof: "REQUIRED",
    artworkLater: true,
  },
  compatibility: [
    { ifOption: "paper", ifValue: "350-gloss", thenOption: "finish", thenValues: ["soft-touch"], effect: "NOT_ALLOWED", message: "Soft-touch isn't available on gloss." },
    { ifOption: "paper", ifValue: "400-soft", thenOption: "sides", thenValues: ["both"], effect: "NEEDS_REVIEW", message: "Double-sided 400gsm needs a review." },
  ],
  // Business cards: ₦15,000 per 100, ₦13,000 per 100 from 500, ₦11,000 per 100 from 1,000.
  price: {
    id: "price-1",
    currency: "NGN",
    basis: "PER_PACK",
    packSize: 100,
    baseMinor: 1_500_000n,
    tiers: [
      { minQuantity: 500, amountMinor: 1_300_000n },
      { minQuantity: 1_000, amountMinor: 1_100_000n },
    ],
    addOns: [
      { option: "sides", value: "both", per: "ORDER", amountMinor: 300_000n },
      { option: "finish", value: "soft-touch", per: "UNIT", amountMinor: 2_000n },
    ],
    state: "PRICE_READY",
    includesVat: false,
  },
  tax: { id: "tax-1", vatRateBps: 750, vatOnDelivery: true },
  choices: { paper: "350-matte", sides: "one" },
  quantity: 100,
  rush: "STANDARD",
  sample: false,
  delivery: null,
});

type Change = (input: CalculationInput) => void;
interface Case {
  name: string;
  change?: Change;
  expect: Partial<Pick<CalculationResult, "state" | "valid" | "goodsMinor" | "vatMinor" | "totalMinor" | "perUnitMinor" | "deliveryMinor" | "currency" | "quantity" | "leadDays">>;
  reasons?: ReasonCode[];
}

const amounts = (goods: bigint, vat: bigint, total: bigint, perUnit: bigint) => ({ goodsMinor: goods, vatMinor: vat, totalMinor: total, perUnitMinor: perUnit });

const CASES: Case[] = [
  // Quantity and tiers (per pack of 100).
  { name: "100 cards: 15,000.00 + 7.5% VAT", expect: { state: "PRICE_READY", valid: true, ...amounts(1_500_000n, 112_500n, 1_612_500n, 16_125n) } },
  { name: "101 cards: pro-rata pack price", change: (i) => void (i.quantity = 101), expect: amounts(1_515_000n, 113_625n, 1_628_625n, 16_125n) },
  { name: "150 cards", change: (i) => void (i.quantity = 150), expect: amounts(2_250_000n, 168_750n, 2_418_750n, 16_125n) },
  { name: "250 cards", change: (i) => void (i.quantity = 250), expect: amounts(3_750_000n, 281_250n, 4_031_250n, 16_125n) },
  { name: "499 cards stay on the base price", change: (i) => void (i.quantity = 499), expect: amounts(7_485_000n, 561_375n, 8_046_375n, 16_125n) },
  { name: "500 cards reach the first tier", change: (i) => void (i.quantity = 500), expect: amounts(6_500_000n, 487_500n, 6_987_500n, 13_975n) },
  { name: "999 cards stay on the first tier", change: (i) => void (i.quantity = 999), expect: amounts(12_987_000n, 974_025n, 13_961_025n, 13_975n) },
  { name: "1,000 cards reach the second tier", change: (i) => void (i.quantity = 1_000), expect: amounts(11_000_000n, 825_000n, 11_825_000n, 11_825n) },
  { name: "10,000 cards (the automatic limit) are still priced", change: (i) => void (i.quantity = 10_000), expect: { state: "PRICE_READY", ...amounts(110_000_000n, 8_250_000n, 118_250_000n, 11_825n) } },
  {
    name: "tiers in any order: 700 uses the 500 tier",
    change: (i) => {
      i.price!.tiers = [...i.price!.tiers].reverse();
      i.quantity = 700;
    },
    expect: amounts(9_100_000n, 682_500n, 9_782_500n, 13_975n),
  },
  // 1,234,567 × 150 ÷ 100 = 1,851,850.5 → 1,851,851; VAT 138,888.825 → 138,889; total 1,990,740; ÷150 = 13,271.6 → 13,272.
  {
    name: "half-up rounding on pack price, VAT and per unit",
    change: (i) => {
      i.price!.baseMinor = 1_234_567n;
      i.quantity = 150;
    },
    expect: amounts(1_851_851n, 138_889n, 1_990_740n, 13_272n),
  },

  // Add-ons.
  { name: "double-sided adds 3,000.00 per order", change: (i) => void (i.choices.sides = "both"), expect: amounts(1_800_000n, 135_000n, 1_935_000n, 19_350n) },
  { name: "soft-touch adds 20.00 per card", change: (i) => void (i.choices.finish = "soft-touch"), expect: amounts(1_700_000n, 127_500n, 1_827_500n, 18_275n) },
  {
    name: "both add-ons on 200 cards",
    change: (i) => {
      i.choices.sides = "both";
      i.choices.finish = "soft-touch";
      i.quantity = 200;
    },
    // 3,000,000 + 300,000 + 400,000 = 3,700,000; per unit 3,977,500 ÷ 200 = 19,887.5 → 19,888.
    expect: amounts(3_700_000n, 277_500n, 3_977_500n, 19_888n),
  },
  { name: "finish 'none' adds nothing", change: (i) => void (i.choices.finish = "none"), expect: amounts(1_500_000n, 112_500n, 1_612_500n, 16_125n) },

  // Minimum order quantity.
  { name: "below MOQ is blocked", change: (i) => void (i.quantity = 50), expect: { valid: false }, reasons: ["BELOW_MOQ_BLOCKED"] },
  {
    name: "below MOQ goes to manual review",
    change: (i) => {
      i.rules!.belowMoq = "MANUAL_REVIEW";
      i.quantity = 50;
    },
    expect: { state: "QUOTE_REQUIRED", valid: true },
    reasons: ["BELOW_MOQ_REVIEW"],
  },
  {
    name: "below MOQ with a 30% small-run charge",
    change: (i) => {
      i.rules!.belowMoq = "SURCHARGE";
      i.rules!.belowMoqSurchargeBps = 3_000;
      i.quantity = 50;
    },
    // 750,000 + 225,000 = 975,000; VAT 73,125; per unit 1,048,125 ÷ 50 = 20,962.5 → 20,963.
    expect: { state: "PRICE_READY", ...amounts(975_000n, 73_125n, 1_048_125n, 20_963n) },
    reasons: ["BELOW_MOQ_SURCHARGE"],
  },
  { name: "exactly the MOQ is fine", change: (i) => void (i.quantity = 100), expect: { valid: true, state: "PRICE_READY" }, reasons: [] },
  { name: "above the automatic limit needs a quote", change: (i) => void (i.quantity = 10_001), expect: { state: "QUOTE_REQUIRED", valid: true }, reasons: ["ABOVE_AUTO_QUANTITY"] },
  { name: "no automatic limit", change: (i) => void ((i.rules!.maxAutoQuantity = null), (i.quantity = 50_000)), expect: { state: "PRICE_READY" }, reasons: [] },

  // Rush.
  {
    name: "rush adds 25% and shortens the lead time",
    change: (i) => void (i.rush = "RUSH"),
    // 1,500,000 + 375,000; lead 2–5 → 1–4.
    expect: { ...amounts(1_875_000n, 140_625n, 2_015_625n, 20_156n), leadDays: { min: 1, max: 4 } },
    reasons: ["RUSH_SURCHARGE"],
  },
  { name: "priority rush needs review", change: (i) => void (i.rush = "PRIORITY"), expect: { state: "QUOTE_REQUIRED" }, reasons: ["RUSH_REVIEW"] },
  {
    name: "priority rush at 50%",
    change: (i) => {
      i.rules!.priorityRush = "AVAILABLE";
      i.rush = "PRIORITY";
    },
    expect: { ...amounts(2_250_000n, 168_750n, 2_418_750n, 24_188n), leadDays: { min: 1, max: 3 } },
  },
  { name: "rush not offered", change: (i) => void ((i.rules!.rush = "NONE"), (i.rush = "RUSH")), expect: { valid: false }, reasons: ["RUSH_NOT_OFFERED"] },
  {
    name: "small-run charge then rush, each rounded",
    change: (i) => {
      i.rules!.belowMoq = "SURCHARGE";
      i.rules!.belowMoqSurchargeBps = 3_000;
      i.quantity = 50;
      i.rush = "RUSH";
    },
    // 750,000 → +225,000 = 975,000 → +243,750 = 1,218,750; VAT 91,406.25 → 91,406; total 1,310,156; ÷50 = 26,203.12 → 26,203.
    expect: amounts(1_218_750n, 91_406n, 1_310_156n, 26_203n),
  },
  { name: "standard lead time is reported", expect: { leadDays: { min: 2, max: 5 } } },

  // Choices and compatibility.
  { name: "missing a required choice", change: (i) => void delete i.choices.sides, expect: { valid: false }, reasons: ["MISSING_CHOICE"] },
  { name: "a value that doesn't exist", change: (i) => void (i.choices.paper = "cardboard"), expect: { valid: false }, reasons: ["UNKNOWN_CHOICE"] },
  { name: "an option the product doesn't have", change: (i) => void (i.choices.colour = "red"), expect: { valid: false }, reasons: ["UNKNOWN_CHOICE"] },
  { name: "an optional option can be left out", expect: { valid: true } },
  {
    name: "choices that don't work together are refused",
    change: (i) => {
      i.choices.paper = "350-gloss";
      i.choices.finish = "soft-touch";
    },
    expect: { valid: false },
    reasons: ["NOT_ALLOWED"],
  },
  {
    name: "a combination that needs review keeps every choice and asks for a quote",
    change: (i) => {
      i.choices.paper = "400-soft";
      i.choices.sides = "both";
    },
    expect: { state: "QUOTE_REQUIRED", valid: true, goodsMinor: 1_800_000n },
    reasons: ["NEEDS_REVIEW"],
  },
  { name: "gloss without soft-touch is fine", change: (i) => void ((i.choices.paper = "350-gloss"), (i.choices.finish = "none")), expect: { valid: true }, reasons: [] },

  // Price states.
  {
    name: "consultative products have no automatic price",
    change: (i) => void (i.buyingMode = "CONSULTATIVE_PROJECT"),
    expect: { state: "CONSULTATION_REQUIRED", totalMinor: null },
    reasons: ["CONSULTATION_PRODUCT"],
  },
  { name: "configurable-quote products show an estimate", change: (i) => void (i.buyingMode = "CONFIGURABLE_QUOTE"), expect: { state: "ESTIMATE_READY", totalMinor: 1_612_500n }, reasons: ["ESTIMATE"] },
  { name: "an estimate-only price rule", change: (i) => void (i.price!.state = "ESTIMATE_READY"), expect: { state: "ESTIMATE_READY" }, reasons: ["ESTIMATE"] },
  { name: "no price rule yet", change: (i) => void (i.price = null), expect: { state: "QUOTE_REQUIRED", totalMinor: null }, reasons: ["NO_PRICE"] },
  { name: "no product rules yet", change: (i) => void (i.rules = null), expect: { state: "QUOTE_REQUIRED", totalMinor: null }, reasons: ["NO_RULES"] },
  { name: "no VAT setting", change: (i) => void (i.tax = null), expect: { state: "QUOTE_REQUIRED", totalMinor: null }, reasons: ["NO_TAX"] },
  {
    name: "review beats estimate: estimate product that needs review",
    change: (i) => {
      i.buyingMode = "CONFIGURABLE_QUOTE";
      i.quantity = 10_001;
    },
    expect: { state: "QUOTE_REQUIRED" },
  },

  // Quantity validation.
  { name: "quantity 0", change: (i) => void (i.quantity = 0), expect: { valid: false, totalMinor: null }, reasons: ["INVALID_QUANTITY"] },
  { name: "negative quantity", change: (i) => void (i.quantity = -5), expect: { valid: false }, reasons: ["INVALID_QUANTITY"] },
  { name: "fractional quantity", change: (i) => void (i.quantity = 1.5), expect: { valid: false }, reasons: ["INVALID_QUANTITY"] },

  // VAT.
  { name: "0% VAT", change: (i) => void (i.tax!.vatRateBps = 0), expect: amounts(1_500_000n, 0n, 1_500_000n, 15_000n) },
  // 1,500,000 × 750 ÷ 10,750 = 104,651.16 → 104,651.
  { name: "prices that include VAT", change: (i) => void (i.price!.includesVat = true), expect: amounts(1_500_000n, 104_651n, 1_500_000n, 15_000n) },
  {
    name: "delivery is taxed when VAT applies to delivery",
    change: (i) => void (i.delivery = { amountMinor: 800_000n, currency: "NGN" }),
    expect: { deliveryMinor: 800_000n, ...amounts(1_500_000n, 172_500n, 2_472_500n, 24_725n) },
  },
  {
    name: "delivery isn't taxed when VAT excludes delivery",
    change: (i) => {
      i.delivery = { amountMinor: 800_000n, currency: "NGN" };
      i.tax!.vatOnDelivery = false;
    },
    expect: amounts(1_500_000n, 112_500n, 2_412_500n, 24_125n),
  },
  {
    name: "inclusive prices with delivery",
    change: (i) => {
      i.price!.includesVat = true;
      i.delivery = { amountMinor: 800_000n, currency: "NGN" };
    },
    // 2,300,000 × 750 ÷ 10,750 = 160,465.1 → 160,465.
    expect: amounts(1_500_000n, 160_465n, 2_300_000n, 23_000n),
  },
  {
    name: "delivery in another currency is never converted",
    change: (i) => void (i.delivery = { amountMinor: 5_000n, currency: "USD" }),
    expect: { state: "QUOTE_REQUIRED", deliveryMinor: null, totalMinor: 1_612_500n },
    reasons: ["DELIVERY_CURRENCY"],
  },

  // Other pricing bases.
  {
    name: "per unit: mugs at 4,500.00",
    change: (i) => {
      Object.assign(i.price!, { basis: "PER_UNIT", packSize: 1, baseMinor: 450_000n, tiers: [{ minQuantity: 50, amountMinor: 400_000n }], addOns: [] });
      i.rules!.moq = 10;
      i.quantity = 10;
    },
    expect: amounts(4_500_000n, 337_500n, 4_837_500n, 483_750n),
  },
  {
    name: "per unit tier: 50 mugs at 4,000.00",
    change: (i) => {
      Object.assign(i.price!, { basis: "PER_UNIT", packSize: 1, baseMinor: 450_000n, tiers: [{ minQuantity: 50, amountMinor: 400_000n }], addOns: [] });
      i.rules!.moq = 10;
      i.quantity = 50;
    },
    expect: amounts(20_000_000n, 1_500_000n, 21_500_000n, 430_000n),
  },
  {
    name: "fixed price is the whole order price",
    change: (i) => {
      Object.assign(i.price!, { basis: "FIXED", baseMinor: 5_500_000n, tiers: [], addOns: [] });
      i.rules!.moq = 1;
      i.quantity = 3;
    },
    // 5,912,500 ÷ 3 = 1,970,833.33 → 1,970,833.
    expect: amounts(5_500_000n, 412_500n, 5_912_500n, 1_970_833n),
  },
  {
    name: "a per-unit add-on on a fixed price applies once",
    change: (i) => {
      Object.assign(i.price!, { basis: "FIXED", baseMinor: 5_500_000n, tiers: [], addOns: [{ option: "finish", value: "soft-touch", per: "UNIT", amountMinor: 100_000n }] });
      i.rules!.moq = 1;
      i.quantity = 3;
      i.choices.finish = "soft-touch";
    },
    expect: { goodsMinor: 5_600_000n },
  },
  {
    name: "USD prices stay in USD",
    change: (i) => void (i.price!.currency = "USD"),
    expect: { currency: "USD", totalMinor: 1_612_500n },
  },

  // Samples.
  { name: "samples not offered", change: (i) => void (i.sample = true), expect: { valid: false }, reasons: ["SAMPLE_NOT_OFFERED"] },
  {
    name: "sample price uses the minimum when it's higher",
    change: (i) => {
      i.rules!.sample = "OPTIONAL";
      i.sample = true;
    },
    // Unit at MOQ 15,000 × 1.5 = 22,500 < minimum 2,500,000.
    expect: { quantity: 1, ...amounts(2_500_000n, 187_500n, 2_687_500n, 2_687_500n) },
    reasons: ["SAMPLE_PRICE"],
  },
  {
    name: "sample price uses the multiplier when it's higher",
    change: (i) => {
      i.rules!.sample = "RECOMMENDED";
      i.rules!.sampleMinimumMinor = 10_000n;
      i.sample = true;
    },
    // 22,500; VAT 1,687.5 → 1,688.
    expect: amounts(22_500n, 1_688n, 24_188n, 24_188n),
  },
  {
    name: "a sample ignores the MOQ",
    change: (i) => {
      i.rules!.sample = "REQUIRED";
      i.sample = true;
      i.quantity = 1;
    },
    expect: { valid: true },
  },
];

describe("calculatePrice (table)", () => {
  it.each(CASES)("$name", ({ change, expect: expected, reasons }) => {
    const input = base();
    change?.(input);
    const result = calculatePrice(input);
    expect(result).toMatchObject(expected);
    if (reasons) expect(result.reasons.map((reason) => reason.code)).toEqual(reasons.length ? expect.arrayContaining(reasons) : []);
  });
});

describe("calculatePrice (properties)", () => {
  it("has at least 50 table cases", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(50);
  });

  it("gives the same output for the same input", () => {
    for (const quantity of [1, 99, 100, 101, 499, 500, 777, 1000, 12_345]) {
      const input = base();
      input.quantity = quantity;
      input.rules!.belowMoq = "SURCHARGE";
      input.rules!.belowMoqSurchargeBps = 2_000;
      expect(calculatePrice(input)).toEqual(calculatePrice(structuredClone(input)));
    }
  });

  it("uses no floating point: every amount is a bigint", () => {
    const result = calculatePrice({ ...base(), quantity: 777, delivery: { amountMinor: 123_457n, currency: "NGN" } });
    for (const key of ["goodsMinor", "vatMinor", "totalMinor", "perUnitMinor", "deliveryMinor"] as const) expect(typeof result[key]).toBe("bigint");
    for (const line of result.lines) expect(typeof line.amountMinor).toBe("bigint");
  });

  it("totals always equal goods + delivery + VAT when VAT is exclusive", () => {
    for (let quantity = 100; quantity < 1_300; quantity += 37) {
      const result = calculatePrice({ ...base(), quantity, delivery: { amountMinor: 333_333n, currency: "NGN" } });
      expect(result.totalMinor).toBe(result.goodsMinor! + result.deliveryMinor! + result.vatMinor!);
    }
  });

  it("never lowers the total when the quantity rises within a tier", () => {
    let previous = 0n;
    for (let quantity = 100; quantity < 500; quantity += 1) {
      const total = calculatePrice({ ...base(), quantity }).totalMinor!;
      expect(total >= previous).toBe(true);
      previous = total;
    }
  });

  it("records the rule versions it used", () => {
    expect(calculatePrice(base()).ruleVersions).toEqual({ priceRuleId: "price-1", productRulesVersion: 3, taxSettingId: "tax-1" });
  });

  it("passes proof and artwork-later rules through", () => {
    expect(calculatePrice(base())).toMatchObject({ proof: "REQUIRED", artworkLater: true });
  });
});

describe("rounding helpers", () => {
  it.each([
    [1n, 1n, 2n, 1n],
    [3n, 1n, 2n, 2n],
    [1n, 1n, 3n, 0n],
    [2n, 1n, 3n, 1n],
    [5n, 1n, 10n, 1n],
    [4n, 1n, 10n, 0n],
    [0n, 750n, 10_000n, 0n],
  ])("mulDivRound(%s, %s, %s) = %s", (a, b, c, expected) => {
    expect(mulDivRound(a, b, c)).toBe(expected);
  });

  it("rounds basis points half up", () => {
    expect(applyBps(10n, 750)).toBe(1n); // 0.75
    expect(applyBps(6n, 750)).toBe(0n); // 0.45
    expect(applyBps(20n, 2_500)).toBe(5n);
  });

  it("refuses to divide by zero", () => {
    expect(() => mulDivRound(1n, 1n, 0n)).toThrow(RangeError);
  });
});
