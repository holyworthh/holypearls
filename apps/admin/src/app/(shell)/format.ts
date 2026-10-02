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
