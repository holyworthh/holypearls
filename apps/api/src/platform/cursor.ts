import { type AnyColumn, desc, type SQL, sql } from "@holypearls/db";

/*
 * Keyset paging on (time, id), newest first (TECH-02 §3). Postgres keeps
 * microseconds but a JavaScript Date keeps milliseconds, so both the order and
 * the comparison use millisecond precision; otherwise rows written in the same
 * millisecond fall between pages.
 */
const toMs = (column: AnyColumn) => sql`date_trunc('milliseconds', ${column})`;

export const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");

/** Rows after the cursor, or undefined when the cursor is missing or unreadable. */
export function afterCursor(time: AnyColumn, id: AnyColumn, cursor: string | undefined): SQL | undefined {
  if (!cursor) return undefined;
  const [at, lastId] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const date = new Date(at ?? "");
  if (!lastId || !/^[0-9a-f-]{36}$/i.test(lastId) || Number.isNaN(date.getTime())) return undefined;
  return sql`(${toMs(time)}, ${id}) < (${date.toISOString()}::timestamptz, ${lastId}::uuid)`;
}

export const newestFirst = (time: AnyColumn, id: AnyColumn) => [desc(toMs(time)), desc(id)];

/** Splits limit + 1 rows into the page and the next cursor. */
export function pageOf<T>(rows: T[], limit: number, key: (row: T) => { at: Date; id: string }) {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { page, nextCursor: rows.length > limit && last ? encodeCursor(key(last).at, key(last).id) : null };
}
