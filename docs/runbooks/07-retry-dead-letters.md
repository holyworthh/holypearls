# 7. Retry dead-lettered jobs

**When:** a `JOB_DEAD_LETTER: <queue>` alert, or a job stuck in a failed state.

1. Find the alert in Sentry, or the log line `"alert":"JOB_DEAD_LETTER"` in Render logs. It carries the queue, the request ID and the payload (IDs only).
2. Fix the cause first (a provider outage, a bad record). Retrying into the same failure dead-letters it again.
3. Retry by queue:

| Queue | Fix |
| :-- | :-- |
| `email.send` | Admin → Notifications → filter FAILED → Resend |
| `file.*` | Admin file review, or the customer uploads the file again |
| `export.generate` | Request the export again |
| `payment.*`, `refund.check` | The 48-hour check and the payment review (runbook 8); Paystack dashboard |
| `search.refresh`, `cleanup.daily` | Restart the worker (Render → restart) |
| anything else | Render Shell: `node apps/api/dist/queue-job-cli.js <queue> '<payload json without v/requestId>'` |

Example: `node apps/api/dist/queue-job-cli.js cache.revalidate '{"tags":["catalogue"]}'`. It prints the new job ID. Locally: `pnpm queue:job <queue> '<json>'`.
