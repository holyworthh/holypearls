import { describe, expect, it } from "vitest";
import { garmentChoices, unavailableGarmentChoices } from "./capabilities.js";

/*
 * The one rule that maps a product's stored capabilities (products.routes,
 * products.decorations) to the garment configurator's choices (COM-FR-020, 024).
 */

describe("garment sourcing choices (COM-FR-020)", () => {
  it("offers only the product's routes, in a fixed order, then Help Me Choose", () => {
    expect(garmentChoices({ routes: ["CUSTOMER_SUPPLIED", "SOURCE_CUSTOMIZE"], decorations: [] }).sourcing).toEqual([
      "SOURCE_CUSTOMIZE",
      "CUSTOMER_SUPPLIED",
      "HELP_ME_CHOOSE",
    ]);
  });

  it("keeps Help Me Choose as an assistance state, even for a product with no routes set", () => {
    expect(garmentChoices({ routes: [], decorations: [] }).sourcing).toEqual(["HELP_ME_CHOOSE"]);
  });
});

describe("garment decoration choices (COM-FR-024)", () => {
  it("maps embroidery and the garment print methods; paper and large-format printing are not garment print", () => {
    expect(garmentChoices({ routes: [], decorations: ["EMBROIDERY"] }).decoration).toEqual(["EMBROIDERY", "RECOMMEND"]);
    expect(garmentChoices({ routes: [], decorations: ["SCREEN_PRINT"] }).decoration).toEqual(["PRINT", "RECOMMEND"]);
    expect(garmentChoices({ routes: [], decorations: ["HEAT_TRANSFER"] }).decoration).toEqual(["PRINT", "RECOMMEND"]);
    expect(garmentChoices({ routes: [], decorations: ["PAPER_PRINT", "LARGE_FORMAT_PRINT"] }).decoration).toEqual([]);
  });

  it("offers Both only with embroidery and at least one garment print method", () => {
    expect(garmentChoices({ routes: [], decorations: ["EMBROIDERY", "HEAT_TRANSFER"] }).decoration).toEqual(["EMBROIDERY", "PRINT", "BOTH", "RECOMMEND"]);
    expect(garmentChoices({ routes: [], decorations: ["SCREEN_PRINT", "HEAT_TRANSFER"] }).decoration).not.toContain("BOTH");
  });

  it("offers Recommend for Me only when there is something to recommend", () => {
    expect(garmentChoices({ routes: [], decorations: [] }).decoration).toEqual([]);
  });
});

describe("saved answers the product no longer offers", () => {
  const product = { routes: ["SOURCE_CUSTOMIZE"], decorations: ["EMBROIDERY"] };

  it("lists a removed route and decoration without changing the answers", () => {
    expect(unavailableGarmentChoices(product, { sourcing: "MAKE_FROM_SCRATCH", decoration: "PRINT", placements: [] })).toEqual([
      { field: "sourcing", value: "MAKE_FROM_SCRATCH", message: "Make From Scratch isn't available for this product any more. Choose another way to make it." },
      { field: "decoration", value: "PRINT", message: "Print isn't available for this product any more. Choose another decoration." },
    ]);
  });

  it("lists a placement method the product no longer offers", () => {
    expect(unavailableGarmentChoices(product, { sourcing: null, decoration: null, placements: [{ position: "FULL_BACK", method: "PRINT" }] })).toEqual([
      { field: "placements.FULL_BACK", value: "PRINT", message: "Print isn't available for this product any more. Choose another method for this placement." },
    ]);
  });

  it("is empty when every answer is offered, and for unanswered questions", () => {
    expect(unavailableGarmentChoices(product, { sourcing: "SOURCE_CUSTOMIZE", decoration: "RECOMMEND", placements: [] })).toEqual([]);
    expect(unavailableGarmentChoices(product, { sourcing: "HELP_ME_CHOOSE", decoration: null, placements: [{ position: "LEFT_CHEST", method: null }] })).toEqual([]);
  });
});
