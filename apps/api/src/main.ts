import { createBetterAuthIdentity, FileOutbox } from "@holypearls/auth";
import { loadApiEnv } from "@holypearls/config";
import { createDatabaseClient } from "@holypearls/db";
import { createApp } from "./app.js";
import { findActiveStaff } from "./identity/actor.js";
import { createLogger } from "./logger.js";

const env = loadApiEnv();
const logger = createLogger();
if (env.NODE_ENV === "production") {
  throw new Error("Sign-in emails need the email sender from T01-02 before production.");
}
const database = createDatabaseClient(env.DATABASE_URL);
const identity = createBetterAuthIdentity({
  db: database.db,
  secret: env.BETTER_AUTH_SECRET,
  webOrigin: env.BETTER_AUTH_URL,
  // Secure cookies whenever the site is served over HTTPS (staging and production).
  secureCookies: new URL(env.BETTER_AUTH_URL).protocol === "https:",
  // T01-02 replaces this with the email sender; production must not start without it.
  outbox: new FileOutbox(env.AUTH_OUTBOX_PATH),
  rateLimit: env.AUTH_RATE_LIMIT === "on",
  log: (level, message) => logger[level]({ source: "identity" }, message),
  isStaff: async (userId) => (await findActiveStaff(database.db, userId)) !== null,
});
const app = await createApp({ db: database.db, logger, identity, webOrigin: env.BETTER_AUTH_URL });
app.enableShutdownHooks();
await app.listen(env.API_PORT);
logger.info({ port: env.API_PORT }, "api started");
