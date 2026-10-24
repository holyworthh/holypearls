import { describe, expect, it } from "vitest";
import { siteEventFor } from "./search.js";

describe("siteEventFor (PRD-01 §11)", () => {
  it("counts product, category and project links", () => {
    expect(siteEventFor("/", "/products/polo-shirt")).toEqual({ kind: "PRODUCT", fromGuide: false });
    expect(siteEventFor("/", "/categories/x")?.kind).toBe("CATEGORY");
    expect(siteEventFor("/", "/projects/event-branding")?.kind).toBe("PROJECT");
  });

  it("counts Start a Project and contact, but not a project already started", () => {
    expect(siteEventFor("/", "/start")?.kind).toBe("START_PROJECT");
    expect(siteEventFor("/", "/start/abc/scale")).toBeNull();
    expect(siteEventFor("/", "/contact")?.kind).toBe("CONTACT");
  });

  it("ignores everything else", () => {
    expect(siteEventFor("/", "/products")).toBeNull();
    expect(siteEventFor("/", "/products/polo-shirt/configure")).toBeNull();
    expect(siteEventFor("/", "/account")).toBeNull();
  });

  it("marks clicks that start on a guide", () => {
    expect(siteEventFor("/resources/flyer-sizes-explained", "/products/flyers")?.fromGuide).toBe(true);
    expect(siteEventFor("/", "/products/flyers")?.fromGuide).toBe(false);
  });
});
