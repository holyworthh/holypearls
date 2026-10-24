import { jobsConnectionString, loadApiEnv } from "@holypearls/config";
import { Jobs, QUEUES, type QueueName } from "@holypearls/jobs";
import { parseArgs } from "node:util";

// One-off: queues one job by hand, for example to retry a dead-lettered one (runbook 7).
// Usage: node apps/api/dist/queue-job-cli.js <queue> '<payload json without v and requestId>'
const { positionals } = parseArgs({ allowPositionals: true });
const [queue, json = "{}"] = positionals;
if (!queue || !(queue in QUEUES)) {
  console.error(`Usage: queue-job <queue> '<payload json>'\nQueues: ${Object.keys(QUEUES).join(", ")}`);
  process.exit(1);
}
const env = loadApiEnv();
const jobs = new Jobs({ connectionString: jobsConnectionString(env), role: "sender", maxConnections: 1 });
try {
  await jobs.start();
  const id = await jobs.send(queue as QueueName, QUEUES[queue as QueueName].payload.parse({ v: 1, requestId: "manual-retry", ...JSON.parse(json) }));
  console.log(`Queued ${queue}: ${id}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await jobs.stop(5000);
}
