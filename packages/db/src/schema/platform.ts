import { integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, idColumn, updatedAt } from "../columns.js";

export const demoSliceStatus = pgEnum("demo_slice_status", ["PENDING", "DONE", "FAILED"]);

/**
 * T00-04 end-to-end slice (TECH-00 §14): one request goes web → API →
 * database → background job → visible result. Demo data only; the routes that
 * use it are off in production.
 */
export const demoSliceRequests = pgTable("demo_slice_requests", {
  id: idColumn(),
  message: text("message").notNull(),
  status: demoSliceStatus("status").notNull().default("PENDING"),
  result: text("result"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
