# HolyPearls — Stage 4.1 High-Fidelity System Review (Claude run)

**Board:** `C:\Users\ASUS\Desktop\design\holypeals-design\untitled.pen` → top-level frame **"STAGE 4.1 — HIGH-FIDELITY SYSTEM + 18 ANCHORS (Claude run)"**.
**PDF:** removed on 2026-10-07 (T00-12); it is in git history. The Stage 4.2 board (`docs/HolyPearls — Stage 4.2 Full High-Fidelity System Board.pdf`) and the Pen file replace it.
**Revision:** correction and art-direction pass, 26 Sep 2026. Stage 4.1 was not restarted; the same frame, tokens (`hp-*`) and components (`HP/*`) were corrected in place.
**Codex board:** untouched (`hf-*` / `HF/*`, frame "STAGE 4.1 — HIGH-FIDELITY VISUAL SYSTEM + 18 ANCHORS").

Rows: **A** foundations 01–09 · **B** components 10–14 · **C** public anchors 15–24 · **D** transactional anchors 25–27 · **E** B2B anchors 28–32 · **F** notes 33–36 · **00** image library.

Every identity choice is **PROVISIONAL UNTIL REAL BRAND INPUT**. Every operational value now traces to a named document (section 1). Every production image is a **temporary reference**. Frozen Stage 3.1A–F architecture is authoritative and unchanged.

---

## 0. What this pass changed

1. **Source of truth.** The first run invented prices, MOQs, lead times, fabric and paper specs, product counts, dates and a venue. All of them were audited and replaced with sourced values or removed.
2. **Production capability model.** Cut-and-sew and large format are treated as confirmed in-house. Every other method is "offered / managed through HolyPearls, in-house status unconfirmed". Copy, image tickets and the asset register follow this split.
3. **Typography.** Bricolage Grotesque is retired. The editorial voice is **Instrument Serif**; the operational voice is **Instrument Sans**; **IBM Plex Mono** carries production metadata only.
4. **Art direction.** "The Production Studio" evolves into an **Editorial Production House**. The homepage now runs in six compositional modes, on a Paper base with larger Ink moments and one dominant photograph per storytelling section.
5. **Production graphic language.** New `HP/Graphic/*` components, all carrying real record data.
6. **Frozen-logic restorations.** Four places where the first run had drifted from frozen Stage 3 were put back (section 12).
7. **Signal direction (later on 26 Sep).** The owner rejected the serif and the warm/beige undertone. The board now uses Geist and a white, cool-neutral palette with a signal-red accent (sections 5–6). Layout, copy, data and frozen logic are unchanged. The PDF was re-exported on 26 Sep 2026: 39 pages, with the homepage stitched across 3 pages, and the Signal image library in place of the old one.

---

## 1. SOURCE-OF-TRUTH / DATA PROVENANCE

### Precedence used

1. The frozen Stage 3.x document for the specific journey, fixture, state or screen.
2. **Stage 3.1C** for Polo and Business Cards product/configuration values (inherited Stage 1 test operational data).
3. **Stage 3.1D / 3.1E / 3.1F** for project, quote, payment, proof, order, approval, participant, group and Workspace fixtures.
4. **Stage 1.4** (Launch Catalogue & Operational Baseline + Seed Catalogue & Pricing.xlsx) for anything not superseded later.
5. Only then a clearly marked generic test fixture. Where no source exists the value is **omitted** or replaced by "Quote required", "Confirmed after production review" or "Test fixture — confirm with operations".

The first Stage 4.1 run's own values were **not** treated as a source.

### Where every product fact on the board comes from

| Fact family | Source document / fixture | Values used |
|---|---|---|
| Polo Shirt HP-APP-007 | Stage 3.1C Part D (seed: Stage 1.4 xlsx) | From ₦8,500 / piece · standard minimum 10 · typical production 3–7 working days · print or embroidery · ESTIMATE_READY / CONFIGURE_QUOTE |
| Polo estimate example | Stage 3.1C Part C / W | 50 navy polos, left-chest embroidery → Estimated ₦425,000 · ≈ ₦8,500 / piece · "final amount confirmed after production review" |
| Polo routes | Stage 3.1C Part E/G; Stage 1.4 §9–13 | Source & customize · Make from scratch (cut-and-sew MOQ 20 per style/colour; sample 5–10, bulk 10–25 working days) · Customer supplied (accepted after physical inspection) |
| Polo quantity bands | Stage 1.4 §12 apparel tiers | 10–49 · 50–99 · 100–199 · 200+ (no per-tier prices — none are sourced) |
| Polo fit / sizes | Stage 3.1C Part G (fit list); Stage 3.1F Part W (XS–XXL) | Regular · Relaxed · Slim · Custom; XS–XXL shown, extended on request |
| Business Cards HP-PRN-011 | Stage 3.1C Part P/R/W; Stage 3.1C Research §31–32 | ₦15,000 / 100 double-sided (₦150 / card) · minimum 100 · 2–5 working days · DIRECT_CONFIGURE / PRICE_READY · 500 → ₦52,500 (₦105 / card) · 1,000 → ₦85,000 (₦85 / card) · tiers 100/250/500/1000/2500/5000/custom |
| Business Card stocks & finishes | Stage 3.1C Part Q; Research §31 | Standard Matte "smooth and practical" · Premium Matte "thicker" **350gsm** (the only sourced weight) · Textured "natural tactile surface" · Other approved stocks · Finish: None / Foil / Spot or specialty if supported |
| Business card design help | Stage 1.4 Business_Rules `business_card_design_from` | From ₦10,000 |
| Other product starting prices, MOQs | Stage 1.4 Seed Catalogue (by SKU) | Apron ₦6,500 (APP-050) · Crew-Neck T-Shirt ₦7,500 (APP-001) · Event T-Shirt ₦7,000 (APP-095) · Long-Sleeve Polo ₦10,500 (APP-008) · Pullover Hoodie ₦26,000 (APP-019) · Work Jacket ₦28,000 (APP-024) · Baseball Cap ₦4,500 (APP-117) · Children's T-Shirt ₦5,500 (APP-111) · Restaurant Uniform ₦30,000/set PROJECT_QUOTE (APP-053) · Hotel Front-Desk Uniform ₦38,000/set (APP-054) · Backdrop Banner from ₦65,000 (LF-003) · Roll-Up Banner ₦55,000 fixed (LF-005) · Event Badges ₦2,400 with lanyard (PRN-027) · Tote Bag ₦4,000 (PKG-012/APP-130) · Notebook ₦1,600 (PRO-011) · Directional Graphics ₦33,300 / sign (LF-019) — all MOQs from the same rows |
| Catalogue and category counts | Stage 1.4 Seed Catalogue (304 SKUs, all LAUNCH = TRUE) | 304 total · Apparel 132 · Print & Stationery 42 · Embroidery & Customization 28 · Promotional 23 · Large Format 22 · Bags & Packaging 20 · Stickers & Labels 16 · Wall Art 8 (Custom Projects 13). Apparel subcategories: T-shirts & tops 17 · Hospitality 12 · Sweatshirts & outerwear 10 · Industrial & workwear 10 · Headwear 6 |
| Directory price-state facet (Apparel) | Derived from Stage 1.4 OrderMode, using the Stage 3.1C mapping (CONFIGURE_QUOTE → ESTIMATE_READY; DIRECT_CONFIGURE → PRICE_READY) and PROJECT_QUOTE → QUOTE_REQUIRED | Price ready 0 · Estimate ready 86 · Quote required 46 — **derived, flag for confirmation** |
| Lead times by method | Stage 1.4 §10 | Sourced apparel + print 3–5 · + embroidery 3–7 · paper print 2–5 · large format 1–4 · multi-product project 10–30 working days |
| Embroidery minimum | Stage 1.4 §13 | 5 pieces (simple logo runs). Screen-print and transfer minimums are **not set** → "Confirmed at review" |
| Embroidery digitising | Stage 1.4 Launch Baseline (digitisation handled by HolyPearls) | Copy only; the ₦5,000 fee is not shown because inclusion in the estimate is unconfirmed |
| Mega menu, families, popular list, needs | Stage 3 Interface Architecture §6 and Module 05 | Shop by category (8) · Popular products · Shop by need · "Can't find it?" feature · "Need it by a date? → Shop by deadline" |
| Event project | Stage 3.1D Part M; Cross-Flow Audit J03 | Annual Business Conference · HP-P-2026-0142 · 250 attendees · 30 crew · Lagos · 6 weeks away · logo + guidelines · Recommended: crew polos 30, name badges 250, main backdrop 1, roll-ups 4 → 2 · Useful: tote bags 250 (removed with Undo), notebooks 250, directional signs · Optional: bottles, lanyards, table displays · backdrop marked installation review · sponsor welcome kit 250 = custom separate-scope item |
| Project price state | Stage 3.1D Part S | QUOTE_REQUIRED; "We'll review the brief, confirm production details and send the final quote before payment." No summed total |
| Quote | Stage 3.1E Part B/F/I | HP-Q-2026-0142 · Version 2 · valid until 18 Oct 2026 · V1 30 Sep (superseded), V2 2 Oct · lines: crew polo shirts 30 ₦255,000 · name badges 250 ₦125,000 · main backdrop 1 (print + installation review) ₦180,000 · roll-up banners 2 ₦140,000 · design/artwork ₦50,000 · shipping/installation/other ₦100,000 (**test value**, the "as required" line reconciled to the fixture total) · total ₦850,000 · 60% deposit ₦510,000 · 40% balance ₦340,000 before dispatch (test rule) · "What changed": roll-ups 4 → 2, backdrop installation added, shipping estimate updated · acceptance text "I have reviewed the scope, pricing and production terms in this quote." |
| Per-unit notes on quote lines | Arithmetic on Stage 3.1E fixture | ≈ ₦8,500 each (255,000 / 30), ≈ ₦500 each (125,000 / 250) |
| Proof | Stage 3.1E Part M; Cross-Flow J03 | Name badges Proof V2 awaiting approval; acknowledgement "I have reviewed the artwork, spelling, placement and specifications shown."; CTA "Approve for production"; post-production-change warning |
| Order / tracking | Stage 3.1E Part K, V, X, AK, activity log | ORDER HP-2026-0142 · Quote V2 accepted 3 Oct · deposit paid 3 Oct · polos: Proof V2 approved, in production · badges: Proof V2 awaiting you · main backdrop: READY — AWAITING RELEASE until the balance clears · roll-ups: Quality Check · balance ₦340,000 due before dispatch · nothing dispatched yet |
| Workspace | Stage 3.1F Parts A, D, N | ACME Hospitality Group · Lekki / Victoria Island / Ikeja · approval rule: orders above ₦250,000 need ACME approval (test) · 2027 Staff Uniform Reorder ₦450,000 estimated · templates: Staff Polo, Chef Jacket, Aprons, Name Badges, Business Cards (5) |
| Template | Stage 3.1F Part I | Locked: product, navy, Primary Logo V4, left-chest embroidery, placement · Editable: quantity, size breakdown, names if allowed, needed-by, delivery · minimum and production time from Stage 3.1C |
| Asset versions | Stage 3.1F Part F/G | Logo V4 PRODUCTION READY (print + embroidery) · V5 processing |
| Group organizer | Stage 3.1F Part S/U | 2027 Staff Uniforms · 83 / 120 submitted · 37 missing (12 incomplete, 25 not started) · closes 12 Oct · sizes XS 4, S 18, M 32, L 19, XL 8, XXL 2 · delivery Lekki 42, VI 21, Ikeja 20 · issues: 3 invalid personalization values, 2 missing sizes · last reminder 5 Oct · "Send reminder to 37 people?" |
| CSV import | Stage 3.1F Part AB (independent 120-row fixture, per Cross-Flow I-01) | 114 of 120 rows valid |
| Participant | Stage 3.1F Parts V–AA | Branch delivery Lekki / VI / Ikeja, no home address · organization pays (no payment UI) · "joins the team collection; not an order" |
| Company store | Stage 3.1F Parts AI–AL | ACME Team Store · Staff Polo, Apron, Name Badge (Chef Jacket in catalogue) · locked navy / ACME logo / left-chest embroidery · uniform allowance ₦75,000, ₦32,500 remaining, renews 1 Jan (test data) |
| Payment rules text on homepage | Stage 1.4 Business_Rules (100% upfront for direct orders; deposit + balance before dispatch for quoted work) | "Pay in full, or a deposit then balance before dispatch" |
| Generic test fixtures (precedence 5) | None — marked as test | Needed-by date "Fri 16 Oct 2026" in form samples · names Ada O., Tunde O., Adaeze Okafor, Bola Martins · name limit "up to 12" as an organizer-set value · order refs HP-2026-0131/0098/0138/0140, HP-P-2026-0147 |

**Known source conflict, resolved by precedence:** Stage 1.4 Business_Rules sets a 70/30 deposit and 7-day quote validity; Stage 3.1E uses 60/40 and a valid-until of 18 Oct as its fixture. The Stage 3.1E fixture is used on Quote/Tracking because it is the screen-specific frozen document. **Workspace Overview:** Stage 3.1F Part D gives "14 participants missing" as an illustrative example, while the Organizer fixture gives 37; the board uses the Organizer fixture on both screens so the same collection agrees across screens.

---

## 2. Operational-value corrections (old → new, with source)

| Anchor / component | Was (invented in first run) | Now | Source |
|---|---|---|---|
| Polo — all cards, PDP, mobile, hub, directory, configurator | From ₦8,600 · Min 24 · 10–15 working days | From ₦8,500 / piece · standard minimum 10 · 3–7 working days | 3.1C |
| Polo PDP spec block | 220 gsm; 65/35 cotton-poly piqué; XS–3XL; 40°C wash | "Fabric is chosen with you"; material family confirmed after production review; fit Regular/Relaxed/Slim/Custom; XS–XXL + extended on request; proof note | 3.1C / 3.1F / omitted |
| Quantity tiers component | 24–49 ₦9,400 · 50–99 ₦8,600 save 9% · 100–249 ₦7,900 save 16% · 250+ quote | 10–49 standard minimum 10 · 50–99 e.g. 50 → est. ₦425,000 · 100–199 live estimate · 200+ production review | Stage 1.4 §12 + 3.1C |
| Polo routes | Source 10–15 days; scratch from 50 | Source 3–7 working days; scratch from 20 per style/colour | 3.1C / Stage 1.4 |
| Configurator estimate | ₦430,000; +₦55,000 embroidery; ₦8,600 / polo | Est. ₦425,000; ≈ ₦8,500 / piece; "estimate updated" (no invented delta) | 3.1C |
| Configurator placements / logo width | Up to 10/25/8 cm; 7 / 9 / 10 cm; LEFT CHEST · 9 CM | Named placements and relative sizes; "size confirmed in proof" | Omitted (no source) |
| Price breakdown component | 50 × ₦7,200 = ₦360,000; embroidery ₦55,000; digitising ₦15,000; ₦430,000 | In estimate / in estimate / confirmed at review; est. ₦425,000 | 3.1C |
| Sticky CTA | ₦430,000 | ₦425,000 | 3.1C |
| Business Cards price | From ₦36,500 / 250 cards incl. VAT; ₦210/146/116/96 each | ₦15,000 / 100 (₦150); 500 ₦52,500 (₦105); 1,000 ₦85,000 (₦85); other tiers priced on selection | 3.1C |
| Business Cards stocks | Cotton 600 / Smooth 350 / Duplex 700 / Kraft 400 with gsm + mm | Standard Matte / Premium Matte 350gsm / Textured / Other approved stocks | 3.1C |
| Business Cards finishes | Painted edge +₦9,000; blind letterpress +₦12,000; sides +₦4,500 | None / Foil / Spot or specialty if supported; sides "price updates" | 3.1C |
| Business Cards timing | Proof within 1 working day; dispatch 3 days after approval | Typical production 2–5 working days after artwork and proof approval | 3.1C |
| Business Cards dims | 85 × 55 mm, 0.9 mm | Removed | No source |
| Business Cards artwork | "Start from a template / type your details" | Upload my design · Need design help (from ₦10,000) · I'll send it later | 3.1C Part S; Stage 1.4 |
| VAT | "Prices incl. VAT" on quote and cards | Removed | Conflicts with Stage 1.4 tax-exclusive default |
| Homepage Popular | Staff Polo ₦8,600 / Min 24; Cards ₦36,500 / 250; Event Backdrop quote; Mailer Box ₦1,150 / Min 100 | Polo ₦8,500 / Min 10; Cards ₦15,000 / 100; Backdrop Banner from ₦65,000 / Min 1; Roll-Up Banner ₦55,000 / Min 1 | 3.1C; Stage 1.4 (no mailer box SKU exists) |
| Families / directory counts | 412 products; 42/36/24/31 in 4 families; facet counts 318/64/30/126/204/82/58/71/44/9/26; "64 products" | 304 products; 8 families with seed counts; unsourced facets removed; price-state facet derived | Stage 1.4 xlsx |
| Directory / hub / PDP product cards | Chef Apron ₦5,200, Heavy Tee 240 gsm ₦4,900, Olive Hoodie ₦13,500, Work Jacket ₦14,800, cap ₦4,300, long-sleeve ₦10,200, kids tee ₦3,900, scrubs quote Min 50, bib apron scratch Min 50 | Seed SKUs and prices listed in section 1 | Stage 1.4 xlsx |
| Directory "made from scratch" | Minimums from 50 pieces | Commercial runs from 20 pieces per style and colour | Stage 1.4 §13 |
| Apparel hub decoration table | Embroidery min 24 +3 days; screen print min 50 +2 days; transfer min 1 +1 day | Embroidery 5 pieces, 3–7 days; screen print / transfer "confirmed at review", 3–5 days | Stage 1.4 §10, §13 |
| Apparel hub subcategories | Polos 12, T-shirts 9, Hoodies 7, Workwear 8, Caps 6 | Seed subcategory counts | Stage 1.4 xlsx |
| Event recommendations | est. ₦220k / ₦258k / ₦125k / ₦110k / ₦287.5k / ₦48k / ₦64k / ₦35k; total ₦713,000; Eko Hotel; Thu 12 Nov; 3 × 2.4 m | Seed starting prices per item; QUOTE_REQUIRED; no total; Lagos; 6 weeks away; installation review | 3.1D; Stage 1.4 |
| Quote | ₦258k/125k/220k/110k/47k/90k lines; valid until 30 Sep; V1 10 Sep; "name badges 200 → 250 · Eko Hotel · +₦118,000"; install 11 Nov | 3.1E line items and dates (section 1) | 3.1E |
| Tracking / timeline | Accepted 12 Sep, paid 13 Sep; roll-ups dispatched; "arriving 3 Nov"; polos in QC "est. ready 28 Oct"; install Wed 11 Nov | Accepted + paid 3 Oct; polos in production; roll-ups Quality Check; nothing dispatched; Lagos | 3.1E |
| Proof | ACME Summit; 64pt / 40pt; "Adaeze is our longest name" | Annual Business Conference; 3.1E acknowledgement and CTA; spelling-check comment | 3.1E |
| Workspace Overview | ₦500,000 limit; closes Fri 9 Oct; 4 need a fix; templates 6; cap | Above ₦250,000 threshold; closes 12 Oct; 5 issues; templates 5; Chef Jacket | 3.1F |
| Template detail | 220 gsm piqué; Navy HP-NV-01; 9 cm; Min 24; +₦600 name; 10–15 days; used in 7 orders; 48/60 polos | Polo Shirt sourced; navy; left-chest embroidery; standard minimum 10; names if allowed; 3–7 days; historical order refs only | 3.1F / 3.1C |
| Group organizer | 79 ready / 4 fix / 37 not yet; closes Fri 9 Oct; "3 days"; sizes-by-branch table (52/70, 31/50); 15 CSV 0 errors | 3.1F organizer fixture (section 1) | 3.1F |
| Participant | Closes Fri 9 Oct; "about 2 minutes"; M = 96–101 cm; 2XL; branch street addresses | Closes 12 Oct; no duration; size-guide copy; XXL; Lekki / VI / Ikeja restaurants | 3.1F |
| Company store | ₦17,000 of ₦25,000; Team Cap ₦4,300 | ₦32,500 of ₦75,000, renews 1 Jan (test); Name Badge, covered | 3.1F |
| Organization approval card | ₦500,000 limit | Approval needed above ₦250,000 | 3.1F Part N |
| Asset card | "SVG · 2 spot colours · 6 templates" | V4 production ready · print + embroidery | 3.1F Part F |
| Homepage project story | Roll-ups "in production"; crew polos "approved" | Roll-ups Quality Check; polos Proof V2 approved · in production | 3.1E |
| Featured work | "Restaurant group · 5 branches · 140 staff" | "Staff uniforms for a restaurant group — concept" | No source; concept reference |
| Customer name | ACME Foods | ACME Hospitality Group | 3.1F Part A |

---

## 3. Removed unsupported values (no replacement invented)

- "6 production methods in-house or partnered" and the "1" companion stat.
- All GSM, fabric composition, paper weights other than Premium Matte 350gsm, card thickness, dimensions (85 × 55 mm, 3 × 2.4 m, 85 × 200 cm, 9 cm, 10 cm) and stitch counts ("9,400 ST").
- Tier prices and "save %" for Polo; per-tier prices for 250 / 2,500 / 5,000 cards.
- Letterpress, painted-edge, cotton, duplex and kraft stocks as selectable options.
- VAT-inclusive claims.
- Venue (Eko Hotel, VI), install/strike dates, delivery ETAs ("arrives Tue", "arriving 3 Nov", "est. ready 28 Oct").
- Response-time promises ("replies within 1 working day", "proof within 1 working day", "about 3 minutes", "about 2 minutes", "6 min" read time).
- "Most started · 4–6 weeks", "teams of 10–500", "A real producer · one named person owns your job".
- Product counts for invented facets, "∞" count, invented directory result counts.
- Size chart measurement (M = 96–101 cm).
- A named producer on the quote ("Kemi A.").

---

## 4. Production capability matrix

| Capability | Status for Stage 4.1 | What the board may say | What it must not say |
|---|---|---|---|
| Garment production / cut-and-sew | **CONFIRMED IN-HOUSE (core)** | "cut and sewn from scratch in our own production", "our core production" | That a generated room, machine or operator is HolyPearls' |
| Large-format printing | **CONFIRMED IN-HOUSE (core)** | "large-format printing" as core capability; banners, backdrops, display output | Generated printer shown as HolyPearls equipment |
| Embroidery | Managed · in-house unconfirmed | "embroidered for your team", "produced to your approved proof" | "our embroidery machines", stitch counts, test-sew claims |
| Screen printing | Managed · unconfirmed | "screen printed" | "our screen-print department" |
| Heat transfer / garment transfer | Managed · unconfirmed | "transferred" | In-house press |
| Paper print / business cards | Managed · unconfirmed | "printed", stock names from 3.1C | "printed in-house" |
| Specialist finishing / letterpress | Managed · unconfirmed | Only "Spot / specialty if supported" | "our letterpress", painted edge as standard |
| Packaging fabrication | Managed · unconfirmed | "packaging", "fabricated and checked before delivery" | "our packaging line" |
| Promotional objects | Managed · unconfirmed | Product names only | Owning object production |
| Signage fabrication / installation | Managed · unconfirmed | "installation review", "installed on site" | "our install team", venue/client identity |
| Quality Check, packing, dispatch | HolyPearls process (3.1E milestones) | "Quality Check before release" | Invented checklists, pass rates, ETAs |

**Customer-facing rule:** partner routing is never exposed. The homepage separates "Our core production" (cut-and-sew, large format) from "Every method, one standard" (all managed methods, produced to the approved proof, quality-checked and delivered by HolyPearls). "All production happens in-house" appears nowhere.

---

## 5. Typography (Signal direction, 26 Sep 2026)

> **Superseded:** Instrument Serif / Instrument Sans / IBM Plex Mono and the warm Paper palette. The owner rejected the serif and the beige undertone. Four token themes were compared on the real homepage sections in the frame "STAGE 4.1 — TYPE & COLOUR DIRECTION STUDY": current, Signal, Workshop and Cobalt. **Signal** was chosen.

| Token | Family | Role | Scale |
|---|---|---|---|
| `hp-font-display` (+ `hp-weight-display` 600) | **Geist** 600, −4% tracking | Hero statements, major H1/H2 on public/editorial pages, project and section statements, pull-outs (accent colour, no italic) | Display XL 96 (hero 106) · H1 64 · H2 45 · pull-outs 40 / 28 · sizes under 48 were kept as they were |
| `hp-font-ui` | **Geist** 400–700 | Navigation, body, forms, buttons, prices, product info, tables, every Workspace and transactional heading | H3 28 / 600 · H4 24 / 600 · body 16–19 · support 14 · label 15 · Workspace H1 32 / H2 24 |
| `hp-font-mono` | **Geist Mono** | Job refs, proof versions, quantities, stage and status marks, sourced dimensions only | 11–13, caps, +0.6 tracking |

**Rules.** Display tracking (−4%) applies only at 36px and above. Nothing below that size uses the display treatment, and it is never used for prices, forms, tables, buttons or Workspace. Board 04 (the type specimens and scale table) has been rewritten for Geist.

**Implementation.** Every text node on the board and in `HP/*` now uses `$hp-font-display`, `$hp-font-ui` or `$hp-font-mono` rather than a literal family, plus `$hp-weight-display` and `$hp-style-display` on display text. The variables are themed on the axis `hp-direction` (current | signal | workshop | cobalt). The board frame sets `theme: {hp-direction: signal}`, so a future swap is one token or theme change.

---

## 6. Colour and surface proportions (Signal palette)

**Signal tokens** (these replace the warm set; the old values survive under the `current` theme):

| Token | Signal | Contrast |
|---|---|---|
| Paper | #FFFFFF | Ink on Paper 19.5:1 |
| Bone | #F4F4F5 | Graphite on Bone 6.0:1 |
| Sand | #E8E8EA | — |
| Line / Line Strong | #E4E4E7 / #8A8A93 | Line Strong on Paper 3.42:1 (input borders) |
| Ink / Ink 2 | #0C0C0E / #1C1C1F | Paper on Ink 19.5:1 |
| Graphite | #5C5C63 | 6.6:1 on Paper |
| Accent (signal red) / hover | #D2311A / #B02810 | 5.0:1 on Paper, 4.55:1 on Bone; Paper on hover 6.65:1 |
| Accent tint | #FDE8E3 | — |
| Marigold / tint | #FFC21A / #FFF1C7 | Ink on Marigold 12.1:1; never used as text on light |
| Status colours | unchanged | success 6.45 · warning 5.93 · error 6.57 · info 7.04 on Paper |

The study's first red (#E23A1A, 4.33:1) failed AA for button labels and links, so it was darkened to #D2311A. Line Strong was darkened from #9E9EA6 (2.66:1) to #8A8A93 for the same reason.

The surface proportions below still apply, with Paper now meaning white and Bone meaning cool grey:

- **Page base is now Paper**, not Bone, on every anchor.
- **Public pages:** Paper ≈ 50% of sections · Ink ≈ 25% (immersive storytelling only: SMBD, production evidence) · Bone ≈ 15% (quiet and utility bands: families index, how it works, B2B, resources) · Vermilion = one closing band.
- **Transactional and Workspace:** Paper + Bone only; Ink is limited to the Workspace sidebar and the quote payment summary. No dramatic surfaces on forms, quotes, approvals or group ordering.
- Marigold stays controlled energy (registration rules and kickers on Ink) and "you need to act"; never text on light.

---

## 7. Production graphic language (new principles)

New components on board 12: **HP/Graphic/JobTicket**, **RegistrationRule**, **QuantityMark**, **InspectionMark**, **StageMark**.

1. **Every mark carries real record data** — job, project, quote, proof, garment, method, placement, quantity, stage or inspection state from the record it sits on.
2. **If the record has no value, the field is omitted.** Dimensions and stitch counts appear only when operations supplies them.
3. **Where they live:** job tickets on process and project imagery (e.g. the homepage project story carries PROJECT HP-P-2026-0142 · EVENT BRANDING · 250 GUESTS · 30 CREW · QUOTE V2 ACCEPTED · ORDER HP-2026-0142); registration rules as openers on editorial sections (Evidence, Our Work); quantity marks in project stories; inspection and stage marks only when the record is in that state.
4. **Never** on forms, prices, payments or approvals; no barcodes, tolerances or fake metrics as decoration.
5. Image tickets now also carry honesty labels: "TEMPORARY REFERENCE IMAGE", "NOT HOLYPEARLS PREMISES", "CONCEPT REFERENCE · NOT A CLIENT CLAIM".

---

## 8. Art direction and expressiveness by surface

**Editorial Production House.** A physical production company with unusually strong taste — not an agency portfolio, fashion editorial, SaaS site or print-shop template.

**Homepage rhythm (17 frozen sections, frozen order):**

| Section | Mode | Composition |
|---|---|---|
| Utility strip, header | Utility | unchanged |
| Hero | **Expressive** | Paper; 132px serif with italic vermilion second line; filmstrip led by a dominant cut-and-sew frame (620px tall) |
| Outcome discovery | **Quiet** | One large image + serif numbered list; the four thumbnail cards and card-in-image panel removed |
| Product families | **Utility** | Bone; ruled index of all 8 frozen families with seed counts, one open row |
| Popular products | **Commercial** | Cards kept (they are selectable objects) |
| Source · Make · Brand · Deliver | **Immersive** | Full-bleed 820px sewing photograph on Ink, 104px serif, four text columns (thumbnails removed) |
| Project story | **Editorial** | One 820px image with job ticket; thumbnails removed |
| How it works | Utility | Bone |
| Production evidence | **Immersive** | Ink; detail-scale embroidery macro (720px), capability register, one large-format image; stat cards removed |
| Our Work | **Editorial** | Paper; asymmetric 860 / 420 pair, no containers |
| Solutions | Utility | Ruled list, cards removed |
| B2B, Trust, Resources | Quiet / utility | Bone / Paper alternation |
| Final conversion | **Expressive** | Vermilion |

Mobile follows the same modes: one cut-and-sew poster, one immersive SMBD image, one dominant evidence macro.

**By surface:** most expressive — homepage, Our Work, Production Studio, project stories · moderate — directory, category hubs, PDP storytelling (Paper base, serif page titles) · restrained — PDP buying area, configurator (Sans headings, no reveal) · disciplined — quote, payment, proof, tracking, Workspace, approvals, groups (Sans only, Paper/Bone).

**Photography scale.** Storytelling sections use one dominant photograph; detail subjects (embroidery, fabric, hands, cutting, sewing, large-format output) are shown at near life-size. Two new temporary references were generated: plain matte business cards and a wide-format print run. The letterpress and painted-edge card images were removed from every anchor and kept in the library as restricted references.

---

### 8b. Commerce-first pass (26 Sep 2026, owner-approved)

This pass followed the independent review. The owner approved section merges.

- **Homepage cut from 17 frozen sections to 13 frames** (utility strip, header, 10 content sections, footer). Changes:
  - **Solutions:** removed; it duplicated Outcome discovery.
  - **Trust:** removed; its promises are the six How-it-works steps.
  - **Resources:** removed from the homepage; it stays in the nav and footer.
  - **Featured work:** removed until real client work and permission exist.
  - **How it works:** moved to follow the project story.

  Mobile matches.
- **Hero:** headline + search + one dominant cut-and-sew image. The four-image strip, the eyebrow ticket and the red second line are gone; the second line is now graphite.
- **Label discipline:** section eyebrows were removed. Image tickets remain only on the project story and the production evidence, where they carry record data. Index numbers and counts use the UI font in sentence case. Honesty flags on temporary images stay.
- **Red = action only:** 32 red text and icon uses became ink. Red remains on buttons, the open-row arrow, the current step and the closing band.
- **Product cards (`HP/Commerce/ProductCard`):** catalogue shots on seamless light grey; the ticket is hidden; price is 19/700 and the loudest line.
- **Imagery:** two new generated sets (temporary), in the "IMAGE LIBRARY — Signal pass" frame:
  - `cat/*`: nine catalogue product shots;
  - `story/*`: ten documentary Lagos workshop and event images in a cool daylight grade.

  They are applied to the product cards and to every homepage story slot. See `docs/HolyPearls — Photography & Shoot Plan (deferred).md`.
- **Carried to all anchors:**
  - Eyebrows and photo tickets were removed on the public pages; transactional record tickets stay.
  - Red text and icons became ink.
  - Every old warm image was replaced, board-wide, by the `cat/*`, `story/*` or `extra/*` set.
  - The embroidery image was regenerated as a finished machine-embroidered chest mark, with no hoop and no hands, so it doesn't imply a method or premises.
- **Copy rewrite for the real buyers** (HR and ops at hotels, restaurants and offices; event organisers; SME owners in Lagos):
  - plain words and short sentences;
  - the steps of ordering, in place of slogans;
  - no em-dash lists or three-part taglines;
  - no full stops on headlines;
  - "Workspace" is called a "company account" in marketing copy.

  Frozen 3.1E acknowledgement texts are unchanged word for word. Internal notes such as "Stage 1.4 seed pricing" were removed from customer-facing copy; "(test rule)" / "test data" markers remain as board annotations.
- **Brand asset:** open. See `docs/HolyPearls — Brand Asset Brief (wordmark & signature device).md`.

## 9. Motion (refined)

- Tiers unchanged: utility 120–200ms, content 250–450ms, editorial 500–900ms.
- **Production Reveal, 900ms:** 0ms a 1px vermilion registration line enters with crop ticks → 120ms media reveals L→R behind the line (clip, no scale) → 480ms the production ticket fades in (+6px) → 900ms the line exits and the composition settles. Nothing loops.
- Used only on selected hero, process and editorial media. Never on commerce controls, prices, quote acceptance, payment or proof approval. No scroll-jacking, continuous parallax or cursor effects.
- Reduced motion: media shown at rest, ticket present, no line.

---

## 10. Components changed

- **Typography reassigned** across all `HP/*` components (Sans for all component headings).
- **ProductCard** defaults and states (hover = detail crop; quote state = Restaurant Uniform).
- **PriceState ×4** now carries 3.1C wording and values.
- **QuantityTiers** → quantity bands without invented prices.
- **MOQLeadRow** → "Standard minimum 10" / "Typical production 3–7 working days".
- **MaterialCard** → Standard / Premium Matte.
- **PriceBreakdown**, **StickyCTA**, **ConfigSummary** → est. ₦425,000.
- **QuoteLineItem**, **Timeline**, **PaymentState**, **ShipmentCard** → 3.1E fixture and dates; shipment "not yet dispatched".
- **OrganizationApprovalCard** → ₦250,000 threshold; **AssetCard** → V4/V5 states; **LockedField**; **RecommendationCard** → seed price.
- **ProgressSteps** → six frozen builder steps.
- **MegaMenu** → frozen Stage 3 structure.
- **Footer** product column → Stage 3 family names.
- **New:** HP/Graphic/JobTicket, RegistrationRule, QuantityMark, InspectionMark, StageMark.

---

## 11. Anchors materially affected

| # | Anchor | Change |
|---|---|---|
| 01 | Homepage desktop | Recomposed into six modes; Paper base; hero, outcomes, families, popular, SMBD, project story, evidence, work, solutions all changed; capability copy; values corrected |
| 02 | Homepage mobile | Same modes; cut-and-sew poster; immersive SMBD; evidence macro + capability note; values corrected |
| 03 | Product Directory | 304 / 8 families; seed SKUs and prices; facets corrected |
| 04 | Apparel hub | Title, subcategory counts, cards, routes, decoration table re-sourced |
| 05 / 06 | Polo PDP desktop / mobile | Price, MOQ, lead time, routes, spec block, bands, add-ons re-sourced |
| 07 | Business Cards | Stocks, finishes, tiers, totals, artwork routes, timing, imagery |
| 08 | Configurator | Six frozen groups; step 2 Customize; relative sizes; est. ₦425,000 |
| 09 | Start a Project | Unsourced timings and claims removed |
| 10 | Event recommendations | 3.1D fixture, six steps, seed prices, QUOTE_REQUIRED rail |
| 11 | Quote | Full 3.1E fixture |
| 12 | Proof | 3.1E acknowledgement and CTA; fixture name |
| 13 | Tracking | 3.1E item states; nothing dispatched before balance |
| 14 | Workspace Overview | 3.1F attention items, threshold, templates, dates |
| 15 | Template Detail | 3.1F locked / editable model; sourced minimum and timing |
| 16 | Group Organizer | Full 3.1F organizer fixture |
| 17 | Participant flow | Closes 12 Oct; XXL; three branches; size-guide copy |
| 18 | Company Store | 3.1F allowance and products |

Every anchor also received the typography change. **All 18 anchors remain present.**

---

## 12. Frozen architecture — unchanged, and four restorations

**Unchanged:** J01–J16 · information architecture · the 17 homepage sections and their order · product/configuration routes · PRICE_READY / ESTIMATE_READY / QUOTE_REQUIRED / CONSULTATION_REQUIRED · quote acceptance ≠ payment ≠ release · proof state machines · Badge Proof V2 awaiting approval · Backdrop `READY — AWAITING RELEASE` · group submission ≠ order · Individual Orders vs Group Collection routing · participant privacy · roles, permissions and approval authority · sponsor welcome kit outside Quote V2 · responsive hierarchy.

**Restored to frozen spec (the first run had drifted; no new logic):**

1. **Configurator steps** now use the six stable Stage 3.1C groups (Product · Customize · Quantity · Artwork · Delivery · Review); the anchor is Step 2 Customize.
2. **Project Builder steps** now use the six stable Stage 3.1D stages (Project · Scale · Date & location · Brand · Recommendations · Review).
3. **Products mega menu** now follows the Stage 3 structure (Shop by category · Popular · Shop by need · "Can't find it?" feature · shop-by-deadline strip).
4. **Order tracking** no longer shows roll-ups dispatched while the balance is unpaid; states follow Stage 3.1E Part AK and "balance before dispatch".

---

## 13. Asset gap register (board 35, revised)

Columns: capability / where used · in-house status · current asset and whether temporary · real shoot required · partner attribution · prohibited claims. Sixteen rows covering: cut-and-sew, large format, embroidery, screen print, heat transfer, paper print and cards, specialist finishing, packaging, promotional objects, signage and installation, Quality Check, packing and dispatch, product hero photography, real client work, the HolyPearls logo, and the ACME fixture logo.

- All production images are temporary.
- Core in-house capabilities need a HolyPearls shoot.
- Managed methods need finished-outcome photography.
- Partner attribution may be needed for managed methods.
- Real client work stays **future input** — concept references keep "CONCEPT REFERENCE · NOT A CLIENT CLAIM". Project-story and Our Work components are structured so a real case study (image, title, what was made, job ticket fields) swaps in without redesign.

---

## 14. Genuine blockers (remaining)

1. **No real photography or logo.** The generated images are temporary, and the art direction must be re-checked against real shoots.
2. **Operations inputs still missing.** These include:
   - fabric and GSM for the Polo;
   - paper weights beyond Premium Matte 350gsm;
   - screen-print and transfer minimums;
   - per-tier Polo pricing;
   - whether the digitising fee is included in estimates;
   - colour ranges.

   The board shows "confirmed at review" rather than inventing these.
3. **In-house confirmation.** Confirmation is needed for embroidery, screen print, transfer, paper print, finishing, packaging, promotional objects and signage. Confirming them would unlock stronger process imagery and copy.
4. **Source conflicts need an owner decision.** There are two:
   - the Stage 1.4 70/30 deposit and 7-day validity versus the Stage 3.1E 60/40 fixture;
   - the Overview "14 missing" example versus the Organizer fixture of 37.
5. **Derived facet counts.** The Directory price-state counts are derived from Stage 1.4 OrderMode and need confirmation.
6. **Mobbin screens.** These still don't render in the embedded browser; the references are held as principles.

None of these blocks system review.

---

## 15. Decisions requiring HolyPearls brand or operations input

1. Logo, wordmark and favicon.
2. Brand colour (Vermilion `#B83A18` provisional) and whether marigold stays.
3. Typography: Geist / Geist Mono (Signal direction) was chosen by the owner on 26 Sep 2026. Both are free (SIL OFL).
4. Headline tone of voice.
5. In-house status of each managed method.
6. Client names, work and permissions.
7. Real specs, prices, MOQs, lead times, deposit rule and quote validity.
8. Real shoots (core capabilities first).
9. Any further motion or accessibility constraints.

---

## Final QA

- [x] All 36 deliverables present and compared against the Stage 4.1 brief (boards 01–36 plus the image library).
- [x] All 18 anchors present.
- [x] Frozen Stage 3 states intact: Badge Proof V2 awaiting, Backdrop READY — AWAITING RELEASE, acceptance ≠ payment ≠ release, submission ≠ order, welcome kit outside Quote V2, collection vs individual routing.
- [x] Every visible price, quantity, MOQ, lead time, spec, count and date audited by a board-wide text sweep; each traces to section 1 or is a marked test fixture.
- [x] Every production claim checked against the capability matrix; "6 production methods" removed; no "our machines / our letterpress / all in-house" language.
- [x] No placeholder presented as client evidence; concept flags retained.
- [x] Typography tokens and components updated consistently (0 Bricolage nodes remain; `hp-font-display` = Instrument Serif).
- [x] Desktop and mobile compositions checked by export; text clipping introduced in this pass fixed.
- [x] Accessibility: contrast pairs unchanged (all AA); serif restricted to ≥ 36px; reduced-motion equivalents documented for the refined reveal.
- [x] Codex board not modified.
- [x] PDF re-exported (42 pages) and this review updated.

**STAGE 4.1 — READY FOR HIGH-FIDELITY SYSTEM REVIEW**

Stage 4.2 and implementation have **not** been started.
