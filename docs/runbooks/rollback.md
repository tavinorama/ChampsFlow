# Rollback Runbook

> Owner: devops-engineer · Created: 2026-05-11

## TL;DR

Railway service rollback restores to the previous deploy hash. Target time: under 5 minutes for a service rollback. Database migration rollback via `down.sql` adds up to 15 minutes. Total maximum: 20 minutes.

## Trigger Criteria

Roll back when any of the following occur after a deploy:

- Health check fails within 60 seconds (automated rollback in deploy pipeline)
- Error rate exceeds 20% on any service within 5 minutes of deploy
- Auth failures spike (users can't log in)
- Critical security regression detected (data leak, auth bypass)

## Step 1 — Identify Whether to Roll Back the Service, the Database, or Both

- Service rollback only: appropriate when the new code has a bug but no schema migration was applied, or the migration is backward-compatible with the old code.
- Database migration rollback: required when the migration applied in the same deploy is incompatible with the previously running service version. Check whether a `down.sql` exists for the migration.

## Step 2 — Service Rollback (Railway)

### Via deploy pipeline (automated)

The `deploy.yml` workflow runs `railway rollback` if the post-deploy health check fails. No manual action required.

### Via Railway dashboard (manual)

1. Log in to Railway dashboard.
2. Navigate to the affected project (EU prod, US prod, or staging).
3. Open the affected service (api, worker, or web).
4. Under "Deployments", find the last known-good deploy hash.
5. Click "Redeploy" on that hash.
6. Repeat for each affected service.

### Via Railway CLI (manual)

```bash
railway rollback --service api --environment production-eu
railway rollback --service worker --environment production-eu
railway rollback --service web --environment production-eu
# Repeat for US if needed:
railway rollback --service api --environment production-us
railway rollback --service worker --environment production-us
railway rollback --service web --environment production-us
```

## Step 3 — Database Migration Rollback (if needed)

1. Identify the migration to reverse. Check `packages/db/migrations/` for the version applied in the failed deploy.
2. Verify that a `down.sql` file exists for that migration version.
3. Run the down migration:

```bash
export DATABASE_URL="<production Supabase connection string>"
psql $DATABASE_URL -f packages/db/migrations/{version}.down.sql
```

4. After the down migration completes, redeploy the previous service version (Step 2 above).
5. Verify `/healthz` returns 200 and a sample authenticated request succeeds.

## Step 4 — Verify Rollback Success

- Check `/healthz` on api (HTTP 200).
- Check Grafana: API error rate should return to baseline within 5 minutes.
- Run a manual smoke test: log in, generate a draft, verify the draft appears.

## Step 5 — Communicate and Post-Mortem

- Notify affected users if the outage exceeded 15 minutes (SEV-1 comms template in `incident-response.md`).
- Create a post-mortem for SEV-1 rollbacks.
- Investigate root cause before re-deploying the failed version.

## Feature Flag Rollback (no code deploy required)

For behavioral changes controlled by environment variables, set the flag and redeploy via `railway redeploy`:

```bash
railway variables set FEATURE_FLAG_X=false --environment production-eu
railway redeploy --service api --environment production-eu
```

Current feature flags: none in v1. Pattern documented for v1.1.
