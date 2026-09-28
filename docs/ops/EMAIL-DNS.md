# Email sending domain checklist (TECH-06 §10)

Guest links and codes arrive by email, so spoofed HolyPearls emails are a real phishing risk. Complete this list before the first real customer email.

## Before launch

1. **Choose the sending address.** Use a subdomain so marketing tools can't harm transactional mail, for example `hello@mail.holypearls.ng`. Set `EMAIL_FROM="HolyPearls <hello@mail.holypearls.ng>"` on the worker.
2. **Add the domain in Resend.** Resend shows the exact records to add.
3. **SPF:** add the TXT record Resend gives (it includes `include:amazonses.com` or Resend's current value). There must be only one SPF record per name.
4. **DKIM:** add the DKIM CNAME or TXT records Resend gives. Wait until Resend shows them as verified.
5. **DMARC:** add a TXT record at `_dmarc.mail.holypearls.ng`:
   `v=DMARC1; p=quarantine; rua=mailto:dmarc@holypearls.ng; adkim=s; aspf=s; pct=100`
6. **Verify.** In Resend, the domain shows "Verified". Send a test email from the admin notification log ("Send test email") to Gmail and Outlook addresses and check the headers for `spf=pass`, `dkim=pass` and `dmarc=pass`.
7. **Set the worker's variables:** `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY` (secret store only), `EMAIL_FROM`. Set `HELP_INBOX_EMAIL` on the API.

## After launch

- Read the DMARC aggregate reports weekly for the first month.
- When the reports show only HolyPearls' own senders passing, change DMARC to `p=reject`.
- Emails never ask customers for passwords, or for codes they didn't request (the shared template footer says so).

## Environments

| Environment | Transport | Notes |
| :---- | :---- | :---- |
| local | `file` (writes `.outbox/emails/*.html`), or `smtp` with Mailpit (`SMTP_URL=smtp://localhost:1025`, inbox at http://localhost:8025) | No real email leaves the machine. |
| staging | `resend` with the Resend test domain, or a staging subdomain | Only send to team addresses. |
| production | `resend` on the verified domain | SPF, DKIM and DMARC must pass first. |
