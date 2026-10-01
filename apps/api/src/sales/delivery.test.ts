import { describe, expect, it } from "vitest";
import { checkoutTotals, type ZoneRule, zoneFor, zoneOverlaps } from "./delivery.js";

const zones: ZoneRule[] = [
  { id: "mainland", name: "Lagos Mainland", kind: "AREA", covers: [{ state: "Lagos", lga: "Ikeja" }, { state: "Lagos", lga: "Surulere" }] },
  { id: "island", name: "Lagos Island", kind: "AREA", covers: [{ state: "Lagos", lga: "Eti-Osa" }, { state: "Lagos", lga: "Lagos Island" }] },
  { id: "abuja", name: "Abuja FCT", kind: "AREA", covers: [{ state: "FCT", lga: null }] },
  { id: "rest", name: "Other Nigerian states", kind: "REST_OF_NIGERIA", covers: [] },
  { id: "abroad", name: "International", kind: "INTERNATIONAL", covers: [] },
];

describe("every address resolves to exactly one zone (OPS-FR-100, Pen 108)", () => {
  it("matches an LGA", () => {
    expect(zoneFor(zones, { country: "NG", state: "Lagos", area: "Eti-Osa" })?.id).toBe("island");
    expect(zoneFor(zones, { country: "NG", state: "Lagos", area: "Ikeja" })?.id).toBe("mainland");
  });

  it("matches a whole state, whatever the area", () => {
    expect(zoneFor(zones, { country: "NG", state: "FCT", area: "Bwari" })?.id).toBe("abuja");
  });

  it("an LGA match beats a whole-state match", () => {
    const withLagos: ZoneRule[] = [...zones, { id: "lagos-all", name: "Lagos (other)", kind: "AREA", covers: [{ state: "Lagos", lga: null }] }];
    expect(zoneFor(withLagos, { country: "NG", state: "Lagos", area: "Eti-Osa" })?.id).toBe("island");
    expect(zoneFor(withLagos, { country: "NG", state: "Lagos", area: "Epe" })?.id).toBe("lagos-all");
  });

  it("falls to the rest-of-Nigeria zone, and addresses abroad to International (OPS-FR-101)", () => {
    expect(zoneFor(zones, { country: "NG", state: "Lagos", area: "Epe" })?.id).toBe("rest");
    expect(zoneFor(zones, { country: "NG", state: "Kano", area: "Nassarawa" })?.id).toBe("rest");
    expect(zoneFor(zones, { country: "GH", state: "Greater Accra", area: "Accra" })?.id).toBe("abroad");
  });

  it("compares LGA names without caring about case or spaces", () => {
    expect(zoneFor(zones, { country: "NG", state: "Lagos", area: " eti-osa " })?.id).toBe("island");
  });

  it("returns null when no zone is set up, so checkout treats delivery as quote required", () => {
    expect(zoneFor([], { country: "NG", state: "Lagos", area: "Ikeja" })).toBeNull();
  });
});

describe("zones can't overlap (Pen 108 validation)", () => {
  it("refuses an LGA already in another zone, naming both", () => {
    expect(zoneOverlaps(zones, { id: null, covers: [{ state: "Lagos", lga: "Eti-Osa" }] })).toEqual([{ cover: "Eti-Osa", zone: "Lagos Island" }]);
  });

  it("refuses a whole state that another zone already covers in part, or whole", () => {
    expect(zoneOverlaps(zones, { id: null, covers: [{ state: "Lagos", lga: null }] })).toEqual([
      { cover: "Lagos", zone: "Lagos Mainland" },
      { cover: "Lagos", zone: "Lagos Island" },
    ]);
    expect(zoneOverlaps(zones, { id: null, covers: [{ state: "FCT", lga: "Kuje" }] })).toEqual([{ cover: "Kuje", zone: "Abuja FCT" }]);
  });

  it("ignores the zone being edited, and repeats within the same zone count once", () => {
    expect(zoneOverlaps(zones, { id: "island", covers: [{ state: "Lagos", lga: "Eti-Osa" }] })).toEqual([]);
    expect(zoneOverlaps(zones, { id: null, covers: [{ state: "Oyo", lga: null }, { state: "Oyo", lga: null }] })).toEqual([{ cover: "Oyo", zone: "this zone" }]);
  });
});

describe("checkout totals are worked out by the server (TECH-05 §1, COM-FR-084)", () => {
  const cards = { goodsMinor: 5_250_000n, vatMinor: 393_750n, totalMinor: 5_643_750n };

  it("matches Pen 41: ₦52,500 cards + 7.5% VAT + ₦4,500 delivery = ₦60,937.50", () => {
    const totals = checkoutTotals([cards], { amountMinor: 450_000n }, { vatRateBps: 750, vatOnDelivery: false });
    expect(totals).toEqual({ goodsMinor: 5_250_000n, deliveryMinor: 450_000n, vatMinor: 393_750n, totalMinor: 6_093_750n });
  });

  it("adds VAT on delivery when the setting says so, as its own share of the VAT line", () => {
    const totals = checkoutTotals([cards], { amountMinor: 450_000n }, { vatRateBps: 750, vatOnDelivery: true });
    expect(totals.vatMinor).toBe(393_750n + 33_750n);
    expect(totals.totalMinor).toBe(5_250_000n + 450_000n + 393_750n + 33_750n);
  });

  it("keeps VAT-inclusive items' VAT as the calculator extracted it", () => {
    const inclusive = { goodsMinor: 1_000_000n, vatMinor: 69_767n, totalMinor: 1_000_000n };
    const totals = checkoutTotals([inclusive, cards], null, { vatRateBps: 750, vatOnDelivery: true });
    expect(totals).toEqual({ goodsMinor: 1_000_000n - 69_767n + 5_250_000n, deliveryMinor: null, vatMinor: 69_767n + 393_750n, totalMinor: 1_000_000n + 5_643_750n });
  });

  it("leaves delivery out of the total until it's known", () => {
    expect(checkoutTotals([cards], null, { vatRateBps: 750, vatOnDelivery: true }).totalMinor).toBe(5_643_750n);
  });
});
