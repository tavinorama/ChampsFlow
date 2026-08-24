# Incident Response Runbook

> Owner: devops-engineer · Audience: on-call engineer

## Severity Matrix

| Severity | Definition | Examples |
|---|---|---|
| SEV-1 | Production completely down for all users | API returning 5xx for all requests; auth broken; worker stopped and publish queue growing unbounded |
| SEV-2 | Significant degradation: >10% error rate, >2× normal latency, or partial platform failure | One social platform failing to publish for all tenants; LLM generation failing; billing webhooks timing out |
| SEV-3 | Minor isolated issue | Single-tenant publish failure; elevated regen ratio; non-critical Grafana alert |

## Response Time Targets

| Severity | Acknowledge | Mitigation | Resolution |
|---|---|---|---|
| SEV-1 | Immediate (24/7) | 30 min | 4 hours |
| SEV-2 | 30 min (business hours) / 2 hours (off-hours) | 2 hours | 8 hours |
| SEV-3 | Next business day | 1 week | 2 weeks |

## Incident Steps

1. **Acknowledge** the alert and reply to the notification so the team knows someone is on it.
2. **Assess severity** using the matrix above.
3. **Open an incident record**: create a dated file at `docs/learning/postmortems/incident-YYYY-MM-DD-HH-MM.md` for SEV-1/SEV-2.
4. **Investigate** using Grafana dashboards and Railway logs.
5. **Mitigate**: rollback if a recent deploy is suspected (see `rollback.md`), or apply a targeted fix.
6. **Communicate** to affected users if the outage exceeds 15 minutes (SEV-1) or 1 hour (SEV-2). Use the comms template below.
7. **Resolve**: confirm metrics return to normal thresholds.
8. **Post-mortem**: required for SEV-1; recommended for SEV-2.

## Comms Templates

### SEV-1 Initial Notice

```
Subject: Ozvor — Service Disruption [DATE TIME UTC]

We are experiencing a service disruption affecting [describe impact: e.g., "all users — unable to log in"].
Start time: [UTC timestamp]
We are actively investigating.
Next update: within 60 minutes.
```

### SEV-1 Update

```
Subject: Ozvor — Service Update [DATE TIME UTC]

Update on the service disruption that began at [start time UTC]:
Current status: [investigating / identified root cause / mitigating / resolved]
Impact: [description]
ETA for resolution: [estimate or "unknown — investigating"]
Next update: [time]
```

### SEV-1 Resolution

```
Subject: Ozvor — Service Restored [DATE TIME UTC]

The service disruption has been resolved.
Start time: [UTC] / End time: [UTC]
Duration: [N hours N minutes]
Root cause: [brief summary]
We will follow up with a full post-mortem within 5 business days.
```

## Common Issues and Immediate Mitigations

| Symptom | Likely cause | Immediate action |
|---|---|---|
| API 503 / Railway container crash | OOM or unhandled exception | View Railway logs; rollback to prior deploy |
| Publishing failures for all tenants | OAuth token decryption failure or platform API outage | Check `publish_job_failure_total` metric; verify platform status pages |
| LLM generation timeouts | Anthropic / Bedrock outage | Check Anthropic status page; EU tenants can temporarily switch to direct API by updating `DEFAULT_TENANT_REGION` — only if US DPA covers the switch |
| Supabase connection errors | Connection pool saturation or Supabase outage | Check Supabase status page; verify `pg_pool_connections_used` metric |
| Stripe webhook failures | Webhook signing key mismatch or Stripe outage | Verify `STRIPE_WEBHOOK_SECRET` matches the key in Stripe dashboard |

## Agent-org freeze (adicionado 24/08, após os incidentes 18–22/08)

Sintoma: nenhuma publicação/relatório há horas, ou o vigia externo (workflow "Agent-org liveness") vermelho.

1. **Pulso:** `curl -s https://api-production-2052.up.railway.app/api/v1/agent-org/liveness`
   - `last_tick_at` > 30 min → o worker parou: Railway → serviço worker → logs (`graph_tick_*`); Redis vivo?
   - `advanceable_runs > 0` e `newest_step_at` velho → o tick não chega neles: procurar `graph_tick_run_error` nos logs.
   - Só `parked_runs` e steps velhos → **noite normal** (wait/harvest/aprovação), não é incidente.
2. **O que espera humano** (a pergunta certa é sobre STEPS): `SELECT r.graph, s.node, s.started_at FROM ops.agent_step s JOIN ops.agent_run r ON r.id=s.run_id WHERE s.status='waiting' ORDER BY s.started_at;`
3. **Falhas recentes com causa:** `SELECT r.graph, s.node, s.summary, s.started_at FROM ops.agent_step s JOIN ops.agent_run r ON r.id=s.run_id WHERE s.status='failed' AND s.started_at > now()-interval '24 hours' ORDER BY s.started_at DESC;`
   - `OAuth session expired` → re-login do engine na VPS (`claude` + `/login`; `codex login`) + `systemctl restart hermes.service`. A cadeia kimi segura a operação enquanto isso.
   - `You need one media` / `No video` → canal exige mídia; a célula não devia ter nó publish (ver #516).
4. **Botão do Telegram mudo:** abrir `/api/telegram/status/<TELEGRAM_WEBHOOK_SECRET>` — `configured`, `url_secret_matches` e `last_error_message` respondem em 10 segundos.
5. **Hermes:** `curl -s https://hermes.ozvor.com/health` · engines: última linha por engine em `engine_drift_check`.
6. Registrar o postmortem em `docs/learning/postmortems/` e o padrão novo em `docs/learning/anti-patterns.md` (três exemplos desta semana já estão lá).
