# Storefront design fidelity (fix for T02-03, T03-03, T03-05, T03-08)

Status: DONE (pending CI and merge).

Branch: `fix/t02-03-storefront-design-fidelity`.

## Why

The owner found the live site "looks nothing like the design". Earlier tickets built pages from the PRD with a loose reading of the Pen frames, and listed differences instead of matching. Every public screen built so far is now rebuilt from the Pen frames themselves.

## How it was done

- Each frame was exported from Pen as **html-css** (`Export([...], "html-css")`), which gives the frame's real CSS.
- A converter turned each export into a component outline and a stylesheet:
  - every colour maps to its token (`--hp-ink`, `--hp-accent`, …)
  - every pixel value maps to a `--hp-space-*` token, or to a new exact-value token
- The **138 exact Pen sizes** the space scale lacked are in `packages/ui/src/styles/pen-scale.css` (`--hp-size-106` and so on). No page uses a raw pixel or hex value. One new colour token: `--hp-footer-rule` (#3A3833).
- Pages were rebuilt from those values. Each was then compared side by side with its Pen frame (full-page screenshots at 1440 and 390, stitched Pen | site) and corrected until they matched.
- **Icons:** Pen uses Lucide by name, so the site now uses `lucide-react` through `components/pen/Icon.tsx`.
- **Reference photography:** the labelled reference photos from the Pen board ("temporary reference imagery", as the design itself captions them) are in `apps/web/public/pen/` as WebP, 2.1 MB in total. Products still show their own catalogue images.
- **Desktop and mobile:** where the frames differ in structure, not just size, the page renders a desktop tree (from 1024 px) and a mobile tree, each from its own frame. Large display type scales with the viewport below 1440 px.

## Screens rebuilt

| Screen | Pen frames | Result |
| :---- | :---- | :---- |
| Header, utility strip | HP/Nav/Header, MobileHeader (R7yPPS) | Spacing to Pen: 30 px nav rhythm, no chevrons, 18 px action gaps. Mobile: 59.5 px bar, 22 px wordmark, search and menu buttons. |
| Footer | HP/Nav/Footer; Pen 16 accordion | Rebuilt: brand column with newsletter field, four link columns, legal row; mobile accordion. |
| Homepage | 15 · FYNoI, 16 · kZf2b | All 10 sections: hero with search and popular chips, "What do you need?", category index, most ordered, Source/Make/Brand/Deliver, event story, how ordering works, how it's made, reorder-in-minutes, final search. |
| Product directory | 17 · bhA8B, 06 · r2L62s | Bone page, big search, category tabs, filter rail with square checkboxes, feature card with panel, compact rows, "Can't find it?" interrupt, pagination. Mobile: category chips, sticky Filter/Sort bar with a filter sheet, two-up grid. |
| Category hubs | 18 · jUd9y (editorial), 11 · YBK8S (catalogue) | Two layouts from the same hub sections. Apparel and Embroidery use the editorial one (hero collage, subcategory photos, dark "Choose how it's made", comparison table with thumbnails, projects + guides). Others use the catalogue one (header with category cards, format table, split production band, related rows and FAQ). |
| Product page | 21 · VSjt2 | Bone band, tall gallery with proof caption and three thumbnails, 48 px title and state chip, numbered compact steps (two-line cards), quantity cards with a "More" card, icon artwork cards, outlined total box with "Add to bag". |
| Garment product page | 19 · V3j7CP, 20 · XX8rq | Second pass against both frames. Desktop: six-image gallery with zoom, Pen copy, eight colour swatches with "colour range confirmed per route", icon fact rows, "Compare routes" (links to the hub's comparison), route timing, quantity bands worded as Pen ("Standard minimum 10", "e.g. 50 → est. …", "Live estimate", "Production review"), spec table, questions, and "Complete the uniform" (Apron, Baseball Cap, Event Badges, Individual bagging). Phone: full-bleed swipe gallery with position dots, icon chips, six swatches then "+2", "Configure yours" before the routes, two-line route cards, five accordions, and a sticky Configure bar that appears only after the in-page button scrolls away. |
| Garment configurator | 22 · O2tORo, 40 · PeLav | New route `/products/[slug]/configure`. Own header with the six-step stepper, "Draft saved", "Save & exit". One step at a time beside the preview; "Step 2 of 6 · Customize" and "Place your logo."; live estimate card with "Estimate updated"; Back / "Continue to quantity". |

## Data added so the design can be filled

- **Card prices** (`PublicProductCard.price`, `.moq`): the current list price, basis, pack size and state, so cards show "From ₦8,500 / piece · Min 10" and "₦15,000 / 100". Written test-first (`storefront.test.ts`, "card prices").
- **Hub content seed** (`packages/testkit/src/seed/hubs.ts`): the Apparel and Print hubs published with the Pen copy (routes, comparison, guides, formats, FAQ). This only fills a hub that has never been saved; staff can change all of it in the hub editor.

## API changes so the design has its data (second pass)

The polo page looked wrong mainly because its data was thin, not because the page couldn't show it. Each field Pen 19 and 20 show now has a place in the API and the seed:

| Pen shows | Where it comes from |
| :---- | :---- |
| Colour swatches | **New:** `product_option_values.swatch` (#RRGGBB, checked by the database), returned as `configurator.options[].values[].swatch`. It replaces the colour table hard-coded in the page. Migration `0017_option_value_swatch`. |
| Six gallery images | Product media (up to six are shown). The seed now gives the polo Pen's six photos. |
| Four quantity bands (10, 50, 100, 200+) | Price tiers. The configurator now returns up to **four** quantity presets (was three). |
| Fabric / Fit / Sizes / Proof | Product specifications. |
| Three questions | Product FAQs. |
| "Complete the uniform" | Product relations; four new seed products with Pen's photos and prices ("Individual bagging" has no list price, so it reads "Priced in quote"). |

Seeding is now additive: products new to the seed, missing option values, swatches, specifications, FAQs, relations and gallery images are added to an existing database without touching staff edits.

## Tests

- **API:** card prices test, written first. "Garment product page data (Pen 19)", written first: summary, eight swatched colours, specifications, questions, four bands and the uniform set. `storefront.test.ts` 12/12 pass; the directory and hub tests were updated for the four new products (the hub test now uses Bags & Packaging, since Apparel has seeded hub content).
- **Browser:**
  - `garment.spec.ts` rewritten for the new flow: product page → "Configure yours" with the colour and route kept; stepped configurator with the conflict fix and sized pricing; customer-supplied with unknown sizes
  - configurator and families specs open the "More" quantity card before typing a quantity
  - the polo page shows "Complete the uniform"; on a phone the Configure bar appears only after scrolling and the Quantity bands accordion opens
- **Local runs beside a dev server:** `playwright.config.ts` takes `E2E_API_PORT`. Build the web app with `API_URL` on that port, so tests run while `pnpm dev` holds 3001.

## Differences that remain (and why)

1. **Content is catalogue data.** Category and option names come from the database ("Apparel & Garment Production", "350gsm matte"), so they differ from Pen's shorter labels ("Apparel & garment production", "Standard Matte"). The Pen names can be set in admin. Counts ("304 products") are real (10 in test data).
2. **Option images** (Pen 21 paper cards with photos): options have no image field yet. The cards show the name and second line only. **Needed:** an image per option value (admin), a small follow-up.
3. **Dark "Choose your card stock" band** (Pen 21): it needs paper-stock content per product, which doesn't exist. Not built.
4. **Garment preview:** the front now shows the chosen colour's photo with tappable placement zones and a marigold box around each chosen placement, as in Pen 22. Only navy has a reference photo, so other colours and the back view keep the outline, filled with the colour's swatch. Photos per colour need an image per option value (the follow-up in item 2). Pen's Detail view, zoom and reset controls, logo-size choice and thread colours ("Matched from your file") are not built (T03-05 note).
5. **Filter groups** (Pen 17: How it's made, Price, Quantity, Decoration, Needed by): the API filters by buying mode and product type only, so the rail shows those two groups in Pen's style. **Needed:** product attributes for sourcing and decoration to filter by (catalogue ticket).
6. **Delivery, timing and Review steps** on the product page (T03-08, PRD COM-FR-070–072) are not in Pen 21. The PRD wins; they use Pen's card and step styles.
7. **"Add to bag"** is shown but disabled until checkout exists (T04-01). **Bag icon** in the header: left out until the cart exists.
8. **Newsletter:** there's no mailing list, so the form says "Email updates start soon" and saves nothing.
9. **"Read the full guide →", "Compare routes", "Feel guide ↗", zoom buttons:** no destinations yet; left out.
10. **Legal line:** Pen's "PROVISIONAL IDENTITY · TEST CONTENT" is a design annotation; the site shows "© 2026 HOLYPEARLS".
14. **Contrast over design:** Pen's "Not sure yet?" (#FDE8E3 on the accent band) is 3.9:1, below WCAG AA; it's paper-white on the site.
16. **Applied filters on phones:** Pen 06 doesn't show them, but without them a phone user can't remove a filter, so the chips show above the results (the sort stays in the sticky bar).
15. **Product card price rows** wrap onto a second line in the two-up phone grid when a price and its minimum don't fit, instead of overflowing.
12. **Polo gallery caption:** Pen's "NAVY · LEFT-CHEST EMBROIDERY · TEMP REFERENCE" labels a reference photo; the site keeps "COLOUR AND LOGO CONFIRMED IN YOUR PROOF", which is true for every order.
13. **Related card SKU:** Pen's "Print or embroidery · HP-APP-050" shows the SKU, but public cards don't expose SKUs (PUB-FR-008 test), so the card shows the qualifier only.
11. **Product pages below the fold** keep About, Specifications and Questions (PRD COM-FR-004). Pen 21 has no place for them, so they sit in a compact three-column band. The generic "How it works" block was removed (not in Pen).

## Process change

Design fidelity is now part of the definition of done: build from the Pen html-css export, then compare screenshots side by side at 1440 and 390 before a ticket is done (memory: design-fidelity).
