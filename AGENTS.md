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

## Git conventions (required)

These rules apply to every agent and tool (Claude Code, Codex, Cursor or any other). They restate ADR-016 in `docs/plan/ADR-REGISTER.md`, which TECH-08 §6 and §9 follow.

**Branches**

- Name every branch `<type>/<ticket-id>-<short-description>` in lower case with hyphens, for example `feature/t05-04-quote-builder` or `fix/t00-01-env-loading`. Omit the ticket ID only for work with no ticket, for example `chore/agent-git-conventions`.
- Types: `feature`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`.
- Never put a tool, agent or platform name in a branch: no `claude/`, `codex/`, `cloud/`, `cursor/`, `ai/` or similar prefixes or words.
- When the user names a branch or an existing PR branch, push there. Do not create an extra branch for the same work.

**Commits and pull requests**

- Commit as the repository owner using the git identity already configured on the machine. Do not change `user.name` or `user.email`.
- Use Conventional Commits: `<type>(<optional scope>): <summary>`, with the same types as branches (`feat` for features).
- Never add AI attribution: no `Co-Authored-By` trailers for an agent, no session links, no "Generated with" lines, and no tool or model names (Claude, Codex, GPT and so on) in commit messages, PR titles, PR bodies or code comments.
- PR titles follow the commit format, for example `feat(t05-04): quote builder`.

## Session workflow

1. Read the ticket row, its PRDs, each Read first source, and the previous ticket report.
2. Check dependencies and repository state. Stop and report BLOCKED when a required dependency is not DONE.
3. Write a plan and wait for approval before implementation. Include PRD IDs, Pen frames, tokens/components, status changes, endpoints, migrations, policies and tests.
4. Build only after approval. Follow TECH-08 §6 and complete TECH-08 §13 item by item.
5. Write `docs/reports/<TICKET>.md`, update that ticket row in TICKETS.csv, open a pull request that follows the Git conventions above, and stop. Do not start another ticket.

Do not edit `docs/prd/`, `docs/tech/` or `docs/plan/` unless the ticket or the user explicitly asks. Propose other document changes in the ticket report.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
