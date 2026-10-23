# 5. Pause uploads

**When:** storage is failing, files are being abused, the R2 token leaked, or a beta runs on staging without R2 (local-disk files are lost on restart).

**What it does:** new uploads are refused with "Uploads are paused for a short while. Your saved files still work. Try again later." Existing files, downloads and previews are untouched.

## Turn it on

1. Admin → **Incident switches** (needs `SECURITY_ADMIN`).
2. On the card **Pause uploads**, press **Pause**, then **Confirm**.
3. Enter the 6-digit code from your authenticator app if asked.
4. The chip shows "ON · since HH:MM". The change is in the audit log with your request ID.

## Turn it off

Press **Resume** on the same card and confirm.

## Staging test

1. Pause uploads.
2. On the customer site, try to upload artwork: the message above appears.
3. Resume. The upload works.
4. Record the result in [README.md](README.md) → Switch test log.
