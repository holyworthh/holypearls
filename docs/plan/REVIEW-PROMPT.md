# HolyPearls PR Review Prompt

Review the pull request for **<TICKET>**. Do not edit files, change the tracker, or fix findings.

Read the ticket row in `docs/tracker/TICKETS.csv`, including Build, Not in this ticket, Depends on, PRD refs, Read first and Done when. Read every referenced PRD requirement and TECH source that applies.

Open the pull request diff and compare it with:

- The ticket's Build scope and acceptance criteria.
- Each PRD requirement ID in the ticket row.
- The approved Pen frame in `docs/design/SCREEN-MAP.md`, opened with the Pen MCP, and `docs/design/DESIGN-SYSTEM.md`.
- Product status transitions in TECH-01 §4.
- Permission rules and negative permission tests in TECH-03 §17.
- The Definition of Done in TECH-08 §13.

List every mismatch. For each finding, include severity, file and line, the relevant ticket or source reference, what differs, and the evidence. Check for out-of-scope changes, missing states or breakpoints, hard-coded design values, missing server-side permission checks, incorrect status changes, missing acceptance criteria, and unsupported claims that checks passed.

Do not repair the PR. If a required Pen frame or source is unavailable, report that as an unresolved review limitation.
