import type { InstallmentTrigger, ScheduleEntry } from "@holypearls/contracts";

/*
 * Quote money (TECH-05 §1–4). Unit prices on a quote are before VAT. VAT is
 * charged on the items and the design, installation and other fees, and on
 * delivery only when the tax setting says so (as checkout does), rounded half
 * up once on the total.
 */

export interface QuoteFeeAmounts {
  designMinor: bigint;
  deliveryMinor: bigint;
  installationMinor: bigint;
  otherMinor: bigint;
}

export function quoteTotals(lines: { quantity: number; unitMinor: bigint }[], fees: QuoteFeeAmounts, tax: { vatRateBps: number; vatOnDelivery: boolean }) {
  const goodsMinor = lines.reduce((sum, line) => sum + BigInt(line.quantity) * line.unitMinor, 0n);
  const feesMinor = fees.designMinor + fees.deliveryMinor + fees.installationMinor + fees.otherMinor;
  const taxable = goodsMinor + feesMinor - (tax.vatOnDelivery ? 0n : fees.deliveryMinor);
  const vatMinor = (taxable * BigInt(tax.vatRateBps) + 5_000n) / 10_000n;
  return { goodsMinor, feesMinor, vatMinor, totalMinor: goodsMinor + feesMinor + vatMinor };
}

export interface ScheduledPayment {
  label: string;
  trigger: InstallmentTrigger;
  dueDate: string | null;
  percentBps: number | null;
  amountMinor: bigint;
}

/**
 * Turns a schedule into money (PAY-FR-001–002). Fixed amounts are taken as
 * they are; percentages share what's left and must cover all of it, so the
 * payments always add up to the quote total exactly. Rounding goes to the
 * last percentage payment.
 */
export function schedulePayments(totalMinor: bigint, entries: ScheduleEntry[]): { ok: true; payments: ScheduledPayment[] } | { ok: false; problem: string } {
  if (entries.some((entry) => BigInt(entry.value) <= 0n)) return { ok: false, problem: "Every payment needs an amount." };
  const fixed = entries.filter((entry) => entry.kind === "AMOUNT").reduce((sum, entry) => sum + BigInt(entry.value), 0n);
  const percents = entries.filter((entry) => entry.kind === "PERCENT");
  const bps = percents.reduce((sum, entry) => sum + BigInt(entry.value), 0n);
  if (fixed > totalMinor) return { ok: false, problem: "The payments add up to more than the quote total." };
  if (!percents.length) {
    if (fixed < totalMinor) return { ok: false, problem: "The payments add up to less than the quote total." };
  } else if (fixed === 0n) {
    if (bps !== 10_000n) return { ok: false, problem: `The payments add up to ${Number(bps) / 100}% of the total. They must add up to 100%.` };
  } else if (bps * totalMinor !== (totalMinor - fixed) * 10_000n) {
    return { ok: false, problem: "The fixed amounts and percentages don't add up to the quote total." };
  }
  const lastPercent = entries.lastIndexOf(percents[percents.length - 1]!);
  let assigned = 0n;
  const payments = entries.map((entry, index): ScheduledPayment => {
    const amountMinor = entry.kind === "AMOUNT" ? BigInt(entry.value) : (totalMinor * BigInt(entry.value)) / 10_000n;
    if (index !== lastPercent) assigned += amountMinor;
    return { label: entry.label, trigger: entry.trigger, dueDate: entry.dueDate ?? null, percentBps: entry.kind === "PERCENT" ? Number(entry.value) : null, amountMinor };
  });
  if (lastPercent >= 0) payments[lastPercent]!.amountMinor = totalMinor - assigned;
  return { ok: true, payments };
}
