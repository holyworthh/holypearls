# Staging deployment (T00-04, former T00-08)

Status: **ready to deploy, waiting on the owner.** The code, image and checks are in the repository. Choosing the API host and creating the accounts and secrets need the owner (see "Decisions needed").

## What runs where (TECH-07 §1)

| Part | Host | Start command |
| :---- | :---- | :---- |
| web | Vercel (project root `apps/web`) | `next build` / `next start` (Vercel default) |
| api | Railway, Render or Fly.io, from the root `Dockerfile` | `node apps/api/dist/main.js` |
| worker | Same host, same image, separate service | `node apps/worker/dist/main.js` |
| release step | Same image, runs once before the new api and worker start | `node packages/db/dist/migrate-cli.js` |
| database | Neon, same region as api and worker | pooled URL for api, direct URL for worker and jobs |

## Environment variables

**api**

| Name | Staging value |
| :---- | :---- |
| `HP_ENV` | `staging` |
| `DATABASE_URL` | Neon pooled URL (staging branch or project) |
| `DATABASE_DIRECT_URL` | Neon direct (unpooled) URL |
| `API_PORT` | the host's port, often `$PORT` |
| `BETTER_AUTH_URL` | the staging web origin, for example `https://staging.holypearls.ng` |
| `BETTER_AUTH_SECRET` | 32+ random characters, unique to staging |
| `HP_DEMO_SLICE` | `on` |
| `SENTRY_DSN` | the api/worker Sentry project DSN |

**worker**: `HP_ENV`, `DATABASE_URL`, `DATABASE_DIRECT_URL`, `SENTRY_DSN`.

**web (Vercel)**: `API_URL` (the api's private or public URL; it's written into the build, so set it before building), `HP_DEMO_SLICE=on`.

**Release step**: `DATABASE_URL` set to the **direct** URL.

R2 buckets and the Resend test domain are needed by T01-02 (email) and T01-05 (files); create them now so the variables exist, but nothing reads them yet.

## Deploy order

1. Neon: create the staging database in the chosen region. Keep 7 days of point-in-time restore.
2. API host: create the api and worker services from this repository's `Dockerfile`, in the same region. Add the release step.
3. Vercel: import the repository with root directory `apps/web`. Set `API_URL`. Connect the domain.
4. Point `main` at staging: each merge builds the image, runs the release step, then restarts api and worker. Vercel builds web.
5. Load TEST DATA: `pnpm seed` against staging (it refuses to run when `HP_ENV=production`).

## Checks (the ticket's "Done when")

- `GET https://<api>/health/live` returns `{"status":"ok"}`, and `GET /health/ready` returns 200.
- `https://<web>/dev/slice`: send a message; it shows DONE with the message in capitals. A message containing "fail" shows FAILED after the retries.
- Sign in at `/admin/sign-in` as a seeded STAFF_ADMIN with SECURITY_ADMIN (Ada), then `POST /api/v1/admin/monitoring/test-error` from the browser console; the error appears in Sentry, tagged with the request ID.
- The worker logs `worker started` and a `worker status` line every minute.

## Decisions needed

1. **API host** (TECH-07 §1): Railway, Render or Fly.io. Recommendation: **Render**, with the api and worker as Docker services in **Frankfurt**. It offers Frankfurt, background workers and a release (pre-deploy) command, with no extra tooling. Railway (EU West, Amsterdam) is a close second.
2. **Region** (TECH-07 §3): Frankfurt (`eu-central-1`) for Neon, API and worker. Your current Neon database is already in `eu-central-1`.
3. Accounts and secrets: Vercel, the API host, Sentry (one project for api and worker, one for web), Cloudflare R2 and Resend.

Record the chosen host and region in the ADR register as a new ADR when staging is live.
