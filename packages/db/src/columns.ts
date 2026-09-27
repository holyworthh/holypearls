import { bigint, char, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { newId } from "./ids.js";

/** UUIDv7 primary key. */
export const idColumn = () => uuid("id").primaryKey().$defaultFn(newId);

/** Every table has created_at; editable tables also get updated_at (TECH-01 §1). */
export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Optimistic-locking counter for records several people may edit at once. */
export const versionColumn = () => integer("version").notNull().default(1);

/** Money is whole minor units plus an ISO currency code, never floating point. */
export const amountMinorColumn = (name = "amount_minor") => bigint(name, { mode: "bigint" }).notNull();

export const currencyColumn = (name = "currency") => char(name, { length: 3 }).notNull();
