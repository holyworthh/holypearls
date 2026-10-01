# Environments and deployment (free tier)

Everything runs on free plans until HolyPearls has paying customers. There's no custom domain yet, so each environment uses the addresses the platforms give it.

## Branches and environments

| Git branch | Environment | Deploys to | Data |
| :---- | :---- | :---- | :---- |
| `feature/*`, `fix/*`, … | CI only | nothing (GitHub Actions runs every check on each pull request) | a throwaway Postgres inside CI |
| `dev` (default branch) | **staging** | Vercel `dev` branch preview + Render `holypearls-api-staging` | Neon branch `staging`, TEST DATA |
| `main` | **production** | Vercel production + Render `holypearls-api` | Neon branch `production`, real data only |
| your machine | local | `pnpm dev` | Neon default branch (`main`), TEST DATA |

Flow:

1. Branch from `dev`, open a pull request into `dev`. CI must pass.
2. Merging into `dev` deploys staging automatically. Check it there.
3. To release, open a pull request from `dev` into `main`. Merging it deploys production.
4. A fix needed in production right away: branch from `main`, merge into `main`, then merge `main` back into `dev`.

## What runs where

| Part | Staging | Production |
| :---- | :---- | :---- |
| web | Vercel, Git branch `dev` (stable branch URL) | Vercel production URL |
| api + worker | Render free web service, Frankfurt, Docker, branch `dev` | same, branch `main` |
| database | Neon project `holypearls`, branch `staging` | Neon branch `production` |
| email | Resend, from `onboarding@resend.dev` (can only send to the account owner's address until a domain is verified) | Resend, own domain once bought |
| files | local disk inside the container (lost on restart) until its R2 keys exist, then R2 | R2 (required: the api and worker refuse to start without it) |
| errors | logs only until a Sentry DSN is added | Sentry |

## Free-tier trade-offs (deviations from TECH-07)

- **One container runs the api and the worker.** Render's free plan has no background workers and no pre-deploy step. `deploy/start-single.sh` runs the migrations, then starts the worker and the api side by side, and stops the container if either stops. TECH-07 §1 and §6 want separate services and a release step; switch to that on a paid plan by setting the start command back to the image default and adding `node packages/db/dist/migrate-cli.js` as the pre-deploy command.
- **Sleeping api.** Free Render services sleep after 15 minutes without traffic; the first request then takes about a minute. Jobs don't run while it sleeps. Queued jobs wait and run when it wakes. The 03:00 clean-up may be missed, so the worker also runs the clean-up each time it starts (it's safe to repeat).
- **512 MB of memory.** PDF previews run in a child process capped at 1 GB (TECH-04); on the free plan a very large PDF can fail and the file goes to NEEDS_REVIEW instead.
- **Shared free hours.** Render gives 750 free hours a month per workspace; two sleeping services fit.
- **Vercel Hobby** is for non-commercial use. Move to Pro (or another host) before taking real orders.
- **Staging previews are protected.** Vercel asks for your Vercel login before showing the `dev` branch URL. That keeps staging private.

## Environment variables

**api (Render)**: `HP_ENV` (`staging` or `production`), `DATABASE_URL` (Neon pooled, app role), `DATABASE_DIRECT_URL` (Neon direct, app role), `DATABASE_MIGRATION_URL` (Neon direct, schema owner; migrations only), `API_PORT=10000`, `BETTER_AUTH_URL` (that environment's web URL), `BETTER_AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `HP_DEMO_SLICE` (`on` in staging only), `EMAIL_TRANSPORT=resend`, `EMAIL_FROM`, `RESEND_API_KEY`, `HELP_INBOX_EMAIL`, `WEB_REVALIDATE` (`on` in production, `off` in staging), `WEB_REVALIDATE_URL`, `WEB_REVALIDATE_SECRET`, `SENTRY_DSN` (set 2026-09-28; one Sentry project, events tagged by `HP_ENV`; the worker in the same container reports too), `STORAGE_DRIVER=s3` and the `S3_*` values.

**Production fails closed.** With `HP_ENV=production` the api and worker refuse to start when files would go to the container's disk, an `S3_*` value is missing, the private and public buckets are the same, email isn't Resend, page refresh is off, the demo routes are on, an address is `localhost` or `.test`, or `DATABASE_URL` logs in as a role that can change the schema (`packages/config`, `runtimePrivilegeProblems`).

**web (Vercel)**: `API_URL` (that environment's Render URL; written into the build), `HP_DEMO_SLICE`, `WEB_REVALIDATE_SECRET`. Staging values are scoped to the `dev` branch; production values to Production.

Secrets are generated per environment and never shared between staging and production.

## Database roles (review P1-02)

Migration `0023_runtime_role` creates `holypearls_runtime`: rows only (read, add, change, delete), no create, alter or drop anywhere, no changes to the audit log, and ownership of the `pgboss` job-queue schema. Each environment has its own login for the app, made once on that Neon branch by the schema owner after `0023` has run there:

```sql
CREATE ROLE holypearls_app LOGIN PASSWORD '<generated, per environment>' IN ROLE holypearls_runtime;
ALTER ROLE holypearls_app SET role = 'holypearls_runtime';
```

`DATABASE_URL` and `DATABASE_DIRECT_URL` use `holypearls_app`; `DATABASE_MIGRATION_URL` uses the owner (`neondb_owner`, with its own password per branch). `apps/api/src/platform/runtime-role.test.ts` checks the role's limits in CI.

## Files (review P0-01)

Each environment has two private R2 buckets in Western Europe (the api serves public images itself, so neither bucket is public): `holypearls-staging-private` and `holypearls-staging-public`, `holypearls-prod-private` and `holypearls-prod-public`. Local development uses `holypearls-dev`. Each environment has its own R2 API token (Object Read & Write) limited to its two buckets. The private bucket needs a CORS rule so browsers can upload to it directly:

```json
[{ "AllowedOrigins": ["<that environment's web URL>"], "AllowedMethods": ["PUT", "GET", "HEAD"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
```

Turn on R2's object lifecycle or versioning settings where available. `packages/storage/src/r2.test.ts` checks that an upload is still readable by a new process; it runs whenever the `S3_*` values are set.

## When there's money or a domain

1. Buy the domain; add it to Vercel (web) and Resend (email DNS, see `EMAIL-DNS.md`), and point `api.` at Render.
2. ~~Create R2 API keys~~ Required before the next production release (see Files above).
3. Upgrade Render to a paid plan, split the worker into its own service and use a pre-deploy step.

## Addresses (set up 2026-09-28)

| | Staging | Production |
| :---- | :---- | :---- |
| Web | https://holypearls-git-dev-holyworths-projects.vercel.app (Vercel login required) | https://holypearls.vercel.app |
| API | https://holypearls-api-staging.onrender.com | https://holypearls-api.onrender.com |
| Render service | `holypearls-api-staging` (branch `dev`) | `holypearls-api` (branch `main`) |
| Neon branch | `staging` (database `neondb`) | `production` (database `holypearls`, empty) |

Local development uses the Neon branch `development`.

Notes:

- Staging's data started as a copy of development's TEST DATA, so staging shares development's `BETTER_AUTH_SECRET` (the seeded authenticator secrets are encrypted with it). Production has its own secrets.
- Each Neon branch gets its own app login and owner password (see Database roles above).
- Production has no staff yet. A first STAFF_ADMIN needs a one-off bootstrap command (not built yet; suggested for T13-05).
- Page refresh is on for production only (`WEB_REVALIDATE=on`); staging sets `WEB_REVALIDATE=off` because Vercel's login in front of it would refuse the worker's calls.
