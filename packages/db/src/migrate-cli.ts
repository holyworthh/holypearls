import { loadDatabaseEnv, migrationConnectionString } from "@holypearls/config";
import { runMigrations } from "./migrate.js";

// Migrations run as their own release step, never on app start (TECH-07 §6),
// as the schema owner rather than the app's row-only role (review P1-02).
const env = loadDatabaseEnv();
await runMigrations(migrationConnectionString(env));
console.log("Database migrations are up to date.");
