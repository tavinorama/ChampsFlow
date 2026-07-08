# Ozvor Operating System — Founder One-Pager

> Owner: CEO/Hermes · Created: 2026-07-08 · Status: ACTIVE · Closes #146
> The single page that answers **"what is the company doing, and how do decisions
> get made?"** Everything here points to a live source — this page never holds
> data, only the map. Cadence detail: [operating-cadence.md](operating-cadence.md).
> Risk gates + agent roles: [../../AGENTS.md](../../AGENTS.md).

## "What is the company doing today?" — read order

1. **[company/STATE.md](STATE.md)** — OKRs, department status, open risks (CEO's source of truth).
2. **Open PRs & issues** — `gh pr list` / `gh issue list` (the live work queue).
3. **Department STATE** for the area in question (table below).

That's the answer path — no memory guessing. If a department's STATE is stale,
that is itself the top action for its VP.

## Departments — owner · live output · proactive backlog source

| Area | Owner (agent) | Where its live output lives | Proactive check / backlog |
|---|---|---|---|
| CEO / Chief of Staff | ceo-agent / Hermes | [STATE.md](STATE.md) + daily digest | Cross-area blockers, approval queue |
| Product | product-manager | [docs/STATE.md](../STATE.md), 7-phase pipeline | Bugs, UX gaps → issues |
| Engineering / DevSecOps | vp-engineering | Open PRs, CI, [departments/engineering/STATE.md](../departments/engineering/STATE.md) | PR queue, CI health, deploy logs |
| Marketing | vp-marketing | [departments/marketing/STATE.md](../departments/marketing/STATE.md), channels #115–#123 | Content cadence, channel setup |
| Sales / RevOps | vp-sales | [departments/sales/crm-tracker.md](../departments/sales/crm-tracker.md) + [week1-crm.csv](../departments/sales/week1-crm.csv) | CRM pipeline, first-50 leads |
| Customer Experience | vp-cx | [support/macros.md](../support/macros.md) + [support/kb](../support/kb/README.md) | Ticket queue, feedback loop |
| Compliance / Legal | vp-legal | [compliance/](../compliance/), legal pages | Claims substantiation, DPAs, ROPA |
| Finance / Governance | vp-finance | Stripe + operator API (once first sale lands) | No-spend guardrail, revenue metrics |
| Market / R&D | (marketing + product) | battlecards, blog, `/vs` | Competitor monitoring, feature gaps |

## How work ships (every change)

`branch → PR → CI green (6 required checks) → risk-gated review → merge`.
**Merge to `main` auto-deploys (Railway), so the merge gate IS the deploy gate.**

## Label → risk → routing policy

Risk levels and their labels are defined in **[AGENTS.md §2](../../AGENTS.md)**;
this is the routing summary:

| Label | Risk | Who approves | Examples |
|---|---|---|---|
| `claude-ready` | LOW | Hermes (or auto once CI green) | docs, copy, isolated non-risky code |
| `hermes-review` | MEDIUM | Hermes | most feature work, marketing pages |
| `security-sensitive` | HIGH | Hermes + founder | auth, billing, checkout, admin, CSP, new public routes, migrations |
| `needs-founder-approval` | CRITICAL | **Founder only** | live/production/destructive/paid/secret actions |
| department labels (`marketing`, `blocked`, …) | routing | — | which VP owns / what's blocked |

Reviewers cannot self-approve their own PRs (branch protection requires a
non-author approving review) — that is why founder-authored PRs are approved by
Hermes and vice-versa.

## Founder approval gates (always, regardless of who wrote the code)

No agent performs, without explicit founder approval: production data changes,
live Stripe/payments, live DNS, paid API activation, destructive commands,
**production migrations**, or anything touching secrets/`.env`. Agents may draft
and open PRs for these; the founder executes the live/paid step.

## Hard limits for agents

Never edit `.env`; never print/commit secrets; never fabricate product data
(audits/scores/testimonials/rankings are real or fail honestly); no cold outbound
before the founder approves template + sender + physical address + opt-out.
