# HolyPearls — TECH 00: System Architecture & Modules

**Version:** 2.0 (27 September 2026). Replaces TECH 00 v1 and the architecture sections of the Stage 5 Engineering Plan (which now only covers build order). **Decisions:** see the ADR Register (v2) in folder C; summary in section 13\.

## 1\. The shape of the system

HolyPearls is **one application split into clear modules** (a "modular monolith"). It runs as three processes that share one code repository and one PostgreSQL database:

| Process | What it does |
| :---- | :---- |
| **web** (Next.js) | Customer screens: public site, customer pages and workspace. |
| **admin** (Next.js) | Staff screens, on their own subdomain (ADR-017). |
| **api** (NestJS) | All business rules, permission checks, database writes, Paystack webhooks, and the OpenAPI description. |
| **worker** (Node, same code as api) | Background jobs: emails, file checks, payment checks, expiring quotes, reminders, exports. |

Only **api** and **worker** can touch the database. **web** and **admin** always go through the API.

Why this size: HolyPearls has a lot of business logic but modest traffic (section 10). One application gives us one place to enforce permissions, simple transactions, cheap hosting and easy local development. A module can be split out later if real load or a separate team ever needs it.

We will **not** use: microservices, Kafka or any message broker, Redis, Elasticsearch or Algolia, Kubernetes, GraphQL, a separate CMS, websockets, or a general workflow engine.

## 2\. Technology

| Area | Choice |
| :---- | :---- |
| Repository | pnpm workspaces \+ Turborepo |
| Web | Next.js 16 (App Router). Public pages rendered on the server and cached. TanStack Query only for private, changing data. |
| API | NestJS 12, REST \+ JSON under `/v1` |
| Request and response shapes | Zod schemas in `packages/contracts`, used for validation and to generate OpenAPI |
| Database | PostgreSQL \+ Drizzle ORM, SQL migrations |
| Background jobs | pg-boss (stores jobs in the same PostgreSQL) |
| Files | Private S3-compatible storage. Cloudflare R2 in production, MinIO locally. |
| Sign-in | Better Auth, wrapped in our own `IdentityAdapter` (confirmed in ticket T00-06) |
| Payments | Paystack only, behind a `PaymentGateway` interface |
| Email | Resend, behind an `EmailSender` interface |
| Search | PostgreSQL full-text search \+ `pg_trgm` for spelling tolerance \+ staff-managed phrases |
| Errors and logs | Sentry, structured JSON logs, request IDs |

Exact library versions are pinned in the repository when T00-01 runs, and recorded in its ticket report. These documents set direction; they are not an instruction to install a version that doesn't exist yet.

## 3\. Repository layout

apps/

  web/        Next.js

  api/        NestJS

  worker/     background jobs (imports api modules)

packages/

  contracts/  Zod request/response schemas, IDs, enums (safe for the browser)

  db/         Drizzle schema, migrations, database client, transaction helper

  ui/         design system components (Stage 4\)

  auth/       Better Auth setup and IdentityAdapter

  config/     typed, validated environment variables

  testkit/    test factories, test actors, fake Paystack, fake email, test DB helpers, seed data

## 4\. The ten modules

Before: 18 modules. After: 10\. Modules with the same purpose were combined (ADR-012).

| Module | Owns | Merged from |
| :---- | :---- | :---- |
| **identity** | Users, sessions, staff accounts and MFA, customer records (for guests and account holders), guest links, email one-time codes, invitations | identity |
| **catalogue** | Categories, products, options, product rules, prices, VAT, delivery zones, installation rules, media, public content (projects, guides, case studies), SEO fields, search index and search phrases | catalogue, search |
| **configuration** | Configuration drafts, selections, size grids, personalization rows, price calculation and price state | configuration |
| **files** | Uploads, file checks, previews, download links, clean-up | files |
| **sales** | Cart, checkout, projects, recommendations, quotes, quote versions, change requests, acceptances | commerce, projects, quotes |
| **payments** | Payment schedules, installments, payment intents, attempts, Paystack events, reviews, receipts, refunds, payment settings | payments |
| **orders** | Orders, order items, production status, holds, quality check, proofs and proof versions, shipments, reorders, problem reports | orders, proofs, fulfilment |
| **organizations** | Organizations, locations, memberships, roles and permissions, order requests, approvals, brand assets and versions, templates, workspace views | organizations, workspace |
| **groups** | Group collections, participants, submissions, CSV imports, Order Drafts, company stores, allowances | groups |
| **platform** | Audit log, notifications and email templates, help requests, rate limiting, idempotency keys, exports, job helpers | notifications, audit |

**Admin is not a module.** Admin screens live in the separate admin app (`apps/admin`, ADR-017) on their own subdomain. They call the same API and module services with staff permissions. Admin can never skip a business rule, and the API serves admin routes only to the admin app.

## 5\. Rules between modules

1. A module may call another module only through that module's exported service functions.  
2. A module never reads or writes another module's tables directly.  
3. Controllers (API endpoints) contain no business rules; they validate input, build the ActorContext (TECH 03\) and call a service.  
4. Worker jobs call the same services as the API.  
5. `apps/web` never imports `packages/db`.  
6. Every outside service sits behind one interface in one place: `PaymentGateway` (Paystack), `ObjectStorage` (R2), `EmailSender` (Resend), `Clock`, `IdGenerator`. Tests use fake versions from `packages/testkit`.

## 6\. How a request flows

- **Public pages:** browser → Next.js server → API → database. Pages are cached and refreshed when staff publish changes (cache tags).  
- **Private pages and actions:** browser → Next.js on the same domain → API. The web app forwards `/api/*` to the API service, so the browser only ever talks to one domain. This keeps cookies simple and avoids cross-origin setup.  
- **Paystack webhooks:** Paystack → API directly, on `/v1/webhooks/paystack`.  
- **Large files:** browser → R2 directly, using a short-lived upload link from the API. Files never pass through Next.js.

## 7\. Database basics

Full rules in TECH 01\. In short: PostgreSQL is the source of truth; external IDs are random (UUIDv7) and never sequential; money is stored as whole minor units (kobo, cents) with a currency code; timestamps use `timestamptz`; relationships use foreign keys; uniqueness and idempotency use unique constraints; JSONB is used only for saved copies and flexible metadata.

## 8\. Background work

Job queues and their settings are listed in TECH 02 section 8\. Every job uses the shared default (5 retries, backoff, dead-letter queue, 5-minute timeout) unless TECH 02 says otherwise. Jobs are added in the same database transaction as the change that caused them, so there's no need for a separate event system.

## 9\. When things fail

An outside failure must never corrupt our records:

| Failure | What happens |
| :---- | :---- |
| Email fails | The business change is already saved. The email job retries. |
| File processing fails | The file stays PROCESSING or becomes NEEDS\_REVIEW. The customer can re-upload. |
| Paystack is slow or unclear | The payment stays "Processing". The automatic check (TECH 05 section 6\) resolves it. |
| Search index update fails | The catalogue is still correct. The index catches up on the next run. |
| Analytics fails | Never blocks the customer. |
| Worker is down | Public browsing and ordering keep working. Jobs wait and run when the worker is back. |

## 10\. Expected scale

Thousands of products, options and configuration records; tens of thousands of customers and orders; up to a few hundred people using the site at the same moment; a steady but controlled volume of artwork files. PostgreSQL and one application handle this comfortably. We'll measure before adding anything.

## 11\. What we don't trust

Everything from the browser (including IDs and organization IDs), uploaded files, CSV data, search text, Paystack webhooks until the signature is verified, text staff type into admin, and job payloads until checked against their schema.

## 12\. Real-time updates

No websockets. Quote, proof, order and payment pages refresh when the tab regains focus, when the customer presses refresh, and every 30 seconds only while something they're waiting on is still pending (for example "Processing payment"). Emails link back to the page for anything important.

## 13\. Decision records (ADRs)

| ADR | Decision | Status |
| :---- | :---- | :---- |
| ADR-001 | One modular application | Accepted |
| ADR-002 | REST \+ Zod contracts \+ generated OpenAPI | Accepted |
| ADR-003 | PostgreSQL \+ Drizzle | Accepted |
| ADR-004 | pg-boss for background jobs | Accepted |
| ADR-005 | Better Auth behind IdentityAdapter | Proposed until T00-06 passes |
| ADR-006 | Private S3-compatible file storage | Accepted |
| ADR-007 | PostgreSQL search first | Accepted |
| ADR-008 | One Next.js app for public, customer, workspace and admin | Accepted |
| ADR-009 | Not found in the available documents | See ADR Register |
| ADR-010 | Paystack \+ Bachs multi-provider routing | **Superseded by ADR-011** |
| ADR-011 | Paystack is the only payment provider at launch | Accepted 27 Sep 2026 |
| ADR-012 | Consolidate 18 modules into 10 | Accepted 27 Sep 2026 |
| ADR-013 | Rate limits stored in PostgreSQL | Accepted 27 Sep 2026 |
| ADR-014 | Paystack checkout chooses the payment method | Accepted 27 Sep 2026 |
| ADR-015 | Hosting region | Decide in T00-08 |

Reasons, trade-offs and review triggers are in the ADR Register (v2).

## 14\. Done when (P00)

Web, API and worker run locally and in staging. One migration path owns the database. One contracts package serves web and API. The sign-in check (T00-06) passes. The worker runs a demo job. A private file upload link can be tested. Health endpoints respond. One request goes all the way: web → API → database → background job → visible result.