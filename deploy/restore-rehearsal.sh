#!/bin/sh
# Restore rehearsal (docs/runbooks/09-restore-database.md; TECH-07 §5).
# Restores a Neon branch to a moment a few seconds ago, checks that data made
# after that moment is gone and earlier data is intact, waits for the API to be
# ready, and prints timings and a row for docs/runbooks/restore-rehearsals.md.
#
# Run from your own machine (needs psql, curl and npx):
#   NEON_PROJECT_ID=<id> BRANCH=staging CHECK_DB_URL='<owner URL of that branch>' ./deploy/restore-rehearsal.sh
# Never point it at production unless you mean it: I_MEAN_PRODUCTION=yes.
set -eu

: "${NEON_PROJECT_ID:?Set NEON_PROJECT_ID}"
: "${CHECK_DB_URL:?Set CHECK_DB_URL (the owner URL of the branch)}"
BRANCH="${BRANCH:-staging}"
API_URL="${API_URL:-https://holypearls-api-staging.onrender.com}"
if [ "$BRANCH" = "production" ] && [ "${I_MEAN_PRODUCTION:-}" != "yes" ]; then
  echo "Refusing to rehearse on production. Set I_MEAN_PRODUCTION=yes if you mean it." >&2
  exit 1
fi

now() { date +%s; }
sql() { psql "$CHECK_DB_URL" -v ON_ERROR_STOP=1 -At -c "$1"; }
COUNTS="select (select count(*) from users), (select count(*) from customers), (select count(*) from orders), (select count(*) from files), (select count(*) from audit_log), (select count(*) from drizzle.__drizzle_migrations)"

echo "1/7 Counting rows before the restore"
T=$(date -u +%Y-%m-%dT%H:%M:%SZ)
BEFORE=$(sql "$COUNTS")
echo "    T = $T, counts = $BEFORE"

echo "2/7 Making a marker after T"
sleep 5
sql "create table restore_rehearsal_marker(at timestamptz default now())" >/dev/null

echo "3/7 Restoring $BRANCH to $T"
START=$(now)
npx neonctl@latest branches restore "$BRANCH" "^self@$T" --preserve-under-name "$BRANCH-before-rehearsal-$(date +%Y%m%d%H%M)" --project-id "$NEON_PROJECT_ID"
RESTORED=$(now)

echo "4/7 Waiting for the database to answer"
until psql "$CHECK_DB_URL" -At -c 'select 1' >/dev/null 2>&1; do sleep 2; done
DB_UP=$(now)

echo "5/7 Checking the data"
FAILED=0
if [ "$(sql "select to_regclass('restore_rehearsal_marker') is null")" != "t" ]; then echo "    FAIL: the marker table still exists" >&2; FAILED=1; fi
AFTER=$(sql "$COUNTS")
if [ "$AFTER" != "$BEFORE" ]; then echo "    FAIL: counts changed: before $BEFORE, after $AFTER" >&2; FAILED=1; fi

echo "6/7 Waiting for $API_URL/health/ready (up to 5 minutes)"
READY=""
while [ "$(( $(now) - DB_UP ))" -lt 300 ]; do
  if curl -fsS "$API_URL/health/ready" >/dev/null 2>&1; then READY=$(now); break; fi
  sleep 5
done
if [ -z "$READY" ]; then
  echo "    The API did not become ready: restart the Render service, then check again." >&2
  FAILED=1
  READY=$(now)
fi

echo "7/7 Result"
echo "| restore | database reachable | API ready |"
echo "| :-- | :-- | :-- |"
echo "| $((RESTORED - START)) s | $((DB_UP - START)) s | $((READY - START)) s |"
echo
echo "Row for docs/runbooks/restore-rehearsals.md:"
echo "| $(date -u +%Y-%m-%d) | $BRANCH | $T | $((RESTORED - START)) | $((DB_UP - START)) | $((READY - START)) | $([ "$FAILED" = 0 ] && echo pass || echo FAIL) | <your name> |"
echo
echo "When you are happy, delete the preserved branch:"
echo "  npx neonctl@latest branches delete <the $BRANCH-before-rehearsal-... name> --project-id $NEON_PROJECT_ID"
exit "$FAILED"
