# 8. Resolve a payment review

**When:** a `PAYMENT_REVIEW` alert, or the Reviews list is not empty.

1. Admin → Payments → **Reviews**. Open the review: it shows what the system expected, what Paystack reported and why it opened (unclear result, amount mismatch, duplicate payment, paid participant removed).
2. In the Paystack dashboard, find the transaction by its reference (`HPPAY-…`) and compare status and amount.
3. Resolve it with a note:
   - **SUCCEEDED** when Paystack shows the money was received for the right amount;
   - **OPEN** (leave it open) with a note when you are still waiting on Paystack.
4. To give money back: Admin → Refunds → **New** (needs `REFUND_ISSUE` and an authenticator check). Never change or delete anything in Paystack to tidy the history.
5. The decision is in the audit log.
