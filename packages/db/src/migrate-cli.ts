import { loadDatabaseEnv } from "@holypearls/config";
import { runMigrations } from "./migrate.js";

// Migrations run as their own release step, never on app start (TECH-07 §6).
const env = loadDatabaseEnv();
await runMigrations(env.DATABASE_URL);
console.log("Database migrations are up to date.");
