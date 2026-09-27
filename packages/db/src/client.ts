import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseClient {
  db: Database;
  close(): Promise<void>;
}

export function createDatabaseClient(connectionString: string, options: { max?: number } = {}): DatabaseClient {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
  const db = drizzle(pool, { schema });
  return { db, close: () => pool.end() };
}
