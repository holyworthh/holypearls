import { describe, expect, it } from "vitest";
import { applyFix, checkPersonalizationCsv, parseCsv, type Placement, placementConflicts, pixelsNeeded, resolutionCheck } from "./garment.js";

const place = (position: Placement["position"], size: Placement["size"] = "STANDARD", method: Placement["method"] = null, note: string | null = null): Placement => ({ position, size, method, note });

describe("placement conflicts (COM-FR-026)", () => {
  it("accepts separate placements", () => {
    expect(placementConflicts([place("LEFT_CHEST"), place("UPPER_BACK"), place("RIGHT_SLEEVE", "SMALL")], "EMBROIDERY")).toEqual([]);
  });

  it("flags overlapping areas with fixes that change only one placement", () => {
    const placements = [place("FULL_FRONT", "LARGE", "PRINT"), place("LEFT_CHEST"), place("UPPER_BACK")];
    const [conflict] = placementConflicts(placements, "PRINT");
    expect(conflict).toMatchObject({ positions: ["FULL_FRONT", "LEFT_CHEST"] });
    const fixed = applyFix(placements, conflict!.fixes[0]!);
    // The other placements are untouched.
    expect(fixed).toEqual([place("FULL_FRONT", "LARGE", "PRINT"), place("UPPER_BACK")]);
    expect(placementConflicts(fixed, "PRINT")).toEqual([]);
  });

  it("flags a large centre design next to a chest logo, fixed by resizing", () => {
    const placements = [place("CENTRE_CHEST", "LARGE"), place("RIGHT_CHEST")];
    const [conflict] = placementConflicts(placements, "PRINT");
    const fixed = applyFix(placements, conflict!.fixes[0]!);
    expect(fixed[0]).toEqual(place("CENTRE_CHEST", "STANDARD"));
    expect(placementConflicts(fixed, "PRINT")).toEqual([]);
  });

  it("refuses embroidery across a whole front or back, fixed by printing that area", () => {
    const placements = [place("FULL_BACK", "LARGE")];
    const [conflict] = placementConflicts(placements, "EMBROIDERY");
    expect(conflict!.message).toContain("Embroidery can't cover");
    expect(placementConflicts(applyFix(placements, conflict!.fixes[0]!), "EMBROIDERY")).toEqual([]);
  });

  it("keeps sleeves small or standard, and needs a description for a custom position", () => {
    expect(placementConflicts([place("LEFT_SLEEVE", "LARGE")], "PRINT")[0]!.fixes[0]!.change).toEqual({ size: "STANDARD" });
    expect(placementConflicts([place("CUSTOM")], "PRINT")[0]!.message).toBe("Describe where the custom design goes.");
    expect(placementConflicts([place("CUSTOM", "SMALL", null, "Collar back")], "PRINT")).toEqual([]);
  });
});

describe("artwork resolution (COM-FR-051)", () => {
  it("needs about 1,181 pixels for a 10 cm design at 300 DPI", () => {
    expect(pixelsNeeded(100)).toBe(1182);
  });

  it("warns about a small raster file but never about vector files", () => {
    const low = resolutionCheck({ type: "image/png", width: 600 }, [place("LEFT_CHEST")]);
    expect(low).toMatchObject({ ok: false, neededPixels: 1182, actualPixels: 600 });
    expect(resolutionCheck({ type: "image/png", width: 1200 }, [place("LEFT_CHEST")]).ok).toBe(true);
    expect(resolutionCheck({ type: "image/png", width: 1200 }, [place("FULL_BACK", "LARGE")]).ok).toBe(false);
    expect(resolutionCheck({ type: "application/pdf", width: 10 }, [place("FULL_BACK", "LARGE")]).ok).toBe(true);
    expect(resolutionCheck({ type: "image/svg+xml", width: null }, [place("LEFT_CHEST")]).ok).toBe(true);
  });
});

describe("personalization CSV (COM-FR-029)", () => {
  it("parses quotes, doubled quotes, semicolons and Windows line endings", () => {
    expect(parseCsv('name,number\r\n"Ada, Jr",7\r\n"Say ""hi""",8\r\n')).toEqual([["name", "number"], ["Ada, Jr", "7"], ['Say "hi"', "8"]]);
    expect(parseCsv("name;size\nKemi;M\n")).toEqual([["name", "size"], ["Kemi", "M"]]);
  });

  it("checks a 120-row file row by row, with the line number of each problem", () => {
    const lines = ["Name,Number,Department,Size"];
    for (let index = 1; index <= 120; index += 1) lines.push(`Person ${index},${index % 100},Kitchen,${index % 2 ? "M" : "xxl"}`);
    lines[50] = "Too long a name for a shirt back label here,12,Kitchen,M";
    lines[71] = "Tunde,12A,Kitchen,M";
    lines[99] = "Chidi,4,Kitchen,5XL";
    const result = checkPersonalizationCsv(lines.join("\n"));
    expect(result.rows).toHaveLength(120);
    expect(result.rows[1]).toMatchObject({ row: 2, size: "2XL" });
    expect(result.errors).toEqual([
      { row: 51, field: "name", message: "Names can be up to 30 characters." },
      { row: 72, field: "number", message: "Numbers are 1 to 3 digits." },
      { row: 100, field: "size", message: "Size 5XL isn't one of XS, S, M, L, XL, 2XL, 3XL, 4XL." },
    ]);
  });

  it("accepts any column order and a subset of columns", () => {
    const result = checkPersonalizationCsv("size,name\nL,Ada\nXXXL,Tunde\n");
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { row: 1, name: "Ada", number: null, department: null, size: "L" },
      { row: 2, name: "Tunde", number: null, department: null, size: "3XL" },
    ]);
  });

  it("explains a missing header, empty rows and too many rows", () => {
    expect(checkPersonalizationCsv("foo,bar\n1,2").errors[0]!.field).toBe("header");
    expect(checkPersonalizationCsv("").errors[0]!.message).toBe("The file is empty.");
    expect(checkPersonalizationCsv("name,size\n,M\n").errors).toEqual([{ row: 2, field: "row", message: "Add a name, number or department." }]);
    expect(checkPersonalizationCsv("name\na\nb\nc", 2).errors[0]!.message).toBe("Up to 2 rows at a time.");
  });
});
