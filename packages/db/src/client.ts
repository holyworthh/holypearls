import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseClient {
  db: Database;
  close(): Promise<void>;
}

export function createDatabaseClient(connectionString: string, options: { max?: number; onError?: (error: Error) => void } = {}): DatabaseClient {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
  // An idle connection the server drops (restart, failover, or a test database dropped while the pool
  // is closing; 57P01) emits "error" on the pool. With no listener Node treats it as an uncaught
  // exception. The pool has already discarded that connection and opens a new one on the next query.
  pool.on("error", (error) => options.onError?.(error));
  const db = drizzle(pool, { schema });
  return { db, close: () => pool.end() };
}
