# HolyPearls Design System

## Authority and scope

The active direction is **Workshop Ledger** (owner decision, 1 October 2026). It comes from the owner's design canvas (claude.ai artifact `QAkhvXN2eBJJBt5QoaZvbh`: Brand, Foundations, Components, Motion and the v2 homepage at 1440 and 390) and is now in Pen:

- **Theme value `ledger`** on the `hp-direction` axis. The Application map board (`C9q8v3`) and the file map cover (`b3vRp`) select `hp-direction: ledger`, so every `HP/*` component and screen that uses `hp-*` variables resolves to Ledger.
- **Stage 4.3 board `MW5h2`** ("STAGE 4.3 — WORKSHOP LEDGER") holds the Ledger brand components (`sNAL0`), the system boards (Brand `YI1UU`, Foundations `k1aon`, Components `BfHwp`, Motion `nGctt`) and the new homepage frames (desktop 1440 `ZqhyZ`, mobile 390 `Y0ftk8`).
- `HP/Nav/Header` (`nO6TF`), `HP/Nav/MobileHeader` (`ED2Si`) and `HP/Nav/Footer` (`F64bQ`) were rebuilt in place with the logo lockup. `HP/Nav/UtilityStrip` (`BoplJ`) is disabled: the Ledger header has no utility strip.

Signal (`signal`) and the older `current`, `workshop` and `cobalt` values stay on the axis for traceability. They are not current tokens. Screens drawn before Stage 4.3 keep their layouts and pick up Ledger colour and type through the variables; their literal corner radii are unchanged until each screen is rebuilt.

The document and JSON preserve values read through Pen MCP. Values marked **INFERRED** are not Pen tokens.

## Workshop Ledger (Stage 4.3)

**Type.** Young Serif (400) for headlines, Instrument Sans (400–700) for everything people read and tap, IBM Plex Mono for records (specs, quantities, record numbers, labels; 12 px+, uppercase, 0.08em). The logo wordmark alone uses Open Sans 700, tracked 0.08em. Foundations scale: display 80/1.04, H1 48/1.04, H2 34/1.04, H3 24/1.25 600, body L 20/1.5, body 16/1.55, small 14/1.45, mono 13. Homepage exact sizes (in `inferred-tokens.css`): hero 88/1.02 (−0.03em), section 52, split 48, CTA 60, tile 40/28, mobile hero 44/1.04, mobile section 32/1.08.

**Colour.** Holy Blue `#415F85` (`hp-brand`, links, focus, estimates, hero band), Blue Deep `#1E2E44` (`hp-brand-deep`, CTA panels), Pearl Brick `#9A4036` (`hp-accent`, Start a Project, step numbers, stitch lines), Sun `#F2C94C` (`hp-marigold`, sparing highlight; never text on light), Ink `#17150F`, Ink 2 `#4A453B` (`hp-graphite`), Ink 3 `#6B6456` (`hp-text-3`, captions), Rule `#E6E6E1`, Mist `#F5F5F3` (`hp-bone`), Blue Tint `#E6ECF3`, Brick Tint `#F5E4E1`. Category tile colours: coral `#E8604C`, sage `#9DC3A5`, lilac `#E9E4F5`. Status: ready `#2E6B3F`/`#E1EEDF`, in progress `#415F85`/`#E6ECF3`, needs you `#8A5A00`/`#F6EAD0`, problem `#A8261B`/`#F6DEDA`, let's talk `#9A4036`/`#F5E4E1`; always with an icon and a word. `hp-mid` stays a light grey for text on dark surfaces (`#B5AFA3`, derived from Signal's `#B4B4BB` because the canvas defines no Ledger value for that role).

**Shape and depth.** Radii: tag 6, control (inputs) 11, button 10, card 16, panel 20, hero 24, band 32, pill 999 (chips, badges). Elevation: 0 = 1 px Rule; 1 = hard ink shadow (`0 6px 0 -2px` Ink, the one hero input); 2 = lifted (`0 24px 48px -24px` Ink 35%). The production ticket (crop marks, perforation, mono stub, registration mark) and the rotated "Made & checked" stamp are the signature devices. Icons: Lucide at a 1.6 px stroke.

**Layout.** Desktop 12 columns, 80 px margins, 20 px gutters, 1280 content. Mobile 4 columns, 16 px margins. Touch targets 44 px.

**Motion.** Tokens: press 120 ms, hover 200 ms, card/accordion 400 ms, reveal 700 ms (24 px rise, 80 ms stagger), ease `cubic-bezier(.2,.7,.2,1)`, entrance `cubic-bezier(.16,1,.3,1)`. Patterns on the Motion board (`nGctt`): button press and arrow nudge, card lift with photo zoom, scroll reveal, stitch underline, stitch progress line, floating swatches with parallax, stamp spin, product marquee, rotating search hint, polo colour cross-fade, accordion, scroll progress line. New patterns from research, marked on the board: add-to-cart confirmation, field-valid tick, upload thread, proof-approved stamp, product image morph (View Transitions), directional configurator steps, hide-on-scroll header, skeleton shimmer, tracking stitch fill. Rules: never animate prices, errors or status labels; one moving thing at a time; feedback within 400 ms and alongside the request; everything off for `prefers-reduced-motion`.

**Surfaces (owner, 1 October 2026).** Pages and full-width section bands are white (`hp-paper`); sections are separated by 1 px Rule lines, not tinted bands. Mist (`hp-bone`) is for small panels, chips and inputs only. Never use cream or beige surfaces: where a canvas board shows one (card faces, striped placeholders), Pen and code use white.

**Product pages.** Two templates cover every product (Pen `gb4rz` fixed-price, `mfOQO` / `Q7ml3` estimate and garment): a framed gallery stage with corner marks (Holy Blue tint for garments, Brick tint for print, white for photos), state pill, Young Serif title (49 / 35), choice tiles (12 px radius, 1.5 px Rule, 2 px Holy Blue + Blue Tint when chosen), the garment map with six expanding steps, and the perforated price ticket. Details and deviations: `docs/reports/LEDGER-DESIGN-SYSTEM.md`.

**Owner-canvas conflicts resolved.** Foundations calls buttons "pill"; the later Home, Motion and Product boards draw them at 10 px. The later boards win (`hp-r-button` = 10); chips and badges stay pills.

### Ledger variable values

| Name | Type | Ledger value | Signal value (superseded) |
| --- | --- | --- | --- |
| hp-bone | color | "#F5F5F3" | "#F4F4F5" |
| hp-paper | color | "#FFFFFF" | "#FFFFFF" |
| hp-sand | color | "#E6E6E1" | "#E8E8EA" |
| hp-ink | color | "#17150F" | "#0C0C0E" |
| hp-ink-2 | color | "#2E2A22" | "#1C1C1F" |
| hp-graphite | color | "#4A453B" | "#5C5C63" |
| hp-line | color | "#E6E6E1" | "#E4E4E7" |
| hp-line-strong | color | "#6B6456" | "#8A8A93" |
| hp-accent | color | "#9A4036" | "#D2311A" |
| hp-accent-hover | color | "#7E3229" | "#B02810" |
| hp-accent-tint | color | "#F5E4E1" | "#FDE8E3" |
| hp-marigold | color | "#F2C94C" | "#FFC21A" |
| hp-marigold-tint | color | "#F6EAD0" | "#FFF1C7" |
| hp-success | color | "#2E6B3F" | "#1E6B4A" |
| hp-success-tint | color | "#E1EEDF" | "#E0EDE5" |
| hp-warning | color | "#8A5A00" | "#8A5A00" |
| hp-warning-tint | color | "#F6EAD0" | "#F7EBCF" |
| hp-error | color | "#A8261B" | "#B42318" |
| hp-error-tint | color | "#F6DEDA" | "#F8E0DC" |
| hp-info | color | "#415F85" | "#2F5B8A" |
| hp-info-tint | color | "#E6ECF3" | "#E0E8F2" |
| hp-font-display | string | "Young Serif" | "Geist" |
| hp-font-ui | string | "Instrument Sans" | "Geist" |
| hp-font-mono | string | "IBM Plex Mono" | "Geist Mono" |
| hp-r-control | number | 11 | 6 |
| hp-r-card | number | 16 | 10 |
| hp-r-panel | number | 20 | 18 |
| hp-mid | color | "#B5AFA3" | "#B4B4BB" |
| hp-ink-80 | color | "#17150FCC" | "#0C0C0ECC" |
| hp-ink-70 | color | "#17150FB3" | "#0C0C0EB3" |
| hp-paper-20 | color | "#FFFFFF33" | "#FFFFFF33" |
| hp-paper-70 | color | "#FFFFFFB3" | "#FFFFFFB3" |
| hp-weight-display | string | "400" | "600" |
| hp-style-display | string | "normal" | "normal" |
| hp-brand | color | "#415F85" | "#2F5B8A" |
| hp-brand-hover | color | "#2F4766" | "#244A73" |
| hp-brand-deep | color | "#1E2E44" | "#1C1C1F" |
| hp-brand-tint | color | "#E6ECF3" | "#E0E8F2" |
| hp-r-pill | number | 999 | 6 |
| hp-r-tag | number | 6 | 6 |
| hp-r-button | number | 10 | 6 |
| hp-r-hero | number | 24 | 18 |
| hp-r-band | number | 32 | 18 |
| hp-cat-coral | color | "#E8604C" | "#FDE8E3" |
| hp-cat-sage | color | "#9DC3A5" | "#E0EDE5" |
| hp-cat-lilac | color | "#E9E4F5" | "#E0E8F2" |
| hp-brand-mid | color | "#5A7AA3" | "#5C5C63" |
| hp-on-brand-2 | color | "#D9E2EE" | "#E4E4E7" |
| hp-on-deep-2 | color | "#C9D5E4" | "#E4E4E7" |
| hp-on-sun-2 | color | "#3A3522" | "#1C1C1F" |
| hp-text-3 | color | "#6B6456" | "#5C5C63" |

## Exact Pen variables (Signal, superseded; kept for traceability)

There are 45 variables. The JSON file preserves each raw Pen value, including theme variants. The table below shows the value resolved for the active Signal direction when the variable has a `hp-direction` theme.

| Name | Type | Raw Pen value | Signal value |
| --- | --- | --- | --- |
| hf-canvas | color | "#F4F0E8" | "#F4F0E8" |
| hf-paper | color | "#FFFCF7" | "#FFFCF7" |
| hf-ink | color | "#222420" | "#222420" |
| hf-graphite | color | "#5C625C" | "#5C625C" |
| hf-line | color | "#D5D0C7" | "#D5D0C7" |
| hf-accent | color | "#A03F2B" | "#A03F2B" |
| hf-accent-hover | color | "#7E3021" | "#7E3021" |
| hf-success | color | "#176B51" | "#176B51" |
| hf-warning | color | "#805113" | "#805113" |
| hf-error | color | "#A02F2F" | "#A02F2F" |
| hf-info | color | "#315C7D" | "#315C7D" |
| hp-bone | color | [{"value":"#F4F4F5","theme":{"hp-direction":"signal"}},{"value":"#F3EEE6","theme":{"hp-direction":"current"}},{"value":"#E6E8E8","theme":{"hp-direction":"workshop"}},{"value":"#F1F3F8","theme":{"hp-direction":"cobalt"}}] | "#F4F4F5" |
| hp-paper | color | [{"value":"#FFFFFF","theme":{"hp-direction":"signal"}},{"value":"#FCFAF6","theme":{"hp-direction":"current"}},{"value":"#F2F3F3","theme":{"hp-direction":"workshop"}},{"value":"#FFFFFF","theme":{"hp-direction":"cobalt"}}] | "#FFFFFF" |
| hp-sand | color | [{"value":"#E8E8EA","theme":{"hp-direction":"signal"}},{"value":"#E9E1D4","theme":{"hp-direction":"current"}},{"value":"#D8DBDB","theme":{"hp-direction":"workshop"}},{"value":"#E3E7F0","theme":{"hp-direction":"cobalt"}}] | "#E8E8EA" |
| hp-ink | color | [{"value":"#0C0C0E","theme":{"hp-direction":"signal"}},{"value":"#1B1A17","theme":{"hp-direction":"current"}},{"value":"#111213","theme":{"hp-direction":"workshop"}},{"value":"#0B0F1A","theme":{"hp-direction":"cobalt"}}] | "#0C0C0E" |
| hp-ink-2 | color | [{"value":"#1C1C1F","theme":{"hp-direction":"signal"}},{"value":"#2A2824","theme":{"hp-direction":"current"}},{"value":"#202224","theme":{"hp-direction":"workshop"}},{"value":"#1A1F2E","theme":{"hp-direction":"cobalt"}}] | "#1C1C1F" |
| hp-graphite | color | [{"value":"#5C5C63","theme":{"hp-direction":"signal"}},{"value":"#5B574F","theme":{"hp-direction":"current"}},{"value":"#53585C","theme":{"hp-direction":"workshop"}},{"value":"#555B6B","theme":{"hp-direction":"cobalt"}}] | "#5C5C63" |
| hp-line | color | [{"value":"#E4E4E7","theme":{"hp-direction":"signal"}},{"value":"#DCD5C9","theme":{"hp-direction":"current"}},{"value":"#D5D8D9","theme":{"hp-direction":"workshop"}},{"value":"#E1E4EC","theme":{"hp-direction":"cobalt"}}] | "#E4E4E7" |
| hp-line-strong | color | [{"value":"#8A8A93","theme":{"hp-direction":"signal"}},{"value":"#8F887B","theme":{"hp-direction":"current"}},{"value":"#8B9195","theme":{"hp-direction":"workshop"}},{"value":"#979DAD","theme":{"hp-direction":"cobalt"}}] | "#8A8A93" |
| hp-accent | color | [{"value":"#D2311A","theme":{"hp-direction":"signal"}},{"value":"#B83A18","theme":{"hp-direction":"current"}},{"value":"#E8500F","theme":{"hp-direction":"workshop"}},{"value":"#2243E6","theme":{"hp-direction":"cobalt"}}] | "#D2311A" |
| hp-accent-hover | color | [{"value":"#B02810","theme":{"hp-direction":"signal"}},{"value":"#962E12","theme":{"hp-direction":"current"}},{"value":"#C8420A","theme":{"hp-direction":"workshop"}},{"value":"#1A34B8","theme":{"hp-direction":"cobalt"}}] | "#B02810" |
| hp-accent-tint | color | [{"value":"#FDE8E3","theme":{"hp-direction":"signal"}},{"value":"#F6E2D8","theme":{"hp-direction":"current"}},{"value":"#FDE3D5","theme":{"hp-direction":"workshop"}},{"value":"#E3E8FD","theme":{"hp-direction":"cobalt"}}] | "#FDE8E3" |
| hp-marigold | color | [{"value":"#FFC21A","theme":{"hp-direction":"signal"}},{"value":"#F0B429","theme":{"hp-direction":"current"}},{"value":"#FFD23F","theme":{"hp-direction":"workshop"}},{"value":"#FFB81C","theme":{"hp-direction":"cobalt"}}] | "#FFC21A" |
| hp-marigold-tint | color | [{"value":"#FFF1C7","theme":{"hp-direction":"signal"}},{"value":"#FBEBC4","theme":{"hp-direction":"current"}},{"value":"#FFF3C9","theme":{"hp-direction":"workshop"}},{"value":"#FFF0CC","theme":{"hp-direction":"cobalt"}}] | "#FFF1C7" |
| hp-success | color | "#1E6B4A" | "#1E6B4A" |
| hp-success-tint | color | "#E0EDE5" | "#E0EDE5" |
| hp-warning | color | "#8A5A00" | "#8A5A00" |
| hp-warning-tint | color | "#F7EBCF" | "#F7EBCF" |
| hp-error | color | "#B42318" | "#B42318" |
| hp-error-tint | color | "#F8E0DC" | "#F8E0DC" |
| hp-info | color | "#2F5B8A" | "#2F5B8A" |
| hp-info-tint | color | "#E0E8F2" | "#E0E8F2" |
| hp-font-display | string | [{"value":"Geist","theme":{"hp-direction":"signal"}},{"value":"Instrument Serif","theme":{"hp-direction":"current"}},{"value":"Barlow Condensed","theme":{"hp-direction":"workshop"}},{"value":"Hanken Grotesk","theme":{"hp-direction":"cobalt"}}] | "Geist" |
| hp-font-ui | string | [{"value":"Geist","theme":{"hp-direction":"signal"}},{"value":"Instrument Sans","theme":{"hp-direction":"current"}},{"value":"Inter","theme":{"hp-direction":"workshop"}},{"value":"Hanken Grotesk","theme":{"hp-direction":"cobalt"}}] | "Geist" |
| hp-font-mono | string | [{"value":"Geist Mono","theme":{"hp-direction":"signal"}},{"value":"IBM Plex Mono","theme":{"hp-direction":"current"}},{"value":"JetBrains Mono","theme":{"hp-direction":"workshop"}},{"value":"IBM Plex Mono","theme":{"hp-direction":"cobalt"}}] | "Geist Mono" |
| hp-r-control | number | 6 | 6 |
| hp-r-card | number | 10 | 10 |
| hp-r-panel | number | 18 | 18 |
| hp-mid | color | [{"value":"#B4B4BB","theme":{"hp-direction":"signal"}},{"value":"#B8B1A4","theme":{"hp-direction":"current"}},{"value":"#A9AEB1","theme":{"hp-direction":"workshop"}},{"value":"#AEB4C4","theme":{"hp-direction":"cobalt"}}] | "#B4B4BB" |
| hp-ink-80 | color | [{"value":"#0C0C0ECC","theme":{"hp-direction":"signal"}},{"value":"#1B1A17CC","theme":{"hp-direction":"current"}},{"value":"#111213CC","theme":{"hp-direction":"workshop"}},{"value":"#0B0F1ACC","theme":{"hp-direction":"cobalt"}}] | "#0C0C0ECC" |
| hp-ink-70 | color | [{"value":"#0C0C0EB3","theme":{"hp-direction":"signal"}},{"value":"#1B1A17B3","theme":{"hp-direction":"current"}},{"value":"#111213B3","theme":{"hp-direction":"workshop"}},{"value":"#0B0F1AB3","theme":{"hp-direction":"cobalt"}}] | "#0C0C0EB3" |
| hp-paper-20 | color | [{"value":"#FFFFFF33","theme":{"hp-direction":"signal"}},{"value":"#FCFAF633","theme":{"hp-direction":"current"}},{"value":"#F2F3F333","theme":{"hp-direction":"workshop"}},{"value":"#FFFFFF33","theme":{"hp-direction":"cobalt"}}] | "#FFFFFF33" |
| hp-paper-70 | color | [{"value":"#FFFFFFB3","theme":{"hp-direction":"signal"}},{"value":"#FCFAF6B3","theme":{"hp-direction":"current"}},{"value":"#F2F3F3B3","theme":{"hp-direction":"workshop"}},{"value":"#FFFFFFB3","theme":{"hp-direction":"cobalt"}}] | "#FFFFFFB3" |
| hp-weight-display | string | [{"value":"600","theme":{"hp-direction":"signal"}},{"value":"400","theme":{"hp-direction":"current"}},{"value":"700","theme":{"hp-direction":"workshop"}},{"value":"600","theme":{"hp-direction":"cobalt"}}] | "600" |
| hp-style-display | string | [{"value":"normal","theme":{"hp-direction":"signal"}},{"value":"italic","theme":{"hp-direction":"current"}},{"value":"normal","theme":{"hp-direction":"workshop"}},{"value":"normal","theme":{"hp-direction":"cobalt"}}] | "normal" |

## Typography

The Stage 4.2 visual lock specifies Geist 600 for display text: display 96 px, H1 64 px and H2 45 px, with −4% tracking and use at 36 px and above. Use Geist 400–700 for interface text. Body text is 16–19 px, labels are 15 px, and supporting text is 14 px. Use Geist Mono for order references, proof versions and quantities.

Line heights and other tracking values are not specified in the active visual-lock text. Do not infer them from this summary.

## Color, borders and geometry

The active Signal values resolve to paper `#FFFFFF`, bone `#F4F4F5`, line `#E4E4E7`, graphite `#5C5C63`, ink `#0C0C0E`, signal red `#D2311A`, marigold `#FFC21A`, and success `#1E6B4A`. The JSON has every Pen variable, including supporting warning, error and information colors.

Use red for actions. Use success green for approved or production-ready states. Use marigold for action on dark surfaces; do not use it as text on light surfaces. Use a 1 px border with `hp-line`; inputs use `hp-line-strong` (3.42:1 contrast as recorded). Radii are 6 px for controls, 10 px for cards and 18 px for panels.

No exact shadow value is exposed for the active Signal direction in the variable list or visual-lock notes. No separate light/dark mode axis was found. The `hp-direction` axis selects visual directions, not light/dark modes.

## Spacing and layout

The documented spacing scale is 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 and 128 px. The desktop reference uses a 1440 px viewport, 12 columns, 56 px margins and 1328 px content width. The mobile reference uses a 390 px viewport with 16–20 px gutters.

The design gives reference viewport sizes but does not define CSS breakpoint thresholds. Any implementation threshold is **INFERRED** and needs review against the relevant Pen frames. The tracker separately asks for visual checks at 375, 768 and 1440 px; those are test widths, not documented breakpoint tokens.

## Motion, icons and accessibility

Motion guidance lists 120–200 ms for utility changes, 250–450 ms for content, and 500–900 ms for editorial motion. The board also lists 160 ms for hover/focus/status changes, 180 ms for dropdowns, 320 ms for card/filter/accordion changes, and 180–320 ms for price/preview changes. Production Reveal is 900 ms and is for editorial media only, not forms, checkout or workspace.

Enter easing is `cubic-bezier(.2,.8,1,1)` and exit easing is `cubic-bezier(.4,0,1,1)`. With reduced motion, show media at rest, do not slide toasts or shimmer skeletons, and do not use WebGL or video. Use Lucide icons at 16–24 px. Pair icons with text for consequential actions.

Use 44 px minimum touch targets and 16 px minimum mobile body text. Focus rings are 2 px ink on light surfaces and 2 px paper on dark or red surfaces. Marigold is not text on light surfaces.

## Component and node inventory

The catalog below lists all 299 Pen definition records returned by the MCP inspection: 80 `HP/*`, 58 `HF/*`, 155 `WF/*`, and 6 other named records. `HP/*` is the current high-fidelity library. `HF/*` is an earlier high-fidelity library, and `WF/*` is the wireframe library. An entry can be a state, variant, or frame definition, not a stand-alone application component.

The variant column preserves the definition path below its namespace. The state column lists the states explicitly reported for that node. `No separate state node reported` does not mean that all possible states exist. Token, literal-color, font-family and font-size columns record extracted usage. A row with no Pen variable references uses literal values or does not report a token.

| Library | Definition | Node ID | Variant/path | Reported states | Pen variable tokens | Literal colors | Font families | Font sizes (px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WF | WF/Frame/Mobile-390 | X10os0 | Frame/Mobile-390 | No separate state node reported | No variable token references | #0F172A, #334155, #64748B, #CBD5E1, #E2E8F0, #F1F5F9, #F8FAFC, #FFFFFF | Inter | 10, 11, 12, 13, 14, 15, 16, 18 |
| WF | WF/Frame/Tablet-768 | RsosE | Frame/Tablet-768 | No separate state node reported | No variable token references | #0F172A, #334155, #475569, #64748B, #CBD5E1, #E2E8F0, #F8FAFC, #FFFFFF | Inter | 11, 12, 13, 18, 24 |
| WF | WF/Frame/Desktop-1440 | xDWtE | Frame/Desktop-1440 | No separate state node reported | No variable token references | #0F172A, #334155, #475569, #64748B, #CBD5E1, #E2E8F0, #F8FAFC, #FFFFFF | Inter | 12, 13, 14, 15, 20, 36 |
| WF | WF/Placeholder/Ratios | AuQfj | Placeholder/Ratios | No separate state node reported | No variable token references | #475569, #64748B, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 10, 11, 13 |
| WF | WF/Nav/MobileHeader | lLlRJ | Nav/MobileHeader | No separate state node reported | No variable token references | #0F172A, #334155, #E2E8F0, #FFFFFF | Inter | 12, 14, 15, 16 |
| WF | WF/Nav/MobileMenuOpen | z56nda | Nav/MobileMenuOpen | No separate state node reported | No variable token references | #0F172A, #334155, #64748B, #94A3B8, #CBD5E1, #E2E8F0, #F8FAFC, #FFFFFF | Inter | 12, 13, 14, 15, 16 |
| WF | WF/Nav/DesktopHeader | XFtjj | Nav/DesktopHeader | No separate state node reported | No variable token references | #0F172A, #2563EB, #334155, #94A3B8, #E2E8F0, #F8FAFC, #FFFFFF | Inter | 12, 13, 18 |
| WF | WF/Nav/DesktopMegaMenu | A3ViZ | Nav/DesktopMegaMenu | No separate state node reported | No variable token references | #0F172A, #1E293B, #4F46E5, #64748B, #CBD5E1, #E2E8F0, #F8FAFC, #FFFFFF | Inter | 11, 12, 13, 16 |
| WF | WF/Component/Accordion | ToK8H | Component/Accordion | No separate state node reported | No variable token references | #0F172A, #334155, #475569, #64748B, #CBD5E1, #E2E8F0, #FFFFFF | Inter | 13, 14, 16 |
| WF | WF/Action/ButtonMatrix | xhUsH | Action/ButtonMatrix | Default State, Hover State [Blue Focus Ring], Pressed State, Disabled State | No variable token references | #0F172A, #1E293B, #2563EB, #334155, #475569, #64748B, #94A3B8, #CBD5E1, #DC2626, #E2E8F0, #F1F5F9, #F8FAFC, #FECACA, #FEF2F2, #FFFFFF | Inter | 11, 13, 14, 16 |
| WF | WF/Button/Primary | fHiQO | Button/Primary | No separate state node reported | No variable token references | #0F172A, #64748B, #FFFFFF | Inter | 11, 14 |
| WF | WF/Button/Secondary | vy2fq | Button/Secondary | No separate state node reported | No variable token references | #0F172A, #64748B, #CBD5E1, #FFFFFF | Inter | 11, 14 |
| WF | WF/Button/Tertiary | Ia41B | Button/Tertiary | No separate state node reported | No variable token references | #2563EB, #64748B | Inter | 11, 14 |
| WF | WF/Button/Icon | Svrv4 | Button/Icon | No separate state node reported | No variable token references | #0F172A, #64748B, #CBD5E1, #F8FAFC | Inter | 11, 16 |
| WF | WF/Button/Destructive | qjOwS | Button/Destructive | No separate state node reported | No variable token references | #64748B, #DC2626, #FECACA, #FEF2F2 | Inter | 11, 14 |
| WF | WF/Input/Search | CTT9z | Input/Search | No separate state node reported | No variable token references | #0F172A, #475569, #CBD5E1, #FFFFFF | Inter | 11, 14 |
| WF | WF/Input/Text | YwOAj | Input/Text | No separate state node reported | No variable token references | #0F172A, #475569, #CBD5E1, #FFFFFF | Inter | 11, 14 |
| WF | WF/Input/Textarea | xVPRE | Input/Textarea | No separate state node reported | No variable token references | #334155, #475569, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/Input/Select | xAuo2 | Input/Select | No separate state node reported | No variable token references | #0F172A, #475569, #64748B, #CBD5E1, #FFFFFF | Inter | 11, 14 |
| WF | WF/Input/QuantityStepper | qTsPB | Input/QuantityStepper | No separate state node reported | No variable token references | #0F172A, #166534, #475569, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 16, 18 |
| WF | WF/Input/FileUpload | ZuaSJ | Input/FileUpload | No separate state node reported | No variable token references | #0F172A, #475569, #64748B, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 14 |
| WF | WF/Input/Phone | fGz5f | Input/Phone | No separate state node reported | No variable token references | #0F172A, #475569, #CBD5E1, #FFFFFF | Inter | 11, 14 |
| WF | WF/Card/Category | NtYTg | Card/Category | No separate state node reported | No variable token references | #0F172A, #2563EB, #64748B, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 13, 20 |
| WF | WF/Card/Intent - Team | B58iM | Card/Intent - Team | No separate state node reported | No variable token references | #0F172A, #2563EB, #64748B, #E2E8F0, #FFFFFF | Inter | 12, 16 |
| WF | WF/Card/Project | ZVSh2 | Card/Project | No separate state node reported | No variable token references | #0F172A, #2563EB, #475569, #4F46E5, #64748B, #E2E8F0, #EEF2FF, #F1F5F9, #FFFFFF | Inter | 11, 13, 20 |
| WF | WF/Card/Product/Direct | elHjD | Card/Product/Direct | No separate state node reported | No variable token references | #0F172A, #64748B, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 12, 13, 15, 18 |
| WF | WF/Card/Product/Quote | cntnK | Card/Product/Quote | No separate state node reported | No variable token references | #0F172A, #475569, #64748B, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 11, 12, 13, 15, 18 |
| WF | WF/Card/Product/Bespoke | x4iQs | Card/Product/Bespoke | No separate state node reported | No variable token references | #0F172A, #64748B, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 12, 13, 18 |
| WF | WF/Card/Intent/OutcomeMobile — proposed variant | lz8Ka | Card/Intent/OutcomeMobile — proposed variant | No separate state node reported | No variable token references | #0F172A, #475569, #64748B, #CBD5E1, #F1F5F9, #FFFFFF | Inter | 10, 11, 12, 14 |
| WF | WF/Card/Project/CompactLink — proposed variant | yW28W | Card/Project/CompactLink — proposed variant | No separate state node reported | No variable token references | #0F172A, #475569, #CBD5E1, #FFFFFF | Inter | 12, 14 |
| WF | WF/Commerce/PriceStates | U4zUx | Commerce/PriceStates | No separate state node reported | No variable token references | #0F172A, #2563EB, #334155, #475569, #64748B, #CBD5E1, #E2E8F0, #EFF6FF, #F1F5F9, #F8FAFC, #FFFFFF | Inter | 10, 11, 13, 18, 20, 22 |
| WF | WF/Commerce/Metadata | B4srLG | Commerce/Metadata | No separate state node reported | No variable token references | #0F172A, #475569, #64748B, #E2E8F0, #F8FAFC, #FFFFFF | Inter | 10, 11, 13, 14 |
| WF | WF/Card/Choice/Default | h1cTQ8 | Card/Choice/Default | No separate state node reported | No variable token references | #0F172A, #475569, #64748B, #CBD5E1, #FFFFFF | Inter | 11, 13, 15 |
| WF | WF/Card/Choice/Selected | K9taG | Card/Choice/Selected | No separate state node reported | No variable token references | #0F172A, #1E293B, #2563EB, #F8FAFC, #FFFFFF | Inter | 11, 13, 15 |
| WF | WF/Card/Choice/Recommended | w2UWpE | Card/Choice/Recommended | No separate state node reported | No variable token references | #0F172A, #4338CA, #475569, #CBD5E1, #EEF2FF, #FFFFFF | Inter | 10, 13, 15 |
| WF | WF/Card/Choice/Disabled | kR9ib | Card/Choice/Disabled | No separate state node reported | No variable token references | #94A3B8, #E2E8F0, #F1F5F9 | Inter | 11, 13, 15 |
| WF | WF/Card/Choice/Scratch | l9g4RD | Card/Choice/Scratch | No separate state node reported | No variable token references | #0F172A, #475569, #CBD5E1, #F1F5F9, #FFFFFF | Inter | 10, 13, 15 |
| WF | WF/Config/ArtworkStates | ZB1vD | Config/ArtworkStates | No separate state node reported | No variable token references | #0F172A, #475569, #64748B, #CBD5E1, #E2E8F0, #F8FAFC, #FFFFFF | Inter | 11, 12, 13 |
| WF | WF/Config/Progress | e976KF | Config/Progress | No separate state node reported | No variable token references | #0F172A, #4338CA, #475569, #64748B, #94A3B8, #CBD5E1, #E2E8F0, #EEF2FF, #F8FAFC, #FFFFFF | Inter | 11, 12, 13 |
| WF | WF/Config/HelpMeChoose | poryJ | Config/HelpMeChoose | No separate state node reported | No variable token references | #0F172A, #15803D, #166534, #2563EB, #334155, #64748B, #BBF7D0, #E2E8F0, #EFF6FF, #F0FDF4, #F1F5F9, #FFFFFF | Inter | 10, 11, 12, 13, 16, 18 |
| WF | WF/Feedback/StatusChips | X81AGE | Feedback/StatusChips | No separate state node reported | No variable token references | #0F172A, #475569, #64748B, #CBD5E1, #E2E8F0, #F1F5F9, #F8FAFC, #FFFFFF | Inter | 11, 12 |
| WF | WF/Order/Timeline | IrRn6 | Order/Timeline | No separate state node reported | No variable token references | #0F172A, #2563EB, #475569, #64748B, #94A3B8, #CBD5E1, #E2E8F0, #EEF2FF, #F8FAFC, #FFFFFF | Inter | 10, 11, 12, 13 |
| WF | WF/Feedback/EmptyState | tCs98 | Feedback/EmptyState | No separate state node reported | No variable token references | #0F172A, #64748B, #94A3B8, #CBD5E1, #E2E8F0, #F8FAFC, #FFFFFF | Inter | 12, 13, 18, 28 |
| WF | WF/Feedback/PrePressWarning | j6Hle | Feedback/PrePressWarning | No separate state node reported | No variable token references | #92400E, #B45309, #FDE68A, #FFFBEB, #FFFFFF | Inter | 11, 12, 16 |
| WF | WF/Mobile/StickyActions | lNFrr | Mobile/StickyActions | No separate state node reported | No variable token references | #0F172A, #475569, #64748B, #CBD5E1, #E2E8F0, #F8FAFC, #FFFFFF | Inter | 11, 12, 13, 14, 15 |
| WF | WF/Mobile/BottomSheet | Y8KhQ | Mobile/BottomSheet | No separate state node reported | No variable token references | #0F172A, #334155, #475569, #64748B, #CBD5E1, #E2E8F0, #F8FAFC, #FFFFFF | Inter | 10, 12, 13, 14 |
| WF | WF/Search/DesktopField | a9FVO | Search/DesktopField | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 12, 16 |
| WF | WF/Search/MobileFullScreen | BmNao | Search/MobileFullScreen | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 12, 13, 15 |
| WF | WF/Search/Typeahead | r2HGMb | Search/Typeahead | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 10, 11, 13 |
| WF | WF/Search/RecentSearches | rLIAi | Search/RecentSearches | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 14 |
| WF | WF/Search/PopularSearches | wKdBw | Search/PopularSearches | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 14 |
| WF | WF/Search/GroupedSuggestions | TROAd | Search/GroupedSuggestions | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 14 |
| WF | WF/Search/AlternateQuery | a9MIB | Search/AlternateQuery | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 14 |
| WF | WF/Search/NoResults | aGLwi | Search/NoResults | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 12, 13, 17 |
| WF | WF/Search/ResultItem | c4MKy | Search/ResultItem | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 10, 11, 12, 16 |
| WF | WF/Search/PartialResult | w42c4C | Search/PartialResult | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 12, 13 |
| WF | WF/Filter/DesktopRail | RMOXC | Filter/DesktopRail | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 12, 13 |
| WF | WF/Filter/MobileBottomSheet | s3zrvx | Filter/MobileBottomSheet | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 12, 13, 16 |
| WF | WF/Filter/Group | tZTVP | Filter/Group | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13, 16 |
| WF | WF/Filter/MultiSelect | r8cN6 | Filter/MultiSelect | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/Filter/QuantityRange | ITb6x | Filter/QuantityRange | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/Filter/NeededBy | x8j2R | Filter/NeededBy | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/Filter/SelectedChips | kUS2l | Filter/SelectedChips | SELECTED FILTERS | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/Filter/SortDropdown | HKAoa | Filter/SortDropdown | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/Filter/ResultCount | K4smD | Filter/ResultCount | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/Filter/EmptyResult | W4aAIU | Filter/EmptyResult | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/Filter/Loading | g5j0Z | Filter/Loading | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/Results/LoadMore | jYlim | Results/LoadMore | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/Results/Pagination | D68r4s | Results/Pagination | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 14 |
| WF | WF/Filter/ClearAll | wph9E | Filter/ClearAll | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #FFFFFF | Inter | 13 |
| WF | WF/Breadcrumb/Desktop | wCVOW | Breadcrumb/Desktop | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #E2E8F0, #FFFFFF | Inter | 11, 13 |
| WF | WF/Breadcrumb/Mobile | t4Sk2 | Breadcrumb/Mobile | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #E2E8F0, #FFFFFF | Inter | 11, 13 |
| WF | WF/B2B/SizeQuantity/DesktopTable | AyFF5 | B2B/SizeQuantity/DesktopTable | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/SizeQuantity/MobileCard | V02shd | B2B/SizeQuantity/MobileCard | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/Personalization/DesktopTable | kFN1I | B2B/Personalization/DesktopTable | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/Personalization/MobileCard | pLAkA | B2B/Personalization/MobileCard | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/MultiAddress/DesktopTable | H3bpTu | B2B/MultiAddress/DesktopTable | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/MultiAddress/MobileCard | XpUoL | B2B/MultiAddress/MobileCard | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/QuoteLineItem/DesktopTable | lhKj1 | B2B/QuoteLineItem/DesktopTable | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/QuoteLineItem/MobileCard | PzrDn | B2B/QuoteLineItem/MobileCard | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/OrderItemStatus/DesktopTable | gNdFn | B2B/OrderItemStatus/DesktopTable | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/OrderItemStatus/MobileCard | D3CKZ | B2B/OrderItemStatus/MobileCard | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/ProofVersion/DesktopTable | z2IpV6 | B2B/ProofVersion/DesktopTable | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/ProofVersion/MobileCard | V47ZtH | B2B/ProofVersion/MobileCard | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/GroupParticipant/DesktopTable | a7k6ZB | B2B/GroupParticipant/DesktopTable | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/GroupParticipant/MobileCard | f7Ozv | B2B/GroupParticipant/MobileCard | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12 |
| WF | WF/B2B/CSV/Upload | QBiWh | B2B/CSV/Upload | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/B2B/CSV/ColumnMapping | dLMef | B2B/CSV/ColumnMapping | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/B2B/CSV/Validation | ibWWX | B2B/CSV/Validation | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/B2B/CSV/Success | bf3cY | B2B/CSV/Success | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/State/SkeletonLoading | a843T | State/SkeletonLoading | Loading products… | No variable token references | #1F2937, #CBD5E1, #E5E7EB, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/UploadProgress | XVbLx | State/UploadProgress | No separate state node reported | No variable token references | #1F2937, #9CA3AF, #CBD5E1, #E5E7EB, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/ProcessingArtwork | OELcl | State/ProcessingArtwork | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/Saving | KVTo1 | State/Saving | SAVING, Saving configuration… | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/Saved | I58IC | State/Saved | SAVED | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/SaveFailed | Z76K7Q | State/SaveFailed | SAVE FAILED | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/Offline | gVa2E | State/Offline | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/Reconnecting | aGUjU | State/Reconnecting | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/RefreshingPrice | qxAcy | State/RefreshingPrice | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/PaymentProcessing | jxId9 | State/PaymentProcessing | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/PaymentFailed | q4dVAO | State/PaymentFailed | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/Success | t7pT6 | State/Success | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/Empty | Q92jLX | State/Empty | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/PartialResult | A3mWMe | State/PartialResult | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/State/StaleDraftRepricing | VfpTc | State/StaleDraftRepricing | No separate state node reported | No variable token references | #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 15 |
| WF | WF/A11y/Control/Default | sYYJe | A11y/Control/Default | DEFAULT | No variable token references | #1F2937, #94A3B8, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 14 |
| WF | WF/A11y/Control/Hover | GVGzs | A11y/Control/Hover | HOVER | No variable token references | #1F2937, #94A3B8, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 14 |
| WF | WF/A11y/Control/Focus | AC7YT | A11y/Control/Focus | FOCUS | No variable token references | #111827, #1F2937, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 14 |
| WF | WF/A11y/Control/Active | HkSTX | A11y/Control/Active | ACTIVE, Pressed feedback; no motion dependency. | No variable token references | #1F2937, #94A3B8, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 14 |
| WF | WF/A11y/Control/Selected | LBw5A | A11y/Control/Selected | SELECTED | No variable token references | #1F2937, #94A3B8, #CBD5E1, #E5E7EB, #FFFFFF | Inter | 11, 12, 14 |
| WF | WF/A11y/Control/Disabled | KufHl | A11y/Control/Disabled | DISABLED | No variable token references | #1F2937, #94A3B8, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 14 |
| WF | WF/A11y/Control/Error | jBqpi | A11y/Control/Error | ERROR | No variable token references | #1F2937, #94A3B8, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 14 |
| WF | WF/A11y/Control/Success | AVX6S | A11y/Control/Success | No separate state node reported | No variable token references | #1F2937, #94A3B8, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 11, 12, 14 |
| WF | WF/A11y/InteractionRules | g7Xy5t | A11y/InteractionRules | Errors: identify affected row/field, describe repair, and preserve all valid values. | No variable token references | #1F2937, #CBD5E1, #FFFFFF | Inter | 11, 13 |
| WF | WF/Nav/MobileHeader/TouchTargets — proposed variant | INfVC | Nav/MobileHeader/TouchTargets — proposed variant | No separate state node reported | No variable token references | #0F172A, #334155, #E2E8F0, #FFFFFF | Inter | 12, 14, 15, 16 |
| WF | WF/Search/SuggestionRow — proposed variant | l4TTzA | Search/SuggestionRow — proposed variant | No separate state node reported | No variable token references | #0F172A, #334155, #475569, #64748B, #CBD5E1, #E2E8F0, #F1F5F9, #FFFFFF | Inter | 12, 14, 16, 18 |
| WF | WF/Search/ProjectResult | v0b2P | Search/ProjectResult | No separate state node reported | No variable token references | #0F172A, #475569, #CBD5E1, #FFFFFF | Inter | 13, 14, 16, 18 |
| WF | WF/Search/GuideResult | w7bEa6 | Search/GuideResult | No separate state node reported | No variable token references | #0F172A, #475569, #CBD5E1, #FFFFFF | Inter | 13, 14, 16, 18 |
| WF | WF/Search/WorkResult | R6fhcq | Search/WorkResult | No separate state node reported | No variable token references | #0F172A, #475569, #CBD5E1, #FFFFFF | Inter | 13, 14, 16, 18 |
| WF | WF/Search/CategoryResult | OPlLf | Search/CategoryResult | No separate state node reported | No variable token references | #0F172A, #475569, #CBD5E1, #FFFFFF | Inter | 13, 14, 16, 18 |
| WF | WF/Filter/DesktopRail/Comfortable — proposed variant | wVvqK | Filter/DesktopRail/Comfortable — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Card/Product/Service — proposed variant | pbi6G | Card/Product/Service — proposed variant | No separate state node reported | No variable token references | #0F172A, #475569, #64748B, #CBD5E1, #F1F5F9, #F8FAFC, #FFFFFF | Inter | 12, 13, 14, 16, 20 |
| WF | WF/Discovery/SubcategoryTile — proposed variant | rXv14 | Discovery/SubcategoryTile — proposed variant | No separate state node reported | No variable token references | #0F172A, #475569, #64748B, #CBD5E1, #F1F5F9, #FFFFFF | Inter | 12, 14, 18 |
| WF | WF/PDP/BuyEvaluation — proposed variant | m8Ksr | PDP/BuyEvaluation — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #E2E8F0, #FFFFFF | Inter | 14, 16, 22, 24 |
| WF | WF/PDP/PriceState — proposed variant | i7wc5A | PDP/PriceState — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #E2E8F0, #FFFFFF | Inter | 13, 14, 16, 24 |
| WF | WF/PDP/MOQLeadRow — proposed variant | nsp8Z | PDP/MOQLeadRow — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #FFFFFF | Inter | 14, 16, 20 |
| WF | WF/PDP/Gallery — proposed variant | rMC8m | PDP/Gallery — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #E2E8F0, #FFFFFF | Inter | 13, 14 |
| WF | WF/PDP/MobileStickyAction — proposed variant | EZ9Zh | PDP/MobileStickyAction — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F1F5F9, #FFFFFF | Inter | 14, 16, 20 |
| WF | WF/Config/ChoiceCard/Readable — proposed variant | PLqsO | Config/ChoiceCard/Readable — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/MaterialCard — proposed variant | NTo3W | Config/MaterialCard — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/VisibleSize — proposed variant | jHYcM | Config/VisibleSize — proposed variant | Selected and unavailable states visible. | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/QuantityTiers — proposed variant | T7lhly | Config/QuantityTiers — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/SizeQuantity — proposed variant | ZKVLD | Config/SizeQuantity — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/PlacementMap — proposed variant | vDtNh | Config/PlacementMap — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/ProductPreview — proposed variant | bEEo0 | Config/ProductPreview — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/ViewSwitch — proposed variant | EXdfG | Config/ViewSwitch — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/ArtworkRouter — proposed variant | Q1Ar8K | Config/ArtworkRouter — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/FileUploadState — proposed variant | R5HV1x | Config/FileUploadState — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/PriceBreakdown — proposed variant | WWF6B | Config/PriceBreakdown — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/DeadlineState — proposed variant | x62q1S | Config/DeadlineState — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/QuoteTransition — proposed variant | ndMUZ | Config/QuoteTransition — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/ReviewSummary — proposed variant | cWRtL | Config/ReviewSummary — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/EditFromReview — proposed variant | NZB0w | Config/EditFromReview — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/SaveStates — proposed variant | j71f7p | Config/SaveStates — proposed variant | SAVING · SAVED · SAVE FAILED — RETRY | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/DependencyChange — proposed variant | QD0An | Config/DependencyChange — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| WF | WF/Config/ProgressStable — proposed variant | po7p5 | Config/ProgressStable — proposed variant | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #F8FAFC, #FFFFFF | Inter | 14, 16, 18 |
| Other | PRICE_READY | NEErh | base | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #E2E8F0, #FFFFFF | Inter | 14, 16, 26 |
| Other | ESTIMATE_READY | FqqLK | base | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #E2E8F0, #FFFFFF | Inter | 14, 16, 26 |
| Other | QUOTE_REQUIRED | u9GVO | base | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #E2E8F0, #FFFFFF | Inter | 14, 16, 26 |
| Other | CONSULTATION_REQUIRED | VtUC7 | base | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #E2E8F0, #FFFFFF | Inter | 14, 16, 26 |
| WF | WF/Project/TypeCard — proposed | vlrYE | Project/TypeCard — proposed | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #E2E8F0, #FFFFFF | Inter | 13, 16, 18 |
| WF | WF/Project/Progress — proposed | unuZX | Project/Progress — proposed | Saved · Continue later | No variable token references | #0F172A, #CBD5E1, #FFFFFF | Inter | 16, 18 |
| WF | WF/Project/RecommendationCard — proposed | AhK8d | Project/RecommendationCard — proposed | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #FFFFFF | Inter | 16, 18, 20 |
| WF | WF/Project/Summary — proposed | CmOBd | Project/Summary — proposed | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #FFFFFF | Inter | 16, 18 |
| WF | WF/Project/OpenItem — proposed | RZrPC | Project/OpenItem — proposed | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #FFFFFF | Inter | 16, 18 |
| WF | WF/Project/PriceState — proposed | KB3Is | Project/PriceState — proposed | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #FFFFFF | Inter | 16, 18 |
| WF | WF/Project/ChangeDiff — proposed | FaV3Y | Project/ChangeDiff — proposed | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #FFFFFF | Inter | 16, 18 |
| WF | WF/Project/Handoff — proposed | zwtzm | Project/Handoff — proposed | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #FFFFFF | Inter | 16, 18 |
| WF | WF/Project/RecommendationActions — proposed | f0xUE | Project/RecommendationActions — proposed | No separate state node reported | No variable token references | #0F172A, #CBD5E1, #FFFFFF | Inter | 14 |
| HF | HF/Nav/DesktopHeader | xPPYR | Nav/DesktopHeader | No separate state node reported | No variable token references | #222420, #A03F2B, #FFFCF7 | Instrument Sans | 15, 16, 22 |
| Other | Get started | rt3Qr | base | No separate state node reported | No variable token references | #A03F2B, #FFFCF7 | Instrument Sans | 15 |
| HF | HF/Nav/MegaMenu | c5ZRMH | Nav/MegaMenu | No separate state node reported | No variable token references | #222420, #A03F2B, #E8D3BD, #FFFCF7 | Instrument Sans | 13, 17, 23, 36 |
| HF | HF/Nav/MobileMenu | NmTW9 | Nav/MobileMenu | No separate state node reported | No variable token references | #00000000, #222420, #A03F2B, #A9A49A, #D5D0C7, #FFFCF7 | Instrument Sans | 15, 20, 22 |
| Other | Mobile support | emIoM | base | No separate state node reported | No variable token references | #00000000, #222420, #A9A49A, #FFFCF7 | Instrument Sans | 15 |
| HF | HF/Nav/SearchEntry | j0IDnR | Nav/SearchEntry | No separate state node reported | No variable token references | #222420, #5C625C, #F4F0E8 | Instrument Sans | 17 |
| HF | HF/Nav/WorkspaceSidebar | XSDiY | Nav/WorkspaceSidebar | No separate state node reported | No variable token references | #222420, #45443C, #E8BCAA, #FFFCF7 | Instrument Sans | 12, 16, 19 |
| HF | HF/Button/Primary | iZly8 | Button/Primary | No separate state node reported | No variable token references | #A03F2B, #FFFCF7 | Instrument Sans | 15 |
| HF | HF/Button/Secondary | RBW81 | Button/Secondary | No separate state node reported | No variable token references | #00000000, #222420, #A9A49A, #FFFCF7 | Instrument Sans | 15 |
| HF | HF/Button/Tertiary | ZG8UG | Button/Tertiary | No separate state node reported | No variable token references | #222420, #F4F0E8 | Instrument Sans | 15 |
| HF | HF/Button/Destructive | Vovjq | Button/Destructive | No separate state node reported | No variable token references | #A02F2F, #FFFCF7 | Instrument Sans | 15 |
| HF | HF/Button/Primary/Hover | JDF99 | Button/Primary/Hover | Hover | No variable token references | #7E3021, #FFFCF7 | Instrument Sans | 15 |
| HF | HF/Button/Primary/Focus | PHNLx | Button/Primary/Focus | Focus | No variable token references | #00000000, #A03F2B, #FFFCF7 | Instrument Sans | 15 |
| HF | HF/Button/Primary/Disabled | hlLzb | Button/Primary/Disabled | Disabled | No variable token references | #686C66, #DDD9D1 | Instrument Sans | 15 |
| HF | HF/Button/Icon Action | Q4JBD | Button/Icon Action | No separate state node reported | No variable token references | #222420, #D5D0C7, #FFFCF7 | Instrument Sans | 22 |
| HF | HF/Mobile/Sticky CTA | dXxib | Mobile/Sticky CTA | No separate state node reported | No variable token references | #A03F2B, #D5D0C7, #FFFCF7 | Instrument Sans | 15 |
| HF | HF/Button/Primary/Pressed | s6Bhpk | Button/Primary/Pressed | Pressed | No variable token references | #7E3021, #FFFCF7 | Instrument Sans | 15 |
| HF | HF/Form/Text input | amNRn | Form/Text input | No separate state node reported | No variable token references | #00000000, #222420, #5C625C, #AAA79F, #FFFCF7 | Instrument Sans | 14, 15, 16 |
| HF | HF/Form/Select | kKUXc | Form/Select | No separate state node reported | No variable token references | #222420, #5C625C, #FFFCF7 | Instrument Sans | 14, 15, 16 |
| HF | HF/Form/Radio group | T9PGM | Form/Radio group | No separate state node reported | No variable token references | #222420, #A03F2B, #FFFCF7 | Instrument Sans | 15, 16 |
| HF | HF/Form/Checkbox | C1vnz | Form/Checkbox | No separate state node reported | No variable token references | #222420, #A03F2B, #FFFCF7 | Instrument Sans | 15, 16 |
| HF | HF/Form/Choice card | cVmTJ | Form/Choice card | SELECTED  ✓ | No variable token references | #222420, #A03F2B, #F6EAE0, #FFFCF7 | Instrument Sans | 13, 16, 20 |
| HF | HF/Form/Quantity stepper | nqBKG | Form/Quantity stepper | No separate state node reported | No variable token references | #222420, #5C625C, #FFFCF7 | Instrument Sans | 14, 15, 22, 28 |
| HF | HF/Form/Size selector | g79H2R | Form/Size selector | No separate state node reported | No variable token references | #222420, #A03F2B, #FFFCF7 | Instrument Sans | 14, 15, 16 |
| HF | HF/Form/Date | y9NHv | Form/Date | No separate state node reported | No variable token references | #222420, #5C625C, #FFFCF7 | Instrument Sans | 14, 15, 16 |
| HF | HF/Form/File upload | xuY5b | Form/File upload | No separate state node reported | No variable token references | #176B51, #222420, #5C625C, #F4F0E8, #FFFCF7 | Instrument Sans | 14, 17 |
| HF | HF/Form/Search | EGDlM | Form/Search | No separate state node reported | No variable token references | #222420, #5C625C, #FFFCF7 | Instrument Sans | 16 |
| HF | HF/Form/Error | i3fPMk | Form/Error | No separate state node reported | No variable token references | #00000000, #222420, #A02F2F, #FFFCF7 | Instrument Sans | 14, 15, 16 |
| HF | HF/Form/Helper | bo1Im | Form/Helper | No separate state node reported | No variable token references | #00000000, #222420, #5C625C, #AAA79F, #FFFCF7 | Instrument Sans | 14, 15, 16 |
| HF | HF/Form/State/Focused input | W5Aah | Form/State/Focused input | FOCUS | No variable token references | #222420, #5C625C, #A03F2B, #D5D0C7, #FFFCF7 | Instrument Sans | 13, 14, 15 |
| HF | HF/Form/State/Disabled input | Xdd1i | Form/State/Disabled input | DISABLED | No variable token references | #222420, #5C625C, #D5D0C7, #F4F0E8, #FFFCF7 | Instrument Sans | 13, 14, 15 |
| HF | HF/Form/State/Error input | gjWgl | Form/State/Error input | ERROR, Error message follows the field. | No variable token references | #222420, #A02F2F, #D5D0C7, #FFFCF7 | Instrument Sans | 13, 14, 15 |
| HF | HF/Form/State/Selected choice | bU4rt | Form/State/Selected choice | SELECTED | No variable token references | #176B51, #222420, #5C625C, #D5D0C7, #FFFCF7 | Instrument Sans | 13, 14, 15 |
| HF | HF/Commerce/Product card | YjHjs | Commerce/Product card | No separate state node reported | No variable token references | #222420, #5C625C, #FFFCF7 | Instrument Sans | 14, 17, 25 |
| HF | HF/Commerce/Material card | i6LEZV | Commerce/Material card | No separate state node reported | No variable token references | #222420, #A03F2B, #FFFCF7 | Instrument Sans | 14, 15, 22 |
| HF | HF/Commerce/Price state | J18poz | Commerce/Price state | No separate state node reported | No variable token references | #222420, #5C625C, #A03F2B, #FFFCF7 | Instrument Sans | 13, 15, 16, 43 |
| HF | HF/Commerce/MOQ / lead time | E4rlU | Commerce/MOQ / lead time | No separate state node reported | No variable token references | #222420, #5C625C, #D5D0C7, #FFFCF7 | Instrument Sans | 15, 17, 22 |
| HF | HF/Commerce/Quantity tiers | GrnEN | Commerce/Quantity tiers | No separate state node reported | No variable token references | #222420, #F4F0E8, #F6EAE0, #FFFCF7 | Instrument Sans | 16, 17, 22 |
| HF | HF/Commerce/Configuration summary | zhR6S | Commerce/Configuration summary | No separate state node reported | No variable token references | #222420, #5C625C, #A03F2B, #FFFCF7 | Instrument Sans | 15, 24 |
| HF | HF/Commerce/Price breakdown | Pvkib | Commerce/Price breakdown | No separate state node reported | No variable token references | #222420, #D5D0C7, #FFFCF7 | Instrument Sans | 16, 18, 21, 24 |
| HF | HF/Commerce/Project recommendation | knzoJ | Commerce/Project recommendation | No separate state node reported | No variable token references | #222420, #A03F2B, #FFFCF7 | Instrument Sans | 13, 15, 16, 23 |
| HF | HF/Commerce/Project progress | p2ioz3 | Commerce/Project progress | No separate state node reported | No variable token references | #176B51, #222420, #5C625C, #E2DDD4, #FFFCF7 | Instrument Sans | 17, 23 |
| HF | HF/Transaction/Status chip | iFFxk | Transaction/Status chip | No separate state node reported | No variable token references | #222420, #805113, #F8E9D3, #FFFCF7 | Instrument Sans | 13, 16 |
| HF | HF/Transaction/Attention card | HutH1 | Transaction/Attention card | No separate state node reported | No variable token references | #222420, #A03F2B, #FFFCF7 | Instrument Sans | 13, 15, 23 |
| HF | HF/Transaction/Timeline | sUROJ | Transaction/Timeline | No separate state node reported | No variable token references | #176B51, #222420, #D5D0C7, #FFFCF7 | Instrument Sans | 15 |
| HF | HF/Transaction/Save state | zkhtZ | Transaction/Save state | No separate state node reported | No variable token references | #176B51, #222420, #A02F2F, #FFFCF7 | Instrument Sans | 15, 16, 20 |
| HF | HF/Transaction/Payment state | kerj4 | Transaction/Payment state | No separate state node reported | No variable token references | #176B51, #222420, #A02F2F, #FFFCF7 | Instrument Sans | 14, 15, 16, 22 |
| HF | HF/Transaction/Proof state | M72i2 | Transaction/Proof state | No separate state node reported | No variable token references | #222420, #5C625C, #A03F2B, #FFFCF7 | Instrument Sans | 13, 15, 23 |
| HF | HF/Transaction/Order state | KSUBw | Transaction/Order state | No separate state node reported | No variable token references | #222420, #5C625C, #805113, #FFFCF7 | Instrument Sans | 13, 14, 15, 16, 21 |
| HF | HF/Transaction/Quote line item | Yi3eN | Transaction/Quote line item | No separate state node reported | No variable token references | #222420, #5C625C, #FFFCF7 | Instrument Sans | 13, 15, 21, 24 |
| HF | HF/Transaction/Payment summary | ximaz | Transaction/Payment summary | No separate state node reported | No variable token references | #222420, #FFFCF7 | Instrument Sans | 16, 22 |
| HF | HF/Transaction/Proof viewer chrome | VUAr1 | Transaction/Proof viewer chrome | No separate state node reported | No variable token references | #222420, #A03F2B, #E9E3D9, #FFFCF7 | Instrument Sans | 14, 20 |
| HF | HF/Transaction/Shipment card | zAtpO | Transaction/Shipment card | No separate state node reported | No variable token references | #222420, #315C7D, #A03F2B, #FFFCF7 | Instrument Sans | 14, 15, 16, 21 |
| HF | HF/Transaction/Hold recovery | k9sp5e | Transaction/Hold recovery | No separate state node reported | No variable token references | #222420, #A02F2F, #A03F2B, #FFFCF7 | Instrument Sans | 15, 22 |
| HF | HF/B2B/Asset card | V85QS | B2B/Asset card | No separate state node reported | No variable token references | #176B51, #222420, #A03F2B, #E8D3BD, #FFFCF7 | Instrument Sans | 13, 16, 23, 27 |
| HF | HF/B2B/Template card | bz6Pf | B2B/Template card | No separate state node reported | No variable token references | #176B51, #222420, #A03F2B, #FFFCF7 | Instrument Sans | 13, 16, 24 |
| HF | HF/B2B/Locked field | DxpSw | B2B/Locked field | No separate state node reported | No variable token references | #222420, #5C625C, #A03F2B, #F4F0E8, #FFFCF7 | Instrument Sans | 14, 15, 16, 17, 22 |
| HF | HF/B2B/Organization approval card | CVfTw | B2B/Organization approval card | No separate state node reported | No variable token references | #222420, #A03F2B, #FFFCF7 | Instrument Sans | 15, 16, 23, 27 |
| HF | HF/B2B/Participant card | Z1k0I | B2B/Participant card | No separate state node reported | No variable token references | #176B51, #222420, #5C625C, #A03F2B, #FFFCF7 | Instrument Sans | 13, 15, 16, 23 |
| HF | HF/B2B/Store product | ohbMR | B2B/Store product | No separate state node reported | No variable token references | #176B51, #222420, #A03F2B, #FFFCF7 | Instrument Sans | 13, 16, 24 |
| HP | HP/Nav/UtilityStrip | BoplJ | Nav/UtilityStrip | No separate state node reported | hp-bone, hp-font-mono, hp-font-ui, hp-ink, hp-line | — | $hp-font-mono, $hp-font-ui | 12, 13 |
| HP | HP/Nav/Header | nO6TF | Nav/Header | No separate state node reported | hp-accent, hp-bone, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper | — | $hp-font-ui | 14, 15, 27 |
| HP | HP/Nav/MobileHeader | ED2Si | Nav/MobileHeader | No separate state node reported | hp-accent, hp-font-ui, hp-ink, hp-line, hp-paper | — | $hp-font-ui | 22 |
| HP | HP/Nav/MegaMenu | xXpug | Nav/MegaMenu | No separate state node reported | hp-accent, hp-font-mono, hp-font-ui, hp-ink, hp-line, hp-paper | — | $hp-font-mono, $hp-font-ui | 12, 15, 16, 26 |
| HP | HP/Nav/MobileMenu | x29emx | Nav/MobileMenu | No separate state node reported | hp-accent, hp-bone, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper | — | $hp-font-ui | 15, 16, 22 |
| HP | HP/Nav/SearchEntry | BFMLv | Nav/SearchEntry | No separate state node reported | hp-accent, hp-bone, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper | — | $hp-font-mono, $hp-font-ui | 12, 14, 16, 18 |
| HP | HP/Nav/WorkspaceSidebar | Mmc8t | Nav/WorkspaceSidebar | No separate state node reported | hp-accent, hp-bone, hp-font-ui, hp-ink, hp-ink-2, hp-line, hp-marigold, hp-mid | #3A3833 | $hp-font-ui | 12, 13, 15, 21 |
| HP | HP/Nav/Footer | F64bQ | Nav/Footer | No separate state node reported | hp-accent, hp-bone, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line-strong, hp-mid | #3A3833 | $hp-font-mono, $hp-font-ui | 12, 13, 14, 15, 16, 30 |
| HP | HP/Button/Primary | sHY2D | Button/Primary | No separate state node reported | hp-accent, hp-font-ui, hp-paper | — | $hp-font-ui | 16 |
| HP | HP/Button/Secondary | NPyGW | Button/Secondary | No separate state node reported | hp-font-ui, hp-ink, hp-paper | — | $hp-font-ui | 16 |
| HP | HP/Button/Tertiary | OCtXA | Button/Tertiary | No separate state node reported | hp-accent, hp-font-ui | — | $hp-font-ui | 16 |
| HP | HP/Button/Ink | CTofy | Button/Ink | No separate state node reported | hp-font-ui, hp-ink, hp-paper | — | $hp-font-ui | 16 |
| HP | HP/Button/Destructive | VpE2W | Button/Destructive | No separate state node reported | hp-error, hp-font-ui, hp-paper | — | $hp-font-ui | 16 |
| HP | HP/Button/Icon | i727Mh | Button/Icon | No separate state node reported | hp-ink, hp-line, hp-paper | — | — | — |
| HP | HP/Mobile/StickyCTA | CGsQ8 | Mobile/StickyCTA | No separate state node reported | hp-accent, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper | — | $hp-font-mono, $hp-font-ui | 12, 16, 22 |
| HP | HP/Form/TextInput | dJwFe | Form/TextInput | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line-strong, hp-paper | — | $hp-font-ui | 14, 15, 16 |
| HP | HP/Form/Select | U1pUbm | Form/Select | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line-strong, hp-paper | — | $hp-font-ui | 15, 16 |
| HP | HP/Form/Date | OYOtD | Form/Date | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line-strong, hp-paper | — | $hp-font-ui | 14, 15, 16 |
| HP | HP/Form/Error | LjJM4 | Form/Error | No separate state node reported | hp-error, hp-font-ui, hp-ink, hp-paper | — | $hp-font-ui | 14, 15, 16 |
| HP | HP/Form/Search | X0XemJ | Form/Search | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line-strong, hp-paper | — | $hp-font-ui | 15, 16 |
| HP | HP/Form/Helper | bj23k | Form/Helper | No separate state node reported | hp-bone, hp-font-ui, hp-graphite | — | $hp-font-ui | 14 |
| HP | HP/Form/Checkbox | OEuZR | Form/Checkbox | No separate state node reported | hp-font-ui, hp-ink, hp-line-strong, hp-paper | — | $hp-font-ui | 16 |
| HP | HP/Form/RadioGroup | BPlC4 | Form/RadioGroup | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line-strong, hp-paper | — | $hp-font-ui | 14, 16 |
| HP | HP/Form/ChoiceCard | ZOHGG | Form/ChoiceCard | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line, hp-line-strong, hp-paper | — | $hp-font-ui | 14, 16 |
| HP | HP/Form/QuantityStepper | HCT37 | Form/QuantityStepper | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line, hp-line-strong, hp-paper | — | $hp-font-ui | 14, 15, 20 |
| HP | HP/Form/SizeSelector | fOd74 | Form/SizeSelector | No separate state node reported | hp-accent, hp-bone, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-line-strong, hp-paper | — | $hp-font-ui | 14, 15, 16 |
| HP | HP/Form/FileUpload | anSIS | Form/FileUpload | No separate state node reported | hp-bone, hp-font-ui, hp-graphite, hp-ink, hp-line-strong, hp-paper | — | $hp-font-ui | 14, 15, 16 |
| HP | HP/Ticket | QeNIY | Ticket | No separate state node reported | hp-font-mono, hp-ink, hp-paper | — | $hp-font-mono | 11 |
| HP | HP/Ticket/Ink | wtUV2 | Ticket/Ink | No separate state node reported | hp-font-mono, hp-ink, hp-paper | — | $hp-font-mono | 11 |
| HP | HP/Ticket/Marigold | c08jo | Ticket/Marigold | No separate state node reported | hp-font-mono, hp-ink, hp-marigold | — | $hp-font-mono | 11 |
| HP | HP/Commerce/PriceState/PRICE READY | MUrzy | Commerce/PriceState/PRICE READY | No separate state node reported | hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper, hp-success, hp-success-tint | — | $hp-font-mono, $hp-font-ui | 11, 14, 24 |
| HP | HP/Commerce/PriceState/ESTIMATE READY | twtQK | Commerce/PriceState/ESTIMATE READY | No separate state node reported | hp-font-mono, hp-font-ui, hp-graphite, hp-info, hp-info-tint, hp-ink, hp-line, hp-paper | — | $hp-font-mono, $hp-font-ui | 11, 14, 24 |
| HP | HP/Commerce/PriceState/QUOTE REQUIRED | UE3yG | Commerce/PriceState/QUOTE REQUIRED | No separate state node reported | hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper, hp-warning, hp-warning-tint | — | $hp-font-mono, $hp-font-ui | 11, 14, 24 |
| HP | HP/Commerce/PriceState/CONSULTATION REQUIRED | hl2xO | Commerce/PriceState/CONSULTATION REQUIRED | No separate state node reported | hp-accent, hp-accent-tint, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper | — | $hp-font-mono, $hp-font-ui | 11, 14, 24 |
| HP | HP/Graphic/JobTicket | wbhUn | Graphic/JobTicket | No separate state node reported | hp-font-mono, hp-graphite, hp-ink, hp-paper | — | $hp-font-mono | 10, 11 |
| HP | HP/Graphic/RegistrationRule | wt9W9 | Graphic/RegistrationRule | No separate state node reported | hp-accent, hp-font-mono | — | $hp-font-mono | 11 |
| HP | HP/Graphic/QuantityMark | A7Z1ac | Graphic/QuantityMark | No separate state node reported | hp-font-display, hp-font-mono, hp-graphite, hp-ink | — | $hp-font-display, $hp-font-mono | 10, 40 |
| HP | HP/Graphic/InspectionMark | KWZiW | Graphic/InspectionMark | No separate state node reported | hp-font-mono, hp-success | — | $hp-font-mono | 10 |
| HP | HP/Graphic/StageMark | y8btk | Graphic/StageMark | No separate state node reported | hp-accent, hp-font-mono, hp-graphite, hp-line-strong | — | $hp-font-mono | 10 |
| HP | HP/Commerce/ProductCard | UFKXZ | Commerce/ProductCard | No separate state node reported | hp-font-mono, hp-font-ui, hp-graphite, hp-info, hp-ink, hp-line, hp-paper | — | $hp-font-mono, $hp-font-ui | 11, 14, 17, 19 |
| HP | HP/Commerce/MaterialCard | a0JpWr | Commerce/MaterialCard | Selected · price updates | hp-font-ui, hp-graphite, hp-ink, hp-paper | — | $hp-font-ui | 14, 17 |
| HP | HP/Commerce/MOQLeadRow | nKReS | Commerce/MOQLeadRow | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line | — | $hp-font-ui | 15 |
| HP | HP/Commerce/QuantityTiers | jVPYT | Commerce/QuantityTiers | No separate state node reported | hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-marigold, hp-paper, hp-success | — | $hp-font-mono, $hp-font-ui | 13, 16 |
| HP | HP/Commerce/ConfigSummary | P27gzo | Commerce/ConfigSummary | No separate state node reported | hp-accent, hp-bone, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line | — | $hp-font-mono, $hp-font-ui | 12, 14, 15, 22 |
| HP | HP/Commerce/PriceBreakdown | i4oRkW | Commerce/PriceBreakdown | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper, hp-success, hp-success-tint | — | $hp-font-ui | 12, 13, 15, 16, 22, 30 |
| HP | HP/Status/Chip | H4HsNd | Status/Chip | No separate state node reported | hp-font-ui, hp-success, hp-success-tint | — | $hp-font-ui | 13 |
| HP | HP/Status/AttentionCard | GYTKj | Status/AttentionCard | No separate state node reported | hp-accent, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-marigold, hp-paper, hp-warning | — | $hp-font-mono, $hp-font-ui | 12, 15, 22 |
| HP | HP/Status/SaveState | LYYta | Status/SaveState | Saving…, Saved just now | hp-error, hp-font-ui, hp-graphite, hp-success | — | $hp-font-ui | 14 |
| HP | HP/Status/Timeline | e4gGhp | Status/Timeline | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line, hp-line-strong, hp-marigold, hp-paper | #00000000 | $hp-font-ui | 13, 15 |
| HP | HP/Status/PaymentState | g6oz7s | Status/PaymentState | No separate state node reported | hp-bone, hp-font-ui, hp-graphite, hp-ink, hp-success, hp-success-tint, hp-warning, hp-warning-tint | — | $hp-font-ui | 13, 14, 22 |
| HP | HP/Status/ProofState | DpTeZ | Status/ProofState | No separate state node reported | hp-bone, hp-error, hp-error-tint, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper, hp-warning, hp-warning-tint | — | $hp-font-mono, $hp-font-ui | 13, 14 |
| HP | HP/Transaction/QuoteLineItem | knvNa | Transaction/QuoteLineItem | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line | — | $hp-font-ui | 13, 14, 16 |
| HP | HP/Transaction/PaymentSummary | uG8qI | Transaction/PaymentSummary | No separate state node reported | hp-bone, hp-font-ui, hp-ink, hp-line | — | $hp-font-ui | 15, 20, 34 |
| HP | HP/Transaction/ProofViewerChrome | vWgys | Transaction/ProofViewerChrome | No separate state node reported | hp-bone, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-ink-2, hp-line-strong, hp-marigold, hp-mid | #3A3833 | $hp-font-mono, $hp-font-ui | 12, 13 |
| HP | HP/Transaction/ShipmentCard | gb5jr | Transaction/ShipmentCard | No separate state node reported | hp-accent, hp-font-ui, hp-graphite, hp-info, hp-info-tint, hp-ink, hp-line, hp-paper | — | $hp-font-ui | 13, 14, 16 |
| HP | HP/B2B/TemplateCard | k5qXVr | B2B/TemplateCard | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper, hp-success, hp-success-tint | — | $hp-font-ui | 13, 15, 18 |
| HP | HP/B2B/AssetCard | lPZ3n | B2B/AssetCard | No separate state node reported | hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper, hp-success, hp-success-tint | — | $hp-font-mono, $hp-font-ui | 11, 13, 16, 18 |
| HP | HP/B2B/LockedField | B0xrD | B2B/LockedField | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-success, hp-success-tint | — | $hp-font-ui | 13, 15, 16 |
| HP | HP/B2B/OrganizationApprovalCard | c9FmWJ | B2B/OrganizationApprovalCard | No separate state node reported | hp-accent, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper, hp-warning, hp-warning-tint | — | $hp-font-mono, $hp-font-ui | 11, 13, 14, 15, 16, 22 |
| HP | HP/B2B/ParticipantCard | LHLCB | B2B/ParticipantCard | No separate state node reported | hp-bone, hp-error, hp-error-tint, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper, hp-sand, hp-success, hp-success-tint | — | $hp-font-mono, $hp-font-ui | 12, 13, 14, 15 |
| HP | HP/B2B/StoreProduct | RctrH | B2B/StoreProduct | No separate state node reported | hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-paper, hp-success | — | $hp-font-mono, $hp-font-ui | 11, 14, 15, 18 |
| HP | HP/Project/RecommendationCard | zSTlj | Project/RecommendationCard | No separate state node reported | hp-accent, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper | — | $hp-font-mono, $hp-font-ui | 11, 13, 14, 22 |
| HP | HP/Project/ProgressSteps | YS3sh | Project/ProgressSteps | No separate state node reported | hp-accent, hp-font-ui, hp-graphite, hp-ink, hp-line | — | $hp-font-ui | 13 |
| HP | HP/Search/SuggestionRow | XhgyP | Search/SuggestionRow | No separate state node reported | hp-font-ui, hp-graphite, hp-ink | — | $hp-font-ui | 15 |
| HP | HP/Search/ResultGroup | OQ0kg | Search/ResultGroup | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line | — | $hp-font-ui | 14, 22 |
| HP | HP/Filter/AppliedChip | mUO3Q | Filter/AppliedChip | No separate state node reported | hp-bone, hp-font-ui, hp-ink, hp-line | — | $hp-font-ui | 14 |
| HP | HP/Filter/GroupOption | Nx6Ge | Filter/GroupOption | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line-strong, hp-paper | — | $hp-font-ui | 14, 15 |
| HP | HP/Discovery/SubcategoryTile | THMrm | Discovery/SubcategoryTile | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper | — | $hp-font-ui | 13, 16 |
| HP | HP/Config/DimensionPreset | h3UJZo | Config/DimensionPreset | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line-strong, hp-paper | — | $hp-font-ui | 12, 14 |
| HP | HP/Config/CustomDimension | ada9w | Config/CustomDimension | No separate state node reported | hp-bone, hp-font-ui, hp-graphite, hp-ink | — | $hp-font-ui | 11, 14, 16, 18 |
| HP | HP/Commerce/QuantityLadder | x7SRZP | Commerce/QuantityLadder | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line, hp-mid, hp-paper | — | $hp-font-ui | 14, 15 |
| HP | HP/Commerce/AvailabilityState | I1I1S | Commerce/AvailabilityState | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-line-strong, hp-paper | — | $hp-font-ui | 13, 15 |
| HP | HP/Editorial/ArticleTOC/Item | uZYNP | Editorial/ArticleTOC/Item | No separate state node reported | hp-font-ui, hp-ink | — | $hp-font-ui | 15 |
| HP | HP/Editorial/FactBlock | RZZLU | Editorial/FactBlock | No separate state node reported | hp-bone, hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line | — | $hp-font-mono, $hp-font-ui | 11, 12, 15 |
| HP | HP/B2B/VersionRow | WTmSB | B2B/VersionRow | No separate state node reported | hp-font-mono, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper | — | $hp-font-mono, $hp-font-ui | 13, 14 |
| HP | HP/B2B/MemberRow | KoDh1 | B2B/MemberRow | No separate state node reported | hp-bone, hp-font-ui, hp-graphite, hp-ink, hp-line, hp-paper | — | $hp-font-ui | 13, 14, 15 |
| HP | HP/B2B/LocationRow | uw1TH | B2B/LocationRow | No separate state node reported | hp-font-ui, hp-graphite, hp-ink, hp-paper | — | $hp-font-ui | 13, 16 |
| HP | HP/B2B/ApprovalPolicy | MbiTV | B2B/ApprovalPolicy | No separate state node reported | hp-font-ui, hp-ink, hp-marigold-tint, hp-warning | — | $hp-font-ui | 14 |
| HP | HP/State/EmptyState | Ggpgx | State/EmptyState | No separate state node reported | hp-bone, hp-font-ui, hp-graphite, hp-ink, hp-line | — | $hp-font-ui | 14, 17 |
| HP | HP/State/RecoveryBanner | u8RMkZ | State/RecoveryBanner | No separate state node reported | hp-font-ui, hp-ink, hp-warning, hp-warning-tint | — | $hp-font-ui | 14 |

## Stage 4.4 additions

Added in the Stage 4.4 gap-coverage board (root `C9q8v3`, component sheet `XrBfy`). Every value is an existing `hp-*` variable or a value already used by an `HP/*` component (sizes 44/52 px controls, radii 4/6/10/18, type 12–40 px). No new variables were added, so `packages/ui/tokens/tokens.json` is unchanged.

| Library | Definition | Node ID | Purpose | States / variants | Pen variable tokens |
| --- | --- | --- | --- | --- | --- |
| HP | HP/Status/Chip/Neutral | NxrQc | Neutral status (DRAFT, EXPIRED, CLOSED…) | Label override | hp-bone, hp-ink, hp-font-ui |
| HP | HP/Status/Chip/Info | IrO7J | In-progress status (PENDING_REVIEW, IN_PRODUCTION…) | Label override | hp-info-tint, hp-info |
| HP | HP/Status/Chip/Warning | EKnmW | Needs attention (NEEDS_REVIEW, BALANCE_DUE, ON_HOLD…) | Label override | hp-warning-tint, hp-warning |
| HP | HP/Status/Chip/Error | fzrGk | Failure (FAILED, PAYMENT_FAILED, EXCEPTION…) | Label override | hp-error-tint, hp-error |
| HP | HP/Status/Chip/Accent | JPV3G | Customer action needed (READY quote, AWAITING_APPROVAL…) | Label override | hp-accent-tint, hp-accent-hover |
| HP | HP/Admin/NavItem | NRjCi | Admin sidebar item, 44 px | Default; selected (hp-ink-2 fill, 600 weight) | hp-ink-2, hp-bone, hp-mid, hp-paper |
| HP | HP/Admin/Sidebar | UrZdO | Admin navigation, grouped by work area | Items hidden per staff permission | hp-ink, hp-mid, hp-accent |
| HP | HP/Admin/TopBar | TM3g5 | Breadcrumb, global search, MFA recency badge, staff identity | Breadcrumb override | hp-paper, hp-line, hp-bone, hp-success-tint |
| HP | HP/Admin/FilterBar | m8A4M1 | List search, 3 filters, result count, clear | Filter labels override | hp-line-strong, hp-graphite, hp-accent |
| HP | HP/Admin/Pagination | dHGPq | Range text + page buttons, 44 px | Current page ink | hp-ink, hp-line |
| HP | HP/Admin/RecordHeader | XyKrP | Reference, title, status chip, meta, actions | — | hp-graphite, hp-ink |
| HP | HP/Admin/AuditEntry | AwwuQ | Audit/history row: action, detail, actor · permission · time · request ID | — | hp-bone, hp-graphite |
| HP | HP/Admin/QueueCard | y3m1IT | Operations home queue with count, aging and link | — | hp-paper, hp-line, hp-accent |
| HP | HP/Admin/DecisionBar | zldcj | Required decision note + negative/positive decision | — | hp-line, hp-line-strong |
| HP | HP/Admin/StepUpMFA | UomN9 | High-risk confirmation with 15-minute MFA check (TECH-03 §9) | Action summary override | hp-ink, hp-bone, hp-line-strong |
| HP | HP/Form/OTPInput | VA4qq | 6-digit code for email code and MFA | Help text override (error) | hp-line-strong, hp-paper |
| HP | HP/Form/Toggle | v65MY | Setting switch with On/Off text (not colour alone) | On (hp-success), off (hp-line-strong) | hp-success, hp-line-strong, hp-graphite |
| HP | HP/Form/PasswordInput | rwjJo | Password field with 44 px Show control | — | hp-line-strong, hp-paper |
| HP | HP/State/PermissionDenied | f9NZj | 403 inside admin or workspace | Body names the missing permission | hp-bone, hp-graphite |
| HP | HP/State/ErrorState | VZVCx | Load failure with retry and request ID | — | hp-error-tint, hp-error |
| HP | HP/State/Skeleton | ZgD4w | Loading placeholder with text label for screen readers | — | hp-sand, hp-bone |

## Extraction limits

The `get_style` tool returned generic style archetypes, not named styles attached to this design file. The component inventory uses node data from Pen MCP. No CSS breakpoint thresholds, complete line-height scale, complete letter-spacing scale, dark-mode set, or current Signal shadow scale was exposed. Do not fill those gaps with guessed values.

Some earlier `WF/*` and `HF/*` nodes use literal colors and fonts. Keep those as historical/source evidence; do not treat them as current Signal values. Use the component's Pen frame before building a state that is not listed above.

