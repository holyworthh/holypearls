import { loadTestDatabaseEnv } from "@holypearls/config";
import { migrationsFolder, migrationTags, missingSchema, runMigrations, withTransaction } from "@holypearls/db";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

/*
 * A deploy applies every pending migration in one transaction. Postgres
 * refuses to use an enum value added in that same transaction unless the type
 * was created there too, so a fresh database can pass while an existing one
 * fails (staging, 30 Sep 2026). Start just before each migration that adds an
 * enum value and catch up in one go, as a deploy does.
 */
describe("existing databases catch up in one deploy", () => {
  const tags = migrationTags();
  const addsEnumValue = tags
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => /ADD VALUE/i.test(readFileSync(join(migrationsFolder, `${tag}.sql`), "utf8")));

  it.each(addsEnumValue)("from just before $tag", async ({ index }) => {
    const database = await createTestDatabase(TEST_DATABASE_URL, { migrations: index });
    try {
      await expect(runMigrations(database.url)).resolves.toBeUndefined();
    } finally {
      await database.drop();
    }
  }, 180_000);
});

/*
 * Every test database is fully migrated, so tests never see code running ahead
 * of its database. The API and worker check on start instead (local dev, 24 Oct
 * 2026: incident_switches merged, migration not run, every write returned 500).
 */
describe("schema check on start", () => {
  it("passes on a fully migrated database", async () => {
    const database = await createTestDatabase(TEST_DATABASE_URL);
    try {
      expect(await missingSchema(database.db)).toEqual([]);
    } finally {
      await database.drop();
    }
  });

  it("names what's missing when the last migration hasn't run", async () => {
    const database = await createTestDatabase(TEST_DATABASE_URL, { migrations: migrationTags().length - 1 });
    try {
      expect(await missingSchema(database.db)).not.toEqual([]);
    } finally {
      await database.drop();
    }
  }, 180_000);
});
