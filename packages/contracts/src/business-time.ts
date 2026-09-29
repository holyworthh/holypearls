/*
 * HolyPearls works in Lagos. Calendar dates that depend on "today" (the
 * needed-by filter, its earliest date, lead-time counts) use the Lagos date,
 * never the server's or UTC's: they differ between 23:00 and 24:00 UTC.
 */
export const BUSINESS_TIME_ZONE = "Africa/Lagos";

/** The calendar date (YYYY-MM-DD) in the business time zone at `now`. */
export function businessDate(now: Date, timeZone: string = BUSINESS_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD; Intl does the time-zone conversion.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
