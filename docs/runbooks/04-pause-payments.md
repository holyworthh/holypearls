# 4. Pause online payments

**When:** payments misbehave, Paystack is down, or the Paystack key leaked.

**What it does:** this is the same switch as Payment settings → Online payments (the change also shows under Recent changes there). Customers see "Online payment is paused. We'll email you when it's back." Attempts already started are still checked and webhooks are still recorded, so no payment is lost.

## Turn it on

1. Admin → **Incident switches** (needs `SECURITY_ADMIN`).
2. On the card **Pause online payments**, press **Pause**, then **Confirm**.
3. Enter the 6-digit code from your authenticator app if asked (needed when your last check was over 15 minutes ago).
4. The chip shows "ON · since HH:MM" and the card gets a red border. The change is in the audit log with your request ID.

## Turn it off

Press **Resume** on the same card and confirm.

## Staging test

1. Pause payments.
2. Open a checkout that is ready to pay: it says payment is paused and Pay is unavailable.
3. Resume. Pay works again.
4. Record the result in [README.md](README.md) → Switch test log.
