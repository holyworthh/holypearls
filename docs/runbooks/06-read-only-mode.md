# 6. Read-only mode

**When:** you need the data to stop changing: a suspected breach, a bad deploy, or before a database restore.

**What it does:** browsing works; changes are refused with "We're doing maintenance. You can browse, but changes are paused."

Still working:
- browsing the site and viewing orders;
- sign-in and sign-out, and opening order links;
- Paystack and Shipbubble webhooks (so no payment is lost);
- the admin app, including turning the switch off;
- the worker (jobs keep running).

Blocked: everything else that changes data, including sign-up, cart, checkout, uploads and customer replies.

## Turn it on

1. Admin → **Incident switches** (needs `SECURITY_ADMIN`).
2. On the card **Read-only mode**, press **Turn on**, then **Confirm**.
3. Enter the 6-digit code from your authenticator app if asked.
4. The chip shows "ON · since HH:MM". The change is in the audit log with your request ID.

## Turn it off

Press **Turn off** on the same card and confirm.

## Staging test

1. Turn read-only on.
2. On the customer site, add something to the cart: the maintenance message appears. Browsing still works, and the admin app still works.
3. Turn it off. Adding to the cart works.
4. Record the result in [README.md](README.md) → Switch test log.
