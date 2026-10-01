import { refreshSearchIndex } from "./catalogue/search.js";
import { type AuthOutbox, createBetterAuthIdentity } from "@holypearls/auth";
import { jobsConnectionString, loadApiEnv } from "@holypearls/config";
import { createDatabaseClient, runtimePrivilegeProblems } from "@holypearls/db";
import { Jobs } from "@holypearls/jobs";
import { createPaymentGateway } from "@holypearls/payments";
import { createStorage } from "@holypearls/storage";
import { createApp } from "./app.js";
import { findActiveStaff } from "./identity/actor.js";
import { createLogger } from "./logger.js";
import { flushMonitoring, initMonitoring } from "./monitoring.js";
import { queueEmail } from "./platform/notifications.js";

const env = loadApiEnv();
const logger = createLogger({ environment: env.HP_ENV });
initMonitoring({ dsn: env.SENTRY_DSN, environment: env.HP_ENV, service: "api" });
if (env.HP_ENV === "production" && env.HP_DEMO_SLICE === "on") {
  throw new Error("The demo routes are never on in production.");
}
const database = createDatabaseClient(env.DATABASE_URL);
// Production runs on a row-only database role; a schema owner here means the wrong URL (review P1-02).
if (env.HP_ENV === "production") {
  const problems = await runtimePrivilegeProblems(database.db);
  if (problems.length) throw new Error(`DATABASE_URL must use the app's row-only role: ${problems.join("; ")}.`);
}
const jobs = new Jobs({
  connectionString: jobsConnectionString(env),
  role: "sender",
  maxConnections: 2,
  onError: (error) => logger.error({ err: error, source: "jobs" }, "job queue error"),
});
await jobs.start();
const notify = { db: database.db, jobs, sealKey: env.DATA_ENCRYPTION_KEY };
// Sign-in links go out as notifications through the email.send job (TECH-02 §10).
const outbox: AuthOutbox = {
  send: async (email) => {
    await queueEmail(notify, database.db, {
      template: "sign_in_link",
      to: email.to,
      data: { url: email.url },
      linkLabel: "Signs the person in",
      requestId: "auth",
    });
  },
};
const identity = createBetterAuthIdentity({
  db: database.db,
  secret: env.BETTER_AUTH_SECRET,
  webOrigin: env.BETTER_AUTH_URL,
  adminOrigin: env.ADMIN_ORIGIN ?? null,
  // Secure cookies whenever the site is served over HTTPS (staging and production).
  secureCookies: new URL(env.BETTER_AUTH_URL).protocol === "https:",
  outbox,
  log: (level, message) => logger[level]({ source: "identity" }, message),
  isStaff: async (userId) => (await findActiveStaff(database.db, userId)) !== null,
});
// Local storage URLs go through the web app's /api forwarding, like everything else in the browser.
const { storage, publicStorage } = createStorage(env, {
  publicBaseUrl: `${env.BETTER_AUTH_URL}/api`,
  signingSecret: env.DATA_ENCRYPTION_KEY,
});
const app = await createApp({
  payments: createPaymentGateway(env),
  proxySecret: env.WEB_PROXY_SECRET ?? null,
  adminOrigin: env.ADMIN_ORIGIN ?? null,
  adminProxySecret: env.ADMIN_PROXY_SECRET ?? null,
  storage,
  publicStorage,
  db: database.db,
  logger,
  identity,
  jobs,
  sealKey: env.DATA_ENCRYPTION_KEY,
  helpInboxEmail: env.HELP_INBOX_EMAIL,
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
// The search index is rebuilt by the worker; building it here too means a fresh
// database (or an API run without the worker, as in browser tests) can search at once.
refreshSearchIndex(database.db)
  .then((documents) => logger.info({ documents }, "search index rebuilt"))
  .catch((error: unknown) => logger.warn({ err: error }, "search index rebuild failed; the worker retries"));
