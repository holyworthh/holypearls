# HolyPearls — Stage 4.2 Full High-Fidelity System Review (Claude run)

**Date:** 27 Sep 2026
**Board:** `untitled.pen`, frame "STAGE 4.2 — FULL HIGH-FIDELITY SYSTEM EXPANSION" (id B1jjw), theme `hp-direction: signal`
**PDF:** `HolyPearls — Stage 4.2 Full High-Fidelity System Board.pdf` (87 pages, 27 MB)

## 1. Board / PDF
The board has 86 sections across 13 gates, plus section 12B (the Event Branding project page). The PDF has one section per page, in board order.

## 2. Coverage summary
- The Page Archetype & Coverage Matrix has 314 rows: 314 mapped and 0 unmapped. All rows are DesktopHF = YES, MobileHF = YES and LAUNCH.
- 7 pages are seed anchors carried from 4.1. The other 307 are covered by a proven archetype.
- Product pages: all 9 families are proven with 25 new pages, each with family-specific configuration and content.
- Private flows: 19 designed, covering company accounts, approvals, group size collection, CSV import, participant variants and the company store.
- Transactional flows cover:
  - a mobile configurator;
  - a cart that keeps payable items separate from items needing a quote;
  - guest checkout with failed, processing and success states;
  - quotes: mobile, expired and reapproval needed;
  - proofs: mobile and version history;
  - order tracking: complex, simple and guest (including secure-link states).

## 3. New component summary
- There are 17 new `HP/*` reusable components, shown with their states in section 80. These cover:
  - search and autocomplete;
  - filter chips and sheets;
  - a secure-link state card and error-state panel;
  - size-collection rows and an import-mapping row;
  - approval items and a participant card;
  - a store tile, version-history row and tracking step;
  - article and case-study blocks.
- These existing components were extended: PriceState (11 price and availability states), QuantityTiers, ChoiceCard and AssetCard.
- Focus-ring demos were added on paper, dark and red surfaces.

## 4. Responsive summary
Every archetype has a desktop (1440) and a mobile (390) version. Section 79 documents the breakpoint rules:
- the sticky mobile price and CTA bar;
- filters moving into a bottom sheet;
- the configurator stacking;
- the Workspace sidebar becoming a bottom tab bar;
- tables becoming cards.

## 5. Asset-gap changes
- **Real assets:** 0 (there is still no shoot plan; see *Photography & Shoot Plan (deferred)*).
- **Generated placeholders:** 52 files, used 310 times, labelled GENERATED PLACEHOLDER.
- **Stock references:** 15 Unsplash images, used 74 times, labelled STOCK REFERENCE. They replace AI generation, which failed partway through. They must be replaced before launch.
- **Wordmark and signature device:** still open (see the *Brand Asset Brief*).

## 6. QA results
- **Blocker:** 30 of 30 pass.
- **Major:** 23 of 23 pass.
- **Minor:** 2 of 2 pass. Filter chips are 36px, which is documented as accepted for desktop only; mobile chips are 44px.
- **Automated checks:**
  - clipped text: 0;
  - warm literal colours: 0 on either the 4.2 or the 4.1 board;
  - text under 11px: 0 (140 instances were raised to 11px).
- **Contrast:** ink on paper is 19.5:1 and red on paper is 5.0:1.
- **Caveat:** the tally is Claude's own review plus automated checks, not an independent audit. Roughly two-thirds of screens were spot-checked visually by screenshot.

## 7. Deviations
- **D1 Palette:** the brief describes warm ivory and orange. Signal was used, under the brief's rule that the 4.1 board wins every visual conflict.
- **D2 Section 12B added:** so that the project-detail archetype (13 pages) is proven.
- **D3 Stock references:** 15 stock images are used in place of AI images.
- **D4 Test values:** all prices, minimums, lead times, VAT and the Lagos delivery charge come from the Stage 1.4 seed data and 3.1x fixtures, labelled TEST DATA. Nothing is invented.
- **D5 Deposit conflict:** Stage 1.4 says 70/30 and the Stage 3.1E fixture says 60/40. Both are shown and flagged.

**Owner decisions (27 Sep 2026), now applied on the board (section 86, "Owner decisions" panel):**
- **Deposit:** 65% to start, 35% before dispatch. This supersedes D5. All amounts are updated: ₦552,500 deposit and ₦297,500 balance on the ₦850,000 fixture, on both the 4.1 and 4.2 boards.
- **Payments:**
  - Nigeria: Paystack is primary, with Bachs HQ as the fallback.
  - International: Stripe card, Apple Pay, Google Pay and PayPal.
  - See *Payment Routing & Audit (decision).md*.
- **Guest links:**
  - sign-in links last 15 minutes and are single use;
  - quote and proof links last 14 days;
  - tracking links last until 30 days after delivery;
  - any expired link can be re-sent.
- **Group orders:** the employer pays for all staff items, and delivery goes to the employer. The participant-pays and individual-delivery variants (section 74 C/D) are marked RETIRED.
- **Reapproval:** a quote can rise up to 10% above the approved amount. Anything above 10% needs reapproval.

No frozen architecture was changed.

## 8. Final status
STAGE 4.2 — FULL HIGH-FIDELITY SYSTEM COVERAGE READY FOR REVIEW / NO BLOCKER OR MAJOR DESIGN-SYSTEM GAP REMAINS.

*(Remaining non-blocking work: the final visual sweep of the remaining third of screens, and replacing the stock and placeholder imagery.)*
