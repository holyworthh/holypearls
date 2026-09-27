import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabaseClient } from "./client.js";

export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Applies every committed migration that has not run yet. */
export async function runMigrations(connectionString: string): Promise<void> {
  const client = createDatabaseClient(connectionString, { max: 1 });
  try {
    await migrate(client.db, { migrationsFolder });
  } finally {
    await client.close();
  }
}
