# HolyPearls

The HolyPearls storefront and operations platform: product discovery, configurators with live pricing, cart and checkout, quotes, files and proofs, and the staff admin.

## How it fits together

| Part | Where | What it does |
| :-- | :-- | :-- |
| Web | `apps/web` (Next.js) | Public site, product pages and configurators, cart, checkout and account. The browser talks only to this domain; `/api/*` is forwarded to the API. |
| Admin | `apps/admin` (Next.js) | The staff admin, on its own subdomain (ADR-017). It forwards `/api/*` with its own proxy secret; the API serves admin routes and staff sign-in only to it. |
| API | `apps/api` (NestJS) | Every business rule: catalogue, configuration and pricing, cart and checkout, customers and guest links, files, content, search and audit. |
| Worker | `apps/worker` | Background jobs on pg-boss: email, file inspection and previews, search index, page refresh and the daily clean-up. |
| Packages | `packages/*` | `contracts` (Zod schemas shared by web and API), `db` (Drizzle schema and migrations), `auth`, `config` (typed environment), `jobs`, `storage` (R2/MinIO/local), `email`, `ui` (design tokens and components), `web-kit` (browser and server API helpers shared by web and admin), `payments` (Paystack), `testkit` (test databases and seed data). |

Money is whole minor units (`bigint`) and is always calculated on the server. Prices, VAT and rules are effective-dated and insert-only, and the audit log can't be changed. Architecture and rules are in `docs/tech/TECH-00.md` to `TECH-08.md`, and decisions are in `docs/plan/ADR-REGISTER.md`.

## Local setup

Use Node.js 22 and pnpm 11.15.1.

1. Run `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to `.env` and fill in the secrets. Every setting is explained there.
3. Start the services: `docker compose up -d` (PostgreSQL, MinIO and Mailpit), or point `DATABASE_URL` at a Neon development branch.
4. Run `pnpm db:migrate`, then `pnpm seed` for the TEST DATA catalogue and test people.
5. Run `pnpm dev`: the web app on port 3000, the admin on 3002, the API on 3001 and the worker.

## Checks

These run in CI on every pull request (`.github/workflows/ci.yml`):

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (unit and API tests, each file with its own migrated database) and `pnpm build`.
- `pnpm db:migrate` twice and `pnpm --filter @holypearls/db db:check`: migrations apply from empty, re-run cleanly and match the schema.
- An upgrade from `main`: its schema and seed data, then this branch's migrations, compared with a fresh database.
- `pnpm audit --prod --audit-level high`, plus Dependabot's weekly update pull requests.
- The production Docker image is built and started (migrations, worker and API).
- `pnpm --filter @holypearls/web test:e2e`: Playwright accessibility, keyboard and layout tests at 375 and 1440 px.

## Database changes

Change the schema in `packages/db/src/schema`, then run `pnpm --filter @holypearls/db db:generate` and commit the migration. For data repairs or roles, use `drizzle-kit generate --custom`. Migrations run as a release step with the schema owner's `DATABASE_MIGRATION_URL`. The running app uses a row-only role (`holypearls_runtime`), so it can't change the schema.

## Environments and releases

| Branch | Environment |
| :-- | :-- |
| feature branches | CI only |
| `dev` | staging (Vercel branch preview, Render `holypearls-api-staging`, Neon `staging`) |
| `main` | production (Vercel, Render `holypearls-api`, Neon `production`) |

Branch from `dev` and open a pull request into `dev`. To release, open a pull request from `dev` into `main` and merge it with a merge commit. Production checks its own settings when it starts and refuses unsafe ones (`packages/config`). Settings, roles, storage and addresses are in `docs/ops/ENVIRONMENTS.md`.

## Working on tickets

Tickets are in `docs/tracker/TICKETS.csv`, reports in `docs/reports/`, and the owner's open decisions in `docs/reports/ATTENTION.md`. `CLAUDE.md` describes how tickets are planned, built and reviewed, the design-fidelity rules and the Git conventions (ADR-016).
