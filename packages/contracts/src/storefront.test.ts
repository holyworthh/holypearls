import { describe, expect, it } from "vitest";
import { businessDate } from "./business-time.js";
import { CUSTOMER_PRICE_LABEL, customerPriceState, type PublicProductCard, publicProductQuerySchema } from "./index.js";

const card = (overrides: Partial<PublicProductCard>): PublicProductCard => ({
  slug: "polo-shirt",
  name: "Polo Shirt",
  summary: null,
  family: "GARMENT",
  buyingMode: "CONFIGURABLE_QUOTE",
  category: { slug: "t-shirts-tops", name: "T-Shirts & Tops" },
  image: null,
  available: true,
  priceState: "QUOTE_REQUIRED",
  price: null,
  moq: 20,
  ...overrides,
});
const price = (state: "PRICE_READY" | "ESTIMATE_READY") => ({ amountMinor: "850000", currency: "NGN" as const, basis: "PER_UNIT" as const, packSize: 1, state });

describe("the customer-facing price state (PUB-FR-010)", () => {
  it("follows the list price when there is one", () => {
    expect(customerPriceState(card({ price: price("PRICE_READY") }))).toBe("PRICE_READY");
    expect(customerPriceState(card({ price: price("ESTIMATE_READY") }))).toBe("ESTIMATE_READY");
  });

  it("never treats a missing price as an estimate", () => {
    expect(customerPriceState(card({ priceState: "QUOTE_REQUIRED", price: null }))).toBe("QUOTE_REQUIRED");
    expect(customerPriceState(card({ priceState: "PRICE_ON_CONFIGURATION", price: null }))).toBe("QUOTE_REQUIRED");
    expect(customerPriceState(card({ priceState: "CONSULTATION_REQUIRED", buyingMode: "CONSULTATIVE_PROJECT", price: null }))).toBe("CONSULTATION_REQUIRED");
  });

  it("says unavailable for a temporarily unavailable product, whatever its price", () => {
    expect(customerPriceState(card({ available: false, priceState: "UNAVAILABLE", price: price("PRICE_READY") }))).toBe("UNAVAILABLE");
  });

  it("has the label the product page and its sticky bar show", () => {
    expect(CUSTOMER_PRICE_LABEL).toEqual({
      PRICE_READY: "PRICE READY",
      ESTIMATE_READY: "ESTIMATE READY",
      QUOTE_REQUIRED: "QUOTE REQUIRED",
      CONSULTATION_REQUIRED: "PLANNED WITH OUR TEAM",
      UNAVAILABLE: "UNAVAILABLE",
    });
  });
});

describe("the business date (Africa/Lagos)", () => {
  it("is Lagos's calendar date, not UTC's, around midnight", () => {
    // 23:30 UTC on Thursday 1 October is 00:30 on Friday 2 October in Lagos (UTC+1).
    expect(businessDate(new Date("2026-10-01T23:30:00Z"))).toBe("2026-10-02");
    expect(businessDate(new Date("2026-10-01T22:59:00Z"))).toBe("2026-10-01");
  });
});

describe("needed-by in the directory query", () => {
  it("refuses a date before today in Lagos and accepts today", () => {
    const today = businessDate(new Date());
    expect(publicProductQuerySchema.safeParse({ neededBy: today }).success).toBe(true);
    expect(publicProductQuerySchema.safeParse({ neededBy: "2020-01-01" }).success).toBe(false);
  });
});
