# Owner attention list

One place for everything that needs you. I add to this as I work through tickets. Each item says what's needed and why. When you resolve one, write your answer under it and I'll carry it out and mark it RESOLVED.

Last updated: 2026-09-28.

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

## Open questions from ticket reports
Each report's "Questions / conflicts found" section has the detail. Unresolved ones are copied here as tickets are finished.

(none open yet)
