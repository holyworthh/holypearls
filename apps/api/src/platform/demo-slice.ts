import type { DemoSlice } from "@holypearls/contracts";
import { type Database, eq, schema, sql, withTransaction } from "@holypearls/db";
import type { Jobs } from "@holypearls/jobs";

const toDemo = (row: typeof schema.demoSliceRequests.$inferSelect): DemoSlice => ({
  id: row.id,
  status: row.status,
  message: row.message,
  result: row.result,
  attempts: row.attempts,
});

/** Saves the request and queues its job in one transaction (TECH-02 §8). */
export async function createDemoSlice(db: Database, jobs: Jobs, message: string, requestId: string): Promise<DemoSlice> {
  return withTransaction(db, async (tx) => {
    const [row] = await tx.insert(schema.demoSliceRequests).values({ message }).returning();
    await jobs.send("demo.slice", { v: 1, requestId, demoId: row!.id }, { tx });
    return toDemo(row!);
  });
}

export async function findDemoSlice(db: Database, id: string): Promise<DemoSlice | null> {
  const [row] = await db.select().from(schema.demoSliceRequests).where(eq(schema.demoSliceRequests.id, id));
  return row ? toDemo(row) : null;
}

/**
 * The demo job. Safe to run twice: a DONE request is left alone. A message
 * containing "fail" always throws, to show retries and the dead-letter queue.
 */
export async function processDemoSlice(db: Database, demoId: string): Promise<void> {
  const [row] = await db
    .update(schema.demoSliceRequests)
    .set({ attempts: sql`${schema.demoSliceRequests.attempts} + 1` })
    .where(eq(schema.demoSliceRequests.id, demoId))
    .returning();
  if (!row || row.status === "DONE") return;
  if (/fail/i.test(row.message)) throw new Error("Demo job failed on purpose");
  await db
    .update(schema.demoSliceRequests)
    .set({ status: "DONE", result: row.message.toUpperCase() })
    .where(eq(schema.demoSliceRequests.id, demoId));
}

/** Called for a job that used up its retries. */
export async function markDemoSliceFailed(db: Database, demoId: string): Promise<void> {
  await db.update(schema.demoSliceRequests).set({ status: "FAILED" }).where(eq(schema.demoSliceRequests.id, demoId));
}
