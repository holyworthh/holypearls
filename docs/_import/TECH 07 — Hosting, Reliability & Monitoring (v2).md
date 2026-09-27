# HolyPearls — TECH 07: Hosting, Reliability & Monitoring

**Version:** 2.0 (27 September 2026). Replaces TECH 07 v1.

## 1\. Where things run

| Part | Where | Notes |
| :---- | :---- | :---- |
| web | Vercel | Next.js |
| api | Railway, Render or Fly.io (choose in T00-08) | Always-on Node service |
| worker | Same host as api, separate service | Same code image as api |
| Database | Neon PostgreSQL | Pooled connection for api; **direct** (unpooled) connection for worker and pg-boss |
| Files | Cloudflare R2 | Private bucket \+ public-media bucket |
| Email | Resend |  |
| Payments | Paystack |  |
| Errors | Sentry | web, api, worker |

These are defaults. Business code only depends on the interfaces in TECH 00 section 5\.

Note: because the worker checks for jobs continuously, the Neon database won't scale down to zero. Budget for an always-on compute.

## 2\. Environments

local, preview (per pull request, web only, using the staging API), staging, production. Staging is deployed from P00 onward, so every pass is tested on real hosting.

Each environment has its own database, auth secret, Paystack keys (test keys everywhere except production), storage buckets and email sender. Preview and staging never touch production data.

## 3\. Region

API, worker and database in the same region. There is no Nigerian region on these platforms, so choose the European region closest to Nigeria that all three offer (likely London or Frankfurt) in T00-08, and record it in the ADR register. Never put the API and database on different continents. Vercel serves public pages from its global edge network.

## 4\. Database connections

Bounded pools: api 10 connections per instance, worker 5 plus pg-boss's own. Worker concurrency is set so total connections stay under the Neon plan limit. Never open a connection per request.

## 5\. Backups

Neon point-in-time restore, with at least 7 days of history (more if the plan allows). Before launch: write down the restore steps, and restore into staging at least once. Repeat the rehearsal every quarter. A backup that has never been restored doesn't count.

R2 files: turn on object versioning or a daily copy to a second bucket for proofs, brand assets and order artwork.

## 6\. Migrations

CI runs every migration from an empty database and from the previous release. Production migrations run as a separate release step, once, before new code starts — never automatically from each running instance. Schema changes must work with both the old and new code during the deploy (TECH 01 section 6). Never rely on rolling back a destructive migration.

## 7\. Web

Public pages use Next.js caching and are refreshed by cache tags when staff publish. Private pages are never cached publicly. Images go through the Next.js image optimizer (AVIF or WebP, correct sizes). Large uploads go straight to R2, never through Next.js.

## 8\. Health checks

- `GET /health/live` — the process is running.  
- `GET /health/ready` — can reach the database (a simple `select 1`). Doesn't call Paystack or other outside services.

The worker reports: started, which queues it's listening to, last successful job time per queue, queue sizes, and fatal errors. The pg-boss dashboard is only reachable inside admin with `SECURITY_ADMIN`.

## 9\. Logs

JSON logs with: time, level, service, environment, request ID, actor type and ID (when safe), organization and record IDs (when useful), route or job, duration, and result or error code. No free-text-only logging in production.

## 10\. Request IDs

Created at the web server or API, passed through every service call, job payload, webhook processing and notification, and returned in every error response so support can match a customer's report to the logs.

## 11\. Error monitoring

Sentry on web, api and worker. Tags: environment, release (commit), request ID, route or job, safe record IDs. No request bodies by default.

## 12\. What to monitor at launch

A small set, with an alert (email or Slack) for each:

| Signal | Alert when |
| :---- | :---- |
| API error rate | Over 2% of requests for 5 minutes |
| API response time | 95th percentile over 1.5 s for 10 minutes |
| Job failures | Any job reaches the dead-letter queue |
| Job backlog | Any queue has jobs waiting more than 15 minutes |
| Database connections | Over 80% of the limit |
| Payment reviews | A new payment review opens |
| Paystack webhooks | No webhook received for 6 hours during business hours while payments were started |
| Email failures | More than 5 failed in an hour |
| File processing | More than 10 rejected or failed in an hour |

Starting thresholds; adjust using real data. Add fuller tracing and metrics only if operating data shows a need.

## 13\. Timeouts and retries

Every outside call has a timeout: Paystack 10 s, Resend 10 s, R2 30 s. Never blindly retry a call that could charge or create something twice; use the idempotency rules instead. No customer request waits for an email, preview or export; those run in the worker.

## 14\. Incident runbooks (write these before launch)

Each is a short numbered checklist in the repository (`docs/runbooks/`):

1. Rotate the Paystack secret key.  
2. Rotate the Better Auth secret and revoke all sessions.  
3. Rotate R2 keys.  
4. Pause online payments.  
5. Pause uploads.  
6. Put the site in read-only mode.  
7. Retry dead-lettered jobs.  
8. Resolve a payment review (including issuing a refund).  
9. Restore the database to a point in time.  
10. Handle a suspected data breach (links to TECH 06 section 12).

## 15\. Release process

Main branch protected. Every pull request runs: install from lockfile, lint, type check, unit and integration tests, migration check, OpenAPI check, and builds for web, api and worker. Merging to main deploys to staging automatically. Production deploys from a tagged main commit after the staging checks pass.

Feature flags only for risky or unfinished features that must be merged early. No general experimentation platform.

## 16\. Exports

Built by the worker, written to a private R2 location, downloadable for 24 hours with a 5-minute download link, and logged. Never run large report queries during a customer request.

## 17\. Performance

Front end: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at the 75th percentile, measured with real-user monitoring from P14. Back end: set targets once we have realistic data (P14), rather than guessing now. Always avoid N+1 queries and unneeded calls to outside services.

## 18\. Cost

At launch: one web deployment, one API service, one worker service, one database, one storage account. Add infrastructure only when measurements show a need.

## 19\. Done when

A new engineer can deploy web, api and worker; run migrations; understand every environment setting; trace a failed request or job; restore from a tested backup; and switch off a failing outside service without corrupting data.