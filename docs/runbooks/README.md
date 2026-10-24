# Runbooks

Step-by-step procedures for incidents (TECH-07 §14). Each file stands alone: read the one you need, top to bottom. Staff with `SECURITY_ADMIN` use admin → **Incident switches** (`/incidents`) for runbooks 2, 4, 5 and 6. Every switch asks for an authenticator code from the last 15 minutes and writes an audit entry.

| # | Runbook | Use it when |
| :-- | :-- | :-- |
| 1 | [Rotate the Paystack key](01-rotate-paystack-key.md) | The key leaked, or on the yearly rotation |
| 2 | [Rotate the auth secret](02-rotate-auth-secret.md) | The Better Auth secret leaked, or on rotation |
| 3 | [Rotate R2 keys](03-rotate-r2-keys.md) | The storage token leaked, or on rotation |
| 4 | [Pause online payments](04-pause-payments.md) | Payments misbehave or Paystack is down |
| 5 | [Pause uploads](05-pause-uploads.md) | Storage is failing or someone abuses uploads |
| 6 | [Read-only mode](06-read-only-mode.md) | Anything that needs the data to stop changing |
| 7 | [Retry dead-lettered jobs](07-retry-dead-letters.md) | A `JOB_DEAD_LETTER` alert |
| 8 | [Resolve a payment review](08-payment-review.md) | A `PAYMENT_REVIEW` alert |
| 9 | [Point-in-time database restore](09-restore-database.md) | Bad data or a bad migration |
| 10 | [Suspected data breach](10-data-breach.md) | Anyone might have seen data they shouldn't |

## Alerts (TECH-07 §12)

Alerts are Sentry issues tagged `alert=<signal>`. One Sentry rule per environment mails the owner (set-up steps are in the T15-05 report). Without `SENTRY_DSN` the same alerts are only log lines (`"alert":"<signal>"`). Each signal and key sends at most one alert an hour per process.

| Signal | Sentry title | Alerts when | Start with |
| :-- | :-- | :-- | :-- |
| `API_ERROR_RATE` | `API_ERROR_RATE: api` | More than 2% of requests are 5xx over 5 minutes (at least 20 requests) | Render logs for the API; runbook 6 if data is being damaged |
| `API_LATENCY` | `API_LATENCY: api` | 95th percentile over 1.5 s for 10 minutes (at least 20 requests) | Render logs; Neon dashboard |
| `JOB_DEAD_LETTER` | `JOB_DEAD_LETTER: <queue>` | Any job used up its retries | Runbook 7 |
| `JOB_BACKLOG` | `JOB_BACKLOG: <queue>` | A job has waited over 15 minutes | Is the worker running? Render logs; runbook 7 |
| `DB_CONNECTIONS` | `DB_CONNECTIONS: db` | Over 80% of `max_connections` in use | Neon dashboard; restart the service |
| `PAYMENT_REVIEW` | `PAYMENT_REVIEW: <review id>` | A payment review opened | Runbook 8 |
| `PAYSTACK_WEBHOOKS_SILENT` | `PAYSTACK_WEBHOOKS_SILENT: paystack` | No webhook for 6 hours in business hours (Mon–Sat 08:00–18:00 Lagos) while payments were started | Paystack dashboard → webhook URL and logs; runbook 8 |
| `EMAIL_FAILURES` | `EMAIL_FAILURES: email` | More than 5 emails FAILED in an hour | Resend dashboard; runbook 7 |
| `FILE_FAILURES` | `FILE_FAILURES: files` | More than 10 files REJECTED or NEEDS_REVIEW in an hour | Admin file review; runbook 5 if storage is failing |

## Where things are

- **Logs:** Render → service → Logs (one JSON line per request, with the request ID).
- **Errors and alerts:** Sentry.
- **Database:** Neon console (branches `staging`, `production`).
- **Files:** Cloudflare R2.
- **Audit log:** admin → Audit log. Search by request ID, email or record.
- **Addresses and variables:** `docs/ops/ENVIRONMENTS.md`.
- **Launch steps:** `docs/ops/LAUNCH-CHECKLIST.md`.

## Switch test log

Run the staging test steps in runbooks 4, 5 and 6, plus the revoke steps below, on staging after each deploy of the switches. Record the result.

| Date | Time (Lagos) | Switch | Result | Who |
| :-- | :-- | :-- | :-- | :-- |
|  |  | Pause uploads |  |  |
|  |  | Pause payments |  |  |
|  |  | Read-only mode |  |  |
|  |  | Revoke guest links (a test order ID) |  |  |
|  |  | Revoke sessions, one test customer |  |  |
|  |  | Revoke sessions, everyone (last) |  |  |
