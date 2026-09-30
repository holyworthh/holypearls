import { insertTestPerson, TEST_PEOPLE } from "@holypearls/auth";
import { seedCatalogue, seedMerchandising } from "./catalogue.js";
import { seedContent } from "./content.js";
import { seedHubs } from "./hubs.js";
import { seedCatalogueMedia, type SeedMediaStore } from "./media.js";
import { seedPricing } from "./pricing.js";
import type { StaffPermission } from "@holypearls/contracts";
import { eq, schema, withTransaction, type Database, type Transaction } from "@holypearls/db";

/** Every seeded record is test data (TECH-08 §11). Use this label in names and notes. */
export const TEST_DATA_LABEL = "TEST DATA";

export interface SeedStep {
  name: string;
  run(tx: Transaction): Promise<void>;
}

export interface SeedOptions {
  /** The API's BETTER_AUTH_SECRET, so seeded authenticator secrets decrypt. */
  authSecret: string;
  /** The public-media store; when given, seeded products get sample images. */
  media?: SeedMediaStore;
}

async function addMissingGrants(tx: Transaction, email: string, permissions: readonly StaffPermission[]) {
  const [profile] = await tx
    .select({ id: schema.staffProfiles.id })
    .from(schema.staffProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.staffProfiles.userId))
    .where(eq(schema.users.email, email));
  if (!profile) return;
  await tx
    .insert(schema.staffPermissionGrants)
    .values(permissions.map((permission) => ({ staffProfileId: profile.id, permission })))
    .onConflictDoNothing();
}

/** Two STAFF_ADMIN users, a staff member without MFA and a customer (TECH-03 §10, TECH-08 §11). */
export const identitySeedStep = (options: SeedOptions): SeedStep => ({
  name: "identity: test people",
  async run(tx) {
    const existing = new Set((await tx.select({ email: schema.users.email }).from(schema.users)).map((row) => row.email));
    for (const person of Object.values(TEST_PEOPLE)) {
      // Re-running the seed keeps people who are already there, and adds any new staff permissions.
      if (!existing.has(person.email)) await insertTestPerson(tx, person, options.authSecret);
      else if ("staff" in person) await addMissingGrants(tx, person.email, person.staff.permissions);
    }
  },
});

/**
 * Seed steps in load order. Tickets add their fixtures here as their tables
 * arrive (for example the ACME organization or the Business Cards purchase).
 */
/** The nine categories and one product per family (T02-01). */
export const catalogueSeedStep: SeedStep = {
  name: "catalogue: categories, one product per family, the menu and homepage lists and two designed hubs",
  async run(tx) {
    await seedCatalogue(tx);
    await seedMerchandising(tx);
    await seedHubs(tx);
  },
};

/** Project pages, demo case studies, guides and About (T02-06). */
export const contentSeedStep: SeedStep = { name: "content: projects, demo case studies, guides and About", run: seedContent };

export const catalogueMediaSeedStep = (media: SeedMediaStore): SeedStep => ({
  name: "catalogue: one sample image per product",
  run: (tx) => seedCatalogueMedia(tx, media),
});

/** Product rules, prices and VAT from the Stage 1.4 sheet (T03-01). */
export const pricingSeedStep: SeedStep = { name: "pricing: product rules, prices and VAT", run: seedPricing };

export const buildSeedSteps = (options: SeedOptions): SeedStep[] => [
  identitySeedStep(options),
  catalogueSeedStep,
  pricingSeedStep,
  contentSeedStep,
  ...(options.media ? [catalogueMediaSeedStep(options.media)] : []),
];

/** Loads every step in one transaction, so a failed seed leaves nothing behind. */
export async function runSeed(db: Database, steps: readonly SeedStep[]): Promise<string[]> {
  return withTransaction(db, async (tx) => {
    const loaded: string[] = [];
    for (const step of steps) {
      await step.run(tx);
      loaded.push(step.name);
    }
    return loaded;
  });
}
