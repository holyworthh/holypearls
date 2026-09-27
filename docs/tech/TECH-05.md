# HolyPearls — TECH 05: Payments & Money Rules

**Version:** 2.0 (27 September 2026). Replaces TECH 05 v1 and ADR-010. **Decision (ADR-011):** Paystack is the only payment provider at launch, for Nigerian and international customers. Bachs, PayPal and Stripe are not built. A `PaymentGateway` interface keeps the door open to add a provider later.

## 1\. The server decides every amount

The browser never sends an amount that gets charged.

- **Direct purchase:** the server works out the price from product rules, configuration, quantity, delivery and VAT, and saves it as a checkout snapshot.  
- **Quote purchase:** the amount comes from the accepted quote version and its payment schedule.

The browser can show estimates, but the API recalculates everything before creating anything payable.

## 2\. Money storage

Whole minor units \+ ISO currency: ₦450,000.00 \= `45000000` NGN (kobo). \$125.50 \= `12550` USD (cents). Never floating point. The code never converts between currencies.

**Currency rule.** Checkouts are always in NGN. Quotes are in NGN by default; staff may issue a quote in USD only when `payment_settings.usd_enabled` is on (which requires USD to be enabled on the Paystack account and a Zenith Bank USD domiciliary account for payouts). International card holders paying in NGN are converted by their own bank.

## 3\. The payment records

| Record | What it is |
| :---- | :---- |
| Payment schedule | The plan for one order or accepted quote: one or more installments. |
| Installment | One amount that becomes due at a trigger (on acceptance, before production, before dispatch, on a date). Labels: "Deposit", "Balance", "Milestone 2". |
| Payment intent | One payable amount: a direct checkout, or one installment. Holds the amount and currency and which attempt succeeded. |
| Payment attempt | One Paystack transaction for an intent. Each "Pay" press after a failure is a new attempt with a new Paystack reference. |
| Paystack event | Every webhook received, saved exactly as sent. |
| Payment review | A case for staff: unclear after all checks, wrong amount or currency, or a second successful payment. |
| Receipt | The customer's record of a successful payment: receipt number, Paystack reference, amount, currency, payer details, order or project reference, date. |
| Refund | A full or partial refund of a successful attempt, issued through Paystack. |

Status rules for installments, intents and attempts are in TECH 01 section 4\.

## 4\. Payment schedule

Can be: pay in full; deposit \+ balance; or several milestones. No percentage is hard-coded; the default schedule is an admin setting and staff can change it per quote.

A production or dispatch rule can depend on an installment being paid ("deposit before production", "balance before dispatch"). Production status and payment status stay separate: an item can be READY\_AWAITING\_RELEASE while the payment status is BALANCE\_DUE.

## 5\. Starting a payment

1. The customer presses Pay (with an `Idempotency-Key`, TECH 02 section 4).  
2. The API checks who they are, that the intent is OPEN, and loads the amount and currency from the server.  
3. The API creates a payment attempt with a new unique reference (`HPPAY-<uuid>`), status CREATED.  
4. The API calls Paystack "initialize transaction" with the amount, currency, reference, customer email, enabled channels (`card`, `bank_transfer`, `ussd`, `apple_pay` as switched on in admin), callback URL and metadata (intent ID, order or quote reference).  
5. The attempt becomes PENDING. The intent becomes PROCESSING. The browser opens Paystack's popup (or redirects on devices where the popup fails).  
6. The same idempotency key returns the same attempt instead of creating another.

If Paystack initialization fails outright (no transaction created), the attempt is FAILED, the intent returns to OPEN, and the customer sees "We couldn't start the payment. Try again."

## 6\. Finding out the result

A redirect back from Paystack or a "success" message in the browser is **not** proof of payment. Only two things change a payment's result:

- a verified Paystack webhook (`charge.success` or failure event), followed by a call to Paystack's "verify transaction" API; or  
- the automatic check job (`payment.check`) calling "verify transaction".

When the result is confirmed:

- **Success, and amount and currency match:** in one transaction, mark the attempt SUCCEEDED, the intent SUCCEEDED (only if no other attempt already succeeded), the installment PAID, create the receipt, then recalculate order status (create the order for a direct checkout; release dispatch if the balance was the condition). Queue the receipt email.  
- **Success, but amount or currency don't match:** mark the attempt SUCCEEDED, the intent REVIEW\_REQUIRED, and open a payment review. Don't credit the order.  
- **Failed or abandoned:** mark the attempt FAILED or ABANDONED, return the intent to OPEN (installment back to DUE) and show "Payment failed — try again".

**Check schedule for unclear attempts** (PENDING with no webhook): check at 2 minutes, 10 minutes, 30 minutes, 2 hours, 6 hours and 24 hours after creation. If Paystack still hasn't given a final answer after 48 hours, mark the attempt UNKNOWN, the intent REVIEW\_REQUIRED, and open a payment review.

**What the customer sees:** "Processing payment" (while PENDING or UNKNOWN), "Payment received", or "Payment failed — try again". Never show success or failure before the server knows.

While an attempt is PENDING, pressing Pay again shows "A payment is already in progress" with options to wait or, after 10 minutes, start a new attempt. Starting a new attempt is allowed because the double-payment rule below protects the customer.

## 7\. Double payments

Only one attempt can satisfy an intent. The database enforces this with a unique constraint on `payment_intents.succeeded_attempt_id` and a row lock while applying a success.

If a second attempt for the same intent succeeds (for example the customer paid in two tabs):

- keep both attempts and both Paystack records;  
- don't credit the order twice;  
- mark the intent REVIEW\_REQUIRED with reason `DUPLICATE_PAYMENT`;  
- open a payment review for Finance to refund the extra payment (section 11).

Never delete a Paystack record to make the history look tidy.

## 8\. Creating the order

- **Direct checkout:** the order is created from the checkout snapshot when the intent succeeds.  
- **Quote:** the order is created from the exact accepted quote version when the customer accepts (even if a deposit is still due; the order waits in AWAITING\_PREREQUISITE).

Both are in one transaction and are safe to repeat: a unique constraint on the source (`checkout_id` or `quote_version_id`) means a repeat returns the same order.

## 9\. Receipts

Created from saved data when a payment succeeds. The receipt page and PDF are generated from the receipt record. An email is never the financial record.

## 10\. Balance and release

If the balance must be paid before dispatch, finished items become READY\_AWAITING\_RELEASE and the order shows BALANCE\_REQUIRED. When the balance installment is PAID, the same transaction moves those items to READY\_TO\_DISPATCH. Never show an item as "in production" just because money is owed.

## 11\. Refunds and adjustments

Refunds are issued by Finance staff (`REFUND_ISSUE` permission, MFA within 15 minutes) through Paystack's refund API, full or partial. Each refund is a new record linked to the original attempt. The original payment record is never changed. Refund statuses follow Paystack's responses (PENDING, PROCESSED, FAILED) and are updated by webhook and check job, the same way as payments.

## 12\. Removed participants who already paid

Keep the payment. Exclude the submission from the totals. Open a payment review with reason `PAID_PARTICIPANT_REMOVED` (customer-facing status PAYMENT\_RESOLUTION\_REQUIRED). Finance decides refund or credit. Never delete payment history or move money between people automatically.

## 13\. Payment settings (admin)

`payment_settings` holds: online payments on or off; which Paystack channels are on (card, bank transfer, USSD, Apple Pay); international cards on or off; USD quotes on or off; default payment schedule. Changes need `PAYMENT_MANAGE` and are audited. Turning online payments off shows customers "Online payment is paused. We'll email you when it's back." Existing PENDING attempts still get checked.

The settings page shows what the Paystack account actually supports, as confirmed by staff, so the website never offers a method that isn't enabled.

## 14\. Paystack setup checklist (business, before launch)

- Business verified on Paystack (Registered Business).  
- International payments requested and approved in Dashboard → Settings → Preferences.  
- American Express turned on, if wanted.  
- If USD quotes are wanted: USD enabled and a Zenith Bank USD domiciliary account added.  
- Apple Pay enabled, if Paystack offers it on the account.  
- Webhook URL set to `https://<api domain>/v1/webhooks/paystack` for live and test modes separately.  
- Separate test and live keys stored only in the hosting secret store.

## 15\. Security

Card details never touch HolyPearls servers (Paystack's hosted checkout collects them). This keeps HolyPearls in the lightest PCI category (SAQ A). The Paystack secret key is only on the API and worker, never in `NEXT_PUBLIC_*` variables. The public key may be in the browser.

## 16\. Required tests

- A changed amount sent from the browser is ignored.  
- Pressing Pay twice with the same key creates one attempt.  
- Replaying a webhook doesn't count a payment twice.  
- A forged webhook (wrong signature) is rejected.  
- Closing the popup leaves "Processing" until the check job resolves it.  
- The check schedule marks an attempt UNKNOWN after 48 hours and opens a review.  
- Wrong amount or currency opens a review and doesn't credit the order.  
- Two successful attempts credit the order once and open a DUPLICATE\_PAYMENT review.  
- Accepting a quote creates exactly one order.  
- Paying the balance moves READY\_AWAITING\_RELEASE items to READY\_TO\_DISPATCH.  
- Changing catalogue prices doesn't change past quotes or orders.  
- A partial refund keeps the original payment and shows PARTIALLY\_REFUNDED.  
- Turning online payments off blocks new attempts and keeps checking old ones.  
- The fake gateway in `packages/testkit` covers all of the above without calling Paystack; one extra test suite runs against Paystack test mode in staging.

## 17\. Done when

Every price and payment status the customer sees comes from one server source, and no retry, replay or double click can charge or credit twice.