import { describe, expect, it } from "vitest";
import { quoteTotals, schedulePayments } from "./quote-math.js";

/*
 * Quote money (TECH-05 §1–4, PAY-FR-001–002): the server works out every
 * total, and a schedule must add up to the quote total exactly.
 */

const fees = { designMinor: 2_500_000n, deliveryMinor: 650_000n, installationMinor: 4_500_000n, otherMinor: 0n };

describe("quote totals", () => {
  it("matches Pen 111: items, fees and VAT at 7.5% on both", () => {
    const totals = quoteTotals(
      [
        { quantity: 60, unitMinor: 1_010_000n },
        { quantity: 300, unitMinor: 145_000n },
        { quantity: 4, unitMinor: 6_800_000n },
        { quantity: 1, unitMinor: 31_000_000n },
      ],
      fees,
      { vatRateBps: 750, vatOnDelivery: true },
    );
    expect(totals).toEqual({ goodsMinor: 162_300_000n, feesMinor: 7_650_000n, vatMinor: 12_746_250n, totalMinor: 182_696_250n });
  });

  it("leaves delivery out of VAT when the setting says so, rounding half up", () => {
    const totals = quoteTotals([{ quantity: 3, unitMinor: 333n }], { ...fees, designMinor: 0n, installationMinor: 0n }, { vatRateBps: 750, vatOnDelivery: false });
    // VAT on 999 kobo is 74.925 → 75.
    expect(totals).toEqual({ goodsMinor: 999n, feesMinor: 650_000n, vatMinor: 75n, totalMinor: 651_074n });
  });
});

describe("payment schedule", () => {
  const deposit = { label: "Deposit", kind: "PERCENT" as const, value: "6500", trigger: "ON_ACCEPTANCE" as const };
  const balance = { label: "Balance", kind: "PERCENT" as const, value: "3500", trigger: "BEFORE_DISPATCH" as const };

  it("splits by percentage, giving any rounding to the last percentage payment (Pen 25: 65/35 of ₦850,000)", () => {
    expect(schedulePayments(85_000_000n, [deposit, balance])).toEqual({
      ok: true,
      payments: [
        { label: "Deposit", trigger: "ON_ACCEPTANCE", dueDate: null, percentBps: 6500, amountMinor: 55_250_000n },
        { label: "Balance", trigger: "BEFORE_DISPATCH", dueDate: null, percentBps: 3500, amountMinor: 29_750_000n },
      ],
    });
    const odd = schedulePayments(100n, [
      { ...deposit, value: "3333" },
      { ...deposit, label: "Second", value: "3333" },
      { ...balance, value: "3334" },
    ]);
    expect(odd.ok && odd.payments.map((payment) => payment.amountMinor)).toEqual([33n, 33n, 34n]);
  });

  it("allows fixed amounts beside percentages when they add up exactly", () => {
    const result = schedulePayments(10_000_000n, [{ label: "Sample", kind: "AMOUNT", value: "2000000", trigger: "ON_ACCEPTANCE" }, { ...balance, value: "8000" }]);
    expect(result.ok && result.payments.map((payment) => payment.amountMinor)).toEqual([2_000_000n, 8_000_000n]);
  });

  it.each([
    { name: "percentages under 100%", entries: [{ ...deposit, value: "5000" }, { ...balance, value: "4000" }], message: "The payments add up to 90% of the total. They must add up to 100%." },
    { name: "fixed amounts over the total", entries: [{ label: "All", kind: "AMOUNT" as const, value: "20000000", trigger: "ON_ACCEPTANCE" as const }], message: "The payments add up to more than the quote total." },
    { name: "amounts that leave money unpaid", entries: [{ label: "Part", kind: "AMOUNT" as const, value: "5000000", trigger: "ON_ACCEPTANCE" as const }], message: "The payments add up to less than the quote total." },
    { name: "a zero payment", entries: [{ ...deposit, value: "0" }, { ...balance, value: "10000" }], message: "Every payment needs an amount." },
  ])("refuses $name", ({ entries, message }) => {
    expect(schedulePayments(10_000_000n, entries)).toEqual({ ok: false, problem: message });
  });
});
