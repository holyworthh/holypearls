import { loadDatabaseEnv } from "@holypearls/config";
import { createDatabaseClient } from "@holypearls/db";
import { parseArgs } from "node:util";
import { bootstrapStaffAdmin } from "./identity/bootstrap-admin.js";

// One-off: creates the first STAFF_ADMIN on an environment with none (ATTENTION 2).
// Usage: node apps/api/dist/bootstrap-admin-cli.js --email you@example.com --name "Your Name"
const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
if (!values.email || !values.name) {
  console.error('Usage: bootstrap-admin --email you@example.com --name "Your Name"');
  process.exit(1);
}
const env = loadDatabaseEnv();
const database = createDatabaseClient(env.DATABASE_URL, { max: 1 });
try {
  const { password } = await bootstrapStaffAdmin(database.db, { email: values.email, name: values.name });
  console.log(`Staff admin created for ${values.email.trim().toLowerCase()}.`);
  console.log(`One-time password (shown once, not stored anywhere else): ${password}`);
  console.log("Sign in at the admin address and set up your authenticator. Keep this password in a password manager.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await database.close();
}
