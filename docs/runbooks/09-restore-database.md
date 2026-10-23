# 9. Point-in-time database restore

**When:** bad data, or a migration that must be undone. Neon keeps history for the restore window (check it under Neon → Project → Settings; TECH-07 needs 7 days or more).

## Restore

1. Turn on **Read-only mode** and **Pause online payments** (runbooks 6 and 4).
2. Pick a time **T** just before the incident, in UTC, for example `2026-11-02T09:30:00Z`.
3. Restore the branch to T, keeping the current state under another name:
   ```sh
   npx neonctl@latest branches restore <branch> ^self@<T> \
     --preserve-under-name <branch>-before-restore-<date> --project-id <id>
   ```
4. Wait for `https://<api address>/health/ready` to return 200. If it doesn't within a few minutes, restart the Render service.
5. Reconcile Paystack: payments made after T are missing from our records. In the Paystack dashboard list the transactions after T. For each, check the attempt exists and resolve with runbook 8 (customers who paid must not lose their money).
6. Files uploaded after T are orphaned in R2: harmless.
7. Turn the switches off.
8. Keep the preserved branch for 7 days, then delete it: `npx neonctl@latest branches delete <branch>-before-restore-<date> --project-id <id>`.

## Rehearsal

Rehearse on **staging** before launch and every quarter. Never load production data into staging (TECH-07 §2): the rehearsal restores staging to an earlier point in its own history.

```sh
NEON_PROJECT_ID=<id> BRANCH=staging CHECK_DB_URL='<staging owner URL>' ./deploy/restore-rehearsal.sh
```

It restores the branch to a moment a few seconds earlier, checks that a marker made afterwards is gone and the row counts match, waits for the API, and prints a timings table and a row for [restore-rehearsals.md](restore-rehearsals.md). It needs `psql` (`brew install libpq`), `curl` and `npx`, and refuses `BRANCH=production` unless `I_MEAN_PRODUCTION=yes`.
