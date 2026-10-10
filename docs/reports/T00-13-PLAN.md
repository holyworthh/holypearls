# T00-13 — Audit remediation plan

Status: APPROVED by the owner, 10 October 2026. The owner also required tests before implementation and authorized connected Neon/Vercel/Cloudflare validation.

## Isolation and scope

- Worktree: `/Users/holyworthakhigbe/.codex/worktrees/audit-remediation/holypearls`.
- Branch: `fix/t00-13-audit-remediation`.
- Base: merged `origin/dev`, commit `fee3842abb7631b7d36a5ad021ef1bc41b11fcef` (CSV-import PR 103 included).
- The primary checkout is actively on allowances. Company-store PR 104 and subsequent allowances work are outside this branch. Do not copy its dirty files, switch its branch, reuse its running servers/database, or modify the Pen file.
- Goal: resolve all 13 numbered findings in the 10 October audit. One proposed cross-module bug-fix ticket and one PR keep this session within the one-ticket rule. Its scope is larger than TECH-08's normal L ticket, so approval includes an explicit exception for this consolidated remediation scope.
- Previous report: `docs/reports/T00-12.md`. This is a correctness/security follow-up to the prior cleanup; it is not another broad cleanup campaign.

## Proposed complete tracker row

| Field | Value |
| --- | --- |
| Ticket | T00-13 |
| Pass | P00 Platform follow-up |
| Module | files / configuration / organizations / orders / payments / shipments / platform |
| Title | Audit remediation |
| Build | Fix shared artwork cleanup; immutable checked uploads; immediate organization revocation for direct records/account lists; attached-file authorization; durable payment verification; per-currency billing; complete payment status facts; recoverable courier booking; complete scoped pagination/totals; batch order-card reads; connect existing workspace assets/templates/groups/approval attention; pass integration environment variables through Turbo; start admin from pnpm dev. Add regressions and complete UI/contracts/fixtures/OpenAPI/config callers. |
| Not in this ticket | Company store and allowances; unfinished account/refund/staff/SEO/privacy/operations features assigned to other tickets; real photos/logo/legal/pricing inputs; changing providers, product rules or deployment plans; merging/deploying; adding infrastructure or unrelated refactors. Launch observations remain explicitly tracked as existing gates, not silently marked complete. |
| Depends on | T00-12, T01-05, T03-03, T04-05, T05-05, T08-06, T10-03, T11-04b, T12-03 — all DONE in the selected base. |
| PRD refs | PRD-00 §§5–8,12; COM-FR-050–054; PAY-FR-003–006,008–010,012; FUL-FR-031–033,060–062 with courier owner amendment; B2B-FR-003,010–013,020–024,030–033,040–044,050–055,061. |
| Read first | ADR register; owner decisions 2026-10-05/08/10; PRD-00/02/03/04/05; SCREEN-MAP/DESIGN-SYSTEM; TECH-00 §§4–5; TECH-01 §4; TECH-02; TECH-03 §§5–7,12,17; TECH-04 §§7,13; TECH-05 §§2,5–7,16; TECH-07; TECH-08 §§6,13; audit; T00-12 and affected module reports. |
| Done when | All 13 findings have a tested fix or an explicitly resolved correction of the original finding; all private callers enforce revocation; replay cannot change checked bytes; shared objects survive copy/unlink/cleanup; interrupted attempts recover; money totals stay per currency and span the full scope; ambiguous courier outcomes cannot cause blind duplicate bookings; workspace integration matches its mapped design; required checks and same-viewport comparisons pass; report and tracker updated; PR open. |
| Size | XL — owner approved the consolidated scope exception. |
| Status | IN PROGRESS; IN REVIEW only after PR opens; DONE only after merge and Definition of Done. |
| Branch | fix/t00-13-audit-remediation |
| PR | To be created after implementation and checks. |
| Completion summary | To be recorded after verification. |
| Blocker | None. Plan approved. |

The approved row has been added. T04-03's real staging test-payment acceptance remains IN REVIEW; this bug-fix ticket repairs the existing implementation and does not declare that acceptance gate DONE. If live-provider acceptance becomes necessary to validate a fix, record the remaining gate rather than fabricating a result.

## Implementation sequence and checks

### 1. Files and copied configurations — findings 1, 2, 4

Trace every copy, attachment, detachment, historical snapshot, storage write and cleanup caller before edits. Reuse the existing file services and adapter.

- Keep files attached while references survive a copied configuration's unlink. Coordinate attachment and cleanup and validate deletion eligibility before deleting storage objects. Retained orders, template assets and reorders must survive.
- Make signed upload objects write-once, with matching S3/local behavior and immutable inspection input. If the signed write needs headers, extend the existing upload contract and FileUpload caller together; preserve real network retry/replacement recovery. Check R2/MinIO compatibility before choosing the final write-once mechanism.
- An attached record's policy result is authoritative. Add missing legitimate owner cases, including configuration files, before removing uploader fallback for attached records. Preserve approved guest link and staff workflows; deny absent/unknown owner policies.
- Tests: copy/unlink/cleanup/original download; attachment-versus-cleanup race; original/rendition retention; repeat PUT after READY; checking-versus-PUT race; local/S3 signing behavior; revoked asset uploader; legitimate configuration, guest, proof and staff access.
- Endpoints: existing POST uploads, POST complete, GET file/download/preview and draft file attachment/removal. No new public route unless the current contract cannot carry required signed headers.
- Jobs: existing file.inspect/file.preview/cleanup.daily; use durable cleanup retry data if storage deletion needs it. Migration only if required to make object cleanup/retry durable; no destructive rewrite of existing file keys.

### 2. Organization record authorization — finding 3

- Use current membership/location policy helpers before personal ownership shortcuts on organization records.
- Reach order/quote reads, personal account order/receipt/quote lists, files of orders and all action callers: payment, proof, change/cancel, reorder and problem reports. Personal purchases remain available to their owners.
- Preserve explicit record-specific guest capabilities according to TECH-03; a deactivated account must not regain organization access through its personal owner ID or device cookie.
- Tests: signed out, different customer, different organization/location, deactivated member, reduced location scope, active buyer's own records, active permitted reader, personal owner and valid/expired/revoked guest link. Avoid duplicating controller-only checks in services.
- Existing routes only; policy correction, no new role/permission/product status.

### 3. Payment recovery and statuses — findings 5, 7

- Commit the existing payment.check schedule with CREATED attempt creation, before external initialization. Reuse the checker, stable reference, unique constraints and transaction-aware queue.
- Distinguish definite provider refusal from an ambiguous transport result. Keep automatic reconciliation and the existing eventual review rules.
- Load open reviews and latest attempts through one payments-owned fact reader; use customerPaymentStatus for order pages, workspace cards and related summaries, including direct checkout orders.
- Tests: interruption before initialize; provider success followed by commit/queue failure; delayed or absent webhook; replay/late success; failed quote installment; open duplicate review on a paid direct order. Confirm no duplicate order/receipt/production release.
- Existing checkout/installment payment routes and jobs; CREATED/PENDING/UNKNOWN and PROCESSING/REVIEW_REQUIRED remain internal statuses; customer status priority follows PRD-00 and TECH-01. No new payment provider and no new fixed deposit percentage.

### 4. Workspace billing, lists and batching — findings 6, 9, 10

- Return money totals per ISO currency and update the typed contracts, browser displays, fixtures and generated OpenAPI. Never combine USD cents with NGN kobo or introduce currency conversion.
- Calculate full-scope billing aggregates independently of page limits. Put status/attention selection before pagination; add stable cursors/page links where capped history currently has no next page. Counts describe the full authorized scope.
- Batch page-level order items, receipts, schedules, attempts/reviews, production/holds and proofs by order IDs. Reuse existing domain helpers and facts; avoid cache services and one-helper-per-row database work.
- Tests: mixed currency; an old unpaid order behind 200 completed orders; receipt history beyond 100 rows; exact page boundaries/ties; location/permission isolation; representative query-count bound and query-plan/timing check.
- Routes: GET /v1/organizations/:id/orders, overview, billing and search; existing browser workspace orders/billing. Add validated paging parameters only where used; do not change unpaged callers silently.
- Migration: targeted indexes only if the resulting SQL plan requires them; no financial-record rewrite.

### 5. Recoverable courier booking — finding 8

- Persist a booking operation and stable provider request token before external booking, then finalize the shipment from the recorded outcome.
- Retry database finalization safely. If provider acceptance is ambiguous, expose a staff reconciliation warning and block a fresh booking until resolved; use provider lookup/idempotency only where its actual API supports it. Do not label an unknown external result as a definite failure.
- Keep official shipment statuses unchanged and customer booking details private. Reuse the existing shipment/admin patterns and request-ID audit/logging.
- Tests: provider accepted but response lost; provider success followed by database/audit/notification failure; concurrent calls; safe finalization retry; forbidden staff/customer access. Use FakeCourier before any live-provider validation.
- Existing POST /v1/admin/shipments/:id/courier and shipment views. Expected additive migration: a durable courier-booking operation/result record with uniqueness per shipment; internal operation state is distinct from PRD shipment status. Allocate the migration after checking latest merged dev so it does not collide with concurrent company-store/allowance migrations.

### 6. Workspace integration — finding 11

- Connect existing internal approval attention, quick actions, templates and groups to overview, in the PRD order. Add assets/templates/groups to workspace search under existing scope readers.
- Update overview/search contracts, web pages/components, tests and OpenAPI in the same change. Use existing AssetViews, TemplateViews, GroupViews, ApprovalViews, WorkspaceLists/WorkspaceShell and module readers rather than introducing a search engine or parallel policies.
- Tests: available result for each type; denied member/role/location and cross-organization results; empty/loading/error recovery; approval action permissions; desktop/mobile keyboard and overflow checks.
- Screens: Pen frame 28 e851AK (overview child MblNx), mobile 62 Rtyrl, order index 63 Jn2wL, frame 130 s0fg0 (billing juM56/tDzhI; search pjuPc/g8oai; states U5Koq). Reopen relevant frames through the Pen MCP immediately before UI work.
- Tokens/components: current Ledger theme, packages/ui tokens.json and existing HP/UI cards, fields, buttons, badges, table/list and recovery patterns. Do not hard-code style values; record any missing exact Pen token before adding it.
- Compare rendered changed screens to Pen at 375 px and 1440 px, using a design-specific width when specified. Record and resolve visible deviations; include loading/empty/error/permission and mixed-currency states.

### 7. Configuration and development convenience — findings 12, 13

- Add SHIPBUBBLE_API_KEY and INDEXNOW_KEY to the appropriate Turbo environment lists. Check child-task delivery/cache inputs using dummy values only.
- Add the existing admin package to pnpm dev and verify all documented local surfaces start on their configured ports. Audit tests use separate ports from anyone else's servers.
- Keep the moderate transitive esbuild advisory recorded; do not blindly force an incompatible dependency override. Upgrade only if a compatible, tested minimal fix is established.

## Verification and completion

Use an isolated test database/storage and separate API/web/admin ports. Install/run with repository-pinned Node 22 and pnpm 11.15.1 where available; document any runtime limitation.

1. Turn the seven audit probes into meaningful failing regression tests before each root-cause fix; add courier failure and large-history/query-count cases.
2. Run focused checks, then lint, typecheck, all package/API tests and builds.
3. Run migrations from empty and upgrade from the preceding schema, seed, migration drift/snapshot check, token generation check, OpenAPI check, dependency advisory gate and customer-build no-admin check.
4. Run browser coverage at 375/1440 plus targeted changed-screen comparisons and keyboard checks. Do not neutralize sticky UI for the manual focus/target review.
5. Review every TECH-08 §13 item and all 13 audit findings; record evidence, limitations, source conflicts and remaining launch gates in docs/reports/T00-13.md.
6. Update only this ticket to IN REVIEW after opening a Conventional Commit-titled PR to the repository's current dev integration branch. Follow the configured owner identity; no tool attribution. Attach the PR to this chat and stop; do not merge or deploy.

## Questions and approval

AGENTS.md requires: "Write a plan and wait for approval before implementation." The owner approved this plan and the single consolidated T00-13 scope, including the larger ticket-size exception, before code changes.

TECH-08 describes merging tickets to main, while current owner practice integrates through dev (also recorded in T00-12). Preserve current dev practice and document that conflict; do not edit plan/PRD/TECH sources.

Separate worktrees isolate filesystem changes, not future merge conflicts. Rebase on newly merged dev work at an appropriate checkpoint and resolve overlapping contracts/migrations without touching the other agent's checkout. Live payment/courier acceptance, production credentials and real business assets remain owner/environment-dependent gates.
