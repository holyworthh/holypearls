# HolyPearls — TECH 01: Data Model & Status Rules

**Version:** 2.0 (27 September 2026). Replaces TECH 01 v1. This is the **single place** that defines tables and allowed status changes. Status names come from PRD 00 section 8\. If this document and PRD 00 disagree on a name, fix this document.

## 1\. Modelling rules

- PostgreSQL is the source of truth. Constraints in SQL (foreign keys, unique, check) are the real guard; application checks are a second layer.  
- IDs: UUIDv7 primary keys. Customer-facing references are separate columns (`HP-2026-0142`, `HP-Q-2026-0031`, `HP-P-…`, `HP-G-…`), unique, never used for access.  
- Money: `amount_minor bigint` \+ `currency char(3)`. ₦450,000.00 \= 45000000\. \$125.50 \= 12550\. Never floating point. No automatic currency conversion.  
- Time: `timestamptz`. Every table has `created_at`; editable tables also have `updated_at`.  
- Records that several people might edit at once have a `version integer` column (optimistic locking, TECH 02 section 5).  
- Use status or `archived_at` columns. Only use soft delete where a PRD needs recovery.  
- JSONB only for saved copies (snapshots) and flexible metadata. Known relationships get real tables. No "entity-attribute-value" tables for configuration.  
- History is never edited: accepted quote versions, proof versions, asset versions, order specifications, approvals, payment records and participant payments are insert-only.

## 2\. Tables by module

**identity:** `users`, `sessions` (Better Auth), `staff_profiles`, `staff_permission_grants`, `customers` (one per person, with or without a user account; normalized email and phone), `guest_links` (hash of secret, purpose, target type and ID, customer ID, expires\_at, revoked\_at, last\_used\_at), `email_codes` (hash, purpose, attempts, expires\_at), `invitations`.

**catalogue:** `categories`, `products`, `product_options`, `product_option_values`, `product_rules` (compatibility, MOQ, lead time, artwork later, sample, proof requirement), `price_rules` (base, tiers, add-ons, effective\_from), `tax_settings`, `delivery_zones`, `installation_rules`, `product_media`, `product_relations`, `content_pages` (project pages, guides, case studies, about), `navigation_lists`, `search_documents`, `search_phrases`.

**configuration:** `configurations`, `configuration_selections`, `configuration_sizes`, `configuration_personalization_rows`, `configuration_files` (links to files), `price_results` (saved result of each price calculation, with the rule versions used).

**files:** `files` (storage key, original and safe name, declared and detected type, size, status, owner type and ID, purpose), `file_renditions` (preview, thumbnail, PDF pages).

**sales:** `carts`, `cart_items` (with configuration snapshot), `checkouts` (snapshot: items, delivery, VAT, total), `projects`, `project_items`, `project_recommendations` (stable key, reason, `customer_overridden` flag), `recommendation_rules`, `quotes`, `quote_versions`, `quote_line_items`, `quote_change_requests`, `quote_acceptances`.

**payments:** `payment_schedules`, `installments`, `payment_intents`, `payment_attempts`, `paystack_events`, `payment_reviews`, `receipts`, `refunds`, `payment_settings`.

**orders:** `orders` (with commercial snapshot), `order_items` (with production spec snapshot), `order_item_events`, `holds`, `qc_results`, `proofs`, `proof_versions`, `proof_comments`, `proof_decisions`, `change_requests`, `shipments`, `shipment_items`, `shipment_events`, `reorders`, `problem_reports`.

**organizations:** `organizations`, `locations`, `memberships`, `membership_locations`, `membership_permissions`, `approval_policies`, `order_requests`, `organization_approvals`, `brand_assets`, `brand_asset_versions`, `templates`, `template_fields`, `template_asset_links`.

**groups:** `group_collections`, `participants`, `participant_submissions`, `import_batches`, `import_rows`, `order_drafts`, `company_stores`, `company_store_items`, `allowance_policies`, `allowance_ledger`.

**platform:** `audit_log`, `notifications`, `notification_templates`, `help_requests`, `rate_limit_buckets`, `exports`, `idempotency_keys`.

## 3\. How status changes are made

Status changes are never done by database triggers. Each allowed change is one service function that, in one transaction:

1. checks the current status allows this change;  
2. checks the person is allowed (TECH 03);  
3. checks prerequisites;  
4. writes the change;  
5. writes a history row and, if important, an audit entry;  
6. queues any emails or follow-up jobs.

Anything not listed below is not allowed.

## 4\. Status rules

**Product (catalogue):** DRAFT → PUBLISHED ⇄ TEMPORARILY\_UNAVAILABLE; any → ARCHIVED. Staff with catalogue permission.

**File:** PENDING\_UPLOAD → PROCESSING → READY | NEEDS\_REVIEW | REJECTED. NEEDS\_REVIEW → READY | REJECTED (staff). The worker makes automatic changes.

**Configuration:** DRAFT → IN\_CART | QUOTE\_REQUESTED → CONVERTED (became an order line or quote line). DRAFT → EXPIRED after 90 days with no activity (configurable). Price state (PRICE\_READY etc.) is a separate field recalculated on every change.

**Project:** DRAFT → SUBMITTED (customer) → UNDER\_REVIEW (staff) → QUOTED (first quote version sent) → ORDERED (quote accepted) → COMPLETED (all order items delivered or cancelled). DRAFT, SUBMITTED, UNDER\_REVIEW or QUOTED → CANCELLED (customer or staff). DRAFT → EXPIRED after 90 days with no activity.

**Quote:** PENDING\_REVIEW → READY (staff sends a version) → REVISION\_REQUESTED (customer) → READY (staff sends next version) … READY → ACCEPTED | DECLINED (customer) | EXPIRED (job at valid-until). EXPIRED → PENDING\_REVIEW when the customer asks for an updated quote. **Quote version:** DRAFT → SENT → SUPERSEDED (when a newer version is sent) | ACCEPTED | DECLINED | EXPIRED. Only one version per quote can be SENT at a time. A SENT version's content can't change. **Acceptance blockers** (checked when accepting, not stored as a status): quote not READY; version not the current SENT one; past valid-until; organization re-approval required; missing "Can accept HolyPearls quotes" permission; email code check not recent enough.

**Installment:** NOT\_DUE → DUE (trigger reached) → PROCESSING (attempt started) → PAID, or back to DUE (attempt failed or abandoned). Any unpaid → CANCELLED (order cancelled). Refunds are recorded against PAID installments; the installment stays PAID.

**Payment intent** (one payable amount): OPEN → PROCESSING (attempt started) → SUCCEEDED, or back to OPEN (attempt failed or abandoned). PROCESSING → REVIEW\_REQUIRED (unclear after all checks, or amount/currency mismatch). SUCCEEDED → REVIEW\_REQUIRED (a second attempt also succeeded). OPEN → CANCELLED (order or checkout cancelled). REVIEW\_REQUIRED → SUCCEEDED or OPEN by a staff resolution (audited). **Payment attempt** (one Paystack transaction): CREATED → PENDING → SUCCEEDED | FAILED | ABANDONED. PENDING → UNKNOWN after 48 hours without a final answer. UNKNOWN → SUCCEEDED | FAILED if Paystack later confirms. Details in TECH 05\.

**Customer-facing payment status** (PRD 00\) is **worked out**, not stored. Check these in order; the first that matches wins:

1. an open payment review, or a removed participant who paid → PAYMENT\_RESOLUTION\_REQUIRED  
2. refunds cover the whole paid amount → REFUNDED  
3. some refunds → PARTIALLY\_REFUNDED  
4. an installment is PROCESSING → PAYMENT\_PENDING  
5. an installment is DUE and its latest attempt failed or was abandoned → PAYMENT\_FAILED  
6. an installment is DUE and it is the only installment → PAYMENT\_DUE  
7. the first of several installments is DUE → DEPOSIT\_DUE  
8. a later installment is DUE → BALANCE\_DUE  
9. all installments PAID → PAID  
10. the first installment PAID, the next one NOT\_DUE, and exactly one paid → DEPOSIT\_PAID  
11. more than one PAID and some NOT\_DUE → PARTIALLY\_PAID  
12. nothing due yet → NOT\_DUE

**Proof:** NOT\_REQUIRED, or PREPARING → AWAITING\_APPROVAL (staff publishes a version) → APPROVED | CHANGES\_REQUESTED (customer). CHANGES\_REQUESTED → REVISION\_IN\_PROGRESS (staff) → AWAITING\_APPROVAL (next version). **Proof version:** DRAFT → PUBLISHED → APPROVED | CHANGES\_REQUESTED | SUPERSEDED. Questions are comments; they don't change status.

**Change request** (after proof approval or after quote acceptance): OPEN → UNDER\_REVIEW → ACCEPTED | DECLINED. Accepting may create a new quote version or proof version.

**Order item:** AWAITING\_PREREQUISITE → QUEUED (all prerequisites met: proof approved if required, deposit paid if required, artwork ready) → IN\_PRODUCTION → QUALITY\_CHECK → READY\_AWAITING\_RELEASE (a release condition is unmet) or READY\_TO\_DISPATCH → DISPATCHED (in a dispatched shipment) → DELIVERED. QUALITY\_CHECK → IN\_PRODUCTION (rework). READY\_AWAITING\_RELEASE → READY\_TO\_DISPATCH happens automatically when the balance is paid. Any status before DISPATCHED → CANCELLED (staff; customer only before production if policy allows). **Hold:** a separate record (OPEN → RESOLVED) that pauses an item without changing its underlying status. While open, the item displays ON\_HOLD. **Order summary status** is worked out from its items, holds, installments and shipments, following PRD 00 section 8\.

**Shipment:** PREPARING → LABEL\_CREATED → IN\_TRANSIT → OUT\_FOR\_DELIVERY → DELIVERED. IN\_TRANSIT or OUT\_FOR\_DELIVERY → ATTEMPTED\_DELIVERY → OUT\_FOR\_DELIVERY | EXCEPTION. Any before DELIVERED → EXCEPTION → IN\_TRANSIT | RETURNED. Staff update by hand at launch.

**Problem report:** NEW → TRIAGED → CLOSED. **Help request:** OPEN → ANSWERED → CLOSED.

**Organization membership:** ACTIVE ⇄ DEACTIVATED. **Invitation:** PENDING → ACCEPTED | EXPIRED | REVOKED.

**Order request:** DRAFT → PENDING\_APPROVAL → APPROVED | REJECTED. APPROVED → SENT\_TO\_HOLYPEARLS (becomes a project or quote request). If no approval is needed: DRAFT → SENT\_TO\_HOLYPEARLS. Any before SENT\_TO\_HOLYPEARLS → CANCELLED. **Organization approval:** insert-only record with decision APPROVED or REJECTED, approved amount and scope. Re-approval creates a new record; the old one is kept.

**Brand asset version:** PROCESSING → NEEDS\_REVIEW → PRODUCTION\_READY. PRODUCTION\_READY → SUPERSEDED (newer version approved) | RETIRED (organization stops new use). Any → ARCHIVED. **Template:** DRAFT → AWAITING\_APPROVAL → APPROVED → NEEDS\_REVIEW (a linked asset version retired, or a product rule changed) → AWAITING\_APPROVAL. Any → ARCHIVED.

**Group collection:** DRAFT → OPEN ⇄ PAUSED → CLOSED → NEEDS\_REVIEW ⇄ READY\_TO\_ORDER → ORDER\_DRAFT\_CREATED. CLOSED, NEEDS\_REVIEW, READY\_TO\_ORDER or ORDER\_DRAFT\_CREATED → OPEN (reopen, following PRD 05 B2B-FR-055). Any before ORDER\_DRAFT\_CREATED → CANCELLED. **Order draft:** CURRENT → STALE (collection reopened) | SUBMITTED (turned into an order request or quote request). **Participant submission:** NOT\_STARTED → IN\_PROGRESS → SUBMITTED ⇄ NEEDS\_CORRECTION. Any → REMOVED (organizer).

**Company store:** DRAFT → ACTIVE ⇄ PAUSED → ARCHIVED.

## 5\. Saved copies (snapshots)

Take an unchangeable saved copy when:

- a configuration goes into the cart or into a quote request;  
- a checkout is created (items, prices, VAT, delivery);  
- a quote version is sent;  
- a quote version is accepted and becomes an order;  
- a proof is approved (the production specification);  
- a collection is turned into an Order Draft;  
- a template order is placed.

Never rebuild past prices or specifications from today's catalogue rows.

## 6\. Migrations

All changes use committed migration files. Never push schema changes straight to production. Destructive changes follow three steps: add the new column or table → move the data and ship code that uses it → remove the old column in a later release.

## 7\. Indexes

Index the paths we actually use: product slug and status, organization and status, work queues (status \+ created\_at), customer references, Paystack references, guest link hashes, file storage keys, and foreign keys used in joins. Review query plans once realistic seed data exists (P14). Don't index every column up front.

## 8\. Done when

Every PRD entity has a table. Every status change has one owning service function and appears in section 4\. No important screen depends on history that could be overwritten.