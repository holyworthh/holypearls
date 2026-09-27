import { createDatabaseClient, newId, runMigrations, type Database } from "@holypearls/db";
import pg from "pg";

export interface TestDatabase {
  /** Connection string for this test's own database. */
  url: string;
  db: Database;
  /** Closes connections and drops the database. */
  drop(): Promise<void>;
}

function withDatabaseName(serverUrl: string, name: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function runOnServer(serverUrl: string, sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: serverUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * Creates a new, empty, fully migrated database so tests never share data
 * (TECH-08 §12). `serverUrl` needs permission to create databases.
 */
export async function createTestDatabase(serverUrl: string): Promise<TestDatabase> {
  const name = `hp_test_${newId().replaceAll("-", "")}`;
  await runOnServer(serverUrl, `CREATE DATABASE "${name}"`);
  const url = withDatabaseName(serverUrl, name);
  try {
    await runMigrations(url);
  } catch (error) {
    await runOnServer(serverUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    throw error;
  }
  const client = createDatabaseClient(url, { max: 4 });
  return {
    url,
    db: client.db,
    drop: async () => {
      await client.close();
      await runOnServer(serverUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    },
  };
}
