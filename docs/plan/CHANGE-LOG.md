# HolyPearls — Change Log: v1 → v2 (27 September 2026\)

Every change made in the v2 rewrite, and why. v1 documents are untouched in folders 03, 05, 06 and 07\. Where they disagree with v2, v2 wins.

## 1\. Language

- All PRDs and TECH documents rewritten in plain English: short sentences, active voice, no slash-compounds ("deposit/balance/milestone" → "deposit, balance or milestone").  
- Jargon replaced: "frozen" → approved; "canonical" → official record / one page per product; "capability" → permission; "primitive" → shared component; "snapshot" explained as "saved copy".  
- Every hedge ("where appropriate", "where practical", "as needed", "may need") replaced with a concrete rule or a starting value marked "configurable".  
- Starting values added: sessions (customers 30 days, staff 12 hours); MFA recency 15 minutes; email codes (6 digits, 10 minutes, 5 tries, 24-hour window); guest link expiry (180 days orders and quotes, 90 days drafts); invitation expiry 7 days; quote validity 14 days; job retries and timeouts; upload limits per purpose; download and upload link lifetimes; clean-up and retention periods; rate limits; alert thresholds; polling at most every 30 seconds.

## 2\. Payments (ADR-011, ADR-014)

- **Paystack is the only payment provider.** Bachs fallback, PayPal, Stripe, the payment-method resolver and provider-to-provider fallback rules are removed from PRD 03, PRD 06, TECH 05 and the tracker. ADR-010 is marked superseded.  
- The duplicated 27 September payment amendment in PRD 03 v1 (it appeared twice) is gone; PAY-FR-007 to 012 are rewritten for Paystack only. PRD 06 OPS-FR-044 to 048 are rewritten the same way.  
- International customers pay by card through Paystack (Visa, Mastercard, Verve, Amex). Checkout is in NGN; quotes can be in USD only if USD is enabled. Paystack setup checklist added (TECH 05 section 14).  
- Payment status list reconciled. v1 had different lists in PRD 00, PRD 03, the 3.1E matrix and TECH 05\. v2 has one list in PRD 00 section 8\. PAYMENT\_DUE added (pay-in-full case). The customer-facing status is now worked out in a fixed order (TECH 01 section 4).  
- Payment attempt statuses unified: CREATED, PENDING, SUCCEEDED, FAILED, ABANDONED, UNKNOWN. Intent statuses: OPEN, PROCESSING, SUCCEEDED, CANCELLED, REVIEW\_REQUIRED.  
- Unclear payments now have a fixed check schedule (2 minutes to 24 hours; UNKNOWN and review at 48 hours).  
- PCI position stated: card details only on Paystack's checkout (SAQ A).

## 3\. Modules (ADR-012)

18 modules → 10: identity, catalogue (+ search), configuration, files, sales (commerce \+ projects \+ quotes), payments, orders (+ proofs \+ fulfilment), organizations (+ workspace), groups, platform (notifications \+ audit \+ help requests \+ rate limits \+ exports). Admin is a section of the web app, not a module.

## 4\. Status names reconciled

- Quote: v1 used PENDING\_REVIEW, READY, REVISION\_REQUESTED, REVISED, ACCEPTED, DECLINED, EXPIRED, SUPERSEDED, and TECH 01 v1 used SENT. v2: quote statuses PENDING\_REVIEW, READY, REVISION\_REQUESTED, ACCEPTED, DECLINED, EXPIRED; version statuses DRAFT, SENT, SUPERSEDED, ACCEPTED, DECLINED, EXPIRED. "Revised" is a display label, not a status.  
- "Organization re-approval required" is a blocking reason on acceptance, not a quote status.  
- Proof: "Ready / Awaiting Approval" (PRD 00\) and PROOF\_READY (3.1E matrix) → AWAITING\_APPROVAL, matching the 3.1E correction brief. "Question" is a comment, not a status.  
- Order item: DISPATCHED and DELIVERED added at item level; ON\_HOLD is shown from a separate hold record.  
- Order summary status is worked out from items, not edited.  
- Group Collection: ORDER\_CREATED → ORDER\_DRAFT\_CREATED (closing creates an Order Draft, not an order).  
- Participant: INVITED merged into NOT\_STARTED; SIZE\_UNSURE, CENTRAL\_DELIVERY and LOCATION\_DELIVERY are field values, not statuses; REMOVED added.  
- Brand asset: "VERSION\_REPLACE" is an action, not a status; "Retired for new use" → RETIRED; PROCESSING added.  
- Template: "Available using logo V4" and "Blocked — asset review required" defined as labels on APPROVED and NEEDS\_REVIEW.  
- Rate-limit classes unified into one list (TECH 02 section 14).

## 5\. Open questions closed

- **Mixed cart** (PRD 02 COM-FR-081 said "define before launch"): split into Ready to check out and Needs a quote, following the Stage 3 cart wireframe. Raised to P0.  
- **VAT:** added (COM-FR-084, OPS-FR-019). Configurable rate, currently 7.5% in Nigeria; confirm with an accountant.  
- **Accepted file types:** JPEG, PNG and PDF at launch (COM-FR-054, TECH 04). SVG excluded for safety; malware scanning not needed at launch for these types (revisit with R-004).  
- **Real-time updates:** no websockets; focus refresh plus 30-second checks only while waiting.  
- **Guest link security:** links exchanged for a scoped session and removed from the URL; email code needed for acceptance and approval.

## 6\. Requirements added or raised

- COM-FR-045 (large format), COM-FR-046 (packaging), COM-FR-047 (promotional): in the Stage 3 wireframes but missing from PRD 02 v0.1.  
- COM-FR-054 (file types), COM-FR-083 (checkout steps), COM-FR-084 (VAT), COM-FR-085 (confirmation page).  
- PUB-FR-016 (no-result recovery) and PUB-SEO-009 (sitemap and IndexNow), from the Stage 3 interface architecture.  
- PUB-FR-007 (everyday search words) raised from P1 to P0.  
- PROJ-FR-012 (configuration quotes use the same quote process).  
- B2B-FR-012 (workspace billing), B2B-FR-013 (workspace search), B2B-FR-093 (deactivation).  
- OPS-FR-019 (VAT settings).  
- Customer accounts listed as P0 in PRD 00 section 15\.  
- Accessibility target: WCAG 2.2 AA (v1 said "WCAG AA" without a version).

## 7\. Security and compliance added

- Nigeria Data Protection Act 2023 section (TECH 06 section 12\) with privacy notice, rights requests, retention, breach handling, and points to confirm with a lawyer.  
- SPF, DKIM and DMARC for email (guest links arrive by email).  
- CSP details including Paystack domains.  
- Staff MFA recovery procedure and a two-STAFF\_ADMIN rule.  
- Incident switches and runbooks listed.

## 8\. Build plan

- 95 tickets in 16 passes, each sized for one Claude Code session of about 5 hours (S, M, L). v1 had passes too large for one session.  
- Shared building blocks moved to P01: guest links (were P07 in v1), files, emails, audit, permissions, rate limits, idempotency, help requests.  
- Payments core now comes before quotes, so deposits and balances reuse it.  
- Staging deployment moved into P00.  
- Customer accounts added as their own pass (P09) before organizations.  
- The Implementation Strategy (.md) and P00 Execution Brief (.md) are replaced by the Engineering Plan, TECH 08 working rules, the tracker and the session prompt.  
- One ADR Register replaces both the ADR document and the tracker's Decisions tab. ADR-011 to ADR-015 added. ADR-009 could not be found.

## 9\. Git conventions (ADR-016)

- Branch names change from `t05-04-quote-builder` to `feature/t05-04-quote-builder`. Commits and PR titles use Conventional Commits, authored as the owner with no AI attribution. TECH-08 §6 and §9, the session prompt, AGENTS.md and CLAUDE.md point to ADR-016.

## 10\. Not rewritten

- Stage 3.1B to 3.1F research documents and wireframe execution briefs: these are completed instructions for the design work, kept as history. Their decisions are carried into the v2 PRDs, and where they conflict (state names above) v2 wins.  
- Stage 3 Sitemap & SEO Map workbook and the Stage 4.3 content pack (deferred to launch readiness): unchanged.

## 11\. Owner amendments (5 October 2026)

- PRD-02 COM-FR-054: AI and SVG are accepted, matching TECH-04 §3.
- TECH-02 §14: the CONTACT rate-limit class added.
- TECH-07 §1 and §6: the free-tier single container recorded as a temporary deviation; Sentry from launch.
- ADR-015: hosting region and hosts recorded.
