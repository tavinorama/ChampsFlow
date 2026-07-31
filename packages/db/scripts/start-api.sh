#!/bin/sh
# API start wrapper: migrate, then serve — and NOTHING clever.
#
# This file exists because two deploys died on how Railway interprets the
# startCommand string:
#
#   deploy 81a86f8f  "node migrate.js && node index.js"  — migrations ran,
#     then 7 minutes of silence and a healthcheck kill. The && never executed;
#     it was passed to the first `node` as an ignored argument, and the migrate
#     process lingered on postgres.js's open handles.
#   deploy 52c50b6e  same command, migrate now force-exits (#408) — migrations
#     ran, the container exited 0 immediately, deploy FAILED. Same cause, now
#     visible: with no shell there is no second command.
#
# A quoted `sh -c '...'` startCommand fixes the shell hypothesis but still
# gambles on Railway's tokenizer respecting quotes. A script file takes every
# parsing question off the table: the startCommand is two bare tokens
# ("sh" and this path), which every splitter — naive, quote-aware, or full
# shell — resolves identically.
#
# `set -e` keeps the founder's contract from #407: a failing migration exits
# non-zero, the server never starts, the previous deploy keeps serving.
set -e
node packages/db/scripts/migrate.js
exec node dist/apps/api/src/index.js
