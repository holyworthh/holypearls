# Repository Setup Report

## Files moved and created

The 21 approved v2 exports were moved from `docs/_import/` without editing their source content:

- PRDs: `docs/prd/PRD-00.md` through `PRD-06.md` (7 files).
- Technical specifications: `docs/tech/TECH-00.md` through `TECH-08.md` (9 files).
- Engineering plan, ADR register, change log and session prompt: `docs/plan/`.
- Tracker: `docs/tracker/TICKETS.csv`.
- `docs/reports/.gitkeep` was added and the empty `docs/_import/` directory was removed.

The imported session prompt was rewritten as `docs/plan/SESSION-PROMPT.md` to use repository paths and the requested approval-first workflow.

New files:

- Root `AGENTS.md` and `CLAUDE.md` with identical instructions.
- `docs/design/DESIGN-SYSTEM.md` and `docs/design/SCREEN-MAP.md`.
- `packages/ui/tokens/tokens.json`.
- `docs/plan/REVIEW-PROMPT.md`.
- This report.

No application code was added. Ticket T00-01 was not started. Existing PRD, TECH, tracker and plan source documents were not changed, except for the explicitly requested session-prompt rewrite.

## Pen.dev access and extraction

Pen MCP is connected. Its active design file is `/C:/Users/ASUS/Desktop/design/holypeals-design/untitled.pen`. The MCP opened and returned design data for that file.

Tools used:

- `mcp__pencil__get_app_state` — confirmed the open file and its design inventory.
- `mcp__pencil__execute` — read variables and frame/component nodes.
- `mcp__pencil__get_style` — checked the style catalog; it returned generic archetypes, not file-specific styles.
- `mcp__pencil__read_skill` — read the Pen MCP and schema instructions.
- `mcp__pencil__browser` was available but not needed.

No screenshots were exported because the MCP exposed the frame and node data directly.

## Counts

- 45 Pen variables. The JSON preserves every raw variable, every theme variant and the resolved Signal values.
- 299 inspected Pen definition records: 80 `HP/*`, 58 `HF/*`, 155 `WF/*`, and 6 other named records.
- 123 mapped frames: 36 named Stage 4.1 Signal frames and 87 Stage 4.2 anchors. These include 93 screen/state anchors and 30 design-system, coverage or audit references.
- 30 Stage 4.1 `img/*` entries are image assets, not UI screens, and are excluded from the map.
- 0 product-screen rows without a ticket mapping.
- 41 tracker UI surfaces without an explicit matching screen or interaction-state design. See the GAP rows in [SCREEN-MAP.md](design/SCREEN-MAP.md): T00-06, T00-07, T01-01, T01-02, T01-07, T02-02, T02-05, T02-06, T03-01, T04-02, T04-06, T05-02, T05-03, T05-04, T06-01, T06-03, T06-04, T07-01, T07-02, T07-04, T08-01, T08-03, T08-04, T09-01, T09-02, T10-04, T11-01, T11-02, T11-03, T12-01, T12-04, T12-05, T12-07, T13-01, T13-02, T13-03, T13-04, T13-05, T13-06, T15-04 and T15-05.

The Stage 4.2 board describes representative archetypes that cover 314 pages. It does not contain 314 unique page designs. The map lists the available design frames and does not invent screens for the remaining pages.

## Ambiguities and missing design values

No imported file triggered a read or decode error during inventory. The targeted artifact scan found no escaped Unicode sequences, HTML break tags or entities that required cleanup.

- PRD and TECH do not provide a complete browser route table. TECH-00 names the `/admin` route; the T05-01 tracker Build field names `/start`. Other browser paths remain unspecified. API endpoints in TECH-02 are not treated as browser routes.
- The Pen variables have a `hp-direction` axis with Signal, current, workshop and cobalt values. This is a visual-direction axis, not a light/dark mode. No dark-mode token set was identified.
- The design gives 390 px mobile and 1440 px desktop reference viewports but no CSS breakpoint thresholds. Tracker checks at 375, 768 and 1440 px are test widths.
- The active lock text does not specify a complete line-height scale, a complete letter-spacing scale, or exact Signal shadow values. These are recorded as unspecified, not guessed.
- Stage 4.2 says the archetypes cover 314 pages; it does not supply 314 separate screens.
- The Pen style catalog was generic. The token and component inventories use values and nodes read from the actual design file.

## Design differences and source conflicts

- The earlier Stage 4.1 board contains a warm provisional palette and Instrument Sans/IBM Plex Mono. The Stage 4.2 board records the owner's later Signal approval and locks the Signal palette with Geist/Geist Mono. This report and the token file use Signal; the older direction remains identified as historical.
- Earlier Stage 4.1 accessibility notes specify a 3 px focus ring with 2 px separation. The active Stage 4.2 Signal notes specify a 2 px ring: ink on light surfaces and paper on dark/red surfaces. The current design-system summary follows Stage 4.2 and records this difference here.
- The 390 px design reference and 375 px tracker check are different viewport widths, not a conflicting breakpoint definition.
- The reviewed PRD, TECH and plan exports do not set a competing color palette or type family. No other design-versus-requirement conflict was found during this setup.
