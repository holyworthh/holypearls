import {
  createLogger,
  flushMonitoring,
  initMonitoring,
  markDemoSliceFailed,
  markNotificationFailed,
  inspectFile,
  markFileNeedsReview,
  previewFile,
  processDemoSlice,
  runDailyCleanup,
  sendNotification,
  reportError,
} from "@holypearls/api/modules";
import { jobsConnectionString, loadWorkerEnv } from "@holypearls/config";
import { createDatabaseClient } from "@holypearls/db";
import { createEmailSender } from "@holypearls/email";
import { createStorage } from "@holypearls/storage";
import { deadLetterName, Jobs, QUEUES, type QueueName } from "@holypearls/jobs";

const env = loadWorkerEnv();
const logger = createLogger({ service: "worker", environment: env.HP_ENV });
initMonitoring({ dsn: env.SENTRY_DSN, environment: env.HP_ENV, service: "worker" });
// Worker jobs call the same services as the API (TECH-00 §5) on a bounded pool (TECH-07 §4).
const database = createDatabaseClient(env.DATABASE_URL, { max: 5 });
const jobs = new Jobs({
  connectionString: jobsConnectionString(env),
  role: "worker",
  maxConnections: 5,
  onError: (error) => logger.error({ err: error }, "job queue error"),
});

const lastSuccess = new Map<QueueName, string>();
const track =
  <T>(queue: QueueName, handler: (payload: T) => Promise<void>) =>
  async (payload: T & { requestId: string }) => {
    const started = Date.now();
    try {
      await handler(payload);
      lastSuccess.set(queue, new Date().toISOString());
      logger.info({ queue, requestId: payload.requestId, durationMs: Date.now() - started, result: "ok" }, "job");
    } catch (error) {
      logger.warn({ queue, requestId: payload.requestId, durationMs: Date.now() - started, err: error }, "job failed");
      throw error;
    }
  };

const sender = createEmailSender(env);
// The worker only reads and writes objects; it never signs URLs for browsers.
const { storage, publicStorage } = createStorage(env, { publicBaseUrl: "http://worker.invalid", signingSecret: env.DATA_ENCRYPTION_KEY });
const files = { db: database.db, jobs, storage, publicStorage };

await jobs.start();
await jobs.work(
  "email.send",
  track("email.send", (payload) => sendNotification(database.db, sender, env.DATA_ENCRYPTION_KEY, payload.notificationId)),
);
await jobs.workDeadLetters("email.send", async (payload) => {
  logger.error({ queue: deadLetterName("email.send"), requestId: payload.requestId }, "email moved to dead-letter queue");
  await markNotificationFailed(database.db, payload.notificationId);
});
await jobs.work("file.inspect", track("file.inspect", (payload) => inspectFile(files, payload.fileId, payload.requestId)));
await jobs.work("file.preview", track("file.preview", (payload) => previewFile(files, payload.fileId)));
for (const queue of ["file.inspect", "file.preview"] as const) {
  await jobs.workDeadLetters(queue, async (payload) => {
    logger.error({ queue: deadLetterName(queue), requestId: payload.requestId }, "file job moved to dead-letter queue");
    await markFileNeedsReview(database.db, payload.fileId, "We couldn't finish checking this file. Our team will look at it.");
  });
}
await jobs.work(
  "cleanup.daily",
  track("cleanup.daily", async () => {
    const result = await runDailyCleanup(files);
    logger.info({ queue: "cleanup.daily", removedFiles: result.files }, "daily clean-up finished");
  }),
);
await jobs.schedule("cleanup.daily", "0 3 * * *", { v: 1, requestId: "schedule" });
// Free hosts sleep through 03:00, so also clean up on each start; clean-up is safe to repeat.
await jobs.send("cleanup.daily", { v: 1, requestId: "startup" });
// Public pages refresh through the web app's revalidation route once it exists (T02-03).
await jobs.work(
  "cache.revalidate",
  track("cache.revalidate", async (payload) => {
    const url = process.env.WEB_REVALIDATE_URL;
    if (!url) return logger.info({ tags: payload.tags }, "cache tags changed (no revalidation URL set)");
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.WEB_REVALIDATE_SECRET ?? ""}` },
      body: JSON.stringify({ tags: payload.tags }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Revalidation failed (${response.status})`);
  }),
);
await jobs.work("demo.slice", track("demo.slice", (payload) => processDemoSlice(database.db, payload.demoId)));
await jobs.workDeadLetters("demo.slice", async (payload) => {
  logger.error({ queue: deadLetterName("demo.slice"), requestId: payload.requestId }, "job moved to dead-letter queue");
  reportError(new Error("Job moved to the dead-letter queue"), { queue: "demo.slice", requestId: payload.requestId });
  await markDemoSliceFailed(database.db, payload.demoId);
});
logger.info({ queues: Object.keys(QUEUES), emailTransport: sender.name }, "worker started");

// TECH-07 §8: queue sizes and last successful job time per queue.
const report = setInterval(async () => {
  const sizes: Record<string, number> = {};
  for (const queue of Object.keys(QUEUES) as QueueName[]) sizes[queue] = await jobs.queueSize(queue);
  logger.info({ queueSizes: sizes, lastSuccess: Object.fromEntries(lastSuccess) }, "worker status");
}, 60_000);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(report);
    logger.info({ signal }, "worker stopping; running jobs get 30 seconds");
    await jobs.stop(30_000);
    await flushMonitoring();
    await database.close();
    logger.info("worker stopped");
    process.exit(0);
  });
}
