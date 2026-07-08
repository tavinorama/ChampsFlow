# OZvor Operating Cadence — Proactive but Gated

> Companion to [AGENTS.md](../../AGENTS.md) and [design-autonomous-engine.md](../design-autonomous-engine.md). Governs *how OZvor runs day to day* now that the product is live. Answers issue #146: make Hermes proactive without loosening any guardrail.

## TL;DR
This doc encodes how OZvor operates now that the product is live: **proactive but gated**. Hermes initiates market intel, opens GitHub issues, monitors and alerts, proposes plans, drafts PRs, and keeps department STATE docs current — **without waiting to be asked**. But every move that spends money, ships to customers, touches production/config/secrets, or communicates externally passes the founder's **crivo BEFORE it happens**. The **Autonomy Matrix** below is the line: green = Hermes may initiate autonomously; gated = founder approves first. It is grounded in the AGENTS.md risk levels (LOW / MEDIUM / HIGH / CRITICAL) and the principles in design-autonomous-engine.md §0 (deterministic rails; who-does-doesn't-approve; external execution only with a human; evidence pointers; never fabricate). The founder stays in control through a **single approval surface** — the Approval Queue + daily digest + weekly report (design-autonomous-engine §4.5). **This document plus AGENTS.md are the contract**: anything outside them requires a new founder decision. Nothing here authorizes spend, live/production/destructive actions, or external execution — those always need the founder.

## Inherited principles (do not duplicate — reference only)
- **Risk gates & roles** → [AGENTS.md §1–§2](../../AGENTS.md): LOW `claude-ready` / MEDIUM `hermes-review` / HIGH `+security-sensitive` / CRITICAL `needs-founder-approval`. Merge to `main` = deploy, so the merge gate is the deploy gate.
- **Design principles** → [design-autonomous-engine.md §0](../design-autonomous-engine.md): (1) deterministic rails, LLM only researches/writes/judges; (2) who-does-doesn't-approve, who-approves-doesn't-edit, **external execution only with a human**; (3) every claim carries an evidence pointer (direct > observed > inference > hypothesis); (4) the system watches itself with dumb code (heartbeats/invariants); (5) **never fabricate** — no evidence → `hypothesis`; no data → honest failure ("unknown / needs instrumentation").

---

## 1. Per-area operating table

Evidence standard everywhere: tag each claim `direct > observed > inference > hypothesis`; never fabricate metrics/testimonials/rankings; unknown data = "unknown — needs instrumentation".

| Area | Owner agent | Cadence | Concrete output artifacts | Evidence standard | Escalation trigger |
|---|---|---|---|---|---|
| **CEO / Chief-of-Staff** | Hermes (ceo-agent lens) | Daily digest+monitoring · weekly report+queue · monthly OKR refresh | Updated `docs/company/STATE.md`; GitHub issues; Approval Queue items; weekly report | Every STATE claim → evidence pointer; unknown → "needs instrumentation" | Any dept BLOCKED; cross-dept conflict; anything needing founder crivo |
| **Product** | product-manager (via vp-engineering) | Weekly | `docs/STATE.md`; PRD updates; prioritized backlog | Usage/user data (observed) or labeled hypothesis | Scope needs spend or external dependency |
| **Engineering / DevSecOps** | vp-engineering → coder pipeline + Claude Code | Continuous (PR-driven) · daily health checks | Branches/PRs with risk labels; CI results; `/healthz` probes; `05-impl-log.md` | Green CI + live probe logs (direct); post-deploy verification | HIGH/CRITICAL PR; prod incident (hotfix lane); migration/secret/DNS change |
| **Marketing** | vp-marketing → marketing-strategist / content-writer / seo-agent | Weekly cadence (2 blog + 3 LinkedIn drafts/wk) · monthly channel review | Content drafts; channel profile copy (issues); SEO audits; campaign plans (draft) | Keyword/SERP data (observed); never fabricate rankings/testimonials | Anything posting externally; any ad spend; pricing/positioning change |
| **Sales / RevOps** | vp-sales → sales-researcher (+ Hermes operator API, read) | Weekly pipeline review | ICP; battle cards; outreach templates (draft); pipeline status | CRM/opportunity data via operator API (observed); no invented pipeline numbers | Outbound to real leads; discount/pricing offers; new nurture sequence |
| **Customer Experience** | vp-cx → support-agent | Weekly KB · reactive to tickets | KB articles; escalation playbooks; macro drafts | Real ticket patterns (observed); no fabricated NPS | Outbound to real customers; refund/credit; customer-impacting incident |
| **Compliance / Legal** | vp-legal → legal-privacy-officer / ai-ethics-reviewer / security-compliance-officer | Per gate · monthly regulatory scan | ROPA/DPIA/threat-model updates (incremental); legal-page drafts; `gate-log.md` entries | Regulation citations (direct); LGPD + EU + US each addressed | razão social/address needed; publishing legal pages; HIGH-risk data change |
| **Finance / Governance** | vp-finance → finance-reporter / invoice-processor (+ Hermes revenue analytics, read) | Monthly P&L/cashflow · weekly revenue glance post-first-sale | P&L; cashflow; budget variance; categorized expense log | Stripe/bank data from founder (direct); unknown → "needs instrumentation" | Any spend; vendor contract; moving money (Stripe charges/refunds founder-only) |
| **Market / R&D** | Hermes (intel) + discovery-researcher on demand | Continuous scan · monthly deep-dive | Competitor/market intel briefs; evidence-backed recommendations (draft); draft issues | Cited sources (direct/observed); hypotheses labeled; never invent market size | Recommendation implies spend/execution → Approval Queue |

---

## 2. Autonomy Matrix (the centerpiece)

Two explicit lanes. Left = Hermes acts on its own. Right = Hermes stops and waits for the founder. Risk column maps to [AGENTS.md §2](../../AGENTS.md#2-risk-levels). Rule of thumb from design §0.2: **external execution and spend only with a human.**

| Category | Hermes MAY INITIATE autonomously (no ask) | Requires founder crivo BEFORE acting | AGENTS.md risk |
|---|---|---|---|
| **Research & market intel** | Run competitor/SERP/community scans; synthesize briefs; produce evidence-backed recommendations as **drafts** | Acting on any recommendation that spends or executes externally | LOW (draft) / CRITICAL if spend |
| **Planning & issues** | Draft GitHub issues; write plans; propose OKR changes; reclassify PR risk (may bump up) | Committing to a paid roadmap item or external commitment | LOW |
| **Monitoring & alerting** | `/healthz`/heartbeat checks; dashboards; alert the founder on anomalies | Changing production monitoring config/thresholds that touch infra | LOW → MEDIUM |
| **Docs & STATE** | Update department STATE docs; append decisions log; LOW-risk doc / UI-copy PRs (`claude-ready`) | Publishing legal pages; shipping pricing/claims copy that reaches customers | LOW |
| **Code / PRs** | Open **DRAFT** PRs; review PRs; approve/merge LOW & MEDIUM per §2 | Merge HIGH/CRITICAL; auth/billing/checkout/admin/CSP; production migrations | HIGH / CRITICAL |
| **External comms** | Draft social posts, emails, outreach templates, channel profile copy | Posting/sending to real audiences (social, email to real leads/customers); only **pre-approved nurture** sequences are auto | HIGH (external execution) |
| **Spend / paid APIs** | Create ad accounts with **NO spend**; draft budgets/ranges | Any actual spend; activating a paid API; launching an ad | CRITICAL |
| **Config / secrets / infra** | Propose changes; draft infra-as-code PRs | Production migrations; DNS; secrets; branch-protection; Railway/Supabase/Stripe settings | HIGH / CRITICAL |
| **Money movement** | Read revenue analytics via the scoped operator API | Stripe charges/refunds — **founder-only, always** | CRITICAL |
| **Pricing / positioning** | Model and draft pricing/positioning options | Changing live pricing or public positioning | HIGH |

Codified guardrails (from design §2/§3.1 and AGENTS.md §1): a recommendation with no non-hypothesis evidence is forced to `high`/`hypothesis`; `kind='paid_campaign'` always sets `approval_required`; a competitor's trademark in ad copy is `blocked`; secrets are never in scope at any level; Hermes never writes code, holds key material, sends free-form outbound email, or runs destructive operations.

---

## 3. How the founder stays in control

**One approval surface** (design-autonomous-engine §4.5 — do not build a second one):
1. **Approval Queue** (web, batch) — filters by risk/kind; approve in bulk; "ask for more evidence" re-enqueues with feedback. Everything gated in the matrix lands here.
2. **Daily digest** (email) — 5 lines: what ran, what's in the queue, exceptions.
3. **Weekly report** — the cycle's proposals, decisions, and pending gates.

Target load: **≤30 min/day**. Escalations that must always reach the founder directly: any dept BLOCKED, any HIGH/CRITICAL PR, and any live/production/destructive/paid action.

**The contract rule.** This document + [AGENTS.md](../../AGENTS.md) define the full autonomous envelope. If a proposed action is not clearly on the green side of the Autonomy Matrix, it is gated by default. **Anything outside this doc and AGENTS.md requires a new founder decision** (design §6: this doc is the contract; outside it = new design). Proactivity increases *how much Hermes drafts, proposes, and monitors* — it never increases *what Hermes ships, spends, or sends without the founder*.
