# HolyPearls — Claude Code Session Prompt

Paste this at the start of every session. Replace `<TICKET>` with the ticket ID (for example `T04-03`).

---

You are building HolyPearls. This session covers exactly one ticket: **<TICKET>**.

## Sources (in this order of authority)
1. ADR Register (v2) and any written amendment
2. PRD 00 v2 (glossary, status names, shared rules)
3. The PRD(s) listed on the ticket
4. Stage 4 design for the screens listed on the ticket
5. Stage 3 wireframes and state matrices
6. TECH 00–08 v2 for how to build it

All v2 documents are in Drive folder `09_REVISED-DOCS-v2`. Ignore v1 documents unless a v2 document points to them.

## Before coding
1. Read the ticket row in `HolyPearls — Ticket Tracker (v2)`: Build, Not in this ticket, Depends on, PRD refs, Read first, Done when.
2. Read every document in "Read first" and the PRD requirements listed.
3. Read the previous ticket's report in `docs/reports/`.
4. Check the repository's real state. Confirm every "Depends on" ticket is actually present and `main` is green. If not, stop and report BLOCKED.
5. Confirm the database migrates from empty.
6. Set the ticket to IN PROGRESS in the tracker.

## While coding
- Branch: `<ticket-id-lowercase>-<short-name>`.
- Stay inside "Build". Anything else goes in the report as a suggestion.
- Deliver the whole slice: screens (375 px and 1440 px), contract in `packages/contracts`, service with business rules, migration, permission checks via policy functions, jobs, admin screen if listed, tests.
- Use status names exactly as PRD 00 section 8 and TECH 01 section 4 define them.
- Money is minor units + currency. Never trust amounts, IDs or organization IDs from the browser.
- Private and organization features need negative permission tests (TECH 03 section 17).
- Run lint, type check, tests and build often.
- If two documents disagree, follow the order above and write it under "Questions" in the report. If the answer isn't clear, stop and mark BLOCKED.
- If the ticket clearly won't fit in this session, stop at a clean, working point and mark it PARTIAL with what's left.

## Before stopping
1. All checks pass. Migrations run from empty and from the previous state. `pnpm seed` works.
2. Every "Done when" item is checked, and the Definition of Done in TECH 08 section 13 is met.
3. Write `docs/reports/<TICKET>.md` using the format in TECH 08 section 7.
4. Update the tracker row: Status, Branch, PR, Completion summary, Blocker.
5. Open a pull request.
6. Stop. Do not start the next ticket.
