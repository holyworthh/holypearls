/**
 * Money is whole minor units (kobo, cents) plus an ISO currency code. Never
 * floating point, and never converted between currencies (TECH-05 §2).
 */
export const CURRENCIES = ["NGN", "USD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

const MINOR_DIGITS: Record<CurrencyCode, number> = { NGN: 2, USD: 2 };

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
}

export class CurrencyMismatchError extends Error {
  constructor(left: CurrencyCode, right: CurrencyCode) {
    super(`Cannot combine ${left} and ${right} amounts`);
    this.name = "CurrencyMismatchError";
  }
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (CURRENCIES as readonly string[]).includes(value);
}

export function money(amountMinor: bigint | number, currency: CurrencyCode): Money {
  if (typeof amountMinor === "number" && !Number.isSafeInteger(amountMinor)) {
    throw new RangeError("Money amounts must be whole minor units");
  }
  if (!isCurrencyCode(currency)) {
    throw new RangeError(`Unsupported currency: ${String(currency)}`);
  }
  return { amountMinor: BigInt(amountMinor), currency };
}

export const zero = (currency: CurrencyCode): Money => money(0n, currency);

/** Parses a decimal string such as "450000.00" exactly. Rejects extra decimal places. */
export function fromMajor(value: string, currency: CurrencyCode): Money {
  const digits = MINOR_DIGITS[currency];
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    throw new RangeError(`Not a decimal amount: ${value}`);
  }
  const [, sign, whole = "0", fraction = ""] = match;
  if (fraction.length > digits) {
    throw new RangeError(`${currency} amounts have at most ${digits} decimal places`);
  }
  const minor = BigInt(whole + fraction.padEnd(digits, "0"));
  return money(sign ? -minor : minor, currency);
}

/** Formats as a plain decimal string, for example 45000000 NGN → "450000.00". */
export function toMajorString(value: Money): string {
  const digits = MINOR_DIGITS[value.currency];
  const negative = value.amountMinor < 0n;
  const text = (negative ? -value.amountMinor : value.amountMinor).toString().padStart(digits + 1, "0");
  const whole = text.slice(0, text.length - digits);
  const fraction = text.slice(text.length - digits);
  return `${negative ? "-" : ""}${whole}${digits > 0 ? `.${fraction}` : ""}`;
}

/** For people to read: ₦47,300 or $3,937.50; the minor part only when there is one. */
export function displayMoney(minor: bigint | string, currency: string): string {
  const value = BigInt(minor);
  const symbol = currency === "USD" ? "$" : "₦";
  const whole = value / 100n;
  const fraction = value % 100n;
  return `${symbol}${whole.toLocaleString("en-NG")}${fraction ? `.${fraction.toString().padStart(2, "0")}` : ""}`;
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new CurrencyMismatchError(left.currency, right.currency);
  }
}

export function add(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amountMinor + right.amountMinor, left.currency);
}

export function subtract(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amountMinor - right.amountMinor, left.currency);
}

/** Multiplies by a whole quantity, for example a unit price by 250 badges. */
export function multiply(value: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity)) {
    throw new RangeError("Quantity must be a whole number");
  }
  return money(value.amountMinor * BigInt(quantity), value.currency);
}

export function sum(values: readonly Money[], currency: CurrencyCode): Money {
  return values.reduce(add, zero(currency));
}

export function compare(left: Money, right: Money): -1 | 0 | 1 {
  assertSameCurrency(left, right);
  if (left.amountMinor === right.amountMinor) return 0;
  return left.amountMinor < right.amountMinor ? -1 : 1;
}

export const equals = (left: Money, right: Money): boolean =>
  left.currency === right.currency && left.amountMinor === right.amountMinor;
