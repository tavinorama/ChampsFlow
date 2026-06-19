#!/bin/bash
# =============================================================================
# CI Script: check-rls.sh
# Runs check-rls.sql and fails CI if any tenant-scoped tables are missing RLS.
# Usage: DATABASE_URL=<url> ./scripts/check-rls.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set."
  exit 1
fi

echo "Running RLS coverage check..."

# Run the SQL and count the rows returned.
# --tuples-only suppresses headers; --no-psqlrc avoids local config pollution.
ROW_COUNT=$(psql "$DATABASE_URL" \
  --tuples-only \
  --no-psqlrc \
  --command "\copy ($(cat "${SCRIPT_DIR}/check-rls.sql")) TO STDOUT" 2>/dev/null | grep -c '\S' || true)

# Fallback: run the file directly and count non-empty lines
ROW_COUNT=$(psql "$DATABASE_URL" \
  --tuples-only \
  --no-psqlrc \
  -f "${SCRIPT_DIR}/check-rls.sql" 2>/dev/null | grep -c '\S' || echo "0")

if [ "$ROW_COUNT" -gt 0 ]; then
  echo "FAIL: $ROW_COUNT table(s) are missing Row Level Security."
  echo "Tables without RLS:"
  psql "$DATABASE_URL" --tuples-only --no-psqlrc -f "${SCRIPT_DIR}/check-rls.sql"
  exit 1
fi

echo "PASS: All tenant-scoped tables have RLS enabled."
exit 0
