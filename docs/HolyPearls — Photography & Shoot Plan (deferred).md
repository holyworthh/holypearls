# HolyPearls — Photography & Shoot Plan (deferred)

**Status:** Deferred. There is no shoot plan yet. This document collects what the website will need, so it can be scheduled near the end of development.
**Created:** 26 Sep 2026 · **Owner:** HolyPearls (to assign)
**Current state:** Every image on the Stage 4.1 board is generated and **temporary**. The images are labelled "TEMPORARY REFERENCE IMAGE" / "NOT HOLYPEARLS PREMISES" / "CONCEPT REFERENCE · NOT A CLIENT CLAIM". None may ship as evidence of HolyPearls premises, staff, equipment or clients.

---

## 1. Why this matters

A buyer is paying for physical production they can't see. Real photography of HolyPearls' own production is the strongest trust signal the site can carry, stronger than any typeface or layout choice. Generated imagery can set the direction; it can't prove anything.

## 2. Two photography systems

| System | Where it's used | Style |
|---|---|---|
| **A · Catalogue** | Product cards, PDP galleries, configurator previews, company store, template cards | One product, centred, on a seamless light-grey ground (≈ #EDEDEF). Soft overhead light, gentle contact shadow, true colour, 4:5. The same set-up for every SKU so products are comparable. |
| **B · Documentary** | Homepage stories, category hubs, Production Studio, project stories, case studies | Natural daylight, cool neutral grade (no amber), candid, hands and materials in focus, people absorbed in work. One dominant image per section. |

## 3. Shot list — priority order

### P1 · Core in-house capabilities (confirmed; needed before launch)
1. Cut-and-sew: cutting on the table (hero; wide, landscape ≥ 2.1:1).
2. Cut-and-sew: sewing close-up, hands and needle (immersive band, 16:9).
3. Cut-and-sew: sampling and fit check on a person.
4. Large format: printer output coming off the roll, with a technician (4:3).
5. Large format: a finished backdrop or roll-up in use.
6. Quality Check before release: hands inspecting a finished garment.
7. Packing and dispatch: bundles labelled by branch.

### P2 · Catalogue (System A), launch SKUs first
- Polo Shirt HP-APP-007 in navy plus the colour range operations confirms (flat, folded, detail of the chest mark).
- Business Cards HP-PRN-011: Standard Matte, Premium Matte 350gsm, Textured (stack plus a single card, and an edge detail).
- Backdrop Banner LF-003, Roll-Up Banner LF-005, Event Badges PRN-027.
- Crew-Neck Tee APP-001, Pullover Hoodie APP-019, Apron APP-050, Baseball Cap APP-117, Tote Bag PKG-012.
- Then the rest of the 304-SKU seed catalogue, by family.

### P3 · Managed methods (finished outcome only, unless in-house is confirmed)
Embroidery (macro of the stitch), screen print, heat transfer, paper print, specialist finishing, packaging, promotional objects, signage. **Don't** photograph partner premises as if they were HolyPearls'. See the capability matrix in the System Review, §4.

### P4 · Real client work (needs permission)
Project stories and "Our Work" come back to the homepage only when real work and signed permission exist. For each project, capture: the finished item in use, a detail, the team or space, and the job-ticket facts (what, quantity, method).

## 4. Crop and format requirements (from the board)

| Slot | Desktop | Mobile |
|---|---|---|
| Home hero | 1328 × 620 | 350 × 460 |
| Immersive band | 1440 × 820 | 350 × 420 |
| Project story | 752 × 820 | 350 × 260 |
| Evidence macro | 1328 × 720 | 350 × 420 |
| Product card | 4:5 (320 × 400) | 169 × 200 |
| PDP gallery | 1:1 and 4:5 | 4:5 |

Shoot wide enough to allow both crops. Deliver as WebP/AVIF at 2× with a mobile weight budget of **≤ 150 KB** per image above the fold (Lagos mobile networks).

## 5. Open decisions for HolyPearls
1. Location and date for the P1 shoot.
2. Photographer (documentary) and product photographer (catalogue); these can be one person with two set-ups.
3. Model releases for staff; client permissions for P4.
4. Colour range per product (needed before System A).
5. Whether managed-method partners allow any process photography, and on what attribution terms.

## 6. Until then
Generated images on the board follow the two systems above so the layout is designed around the right kind of image. Swap-in is 1:1 by slot name (`ph/*`, `cat/*`, `story/*` in the .pen image library).
