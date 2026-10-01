# Engineering review fixes (2026-10-01)

Fixes for the principal-engineer review of `dev` at `1331bf9`. They land as five pull requests into `dev`, in the review's order. Owner decisions (2026-10-01): build all five and make the infrastructure changes; skip branch protection for now; retention starts at 72 hours for open checkouts, 90 days before abandoned guest checkout details are erased, and 90 days for untouched drafts.

| Finding | Status | Where |
| :-- | :-- | :-- |
| P0-01 Files on container disk | Code done; staging and production need R2 keys (ATTENTION 3) | PR A |
| P1-01 Branch protection | Not possible on GitHub Free for a private repository; skipped by the owner (ATTENTION 11) | — |
| P1-02 Database privileges | Code done; Neon logins per branch as each environment picks up `0023` | PR A |
| P2-05 Page refresh switch | Done | PR A |
| P1-03 Typed email linking an account | Done | PR B |
| P1-04 Sign-in claim of cart, designs and checkout | Done | PR B |
| P1-05 Every design change closes the checkout | Done | PR C |
| P1-06 Frozen order snapshot | Done | PR C |
| P1-07 Stale checkout when nothing is ready | Done | PR C |
| P2-01 Atomic contact step | Done | PR C |
| P2-04 Cart and checkout database rules | Done | PR C |
| P1-08 Anonymous write limits and the visitor's address | Done; `WEB_PROXY_SECRET` on staging, production at release | PR D |
| P2-02 Quote items all or nothing | Done | PR D |
| P2-03 Checkout and draft retention | Done with the owner's starting values; to confirm with accountant and lawyer | PR D |
| P2-09 Personal data in the audit log | Done | PR D |

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

### Infrastructure done after PR A merged
- Staging ran `0023` on deploy. On the Neon `staging` branch I created `holypearls_app`: a generated password, a member of `holypearls_runtime`, acting as it. Staging's `DATABASE_URL` and `DATABASE_DIRECT_URL` now use it, `DATABASE_MIGRATION_URL` uses the owner, and `WEB_REVALIDATE=off`. After the redeploy, staging reads and writes as the app role. The login can't create in `public` or change the audit log.
- Production changes wait for the release (ATTENTION 12).

## PR B: customer identity and cart claim (P1-03, P1-04)

- **Customer helpers.**
  - `ensureGuestCustomer` never writes `user_id`.
  - `ensureAccountCustomer` takes the email from the session and finds the account's record first. It links an email's record only when the account's email is verified (TECH-03 §6).
  - `customersForContact` separates the record's owner from the person a typed email reaches.
- **Signed-in flows.** Checkout contact, emailed design links, quote requests and help requests use the account's customer. A typed email is contact data and the link recipient only. Quotes now store the contact email.
- **Sign-in claim.** `claimDeviceCommerce` (`apps/api/src/sales/claim.ts`) runs in one transaction on any draft, cart or checkout request that has a session and the device cookie. It:
  1. locks both carts
  2. moves every browser design to the account
  3. moves or merges the cart (items are unique per design)
  4. abandons the browser's open checkout and moves its checkouts to the account

  Once claimed, it does nothing. The old inline merge in `findCart` is gone.
- **Tests** (`claim.test.ts`, 6):
  - each P1-03 case from the review's list
  - verified-only linking
  - the sign-in claim, with another device opening, editing and quoting
  - merging into an existing account cart under two parallel claims

## PR C: checkout integrity (P1-05, P1-06, P1-07, P2-01, P2-04)

- **Every change closes the checkout.** `touchOrderableConfiguration` raises the version and change time and closes an open checkout. All of these use it:
  - answers, sizes and placements
  - artwork added or removed
  - the low-resolution choice
  - the personalisation import

  A step change doesn't.
- **Frozen snapshot.** `OrderableConfigurationSnapshotV1` (`apps/api/src/sales/snapshot.ts`) is frozen per item at checkout. It holds:
  - product id, slug, name and family
  - answers with the labels shown
  - quantity, rush and artwork choice
  - garment details
  - every personalisation row
  - files with storage keys
  - the whole price result, including lines and rule versions
  - the VAT setting and rate
- **Stale checkouts.** Moving items to the quote group, abandoning the old checkout and opening the new one share one transaction. With nothing ready, the old checkout still closes.
- **Contact step.** It runs in one transaction.
- **Database rules** (migration `0024`, which repairs older rows first):
  - one owner per cart
  - one owner per open checkout; a closed one may have none
  - step and currency checks
  - a foreign key to `tax_settings`
- **Tests** (`checkout-integrity.test.ts`, 7):
  - each mutation closes the checkout
  - the snapshot is unchanged after catalogue, price, VAT and design changes
  - the zero-ready case
  - the atomic contact step
  - the database rules

Not in scope: keeping files that a paid order references is T04-05's job. Until then, removing a file closes the checkout that held it, so nothing payable points at a file the clean-up can delete.

## PR D: quotes, retention, audit and limits (P2-02, P2-03, P2-09, P1-08)

- **Quotes.** `quotable` checks a design, and `quoteIn` makes its quote inside a given transaction. "Submit quote items" checks every item first, then quotes them all in one transaction.
- **Retention** (`apps/api/src/sales/retention.ts`, part of `cleanup.daily`):
  - New checkouts get `expires_at`, 72 hours after creation; answers after it are refused, and the clean-up closes expired open checkouts.
  - Checkouts abandoned for 90 days lose their contact, address and billing details. Amounts and frozen items stay, and `personal_data_purged_at` records when the details were erased.
  - Drafts untouched for 90 days close and lose their personalisation rows. Their files are let go, and the file clean-up removes them after 7 days.
  - The job logs each count. Migration `0025` adds the two columns.
- **Audit.** Customers appear in the audit log as "Customer" and are identified by ID only; staff stay named. Emails, phone numbers, addresses, contact blocks and billing blocks are removed from `before` and `after`, and emails and phone numbers are masked in record labels.
- **Limits.**
  - `COMMERCIAL_WRITE` now also allows 60 per minute per address. An anonymous browser's device cookie is its subject.
  - `X-Forwarded-For` is never trusted. The web app's proxy, where Vercel guarantees the address, sends it in `x-hp-client-ip` along with `WEB_PROXY_SECRET`; any other request counts as the address that connected.
  - Server-rendered API calls send the same headers, and idempotency for anonymous requests uses the same address.
- **Tests** (`abuse-quotes-retention.test.ts`, 6):
  - 62 anonymous drafts in one minute with forged headers: the 61st and 62nd get 429
  - a visitor vouched for by the proxy still gets through
  - bulk quotes, all or nothing
  - retention at 73 hours and at 91 days
  - an expired checkout is refused
  - an untouched draft closes
  - the audit filter

### Questions
- The retention values are the owner's starting values (2026-10-01). Confirm them with the accountant and lawyer; they live in one place (`RETENTION`).
- Personal details are erased from every abandoned checkout, signed-in or guest. The review suggested guest checkouts only; erasing both keeps less.

## PR E: pre-launch gates (P2-06, P2-07, P2-08, P3-01, P3-02)

- **Security headers.**
  - Web (`next.config.mjs`): a Content-Security-Policy that allows scripts only from this site, upload calls to R2, and no plugins, framing, base-URI or form-action changes. Also `nosniff`, `strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, a Permissions-Policy, HSTS in production, and no `X-Powered-By`.
  - Guest-link pages (`/l`, quotes, proofs, orders, configure, collections, help) send `no-referrer`.
  - API: `default-src 'none'`, `frame-ancestors 'none'`, `nosniff`, `no-referrer`, `DENY`, `CORP same-site`, and HSTS over HTTPS.
  - Tested in `app.test.ts` and in an e2e that loads the homepage and a product page with no CSP violations.
- **Dependency checks.** `pnpm audit --prod --audit-level high` gates CI; one moderate advisory remains and is allowed. `.github/dependabot.yml` opens weekly pull requests for npm, GitHub Actions and Docker into `dev`.
- **Release upgrade check (P2-06).** CI builds `main` in a worktree, migrates and seeds a database with it, runs this branch's migrations with the real runner, and diffs the schema against a fresh database. Any difference fails the build.
- **Slimmer image (P3-02).** The runtime image now holds only the workspace manifests, built `dist` folders, the migrations, the start script and a fresh production-only install of the API, worker and db packages, with no sources, tests, web app or build tools. Because Docker isn't available locally, CI builds the image and runs `deploy/start-single.sh` against Postgres until `/health/ready` answers, and checks that no sources are inside.
- **README (P3-01).** Rewritten around the services, checks, database changes, environments and releases, and ticket workflow.
- `turbo.json` passes `WEB_REVALIDATE`, `WEB_PROXY_SECRET` and `DATABASE_MIGRATION_URL` through to tasks.

### Deviations and what's left
- **Script nonces (P2-07).** Inline scripts are still allowed. Per-request nonces make every page dynamic, which would end the published-page caching (`revalidateTag`), so it needs a decision. It's the remaining step of T15-01's CSP work. Everything else in the review's header list is done.
- **CodeQL (P2-08).** It needs GitHub Advanced Security on a private repository, which isn't available on the Free plan; Dependabot and `pnpm audit` cover dependencies. Secret scanning has the same limit.
- **SBOM (P2-08, P3-02).** Not generated yet. Render builds the release image itself, so an SBOM belongs with a CI-built image (the paid-plan setup in ENVIRONMENTS.md).

## Tests overall
Every PR passed the full API suite locally against Neon. The browser suite passed at 375 and 1440 px (183–184 passed, 15 skipped). Each PR's CI is linked from its pull request.
