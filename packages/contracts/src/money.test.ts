import { describe, expect, it } from "vitest";
import {
  add,
  compare,
  CurrencyMismatchError,
  displayMoney,
  equals,
  fromMajor,
  money,
  multiply,
  subtract,
  sum,
  toMajorString,
} from "./money.js";

describe("money helpers", () => {
  it("stores TECH-05 examples as whole minor units", () => {
    expect(fromMajor("450000.00", "NGN")).toEqual({ amountMinor: 45000000n, currency: "NGN" });
    expect(fromMajor("125.50", "USD")).toEqual({ amountMinor: 12550n, currency: "USD" });
    expect(fromMajor("125.5", "USD").amountMinor).toBe(12550n);
    expect(fromMajor("340000", "NGN").amountMinor).toBe(34000000n);
  });

  it("formats minor units back to exact decimal strings", () => {
    expect(toMajorString(money(45000000n, "NGN"))).toBe("450000.00");
    expect(toMajorString(money(5, "USD"))).toBe("0.05");
    expect(toMajorString(money(-12550, "USD"))).toBe("-125.50");
  });

  it("does not lose precision where floating point would", () => {
    const total = add(fromMajor("0.10", "USD"), fromMajor("0.20", "USD"));
    expect(toMajorString(total)).toBe("0.30");
    expect(toMajorString(multiply(fromMajor("90071992547409.93", "NGN"), 3))).toBe("270215977642229.79");
  });

  it("adds, subtracts, sums and compares in one currency", () => {
    const a = money(44000000n, "NGN");
    const b = money(45000000n, "NGN");
    expect(subtract(b, a).amountMinor).toBe(1000000n);
    expect(sum([a, b], "NGN").amountMinor).toBe(89000000n);
    expect(sum([], "NGN").amountMinor).toBe(0n);
    expect(compare(a, b)).toBe(-1);
    expect(compare(b, a)).toBe(1);
    expect(compare(a, a)).toBe(0);
    expect(equals(a, money(44000000n, "NGN"))).toBe(true);
    expect(equals(money(100, "NGN"), money(100, "USD"))).toBe(false);
  });

  it("never mixes or converts currencies", () => {
    expect(() => add(money(100, "NGN"), money(100, "USD"))).toThrow(CurrencyMismatchError);
    expect(() => compare(money(100, "NGN"), money(100, "USD"))).toThrow(CurrencyMismatchError);
  });

  it("rejects fractional minor units, bad input and unknown currencies", () => {
    expect(() => money(1.5, "NGN")).toThrow(RangeError);
    expect(() => fromMajor("1.005", "NGN")).toThrow(RangeError);
    expect(() => fromMajor("1e3", "NGN")).toThrow(RangeError);
    expect(() => fromMajor("", "NGN")).toThrow(RangeError);
    expect(() => multiply(money(100, "NGN"), 1.5)).toThrow(RangeError);
    expect(() => money(100, "EUR" as never)).toThrow(RangeError);
  });
});

describe("displayMoney", () => {
  it("shows the minor part only when there is one", () => {
    expect(displayMoney(4_730_000n, "NGN")).toBe("₦47,300");
    expect(displayMoney("393750", "NGN")).toBe("₦3,937.50");
    expect(displayMoney("240005", "USD")).toBe("$2,400.05");
    expect(displayMoney(0n, "NGN")).toBe("₦0");
  });
});
