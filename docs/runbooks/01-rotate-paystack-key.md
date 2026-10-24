# 1. Rotate the Paystack secret key

**When:** the key leaked, a person with access left, or on schedule.

1. Paystack dashboard → Settings → API Keys & Webhooks → generate a new secret key. Use the **test** key on staging and the **live** key in production; the API refuses the wrong kind.
2. Render → the api service → Environment → set `PAYSTACK_SECRET_KEY` to the new key → save. Render redeploys.
3. Webhooks Paystack signed with the old key fail the signature check and are refused. The `payment.check` jobs still settle those attempts by asking Paystack directly.
4. Verify:
   - admin → Payment settings shows "provider configured";
   - on staging, make one test payment with Paystack's test card and see it succeed.
5. Revoke the old key in Paystack once the new one works.

If the key leaked, also run runbook 4 (pause payments) first and check Paystack's transaction list for charges you don't recognise.
