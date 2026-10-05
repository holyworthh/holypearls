# Owner attention list

One place for everything that needs you. I add to this as I work through tickets. Each item says what's needed and why. When you resolve one, write your answer under it and I'll carry it out and mark it RESOLVED.

The list has two parts:
- **Part A: needed now.** These block a ticket, or they decide how code that is being built right now behaves. The sooner you answer, the less rework.
- **Part B: needed before launch.** These are accounts, settings, real content and prices that production needs before real customers arrive. Building can go on without them.

Item numbers stay the same as before, so references in ticket reports still work. The old duplicate numbers 11–13 are now 11b, 12b and 13b.

Last updated: 2026-10-05 (split into "now" and "before launch").

---

# Part A: needed now

## A1. Blocking a ticket

### 27. One staging test payment (T04-03, T04-05). T04-03 is waiting on this.
Staging payments are switched on (2026-10-02). The in-app browser can't operate Paystack's payment window, so **one checkout needs you**:
1. On the staging site, add a ready-priced item (for example business cards) to the cart and check out.
2. Pay with the Paystack test card 4084 0840 8408 4081, any future expiry, CVV 408, PIN 0000 and OTP 123456.

I'll then confirm the webhook, the order, the receipt and the email, and move T04-03 to DONE.

### 26. Admin app on Vercel: one setting (T00-11). Staging admin won't build until this is done.
The staff admin has its own Vercel project, `holypearls-admin` (ADR-017). New projects take the repository's default branch (`dev`) as production, and the Vercel connector can't change that. **In the Vercel dashboard:**
1. Open `holypearls-admin`.
2. Go to Settings → Git → Production Branch.
3. Set it to **`main`**.

Until then, a guard skips any production build that isn't from `main`, so staging's admin (`dev`) won't build either. Tell me when it's done and I'll deploy staging and check it.

### 5. Sentry. T00-04 is BLOCKED on this.
T00-04's "Done when" includes an error appearing in Sentry. **Needed:** one of these:
- a Sentry account (free tier) with two projects (api+worker, web), and their two DSNs sent to me; or
- tell me to drop Sentry until launch. I'll then mark T00-04 DONE with logs-only monitoring.

## A2. Decisions about behaviour that's already built
Each of these is built with a working assumption. If you change one, the change is small now and grows as more is built on top of it.

### 30. Production holds and the balance (T07-01)
- **Hold reasons:** customer information, artwork, materials, equipment, payment, other.
- **Who acts:** customer or HolyPearls.

**Needed:** confirm both lists, or send the ones you want (PRD-06 leaves them open).

**Balance timing.** A before-dispatch balance now falls due as soon as the first item passes quality check, and the customer gets the "payment due" email then. **Confirm** that timing; the alternative is to wait until every item is finished.

The dev database has three TEST DATA orders (HP-2026-TEST-1 to 3) for trying the board.

### 31. Cancellation policy (T07-03)
No document sets a cancellation policy. As built, a customer can cancel online only while every item is still waiting or queued, that is before production. After that, they're sent to contact you. **Confirm** this, or name products that can't be cancelled at all once ordered. Refunds are in Part B.

### 15. Show prices with or without VAT (T03-03)
Pen shows business-card prices before VAT (₦150 per card). The product page shows prices **including** 7.5% VAT (₦161.25 per card), so the per-card price, the total and what's charged agree. **Decide:** keep the VAT-inclusive display, or show before-VAT prices with "+ VAT".

### 32a. Problem report numbers (T08-01)
Problem reports are numbered HP-RP-2026-0001 and up. The design marks this format "to be confirmed". **Confirm** the format.

### Open product questions from ticket reports
Each report's "Questions / conflicts found" section has the detail.
- **T04-01, delivery by quote:** when an address is in a "Quote required" zone (or abroad), checkout completes but payment waits for the delivery price. How should that price reach the customer: a delivery-only quote, or staff setting the price on the checkout?
- **T04-01, several quote items:** "Submit quote items" makes one quote request (and email) per item. Fine for now, or should they become one request?
- **T04-03, closed popup:** Paystack reports an opened but unpaid transaction as "abandoned" straight away, even while the customer may still be choosing a method. The 2-minute and 10-minute checks therefore treat "abandoned" as still in progress, and only the 30-minute check settles it as not paid. The customer sees "Confirming your payment" in that time and can start a new payment after 10 minutes (TECH-05 §6). Fine, or should "abandoned" count from the first check?
- **T03-08, impossible deadlines:** a date we can't meet even with priority rush keeps the price an estimate, with "we'll review it with you". Should it instead block checkout until staff confirm?
- **T02-06, anonymous attachments:** visitors who aren't signed in can attach files only after sending a contact enquiry, because uploads need a session (TECH-04). Fine, or should guests get an upload session earlier?
- **T02-03, "Most ordered":** until orders exist, it follows the admin list's order. When orders exist (T04-05), should it switch to real order counts automatically?
- **T02-03, server-side rate limit:** pages rendered on Vercel share its IP addresses for API calls. Caching keeps this low, but I suggest giving the web server its own higher limit through a shared secret header. This is planned for T15-01 unless you want it sooner.

## A3. Quick yes/no answers about documents and process

### 16. PRD-02 COM-FR-054 file types (T03-05)
COM-FR-054 still says JPEG, PNG and PDF only. You approved AI and SVG, and TECH-04 was amended. **Needed:** permission to update COM-FR-054 in PRD-02, or tell me to leave it.

### 10. Proposed document changes (not edited, per CLAUDE.md)
- TECH-02 §14: add the new CONTACT rate-limit class (5 per 10 min per IP, 10 per hour per person), used by help requests.
- TECH-07 §1 and §6: record the free-tier single-container set-up (`docs/ops/ENVIRONMENTS.md`) as a temporary deviation.
- ADR register: a new ADR for the hosting choice (Vercel + Render Frankfurt + Neon eu-central-1, free tier).

### 2. First production staff admin: when to build it
Production has no staff accounts, and test people are never seeded there. A one-off bootstrap command is needed: it creates one STAFF_ADMIN by email, who then sets a password and authenticator. **Question:** build it now as a small ops task (`pnpm bootstrap:admin --email you@…`), or leave it for T13-05 (staff administration)? The command itself is needed only before launch.

### 21. Draft preview (T02-06)
Staff can preview a content page only after it's published. **Decide:** add staff-only draft preview links (a small follow-up), or leave it.

### 7. Shared staging secret
Staging uses the same `BETTER_AUTH_SECRET` as your local `.env`. Staging's test data is a copy of development's, and the test staff's authenticator secrets are encrypted with it. Production has its own secrets. Say if you'd rather I re-seed staging with its own secret; otherwise nothing is needed.

### 9. Pen design file clean-up (low priority)
Pen frames 96, 98 and 104 still show "Unpublish"; products are now archived instead. The upload hint in Pen should read "PDF, AI, SVG, PNG or JPEG". I haven't edited the design file.

### Design fidelity notes (2026-09-28)
The public pages were rebuilt from the Pen exports; see [DESIGN-FIDELITY.md](DESIGN-FIDELITY.md). To match Pen exactly, you may want to:
- rename categories and option values in admin to the Pen labels ("Apparel & garment production", "Standard Matte · Smooth and practical");
- approve adding an **image per option value** (paper cards) and **product attributes for filters** (sourcing, decoration);
- supply the **card-stock band** content.

Garments now configure on their own stepped page (`/products/polo-shirt/configure`), as Pen 19 → 22 shows.

---

# Part B: needed before launch (production)

## B1. Infrastructure and accounts

### 3. Cloudflare R2 for staging and production (review P0-01). This blocks the next release to `main`.
Development uses R2 (`holypearls-dev`, your key; the persistence test passes). Production **refuses to start** without R2. The Cloudflare connector can't choose a bucket location or create keys, so **in the Cloudflare dashboard**:
1. Create four buckets with location **Western Europe**: `holypearls-staging-private`, `holypearls-staging-public`, `holypearls-prod-private`, `holypearls-prod-public`.
2. Create two R2 API tokens (Object Read & Write): one limited to the two staging buckets, and one to the two prod buckets.
3. Add the CORS rule from `docs/ops/ENVIRONMENTS.md` (Files) to each private bucket.
4. Tell me when they exist. Either add the token values to Render yourself, or paste them into `.env.staging` / `.env.production` locally (not committed). I'll set `STORAGE_DRIVER=s3` and the `S3_*` values on Render.

### 12b. Before the next release to `main`
Production checks its own settings on start (review P0-01, P1-02, P1-08, P2-05). Before `dev` is merged into `main`, production needs:
- R2 (item 3);
- the `holypearls_app` login in `DATABASE_URL` and `DATABASE_DIRECT_URL`;
- `DATABASE_MIGRATION_URL` for the owner;
- `WEB_REVALIDATE=on`;
- the same `WEB_PROXY_SECRET` on Render and Vercel.

I'll set these on Render once item 3 is done.

### 8. Neon database role. IN PROGRESS.
Migration `0023` adds the row-only app role. Each Neon branch gets its own `holypearls_app` login and owner password (`docs/ops/ENVIRONMENTS.md`, Database roles). Staging switches over when this reaches `dev`. Production switches at the next release, which also needs item 3.

### 4. Email sending domain
Until a domain is verified, Resend can only send from `onboarding@resend.dev`, and only to your own address. **Needed:** buy the domain, or allow a subdomain of a domain you already own. `lumina.akhigbe.xyz` is verified in your Resend account, so `holypearls.akhigbe.xyz` would work for staging if you add its DNS records.

### 25. Before production takes payments (T04-03)
Production accepts only a live key (`sk_live_`), and stays "payment not available" without one. Before launch:
- Complete the Paystack setup checklist (TECH-05 §14):
  - a verified business;
  - international payments;
  - American Express and Apple Pay, if wanted;
  - USD and a Zenith Bank USD account, if USD quotes are wanted.
- Add the live secret key to production Render.
- Set the live webhook URL to `https://holypearls-api.onrender.com/v1/webhooks/paystack`, or the real API domain.
- Online payments start **off** in every environment. Staff switch them on in Payment settings (T04-05).

### 2. First production staff admin
Production has no staff accounts, so someone needs to be able to sign in to admin. When to build the bootstrap command is asked in Part A.

### 26 (later part). Admin subdomain
When the domain exists, give the admin its own subdomain (`admin.<domain>`), and I'll update `ADMIN_ORIGIN` on Render to match. Staff sign in at the admin address only; the customer site no longer has `/admin`.

### 18. SEO settings on Render (T02-06)
Staging and production have no `SITE_URL` or `INDEXNOW_KEY`. Canonical URLs and the sitemap therefore fall back to the default origin, and IndexNow pings are skipped. **Needed:** the public site URL (holypearls.vercel.app for now, or the real domain). Say yes and I'll generate an IndexNow key and set both.

### 6. Vercel Hobby is non-commercial
This is fine for now. Before taking real orders, move to Vercel Pro or another host.

### 11b. Branch protection (review P1-01): skipped for now
GitHub refuses branch rules on a private repository on the Free plan. You chose to skip it for now, so `dev` and `main` still accept direct and force pushes. With GitHub Pro ($4/month) I can add these rules on both branches:
- pull requests only;
- the `checks` job required;
- no force pushes;
- no deletion.

## B2. Prices, tax and money

### 13. Real prices (T03-01)
The seed uses the Stage 1.4 starting prices plus **illustrative** tiers and add-ons: business-card tiers, soft-touch, roll-up and canvas sizes, polo and paper-bag tiers, and full-back placement. **Needed:**
- real tier and add-on prices;
- the per-product small-run charge (the sheet says 20–40%; the seed uses 30%).

### 17. Garment decoration prices and sizes (T03-05)
Extra placements currently keep the price an estimate. **Needed:**
- per-placement embroidery and print prices;
- confirmation of the design widths used for the resolution check: small 7 cm, standard 10 cm, large 28 cm.

### Custom large-format sizes (T03-08)
Pen says custom large-format sizes are priced by area, and only very large ones need a quote. Without per-m² prices, every custom size is a quote for now (PRD COM-FR-060). **Needed:** per-m² prices per material, and a "very large" threshold.

### 22. Real delivery rates (T04-01)
Checkout uses Pen 108's TEST DATA zones and transit times:

| Zone | Rate | Transit |
| :-- | :-- | :-- |
| Lagos Mainland | ₦5,000 | 1–2 working days |
| Lagos Island | ₦6,500 | 1–2 working days |
| Abuja FCT | ₦12,000 | 2–5 working days |
| Other states | quote required | 2–5 working days |
| International | freight by quote | – |

The same working transit values (Lagos 1–2, the rest of Nigeria 2–5 working days) were used in T03-08. **Needed:** real zones, rates (before VAT) and transit days. You can enter them yourself in Admin → Delivery & installation.

### 14. VAT on delivery (T03-01)
The seed charges VAT on delivery as well as on goods. **Please confirm with your accountant**; it's one setting to change.

### 29. Quote defaults (T05-03)
These are starting values:
- new quotes are valid for 14 days, with a reminder 3 days before expiry;
- the default schedule is 50% on acceptance and 50% before dispatch;
- the default terms are "one proof round per item…".

**Needed:** confirm or change them in admin (Quotes → Settings, which needs your authenticator).

### 31 (refunds). Refunds are manual for now (T07-03)
A cancellation records the amount to refund and tells the customer "our finance team will refund ₦X to your original payment method". Refunds through the admin come with T13-05. Until then, refund in the Paystack dashboard yourself. The amount is in the audit log entry for each cancelled order.

## B3. Content, legal and operations

### 20. Contact details (T02-06)
The Contact page shows a placeholder email, phone, WhatsApp and address (PUB-SEO-006 wants verified details). **Needed:** the real ones.

### 19. Content on staging and production (T02-06)
About, guides, project pages and case studies exist only in the development seed. Production has none, so /about and /guides show empty states. **Needed:** the real texts, or permission to copy the seed pages to staging for review.

### 11. Real photography (T02-03)
Pen's homepage, directory feature row and category hubs use temporary reference photos (production floor, cutting, team). The site shows product photos only and leaves those areas out. **Needed:** real HolyPearls photos (production, finished work, team), or approval to use licensed stock photos.

### 12. Legal pages and newsletter (T02-03)
The footer has no Privacy, Terms or Accessibility links and no newsletter signup, because none of these exist yet. **Needed:**
- the texts, or confirmation that they wait for T15-03 (NDPA tools);
- for the newsletter, a decision on the provider and the consent wording.

### 13b. Retention periods to confirm (review P2-03)
These are your starting values from 2026-10-01:
- open checkouts close after 72 hours;
- contact, address and billing details are erased from checkouts abandoned for 90 days;
- drafts untouched for 90 days are closed and lose their names and files.

Completed orders and tax records follow the legal period instead. **Needed:** confirm the values with your accountant and lawyer. They live in one place: `apps/api/src/sales/retention.ts`.

### 28. Recommendation rules and project types (T05-01)
Event branding and Staff uniforms start with rules from Pen 110 and Stage 3.1D. The other 11 project types have none, so customers add items themselves. **Needed:**
- review the starting rules in admin (Projects → Recommendation rules);
- add rules for the other types;
- confirm the timing guidance: Comfortable for 6+ weeks, Tight for 3–6 weeks, Production review needed under 3 weeks.

### 32b. Problem reports: response time and staff (T08-01)
- **Response time.** Customers are told "We'll look at this within 1 working day and email you". **Confirm** you can keep that promise.
- **Staff access.** Shipments need the Fulfilment permission, and problem reports need Customer support. Grant them to the staff who'll do this work. The Staff page arrives with T13-05; until then, I can grant them for you.

---

# Resolved

- **1. Release to production.** Released through PR #21 and again through PR #33 (2026-09-30, commit 2683b36); production is live and healthy. **Keep merging release PRs with a merge commit, not a squash.** Squashing #21 made `dev` and `main` conflict on the next release; PR #34 fixed it.
- **23. Paystack test keys.** The keys are in your local `.env` and on staging Render (`PAYSTACK_SECRET_KEY`, 2026-10-01).
- **24. Paystack webhook URL (2026-10-02).** You set the test-mode webhook to `https://holypearls-api-staging.onrender.com/v1/webhooks/paystack`. Set the live-mode URL only when production takes payments (item 25).

# Mistakes to know about

- PRs #7 and #8 contain AI attribution lines, which ADR-016 forbids. `main`'s history wasn't rewritten. Rewriting it needs a force-push; say if you want it.
- A `git reset` lost the formatting-only edits in `docs/reports/T01-01.md` (blank lines and table alignment). Your notes in `T02-01.md` were restored.
- Early in the first session, every `node.exe` process on the machine was killed.
- PR #70 (T07-01) was merged before its CI passed. PR #71 fixed it the same day. Every merge since then waits for green checks.

# Process notes

- From T04-01 on, every ticket starts with failing tests written from the PRD and plan (your rule of 2026-09-28).
