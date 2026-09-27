import { withTransaction, type Database, type Transaction } from "@holypearls/db";

/** Every seeded record is test data (TECH-08 §11). Use this label in names and notes. */
export const TEST_DATA_LABEL = "TEST DATA";

export interface SeedStep {
  name: string;
  run(tx: Transaction): Promise<void>;
}

/**
 * Seed steps in load order. Tickets add their fixtures here as their tables
 * arrive (for example the ACME organization or the Business Cards purchase).
 */
export const seedSteps: SeedStep[] = [];

/** Loads every step in one transaction, so a failed seed leaves nothing behind. */
export async function runSeed(db: Database, steps: readonly SeedStep[] = seedSteps): Promise<string[]> {
  return withTransaction(db, async (tx) => {
    const loaded: string[] = [];
    for (const step of steps) {
      await step.run(tx);
      loaded.push(step.name);
    }
    return loaded;
  });
}
