# On-Call Runbook

> Owner: devops-engineer · Audience: anyone paged

## TL;DR

Ozvor has a single on-call rotation (founder). Alerts route to the founder ops mailbox `founder@ozvor.com` via Grafana (Cloudflare Email Routing per `docs/runbooks/email-setup-cloudflare.md`; a dedicated `ops@ozvor.com` route may be added there). PagerDuty is optional later when the engineering team grows. *(Updated 2026-07-10, issue #213 — was `ops@organicposts.ai`.)*

## Rotation

| Role | Contact |
|---|---|
| Primary (all hours) | Founder — contact stored in Railway emergency runbook (not committed) |
| Technical escalation (if primary unreachable > 30 min) | Designated technical advisor — contact stored privately |

## Alert Sources

- Grafana Cloud alerting: email to `founder@ozvor.com` (or `ops@ozvor.com` once routed)
- Railway service crash notifications: email to the Railway account owner

## First Steps on Any Alert

1. Open Grafana dashboard and identify the alert source.
2. Check Railway service logs for the affected service (API, worker, web).
3. Determine severity using the matrix in `docs/07-deploy.md` Section 7.
4. For SEV-1 or SEV-2: immediately open an incident channel (Slack DM or email thread with a timestamp).
5. If the issue is not resolved within 15 minutes: escalate to the technical advisor.

## Escalation Path

- 0–15 min: Founder investigates
- 15–30 min: Technical advisor notified
- 30 min+: Consider activating the rollback procedure (`docs/runbooks/rollback.md`)
- 60 min+ for SEV-1: Evaluate break-glass Supabase migration per architecture §15 R3

## Post-Incident

Any SEV-1 requires a post-mortem within 5 business days. File at `docs/learning/postmortems/YYYY-MM-DD-{title}.md`.
