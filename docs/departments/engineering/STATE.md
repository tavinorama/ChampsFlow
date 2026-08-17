# Engineering Department State

> Owned by vp-engineering. Read by ceo-agent (TL;DR only). Updated after every product-manager dispatch.
> **Operational source of truth for the product pipeline is `docs/STATE.md`** (managed by product-manager). VP Engineering reads its TL;DR; does not read PRDs or code directly.

## TL;DR
> **Rewritten 2026-08-17 to current reality** (source: `docs/company/STATE.md`).

Product **LAUNCHED, live in production** (Railway: web + api + worker; Supabase; merge-to-main = deploy). Shipped and live: Ozvor Search audits (5 engines, 3 scores, weekly monitoring on paid + comped Growth/Agency), Ozvor Pages (Kimi draft on the Hermes VPS → Claude/OpenAI refine, grounded in the client's own crawl), Get-Cited Kit $29, **AI Audit Stack $49 with Stripe checkout (#479)**, self-serve Growth/Agency Stripe. Cost ledger `api_spend` measures real tokens per engine (#152) and attributes spend per tenant once the founder-gated `tenant_id` migration lands. Engineering hard rules: nothing degrades silently, every job auditable on Telegram, mock never ships in prod (integrity guards fail closed), migrations only via founder-merged PRs. Open: E2E is red-but-green on main, `starter` tier cleanup, GA4 instrumentation. Pipeline detail: `docs/STATE.md`.

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
- **2026-05-03** — Department state scaffolded as pointer to `docs/STATE.md` (operational source). Owns O1 of Q2 2026 company OKRs. No new pipeline dispatch this turn; CEO prioritized Marketing activation for pre-launch demand.
