// Pen shows "27 SEP 14:10" in Lagos time.
const time = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Lagos",
});

export const formatTime = (iso: string) => {
  const part = Object.fromEntries(time.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]));
  return `${part.day} ${String(part.month).toUpperCase()} ${part.hour}:${part.minute}`;
};

/** "12 min", "3 h", "2 d": how long ago, for inbox lists. */
export function ago(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

/** ₦450,000.00 or $2,400.00, from minor units (admin lists always show kobo). */
export function money(minor: string, currency: string) {
  const value = BigInt(minor);
  const symbol = currency.trim() === "USD" ? "$" : "₦";
  return `${symbol}${(value / 100n).toLocaleString("en-NG")}.${(value % 100n).toString().padStart(2, "0")}`;
}

/** "Crew polo shirts" → "crew-polo-shirts": a slug suggestion from a name, at most 80 characters. */
export const toSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");

/** Whole naira → kobo string; "6,500" and "6500.50" both work. Null when it isn't an amount. */
export function toKobo(value: string): string | null {
  const clean = value.replace(/[₦,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  return (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

/** Kobo → what staff type: "9600" or "9600.50". */
export function toNaira(minor: string) {
  const value = BigInt(minor);
  return value % 100n === 0n ? (value / 100n).toString() : `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
