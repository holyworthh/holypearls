import type { Database } from "./client.js";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Runs one business change in one transaction (TECH-08 §12). If `work` throws,
 * every write inside it is rolled back and the error is rethrown.
 */
export function withTransaction<T>(db: Database, work: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(work);
}
