# 10. Suspected data breach

**When:** anyone might have seen data they shouldn't: a leaked key, a lost laptop, a wrong email, a misconfigured bucket.

1. **Contain.**
   - Turn on read-only mode (runbook 6) and pause uploads (runbook 5) if files are involved.
   - Admin → Incident switches → revoke sessions (everyone, or one person) and revoke guest links (for a customer or a record).
   - Rotate the affected secret: Paystack (runbook 1), auth secret (runbook 2), R2 keys (runbook 3).
2. **Find the scope.**
   - Admin → Audit log: search by request ID, email or record.
   - Render logs (the request ID follows a request end to end).
   - Sentry.
   - Write down what was exposed, to whom, and from when to when.
3. **Assess and decide within 72 hours** whether to notify the NDPC (Nigeria Data Protection Commission), and the affected people where required (TECH-06 §12).
4. **Record the decision**, who made it and why, in the incident log you keep.
5. **Afterwards:** fix the cause, turn the switches off, and add what you learned to these runbooks.

Lawyer contact: _(owner: add name, phone and email here)_.
