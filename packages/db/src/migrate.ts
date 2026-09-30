import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabaseClient } from "./client.js";

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
