import { describe, expect, it } from "vitest";
import { mergeMostOrdered } from "./most-ordered.js";

describe('"Most ordered" follows real orders (owner, 2026-10-05)', () => {
  it("lists products by how many orders included them, most first", () => {
    expect(mergeMostOrdered([{ productId: "b", orders: 9 }, { productId: "a", orders: 3 }], [], 8)).toEqual(["b", "a"]);
  });

  it("fills the remaining places from the staff list, without repeats, until there are enough orders", () => {
    expect(mergeMostOrdered([{ productId: "c", orders: 2 }], ["a", "c", "d"], 3)).toEqual(["c", "a", "d"]);
  });

  it("uses the staff list alone before the first order", () => {
    expect(mergeMostOrdered([], ["a", "b"], 8)).toEqual(["a", "b"]);
  });

  it("keeps to the list's size", () => {
    expect(mergeMostOrdered([1, 2, 3, 4].map((n) => ({ productId: `p${n}`, orders: 10 - n })), ["x"], 2)).toEqual(["p1", "p2"]);
  });
});
