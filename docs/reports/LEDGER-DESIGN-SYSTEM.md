# Workshop Ledger design system (no ticket)

**Status:** IN REVIEW · **Branch:** `feature/ledger-design-system` (from `dev`) · **Date:** 1 October 2026

## What the owner asked for

Bring the design system from the owner's design canvas (claude.ai artifact `QAkhvXN2eBJJBt5QoaZvbh`) into the Pen file, including the new homepage with its header, footer and brand logo, and the canvas's motion. Research site interactions and motion that people like and add to them. Owner decisions (1 October 2026):

- Pen: add a `ledger` value to the `hp-direction` theme axis, switch the active board to it, restyle the `HP/*` shapes and add new frames. Signal stays on file.
- Scope: Pen and design docs first, then code (tokens, fonts, header, footer, homepage, motion) on a new branch.
- Motion: the canvas set, commerce feedback, page transitions, and header/loading motion.
- Logo: use the canvas's vector redraw until the master file arrives.

## Pen (untitled.pen)

- **Variables.** `ledger` added to `hp-direction` for every themed `hp-*` variable, with the canvas's exact values. Previously unthemed status colours and radii are now themed, so Signal keeps its old values. New variables: `hp-brand`, `hp-brand-hover`, `hp-brand-deep`, `hp-brand-tint`, `hp-brand-mid`, `hp-text-3`, `hp-on-brand-2`, `hp-on-deep-2`, `hp-on-sun-2`, `hp-cat-coral`, `hp-cat-sage`, `hp-cat-lilac`, `hp-r-pill`, `hp-r-tag`, `hp-r-button`, `hp-r-hero` and `hp-r-band`.
- **Active theme.** `C9q8v3` (Application map) and `b3vRp` (file map) now use `ledger`. The archive zone (`P8kmN6`) stays on Signal.
- **Components.** 135 corner radii across `HP/*` were changed to tokens:
  - buttons → `hp-r-button`
  - inputs → `hp-r-control`
  - cards → `hp-r-card`
  - panels → `hp-r-panel`
  - tags → `hp-r-tag`
- **Rebuilt in place.** `HP/Nav/Header` (`nO6TF`), `HP/Nav/MobileHeader` (`ED2Si`) and `HP/Nav/Footer` (`F64bQ`). `HP/Nav/UtilityStrip` (`BoplJ`) is disabled.
- **New components** (`sNAL0`): `HP/Brand/Mark`, `HP/Brand/Lockup`, `HP/Brand/Logo` (210), `HP/Brand/Logo/130`, `HP/Brand/Stamp`, `HP/Brand/WovenStrip`, `HP/Nav/MobileFooter` and `HP/Button/Brand`. `HP/Ledger/TicketCard` is in Foundations.
- **New board `MW5h2`** (Stage 4.3):
  - homepage desktop 1440 `ZqhyZ`
  - homepage mobile 390 `Y0ftk8`
  - Brand `YI1UU`
  - Foundations `k1aon`
  - Components `BfHwp`
  - Motion `nGctt`
- **Photos.** The canvas's 18 stand-in photos are in `holypeals-design/ledger/`.
- **Fidelity to the canvas.** Each Pen frame was compared with a local render of the canvas source at the same width. Desktop section heights match within 10 px. The mobile hero is 775 px in Pen against 734 px in the canvas: the canvas's fixed 8200 px root shrinks its overflow-hidden hero and clips the swatches, and Pen keeps the intended height. The same squeeze shortens the canvas's mobile CTA photo and buttons (182 / 48 px against 200 / 52 px).
- **Pen limits.** The logo's curved wordmark can't use text-on-path in Pen, so each letter is placed and rotated along the same Bézier. Open Sans Bold advances are approximated. Dashed lines are drawn as rows of dashes, since Pen has no stroke dash.

## Code

- **Tokens.**
  - `packages/ui/tokens/tokens.json` now carries the Pen variables with `activeTheme: ledger` and updated documented specs (type, radii, layout 80/1280/20, motion).
  - `build-tokens.mjs` now uses the Ledger fonts and adds motion tokens (`hp-motion-press`, `hp-ease-ui`) and `hp-layout-gutter`.
  - `inferred-tokens.css` gains a Ledger block: exact homepage type sizes, logo sizes, shadows, the woven strip and motion durations.
  - `pen-scale.css` gains 8 exact sizes.
- **Fonts.** Geist is replaced through `next/font/google` with Young Serif, Instrument Sans, IBM Plex Mono, and Open Sans 700 for the wordmark only.
- **Logo.** `components/site/Logo.tsx` adds the mark, the header lockup, and the full logo with a real SVG `textPath`, in colour, reversed and ink tones.
- **Header.**
  - Ledger lockup, graphite labels with a drawn underline, chevrons on menu items, a pill search, round icon buttons and a Brick 10 px Start a Project.
  - The Sun reading-progress line is driven by a scroll timeline.
  - The header is sticky and hides on scroll down. The utility strip is removed.
- **Footer.** Woven strip, full logo, Blue Deep call-to-action panel, four link columns, a bottom bar with a back-to-top button, the giant wordmark, mobile accordions and a "Photo credits" link.
- **Homepage.** `app/page.tsx` is rebuilt as one responsive page (desktop from 1024 px). It uses `HeroSearch` (the rotating example placeholder) and `PoloPicker`.
- **Photo credits page.** `/photo-credits` lists the Creative Commons credits (noindex).
- **Motion** (`packages/ui/src/styles/motion.css`, `Motion.tsx`, `home.module.css`):
  - from the canvas: marquee, floating swatches, scroll parallax, stamp spin, stitch underline, thread clip-reveal, card lift and zoom, arrow nudge, press scale, accordion turn, polo colour cross-fade
  - new: cross-document View Transitions with the product card photo morphing into the product gallery; hide-on-scroll header; skeleton shimmer (`data-skeleton` on PageState bars); a check on fields that are filled in correctly
  - all of it is off with `prefers-reduced-motion`
- **Icons.** Lucide at a 1.6 px stroke (Foundations · icons), with `arrow-up`, `list`, `tag`, `circle-check` and `truck` added.

## Owner review, 1 October 2026

- **Header.** The logo and nav sit together on the left (32 px apart, plus the items' 10 px padding); the actions stay on the right. The Pen header groups them the same way (48 px).
- **Underlines reduced.**
  - Removed the hover underline from the header nav items (it ran under the chevron and padding), the mega-menu lists (now a Holy Blue colour change) and product card titles (the photo zoom is the hover).
  - Every remaining drawn underline is `width: fit-content`, so it stops at the end of the text. Block links such as "View all products →" no longer underline the whole column.
  - The faint resting underline on plain inline links in body copy stays, so links remain distinguishable from text.
- **Our work.**
  - "See all projects" sat off-centre because `.deskOnly` used `display: revert`, which turned the button back into an inline link. `.deskOnly` and `.mobOnly` now only hide, so components keep their own display.
  - The rail is a size container with a `--work-edge` margin on both sides, so it starts on the left content edge and, scrolled to the end, the last card lines up with the right content edge (1345 px at 1440; 359 px at 375).
- **Hero swatches.** On load each swatch flies in from the nearest screen edge (left ones from the left, right ones from the right, the middle phone swatch from below), staggered 80 ms, over 1.3 s with the enter easing, then starts its float. New tokens `--hp-motion-swatch-in` and `--hp-swatch-in-tilt`. Off with reduced motion.
- **Tests.** Added a check that the rail ends on the content edge and the button isn't inline (375 and 1440). Storefront, interactions and design-system specs: 95 passed, 9 skipped.

## Research behind the added motion

- NN/g timing guidance: about 100 ms reads as instant, and anything past roughly 400 ms feels slow. Hover and press feedback stay at 120–200 ms, and only entrances and ambient loops run longer. Sources: [Val Head](https://valhead.com/?p=2978), [Fronteers](https://www.fronteers.nl/en/blog/2024/12/microanimations).
- Add-to-cart confirmation (button to check, count bump, drawer) running alongside the request in under 400 ms; reported to lift add-to-cart and cut abandonment. Sources: [Xictron](https://www.xictron.com/en/blog/micro-interactions-ecommerce-ux-conversion-2026/), [Wildnet Edge](https://www.wildnetedge.com/blogs/enhancing-e-commerce-ux-microinteractions-for-better-engagement).
- Cross-document View Transitions (`@view-transition { navigation: auto }`) for a thumbnail-to-product image morph; supported in Chrome and Edge 126+ and Safari 18.2+. Source: [Chrome for Developers](https://developer.chrome.com/docs/web-platform/view-transitions).

## Conflicts and deviations (recorded, not silent)

1. **Main navigation (owner decision).** PUB-FR-003 lists Products, Projects, Apparel, Print & Display, Our Work and Resources. The canvas header shows Products, Projects, Our Work and Help.
   - First pass kept the six PRD items. On 1 October 2026 the owner chose the canvas's four, because Apparel and Print & Display are already linked from the Products mega-menu.
   - The site now shows Products, Projects, Our Work and Help. Help goes to the buying guides (`/resources`).
   - With four items, the search pill is back to the canvas's 300 px and shows with the main nav from 1280 px; below that, the search icon and menu button.
   - Projects keeps its existing menu (code only; the Pen header shows a chevron on Products alone).
   - **Proposed PRD change (not edited here):** amend PUB-FR-003 to "Products, Projects, Our Work and Help; Apparel and Print & Display are reached from the Products mega-menu."
2. **Header cart icon.** The canvas shows a cart. The cart ships with T04-01 (PR #36, not merged into `dev`), so the code keeps "Track an order" in that slot for now. Swap it for the cart once T04-01 lands.
3. **Unsourced prices and colours.**
   - "Tees from ₦7,500" has no catalogue source and is replaced by "Tees, hoodies and caps". "Polos from ₦8,500" is the seeded polo price.
   - The polo picker uses the catalogue polo colours (Navy, Black, White, Olive, Wine, Royal). The canvas's Maroon, Bottle green and Sun yellow are not offered.
4. **Placeholders not shipped.**
   - The footer's [BUSINESS ADDRESS], [PHONE] and [EMAIL] are omitted, as are the social icons (no real URLs).
   - "Our work" cards read "Concept reference" instead of "[Client project]". No client is named or claimed.
   - The newsletter field stays a "coming soon" notice (no mailing list, as before).
5. **Mobile "Three ways to order".** The canvas's mobile third card is "Quote needed / Request a quote" and its second card reads "Price updates as you choose", while desktop shows "Let's talk / Start a project". The site uses the desktop set at both widths, so the same page doesn't change its offer at different widths.
6. **Buttons: 10 px or pill.** Foundations says pill. The later Home, Motion and Product boards use 10 px. The later boards win (`hp-r-button` 10).
7. **`hp-mid`.** Existing pages use `hp-mid` as light grey text on dark surfaces. The canvas defines no Ledger value for that role.
   - `hp-mid` is set to `#B5AFA3`, derived from Signal's `#B4B4BB`.
   - A new `hp-text-3` carries Ink 3 `#6B6456` for captions.
   - New Pen frames and new CSS use `hp-text-3`.
8. **Decorative text.** The giant footer wordmark and the "Made & checked" stamp words are drawn with CSS `content`, so screen readers and contrast checks skip them. The Sun stamp text on Holy Blue is about 3.6:1, which passes only as decoration.
9. **Field-valid tick.** The check icon is a data-URI SVG with the success colour (`#2E6B3F`) written in, because a CSS variable can't reach inside a data URI.
10. **Hero swatch coordinates.** The canvas frame's exact pixel positions are kept as local custom properties on each `.swatchN` class, not global tokens.
11. **Motion from the Pen 09 spec.** As before (DESIGN-FIDELITY.md, difference 17), the site's motion follows the owner's choice. That choice is now the Ledger Motion board, which keeps the 700 ms / 24 px reveal.

## Not in this pass (suggestions)

- Ledger restyle of the Directory, category hubs, search states, and the Business Cards and Polo product pages, which are already designed in the owner canvas (F01/F02 boards). They currently pick up Ledger colour and type through tokens but keep Signal layouts.
- Add-to-cart confirmation, upload thread, proof-approved stamp, directional configurator steps and the tracking stitch fill. These are designed on the Motion board and belong with T04-01 (cart), the configurator and proof/tracking tickets.
- Replace the stand-in photography with the Holypearls shoot. Until then, the BY and BY-SA licences need the `/photo-credits` page.
- Swap the vector redraw for the master logo file when it arrives.
- Account and admin shells (`packages/ui/src/shells`) still use the pearl-dot wordmark.
- Re-export the Stage 4.2 PDF if a Ledger PDF is needed.

## Tests

- `tsc --noEmit` (web, ui), ESLint and `tokens:check`: pass.
- `next build`: pass.
- Playwright, `storefront.spec.ts` and `interactions.spec.ts`, on 375 and 1440: 38 passed, 8 skipped (viewport-specific).
  - Added: the main nav shows the four Ledger items and Help goes to `/resources` (1440).
  - Updated: the home h1 and the three-click path (now tile → category → product), and the mega-menu hover threshold (1280).
  - Added: PUB-FR-001/002 home routes, the polo picker state and accessible name, and reduced motion stopping the marquee.
  - The first run caught colour-contrast regressions from the token change (`hp-mid` on dark, the footer wordmark and the stamp). All are fixed, as above.
- Full suite: see the PR.
- Visual: the live homepage was screenshotted at 1440 and 375 and compared with Pen `ZqhyZ` / `Y0ftk8`. Desktop section heights are within about 10 px. The remaining differences are items 1–5 above.

## Follow-ups to docs outside `docs/design`

- PRD-01 PUB-FR-003 (navigation items): amend to the four items, as in item 1.
- TECH or ADR: record Workshop Ledger as the active visual direction, superseding the Signal visual lock (Stage 4.2 `lyo0w`).
