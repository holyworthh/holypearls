import { describe, expect, it } from "vitest";
import { addWorkingDays, areaSqM, familyAdjustments, type LeadRules, productionDays, timingAdjustments, timingFor } from "./families.js";

const monday = new Date("2026-10-05T09:00:00Z");
const rollUp: LeadRules = { leadMinDays: 1, leadMaxDays: 4, rush: "AVAILABLE", priorityRush: "MANUAL_REVIEW" };
const codes = (list: { code: string }[]) => list.map((item) => item.code);

describe("family answers (COM-FR-045–047)", () => {
  it("large format: custom sizes and installation need a quote; print only and delivered don't", () => {
    expect(familyAdjustments("LARGE_FORMAT", { sizeMode: "STANDARD", service: "PRINT_ONLY" })).toEqual([]);
    expect(familyAdjustments("LARGE_FORMAT", { service: "DELIVERED" })).toEqual([]);
    const custom = familyAdjustments("LARGE_FORMAT", { sizeMode: "CUSTOM", widthCm: 300, heightCm: 150, service: "INSTALLATION" });
    expect(codes(custom)).toEqual(["CUSTOM_SIZE", "INSTALLATION"]);
    expect(custom.every((item) => item.state === "QUOTE_REQUIRED")).toBe(true);
    expect(custom[0]!.message).toContain("4.5 m²");
  });

  it("packaging, promotional and embroidery answers", () => {
    expect(familyAdjustments("PACKAGING", { packagingType: "STANDARD" })).toEqual([]);
    expect(familyAdjustments("PACKAGING", { packagingType: "CUSTOM" })[0]).toMatchObject({ state: "QUOTE_REQUIRED", code: "CUSTOM_PACKAGING" });
    expect(familyAdjustments("PROMOTIONAL_ITEM", { promoSource: "CATALOGUE" })).toEqual([]);
    expect(familyAdjustments("PROMOTIONAL_ITEM", { promoSource: "SOURCE_SIMILAR" })[0]).toMatchObject({ state: "QUOTE_REQUIRED", code: "SOURCING" });
    expect(familyAdjustments("EMBROIDERY", { garmentOwner: "OURS" })).toEqual([]);
    expect(familyAdjustments("EMBROIDERY", { garmentOwner: "CUSTOMER" })[0]).toMatchObject({ state: "ESTIMATE_READY", code: "FINAL_AFTER_INSPECTION" });
    // Answers for another family are ignored.
    expect(familyAdjustments("PAPER_PRINT", { packagingType: "CUSTOM", sizeMode: "CUSTOM" })).toEqual([]);
  });

  it("international delivery needs a quote for freight, for every family", () => {
    for (const family of ["PAPER_PRINT", "GARMENT", "LARGE_FORMAT"]) {
      expect(familyAdjustments(family, { destination: "INTERNATIONAL" })).toEqual([expect.objectContaining({ state: "QUOTE_REQUIRED", code: "INTERNATIONAL_FREIGHT" })]);
    }
  });

  it("area in square metres", () => {
    expect(areaSqM(85, 200)).toBe(1.7);
    expect(areaSqM(undefined, 200)).toBeNull();
  });
});

describe("timing (COM-FR-060, 070–072)", () => {
  it("counts working days only", () => {
    expect(addWorkingDays(new Date("2026-10-09T12:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(addWorkingDays(monday, 5).toISOString().slice(0, 10)).toBe("2026-10-12");
  });

  it("rush and priority shorten production like the calculator", () => {
    expect(productionDays(rollUp, "STANDARD")).toEqual({ min: 1, max: 4 });
    expect(productionDays(rollUp, "RUSH")).toEqual({ min: 1, max: 3 });
    expect(productionDays(rollUp, "PRIORITY")).toEqual({ min: 1, max: 2 });
    expect(productionDays({ ...rollUp, rush: "NONE" }, "RUSH")).toBeNull();
  });

  it("shows production and transit separately", () => {
    const timing = timingFor(rollUp, "STANDARD", { destination: "NIGERIA" }, monday);
    expect(timing).toMatchObject({ production: { min: 1, max: 4 }, transit: { min: 2, max: 5 }, transitQuoted: false, verdict: "NO_DEADLINE", expectedBy: "2026-10-16" });
    expect(timingFor(rollUp, "STANDARD", {}, monday)).toMatchObject({ transit: null, expectedBy: "2026-10-09" });
  });

  it("checks a deadline: on time, rush needed, or review", () => {
    // Standard to Lagos: 4 + 2 working days → 13 Oct.
    expect(timingFor(rollUp, "STANDARD", { destination: "LAGOS", deadline: "2026-10-20" }, monday)).toMatchObject({ verdict: "ON_TIME" });
    expect(timingFor(rollUp, "STANDARD", { destination: "LAGOS", deadline: "2026-10-12" }, monday)).toMatchObject({ verdict: "RUSH_NEEDED", suggestedRush: "RUSH" });
    expect(timingFor(rollUp, "STANDARD", { destination: "LAGOS", deadline: "2026-10-09" }, monday)).toMatchObject({ verdict: "RUSH_NEEDED", suggestedRush: "PRIORITY" });
    const tight = timingFor(rollUp, "STANDARD", { destination: "LAGOS", deadline: "2026-10-07" }, monday);
    expect(tight.verdict).toBe("REVIEW");
    expect(timingAdjustments(tight)).toEqual([expect.objectContaining({ state: "ESTIMATE_READY", code: "DEADLINE_REVIEW" })]);
    // Once rush is chosen and fits, it's on time.
    expect(timingFor(rollUp, "RUSH", { destination: "LAGOS", deadline: "2026-10-12" }, monday)).toMatchObject({ verdict: "ON_TIME" });
  });

  it("international: transit is quoted and the date is confirmed in the quote", () => {
    const timing = timingFor(rollUp, "STANDARD", { destination: "INTERNATIONAL", country: "Ghana", deadline: "2026-12-01" }, monday);
    expect(timing).toMatchObject({ transit: null, transitQuoted: true, verdict: "REVIEW" });
    // The freight quote already covers it; no second reason.
    expect(timingAdjustments(timing)).toEqual([]);
  });
});
