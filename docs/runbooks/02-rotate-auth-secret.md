# 2. Rotate the Better Auth secret and revoke all sessions

**When:** the secret leaked, or on schedule.

`BETTER_AUTH_SECRET` signs cookies **and** encrypts every staff member's authenticator secret. Replacing it outright would lock all staff out of MFA. Better Auth also reads `BETTER_AUTH_SECRETS`: the first entry encrypts new data, and the old `BETTER_AUTH_SECRET` stays as a decrypt-only fallback. A test (`apps/api/src/identity/secret-rotation.test.ts`) proves existing authenticators still work this way.

1. If the secret leaked, turn on **Read-only mode** first (runbook 6).
2. Generate a new secret: `openssl rand -base64 32`.
3. Render → the api service → Environment:
   - add `BETTER_AUTH_SECRETS=2:<new secret>`;
   - **keep** `BETTER_AUTH_SECRET=<old secret>`. Do not delete it.
4. Save. Render redeploys.
5. admin → Incident switches → **Revoke sessions → Everyone**. You are signed out too; sign in again.
6. Everyone signs in again. Customers ask for a new sign-in link or use their password.
7. Later, once every staff member has re-enrolled their authenticator (admin → Staff → reset MFA, then they set it up again): set `BETTER_AUTH_SECRET=<new secret>` and remove `BETTER_AUTH_SECRETS`.

**Staging:** staging shares development's secret (its seeded authenticators were encrypted with it). Rotate production; rotating staging means resetting staff MFA there.
