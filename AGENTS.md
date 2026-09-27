# HolyPearls Agent Instructions

## Source order

Use sources in this order:

1. `docs/plan/ADR-REGISTER.md` and written amendments.
2. `docs/prd/PRD-00.md`.
3. The PRDs named by the current ticket.
4. The Pen design in `docs/design/SCREEN-MAP.md` and `docs/design/DESIGN-SYSTEM.md`.
5. Stage 3 references named by the ticket.
6. `docs/tech/TECH-00.md` through `TECH-08.md` for implementation.

When sources conflict, follow the higher source and record the conflict under Questions in `docs/reports/<TICKET>.md`. If the answer is unclear, stop and mark the ticket BLOCKED. Do not choose silently.

## Ticket scope

- Work on one ticket in each session.
- Read its full row in `docs/tracker/TICKETS.csv`, including Build, Not in this ticket, Depends on, PRD refs, Read first, and Done when.
- Implement only its Build scope. Put other work in the report as a suggestion.
- Use product statuses from PRD-00 §8 and TECH-01 §4. Use ticket statuses from TECH-08 §8.
- Follow module boundaries in TECH-00 §4–5.
- Follow TECH-05 for money and payment rules. Follow TECH-03 for identity, guest access and permissions. Add negative permission tests per TECH-03 §17.

## Design fidelity

Before building each screen, open its Pen frame through the Pen MCP. Find it in SCREEN-MAP.md. Read its layout, spacing, sizes, type, colors, states and component variants. Read DESIGN-SYSTEM.md and use tokens from `packages/ui/tokens/tokens.json` and components from `packages/ui`.

Do not add hard-coded colors, font sizes or spacing values. If a needed token or component is missing, add the exact Pen value and record the change in the ticket report. Build every state and breakpoint shown in the design.

After building, compare the rendered screen with its Pen frame at the same viewport. Use 375 px and 1440 px unless the design specifies other widths. List each visible difference in the report. Fix it or record and explain the deviation.

The design does not change product behavior. Follow the PRD when design and PRD behavior differ, then record the conflict.

## Session workflow

1. Read the ticket row, its PRDs, each Read first source, and the previous ticket report.
2. Check dependencies and repository state. Stop and report BLOCKED when a required dependency is not DONE.
3. Write a plan and wait for approval before implementation. Include PRD IDs, Pen frames, tokens/components, status changes, endpoints, migrations, policies and tests.
4. Build only after approval. Follow TECH-08 §6 and complete TECH-08 §13 item by item.
5. Write `docs/reports/<TICKET>.md`, update that ticket row in TICKETS.csv, open a pull request, and stop. Do not start another ticket.

Do not edit `docs/prd/`, `docs/tech/` or `docs/plan/` unless the ticket or the user explicitly asks. Propose other document changes in the ticket report.
