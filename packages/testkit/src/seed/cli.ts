import { loadDatabaseEnv } from "@holypearls/config";
import { createDatabaseClient } from "@holypearls/db";
import { runSeed, seedSteps } from "./index.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("Seed data is test data and never loads in production.");
}

const env = loadDatabaseEnv();
const client = createDatabaseClient(env.DATABASE_URL, { max: 1 });
try {
  const loaded = await runSeed(client.db, seedSteps);
  console.log(`Seed loaded ${loaded.length} step(s)${loaded.length ? `: ${loaded.join(", ")}` : ""}.`);
} finally {
  await client.close();
}
