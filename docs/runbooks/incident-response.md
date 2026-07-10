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
