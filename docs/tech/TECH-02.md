# HolyPearls — TECH 02: API, Background Jobs & Notifications

**Version:** 2.0 (27 September 2026). Replaces TECH 02 v1.

## 1\. API style

REST with JSON under `/v1`. Endpoints follow what customers and staff actually do, not raw tables. REST was chosen over GraphQL because HolyPearls is a series of workflows; REST is easier to test, secure, debug and version.

Examples:

GET   /v1/catalogue/products/:slug

POST  /v1/configurations

PATCH /v1/configurations/:id/selections

POST  /v1/projects/:id/submit

GET   /v1/quotes/:id

POST  /v1/quotes/:id/accept

POST  /v1/proofs/:id/decisions

POST  /v1/payments/intents/:id/attempts

POST  /v1/webhooks/paystack

POST  /v1/workspace/order-requests

POST  /v1/groups/:id/imports

Guest links are exchanged for a short guest session first (`POST /v1/guest-links/redeem`), so secrets never sit in ordinary API URLs after the first visit (TECH 03).

Use nested routes only when one record truly belongs to another (`/quotes/:id/versions`).

## 2\. Request and response shapes

- All shapes are Zod schemas in `packages/contracts`. The API validates every request with them, and OpenAPI is generated from them.  
- The web app uses types from `packages/contracts`, never database row types.  
- Responses return the object directly. No `{ success: true, data: … }` wrapper.  
- Every error uses one shape:

{

  "code": "QUOTE\_EXPIRED",

  "message": "This quote has expired.",

  "fieldErrors": { "email": "Enter a valid email address" },

  "context": { "quoteId": "…", "status": "EXPIRED" },

  "requestId": "req\_01J…"

}

The web app maps each `code` to the designed message and recovery screen. Error codes are listed in `packages/contracts/errors.ts`; adding a code means adding its screen copy.

HTTP status: 400 bad input, 401 not signed in, 403 signed in but not allowed (only when the person may know the record exists), 404 not found or not allowed to know it exists (TECH 03), 409 conflict (status or version), 422 business rule failed, 429 rate limited.

## 3\. Lists and paging

Cursor paging for order, quote, participant, audit and other working lists (`?cursor=…&limit=…`, maximum 100). Page numbers only for public catalogue pages, where numbered pages help SEO. No endpoint returns an unlimited list.

## 4\. Safe retries (idempotency)

These actions need an `Idempotency-Key` header (a random value the web app creates once per button press and reuses on retry):

creating a checkout, starting a payment attempt, accepting a quote, approving a proof, submitting a project, creating an Order Draft, submitting an order request, issuing a refund.

The server stores the key, the actor, a fingerprint of the request and the result in `idempotency_keys` for 24 hours. The same key with the same request returns the first result. The same key with a different request returns 409\.

Database unique constraints are the final safeguard (for example, one order per accepted quote version).

## 5\. Two people editing at once

Editable records shared between people carry a `version` number: configurations, projects, order requests, group collections, approval policies, templates, product rules. Updates send the version they started from. If someone else saved first, the API returns 409 `VERSION_CONFLICT` with the latest data, and the screen asks the user to review. The last save never silently wins.

## 6\. Caching

Public catalogue, category, project page and guide responses can be cached, and include cache tags so the web app refreshes them when staff publish a change. Quote, proof, order, payment, workspace and account responses send `Cache-Control: private, no-store`.

## 7\. Internal events

After a successful status change, the service records an internal event name, used to decide which jobs and emails to queue:

`project.submitted`, `quote.sent`, `quote.revision_requested`, `quote.accepted`, `quote.expiring`, `payment.succeeded`, `payment.failed`, `payment.review_required`, `proof.published`, `proof.changes_requested`, `proof.approved`, `order.item_status_changed`, `order.hold_opened`, `order.balance_required`, `shipment.dispatched`, `shipment.delivered`, `group.closed`, `template.needs_review`, `help_request.created`.

Event payloads contain IDs and minimal context, never full records or personal details.

## 8\. Background jobs

pg-boss, stored in PostgreSQL. No Kafka, RabbitMQ or Redis. Jobs are queued inside the same database transaction as the change that caused them.

**Default settings for every job** (only list a job below if it's different): retry 5 times; backoff starting at 30 seconds and doubling; 5-minute timeout; after the last retry, move to the dead-letter queue, show it on the admin Jobs page, and allow a manual retry. Every job payload has a schema version, the request ID, and resource IDs. Jobs must be safe to run twice. No secrets, file contents or unnecessary personal data in payloads.

| Queue | What it does | Different from default |
| :---- | :---- | :---- |
| `email.send` | Sends an email through `EmailSender` | 8 retries |
| `file.inspect` | Checks the real type and size of an upload | 2-minute timeout |
| `file.preview` | Makes a preview and thumbnail (PDF first page, images) | 2 retries, 2-minute timeout, 1 GB memory limit |
| `payment.check` | Asks Paystack for the final result of an unclear attempt | Schedule in TECH 05 section 6 |
| `quote.expire` | Expires a quote at its valid-until time | Created when the version is sent, scheduled for that time |
| `reminder.send` | Quote expiring, proof waiting, collection deadline, balance due | Created with its due time |
| `search.refresh` | Updates the search index after catalogue changes | 3 retries |
| `export.generate` | Builds a large export file | 15-minute timeout |
| `cleanup.daily` | Removes unused uploads (7 days), expired guest links and codes, stale drafts, old idempotency keys | Runs daily at 03:00 WAT |

Scheduled jobs handle housekeeping only. Business deadlines (quote expiry, reminders) get their own job, created at the moment the deadline is set, rather than scanning the whole database.

## 9\. Paystack webhooks

Endpoint: `POST /v1/webhooks/paystack`. Steps:

1. Read the raw request body.  
2. Verify the `x-paystack-signature` header (HMAC SHA-512 with the secret key). Reject if wrong.  
3. Save the event in `paystack_events` (unique on Paystack's event reference). If it already exists, reply 200 and stop.  
4. Reply 200 quickly.  
5. Queue follow-up processing, which confirms the transaction with Paystack's verify API before changing any payment status (TECH 05).

Paystack retries must never double-count.

## 10\. Notifications

Services decide that a notification is needed. The `platform` module decides how to send it. Launch channel: email. WhatsApp and SMS may be added later behind the same interface.

Each notification record stores: template, recipient, related record and link, channel, provider message ID, status (QUEUED, SENT, DELIVERED, FAILED), attempts, and timestamps.

Controllers never send email directly.

## 11\. What the web app does while waiting

Only low-risk draft edits update the screen before the server confirms (for example, a configuration choice). These wait for the server: accepting a quote, approving a proof, submitting a project, starting payment, closing a collection, approving a request.

Long work (exports, file processing) returns a status such as PROCESSING immediately; the screen checks back. No HTTP request stays open for long work.

## 12\. OpenAPI

Generated in CI. CI fails if the committed OpenAPI file doesn't match the code. The web app uses a typed client built from `packages/contracts`.

## 13\. Versioning

`/v1` is the launch version. Add fields without breaking existing clients. Only create `/v2` for a change existing clients can't handle.

## 14\. Rate limits

Stored in PostgreSQL (`rate_limit_buckets`), so limits work across several API instances without Redis (ADR-013). Counters are per IP and, where known, per account or guest link. Starting values (configurable):

| Class | Limit |
| :---- | :---- |
| PUBLIC\_READ | 300 requests / minute / IP |
| SEARCH | 60 / minute / IP |
| AUTH (sign-in, sign-up, password reset) | 10 / minute / IP and 5 / 15 minutes / account |
| GUEST\_LINK\_VERIFY (redeem link, request or enter email code, order lookup) | 10 / minute / IP; 5 wrong codes per code |
| CONTACT (help requests and other public "contact us" writes; added 2026-10-05) | 5 / 10 minutes / IP and 10 / hour / person |
| UPLOAD\_INTENT | 30 / hour / person |
| COMMERCIAL\_WRITE (checkout, payment, accept, approve, submit) | 20 / minute / person |
| ADMIN\_WRITE | 120 / minute / staff member |

Hosting-level protection (Vercel and Cloudflare) sits in front for large-scale abuse.

## 15\. Done when (for any feature)

The screen uses the real API. Input is validated. Permissions are checked. Migrations exist. Important status changes have tests. OpenAPI includes it. Errors show the designed recovery screen. Background effects are visible and can be retried.