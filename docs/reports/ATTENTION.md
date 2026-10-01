# Owner attention list

One place for everything that needs you. I add to this as I work through tickets. Each item says what's needed and why. When you resolve one, write your answer under it and I'll carry it out and mark it RESOLVED.

Last updated: 2026-10-01 (engineering review fixes).

## Decisions and actions needed

### 1. ~~Release to production~~ RESOLVED
Released through PR #21 and again through PR #33 (2026-09-30, commit 2683b36); production is live and healthy. **Keep merging release PRs with a merge commit, not a squash.** Squashing #21 made `dev` and `main` conflict on the next release (fixed by PR #34).

### 2. First production staff admin
Production has no staff accounts, and test people are never seeded there. A one-off bootstrap command is needed: create one STAFF_ADMIN by email, who then sets a password and authenticator. **Question:** should I build it now as a small ops task (`pnpm bootstrap:admin --email you@…`), or leave it for T13-05 (staff administration)?

### 3. Cloudflare R2 for staging and production (review P0-01)
Development now uses R2 (`holypearls-dev`, your key; the persistence test passes). Production now **refuses to start** without R2, so this blocks the next release to `main`. The Cloudflare connector can't choose a bucket location or create keys, so **in the Cloudflare dashboard**:
1. Create four buckets with location **Western Europe**: `holypearls-staging-private`, `holypearls-staging-public`, `holypearls-prod-private`, `holypearls-prod-public`.
2. Create two R2 API tokens (Object Read & Write), one limited to the two staging buckets and one to the two prod buckets.
3. Add the CORS rule from `docs/ops/ENVIRONMENTS.md` (Files) to each private bucket.
4. Tell me when they exist and add the token values to Render yourself, or paste them into `.env.staging` / `.env.production` locally (not committed). I'll set `STORAGE_DRIVER=s3` and the `S3_*` values on Render.

### 4. Email sending domain
Resend can only send from `onboarding@resend.dev` to your own address until a domain is verified. **Needed:** buy the domain, or allow a subdomain of a domain you already own. `lumina.akhigbe.xyz` is verified in your Resend account, so `holypearls.akhigbe.xyz` would work for staging if you add its DNS records.

### 5. Sentry (T00-04 still BLOCKED on this)
T00-04's "Done when" includes an error appearing in Sentry. **Needed:** a Sentry account (free tier) and two projects (api+worker, web). Send me the two DSNs, or tell me to drop Sentry until launch, in which case I'll mark T00-04 DONE with logs-only monitoring.

### 6. Vercel Hobby is non-commercial
This is fine for now. Before taking real orders, move to Vercel Pro or another host.

### 7. Shared staging secret
Staging uses the same `BETTER_AUTH_SECRET` as your local `.env`, because staging's test data is a copy of development's and the test staff's authenticator secrets are encrypted with it. Production has its own secrets. Say if you'd rather I re-seed staging with its own secret.

### 8. ~~Neon database role~~ IN PROGRESS
Migration `0023` adds the row-only app role; each Neon branch gets its own `holypearls_app` login and owner password (`docs/ops/ENVIRONMENTS.md`, Database roles). Staging switches over when this reaches `dev`; production at the next release, which also needs item 3.

### 9. Pen design file clean-up
Pen frames 96, 98 and 104 still show "Unpublish"; products are now archived instead. The upload hint in Pen should read "PDF, AI, SVG, PNG or JPEG". I haven't edited the design file.

### 10. Proposed document changes (not edited, per CLAUDE.md)
- TECH-02 §14: add the new CONTACT rate-limit class (5 per 10 min per IP, 10 per hour per person), used by help requests.
- TECH-07 §1 and §6: record the free-tier single-container set-up (`docs/ops/ENVIRONMENTS.md`) as a temporary deviation.
- ADR register: a new ADR for the hosting choice (Vercel + Render Frankfurt + Neon eu-central-1, free tier).

## Mistakes to know about

- PRs #7 and #8 contain AI attribution lines, which ADR-016 forbids. `main`'s history wasn't rewritten. Say if you want it rewritten; that needs a force-push.
- A `git reset` lost the formatting-only edits in `docs/reports/T01-01.md` (blank lines and table alignment). Your notes in `T02-01.md` were restored.
- Early in the first session, every `node.exe` process on the machine was killed.

### 11. Real photography (T02-03)
Pen's homepage, directory feature row and category hubs use temporary reference photos (production floor, cutting, team). The site shows product photos only and leaves those areas out. **Needed:** real HolyPearls photos (production, finished work, team), or approval to use licensed stock photos.

### 12. Legal pages and newsletter (T02-03)
The footer has no Privacy, Terms or Accessibility links, and no newsletter signup, because none of these exist yet. **Needed:** the texts, or confirm they wait for T15-03 (NDPA tools). The newsletter needs a decision on the provider and consent wording.

### 13. Real prices before launch (T03-01)
The seed uses the Stage 1.4 starting prices plus **illustrative** tiers and add-ons (business-card tiers, soft-touch, roll-up and canvas sizes, polo and paper-bag tiers, full-back placement). **Needed:** real tier and add-on prices, and the per-product small-run charge (the sheet says 20–40%; the seed uses 30%).

### 14. VAT on delivery (T03-01)
The seed charges VAT on delivery as well as goods. **Please confirm with your accountant**; it's one setting to change.

### 15. Show prices with or without VAT (T03-03)
Pen shows business-card prices before VAT (₦150 per card). The product page shows prices **including** 7.5% VAT (₦161.25 per card), so the per-card price, the total and what's charged agree. **Decide:** keep VAT-inclusive display, or show before-VAT prices with "+ VAT".

### 16. PRD-02 COM-FR-054 file types (T03-05)
COM-FR-054 still says JPEG, PNG and PDF only. You approved AI and SVG (TECH-04 was amended). **Needed:** permission to update COM-FR-054 in PRD-02, or tell me to leave it.

### 17. Garment decoration prices and sizes (T03-05)
Extra placements currently keep the price an estimate. **Needed:** per-placement embroidery and print prices. Also **confirm the design widths** used for the resolution check: small 7 cm, standard 10 cm, large 28 cm.

### 22. Real delivery rates (T04-01)
Checkout uses Pen 108's TEST DATA zones: Lagos Mainland ₦5,000, Lagos Island ₦6,500, Abuja FCT ₦12,000, other states "quote required", international "freight by quote", with transit Lagos 1–2 and elsewhere 2–5 working days. **Needed:** real zones, rates (before VAT) and transit days. You can enter them yourself in Admin → Delivery & installation.

### 23. Paystack test keys (for T04-03, next)
**Needed:** the Paystack **test** secret and public keys from the Paystack dashboard (Settings → API Keys & Webhooks). Until they arrive, payments are built and tested against a fake gateway, and checkout's Pay button stays off.

## Open questions from ticket reports
Each report's "Questions / conflicts found" section has the detail. Unresolved ones are copied here as tickets are finished.

- **T02-03, server-side rate limit:** pages rendered on Vercel share its IP addresses for API calls. Caching keeps this low, but I suggest giving the web server its own higher limit through a shared secret header (planned for T15-01 unless you want it sooner).
- **T04-01, delivery by quote:** when an address is in a "Quote required" zone (or abroad), checkout completes but payment waits for the delivery price. How should that price reach the customer: a delivery-only quote, or staff setting the price on the checkout?
- **T04-01, several quote items:** "Submit quote items" makes one quote request (and email) per item. Fine for now, or should they become one request?
- **T02-06, anonymous attachments:** visitors who aren't signed in can attach files only after sending a contact enquiry (uploads need a session, TECH-04). Fine, or should guests get an upload session earlier?
- **T02-03, "Most ordered":** until orders exist, it follows the admin list's order. When orders exist (T04-05), should it switch to real order counts automatically?
- **T03-08, custom sizes:** Pen says custom large-format sizes are priced by area and only very large ones need a quote. Without per-m² prices, every custom size is a quote for now (PRD COM-FR-060). **Needed:** per-m² prices per material and a "very large" threshold.
- **T03-08, transit days:** working values of Lagos 1–2 and the rest of Nigeria 2–5 working days until delivery zones arrive in T04-01. Please confirm.
- **T03-08, impossible deadlines:** a date we can't meet even with priority rush keeps the price an estimate with "we'll review it with you". Should it instead block checkout until staff confirm?
- **Process:** from T04-01 on, every ticket starts with failing tests written from the PRD and plan (your rule of 2026-09-28).
- **Design fidelity (2026-09-28):** the public pages were rebuilt from the Pen exports; see [DESIGN-FIDELITY.md](DESIGN-FIDELITY.md). To match Pen exactly you may want to: rename categories and option values in admin to the Pen labels ("Apparel & garment production", "Standard Matte · Smooth and practical"); approve adding an **image per option value** (paper cards) and **product attributes for filters** (sourcing, decoration); supply the **card-stock band** content. Garments now configure on their own stepped page (`/products/polo-shirt/configure`), as Pen 19 → 22 shows.

### 18. SEO settings on Render (T02-06)
Staging and production have no `SITE_URL` or `INDEXNOW_KEY`, so canonical URLs and the sitemap fall back to the default origin and IndexNow pings are skipped. **Needed:** the public site URL (holypearls.vercel.app for now, or the real domain), and say yes and I'll generate an IndexNow key and set both.

### 19. Content on staging and production (T02-06)
About, guides, project pages and case studies exist only in the development seed. Production has none, so /about and /guides show empty states. **Needed:** the real texts, or permission to copy the seed pages to staging for review.

### 20. Contact details (T02-06)
The Contact page shows placeholder email, phone, WhatsApp and address (PUB-SEO-006 wants verified details). **Needed:** the real ones.

### 21. Draft preview (T02-06)
Staff can preview a content page only after it's published. **Decide:** whether staff-only draft preview links are wanted (small follow-up), or leave it.

### 11. Branch protection (review P1-01): skipped for now
GitHub refuses branch rules on a private repository on the Free plan. You chose to skip it for now, so `dev` and `main` still accept direct and force pushes. With GitHub Pro ($4/month) I can add: pull requests only, the `checks` job required, no force pushes, no deletion, on both branches.

### 12. Before the next release to `main`
Production now checks its own settings on start (review P0-01, P1-02, P1-08, P2-05). Before merging `dev` into `main`, production needs: R2 (item 3), the `holypearls_app` login in `DATABASE_URL` and `DATABASE_DIRECT_URL`, `DATABASE_MIGRATION_URL` for the owner, `WEB_REVALIDATE=on`, and the same `WEB_PROXY_SECRET` on Render and Vercel. I'll set these on Render once item 3 is done.

### 13. Retention periods to confirm (review P2-03)
Open checkouts now close after 72 hours. Contact, address and billing details are erased from checkouts abandoned for 90 days, and drafts untouched for 90 days are closed and lose their names and files. These are your starting values from 2026-10-01. **Needed:** confirm them with your accountant and lawyer (completed orders and tax records follow the legal period instead). They live in one place: `apps/api/src/sales/retention.ts`.
