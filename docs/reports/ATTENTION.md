# Owner attention list

One place for everything that needs you. I add to this as I work through tickets. Each item says what's needed and why. When you resolve one, write your answer under it and I'll carry it out and mark it RESOLVED.

Last updated: 2026-09-28 (after T03-03).

## Decisions and actions needed

### 1. Release to production (PR #21)
Merging `dev` into `main` deploys production (holypearls.vercel.app and holypearls-api.onrender.com) on an empty database. Nothing breaks if you wait.

### 2. First production staff admin
Production has no staff accounts, and test people are never seeded there. A one-off bootstrap command is needed: create one STAFF_ADMIN by email, who then sets a password and authenticator. **Question:** should I build it now as a small ops task (`pnpm bootstrap:admin --email you@…`), or leave it for T13-05 (staff administration)?

### 3. Cloudflare R2 keys
Uploaded files and seeded images on staging and production live on the Render container's disk and disappear on every restart or deploy. The Cloudflare connector can create buckets but not API keys. **Needed:**
- An R2 API token (Object Read & Write) from the Cloudflare dashboard.
- Tell me when it exists; I'll create the buckets, set `STORAGE_DRIVER=s3` and the `S3_*` values, and add the CORS rule.

### 4. Email sending domain
Resend can only send from `onboarding@resend.dev` to your own address until a domain is verified. **Needed:** buy the domain, or allow a subdomain of a domain you already own. `lumina.akhigbe.xyz` is verified in your Resend account, so `holypearls.akhigbe.xyz` would work for staging if you add its DNS records.

### 5. Sentry (T00-04 still BLOCKED on this)
T00-04's "Done when" includes an error appearing in Sentry. **Needed:** a Sentry account (free tier) and two projects (api+worker, web). Send me the two DSNs, or tell me to drop Sentry until launch, in which case I'll mark T00-04 DONE with logs-only monitoring.

### 6. Vercel Hobby is non-commercial
This is fine for now. Before taking real orders, move to Vercel Pro or another host.

### 7. Shared staging secret
Staging uses the same `BETTER_AUTH_SECRET` as your local `.env`, because staging's test data is a copy of development's and the test staff's authenticator secrets are encrypted with it. Production has its own secrets. Say if you'd rather I re-seed staging with its own secret.

### 8. Neon database role
Staging, development and production share one Neon role and password. Before real customers, production should get its own role. I can do this through the Neon connector; **say yes** and I'll rotate the credentials.

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

## Open questions from ticket reports
Each report's "Questions / conflicts found" section has the detail. Unresolved ones are copied here as tickets are finished.

- **T02-03, server-side rate limit:** pages rendered on Vercel share its IP addresses for API calls. Caching keeps this low, but I suggest giving the web server its own higher limit through a shared secret header (planned for T15-01 unless you want it sooner).
- **T02-03, "Most ordered":** until orders exist, it follows the admin list's order. When orders exist (T04-05), should it switch to real order counts automatically?
