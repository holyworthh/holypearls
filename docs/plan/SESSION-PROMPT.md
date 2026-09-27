# HolyPearls — Coding Session Prompt

Use one ticket per session. Replace `<TICKET>` with its ID. Follow the root `AGENTS.md` and `CLAUDE.md`.

## Plan (wait for approval)

1. Read the complete row for `<TICKET>` in `docs/tracker/TICKETS.csv`: Build, Not in this ticket, Depends on, PRD refs, Read first and Done when.
2. Read `docs/plan/ADR-REGISTER.md`, `docs/prd/PRD-00.md`, every ticket PRD, each Read first source, and the prior ticket report in `docs/reports/` if one exists.
3. Check the repository state and each dependency. A dependency must be DONE. Confirm that `main` is green, the required branch/base is current, and the database migration path works from an empty database. If a required dependency or prerequisite is missing, stop and write BLOCKED in the report.
4. For each screen in scope, open the mapped Pen frame through the Pen MCP. Use `docs/design/SCREEN-MAP.md` to find its node ID. Read `docs/design/DESIGN-SYSTEM.md` and `packages/ui/tokens/tokens.json`. Record the layout, breakpoints, shown states, tokens and components.
5. Write a plan and wait for approval before coding. List:
   - PRD requirement IDs and ticket acceptance criteria.
   - Pen frame IDs, viewport widths, states, tokens and components.
   - Files and modules in scope.
   - Status changes and user flows.
   - API endpoints, data changes, migrations, permissions and policies.
   - Jobs, failure states and tests.
   - Dependencies, risks and items that are out of scope.

Do not start implementation until the user approves the plan.

## Build and verify

1. After approval, set the ticket to IN PROGRESS and create a branch named for the ticket, such as `t05-04-quote-builder`.
2. Build only the ticket's Build scope. Record out-of-scope ideas as suggestions in the report. Do not start another ticket.
3. Deliver the whole ticket slice: screens at the designed widths, shared contracts, business rules in services, migrations, server-side permission checks, jobs, admin screens listed by the ticket, and tests.
4. Use status names from PRD-00 §8 and TECH-01 §4. Use ticket status values from TECH-08 §8. Store money in minor units with a currency. The server decides amounts and access. Add negative permission tests for private or organization features as required by TECH-03 §17.
5. Use only tokens from `packages/ui/tokens/tokens.json` and components from `packages/ui`. Do not add hard-coded colors, fonts or spacing. Build each state shown in Pen. After implementation, compare the rendered page with its frame at matching widths. Use 375 px and 1440 px unless the approved frame requires other widths. Record every visible difference and fix it or explain it as a deviation.
6. Run the checks in the ticket and TECH-08. Complete the Definition of Done in TECH-08 §13 item by item. Check migrations from an empty database and the previous state when relevant. Confirm seed data works when the ticket needs it.
7. Write `docs/reports/<TICKET>.md` using TECH-08 §7. Include work, checks and results, visual comparison, questions, deviations, blockers and suggestions. Update the ticket row in `docs/tracker/TICKETS.csv`.
8. Open a pull request for this ticket and stop. Do not merge it or start another ticket.
