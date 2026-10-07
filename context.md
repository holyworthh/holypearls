# Session context: hand-off for the next local sessions

Written 2026-10-07 at the end of a cloud session. Read this, then `CLAUDE.md`, before starting. `CLAUDE.md`, the ADR register and the PRDs win over anything here.

## Where things stand

- **`dev`** has everything up to T08-06. `main` hasn't been released to since 1 October.
- **Merged on 2026-10-07:**
  - **#85, T08-05 (courier prices):** Shipbubble prices checkout addresses outside the fixed zones.
  - **#84, Dependabot:** 23 minor and patch updates (next 16.3.8, NestJS 12.1.2, better-auth 1.7.7 and others).
  - **#86, T08-06 (book couriers):** Book courier from Shipments; Shipbubble webhooks move shipments along TECH-01 §4. Report: `docs/reports/T08-06.md`.
  - **A dependency pin** (`pnpm-workspace.yaml` → `overrides`): `source-map-js` ^1.2.2 for GHSA-68fv-2mgg-jv7q (high), which reaches `next`, `postcss` and `sanitize-html`. Without it the CI audit fails on every branch. Remove it once `next` and `sanitize-html` ship the patched version themselves.
- **Tracker:** T08-01, T08-05 and T08-06 are DONE. T04-03 stays IN REVIEW until one manual test-mode payment on staging (ATTENTION 27). Next up: T09-01.

## CI: the owner's Mac is a self-hosted runner

GitHub Actions minutes are used up for the month, so since 2026-10-07 CI runs on a self-hosted runner on the owner's Mac (labels `self-hosted, macOS, ARM64, holypearls`; installed in `~/actions-runner` as a login service, with Docker from Colima, also a login service). The repo variable `CI_RUNS_ON` (`["self-hosted","holypearls"]`) sends the job there; delete the variable to go back to `ubuntu-latest` once the minutes reset.

- CI only runs while the Mac is awake and logged in. Jobs queue one at a time, and a newer push to the same branch cancels the older run.
- E2E tests use ports 3001, 3100 and 3200, the image check 3099, and Postgres 55432. Stop local dev servers on those ports while CI runs.
- Runner status: `gh api repos/holyworthh/holypearls/actions/runners`. Service: `~/actions-runner/svc.sh status|start|stop`. Docker: `colima status`.

To check a branch without the runner, the CI steps can also be run by hand (they mirror `.github/workflows/ci.yml`):

```sh
pnpm install --frozen-lockfile
pnpm audit --prod --audit-level high
pnpm lint
pnpm typecheck
pnpm db:migrate && pnpm db:migrate              # from empty, then again
pnpm --filter @holypearls/db db:check           # needs new migrations committed first
pnpm test                                       # needs TEST_DATABASE_URL
pnpm seed
pnpm --filter @holypearls/ui tokens:check
pnpm check:openapi
docker compose config --quiet
pnpm build
pnpm --filter @holypearls/web check:no-admin
```

Plus, for a PR with migrations, the upgrade check: seed a database with `main`'s code, run this branch's migrations on it, migrate a second empty database, and `pg_dump --schema-only` both. They must match (the last step of `ci.yml` shows the exact commands).

End-to-end tests (Playwright, from `apps/web`):

```sh
E2E_API_PORT=3011 node --env-file=../../.env node_modules/@playwright/test/cli.js test
```

**Dependabot PRs** can't rebase themselves while the minutes are out. Merge `dev` into the Dependabot branch by hand, check `pnpm install --frozen-lockfile`, run the steps above, then push and merge.

## Next tickets

The order is fixed by dependencies: T09-01 → T10-01 → T10-03 → T11-01. All of them have customer or workspace screens, so the Pen MCP must be connected (it's why these are local sessions). For each screen, open its Pen frame first and compare at 375 and 1440 px after building (`CLAUDE.md`, Design fidelity).

### T09-01: customer accounts, history and guest linking (XL)
- **Build:** sign up; sign in (password and magic link); email verification; password reset; sign out everywhere; profile; security page. Then link guest records on a verified email, and an account dashboard with orders, quotes, projects, drafts to resume and receipts.
- **Done when:** AUTH rate limits applied; a password reset ends other sessions; an unverified email links nothing; a verified email links all earlier records.
- **Read first:** PRD-00 §5; TECH-03 §3–4 and §6.
- **Pen frames** (`docs/design/SCREEN-MAP.md`):

  | Screen | Frame | Variants |
  | :-- | :-- | :-- |
  | 87 Sign-in | `PJmAF` | desktop `hbNfP`, mobile `NN0Ko`, magic-link tab `eP8mP`, states `P345s` |
  | 88 Sign-up and email verification | `Nv9iJ` | desktop `gxYdT`, mobile `fybRd`, states `cBzxc` |
  | 89 Password reset | `KSASd` | states `YXtvJ` |
  | 90 Account security | `KReiI` | desktop `sEBQQ`, mobile `tneO8`, states `EQyq6` |
  | 91 Profile | `Wulll` | desktop `z7H5i`, mobile `SKaLX`, states `rSztv` |
  | 92 History and guest linking | `iVk2h` | desktop `TPpY8`, mobile `c3Xw8`, states `xvAva` |
- **Already there to build on:**
  - better-auth with the magic-link and two-factor plugins (`packages/auth/src/better-auth.ts`) and the auth routes (`apps/api/src/identity/auth-routes.ts`);
  - sign-in (`apps/web/src/app/sign-in/`) and the account security page with its sessions list (`apps/web/src/app/account/security/`), both from T00-06;
  - sign-in already claims the browser's cart, and a typed email never links an account (`apps/api/src/identity/customers.ts`, from #39). Guest linking must keep that rule: link only on a **verified** email.
- **Ledger design rules from the owner:** white surfaces, not beige, for full-width bands; four nav items (Products, Projects, Our Work, Help); drawn underlines stop at the end of the text. Tokens live in `packages/ui/tokens/tokens.json`; components in `packages/ui`.

### T10-01: organizations, locations, permissions, team and invitations (XL)
- **Build:** organizations, locations, memberships and permissions, with TECH-03 §7 role presets and location scope; policy functions and scoped queries; a staff read-only support view. Then invitations (role and locations), accepting with a matching email, role changes, deactivation, ownership transfer, last-owner protection and audit.
- **Done when:** cross-organization and cross-location attack tests pass; the last owner can't be removed; a deactivated member loses access immediately.
- **Read first:** TECH-03 §7, §11, §12, §17. PRD: B2B-FR-001–003, 090–093; OPS-FR-080–081.

### T10-03: workspace overview, lists, billing and search (XL)
- **Pen:** Workspace Overview `e851AK` (desktop) and `Rtyrl` (mobile); Orders index `Jn2wL`; Projects index `cNcKd`; B2B primitives `O6rPH9`.
- **Done when:** a single-location member sees no location switcher; a Lekki manager only sees Lekki; billing only for Owner and Admin; search never shows another location.

### T11-01: brand assets, templates and template orders (XL)
- **Pen:** Brand Assets index `bZMif`; Template Detail `B7pn1V`.
- **Done when:** uploading V5 keeps V4; a retired version can't be used for new orders; the API rejects changes to locked fields.

## Session workflow (from CLAUDE.md, in short)

1. One ticket per session. Read its full row in `docs/tracker/TICKETS.csv`, its PRDs, its Read-first sources and the previous report.
2. Write a plan and get approval before building.
3. Build on `feature/<ticket>-<short-name>` from `dev` (for example `feature/t09-01-customer-accounts`). Use Conventional Commits, with no AI or tool names in branches, commits or PRs.
4. Write `docs/reports/<TICKET>.md` in the TECH-08 §7 format, update the tracker row, run local CI, open the PR into `dev`.
5. Don't edit `docs/prd/`, `docs/tech/` or `docs/plan/` unless asked; propose changes in the report.
6. Owner instruction (2026-10-07): **don't stop to ask permission except for destructive actions.** Plans still need approval per `CLAUDE.md`.

## Waiting on the owner

- **Shipbubble (T08-05/06):** add `SHIPBUBBLE_API_KEY` (sandbox) to `.env` and staging Render. In Admin → Delivery & installation → Courier prices, enter the pickup address, choose a package type and switch courier prices on. In Shipbubble's dashboard, set the webhook URL to `https://<api domain>/v1/webhooks/shipbubble` for the sandbox and live accounts.
- **ATTENTION 27:** one test-mode payment on staging, so T04-03 can be marked DONE.
- **ATTENTION 30:** confirm hold reasons and when the balance falls due.
- **ATTENTION 33** (choose a courier aggregator) is answered: Shipbubble, built in T08-05/06. Mark it RESOLVED next time ATTENTION.md is updated.
- The rest of `docs/reports/ATTENTION.md` (Part B) is needed before launch.

## Known quirks

- **`apps/admin/next-env.d.ts`** is rewritten by every `next build` or `next dev` (`.next/types` vs `.next/dev/types`). Don't commit that change; `git checkout -- apps/admin/next-env.d.ts`.
- **`.claude/launch.json` and `.claude/settings.local.json`** are local tool settings. Keep them out of commits.
- **OpenAPI:** T08-01's shipment, problem and reorder routes aren't in `apps/api/openapi.json` (T08-06's two routes are). A small docs ticket could add them.
- **Shipbubble booking** holds a row lock while it calls Shipbubble (up to three calls, 8 seconds each). Shipbubble's booking response has no label link, so the tracking page is shown instead.
