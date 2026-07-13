# Launch-Week Operations — Hermes Handbook (2026-07-13 → 07-20)

> Owner: **Hermes** (operator) · Created: 2026-07-13 (launch day)
> Companion to [operating-cadence.md](operating-cadence.md) (autonomy matrix)
> and [../../AGENTS.md](../../AGENTS.md) (risk gates). Those two remain the
> contract; this doc is the launch-week runlist + the artifact map.

## TL;DR

Founder decision (2026-07-13): **Hermes runs the whole operation** — triggered
by the GitHub webhook, on the operating-cadence rails. **Claude Code owns code
and organization** (implementation, PRs, repo/docs structure). **The founder
owns the crivo**: secrets, money, live/destructive actions, external sends —
nothing external ships without his approval, exactly as the cadence's Autonomy
Matrix already says. This doc gives Hermes the launch-week daily runlist, the
map of every operational artifact (sales, ICP, marketing, CX, legal, infra),
and the open threads to drive. Evidence rules apply everywhere: tag claims
direct > observed > inference > hypothesis; never fabricate; unknown = "unknown
— needs instrumentation".

## Ownership (founder decision 2026-07-13)

| Who | Owns | Never does |
|---|---|---|
| **Hermes** | Operation end-to-end: PR reviews, issue triage, daily digest, STATE hygiene, CRM hygiene, marketing calendar execution (gated), support SLA watch, monitoring/alerts | Spend money · touch secrets/env · external sends without crivo · merge HIGH/CRITICAL without founder |
| **Claude Code** | Implementation (full-stack), migrations (founder-gated apply), repo + docs organization, QA tooling | Live/paid/destructive actions without "siga" · editing `.env` · printing secrets |
| **Founder** | Crivo on everything external/live/paid; secrets; Stripe/Railway/DNS switches; final merge word on HIGH/CRITICAAL | — |

## Daily runlist (launch week)

**Morning (start ~07:15 UTC, after the automated QA):**
1. **Link-crawl result** — Actions → "Link Health" (daily 07:00 UTC). Red = a
   public URL broke overnight → open issue, label per risk, alert founder.
2. **Prod pulse** — `/healthz` 200; `/api/system/capabilities` still
   `mode:"live"` (a `"demo"` reading in prod = incident, integrity rule).
3. **Money pulse** — new `kit_order` / `pages_order` / subscriptions vs
   yesterday; any order stuck `pending` >1h; any webhook failures in Stripe
   dashboard (founder checks dashboard-side; Hermes checks DB-side evidence).
4. **Support inbox** — support@ozvor.com within SLA (<4h business); apply
   macros (docs/support/macros.md); refunds are founder-gated.
5. **CRM hygiene** — docs/departments/sales/week1-crm.csv: every new inbound
   lead gets a row (source, ICP fit per [../departments/sales/icp.md](../departments/sales/icp.md),
   score, next action, owner).

**During the day:** review PRs on the webhook trigger (risk-gated per
AGENTS.md); keep issues triaged; watch GA4/GSC for launch-post traffic.

**End of day:** post the day report as a comment on the launch issue —
traffic (GA4), leads (CRM count), purchases (orders), issues found/fixed,
tomorrow's top 3. Numbers only with evidence; no estimates presented as data.

## Artifact map (where everything lives)

| Area | Canonical artifacts |
|---|---|
| **ICP** | [departments/sales/icp.md](../departments/sales/icp.md) (card) → [first-week-playbook.md §1](../departments/sales/first-week-playbook.md) (depth) |
| **Sales** | first-week-playbook.md (sequences §4, LinkedIn motion §5, battle cards §6) · [battlecards.md](../departments/sales/battlecards.md) · [crm-tracker.md](../departments/sales/crm-tracker.md) + week1-crm.csv · [signal-shortlist.md](../departments/sales/signal-shortlist.md) · [icp-website-audit.md](../departments/sales/icp-website-audit.md) (site gaps through ICP lens) |
| **Marketing** | [launch-week-calendar.md](../departments/marketing/launch-week-calendar.md) · [linkedin-launch-posts.md](../departments/marketing/linkedin-launch-posts.md) (3 posts + DM, founder-approval pending) · copy rules: [../marketing/copy-standard.md](../marketing/copy-standard.md) (teen-simple, ≤12-word sentences, first-person CTA, gold = OrganicPosts only) · ladder: [../marketing/value-ladder.md](../marketing/value-ladder.md) |
| **CX/Support** | [../support/macros.md](../support/macros.md) (5 macros, SLA <4h, refunds founder-gated) · [../support/kb/](../support/kb/) (5 articles) |
| **Legal** | [../departments/legal/STATE.md](../departments/legal/STATE.md) (DPA tracker 11× UNCONFIRMED, Encarregado/Art.27 open) · gate log: [../compliance/gate-log.md](../compliance/gate-log.md) |
| **Infra/QA** | [../GO-LIVE-RUNBOOK.md](../GO-LIVE-RUNBOOK.md) (verified live state + env map + Stripe webhook events) · link-crawl.yml (daily) · e2e.yml (nightly) |
| **Product state** | [../STATE.md](../STATE.md) (flagged stale — refresh is a Day-1 Hermes task) · department STATEs (same) |

## Open operational threads (drive these)

1. **Smoke ciclo 2** (issue #261 P0): one Kit $29 purchase + FULL refund to
   prove auto-revocation end-to-end (webhook events now subscribed). Founder
   executes; Hermes verifies + ticks the checklist + closes/re-scopes #261.
2. **Founder eve list**: approve the 3 LinkedIn posts · Stripe payment-methods
   check (instant-only) · support@ send-yourself test · Encarregado
   self-appointment (Privacy Policy already claims it).
3. **Reddit account aging** (#118) — no posting, manual participation only.
4. **Launch-week legal**: 11 DPA clickwrap confirmations (~1–2h) · Gate 7
   council pass or logged founder waiver.
5. **STATE refresh** (product + departments) — narrate launch reality, kill
   the TrustIndex-era text.
6. **Operational semantics to remember** (from #271): partial refunds do NOT
   revoke (by design) · subscription revocation is local-only — founder must
   also cancel in Stripe (watch `stripe_subscription_revoked_local_only`).

## Non-negotiables (unchanged, restated for launch week)

No guaranteed rankings/citations · no fake testimonials/metrics · no Reddit
spam or personas · no paid spend without crivo · no external sends without
crivo · CI red = no merge · merge = deploy · migrations are applied explicitly
(never assume the merge did it) · never fabricate product data — real or fail
honestly.
