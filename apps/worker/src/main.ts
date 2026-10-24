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
  refreshSearchIndex,
  runDailyCleanup,
  submitIndexNow,
  sendNotification,
  CHECK_SCHEDULE_SECONDS,
  checkPaymentAttempt,
  settleUnanswered,
  checkRefund,
  processPaystackEvent,
  expireQuoteVersion,
  sendQuoteExpiringReminder,
  sendInstallmentDueReminder,
  generateExport,
  markExportFailed,
  backupFiles,
  checkAlerts,
  raiseAlert,
} from "@holypearls/api/modules";
import { jobsConnectionString, loadWorkerEnv } from "@holypearls/config";
import { createDatabaseClient, runtimePrivilegeProblems } from "@holypearls/db";
import { createEmailSender } from "@holypearls/email";
import { createStorage } from "@holypearls/storage";
import { deadLetterName, Jobs, QUEUES, type QueueName } from "@holypearls/jobs";
import { createPaymentGateway } from "@holypearls/payments";

const env = loadWorkerEnv();
const logger = createLogger({ service: "worker", environment: env.HP_ENV });
initMonitoring({ dsn: env.SENTRY_DSN, environment: env.HP_ENV, service: "worker", release: process.env.RENDER_GIT_COMMIT });
// Worker jobs call the same services as the API (TECH-00 §5) on a bounded pool (TECH-07 §4).
const database = createDatabaseClient(env.DATABASE_URL, { max: 5, onError: (error) => logger.error({ err: error, source: "database" }, "idle database connection error") });
// Production runs on a row-only database role; a schema owner here means the wrong URL (review P1-02).
if (env.HP_ENV === "production") {
  const problems = await runtimePrivilegeProblems(database.db);
  if (problems.length) throw new Error(`DATABASE_URL must use the app's row-only role: ${problems.join("; ")}.`);
}
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

// A job that used up its retries is an alert (TECH-07 §12 A3). Payloads hold only IDs (TECH-02 §8).
const deadLettered = (queue: QueueName, payload: { requestId: string }) =>
  raiseAlert(logger, { signal: "JOB_DEAD_LETTER", key: queue, details: { queue: deadLetterName(queue), requestId: payload.requestId, payload } });

const sender = createEmailSender(env);
// The worker only reads and writes objects; it never signs URLs for browsers.
const { storage, publicStorage, backupStorage } = createStorage(env, { publicBaseUrl: "http://worker.invalid", signingSecret: env.DATA_ENCRYPTION_KEY });
const files = { db: database.db, jobs, storage, publicStorage };

await jobs.start();
await jobs.work(
  "email.send",
  track("email.send", (payload) => sendNotification(database.db, sender, env.DATA_ENCRYPTION_KEY, payload.notificationId)),
);
await jobs.workDeadLetters("email.send", async (payload) => {
  deadLettered("email.send", payload);
  await markNotificationFailed(database.db, payload.notificationId);
});
await jobs.work("file.inspect", track("file.inspect", (payload) => inspectFile(files, payload.fileId, payload.requestId)));
await jobs.work("file.preview", track("file.preview", (payload) => previewFile(files, payload.fileId)));
for (const queue of ["file.inspect", "file.preview"] as const) {
  await jobs.workDeadLetters(queue, async (payload) => {
    deadLettered(queue, payload);
    await markFileNeedsReview(database.db, payload.fileId, "We couldn't finish checking this file. Our team will look at it.");
  });
}
await jobs.work(
  "cleanup.daily",
  track("cleanup.daily", async () => {
    const result = await runDailyCleanup(files);
    logger.info({ queue: "cleanup.daily", removedFiles: result.files, removedSearchEvents: result.searchEvents, expiredCheckouts: result.expiredCheckouts, purgedCheckouts: result.purgedCheckouts, closedDrafts: result.closedDrafts, expiredExports: result.exportsExpired, removedGuestLinks: result.guestLinks, removedVerifications: result.verifications, clearedParticipantContacts: result.participantContacts }, "daily clean-up finished");
  }),
);
await jobs.schedule("cleanup.daily", "0 3 * * *", { v: 1, requestId: "schedule" });
// Free hosts sleep through 03:00, so also clean up on each start; clean-up is safe to repeat.
await jobs.send("cleanup.daily", { v: 1, requestId: "startup" });
// Public pages refresh through the web app's revalidation route once it exists (T02-03).
await jobs.work(
  "cache.revalidate",
  track("cache.revalidate", async (payload) => {
    // Off only by explicit choice (staging); production can't start with it off (review P2-05).
    if (env.WEB_REVALIDATE === "off") return logger.info({ tags: payload.tags }, "cache tags changed (page refresh is off here)");
    const response = await fetch(env.WEB_REVALIDATE_URL!, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.WEB_REVALIDATE_SECRET!}` },
      body: JSON.stringify({ tags: payload.tags }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Revalidation failed (${response.status})`);
  }),
);
// Search index (T02-06): rebuilt from published records after changes, and once at start so it's never empty.
await jobs.work(
  "search.refresh",
  track("search.refresh", async () => {
    const documents = await refreshSearchIndex(database.db);
    logger.info({ queue: "search.refresh", documents }, "search index rebuilt");
  }),
);
await jobs.send("search.refresh", { v: 1, requestId: "startup" });
await jobs.work(
  "seo.indexnow",
  track("seo.indexnow", async (payload) => {
    const result = await submitIndexNow(payload.paths, { siteUrl: env.SITE_URL, key: env.INDEXNOW_KEY });
    logger.info({ queue: "seo.indexnow", submitted: result.submitted }, result.submitted ? "changed pages sent to IndexNow" : "IndexNow not set up here");
  }),
);
// Payments (T04-03): webhook follow-ups and the scheduled checks both confirm with Paystack's verify API.
const payments = {
  db: database.db,
  gateway: createPaymentGateway(env),
  // Order confirmations carry the order's secure link on the customer site (T04-05).
  notify: { db: database.db, jobs, sealKey: env.DATA_ENCRYPTION_KEY, webOrigin: env.BETTER_AUTH_URL },
};
await jobs.work(
  "payment.verify",
  track("payment.verify", async (payload) => {
    const outcome = await processPaystackEvent(payments, payload.eventId);
    logger.info({ queue: "payment.verify", requestId: payload.requestId, outcome }, "paystack event processed");
  }),
);
await jobs.work(
  "payment.check",
  track("payment.check", async (payload) => {
    const outcome = await checkPaymentAttempt(payments, payload.attemptId, payload.check);
    logger.info({ queue: "payment.check", requestId: payload.requestId, check: payload.check, outcome }, "payment checked");
  }),
);
// Refunds (T13-05): status from Paystack's refund API on the TECH-05 §11 schedule.
await jobs.work(
  "refund.check",
  track("refund.check", async (payload) => {
    const outcome = await checkRefund(payments, payload.refundId, payload.check);
    logger.info({ queue: "refund.check", requestId: payload.requestId, check: payload.check, outcome }, "refund checked");
  }),
);
for (const queue of ["payment.verify", "payment.check", "refund.check"] as const) {
  await jobs.workDeadLetters(queue, async (payload) => {
    // A last check that never got an answer settles the attempt itself (UNKNOWN and a review); staff see it on the Jobs page and through the dead-letter alert.
    if (queue === "payment.check" && "attemptId" in payload && payload.check >= CHECK_SCHEDULE_SECONDS.length) await settleUnanswered(payments, payload.attemptId);
    deadLettered(queue, payload);
  });
}
// Quotes (T05-03): expiry at valid-until, and the "expires soon" reminder. Both check the quote again when they run.
await jobs.work(
  "quote.expire",
  track("quote.expire", async (payload) => {
    const outcome = await expireQuoteVersion(database.db, payload.quoteVersionId);
    logger.info({ queue: "quote.expire", requestId: payload.requestId, outcome }, "quote expiry checked");
  }),
);
await jobs.work(
  "reminder.send",
  track("reminder.send", async (payload) => {
    const outcome =
      payload.kind === "INSTALLMENT_DUE"
        ? await sendInstallmentDueReminder(payments.notify, payload.recordId, payload.requestId)
        : await sendQuoteExpiringReminder(payments.notify, payload.recordId, payload.requestId);
    logger.info({ queue: "reminder.send", requestId: payload.requestId, kind: payload.kind, outcome }, "reminder checked");
  }),
);
// Exports (T13-03b): built into private storage, never during a staff request (TECH-07 §16).
await jobs.work(
  "export.generate",
  track("export.generate", async (payload) => {
    const outcome = await generateExport(files, payload.exportId);
    logger.info({ queue: "export.generate", requestId: payload.requestId, outcome }, "export built");
  }),
);
await jobs.workDeadLetters("export.generate", async (payload) => {
  deadLettered("export.generate", payload);
  await markExportFailed(database.db, payload.exportId);
});
await jobs.work("demo.slice", track("demo.slice", (payload) => processDemoSlice(database.db, payload.demoId)));
await jobs.workDeadLetters("demo.slice", async (payload) => {
  deadLettered("demo.slice", payload);
  await markDemoSliceFailed(database.db, payload.demoId);
});
// Queues with nothing to undo when they fail still raise the alert.
for (const queue of ["cache.revalidate", "search.refresh", "seo.indexnow", "quote.expire", "reminder.send", "cleanup.daily", "ops.monitor", "storage.backup"] as const) {
  await jobs.workDeadLetters(queue, async (payload) => deadLettered(queue, payload));
}
// Alerts that need the database (TECH-07 §12), every 5 minutes.
await jobs.work(
  "ops.monitor",
  track("ops.monitor", async () => {
    for (const alert of await checkAlerts(database.db, new Date())) raiseAlert(logger, alert);
  }),
);
await jobs.schedule("ops.monitor", "*/5 * * * *", { v: 1, requestId: "schedule" });
// Daily copy of private files to the backup bucket (TECH-07 §5); not registered without S3_BACKUP_BUCKET.
if (backupStorage) {
  await jobs.work(
    "storage.backup",
    track("storage.backup", async (payload) => {
      const copied = await backupFiles({ db: database.db, storage, backupStorage }, new Date(Date.now() - 7 * 86_400_000));
      logger.info({ queue: "storage.backup", requestId: payload.requestId, copied }, "files backed up");
    }),
  );
  await jobs.schedule("storage.backup", "30 3 * * *", { v: 1, requestId: "schedule" });
  // Free hosts sleep through 03:30, so also copy on each start; a repeat copies nothing new.
  await jobs.send("storage.backup", { v: 1, requestId: "startup" });
}
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
