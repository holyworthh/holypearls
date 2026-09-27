# HolyPearls — Engineering Plan

**Version:** 2.0 (27 September 2026). Replaces the Stage 5 Engineering Plan & Architecture Overview, the Stage 5 Implementation Strategy (.md) and the P00 Execution Brief (.md).

Architecture now lives in TECH 00\. Working rules live in TECH 08\. Tickets live in the Ticket Tracker (v2). This document only explains the build order and the risks.

## 1\. Approach

- **No rush, no cut scope.** The full product in PRD 00 section 15 (P0 and P1) ships at launch. The plan is ordered for solidity, not speed.  
- **Build shared pieces once, early.** Anything more than one feature needs (permissions, guest links, files, emails, audit, help requests, payments) is built before the features that use it. This avoids rebuilding the same thing several times and means every later ticket is smaller.  
- **Finish each feature completely before the next.** Screen, API, database, permissions, admin screen and tests together.  
- **Each ticket fits one Claude Code session of about 5 hours.** 95 tickets across 16 passes. Sizes: S up to 2 hours, M 2–4 hours, L 4–5 hours.  
- **Staging from day one.** Every merged ticket deploys to staging, so problems with real hosting appear early, not at the end.

## 2\. Passes (milestones)

| Pass | Name | Tickets | What exists at the end |
| :---- | :---- | :---- | :---- |
| P00 | Foundation | 8 | Repo, database, API conventions, jobs, design system, sign-in, staff MFA, staging deploy |
| P01 | Shared building blocks | 7 | Audit log, emails, permission framework, rate limits, idempotency, guest links and email codes, file uploads and previews, help requests |
| P02 | Catalogue & discovery | 8 | Admin catalogue, directory, homepage, navigation, category hubs, content pages, search, SEO foundations |
| P03 | Product configuration | 9 | Product rules and prices, price calculator, configuration drafts, every product family's configurator, artwork, delivery, Request Final Quote |
| P04 | Cart, checkout & Paystack | 6 | Cart, checkout with VAT and delivery, payments core, Paystack, orders and receipts, payments admin |
| P05 | Projects & quotes | 7 | Start a Project, recommendations, quote builder, quote page, acceptance, deposits and balances |
| P06 | Proofs | 4 | Proof preparation, viewer, approval, comments and pins, changes after approval |
| P07 | Production & tracking | 4 | Production board, holds, release rules, customer order page, guest tracking, cancellations |
| P08 | Delivery & reorder | 4 | Shipments, tracking, reorder, problem reports |
| P09 | Customer accounts | 2 | Sign-up, account history, linking guest orders |
| P10 | Organizations & workspace | 4 | Organizations, locations, permissions, team, workspace, billing |
| P11 | Assets, templates & approvals | 5 | Brand assets, templates, template orders, internal approval, quote re-approval |
| P12 | Group collection & company store | 7 | Collections, participants, CSV import, Order Drafts, paid-participant removal, company stores, allowances |
| P13 | Admin completion | 6 | Remaining business rules, installation and freight, operations home, exports, refunds, staff admin |
| P14 | Discovery, accessibility & performance | 6 | SEO completeness, search tuning, WCAG 2.2 AA audit, performance budgets, visual regression |
| P15 | Security & release readiness | 8 | Full attack suite, headers and CSP, stress tests, NDPA tools, monitoring and runbooks, production and restore rehearsal, 16 journeys automated |

## 3\. Why this order

- **Guest links and files come first (P01)**, because quotes, proofs, order tracking, drafts and participant forms all depend on them. In v1 guest links were scheduled for P07, after three passes that needed them.  
- **Payments core comes before quotes (P04 before P05)**, so deposits and balances in P05 reuse the same tested payment code as direct checkout.  
- **Proofs before production (P06 before P07)**, because production can't start until a required proof is approved.  
- **Accounts before organizations (P09 before P10)**, because workspace members must be signed in. Guest customers already have customer records from P01, so nothing needs rebuilding when accounts arrive.  
- **Admin is built inside each feature ticket.** P13 only fills gaps and adds business-wide screens.  
- **Hardening (P14, P15) completes and tests; it doesn't add security for the first time.** Every earlier ticket already includes its permission tests.

Tickets run one after another in the order listed; each ticket's "Depends on" is the ticket before it, or an earlier one. If you ever run two sessions in parallel, only run tickets from different modules whose dependencies are all DONE.

## 4\. Starting a session

Give Claude Code: the session prompt (`CLAUDE_CODE_SESSION_PROMPT.md` in this folder), the ticket ID, and access to this Drive folder and the repository. The prompt tells it to follow TECH 08 section 6 and stop after the ticket.

## 5\. Risks

| ID | Risk | Likelihood | Impact | What we do | Owner | Watch for |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| R-001 | So many products that rules and configurations become unmanageable | Medium | High | Product families with shared building blocks; rules in admin; no generic attribute tables | Engineering \+ Product | Frequent one-off exceptions in configuration code |
| R-002 | Real business values arrive late and break seed assumptions | High | Medium | Everything configurable in admin; saved copies protect history; seed marked TEST DATA | Business \+ Product | Launch readiness review |
| R-003 | Better Auth doesn't fit Next.js \+ NestJS cleanly | Medium | High | Proved in T00-06 behind IdentityAdapter before any feature | Engineering | T00-06 tests fail |
| R-004 | File formats add security risk | Medium | High | JPEG, PNG and PDF only; isolated PDF rendering; no SVG | Engineering | Business asks for AI, EPS or SVG uploads |
| R-005 | Payment retries or webhooks create duplicate charges or credits | Low | Critical | Idempotency keys, saved and verified webhooks, one-success constraint, check job, stress tests (T15-03) | Engineering | Any payment review with reason DUPLICATE\_PAYMENT |
| R-006 | Organization or location data leaks | Low | Critical | Scoped queries, policy functions, attack tests from P01, full suite in T15-01 | Engineering | Any 200 response in an attack test |
| R-007 | Built screens drift from the Stage 4 design | Medium | High | Every ticket checks its screens; visual regression suite (T14-06) | Frontend | Components copied instead of reused |
| R-008 | Admin grows into an ERP | Medium | High | PRD 00 section 16 non-goals | Product \+ Engineering | Requests for inventory, accounting or HR |
| R-009 | Paystack international payments or USD not approved in time | Medium | High | Business applies early (TECH 05 section 14); checkout is NGN, so international cards still work without USD | Business | Paystack dashboard still shows international payments off at P04 |
| R-010 | A single payment provider has an outage | Low | Medium | Pause-payments switch, clear customer message, unclear payments checked automatically; ADR-011 allows adding a second provider later | Business \+ Engineering | Paystack status incidents |
| R-011 | A ticket doesn't fit in one session | Medium | Low | Stop at a clean point, report, add a follow-up ticket (TECH 08 section 2\) | Engineering | Many PARTIAL reports in a row |
| R-012 | NDPA obligations are missed | Medium | High | Tools in T15-04; business confirms legal points with a lawyer | Business | No lawyer review scheduled before launch readiness |
| R-013 | Hosting region adds latency for Nigerian customers | Medium | Medium | Same-region API and database; edge-cached public pages; measure in P14 | Engineering | Real-user monitoring over budget in Nigeria |

## 6\. Old documents

The v1 documents in folders 05 and 06 are kept for history. Where they disagree with v2, v2 wins. The Change Log in this folder lists every change.