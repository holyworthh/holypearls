import { loadTestDatabaseEnv } from "@holypearls/config";
import { runMigrations, withTransaction } from "@holypearls/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./database.js";

const { TEST_DATABASE_URL } = loadTestDatabaseEnv();

async function count(database: TestDatabase): Promise<number> {
  const result = await database.db.execute<{ n: number }>(sql`select count(*)::int as n from scratch`);
  return result.rows[0]?.n ?? -1;
}

describe("test databases", () => {
  let first: TestDatabase;
  let second: TestDatabase;

  beforeAll(async () => {
    [first, second] = await Promise.all([createTestDatabase(TEST_DATABASE_URL), createTestDatabase(TEST_DATABASE_URL)]);
    for (const database of [first, second]) {
      await database.db.execute(sql`create table scratch (id int primary key)`);
    }
  });

  afterAll(async () => {
    await Promise.all([first?.drop(), second?.drop()]);
  });

  it("migrates each new database from empty", async () => {
    const result = await first.db.execute<{ n: number }>(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    expect(result.rows[0]?.n).toBeGreaterThan(0);
  });

  it("re-running migrations on an up-to-date database changes nothing", async () => {
    await expect(runMigrations(first.url)).resolves.toBeUndefined();
  });

  it("keeps data in one test database out of another", async () => {
    expect(first.url).not.toBe(second.url);
    await first.db.execute(sql`insert into scratch (id) values (1)`);
    expect(await count(first)).toBe(1);
    expect(await count(second)).toBe(0);
  });

  it("rolls back every write when a transaction fails", async () => {
    await expect(
      withTransaction(second.db, async (tx) => {
        await tx.execute(sql`insert into scratch (id) values (10)`);
        throw new Error("stop");
      }),
    ).rejects.toThrow("stop");
    expect(await count(second)).toBe(0);
  });

  it("commits writes when the transaction succeeds", async () => {
    const value = await withTransaction(second.db, async (tx) => {
      await tx.execute(sql`insert into scratch (id) values (20)`);
      return "done";
    });
    expect(value).toBe("done");
    expect(await count(second)).toBe(1);
  });
});
