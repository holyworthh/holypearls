# HolyPearls — TECH 08: How We Build (Working Rules)

**Version:** 2.0 (27 September 2026). Replaces TECH 08 v1.

## 1\. Purpose

Keep product requirements, design, code and testing in step while the app is built ticket by ticket, mostly by Claude Code sessions.

## 2\. Units of work

- **Ticket:** one piece of work that one Claude Code session can finish, test and commit within about 5 hours. This is the unit you hand to a session.  
- **Pass:** a group of related tickets that together deliver a finished feature area (for example "P06 Proofs"). A pass is a milestone, not a prompt.

Ticket size in the tracker: **S** (up to 2 hours), **M** (2–4 hours), **L** (4–5 hours). Nothing larger. If a session finds a ticket won't fit, it stops at a clean point, commits what's working, writes what's left in the report, and the tracker gets a follow-up ticket (for example T05-04b).

## 3\. Every feature is finished end to end

Each feature ticket delivers, together: the real screen (desktop and mobile), the real API contract, the service with its business rules, the database migration, permission checks, any background job, its admin screen if it has one, and tests. Don't build back ends first and wire screens later.

Platform tickets (P00, P01) are the exception, but each still ends with something testable: a health check, a demo screen, or a working test.

## 4\. Traceability

Each ticket in the tracker lists its PRD requirement IDs and design references. Each feature should trace: PRD requirement → design screen → ticket → route and component → API endpoint → service and status change → permission rule → job → tests.

## 5\. When documents disagree

Follow the order in PRD 00 section 14\. Don't pick silently. Stop, write the conflict in the ticket report under "Questions", and continue with the higher-ranked source if the answer is clear; otherwise mark the ticket BLOCKED.

## 6\. Session protocol (paste into each Claude Code session)

**Before coding:**

1. Read the ticket row in the tracker, the documents it lists, and the previous ticket's report in `docs/reports/`.  
2. Check the repository's actual state. Don't assume the tracker is right about what exists.  
3. Confirm `main` is green and the database migrates from empty.  
4. Set the ticket to IN PROGRESS.

**While coding:** 5\. Work in a branch named after the ticket (`t05-04-quote-builder`). 6\. Follow the ticket's scope. Anything out of scope goes in the report as a suggestion. 7\. Run lint, type check, tests and build often. 8\. Check every screen you touch at 375 px and 1440 px wide. 9\. Add the negative permission tests for anything private.

**Before stopping:** 10\. All checks pass. Migrations run from empty and from the previous state. Seed data still loads. 11\. Write `docs/reports/TXX-YY.md` (format below). 12\. Update the tracker row: status, branch, PR, completion summary, any blocker. 13\. Open a pull request. Stop. Don't start the next ticket unless told to.

## 7\. Ticket report format

\# TXX-YY — Title

Status: DONE | PARTIAL | BLOCKED

Commits / PR:

What was built: screens, endpoints, services, migrations, jobs

Permission rules added:

Tests: counts and what they cover

Screens checked: widths, states (loading, empty, error)

Differences from the design or PRD, and why:

Questions / conflicts found:

Seed data notes:

Left to do (if PARTIAL):

Suggested next ticket:

## 8\. Ticket statuses

TODO, READY (all dependencies DONE), IN PROGRESS, IN REVIEW (pull request open), DONE, BLOCKED, DEFERRED.

A ticket is DONE only when the Definition of Done (section 13\) is met and the pull request is merged. Code existing is not enough.

## 9\. Branches and pull requests

One branch and one pull request per ticket. Squash-merge to main after checks pass and you've reviewed it. Main deploys to staging automatically.

## 10\. Migrations

A ticket owns its migrations. Before DONE: a fresh database migrates from empty; the previous state upgrades cleanly; seed data loads; no data from earlier tickets is lost.

## 11\. Seed data (test fixtures)

Kept in `packages/testkit/seed`, loaded by `pnpm seed`, and grown ticket by ticket. All clearly marked TEST DATA:

- Business Cards direct purchase  
- Staff Polo configurable quote  
- Annual Business Conference project (250 attendees, 30 crew, Lagos, 6 weeks) with Quote V1 → V2  
- Name Badge proof V1 (changes requested) and V2 (awaiting approval)  
- Event order with items in different production states, balance due ₦340,000  
- ACME organization, locations Lekki and Victoria Island, one member per role  
- 60-person group collection: 45 by link, 15 by CSV with 2 problems  
- 120-person scale collection and a 120-row CSV validation file  
- ACME logo V4 and V5  
- ₦450,000 approval with a ₦440,000 quote (within authority) and a ₦485,000 quote (re-approval needed)

## 12\. Checks for every ticket

**Screens:** match the Stage 4 design; mobile and desktop; loading, empty and error states; keyboard use and visible focus; 44 px touch targets; reuse shared components.

**Back end:** input validation; permission checks; status prerequisites; one transaction per change; idempotency or version checks where TECH 02 requires; audit entry for important actions; clear behavior when a job or outside service fails.

**Security:** every private or organization feature adds negative permission tests. Don't leave them for P15. P15 completes and hardens; it doesn't invent security.

**Monitoring:** new jobs and outside calls have request IDs, structured failure logs, retry limits and a place in admin where failures show. A flow that can fail silently is not done.

## 13\. Definition of Done (every ticket)

1. Matches the approved design, or the difference is written in the report and approved.  
2. Works at mobile and desktop widths where the design requires it.  
3. API input validated at runtime; typed contract shared with the web app.  
4. Business rules live in services, not controllers or the UI.  
5. Committed migration with constraints and needed indexes.  
6. Server-side ownership, permission and status checks.  
7. History kept where required (versions, snapshots, insert-only records).  
8. Jobs and outside calls can be retried safely and failures are visible.  
9. Designed error and recovery states work.  
10. Happy-path, edge-case and permission tests exist and pass.  
11. Lint, type check, tests and build pass.  
12. No sensitive values in logs.  
13. Accessibility kept (labels, focus, contrast, not colour alone).  
14. No obvious N+1 queries, oversized responses or customer requests waiting on outside services.  
15. Tracker row and ticket report updated.

## 14\. Changing a PRD

Only when product behavior changes. Library or implementation choices go in TECH documents or an ADR, not the PRD.

## 15\. Design problems found while building

Write: the screen or flow, the approved behavior, the problem, the smallest fix, and the affected PRD, TECH and tickets. Don't redesign more than the problem needs.

## 16\. Finishing

- **A pass is done** when all its tickets are DONE, CI is green on main, staging works for the pass's journeys, and the pass's negative permission tests pass.  
- **Engineering is done** after P15, including the 16 cross-flow journeys running as automated end-to-end tests.  
- **Launch readiness** (separate stage, folder 08): real prices and business rules confirmed by the owner, real product photos and content, real case studies, final SEO copy, the Paystack setup checklist (TECH 05 section 14), NDPA items confirmed with a lawyer (TECH 06 section 12), and final production QA.