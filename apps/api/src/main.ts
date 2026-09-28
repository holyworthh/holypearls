import { createBetterAuthIdentity, FileOutbox } from "@holypearls/auth";
import { jobsConnectionString, loadApiEnv } from "@holypearls/config";
import { createDatabaseClient } from "@holypearls/db";
import { Jobs } from "@holypearls/jobs";
import { createApp } from "./app.js";
import { findActiveStaff } from "./identity/actor.js";
import { createLogger } from "./logger.js";
import { flushMonitoring, initMonitoring } from "./monitoring.js";

const env = loadApiEnv();
const logger = createLogger({ environment: env.HP_ENV });
initMonitoring({ dsn: env.SENTRY_DSN, environment: env.HP_ENV, service: "api" });
if (env.HP_ENV === "production" && env.HP_DEMO_SLICE === "on") {
  throw new Error("The demo routes are never on in production.");
}
if (env.HP_ENV === "production") {
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
  log: (level, message) => logger[level]({ source: "identity" }, message),
  isStaff: async (userId) => (await findActiveStaff(database.db, userId)) !== null,
});
const jobs = new Jobs({
  connectionString: jobsConnectionString(env),
  role: "sender",
  maxConnections: 2,
  onError: (error) => logger.error({ err: error, source: "jobs" }, "job queue error"),
});
await jobs.start();
const app = await createApp({
  db: database.db,
  logger,
  identity,
  jobs,
  demoSlice: env.HP_DEMO_SLICE === "on",
  rateLimit: env.AUTH_RATE_LIMIT === "on",
  webOrigin: env.BETTER_AUTH_URL,
});
app.enableShutdownHooks();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void jobs
      .stop()
      .then(() => flushMonitoring())
      .finally(() => database.close());
  });
}
await app.listen(env.API_PORT);
logger.info({ port: env.API_PORT }, "api started");
