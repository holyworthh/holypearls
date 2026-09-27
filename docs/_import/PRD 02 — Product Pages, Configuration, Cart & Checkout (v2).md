# HolyPearls — PRD 02: Product Pages, Configuration, Cart & Checkout

**Version:** 2.0 (27 September 2026). Replaces PRD 02 v0.1. **Built in:** P03 (configuration) and P04 (cart, checkout, payment).

## 1\. Purpose

How customers look at a product, set it up (configure it), and either buy it directly or send it for a quote, across a very large catalogue.

## 2\. Goals

- Every launch product page is polished and useful.  
- Simple fixed-price products and complex quoted products work in one system.  
- Customers never lose their work when the price state changes or a product turns out to be more complex.  
- No unnecessary production jargon.  
- Artwork, sizes, personalization, deadlines and delivery are captured safely.

## 3\. Buying modes and price states

Buying modes: SIMPLE\_CONFIGURABLE, CONFIGURABLE\_QUOTE, CONSULTATIVE\_PROJECT (hands over to Start a Project). Price states: PRICE\_READY, ESTIMATE\_READY, QUOTE\_REQUIRED, CONSULTATION\_REQUIRED (meanings in PRD 00 section 7).

## 4\. Product page (all products)

**COM-FR-001 — What a product page shows (P0).** Title, images, description, price or price state, minimum order quantity, lead time, key specifications, main button, how the process works, trust information, FAQs and related guides.

**COM-FR-002 — Mobile sticky bar (P0).** When the main button scrolls off screen on mobile, a compact bar shows the price and action. It never covers the field the customer is filling in.

**COM-FR-003 — Images (P0).** Main image, close-up detail, another angle, in-use or scale shot, and production process shot, where available.

**COM-FR-004 — Price near the decision (P0).** The price, or a clear price state, sits next to the main choices.

**COM-FR-005 — Total and per-unit (P0).** Items priced by quantity show both the total and the price per unit.

## 5\. How configuration works

**COM-FR-010 — Steady step labels (P0).** Complex products use the same top-level step names every time. Details inside a step can change based on earlier answers, but the number of steps doesn't jump around.

**COM-FR-011 — Keep compatible answers (P0).** If the customer changes an earlier choice, later answers that still fit are kept. If a change would invalidate a later answer, the customer is warned before it's removed.

**COM-FR-012 — Autosave (P0).** Configurations save automatically for signed-in customers and for guests (a guest can come back through the link emailed to them).

**COM-FR-013 — Save failures (P0).** If saving fails, the customer's work stays on screen, they see "Not saved — retrying", and they can retry.

**COM-FR-014 — Review with edit links (P0).** The review step lists every choice that affects price or production, each with an Edit link back to that step.

## 6\. Garments (for example Polo Shirt)

**COM-FR-020 — How we source the garment (P0).** Four options: Source & Customize, Make From Scratch, I'll Supply the Garment, Help Me Choose.

**COM-FR-021 — Source & Customize (P0).** Choose garment type, colour, and fit or material where relevant, in plain words.

**COM-FR-022 — Make From Scratch (P0).** Capture a reference, fit, fabric, colour, labels, and whether a sample is needed first.

**COM-FR-023 — Customer-supplied garments (P0).** Capture item details, photos and how HolyPearls will receive them. The price is marked "final after inspection".

**COM-FR-024 — Decoration (P0).** Embroidery, Print, Both, or Recommend for Me.

**COM-FR-025 — Placement (P0).** Text choices plus a visual garment map for chest, back, sleeve or custom positions.

**COM-FR-026 — Placement conflicts (P0).** Overlapping or incompatible placements show a clear message and a way to fix it, without resetting anything else.

**COM-FR-027 — Sizes (P0).** Visible size buttons or a size grid. "I don't know the sizes yet" is a valid answer.

**COM-FR-028 — Suggest Group Collection (P1).** If sizes are unknown for a team, suggest collecting them with a Group Collection. Never force it.

**COM-FR-029 — Personalization (P0).** Same artwork on every item, plus optional per-item names, numbers or departments. Many rows can be uploaded from a spreadsheet (CSV).

## 7\. Business Cards (the fast path)

**COM-FR-040 — Short flow (P0).** Options → Quantity → Artwork → Delivery → Review → Checkout, shown on one page that expands as you go, not a heavy wizard.

**COM-FR-041 — Paper choices (P0).** Describe how the paper feels and what it's for first; paper weight (gsm) second.

**COM-FR-042 — Incompatible combinations (P0).** Paper and finish combinations we can't produce are blocked, with an explanation, before Review.

**COM-FR-043 — Quantity (P0).** Standard quantity buttons plus a custom quantity.

**COM-FR-044 — Straight to checkout (P0).** When the price state is PRICE\_READY and everything required is filled in, the customer can go directly to checkout.

## 8\. Other product families

**COM-FR-045 — Large format (P0).** Width, height and unit, with calculated area. The customer chooses Print Only, Delivered, or Installation Required. Installation asks for site, surface, height and access, photos, and date. Installation is never hidden inside "delivery".

**COM-FR-046 — Packaging (P0).** Standard structure (fast configuration) or custom structure (dimensions, use, material, closure, handles, insert, sample).

**COM-FR-047 — Promotional products (P0).** Pick a catalogue item, or "Source something similar". Sourced items are not promised as available until staff review them.

(COM-FR-045 to 047 were in the Stage 3 wireframes but missing from PRD 02 v0.1. They are added here so the "every launch product page" goal has written requirements.)

## 9\. Artwork

**COM-FR-050 — Artwork options (P0).** Upload ready artwork, upload a logo, upload a reference image, ask for design help, or send artwork later (only where staff allow it for that product).

**COM-FR-051 — Low-quality files never block the order (P0).** If a file is low resolution or an unsupported type, the customer can replace it, ask HolyPearls to clean it up, or send it for manual review.

**COM-FR-052 — Upload progress (P0).** Show progress, success, failure and a retry button.

**COM-FR-053 — Preview is not a proof (P0).** The configurator preview is clearly labelled as approximate. The real proof comes later (PRD 04).

**COM-FR-054 — Accepted file types at launch (P0).** JPEG, PNG and PDF. Other formats (AI, EPS, SVG, PSD) can be sent through "design help" or support and are handled by staff. New formats are added only once they can be checked and previewed safely.

## 10\. When a product needs a quote

**COM-FR-060 — Switch to quote without losing work (P0).** When choices go beyond what can be priced automatically, the state becomes QUOTE\_REQUIRED and every choice is kept.

**COM-FR-061 — Clear button wording (P0).** Quote-led products end with "Request Final Quote". Never "Submit Configuration" or "Checkout".

## 11\. Deadline and delivery

**COM-FR-070.** Show production time and delivery transit time separately.

**COM-FR-071.** Support standard timing, rush (where allowed), and "needs production review" timing.

**COM-FR-072.** International delivery addresses can continue through configuration. Freight is then confirmed by staff as part of a quote.

## 12\. Cart and checkout

**COM-FR-080 — Cart (P0).** Direct-purchase items go into the cart with a saved copy of their choices and how the price was worked out.

**COM-FR-081 — Mixed cart (P0).** The cart shows two groups: **Ready to check out** and **Needs a quote**. The customer can check out the first group and send the second group for a quote. Quote items are never charged at checkout. (Decided 27 Sep 2026 using the Stage 3 cart wireframe. Previously an open question.)

**COM-FR-082 — Payment failure keeps the order intent (P0).** If payment fails, the customer returns to the same checkout and can try again. A retry never creates a second order.

**COM-FR-083 — Checkout steps (P0).** Contact, Delivery address, Delivery option, Billing and VAT, Payment, Review. Guest checkout first. Total always visible. International orders show a customs and duties note. Production time and delivery time shown separately.

**COM-FR-084 — VAT (P0).** VAT is shown as its own line. The rate and whether catalogue prices include VAT are admin settings (Nigerian VAT is currently 7.5%; confirm with your accountant before launch).

**COM-FR-085 — Order confirmation (P0).** Shows the order number, current status, what happens next, anything still needed from the customer (for example artwork), and a link to track the order.

## 13\. Data

Catalogue Product, product options and values, Configuration, selections, file references, quantity and size grid, personalization rows, price result, deadline, delivery intent, cart item, checkout snapshot.

## 14\. Permissions

Guests can configure. Private drafts are opened only by their owner's account or their guest link. One customer can never open another customer's configuration.

## 15\. Done when

- The Polo and Business Cards journeys match the approved designs.  
- Changing price state never loses choices.  
- "Sizes unknown" is accepted.  
- Artwork warnings always offer a way forward.  
- Buying a fixed-price product stays fast.  
- A quoted product never suggests a guaranteed checkout price.  
- A mixed cart checks out ready items and sends quote items for quoting.