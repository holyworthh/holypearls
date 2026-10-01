# Engineering review fixes (2026-10-01)

Fixes for the principal-engineer review of `dev` at `1331bf9`. They land as five pull requests into `dev`, in the review's order. Owner decisions (2026-10-01): build all five and make the infrastructure changes; skip branch protection for now; retention starts at 72 hours for open checkouts, 90 days before abandoned guest checkout details are erased, and 90 days for untouched drafts.

| Finding | Status | Where |
| :-- | :-- | :-- |
| P0-01 Files on container disk | Code done; staging and production need R2 keys (ATTENTION 3) | PR A |
| P1-01 Branch protection | Not possible on GitHub Free for a private repository; skipped by the owner (ATTENTION 11) | — |
| P1-02 Database privileges | Code done; Neon logins per branch as each environment picks up `0023` | PR A |
| P2-05 Page refresh switch | Done | PR A |

## PR A: infrastructure safety

**Production fails closed** (`packages/config`). With `HP_ENV=production` the api and worker refuse to start when:
- files would go to the container's disk, an `S3_*` value is missing, or the private and public buckets are the same
- email isn't Resend, or has no key
- page refresh is off, or on without its URL and secret
- the demo routes are on
- an address is `localhost` or `.test`
- `DATABASE_URL` logs in as a role that can change the schema (`runtimePrivilegeProblems`, checked at start)
- migrations run without `DATABASE_MIGRATION_URL`

Errors name the setting and the rule, never the value. Staging keeps local files until its R2 keys exist; then the same rule can apply there (a one-line change).

**R2.** Development uses your bucket `holypearls-dev` (Western Europe). `packages/storage/src/r2.test.ts` uploads through a signed URL, checks the size and first bytes, then reads and downloads the file from a brand-new client (the api after a restart). It passes against `holypearls-dev` and is skipped where no `S3_*` values are set, as in CI. Both buckets stay private: the api serves public images itself.

Deviation: I created staging and production buckets through the Cloudflare connector, but it put them in eastern North America and can't set a location, and your key is limited to `holypearls-dev`, so I deleted them (empty) the same minute. The dashboard steps are in ATTENTION item 3.

**Database roles.** Migration `0023_runtime_role` creates `holypearls_runtime`:
- reads and writes rows in every table, now and in later migrations (default privileges)
- can't create anything in `public`, alter or drop tables, or disable triggers
- isn't granted update, delete or truncate on `audit_log`, on top of the existing trigger
- owns the `pgboss` schema, so pg-boss can create its queue tables and upgrade them. The migration creates the schema and pg-boss no longer tries to (`createSchema: false`)

The migration owner is a member of the runtime role, so one login still does everything locally and in tests. Each environment's app logs in as `holypearls_app`, a member that acts as `holypearls_runtime`. Migrations use `DATABASE_MIGRATION_URL` (`migrationConnectionString`).

`apps/api/src/platform/runtime-role.test.ts` makes such a login and checks that it:
- reads and writes rows
- can't create a table, add a column, drop a table, drop the audit trigger or disable triggers
- can't update, delete or truncate the audit log
- passes the production start-up check, which the owner fails
- can start the job queue

**Page refresh** (P2-05). `WEB_REVALIDATE` (`on`/`off`), `WEB_REVALIDATE_URL` and `WEB_REVALIDATE_SECRET` are in the typed worker config. Turning it on needs both values, production needs it on, and a failed call throws, so the job retries. Staging sets `off` explicitly.

**Docs.** `docs/ops/ENVIRONMENTS.md` (variables, Database roles, Files), `.env.example`, `docs/reports/ATTENTION.md` items 3, 8, 11 and 12.

**Tests.** `@holypearls/config` gains 7 cases: local disk, incomplete R2, one bucket for both, secrets not printed, file email, `.test` addresses, demo routes, refresh off, a complete setup, and local/staging defaults. The full unit suite passes, apart from the seed test's 60-second timeout against the remote development database, which also happens on `dev`.

### Questions
- The review asks for versioning or recovery on R2. R2 has no object versioning; its lifecycle rules and bucket locks are dashboard settings, listed in ENVIRONMENTS.md.
