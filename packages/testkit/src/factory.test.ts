import { describe, expect, it } from "vitest";
import { defineFactory } from "./factory.js";

describe("defineFactory", () => {
  const customerFactory = defineFactory((n) => ({
    email: `customer-${n}@example.test`,
    name: `TEST DATA Customer ${n}`,
  }));

  it("builds records with unique defaults", () => {
    const [a, b] = customerFactory.buildMany(2);
    expect(a?.email).not.toBe(b?.email);
  });

  it("applies overrides", () => {
    expect(customerFactory.build({ name: "Ada" })).toMatchObject({ name: "Ada" });
  });
});
