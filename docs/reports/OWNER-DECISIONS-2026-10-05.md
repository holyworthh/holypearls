# Owner decisions of 5 October 2026: what was built

The owner answered the "needed now" part of ATTENTION.md on 2026-10-05. This report records what each answer changed. Every change went through its own pull request into `dev`, merged only with every check green.

| Decision | Pull request | What changed |
| :-- | :-- | :-- |
| Drop Sentry until launch; T00-04 done | [#74](https://github.com/htrigga28/holypearls/pull/74) | T00-04 DONE with logs-only monitoring; hosting recorded in ADR-015; TECH-07 notes Sentry from launch. |
| Update the documents | [#74](https://github.com/htrigga28/holypearls/pull/74) | PRD-02 COM-FR-054 accepts AI and SVG; TECH-02 §14 gains the CONTACT rate-limit class; TECH-07 §1/§6 record the free-tier single container; ADR-015 accepted; CHANGE-LOG §11. |
| Build the first-admin command now | [#75](https://github.com/htrigga28/holypearls/pull/75) | `node apps/api/dist/bootstrap-admin-cli.js --email … --name …` (Render shell) or `pnpm bootstrap:admin`. Creates one STAFF_ADMIN with a one-time password and no authenticator; refused once any active STAFF_ADMIN exists. Runbook: `docs/ops/BOOTSTRAP-ADMIN.md`. |
| VAT as one line at the end, on the whole order | [#76](https://github.com/htrigga28/holypearls/pull/76) | Items show before VAT; VAT is worked out once on the order total (plus delivery when VAT applies to it) and shown last, before the total, on the product page, cart and checkout. Quotes and receipts already did this. |
| "Most ordered" follows real orders | [#77](https://github.com/htrigga28/holypearls/pull/77) | Ranked by orders in the last 365 days (cancelled orders excluded); the staff list fills any places left. |
| Draft preview for content pages | [#78](https://github.com/htrigga28/holypearls/pull/78) | "Preview draft" in the content editor opens a signed, one-hour link on the customer site with the draft and its images; never indexed or cached. |
| Several quote items become one request | [#79](https://github.com/htrigga28/holypearls/pull/79) | One HP-Q reference and one email for all of a cart's quote items; staff build one line per design; acceptance orders every design. Migration 0036. |
| Hold checkout until staff price delivery | [#80](https://github.com/htrigga28/holypearls/pull/80) | Addresses outside the zones: payment is held, staff are emailed once, Admin → Delivery prices sets the price and transit days, the customer is emailed and can pay. |
| Pen labels (design fidelity) | [#81](https://github.com/htrigga28/holypearls/pull/81) | Sentence-case category names and Pen 21's option wording for business cards, in the seed and in the dev and staging data. |
| Option images (design fidelity) | [#82](https://github.com/htrigga28/holypearls/pull/82) | An image per option value: Admin → product → Images → Option images. The product page shows Pen 21's photo cards; a garment colour's photo shows behind the front placement zones (Pen 22). Migration 0037. |
| Pen clean-up | (design file) | "Unpublish" → "Archive" in frames 96 and 104 and the 104 caption; every upload hint now reads "PDF, AI, SVG, PNG or JPEG". |

## Courier research (delivery by quote, second option)

The owner asked for research on couriers that give instant quotes to any Nigerian address. Aggregator APIs return live rates from many carriers for a pickup and drop-off address, so checkout could price any address itself:

- **Shipbubble**: rates from 50+ local and international couriers in one call. [docs](https://docs.shipbubble.com/api-reference/rates/request-shipping-rates-from-selected-couriers)
- **Terminal Africa**: rates across connected carriers, booking, customs papers for international, tracking.
- **Shiip (GoShiip)**: one API for rates, booking and tracking across 51+ carriers, including DHL, FedEx/Redstar, GIG and Kwik.
- **GIG Logistics**: its own door-to-door API across all 36 states.

Any of these would replace the staff price step for most addresses. It needs a business account with the chosen provider and a decision on which carriers to offer. Until then, staff set the price (#80).

## Questions and notes

1. **VAT rounding.** VAT is now rounded once on the order. A VAT-inclusive price rule (none in the seed) has its VAT taken out item by item first, so its total can differ by a kobo from the old per-item sum.
2. **One quote request, several designs.** The emailed link opens the first design; the quote page shows all of them. A guest with that link can open the quote, but not the other designs' edit pages (they're submitted anyway).
3. **Delivery price emails** link to the checkout, which opens only on the device or account that started it (checkouts have no guest links). The email says so.
4. **The card-stock band** (Pen 21) isn't built: it needs paper-stock content from the owner (ATTENTION 34). No seeded option has a photo yet, so the photo cards appear once staff add images.
6. **CI flake.** #78's first run failed in the quote-builder e2e test, which #78 doesn't touch; the rerun passed. Worth watching if it recurs.
5. **Staff password change.** The first admin keeps the one-time password until the staff security pages arrive (T13-05). Keep it in a password manager.
