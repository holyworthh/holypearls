import {
  createLogger,
  flushMonitoring,
  initMonitoring,
  markDemoSliceFailed,
  markNotificationFailed,
  processDemoSlice,
  sendNotification,
  reportError,
} from "@holypearls/api/modules";
import { jobsConnectionString, loadWorkerEnv } from "@holypearls/config";
import { createDatabaseClient } from "@holypearls/db";
import { createEmailSender } from "@holypearls/email";
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

await jobs.start();
await jobs.work(
  "email.send",
  track("email.send", (payload) => sendNotification(database.db, sender, env.DATA_ENCRYPTION_KEY, payload.notificationId)),
);
await jobs.workDeadLetters("email.send", async (payload) => {
  logger.error({ queue: deadLetterName("email.send"), requestId: payload.requestId }, "email moved to dead-letter queue");
  await markNotificationFailed(database.db, payload.notificationId);
});
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
