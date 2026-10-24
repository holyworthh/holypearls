# Launch checklist

Everything here is an owner action on a dashboard or in DNS. The code and the runbooks are in the repository. Runbooks: `docs/runbooks/`. Variables: `docs/ops/ENVIRONMENTS.md`.

## A. Small private beta on staging (Paystack test mode)

1. **Staging reachable without Vercel login:** Vercel → project `holypearls` → Settings → Deployment Protection → Vercel Authentication → **Disabled** (or "Only Production Deployments"). Keep `holypearls-admin` protected.
2. **Email that reaches testers (blocker):** in Resend add `holypearls.akhigbe.xyz`; add the SPF, DKIM and DMARC records (`_dmarc.holypearls.akhigbe.xyz`: `v=DMARC1; p=quarantine; adkim=s; aspf=s`); set staging `EMAIL_FROM="HolyPearls <hello@holypearls.akhigbe.xyz>"`. Without this, sign-in links, verification and order links only reach the owner.
3. **Files persist:** staging R2 buckets and token (`ENVIRONMENTS.md` → Files). Otherwise turn on **Pause uploads** for the beta, because local-disk files are lost on restart.
4. **Paystack test mode:** set the test-mode webhook URL to `https://holypearls-api-staging.onrender.com/v1/webhooks/paystack`, switch online payments on in staging admin, and give testers Paystack's test card.
5. **Sentry:** `SENTRY_DSN` on staging plus the alert rule (see the T15-05 report, owner action A2).
6. **Incident switches deployed and tested:** the staging switch test (T15-05 report, A4); record it in `docs/runbooks/README.md`.
7. **Tell testers:** the first load after idle takes about a minute (free Render sleeps); the catalogue is TEST DATA and payments are not real.

## B. Public launch

Everything in A, plus:

### Storage and backups
- Create four R2 buckets in Western Europe (staging and production, private and public) plus `holypearls-prod-backup` (and optionally `holypearls-staging-backup`).
- Scope the production token to the three production buckets (private, public, backup).
- CORS on the private buckets (`ENVIRONMENTS.md` → Files).
- R2 has no S3 object versioning (Cloudflare lists `PutBucketVersioning` as unimplemented), so the worker copies private files to the backup bucket daily. On the backup bucket: Settings → Bucket lock rules → add a rule "retain 365 days" for all objects.
- Set `S3_BACKUP_BUCKET` on the production api service.
- Neon history window is 7 days or more (Neon → Project → Settings; may need a paid plan).

### Production environment (Render)
- `holypearls_app` login in `DATABASE_URL` and `DATABASE_DIRECT_URL`; `DATABASE_MIGRATION_URL` (owner).
- `WEB_REVALIDATE=on`; the same `WEB_PROXY_SECRET` on Render and Vercel; `ADMIN_ORIGIN` and `ADMIN_PROXY_SECRET`; `SITE_URL`; `SENTRY_DSN` on the api and worker.

### Hosting
- Render paid plan, with the worker split from the api: a Background Worker from the same repo and Dockerfile, start command `node apps/worker/dist/main.js`, the same environment.
- Api start command `node apps/api/dist/main.js`; pre-deploy command `node packages/db/dist/migrate-cli.js` with `DATABASE_MIGRATION_URL` (the release step runs once, before the new version takes traffic; TECH-07 §6). On the free tier the single container already runs migrations at start (`deploy/start-single.sh`).
- Vercel Pro.

### Domain and email
- Buy the domain; add it to Vercel (web), `admin.` to the admin project, `api.` as a CNAME to Render.
- Resend → Domains → add `mail.<domain>` → add the SPF and DKIM records it shows.
- DMARC TXT at `_dmarc.mail.<domain>`: `v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>; adkim=s; aspf=s; pct=100`.
- Check `spf=pass dkim=pass dmarc=pass` in Gmail → Show original (`docs/ops/EMAIL-DNS.md`, step 6). Move to `p=reject` after a month of clean reports.

### Paystack live
- Finish business verification.
- Settings → API Keys & Webhooks → **Live** → webhook URL `https://<api address>/v1/webhooks/paystack` → Save.
- Copy the live secret key to Render production `PAYSTACK_SECRET_KEY=sk_live_…`.
- Admin → Payment settings → tick the checklist → switch online payments on (authenticator check).
- Make one small live payment and refund it.

### People and process
- First production staff: `node apps/api/dist/bootstrap-admin-cli.js --email … --name …` (`BOOTSTRAP-ADMIN.md`). Invite a second STAFF_ADMIN, and give SECURITY_ADMIN to at least two people.
- Sentry: the production alert rule; `SENTRY_DSN` on production.
- Data protection: the privacy notice and processor list, and the lawyer questions (TECH-06 §12).
- Restore: the staging rehearsal logged in `docs/runbooks/restore-rehearsals.md`, and a dry read-through of runbook 9 for production.
- GitHub: branch protection.
