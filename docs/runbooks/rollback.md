# Rollback Runbook

> Owner: devops-engineer · Created: 2026-05-11 · **Atualizado 2026-09-02 (10.B.2)**

## TL;DR

**Não existe rollback automatizado.** O `deploy.yml` que prometia `railway rollback` automático foi APAGADO em 2026-09-02 (10.B.2): referenciava environments (`staging`, `production-eu`, `production-us`) e um serviço `migrations` que nunca existiram — nunca rodou com sucesso e vendia uma proteção falsa. O caminho de rollback honesto é: **(1) Railway dashboard → serviço afetado → Deployments → "Redeploy" no último deploy bom; (2) se a mesma janela aplicou migração incompatível, rodar o `down.sql` manualmente via psql.** Deploys de produção acontecem pela integração GitHub→Railway no merge para `main` (projeto único `trustindex-ai`, serviços `api`, `worker`, `web`). Target: <5 min para redeploy de serviço; +15 min com migração; máximo 20 min.

## Trigger Criteria

Roll back when any of the following occur after a deploy:

- `post-deploy-smoke` workflow red (SHA mismatch, worker sem pulso, ou endpoint vital fora)
- Error rate exceeds 20% on any service within 5 minutes of deploy
- Auth failures spike (users can't log in)
- Critical security regression detected (data leak, auth bypass)

## Step 1 — Identify Whether to Roll Back the Service, the Database, or Both

- Service rollback only: appropriate when the new code has a bug but no schema migration was applied, or the migration is backward-compatible with the old code.
- Database migration rollback: required when the migration applied in the same deploy is incompatible with the previously running service version. Check whether a `down.sql` exists for the migration.

## Step 2 — Service Rollback (Railway)

> **Não há caminho automatizado.** O antigo `deploy.yml` (que dizia rodar
> `railway rollback` sozinho) foi apagado em 2026-09-02 — era morto: os
> environments/serviços que ele citava nunca existiram. Rollback é manual.

### Via Railway dashboard (caminho primário)

1. Log in to Railway dashboard — projeto `trustindex-ai`.
2. Open the affected service (`api`, `worker`, or `web`).
3. Under "Deployments", find the last known-good deployment (o SHA aparece no
   deployment; confirme contra o `sha` que `GET /healthz` reporta).
4. Click "Redeploy" on that deployment.
5. Repeat for each affected service.

### Via Railway CLI (alternativa)

```bash
# Lista deployments e redeploya um deployment anterior específico:
railway status
railway redeploy --service api
railway redeploy --service worker
railway redeploy --service web
# Nota: `railway redeploy` redeploya o deployment ATUAL; para voltar a um
# deployment anterior use o dashboard (Redeploy no deployment antigo) — o
# CLI não expõe rollback por hash de forma estável.
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
