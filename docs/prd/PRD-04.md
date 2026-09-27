# HolyPearls — PRD 04: Proofs, Production, Delivery & Reorder

**Version:** 2.0 (27 September 2026). Replaces PRD 04 v0.1. **Built in:** P06 (proofs), P07 (production and order tracking), P08 (delivery, reorder, problem reports).

## 1\. Purpose

Everything the customer sees after they've committed to buy: approving artwork, production progress, holds, delivery, ordering again, and reporting a problem.

## 2\. Proofs

**FUL-FR-001 — Proof versions (P0).** Each proof version (V1, V2, V3…) is saved permanently with its status, files, comments, decision, who decided and when.

**FUL-FR-002 — Proof viewer (P0).** Front, back, page or placement views, zoom (pinch-zoom on mobile), and production details: placement, dimensions, colour reference, quantity, production notes. Before approval the viewer is titled "Production proof preview".

**FUL-FR-003 — Decisions (P0).** Approve for Production, Request Changes, Ask a Question. Asking a question keeps the proof undecided.

**FUL-FR-004 — Confirmation before approving (P0).** The customer ticks "I have reviewed the artwork, spelling, placement and specifications shown." Approving needs a one-time email code if the customer hasn't verified recently (TECH 03).

**FUL-FR-005 — Comments and pins (P0).** Comments on the whole proof, plus pins placed on the artwork. Every pin also appears as numbered text, so the meaning doesn't depend on seeing the pin.

**FUL-FR-006 — Approval unlocks production (P0).** Where a proof is required, production cannot start until it's approved.

**FUL-FR-007 — Changes after approval (P0).** Before production starts: a change request that staff review. After production starts: a feasibility review that may change cost or timing. The approved version is always kept.

## 3\. Order and production

**FUL-FR-010 — Order page top section (P0).** Answers: current status, what happens next (and whether the customer must act), target timing, paid and remaining, status of each item, and shipments.

**FUL-FR-011 — Actions first (P0).** Anything the customer must do appears above the timeline.

**FUL-FR-012 — Each item has its own status (P0).** In a multi-product order, one item can wait for proof approval while another is in production.

**FUL-FR-013 — Holds explain themselves (P0).** A hold shows the reason, who needs to act, how to resolve it, and the effect on timing.

**FUL-FR-014 — Production statuses (P0).** Queued, In Production, Quality Check, Ready — Awaiting Release, Ready to Dispatch.

**FUL-FR-015 — Only real milestones (P0).** Only show steps staff can reliably update.

**FUL-FR-016 — Quality check (P0).** Quality Check is a visible step. The internal checklist stays internal.

## 4\. Release and balance

**FUL-FR-020.** Finished production and permission to dispatch are separate. "Ready — Awaiting Release" means production is complete but something (usually a balance) must be resolved first.

**FUL-FR-021.** If the balance must be paid before dispatch, finished items stay "Ready — Awaiting Release" until payment is confirmed, then move to "Ready to Dispatch". The order shows "Balance required" with a Pay Balance button.

## 5\. Delivery

**FUL-FR-030 — Partial delivery (P0).** Orders can be Partially Ready, Partially Dispatched and Partially Delivered.

**FUL-FR-031 — Multiple shipments (P0).** Each shipment lists its items and quantities, destination, carrier, tracking number and status.

**FUL-FR-032 — Shipment statuses (P0).** Preparing, Label Created, In Transit, Out for Delivery, Delivered, Attempted Delivery, Exception, Returned. At launch staff update these by hand. There is no courier integration.

**FUL-FR-033 — Guest tracking (P0).** A guest can track an order from the link in their email, or by entering the order number and email address and then a one-time code.

## 6\. Timeline and activity

**FUL-FR-040.** The customer timeline shows a few simple milestones. A separate, detailed activity history records every event and can't be edited.

## 7\. Cancellation and changes

**FUL-FR-050.** Before production starts, the customer may cancel if the order's cancellation policy allows.

**FUL-FR-051.** After production starts, the customer can only "Request cancellation". It is not guaranteed.

**FUL-FR-052.** Scope changes after a quote is accepted create a change request, and possibly a new quote. They never edit the accepted quote.

## 8\. Delivered and reorder

**FUL-FR-060 — Delivered (P0).** Shows receipt, shipment history, Reorder and Report a Problem.

**FUL-FR-061 — Exact reorder (P0).** Only offered when the product, specification, artwork, placement and production method are all still available unchanged. Staff decide in admin whether an exact reorder can skip the proof.

**FUL-FR-062 — Reorder with changes (P0).** Copies the past order into a new editable draft. Anything changed goes back through checks and proofing.

## 9\. Report a problem

**FUL-FR-070 — Report a problem (P1).** Capture the item, type of issue, how many are affected, photos and a description, and give the customer a reference number. Staff triage it in admin. Full claims handling is not part of launch.

## 10\. Notifications

Proof ready, changes received, new proof version, proof approved, production started (where meaningful), order on hold, balance due, ready to dispatch, dispatched or partly dispatched, delivered.

## 11\. Security

Proof and order pages are private and never indexed. Guests use guest links. Approving a proof needs a recent email-code check.

## 12\. Done when

- In the event order, Name Badge V1 shows "Changes requested" and V2 shows "Awaiting approval", and the attention card points to V2.  
- One item can wait for approval while another is in production.  
- "Ready — Awaiting Release" stops dispatch until the balance is paid.  
- An order with several shipments works.  
- Exact reorder and reorder with changes stay separate.