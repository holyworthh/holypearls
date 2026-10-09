# HolyPearls — PRD 06: Staff Operations & Admin

**Version:** 2.0 (27 September 2026). Replaces PRD 06 v0.1 and its 27 September payment amendment.

## 1\. Purpose

The admin area lets HolyPearls staff and the business owners run the business day to day, and change normal business rules, without asking a developer.

Admin is where business rules live. It is not a general ERP.

Admin is built alongside each customer feature (every ticket includes its admin screens), then completed in P13.

## 2\. Staff roles

| Role | Main work |
| :---- | :---- |
| Owner / Super Admin | Business-wide settings |
| Sales / Quoting | Projects, quotes, customers |
| Artwork / Design | Artwork review, proofs |
| Production | Production status, holds, quality check |
| Fulfilment | Shipments and delivery |
| Catalogue / Content | Products, prices, copy, images |
| Finance | Payments, receipts, refunds |

One person can hold several roles in a small team. The system still checks each permission separately (TECH 03 lists staff permissions).

## 3\. Catalogue

**OPS-FR-001 (P0).** Create, edit and archive Catalogue Products.

**OPS-FR-002 (P0).** Assign families, categories, search phrases, visibility and buying mode.

**OPS-FR-003 (P0).** Manage copy, specifications, images, FAQs, SEO fields and related items.

**OPS-FR-004 (P0).** Product statuses: DRAFT, PUBLISHED, TEMPORARILY\_UNAVAILABLE, ARCHIVED.

## 4\. Product rules

**OPS-FR-010 (P0).** Pricing: base price, quantity tiers and add-on charges, where prices can be calculated.

**OPS-FR-011 (P0).** Minimum order quantity, plus what happens below it (block, or send for manual review).

**OPS-FR-012 (P0).** Lead times, and the rules that trigger production review or rush.

**OPS-FR-013 (P0).** Which materials, finishes, placements and options work together.

**OPS-FR-014 (P0).** Buying mode per product.

**OPS-FR-015 (P0).** Rules that decide the price state: PRICE\_READY, ESTIMATE\_READY, QUOTE\_REQUIRED or CONSULTATION\_REQUIRED.

**OPS-FR-016 (P0).** Whether artwork can be sent later.

**OPS-FR-017 (P0).** Sample rules: required, recommended or optional, and how samples are priced.

**OPS-FR-018 (P0).** Whether a proof is required, and whether an exact reorder can skip it.

**OPS-FR-019 (P0).** VAT rate and whether catalogue prices include VAT.

## 5\. Garment and production data

**OPS-FR-020.** Garment sourcing options and allowed product details.

**OPS-FR-021.** Fabrics, materials, colours and size ranges.

**OPS-FR-022.** Decoration options and which placements they work with.

Internal machine or supplier fields stored in admin are never shown to customers.

## 6\. Projects and quotes

**OPS-FR-030 (P0).** A queue of new project submissions with all details, files and selected products.

**OPS-FR-031 (P0).** Build a quote from a project or configuration: line items, fees, VAT, terms, payment schedule and valid-until date.

**OPS-FR-032 (P0).** Revising creates a new version. A sent version is never edited.

**OPS-FR-033 (P0).** Send, revise and expire quotes. See when a customer accepts or declines.

**OPS-FR-034 (P0).** Customer questions and change requests stay linked to the quote version and project.

## 7\. Payments

**OPS-FR-040 (P0).** Set deposit, balance and milestone schedules per quote or order, starting from the admin default.

**OPS-FR-041 (P0).** See every payment with its Paystack reference and status: pending, paid, failed, refunded.

**OPS-FR-042 (P0).** Paystack confirmations and retries never count a payment twice.

**OPS-FR-043 (P1).** Authorized Finance staff can issue a full or partial refund through Paystack, with the full history kept. Refunds need a recent MFA check.

**OPS-FR-044 (P0).** Switch payment methods on or off (card, bank transfer, USSD, Apple Pay) within what Paystack has enabled for the account, and pause all online payments during an incident. No code release needed.

**OPS-FR-045 (P0).** For any payable item, see every payment attempt: reference, method, amount, timestamps, Paystack's responses and check results.

**OPS-FR-046 (P0).** A review queue for payments that stay unclear after automatic checks, amount or currency mismatches, and double payments. Staff decisions are recorded and never delete Paystack records.

**OPS-FR-047 (P0).** A settings page showing what the Paystack account actually supports (international cards, USD, Apple Pay), so the UI never promises something that isn't enabled.

## 8\. Artwork and proofs

**OPS-FR-050 (P0).** A queue of files needing cleanup or review.

**OPS-FR-051 (P0).** Create proof V1, V2, … for specific order items, with customer-facing details.

**OPS-FR-052 (P0).** Customer comments stay linked to the exact proof version.

**OPS-FR-053 (P0).** Approval locks the artwork used for production.

**OPS-FR-054 (P0).** Review changes requested after approval, and start a new quote or proof if needed.

## 9\. Production

**OPS-FR-060 (P0).** A production board or list of items grouped by: waiting for prerequisite, queued, in production, quality check, ready, on hold.

**OPS-FR-061 (P0).** Update each item's status separately.

**OPS-FR-062 (P0).** Place a hold with a reason category, internal note, customer-facing explanation, who needs to act, and timing impact.

**OPS-FR-063 (P0).** Record quality check results: passed and released, or sent for rework.

**OPS-FR-064 (P0).** Dispatch is blocked automatically while a required balance or approval is outstanding.

## 10\. Delivery

**OPS-FR-070.** Create one or more shipments from ready items.

**OPS-FR-071.** Set destination, carrier and tracking number.

**OPS-FR-072.** Partial dispatch and partial delivery.

**OPS-FR-073.** Status updates never erase shipment history.

## 11\. Customers and organizations

**OPS-FR-080.** Search and view customers, organizations, locations and contacts, according to staff permissions.

**OPS-FR-081.** View an organization's assets, templates, collections and order requests in a read-only support view. Staff never sign in as a customer.

**OPS-FR-082.** Review Workspace Product Templates waiting for HolyPearls production approval.

**OPS-FR-083.** Review new brand asset versions for print and embroidery readiness.

**OPS-FR-084.** Approve or decline workspace requests (PRD 05 B2B-FR-005), with a reason the customer sees when declining. Needs the ORGANIZATION\_APPROVE staff permission, which is separate from the read-only support view (OPS-FR-081). Approving creates the organization, its locations and the requester as Owner.

## 12\. Group Collection support

**OPS-FR-090.** See which participant submissions and imports an Order Draft came from, when needed for quoting or production. Staff don't manage participants on the organization's behalf unless the organization asks for help.

## 13\. Delivery and installation rules

**OPS-FR-100.** Nigeria delivery zones with rates, or "quote required".

**OPS-FR-101.** International freight: calculated rate or "staff will quote".

**OPS-FR-102.** Installation areas, capabilities and rules.

## 14\. Website content and SEO

**OPS-FR-110.** Edit SEO fields, canonical settings and required structured-data fields for public pages.

**OPS-FR-111.** Private pages can never be indexed, whatever a staff member sets (PRD 01 PUB-SEO-008).

## 15\. Audit log

**OPS-FR-120 (P0).** Record every important staff action: price and rule changes, quote versions, payments and refunds, proof versions, production and holds, shipments, template and asset approvals, role and security changes. Ordinary staff can read the log but no one can edit or delete entries through the application.

## 16\. Rule changes and history

**OPS-FR-130 (P1).** Price and rule changes take effect from a chosen date and never change accepted quotes or existing orders. Draft configurations may be repriced; the customer sees "Price updated" with the old and new amounts.

## 17\. Operations home

The admin home is a set of work queues, not charts: New Requests, Quotes to Prepare, Proofs and Artwork, Blocked Orders, Production, Quality Check, Ready to Dispatch, Payments Needing Attention, Help Requests, Problem Reports.

## 18\. High-risk staff actions

Refunds, price changes, role changes, overriding a quote acceptance, replacing an approved proof, and cancelling an order after commitment all need the right permission, a confirmation step, an MFA check within the last 15 minutes, and an audit entry.

## 19\. Exports

Orders, payments, customers, production, catalogue, and collection totals. Exports that include personal data need a specific permission, run in the background, expire after 24 hours, and are logged.

## 20\. Done when

- The owner can change a launch price, minimum quantity or lead time without a deployment.  
- Quote V2 is issued without changing V1.  
- Proof V2 is published without changing V1.  
- Item-level statuses work for the complex event order.  
- A balance can block dispatch while the item still shows production complete.  
- Partial shipments work.  
- A product can be made temporarily unavailable safely.  
- A rule change doesn't alter an accepted order.  
- Important actions appear in the audit log.  
- Finance can reconstruct every attempt for a payment from saved records.  
- Pausing online payments stops new payments without changing past ones.  
- A double payment creates a review item, not a second credit.