# First staff admin

A new environment (production in particular) has no staff, and test people are never seeded there. This one-off command creates the first STAFF_ADMIN. It refuses to run once any active STAFF_ADMIN exists; after that, staff are added from the admin.

## On Render (production or staging)

Open the service's **Shell** tab and run:

```bash
node apps/api/dist/bootstrap-admin-cli.js --email you@example.com --name "Your Name"
```

## Locally

```bash
pnpm bootstrap:admin --email you@example.com --name "Your Name"
```

## What it does

- Creates the user (email marked verified), a staff profile and the STAFF_ADMIN permission, in one transaction, and writes an audit entry (`staff.bootstrap_admin`, actor System).
- Prints a random one-time password **once**. It isn't logged or stored anywhere except as a hash.
- The account has no authenticator, so the first sign-in at the admin address asks you to set one up (TECH-03 §3).

Store the password in a password manager. A change-password screen for staff arrives with the staff security pages; until then, ask for a reset if it's lost.
