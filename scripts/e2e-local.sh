#!/usr/bin/env bash
# Run the Playwright suite locally with the same env the CI job uses.
#
# Needs postgres + redis on the default ports:
#   brew services start postgresql@17 redis
#   psql -d postgres -c "CREATE ROLE postgres LOGIN SUPERUSER PASSWORD 'test'"
#   createdb organic_posts_e2e
#   DATABASE_URL=... npm run db:migrate
#
# Written because "push and wait for CI" is a 30-minute feedback loop for a
# one-line assertion, and a red E2E is advisory in CI (continue-on-error) —
# so a broken test can sit unnoticed. Locally it is a 2-minute loop.
#
# Usage: scripts/e2e-local.sh [playwright args…]
set -euo pipefail
export NODE_ENV=test
export DATABASE_URL="postgres://postgres:test@localhost:5432/organic_posts_e2e"
export REDIS_URL="redis://localhost:6379"
export STRIPE_TEST_MODE=true
export STRIPE_SECRET_KEY="sk_test_placeholder_for_e2e"
export STRIPE_WEBHOOK_SECRET="whsec_placeholder_for_e2e"
export NEXT_PUBLIC_API_URL="http://localhost:3001"
export WEB_ORIGIN="http://localhost:3000"
export DEV_AUTH_BYPASS=1
export E2E_TEST_SESSION=1
export SUPABASE_URL="https://demo.supabase.co"
export DPA_CURRENT_VERSION="1.0"
export OAUTH_TOKEN_KEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
export DEFAULT_TENANT_REGION=us
exec npx playwright test --project=chromium-desktop "$@"
