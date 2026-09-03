# Engineering Department State

> Owned by vp-engineering. Read by ceo-agent (TL;DR only). Updated after every product-manager dispatch.
> **Operational source of truth for the product pipeline is `docs/STATE.md`** (managed by product-manager). VP Engineering reads its TL;DR; does not read PRDs or code directly.

## TL;DR
> **Rewritten 2026-09-02** (sources: PENDING v4 + sweep 10.A/10.B; the 2026-08-17 TL;DR is superseded — its "$49 answers 503" was fixed 21-27/08).

Product **LAUNCHED, live in production** (Railway: web+api+worker; Supabase; merge-to-main = deploy; **the boot applies migrations — 10.B.17 — so the merge gate IS the production gate; migrations are ≥HIGH, never auto-merge**). Since the last refresh: the **$49 works end-to-end (real purchase 27/08)**; the **whole autonomy ring shipped in code 31/08** (#536 gated tuner, #539 n=1 incident signatures, #540 self-healing retry/circuit, #541 A/B + measured cadence, #542 incident→memory; 2,368 green tests) and its migrations #531/#537 were **applied 01/09 → memory + tuner ON**; prospect-batch (#547, 32 tests) + follow-up (#561, 38 tests) in production; post-deploy smoke (#562 — 🟡: no image-SHA check, no worker/healthz, 10.B.3); credits reset fix (#566); IG image cards merged OFF (#565). Hard rules hold: nothing degrades silently, every job auditable on Telegram, mock never ships. **Sweep 10.B criticals owed**: backup DOES NOT EXIST (10.B.1), worker has no healthcheck and stays dead after 5 restarts (10.B.5), approval-pending content lives only in Redis (10.B.7), Telegram single-channel (10.B.8), public checkout routes without rate limit (10.B.9), `smartlead_event` without RLS/retention (10.B.10/11), rotation runbook covers 6/17 secrets (10.B.12). Honesty debts on the product surface: chatbot/site sell 250 prompts/15 brands/4h SLA/approval workflow that don't exist as sold (10.A.1-4). Pipeline detail: `docs/STATE.md`.

## Department meta
- **Head**: vp-engineering
- **Operational pipeline state**: `docs/STATE.md` (product-manager updates every turn)
- **Compliance gate log**: `docs/compliance/gate-log.md` (append-only)
- **Implementation log**: `docs/05-impl-log.md` (append-only)
- **Current product phase**: 5 (Implementation)
- **Active capabilities shipped**: C4 (OAuth), C1 (AI generation)
- **Capabilities remaining for MVP**: C2, C3, C5, C6
- **Phases remaining**: 6 (QA), 7 (Deploy)

## OKRs owned (Q2 2026)
- **KR1.1**: 3 beta users actively posting — Target: 3 — Current: 0
- **KR1.2**: Capabilities C2, C3, C5, C6 shipped through Phase 7 — Target: 4 — Current: 0
- **KR1.3**: Production deploy live with monitoring — Target: 1 — Current: 0

## Metrics dashboard
| Metric | This sprint | Last sprint | Target |
|---|---|---|---|
| Cycle time (days) | — | — | < 3 |
| Review pass rate (first try) | — | — | > 80% |
| Gate block rate | — | — | < 20% |
| Bug escape rate to QA | — | — | < 10% |
| Postmortem coverage | — | — | 100% of blocked caps |

## Tech debt log
_Append-only. Items deferred from code reviews._
- (none recorded at department level — see `docs/05-impl-log.md` for capability-level notes)

## System health
_Incidents, known issues, performance notes._
- No production environment yet (Phase 7 not reached).

## Learning loop health
- Anti-patterns added this month: 0
- Postmortems run this month: 0
- Last anti-patterns.md read by agents: 2026-05-01 (project init)

## Cross-department dependencies
- **From Marketing**: Waitlist signup form destination decision (Supabase table vs third-party). Needed before landing page goes live (~2026-05-17). Non-urgent for current Phase 5 work.
- **To Marketing**: Brand voice + any in-product UI copy polish (post-MVP, non-blocking).

## Open risks
- **R4 (from company STATE)**: 60-day MVP timeline aggressive given 4 capabilities + 2 phases remain. VP Engineering to validate plausibility on next dispatch and report back.

## Decisions log (append-only)
- **2026-09-02** — TL;DR rewritten by the 02/09 sweep (PR fix/docs-legal-truth): $49 proven, autonomy ring ON, 10.B criticals recorded (backup inexistent, worker healthcheck, Redis-only approvals). Migration risk rule clarified in AGENTS.md §2 (≥HIGH, never auto-merge; boot applies on deploy). Sections below the TL;DR (OKRs Q2, metrics, risks) are historical scaffolding.
- **2026-05-03** — Department state scaffolded as pointer to `docs/STATE.md` (operational source). Owns O1 of Q2 2026 company OKRs. No new pipeline dispatch this turn; CEO prioritized Marketing activation for pre-launch demand.
