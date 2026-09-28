import { z } from "zod";
import { CURRENCIES, money, type Money } from "./money.js";

/**
 * Money on the wire: `bigint` is not JSON, so `amountMinor` travels as a
 * string of digits (TECH-05 §2). `moneyWireSchema` parses it back to `Money`.
 */
export const moneyWireSchema = z
  .object({
    amountMinor: z.string().regex(/^-?\d+$/, "Enter a whole number of minor units"),
    currency: z.enum(CURRENCIES),
  })
  .transform((value): Money => money(BigInt(value.amountMinor), value.currency));

export type MoneyWire = z.input<typeof moneyWireSchema>;

export const toMoneyWire = (value: Money): MoneyWire => ({
  amountMinor: value.amountMinor.toString(),
  currency: value.currency,
});
