import { describe, expect, it } from "vitest";
import { newId } from "./ids.js";

describe("newId", () => {
  it("creates UUIDv7 values", () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("creates unique, time-ordered values", () => {
    const ids = Array.from({ length: 1000 }, newId);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});
