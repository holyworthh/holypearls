# HolyPearls — PRD 03: Projects, Quotes & Payments

**Version:** 2.0 (27 September 2026). Replaces PRD 03 v0.1 and both copies of its 27 September payment amendment. **Built in:** P04 (payments core, Paystack), P05 (projects, quotes, deposits and balances).

**Payment decision (27 Sep 2026, ADR-011):** Paystack is the only payment provider at launch, for Nigerian and international customers. Bachs, PayPal and Stripe are not built. The code keeps a provider interface so another provider can be added later without rewriting checkout.

## 1\. Purpose

How a customer starts a project from a goal, gets recommendations, receives and responds to quotes, and pays on a schedule.

## 2\. Project Builder

The builder always has the same six steps: **Project, Scale, Date & Location, Brand, Recommendations, Review.**

**PROJ-FR-001 — Start from a goal (P0).** The customer starts from what they're trying to achieve (for example "conference"), not from product categories.

**PROJ-FR-002 — "I'm not sure" is allowed (P0).** Unknown or incomplete answers are accepted wherever staff can still work with them.

**PROJ-FR-003 — Recommendations (P0).** Suggested products are grouped as Recommended, Useful Additions and Optional. Each says why it's suggested and can be edited or removed. Recommendation rules are set by staff in admin per project type.

**PROJ-FR-004 — The customer's edits win (P0).** If the customer removes a suggestion, changes a quantity or adds a custom item, later changes to the project details must not silently undo it.

**PROJ-FR-005 — Custom items (P0).** The customer can add something not in the catalogue, with a description and reference file.

**PROJ-FR-006 — Configure later (P0).** Items can stay loosely described ("about 30 crew polos"). The builder does not turn into several product configurators.

**PROJ-FR-007 — Save and resume (P0).** Guest and account drafts keep all details and the step the customer was on.

**PROJ-FR-008 — Help with context (P0).** "Need help" sends the current project and its files to staff.

## 3\. Submitting a project

**PROJ-FR-010.** The Review step is the only normal place to press "Request Project Quote".

**PROJ-FR-011.** Submitting gives the project a reference number (HP-P-…) and starts quote review. No account needed.

**PROJ-FR-012.** A product configuration in QUOTE\_REQUIRED uses the same quote process through "Request Final Quote" (PRD 02 COM-FR-061).

## 4\. Quotes

**QUOTE-FR-001 — Versions never change once sent (P0).** Each sent quote version is saved permanently. A revision creates a new version; the old one becomes SUPERSEDED.

**QUOTE-FR-002 — What a quote shows (P0).** Line items, a summary of each item's choices, quantities, fees, delivery and installation where relevant, VAT, total, payment schedule, assumptions, valid-until date, and the expected production sequence.

**QUOTE-FR-003 — Customer actions (P0).** Accept Quote, Request Changes, Ask a Question, Decline.

**QUOTE-FR-004 — Requesting changes (P0).** The customer can point to a line item or type of change, add a note and files. The quote moves to REVISION\_REQUESTED.

**QUOTE-FR-005 — What changed (P1).** A revised quote shows the meaningful differences from the previous version.

**QUOTE-FR-006 — Expiry (P0).** After the valid-until date, the quote becomes EXPIRED and read-only, and cannot be accepted. "Request Updated Quote" keeps the project and history. The default validity period is set in admin (starting value: 14 days).

**QUOTE-FR-007 — Accepting (P0).** The customer confirms they've reviewed the scope, price and terms, and accepts the current valid version. Accepting needs a one-time email code if the customer hasn't verified recently (TECH 03).

**QUOTE-FR-008 — Order created automatically (P0).** Accepting creates the order from the accepted version. Nothing is typed in again. Pressing Accept twice never creates two orders.

## 5\. Organization approval and quotes

**QUOTE-FR-020.** If the quote relates to an organization's Order Request that has an approved amount and scope, the final quote is checked against it.

**QUOTE-FR-021.** If the quote is above the approved amount, or the scope has changed in a way the organization's policy flags, acceptance is blocked with the reason "Organization re-approval required". The quote stays visible. (This is a blocking reason, not a separate quote status.)

**QUOTE-FR-022.** "Can approve organization requests" and "Can accept HolyPearls quotes" are separate permissions.

## 6\. Payments

**PAY-FR-001 — Flexible schedule (P0).** A payment schedule can be: pay in full, deposit then balance, or several milestones.

**PAY-FR-002 — No fixed percentage in code (P0).** Deposit amounts or percentages and when each payment is due are set by staff, with a default in admin.

**PAY-FR-003 — Payment summary (P0).** Show total, paid, remaining, next payment due, and a history of payments.

**PAY-FR-004 — Statuses (P0).** Use the payment statuses in PRD 00 section 8\.

**PAY-FR-005 — Retries are safe (P0).** A failed or retried payment never creates a second order or counts a payment twice.

**PAY-FR-006 — Receipts (P0).** Every successful payment produces a receipt the customer can view and download, and a receipt email.

**PAY-FR-007 — Accepted payment methods (P0).** Payment goes through Paystack's checkout. Customers choose their method inside Paystack: card, bank transfer, USSD, and Apple Pay where Paystack has enabled it on the HolyPearls account. Before payment, the HolyPearls page lists the methods that are currently switched on. Staff can switch methods off in admin (for example during a Paystack incident).

**PAY-FR-008 — Payment attempts (P0).** Each time a customer starts paying for the same amount, a new attempt is recorded under one payable item. A customer can try again after a failure without losing their order.

**PAY-FR-009 — Uncertain results are checked, not guessed (P0).** If Paystack's result is unclear (for example the customer closed the window, or the confirmation hasn't arrived), the payment shows "Processing payment" and the system checks with Paystack automatically. It never shows "Paid" or "Failed" until Paystack confirms.

**PAY-FR-010 — Payment record (P0).** For every attempt, store the Paystack reference, method, amount and currency, timestamps, result and any check results, so staff can reconstruct what happened.

**PAY-FR-011 — Double payment protection (P0).** Only one successful payment can satisfy a payable item. If a customer somehow pays twice, both payments are kept, the order is only credited once, and the second payment goes to a staff review queue for refund.

**PAY-FR-012 — International customers (P0).** International customers pay with Visa, Mastercard, Verve or American Express cards through Paystack. Quotes and direct checkout are in Naira (NGN) by default; the customer's bank converts the amount. Staff can issue a quote in US Dollars (USD) only when USD is enabled on the Paystack account. Before launch, HolyPearls must request international payments in the Paystack dashboard, and add a Zenith Bank USD domiciliary account to receive USD payouts.

(PAY-FR-007 to 012 replace the 27 September multi-provider amendment. Removed: Bachs fallback, PayPal, method resolver, provider-to-provider fallback rules.)

## 7\. Notifications

Quote ready, quote expiring (3 days before, configurable), revised quote ready, deposit due, deposit received, payment failed, balance due, payment received. Each links straight to the action.

## 8\. Security

Quote and payment pages are private and never indexed. Guest access uses guest links. Paystack secret keys and webhook checks stay on the server. Every amount is checked on the server against the accepted quote or checkout. Card details never touch HolyPearls servers.

## 9\. Data

Project, project item, recommendation, quote, quote version, quote line item, quote change request, organization approval reference, payment schedule, installment, payment intent, payment attempt, Paystack event, receipt, refund.

## 10\. Done when

- The event project reaches Quote V1, then V2, with nothing lost.  
- An expired V1 cannot be accepted.  
- An accepted version never changes.  
- Deposit and balance are separate payments.  
- The ₦450,000 approval against a ₦485,000 quote blocks acceptance with "Organization re-approval required".  
- Retrying a payment never creates a duplicate order.  
- Replaying a Paystack webhook never counts a payment twice.  
- Closing the Paystack window leaves the payment "Processing" until the automatic check resolves it.  
- Two successful payments for one item credit the order once and appear in the staff review queue.