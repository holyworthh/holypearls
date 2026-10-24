import { loadDatabaseEnv, loadStorageEnv } from "@holypearls/config";
import { createDatabaseClient } from "@holypearls/db";
import { createStorage } from "@holypearls/storage";
import { buildSeedSteps, runSeed } from "./index.js";

if (process.env.NODE_ENV === "production" || process.env.HP_ENV === "production") {
  throw new Error("Seed data is test data and never loads in production.");
}

const env = loadDatabaseEnv();
const authSecret = process.env.BETTER_AUTH_SECRET;
if (!authSecret || authSecret.length < 32) throw new Error("Invalid environment: BETTER_AUTH_SECRET");
const client = createDatabaseClient(env.DATABASE_URL, { max: 1 });
// Sample product images go to the same public-media store the API uses.
// The seeded proof's picture goes to the private store.
const { storage, publicStorage } = createStorage(loadStorageEnv(), { publicBaseUrl: "http://seed.invalid", signingSecret: authSecret });
try {
  const loaded = await runSeed(client.db, buildSeedSteps({ authSecret, media: publicStorage, files: storage }));
  console.log(`Seed loaded ${loaded.length} step(s)${loaded.length ? `: ${loaded.join(", ")}` : ""}.`);
} finally {
  await client.close();
}
