# HolyPearls — Stage 4.1 High-Fidelity System Review

Status: **Ready for high-fidelity system review**. The editable Stage 4.1 board is in `C:\Users\ASUS\Desktop\design\holypeals-design\untitled.pen`, in a separate area after the frozen Stage 3 boards. Its 36 named sections include the visual system, reusable primitives, 18 anchor groups, responsive notes, accessibility notes, and the asset gap register.

This stage sets a provisional visual identity. It does not change the frozen Stage 3.1A–F architecture. All example prices, dates, organization names and record numbers are test data.

## Visual direction

**The Production Studio** is the foundation. Warm paper surfaces, dark ink type, material photography, clear rules and practical actions make physical production visible. The Graphic Print Lab adds small moments of energy in campaign and Project content. The Refined B2B Studio gives Workspace and transaction screens a tighter information rhythm. All three use the same type, ink, action accent and components.

The direction keeps search, Start a Project, price state, proof decisions and payment actions clear. It avoids a generic print-shop look, a blue SaaS palette, heavy shadows, glass effects, decorative gradients and a grid of equal cards on every page.

## Provisional tokens

These exact choices are **provisional until HolyPearls supplies approved brand identity**. RGB values use 0–255. Contrast ratios are for text on Paper `#FFFCF7`, except where noted.

| Token | Hex | RGB | Use / contrast |
| --- | --- | --- | --- |
| Canvas / Bone | `#F4F0E8` | 244, 240, 232 | Warm page background. Ink on Bone: 13.78:1. |
| Paper | `#FFFCF7` | 255, 252, 247 | Card and input surface. |
| Ink | `#222420` | 34, 36, 32 | Primary text; 15.30:1 on Paper. Also the dark utility surface. |
| Graphite | `#5C625C` | 92, 98, 92 | Secondary text; 6.11:1. |
| Border | `#D5D0C7` | 213, 208, 199 | One-pixel rule. Never the only state cue. |
| Brand Accent | `#A03F2B` | 160, 63, 43 | Primary action, focus and active link; 6.33:1 on Paper; white on Accent: 6.48:1. |
| Accent Hover | `#7E3021` | 126, 48, 33 | Hover/pressed action; white text: 9.01:1. |
| Success | `#176B51` | 23, 107, 81 | Success state with written label; 6.30:1. |
| Warning | `#805113` | 128, 81, 19 | Attention state with written label; 6.61:1. |
| Error | `#A02F2F` | 160, 47, 47 | Error state with message/recovery; 6.97:1. |
| Info | `#315C7D` | 49, 92, 125 | Informational state; 6.94:1. |

Dark use pairs Paper or Bone text with Ink surfaces. The dark treatment is limited to feature panels, the Workspace sidebar and selected editorial moments. The accent remains the action color. Production colors can appear in photography and Project work, but they do not become permanent category codes.

## Type, grid and shape

- **Instrument Sans** is the primary face at weights 400, 500, 600 and 700. It covers display and UI. **IBM Plex Mono** is reserved for record references, dimensions and production metadata. Both are usable open-source families. The final font decision needs brand approval.
- Desktop public scale: Display XL 80; H1 64; H2 48; H3 34; H4 26; Body Large 20; Body 16; Support and Label 14; noncritical Meta 12–13 pixels. Mobile: hero 48, H1 40, H2 30, H3 24, body 16, support 14. Workspace: H1 36, H2 27, body 16.
- Desktop target: 1440px, 56px outer gutters, 1328px content, 12-column public grid. Mobile target: 390px, 20px gutters, conceptual four-column grid, 44px minimum touch target. Workspace uses a role-aware sidebar and flexible main area.
- Spacing tokens: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128 pixels. Control radius: 6px; card radius: 10px; large panel radius: 18px. Borders are one warm pixel. Shadows are reserved for overlays.
- Icons use restrained Lucide line shapes at 20–24px. Consequential actions always include text.

## Motion rules

| Tier | Duration | Use |
| --- | --- | --- |
| Utility | 120–200ms | Hover, focus, menu/dropdown, chip, status. Default 160–180ms. |
| Content | 250–450ms | Filter drawer, accordion, product image swap, price/preview update. Default 320ms. |
| Editorial | 500–900ms | Selected hero, process and section reveal. Default 650ms. |

The **Production Reveal** is a directional material pass inspired by fabric or print moving through production. It is limited to hero and selected process/editorial media. It is never used on forms, checkout, proof approval or Workspace tables. Entry easing: `cubic-bezier(.2,.8,.2,1)`; exit easing: `cubic-bezier(.4,0,1,1)`. Reduced motion shows final content immediately and keeps focus, loading and state changes visible. No scroll-jacking is part of this system.

## Component foundation

The board contains reusable sources for desktop navigation, mega-menu, mobile menu, search, Workspace sidebar, primary/secondary/tertiary/destructive actions, an icon action, and a mobile sticky CTA. The action samples show default, hover, pressed, focus and disabled behavior. Form sources cover input, select, radio, checkbox, choice, quantity, size, date, upload, search, error and help. A separate form-state row shows focused, disabled, error and selected controls. Commerce sources cover product/material cards, price states, MOQ/lead time, tiers, summary, breakdown and Project recommendations. Transaction sources cover attention, timeline, save, payment, proof, order, quote item, payment summary, proof viewer, shipment and recovery. B2B sources cover asset, template, locked field, approval, participant and Store product.

The anchors use these shared forms and visual rules. State labels continue to carry the exact Stage 3 meanings. In particular, Quote acceptance, deposit and balance are separate; Badge Proof V2 awaits approval; Backdrop remains `READY — AWAITING RELEASE` until the balance clears; a Group submission is not yet an Order.

## Anchor inventory

| Group | Composition |
| --- | --- |
| 01 Homepage desktop | 1440px editorial page with production hero, intent search, outcomes, categories, products, Source/Make/Brand/Deliver, Event case, process, repeat business and final action. |
| 02 Homepage mobile | Independent 390px order with search and Project entry in the first viewport, then the same content hierarchy in stacked form. |
| 03 Product Directory | 1440px search, filters, image-led products and clear price states. |
| 04 Apparel Category | 1440px category story, subcategories, products, scratch route, decoration and guide link. |
| 05 Polo PDP desktop | 1440px image/decision split, estimate, MOQ, lead time and three production routes. |
| 06 Polo PDP mobile | 390px image-first decision order and a sticky Configure action. |
| 07 Business Cards PDP | 1440px paper-led direct commerce with paper, sides, finish, quantity, total, per-card value and artwork. |
| 08 Polo Configurator | 1440px visual step: 760px preview, 534px controls, artwork placement, price update and save state. |
| 09 Start a Project | 1440px outcome-led cards with prominent guided help and Something Else. |
| 10 Event Recommendations | 1440px curated recommended/useful/optional groups with quantities and the selected custom kit scope. |
| 11 Quote desktop | 1440px Quote V2 with line items, validity, total, deposit, balance and sticky Accept. |
| 12 Proof desktop | 1440px artwork-first Badge Proof V2 with comments, version history and explicit approval/change actions. |
| 13 Tracking mobile | 390px attention-first Event Order with Badge V2 and balance actions, timeline and item states. |
| 14 Workspace Overview | 1440px role-aware navigation, Needs Attention, Quick Actions, active work, Templates and Groups. |
| 15 Template Detail | 1440px physical product preview, approved locked specification and buyer-editable order fields. |
| 16 Group Organizer | 1440px 83/120 scale fixture with issues, deadline, sizes, locations, participant access and reminders. |
| 17 Participant mobile flow | Six 390px screens: Entry, Size, Personalization, Branch, Review and Confirmation. No Workspace chrome or peer data. |
| 18 Company Store mobile | 390px ACME private Store in Group Collection mode; the employee sees “joins team order” language. |

The board's Section 33 records what changes, stays and simplifies across devices for each anchor. Section 34 records contrast, focus, touch, selected, error, status, reduced-motion, type, proof and upload rules.

## Direct reference ledger

The reference board contains direct page captures from MOO, Aino, lululemon on Mobbin, Square, Shopify, Studio Freight and Google Fonts. Process, material and anti-pattern image cues use labelled stock/reference imagery. These images document visual study only; the Stage 4.1 anchors use temporary stock and generated imagery where HolyPearls assets are missing. Some Mobbin previews exposed only part of the original screen, so the principles below use only visible structure and the source research's stated principle.

| Source | What is useful | HolyPearls borrows | HolyPearls does not copy |
| --- | --- | --- | --- |
| [Aino Agency section](https://mobbin.com/sites/sections/27dc50fa-93be-4e72-994f-b692d668ee50) | Editorial spacing and image/text relation. | Confident section scale. | Agency identity/type. |
| [Shopify Supply section](https://mobbin.com/sites/sections/667e21a1-45cb-479d-9c78-4fac2fa79970) | Product-led story. | Physical product leads the section. | Exact composition/identity. |
| [Studio Freight section](https://mobbin.com/sites/sections/c88d7a4b-61f2-4217-8818-80213f9cd809) | Graphic rhythm. | Small controlled bursts of energy. | Portfolio abstraction. |
| [Shop PDP screen](https://mobbin.com/screens/43981d3d-54a0-4946-b918-067d7dc6e8b6) | Product/decision balance. | Large image beside clear action. | Screen layout or copy. |
| [lululemon PDP screen](https://mobbin.com/screens/2b3678db-33e7-4ce4-8bad-d194206c337e) | Apparel imagery, size and action order. | Visible choices beside product. | Brand identity or shop-this-look pattern. |
| [Faire PDP screen](https://mobbin.com/screens/21bc409a-1d01-4003-8709-2bcb845a8199) | B2B decision support. | Clear practical facts. | Marketplace density. |
| [MOO Business Cards](https://www.moo.com/us/business-cards) | Paper/finish merchandising. | Tactile decision content. | MOO green, logo or copy. |
| [Printful custom shirts](https://www.printful.com/make-your-own-shirt) | Preview and customization comprehension. | Clear pick/customize path. | Design-maker complexity. |
| [Shopify Workspace screen](https://mobbin.com/screens/ed22dc70-0f9f-468f-9aa9-3e3dc43cc7c0) | Practical utility hierarchy. | Attention and action first. | Shopify admin chrome. |
| [Square Workspace screen](https://mobbin.com/screens/626b945b-c3a3-444a-aec2-00280fcf8439) | Transactional clarity. | Readable commercial state. | Exact layout. |
| [Coda Workspace screen](https://mobbin.com/screens/6133eba5-09f7-4f70-9904-a9363407ec76) | Structured information. | Compact, calm density. | Document-app identity. |
| [Dropbox review screen](https://mobbin.com/screens/4ee86036-9e81-46a9-b353-d21f9914f23a) | File-first review. | Artwork dominates controls. | File-service branding. |
| [Air review screen](https://mobbin.com/screens/e2b11887-ecc9-4be2-abd8-ee714db2e7ae) | Asset/metadata relation. | Version and comments beside art. | Exact layout. |
| [DocuSign review screen](https://mobbin.com/screens/f6a19340-8bac-474a-8acb-ab0ee8b6bbb3) | Consequential decision clarity. | Explicit approval acknowledgement. | Document-signing visual identity. |

### Anchor reference map

Each anchor uses these sources for a specific visual or interaction principle. Source layouts, identities and copy are not reproduced.

| Anchor | Reference and applied principle |
| --- | --- |
| 01 Homepage desktop | Aino: editorial spacing; Studio Freight: controlled graphic rhythm. |
| 02 Homepage mobile | Aino: image and text hierarchy; lululemon PDP: immediate product decision. |
| 03 Product Directory | Shopify Supply: product-led browsing; MOO: material clarity. |
| 04 Apparel Category | Shopify Supply: physical product story; Printful: customization entry. |
| 05 Polo PDP desktop | lululemon PDP: image and choice order; Faire PDP: practical buying facts. |
| 06 Polo PDP mobile | lululemon PDP: size and action sequence; Printful: clear customization path. |
| 07 Business Cards PDP | MOO Business Cards: paper and finish as decisions. |
| 08 Polo Configurator | Printful custom shirts: live preview beside controls. |
| 09 Start a Project | Aino: outcome-led editorial scale; Studio Freight: restrained expressive detail. |
| 10 Event Recommendations | Faire PDP: buying guidance; Shopify Supply: product-led grouping. |
| 11 Quote desktop | Square Workspace: readable commercial state; DocuSign: consequential action clarity. |
| 12 Proof desktop | Dropbox review: artwork-first review; Air review: version and comments beside art. |
| 13 Tracking mobile | Square Workspace: attention and payment state; Shopify Workspace: action-first hierarchy. |
| 14 Workspace Overview | Shopify Workspace: practical utility hierarchy; Coda Workspace: calm density. |
| 15 Template Detail | Faire PDP: B2B decision facts; MOO: physical specification. |
| 16 Group Organizer | Coda Workspace: structured data; Shopify Workspace: active work and action. |
| 17 Participant mobile flow | lululemon PDP: visible size choice; Printful: short customization path. |
| 18 Company Store mobile | Faire PDP: approved product facts; Shopify Workspace: simple action hierarchy. |

## Photography and asset gaps

Product, process, material, hands, environment and final-work image families appear on the board. Crop rules are 4:5 for products, 1:1 for materials, 3:2 or 16:10 for process, and wide for hero. Keep enough clear space for live text. Do not mask weak imagery with blur or heavy overlays.

| Needed asset | Current board visual | Resolution before final launch | Claim that must not be faked |
| --- | --- | --- | --- |
| Homepage production hero | Temporary stock | Shoot HolyPearls production | Actual team/equipment |
| Product hero photography | Generated placeholder | Shoot real sellable product | Product form/colour |
| Polo material/detail | Stock and generated placeholder | Shoot approved fabric | Material specification |
| Embroidery close-up | Temporary stock | Shoot actual process | Technique/placement |
| Business Card paper macro | Generated placeholder | Shoot actual paper/finish | Paper/finish claim |
| Large-format production | Temporary stock | Shoot actual process | In-house capability |
| Cutting and sewing | Temporary stock | Shoot actual work if offered | Manufacturing capability |
| Quality Check | Temporary stock | Shoot actual check | QA practice |
| Packing | Temporary stock | Shoot actual fulfilment | Packing practice |
| Installation | Temporary stock | Shoot actual installation | Venue/client work |
| Real client/Project work | No verified asset | Obtain client approval and images | Client identity/results |
| Workspace/Template thumbnails | Generated placeholder | Use approved catalogue images | Approved template appearance |

No existing HolyPearls production photographs were verified in the supplied material. Product/card/template placeholders may be generated for review. Capability, client, material and finish evidence needs real approved media.

## Deviation and input register

There is **no interaction architecture deviation** from frozen Stage 3. The visual system changes hierarchy, density, imagery, typography and device composition. The Event recommendations screen labels the custom welcome kit as a Project item outside Quote V2, in line with the cross-flow audit. Illustrative price copy is marked as test data.

No design blocker prevents Stage 4.1 system review. Final brand lock and launch assets require HolyPearls to supply or approve:

1. Official logo files, clear-space and usage rules.
2. Approved brand colours and any restricted colour use.
3. Approved typefaces or license constraints.
4. Real product specifications, price examples and lead times.
5. Product, process, QA, packing and installation photography.
6. Permission to show real client names, outcomes and case imagery.
7. Any approved motion or accessibility constraints beyond this provisional system.

**STAGE 4.1 — READY FOR HIGH-FIDELITY SYSTEM REVIEW**

Next stage after review: Stage 4.2 system expansion across the full page and template inventory. No implementation or PRD work is part of this deliverable.
