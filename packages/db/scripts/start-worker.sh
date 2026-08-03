#!/bin/sh
# Worker start wrapper: migrate, then run — the same contract as start-api.sh
# (see that file for why this is a script and not a && chain in railway.json:
# the startCommand string is not shell-interpreted, so && is never executed).
#
# Both api and worker migrate at boot. Concurrent runners on the same commit
# serialize on the pg_advisory_lock inside migrate.js; the loser wakes up,
# finds nothing pending, and starts. `set -e` keeps the #407 contract: a
# failing migration exits non-zero and the previous deploy keeps running.
set -e
node packages/db/scripts/migrate.js
exec node dist/apps/worker/src/index.js
