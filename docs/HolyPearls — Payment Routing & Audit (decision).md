# HolyPearls — Payment Routing & Audit (decision)

**Status:** Owner-approved on 27 Sep 2026. This is a product and flow decision, not a technical spec.

## Terms
- **Deposit:** 65% to start production, 35% before dispatch. Nothing ships before the balance is paid.
- **Quote tolerance:** a quote can rise up to 10% above the approved amount. Anything above 10% goes back for approval.
- **Group orders:** the employer pays for all staff items, and delivery goes to the employer.

## Providers
| Market | Primary | Fallback / alternatives |
|---|---|---|
| Nigeria (₦) | Paystack: card, bank transfer, USSD | Bachs HQ, used only when Paystack fails or is down |
| International | Stripe card | Apple Pay, Google Pay (via Stripe), PayPal |

Only the methods that work for the customer's device and country are shown. Apple Pay appears only on Apple devices.

> To confirm: Bachs HQ's supported methods, settlement time and fees. We haven't verified these yet.

## Fallback flow (Nigeria)
1. **Starting the payment:** the customer pays an **invoice**, either the deposit or the balance. Each invoice has one HolyPearls payment reference, whichever provider is used.
2. **Paystack attempt:** if Paystack succeeds, the flow is done.
3. **When to switch:** checkout offers "Pay with Bachs HQ instead" when:
   - Paystack can't start the payment;
   - Paystack times out;
   - Paystack is flagged as having an outage.

   A **card decline is not a reason to switch**. The customer is asked to retry or use another method on Paystack.
4. **Before switching:** the system checks that the Paystack attempt is really unpaid. This stops a customer being charged twice when Paystack took the money but didn't confirm it in time.
5. **Bachs HQ attempt:** it uses the same invoice and reference. The customer gets one receipt.
6. **Late confirmations:** if both providers later report a payment, the second is automatically flagged for refund and a staff alert is raised.

## Audit trail
Every attempt is recorded against the invoice and cannot be edited, only added to. Each record holds:
- the invoice and order;
- the provider;
- the method;
- the amount and currency;
- the time started and the time finished;
- the result: paid, failed, abandoned or timed out;
- the provider's reference;
- the reason for switching providers;
- who started it: the customer, or staff sending a payment link.

**Who sees what:**
- **Staff** see the full attempt history on the order. They can export it for a date range, for reconciliation against Paystack, Bachs HQ, Stripe and PayPal settlement reports.
- **Customers** see one status and one receipt per invoice.
- **Daily reconciliation** flags any payment a provider reports that isn't matched to an invoice, and any paid invoice without provider confirmation.

## Guest link lifetimes (industry-standard suggestion, adopted)
| Link | Lifetime | Notes |
|---|---|---|
| Sign-in (magic link) | 15 min, single use | In line with common practice (Slack, Notion, Auth0 defaults are 10–15 min) |
| Quote / proof review | 14 days | Matches a typical quote validity. Re-send extends it. The quote's own expiry still applies. |
| Order tracking | Until 30 days after delivery | Read-only, and shows no payment details |
| Payment link (staff-sent) | 72 hours | Can be re-sent. Tied to one invoice. |

Any expired link shows the "expired link" state (section 78) with a one-tap option to re-send it to the same email.

## Board changes
- **Section 86:** a new "Owner decisions" panel.
- **Checkout payment copy:** updated for Paystack, Bachs HQ and the international methods.
- **Deposit amounts:** updated on both boards.
- **Section 74:** the C and D variants are marked RETIRED.

**Still to design:** the "Pay with Bachs HQ instead" fallback state, and the staff attempt-history view.
