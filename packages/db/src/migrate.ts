import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { is, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { createDatabaseClient, type Database } from "./client.js";
import * as schema from "./schema/index.js";

export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

interface Journal {
  entries: { idx: number; tag: string }[];
}

/** The committed migrations, in order (from drizzle's journal). */
export function migrationTags(): string[] {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")) as Journal;
  return journal.entries.map((entry) => entry.tag);
}

/**
 * Applies every committed migration that has not run yet, in one transaction.
 * `count` stops after the first `count` migrations, so tests can recreate a
 * database that an earlier release left behind.
 */
export async function runMigrations(connectionString: string, options: { count?: number } = {}): Promise<void> {
  let folder = migrationsFolder;
  let temporary: string | null = null;
  if (options.count !== undefined) {
    temporary = mkdtempSync(join(tmpdir(), "hp-migrations-"));
    cpSync(migrationsFolder, temporary, { recursive: true });
    const journalPath = join(temporary, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, options.count) }));
    folder = temporary;
  }
  const client = createDatabaseClient(connectionString, { max: 1 });
  try {
    await migrate(client.db, { migrationsFolder: folder });
  } finally {
    await client.close();
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}

/**
 * Tables and columns the code expects that the database lacks, or an empty
 * list. Non-empty means migrations haven't been applied, so the API and worker
 * refuse to start rather than answer 500s. Reads the Postgres catalog, which
 * the row-only runtime role can see (it can't read drizzle's own table).
 */
export async function missingSchema(db: Database): Promise<string[]> {
  const result = await db.execute<{ table_name: string; column_name: string }>(sql`
    select c.relname as table_name, a.attname as column_name
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped`);
  const tables = new Set(result.rows.map((row) => row.table_name));
  const columns = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing: string[] = [];
  for (const table of Object.values(schema)) {
    if (!is(table, PgTable)) continue;
    const config = getTableConfig(table);
    if (!tables.has(config.name)) {
      missing.push(config.name);
      continue;
    }
    for (const column of config.columns) {
      if (!columns.has(`${config.name}.${column.name}`)) missing.push(`${config.name}.${column.name}`);
    }
  }
  return missing;
}
