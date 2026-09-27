# HolyPearls — TECH 03: Sign-in, Guest Access & Permissions

**Version:** 2.0 (27 September 2026). Replaces TECH 03 v1.

## 1\. Two separate questions

**Who are you?** (sign-in, guest link, email code) and **are you allowed to do this, to this record, right now?** (permissions). The code keeps these separate. Signing in never implies permission.

## 2\. Types of people

| Type | How they're identified | Can reach |
| :---- | :---- | :---- |
| Guest customer | Guest link \+ optional email code | Only the records the link points to |
| Account customer | Signed-in session | Their own records |
| Organization member | Signed-in session \+ membership | Organization records, filtered by locations and permissions |
| Participant | Guest link for one collection | Only their own submission |
| Staff | Signed-in session \+ MFA | Admin, according to staff permissions |

Every guest and account customer has a row in `customers`. Guests have a customer record with no user account. When a guest later creates an account and verifies the same email address, the account is linked to that customer record (section 6).

## 3\. Sign-in library

Better Auth handles: sessions, email \+ password, magic-link sign-in, email verification, password reset, sign-out everywhere, and MFA (authenticator app) for staff. It sits behind `IdentityAdapter` in `packages/auth`, so modules never call Better Auth directly.

HolyPearls owns organizations, locations, memberships, roles, permissions, record ownership and approval rules. Don't use Better Auth's organization plugin as the business model.

Ticket T00-06 must prove, before any feature work: a server-rendered page with a signed-in user; a browser request from a signed-in user; sign-out and revoke-all-sessions; staff MFA works (completed in T00-07); a test helper that signs in as any test person; and no tokens in localStorage. If Better Auth can't do this cleanly, replace it behind the adapter before P01.

## 4\. Sessions

- HttpOnly, Secure (in production), SameSite=Lax cookies, on the HolyPearls domain only.  
- Customers: 30-day session, extended while in use. Staff: 12-hour session, never extended beyond 12 hours.  
- Changing password or email ends all other sessions.  
- The browser talks to one domain (web forwards `/api/*` to the API), so no cross-site cookie setup.

## 5\. Guest links

A guest link is a secure URL that lets one person reach one thing: a quote, an order, a proof, a configuration draft, a project draft, or a collection submission.

- The secret is 32 random bytes (base64url). Only a SHA-256 hash is stored.  
- Each link records its purpose, the record it opens, the customer, an expiry and whether it's revoked.  
- Default expiry (configurable): quote, order and proof links 180 days; configuration and project draft links 90 days (matching draft clean-up); participant links until the collection closes, then 30 more days read-only.  
- When opened, the link is exchanged (`POST /v1/guest-links/redeem`) for a guest session cookie limited to that record and its children (an order link also opens that order's proofs, shipments and receipts). The browser is then redirected to a clean URL without the secret.  
- Pages opened by guest link send `Referrer-Policy: no-referrer`, and the secret is never logged or sent to analytics.  
- Staff can revoke a link. A customer can get a fresh order link by entering their email and order number on the "Find my order" page, followed by an email code.

**Email code check for important actions.** Accepting a quote, approving a proof, changing a delivery address and starting a participant payment need a 6-digit code sent to the customer's email, unless the session was verified in the last 24 hours. Codes expire after 10 minutes and allow 5 attempts. Signed-in customers with a verified email follow the same 24-hour rule.

## 6\. Linking guest history to a new account

When someone creates an account and verifies their email, all `customers` records with that exact verified email are linked to the account. Typing the same email without verifying never links anything.

## 7\. Organization roles and permissions

The system checks permissions. Roles are presets that grant a default set, which the Owner can adjust per member.

| Permission | Owner | Admin | Buyer | Location Manager | Approver | Viewer |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| View organization records (within locations) | ✓ | ✓ | own only | ✓ | ✓ | ✓ |
| Create orders, projects, order requests | ✓ | ✓ | ✓ | ✓ | – | – |
| Approve organization requests | ✓ | – | – | – | ✓ | – |
| Accept HolyPearls quotes | ✓ | ✓ | – | – | – | – |
| Manage brand assets and templates | ✓ | ✓ | – | – | – | – |
| Manage group collections | ✓ | ✓ | ✓ | ✓ | – | – |
| Manage company stores and allowances | ✓ | ✓ | – | – | – | – |
| Manage team and roles | ✓ | ✓ | – | – | – | – |
| View billing | ✓ | ✓ | – | – | – | – |
| Export organization data | ✓ | ✓ | – | – | – | – |
| Transfer ownership | ✓ | – | – | – | – | – |

"Approve organization requests" and "Accept HolyPearls quotes" are always separate and can be granted to anyone independently.

**Location scope.** A member assigned to specific locations only sees records belonging to those locations, unless they hold "All locations". Every organization record either has a `location_id` or is explicitly organization-wide. Child records inherit their parent's location; scope is never guessed at query time.

## 8\. Staff permissions

`CATALOGUE_MANAGE`, `PRICING_MANAGE`, `CONTENT_MANAGE`, `QUOTE_MANAGE`, `PROOF_MANAGE`, `PRODUCTION_MANAGE`, `FULFILMENT_MANAGE`, `PAYMENT_VIEW`, `PAYMENT_MANAGE` (review queue, payment settings), `REFUND_ISSUE`, `CUSTOMER_SUPPORT`, `ORGANIZATION_SUPPORT`, `EXPORT_PERSONAL_DATA`, `STAFF_ADMIN`, `SECURITY_ADMIN`, `AUDIT_VIEW`.

Staff permissions are separate from customer organization roles. One staff member can hold several.

## 9\. High-risk actions

These need the right permission, a confirmation screen, an MFA check in the last 15 minutes (staff) or an email code in the last 24 hours (customers), and an audit entry: raising someone's permissions; changing or removing the final Owner; refunds; overriding a quote acceptance; cancelling an order after commitment; replacing an approved proof or file; changing security or payment settings; exporting personal data.

## 10\. MFA

Required for all staff before they can use production admin. Recovery: another `STAFF_ADMIN` resets the MFA after verifying the person's identity by phone, and the reset is audited. At least two people must hold `STAFF_ADMIN` so nobody gets locked out.

Customer and organization MFA is optional at launch.

## 11\. Invitations

Organization and staff invitations use one-time secrets (stored hashed) that expire after 7 days. Accepting requires signing in with the invited email address. Statuses: PENDING, ACCEPTED, EXPIRED, REVOKED.

## 12\. How permission checks work in code

Every request builds an **ActorContext**: actor type, user or guest-session ID, customer ID, staff flag and permissions, organization memberships, active organization, allowed locations, organization permissions, when the email or MFA was last verified, and the request ID.

Each module has **policy functions**, for example `canAcceptQuote(actor, quote)`, that check: identity, ownership, organization, location, permission, record status, and any extra verification. Controllers call policies; they never write permission `if` statements themselves.

**Scoped data access.** Organization and customer data is read with functions that require the scope:

findOrderForActor(orderId, actor)   // correct

findOrderById(orderId)               // not allowed in customer or workspace code

Unguessable IDs make guessing harder but are never a permission check.

**403 or 404?** Return 404 when the person shouldn't learn the record exists (another customer's or organization's record). Return 403 when they can see it but not perform this action (a Viewer trying to edit).

The web app hides buttons using permissions returned by the API, but that's only for display. The server always checks again.

## 13\. Cross-site request protection

Every state-changing request from the browser must use a POST, PUT, PATCH or DELETE method, carry the SameSite=Lax session cookie, and pass an `Origin` header check against the HolyPearls domain. Better Auth's built-in protection stays on. Never loosen cookie settings to work around a front-end problem.

## 14\. Database row-level security

Not used at launch. Permissions depend on record status and location rules that are clearer in application code. Protection comes from scoped data access, policy functions, a least-privilege database user, and the attack tests below. Row-level security may be added later to the most sensitive tables as an extra layer.

## 15\. What to record in the audit log

Repeated sign-in failures (5 or more in 15 minutes), password and MFA changes, session revocations, email changes, ownership changes, staff permission changes, and every high-risk action in section 9\. Never log passwords, codes, session secrets or guest link secrets.

## 16\. Privacy

Participants only see their own submission. Workspace members only receive fields their permissions allow. Staff support uses a read-only support view and never signs in as the customer. Personal-data exports need `EXPORT_PERSONAL_DATA` and are logged.

## 17\. Required attack tests

These run in CI from the ticket that introduces each feature:

- Customer A cannot open Customer B's configuration, project, quote, proof, order or receipt.  
- A guest link for one order cannot open another order, or that customer's other orders.  
- Expired and revoked guest links fail.  
- Organization A cannot read Organization B's data.  
- A Lekki Location Manager cannot see Victoria Island records.  
- A participant cannot read another participant's submission.  
- A Viewer cannot change anything.  
- An Approver cannot accept a HolyPearls quote unless separately granted.  
- A Buyer cannot approve their own request when separation is on.  
- The last Owner cannot be removed.  
- A deactivated member loses access immediately.  
- Staff without a permission get 403 on that admin action.  
- Accepting a quote or approving a proof without a recent email code fails.

## 18\. Done when

Every protected PRD action has a policy function naming the person type, record, permission and scope, and it's enforced in one place.