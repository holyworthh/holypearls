import { describe, expect, it } from "vitest";
import { workingDaysUntil } from "./storefront.js";

/* Needed-by filter (Pen 17): Monday–Friday days after today, counted in Lagos. */

const at = (iso: string) => ({ now: new Date(iso), timeZone: "Africa/Lagos" });

describe("working days until a needed-by date", () => {
  it("counts from Lagos's date at the 23:30 UTC / 00:30 Lagos boundary", () => {
    // Thursday 1 October 23:30 UTC is already Friday 2 October in Lagos, so Monday 5 October is 1 working day away, not 2.
    expect(workingDaysUntil("2026-10-05", at("2026-10-01T23:30:00Z"))).toBe(1);
    expect(workingDaysUntil("2026-10-05", at("2026-10-01T22:30:00Z"))).toBe(2);
  });

  it("skips the weekend from Friday to Monday", () => {
    expect(workingDaysUntil("2026-10-05", at("2026-10-02T09:00:00Z"))).toBe(1);
  });

  it("counts no working days on a Saturday or Sunday", () => {
    expect(workingDaysUntil("2026-10-03", at("2026-10-02T09:00:00Z"))).toBe(0);
    expect(workingDaysUntil("2026-10-04", at("2026-10-02T09:00:00Z"))).toBe(0);
    expect(workingDaysUntil("2026-10-06", at("2026-10-03T09:00:00Z"))).toBe(2);
  });

  it("is zero for a same-day needed-by", () => {
    expect(workingDaysUntil("2026-10-02", at("2026-10-02T09:00:00Z"))).toBe(0);
  });

  it("uses Lagos by default, whatever the server's time zone", () => {
    expect(workingDaysUntil("2026-10-05", { now: new Date("2026-10-01T23:30:00Z") })).toBe(1);
  });
});
