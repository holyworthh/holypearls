# HolyPearls — Architecture Decision Register (ADRs)

**Version:** 2.0 (27 September 2026). Replaces the v1 register document and the Decisions tab of the v1 tracker. This document is now the one place for decisions.

Each entry: the decision, why, what we gave up, and what would make us revisit it.

## ADR-001 — One modular application

**Status:** Accepted. **Decision:** One codebase and one database, run as web, api and worker, split into modules (TECH 00). **Why:** Lots of business logic, modest traffic, a small team. One place for permissions and transactions; cheap and simple to run. **Trade-off:** Modules share one deploy; a bad release affects everything. **Revisit if:** a separate team needs to own a module, or measured load needs one part to scale separately.

## ADR-002 — REST with shared Zod contracts and generated OpenAPI

**Status:** Accepted. **Why:** Workflow-heavy product; REST is easier to secure, test and version; one schema drives validation, types and docs. **Revisit if:** outside clients need flexible graph-style queries.

## ADR-003 — PostgreSQL \+ Drizzle

**Status:** Accepted. **Why:** Strong transactions and constraints; explicit SQL migrations. **Revisit if:** no expected trigger.

## ADR-004 — pg-boss for background jobs

**Status:** Accepted. **Why:** Reliable jobs, retries and schedules without running Redis or a message broker; jobs can be queued in the same transaction as the change. **Trade-off:** Job traffic uses the main database. Worker needs a direct (unpooled) connection. **Revisit if:** job load measurably slows the main database, or a non-Node service needs to consume jobs.

## ADR-005 — Better Auth behind an IdentityAdapter

**Status:** Proposed until ticket T00-06 passes; then Accepted or replaced. **Why:** Modern TypeScript sessions, magic links and MFA, while our own adapter keeps the rest of the code independent of it. **Revisit if:** T00-06 fails any TECH 03 section 3 check.

## ADR-006 — Private S3-compatible file storage

**Status:** Accepted. **Why:** Direct browser uploads and downloads with short-lived links; portable between providers (R2 in production, MinIO locally).

## ADR-007 — PostgreSQL search first

**Status:** Accepted. **Why:** Catalogue size doesn't justify a search service. Full-text \+ trigram \+ staff phrases covers the needs. **Revisit if:** measured search quality, speed or filtering needs go beyond what PostgreSQL can do.

## ADR-008 — One Next.js app for public, customer, workspace and admin

**Status:** Accepted. **Why:** Shared design system, sessions and contracts; less to deploy. **Revisit if:** a separate team or deployment schedule is needed for admin.

## ADR-009

Not found in the documents available on 27 Sep 2026\. If the v1 tracker's Decisions tab contains an ADR-009, copy it here.

## ADR-010 — Paystack \+ Bachs multi-provider payment routing

**Status:** Superseded by ADR-011 on 27 September 2026\. Kept for history. Its fallback rules, method resolver and multi-provider tests are removed from all v2 documents.

## ADR-011 — Paystack is the only payment provider at launch

**Status:** Accepted, 27 September 2026\. **Decision:** Paystack handles all online payments, for Nigerian customers (card, bank transfer, USSD, Apple Pay where enabled) and international customers (Visa, Mastercard, Verve, American Express cards). Checkout is in NGN; quotes can be in USD when the Paystack account has USD enabled. Customers choose their method inside Paystack's checkout. The code keeps a `PaymentGateway` interface and the intent/attempt records. **Why:** A second provider as fallback was the most complex part of the design (fallback rules, cross-provider duplicate handling, extra review tooling) to guard against rare, usually short Paystack outages. Paystack already covers international cards for Nigerian businesses once enabled. **Trade-off:** A Paystack outage pauses online payment. Mitigated by the pause switch, clear messaging, automatic checks of unclear payments, and staff being able to take payment offline if urgent. **Revisit if:** Paystack outages cause measurable lost sales; many international customers can't pay by card; or PayPal or a regional method is needed for a specific market. Adding a provider means a new adapter, not a checkout rewrite.

## ADR-012 — Ten modules instead of eighteen

**Status:** Accepted, 27 September 2026\. **Decision:** identity, catalogue, configuration, files, sales, payments, orders, organizations, groups, platform (TECH 00 section 4). Search joins catalogue; commerce, projects and quotes become sales; proofs and fulfilment join orders; workspace joins organizations; notifications and audit become platform; admin is a section of the web app, not a module. **Why:** Modules with the same purpose were split for no benefit, adding boundaries to maintain without adding safety. **Revisit if:** a module grows too large to understand; split it along its sub-areas.

## ADR-013 — Rate limits stored in PostgreSQL

**Status:** Accepted, 27 September 2026\. **Why:** In-memory limits break when there's more than one API instance; Redis is excluded (ADR-001, ADR-004). A small counter table works across instances. Hosting-level protection handles large-scale abuse. **Revisit if:** rate-limit writes show up as a measurable database load.

## ADR-014 — Paystack checkout chooses the payment method

**Status:** Accepted, 27 September 2026\. **Decision:** HolyPearls shows the currently enabled methods before payment and passes the enabled channels to Paystack. The customer picks the method inside Paystack's checkout. No HolyPearls "method resolver". **Why:** With one provider, Paystack already knows which methods the account and device support. Building our own resolver duplicated that.

## ADR-015 — Hosting region

**Status:** To be decided in T00-08. **Decision:** The API, worker and database share one region, the closest to Nigeria that all three platforms offer. Record the chosen region and host here.

## Recording a new decision

Copy the format above. Link the ADR from the TECH document it affects. If it changes product behavior, amend the PRD too.