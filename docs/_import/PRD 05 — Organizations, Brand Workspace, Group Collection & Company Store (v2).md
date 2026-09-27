# HolyPearls — PRD 05: Organizations, Brand Workspace, Group Collection & Company Store

**Version:** 2.0 (27 September 2026). Replaces PRD 05 v0.1. **Built in:** P10 (organizations and workspace), P11 (assets, templates, approvals), P12 (group collection and company store).

## 1\. Purpose

Features for businesses that buy repeatedly: organizations and locations, team permissions, controlled logos and product templates, internal purchase approval, collecting sizes and details from many people, and private company stores.

The workspace **adds to** normal ordering. It never replaces it. It reuses the same projects, quotes, proofs and orders from PRD 03 and 04; there is no second tracking system.

## 2\. Organizations and locations

**B2B-FR-001 — Organization (P0).** A business record with one or more locations.

**B2B-FR-002 — Location (P1).** A location can have its own addresses, members, available templates and stores, visible orders, and approval rules.

**B2B-FR-003 — Roles and permissions (P1).** Owner, Admin, Buyer, Location Manager, Approver, Viewer. The server checks permissions and location access on every request (TECH 03).

**B2B-FR-004 — No pointless location switching (P1).** People assigned to one location never see a location switcher.

## 3\. Workspace

**B2B-FR-010.** The overview shows, in order: Needs Attention, Quick Actions, Active Work, Templates, Groups.

**B2B-FR-011.** Workspace order and project lists are filtered views of the normal orders and projects.

**B2B-FR-012.** Billing (Owner and Admin only) shows receipts, balances due and payment history across the organization's orders.

**B2B-FR-013.** Workspace search finds assets, templates, orders and groups the person is allowed to see.

## 4\. Brand assets

**B2B-FR-020.** Assets are versioned and focused on production use (print or embroidery readiness).

**B2B-FR-021.** Each asset version has one status: PROCESSING, NEEDS\_REVIEW, PRODUCTION\_READY, SUPERSEDED, RETIRED (can't be used for new orders) or ARCHIVED. "Replace version" is an action, not a status.

**B2B-FR-022.** Past orders keep pointing at the exact asset version they used.

**B2B-FR-023.** Uploading V5 never overwrites V4.

**B2B-FR-024.** If V4 is still allowed, templates using it stay APPROVED and show "Available using logo V4" until someone moves them to V5. If V4 is retired, templates using it move to NEEDS\_REVIEW and show "Blocked — asset review required".

## 5\. Workspace Product Templates

**B2B-FR-030.** A template points to a Catalogue Product, an approved configuration and specific asset versions.

**B2B-FR-031.** Each field is either Company Controlled (locked) or Buyer Editable, with a stated reason.

**B2B-FR-032.** Template statuses: DRAFT, AWAITING\_APPROVAL (by HolyPearls production staff), APPROVED, NEEDS\_REVIEW, ARCHIVED.

**B2B-FR-033.** A Template Order is different from an Exact Reorder (PRD 00 glossary).

## 6\. Internal approval

**B2B-FR-040.** An organization chooses one approval rule at launch: no approval, approve everything, approve above an amount, or approve for specific requesters.

**B2B-FR-041.** People cannot approve their own requests when the organization turns on "separate requester and approver".

**B2B-FR-042.** An approval records the approved amount and scope.

**B2B-FR-043.** A HolyPearls quote above the approved authority triggers "Organization re-approval required" (PRD 03 QUOTE-FR-021).

**B2B-FR-044.** Approving an organization request and accepting a HolyPearls quote are separate permissions.

## 7\. Group Collection

**B2B-FR-050.** Statuses: DRAFT, OPEN, PAUSED, CLOSED, NEEDS\_REVIEW, READY\_TO\_ORDER, ORDER\_DRAFT\_CREATED, CANCELLED.

**B2B-FR-051.** A collection starts from an approved template or from the current project or configuration.

**B2B-FR-052.** The organizer chooses which fields participants can fill in: product, size, colour, quantity, personalization, delivery and payment.

**B2B-FR-053.** Closing a collection never starts production.

**B2B-FR-054.** Reviewing a closed collection creates an Order Draft only after required issues are fixed or the affected rows are excluded.

**B2B-FR-055.** Reopening rules:

- Closed, no Order Draft yet: reopen normally.  
- Order Draft exists: warn the organizer; the draft is marked STALE and must be regenerated after re-closing.  
- Organization approval given: changes go through a change request.  
- HolyPearls quote issued: changes go through a project or order change, which may need a new quote and re-approval.  
- Production started: participant data is read-only; changes go through a production change request.

## 8\. Participants

**B2B-FR-060.** No account needed. Participants use a guest link.

**B2B-FR-061.** Participants only see their own submission.

**B2B-FR-062.** Visible size buttons and a size guide. "Not sure of my size" follows the organizer's rule.

**B2B-FR-063.** Ask for a home address only when items ship to individuals. Otherwise participants pick an approved branch, or see nothing if delivery is central.

**B2B-FR-064.** When the organization pays, participants see no payment screens.

**B2B-FR-065.** When a participant who has paid is removed, their payment is kept, their submission is excluded from the totals, and the payment shows PAYMENT\_RESOLUTION\_REQUIRED for staff to refund or credit.

Participant submission statuses: NOT\_STARTED, IN\_PROGRESS, SUBMITTED, NEEDS\_CORRECTION, REMOVED.

## 9\. Spreadsheet (CSV) import

**B2B-FR-070.** Upload → Match Columns → Check → Review Problems → Import.

**B2B-FR-071.** Valid rows can be imported while problem rows are fixed later, if the organizer allows it.

**B2B-FR-072.** Duplicates need an explicit choice for each: merge, keep both, replace or skip.

**B2B-FR-073.** No row is ever silently dropped or overwritten. Each imported record remembers which import it came from.

Limits (starting values, configurable): 5 MB and 5,000 rows per file.

## 10\. Company Store

**B2B-FR-080.** A private, never-indexed mini-catalogue of the organization's approved products.

**B2B-FR-081.** Two modes: Procurement (buyers order for others) and Employee Self-Order.

**B2B-FR-082.** Each store is set to send submissions either as Individual Orders or into a Group Collection. Employees never see or choose this.

**B2B-FR-083.** Store products only offer the choices the template allows.

**B2B-FR-084.** Allowances at launch: no limit, per-order limit, or per-period limit. Going over the limit asks for approval. Credit or voucher balances are designed for but built later (P2).

## 11\. Team

**B2B-FR-090.** Invite someone with a role and locations. Invitation statuses: PENDING, ACCEPTED, EXPIRED, REVOKED. Invitations expire after 7 days (configurable) and work once.

**B2B-FR-091.** Giving someone more permissions needs a confirmation step.

**B2B-FR-092.** The last Owner cannot be removed or downgraded.

**B2B-FR-093.** Deactivated members lose access immediately. Their past actions stay in the history.

## 12\. Security

All workspace, store, collection and participant pages are private and never indexed. The server checks permissions and locations on every request. Only permitted roles can open CSV files and exports. Role, approval, asset and collection changes are recorded in the audit log.

## 13\. Done when

- The 60-person uniform journey works (45 by link, 15 by CSV with 2 initial problems, 2 locations).  
- Individual-order stores and group-collection stores behave differently behind the same employee experience.  
- The logo V4/V5 scenarios both work.  
- Reopening after an Order Draft marks the draft STALE.  
- Removing a paid participant keeps the payment and flags it for resolution.  
- A Location Manager for Lekki cannot see Victoria Island orders.  
- A member without the right permission cannot open another location's or organization's data.