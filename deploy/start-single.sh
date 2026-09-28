#!/bin/sh
# Free-tier start (docs/ops/ENVIRONMENTS.md): one container runs the release
# step, then the worker and the api side by side. Paid hosts run them as
# separate services with a pre-deploy step instead (TECH-07 §1, §6).
set -e
node packages/db/dist/migrate-cli.js
node apps/worker/dist/main.js &
worker=$!
node apps/api/dist/main.js &
api=$!
# Pass shutdown signals on so running jobs can finish.
trap 'kill -TERM "$worker" "$api" 2>/dev/null; wait; exit 0' TERM INT
# If either process stops, stop the container so the host restarts it.
while kill -0 "$worker" 2>/dev/null && kill -0 "$api" 2>/dev/null; do sleep 5; done
kill "$worker" "$api" 2>/dev/null || true
exit 1
