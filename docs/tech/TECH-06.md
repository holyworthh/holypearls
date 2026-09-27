# HolyPearls — TECH 06: Security, Privacy & Threats

**Version:** 2.0 (27 September 2026). Replaces TECH 06 v1. Reference standard: OWASP ASVS 5.0, level 2\. Sign-in and permission details are in TECH 03 and are not repeated here.

## 1\. What we protect

Customer contact details; organization and workspace data; quotes, orders and payment records; artwork and brand assets; proof decisions; production and order history; staff accounts; and the public site staying up.

## 2\. Main risks and our defence

| Risk | Defence |
| :---- | :---- |
| Stolen passwords or sessions | Rate limits, HttpOnly cookies, sign-out everywhere, staff MFA (TECH 03\) |
| Seeing someone else's records | Scoped data access, policy functions, attack tests (TECH 03 section 17\) |
| Guest link leaks | Hashed secrets, expiry, revoke, redeem-then-clean-URL, email codes for important actions |
| Injected code or scripts | Parameterized queries (Drizzle), React escaping, no raw HTML from users, strict CSP |
| Cross-site requests | SameSite cookies \+ Origin check (TECH 03 section 13\) |
| Open redirects | Redirect targets must be relative paths on our own domain |
| Dangerous uploads | Images and PDFs only, real-type check, isolated preview rendering, no inline display of originals (TECH 04\) |
| Price tampering, double orders, replayed webhooks | Server-side amounts, idempotency keys, signed and saved webhooks (TECH 05\) |
| Approving the wrong version, skipping steps | Status rules and version checks in services (TECH 01\) |
| Staff misuse | Least permissions, MFA, high-risk confirmations, audit log, no "sign in as customer" |
| Abuse of search, sign-in or uploads | Rate limits (TECH 02 section 14), hosting-level protection |
| Job storms | Retry limits, backoff, dead-letter queue |

## 3\. Baseline controls

HTTPS only in production (HSTS on). Secrets outside the repository. Environment checked at startup; the app refuses to start with missing or invalid settings. Every API input validated by its Zod schema. Security headers on every response:

- `Content-Security-Policy` (section 9\)  
- `X-Content-Type-Options: nosniff`  
- `Referrer-Policy: strict-origin-when-cross-origin` (and `no-referrer` on guest-link pages)  
- `frame-ancestors 'none'` (except where Paystack requires framing, which it doesn't for our pages)  
- `Permissions-Policy` disabling camera, microphone and location

## 4\. Secrets

Stored in the hosting platform's secret store. Separate values for local, staging and production. Rotate the Paystack secret key, Better Auth secret and R2 keys at least yearly and immediately after any suspected leak (steps in TECH 07 section 14). Server secrets never go in `NEXT_PUBLIC_*` variables.

## 5\. Logs and personal data

Logs never contain: passwords, email codes, session or guest-link secrets, Paystack secret key or signatures, card data, signed download or upload URLs, CSV rows, or file contents. Use IDs and request IDs instead. Sentry has request bodies turned off by default and scrubs the same fields.

## 6\. Dependencies and supply chain

pnpm version pinned. Lockfile committed. `pnpm audit` (or an equivalent scanner) runs in CI and fails on high or critical issues with a fix available. Renovate or Dependabot opens update pull requests weekly; a person reviews each. GitHub Actions pinned to commit SHAs. The worker and CI never execute uploaded files.

## 7\. Database

Two database users: a migration user that owns the schema, and an application user with only read and write on tables (no schema changes, no superuser). Backups encrypted by Neon. Production data is never copied to developer machines; use seed data or a sanitized copy made by a script that replaces names, emails, phones and addresses.

## 8\. Fetching outside URLs

The server never fetches a URL a customer typed. If "import artwork from a link" is added later, it needs an allowlist, network restrictions, and size and type limits.

## 9\. Content Security Policy

Start strict and allow only what's needed: our own domain, R2 public-media domain, Paystack's checkout scripts and frames (`js.paystack.co`, `checkout.paystack.com`), Sentry, fonts. No `unsafe-eval`. Use nonces instead of `unsafe-inline` for scripts. Any exception is recorded in the ADR register with the reason.

## 10\. Email security

Set up SPF, DKIM and DMARC for the sending domain before launch (Resend provides the records). Start DMARC at `p=quarantine` and move to `p=reject` once reports are clean. This matters because guest links arrive by email, so spoofed HolyPearls emails are a real phishing risk. Emails never ask customers for passwords or codes they didn't request.

## 11\. Card payments (PCI)

Card details are collected only by Paystack's checkout. They never pass through or get stored on HolyPearls systems. This keeps HolyPearls eligible for the simplest PCI self-assessment (SAQ A). Any change that would put card fields on our own pages needs a new ADR.

## 12\. Nigeria Data Protection Act 2023 (NDPA)

HolyPearls processes personal data of Nigerian residents, so the NDPA applies. Engineering provides the tools; the business confirms the legal details with a data protection lawyer before launch.

**The product must have:**

- A clear privacy notice, linked in the footer and at checkout, explaining what's collected, why, how long it's kept, and who processes it (Paystack, Resend, Cloudflare, Neon, Vercel, the API host, Sentry).  
- A lawful basis for each use: carrying out the order (contract) for order data; consent for marketing emails (off by default, separate checkbox).  
- Customer rights: staff can export a person's data (access request) and delete or anonymize it (erasure request) from admin, except records the law requires us to keep (for example payment and tax records). Requests are logged and completed within 30 days.  
- Retention rules, run by the daily clean-up job: unused uploads 7 days; abandoned drafts 90 days; guest links and codes after expiry; closed group-collection participant contact details 12 months after the collection's order is delivered; order, payment and tax records 7 years (to confirm with an accountant).  
- Breach handling: a written procedure to assess a breach and notify the Nigeria Data Protection Commission within 72 hours when required, and affected people where required.  
- A record of the outside processors and the countries where data is stored (the hosting region, TECH 07 section 3).

**To confirm with a lawyer:** whether HolyPearls must register with the NDPC as a data controller "of major importance", appoint a data protection officer, or file audits, based on how many people's data it processes.

## 13\. Security tests before launch (automated)

Sign-in and sign-out; revoke all sessions; attack tests from TECH 03 section 17; CSRF and Origin rejection; server-side amount checks; webhook signature and replay; upload type and size rejection; open-redirect rejection; rate limits on sign-in, guest link and code entry; security headers present on every route type.

A professional penetration test by an outside firm before public launch is strongly recommended.

## 14\. Incident switches

Staff (with `SECURITY_ADMIN`) can do each of these without a code release, following steps in TECH 07 section 14:

- revoke all sessions (all users, or one user);  
- revoke guest links for a customer or record;  
- pause online payments;  
- pause uploads;  
- put the site into read-only mode (browsing works, changes are blocked with a message);  
- rotate secrets;  
- find everything a person or request touched, using the audit log and request IDs;  
- restore the database from backup.

## 15\. Done when

No important action relies only on the front end. No private record or file can be reached by knowing its ID or storage key. No accepted or historical record can be silently changed. Staff production access needs MFA. Attack tests and payment-integrity tests run in CI. The NDPA items in section 12 are in place.