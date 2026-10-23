# T15-03 part B: NDPA tools, consent and retention

Status: ready for review. Part A (payment stress tests and race fixes) is a separate PR and is not covered here. The tracker row is left for the orchestrator.

The owner pre-approved the plan and waived the T15-01 dependency (recorded here as instructed). The plan defaults for Q1–Q8 were accepted.

## What was built

| Area | Where |
|---|---|
| Migration `0059_privacy` (adds `customers.marketing_consent_at`, `customers.erased_at`) | `packages/db/drizzle/0059_privacy.sql` |
| Contracts: privacy lookup/erase/person, checkout `marketingConsent`, profile and `/v1/me` `marketingConsent` | `packages/contracts/src/{platform,sales,account,identity}.ts` |
| Per-module `…ForPerson` and `erase…` functions | identity, sales, quotes, projects, orders, shipments, payments, groups, organizations, platform |
| Orchestrator, controller, routes `POST /v1/admin/privacy/{lookup,export,erase}` | `apps/api/src/platform/privacy.ts`, `privacy.controller.ts` |
| Retention: expired guest links, Better Auth verifications, participant contacts 12 months after delivery | `platform/cleanup.ts`, `groups/collections.ts`, worker log line |
| Consent: checkout tick, Profile checkbox, audit `account.marketing_consent_changed` | `sales/checkout.ts`, `identity/account.ts`, web `CheckoutView`, `ProfileForm` |
| Pages `/privacy`, `/privacy/processors` (noindex, placeholder copy), footer link | `apps/web/src/app/privacy/**`, `SiteShell.tsx` |
| Admin page "Privacy requests" | `apps/admin/src/app/(shell)/privacy/{page,Privacy}.tsx` |
| Tests | `platform/privacy.test.ts` (12), retention cases in `platform/abuse-quotes-retention.test.ts` and `groups/order-drafts.test.ts`, consent case in `identity/accounts.test.ts` |

Permissions: all three routes use `StaffGuard()`; the service requires `EXPORT_PERSONAL_DATA` (403 `PERMISSION_REQUIRED`); export and erase also need `requireRecentMfa`. Negative tests: signed out, customer, `financeFolake` (403 on all three), stale MFA (+16 min) on export and erase, lookup needs only the permission, erase needs `confirm: true`.

## Personal-data inventory (decision per column, as built)

| Table.column | On erasure | Module |
|---|---|---|
| customers.email, email_normalized | unique placeholder `erased+<id>@erased.invalid` | identity |
| customers.name, phone, marketing_consent_at, email_verified_at, user_id | null; `erased_at` set | identity |
| users.name/email/image/pending_email(_at)/email_verified | "Erased customer" / placeholder / null / null / false | identity |
| sessions, accounts, two_factors | rows deleted | identity |
| verifications (identifier contains the email) | rows deleted | identity |
| guest_links (guest_sessions cascade), email_codes | rows deleted | identity |
| invitations.email_normalized | placeholder; PENDING becomes REVOKED | organizations |
| memberships (ACTIVE), staff_profiles | block erasure (`ORGANIZATION_MEMBER`, `STAFF_ACCOUNT`) | organizations / identity |
| checkouts.contact, address, billing | null, `personal_data_purged_at` set; OPEN without payment become ABANDONED | sales |
| quotes.contact, request_snapshot; quote_change_requests.note | placeholder contact; scrubbed | quotes |
| projects.answers, submitted_snapshot, contact | scrubbed / placeholder | projects |
| orders.contact / address / billing | placeholder / null / company name and tax ID only when a company invoice | orders |
| orders totals, VAT, number, items, snapshots | kept (tax record) | none |
| receipts.payer | `{name: "Erased customer", email: null}`; number, amount, reference, lines kept | orders |
| shipments.destination, courier_events.raw_body | removed / scrubbed JSON | shipments |
| problem_reports.description, problem_replies.body | emails and phones masked | shipments |
| payment_attempts | kept (no contact data) | none |
| paystack_events.raw_body | personal keys removed (adds `account_name`, `ip_address` to the key list); row and key kept | payments |
| participants.name, email; import_rows.raw, values | "Erased customer" / placeholder; emptied | groups |
| help_requests (+ replies cascade) | deleted | platform |
| notifications.recipient, sealed_data | placeholder / null | platform |
| idempotency_keys.response_body | rows containing the email deleted. The full-table scan found these (a submitted project's saved reply), so this was added | platform |
| quote_versions.snapshot, proof_versions (frozen by triggers) | kept; the scan finds no contact data in them, so no trigger was touched | none |
| audit_log | kept (insert-only, free of personal data by design) | none |
| files (uploaded artwork) | kept (order record); owner action below | none |

Blockers, checked in lookup and again inside the erase transaction: `STAFF_ACCOUNT`, `ORGANIZATION_MEMBER`, `OPEN_ORDERS`, `PAYMENT_IN_PROGRESS`.

## Done-when evidence

- "Erasure keeps payment and tax records but removes name and contact details": one test snapshots orders (number, totals, VAT), receipts (number, amount, reference, lines), payment attempts and order items, erases, and expects equality. It then scans every `public` base table as text for the email, phone (with and without spaces), name and street and expects zero matches. The same scan run before the erasure is asserted to hit customers, orders, receipts, checkouts, paystack_events, help_requests and notifications, so it cannot pass by being blind. A second scan covers an accepted-quote customer (the frozen quote and proof tables).
- Retention: expired guest links (with sessions) and verifications deleted, unexpired kept; participants cleared at 13 months, kept at 11 months and when undelivered; repeat runs change nothing.

## Pen comparison

Frames: `TLRc6`/`nDtGs` (notice), `TDnMA`/`HBwdg` (processors), `EM7rw` (consent), `O7Qcg`/`jUCsW` (admin). Rendered locally at 1440 and 375 (notice, and admin at 1440). Processors uses the same stylesheet and was not screenshotted.

Differences:
- Page background is white, not `$hp-bone`, following the site-wide rule (T04-01). Panels carry a 1px `--hp-line` border so they still read as panels.
- The warning banner uses the shared `Notice`, which has no icon; the Pen banner has an 18px icon.
- Panel rail width 300px is a literal (the Pen value). `--hp-space-56` (56px) was added to `inferred-tokens.css` for the Pen's 56px side padding.
- The Pen anchor "Contact" has no panel in the design; it links to `/contact`.
- Admin: the record header title uses the admin page title style, larger than the Pen's `XyKrP` header. The "will be removed" checks render as disabled checked boxes (grey) instead of ink boxes. The "kept" panel shows counts, not order and receipt numbers. The Sidebar and TopBar come from the existing shell. Step-up, completed and 403 states reuse `StepUpDialog`, `Notice` and `PermissionDenied`; they were checked in code and API tests, not rendered.
- Checkout and Profile consent: built from the shared `Checkbox`, with the Pen help text. The Profile success banner drops "or from any marketing email" (no marketing email exists yet, Q4).

## Deviations from the plan

1. `PAYMENT_IN_PROGRESS` also covers `REVIEW_REQUIRED` intents (not only PROCESSING). Resolving a review builds the order from the checkout's contact, so erasing mid-review would lose it.
2. `queueEmail` now returns `string | null`; the two internal callers assert non-null (a staff test email and a resend whose sealed data is already gone).
3. `problemsForPerson` and the shipment functions take what they need (customer ids or order ids) rather than a shared subject; the orchestrator passes order ids from the orders module.
4. Erase returns `{found: false, erasedAt: <now>}` so the page can show the completed banner. A repeat erase returns `{found: false, erasedAt: null}`.
5. `idempotency_keys` erasure is built (the plan made it conditional on the scan; the scan found it).
6. Consent code in `setContact` and `updateProfile` landed with the export/erase commit rather than the consent commit. The web wiring and tests came with the consent commit.
7. The plan's "Pay error refetch" check on `CheckoutView` belongs to part A and was not touched.

## Questions

1. TECH-05 §3 and §7 say Paystack events are kept "exactly as sent"; the Done-when needs contact removed. Built: keep the row, scrub personal keys from `raw_body` (Q6).
2. TECH-06 §15 says no historical record is silently changed; orders and receipts are changed on erasure. It is audited, and amounts, numbers and references never change.
3. Pen `O7Qcg` shows a request record (DSR number, due date, status). TECH-06 defines none; no table was built (Q1). The audit log entries `privacy.exported` and `privacy.erased` are the log.
4. Export is an immediate JSON download, not the 24-hour pipeline the Pen shows (Q2).
5. Sign-up consent checkbox (Pen 88) not built (Q3). Erase permission is `EXPORT_PERSONAL_DATA` (Q5). Company billing kept on erasure (Q7). Erasure refused while an order is open (Q8).
6. Pen 136 says "T15-04", the old ID of this ticket.

## Owner actions

- Legal wording for the privacy notice from a data protection lawyer. The pages ship with marked placeholder copy and `noindex`.
- Confirm the processor list and hosting regions (ADR-015, Sentry region).
- Confirm with the accountant that erased orders and receipts (amounts, numbers and references kept; name and contact removed) are acceptable as 7-year tax records, and whether the billing address must be kept.
- Decide on NDPC registration and a DPO (TECH-06 §12).
- Uploaded artwork and R2 objects, logs and Sentry are not erased by this tool. Decide how those are handled.
- Guest checkout consent is single opt-in: anyone typing an email can opt that address in. Consider double opt-in before marketing emails exist.
- Waiver of the T15-01 dependency is recorded above; please keep it in the tracker.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm check:openapi`, `db:check` clean. Migrations apply from empty in every test database. See the PR for the final `pnpm test` and `pnpm build` result and CI state.
