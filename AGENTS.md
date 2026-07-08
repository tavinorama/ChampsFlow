# AGENTS.md — OZvor hybrid agent operating system

> How OZvor is operated by a founder + two AI agents, with GitHub as the source of truth.
> This document adds **traceability, review, risk classification, and founder approval gates** on top of the existing workflow. It does **not** restrict what Claude Code is allowed to build.

---

## TL;DR

Otavio (founder) holds final approval. Hermes orchestrates, plans, and reviews. Claude Code implements across the full stack. Every change flows through a branch + PR on GitHub. PRs carry a **risk level** (LOW / MEDIUM / HIGH / CRITICAL) that determines who must approve before merge. Merging to `main` auto-deploys via Railway, so **the merge gate is the deploy gate**. Live/production/destructive/paid actions always require founder approval, regardless of who wrote the code.

---

## 1. Roles

| Actor | Role | What they do | What they never do |
|---|---|---|---|
| **Otavio** (`tavinorama`) | Founder / final approver | Sets direction, flips live switches (credits, Stripe, DNS), approves HIGH/CRITICAL changes, owns all secrets | — |
| **Hermes** (`ozvor-hermes`) | Orchestration, planning, reviews, **business operations** | Turns founder intent into plans/issues, reviews PRs (MEDIUM+), reclassifies risk, coordinates cadences; operates the business via the scoped operator API ('operator'+'business'): revenue analytics, leads, opportunities, DFY pipeline status, nurture enrollment into founder-approved sequences | Writes code; holds secrets/key material; moves money (Stripe charges/refunds are founder-only); sends free-form outbound email (only pre-approved nurture sequences); destructive operations |
| **Claude Code** | Full-stack implementation executor | Implements application code, infra-as-code, DB migrations, billing code, email integration, deployment config, product pages; verifies in preview/production logs; opens PRs with honest risk labels | Edits `.env` files; prints/commits secrets; deploys to production directly; runs destructive commands; activates paid APIs; uses live Stripe keys without founder approval |
| **GitHub** | Source of truth | Issues, branches, PRs, decisions, review history | — |
| **CI** | Verification layer | Build + test on every PR; a red build blocks merge at any risk level | — |

Claude Code **remains allowed to work across the entire stack** (Supabase, Railway, Cloudflare, Resend, Stripe, product pages, chatbot, BYOK, admin). Branches and PRs are **checkpoints, not blockers** — the gates below control *merging and going live*, not *writing code*.

---

## 2. Risk levels

Every PR and issue must declare exactly one risk level. When in doubt, pick the **higher** one.

| Level | Label | Covers | Gate to merge |
|---|---|---|---|
| **LOW** | `claude-ready` | Docs, UI copy, simple pages, tests, blog content | Green CI → merge directly (no review required) |
| **MEDIUM** | `hermes-review` | package/config changes, DB migrations, infra-as-code, integrations in test mode, non-trivial refactors | Green CI + **Hermes approval** |
| **HIGH** | `hermes-review` + `security-sensitive` | Auth, RLS, billing code, email sending, domain/DNS, deployment configuration | Green CI + **Hermes approval + founder approval** |
| **CRITICAL** | `needs-founder-approval` | Production data, live Stripe, live DNS, paid APIs, destructive commands, production migrations, secrets | **Founder explicitly approves in the PR**, always — no exceptions, no delegation |

Notes that keep the system honest:

- **Merge = deploy.** `main` auto-deploys to Railway (api, web, worker). Never merge something you would not deploy.
- **Risk is set by the highest-risk file touched**, not by the average. One line in `stripe.ts` inside a docs PR makes it HIGH.
- **Hermes may reclassify.** If a PR labeled LOW touches MEDIUM+ surface, Hermes bumps the label and the new gate applies. Mislabeling is a process bug — log it, don't argue it.
- **Hotfix lane:** production down → branch `hotfix/*`, label `hotfix`, minimal diff, CI must still pass; founder may approve verbally and the PR records that approval after the fact (same day).
- **Secrets are never in scope.** Any PR that would add, print, or commit a secret is rejected at any level. Secrets live only in Railway/Supabase/Stripe dashboards and the founder's password manager.
- **`no-autodeploy`** label marks changes that must sit on `main` without being considered "live-approved" (e.g. feature-flagged work awaiting a founder switch).

---

## 3. Workflow

```
Founder intent (Telegram/chat)
   → Hermes: plan + GitHub issue (template: claude-task.yml, with risk level)
   → Claude Code: branch → implement → verify → PR (template auto-fills disclosure)
   → CI: build + tests must be green
   → Gate by risk level (see table above)
   → Merge to main = deploy (Railway)
   → Claude Code: post-deploy verification (logs, live probe) reported on the PR/issue
```

- One capability per branch/PR. Append-only logs stay append-only.
- Reviews happen **in the PR** (comments + approval), so the decision history is permanent.
- Live/production/destructive/paid actions documented inside any PR still require their own founder approval when executed — merging a doc or code that *prepares* an action is not approval to *run* it.

### CI checks & E2E policy (issue #143)

The **required** merge gate on every PR is six fast checks:
**Build · Unit & Integration Tests · Lint & Type Check · Security Checks · Compliance Tests · Smoke.**
"Smoke" boots the Hono route layer in-process (routing + auth wired) in ~1 min — it is the fast required signal.

Full **Playwright E2E is advisory, not a merge gate.** It has a known CI-runner SSR stall that does not reproduce in `next start` / Docker / Railway, so it is `continue-on-error` and must **not** be a branch-protection required check. It now runs only on demand (`workflow_dispatch`), nightly, or on PRs that touch high-risk UI/auth/billing/admin paths (see `.github/workflows/e2e.yml`).

**Hermes may approve/merge despite "Playwright E2E" being cancelled/stalled** when all of:
- the six required checks are green, and
- the PR is LOW/MEDIUM risk and does **not** change auth, billing, checkout, admin, or the middleware/CSP.

For HIGH/CRITICAL or auth/billing/checkout/admin changes, run full E2E first (`workflow_dispatch` on the branch, or rely on the path-filtered auto-run) and confirm it passes before approving.

---

## 4. Launch execution phases

The platform is nearly ready. The operational sequence to launch and sell:

### Phase 1 — Founder switches (blockers, founder-only)
- Add credits / API keys: **Anthropic, OpenAI, Gemini** (Perplexity and DataForSEO already work).
- Enable **Stripe Customer Portal**; confirm the Stripe **webhook** end-to-end.
- Then: run a **real Ozvor audit** + full **smoke test** → declare the product operational.

### Phase 2 — Proof and sales pages
- **P1** Live case study — upgrade `/results` with the real Ozvor score.
- **P2** Comparison pages: Ozvor vs Profound, Peec, Otterly, AthenaHQ.
- **P3** Campaign landing pages with UTM variants.
- **P4** GEO-for-niche pages: e-commerce, SaaS, local services.
- **P5** Legal/ROPA completion with company details (razão social + address).

### Phase 2.5 — Channel & citation infrastructure (runs parallel with Phase 2)
For a GEO company, channels are **citation infrastructure**, not just marketing: LLMs cite Reddit, review sites, and entity profiles heavily, so Ozvor's presence on them is the product applied to itself. Per-channel setup steps + paste-ready profile copy live in GitHub issues labeled `marketing`.

- **Tier 1 — launch-blocking, free:** Google Search Console, Bing Webmaster Tools (+ IndexNow — ChatGPT search uses the Bing index), GA4, Reddit account (needs age/karma before posting), LinkedIn company page + founder profile, Google Business Profile (blocked on registered address).
- **Tier 2 — first 2 weeks:** G2, Capterra, AlternativeTo, Crunchbase, Product Hunt, YouTube, X handle.
- **Tier 3 — ad accounts only, NO spend:** Google Ads, Microsoft Ads, Reddit Ads, LinkedIn Ads. Created early so conversion tracking/billing approval doesn't queue Phase B; any actual spend is CRITICAL (founder always).
- **Rules:** entity consistency everywhere (same name, logo, one-liner, URL); sign-ups with @ozvor.com addresses; credentials held by founder only; never "TrustIndex" on any new profile.

### Phase 3 — Feeding cadence
- Dogfooding: public action cards from Ozvor's own audit.
- 2 blog posts/week · 3 LinkedIn posts/week.
- Reddit Tier 1 replies — ToS-safe and manual.
- Email inboxes live (`hello@`, `support@`, `billing@`, `founder@`, `dpo@`, `hermes@`) + outreach warmup.

### Phase 4 — Sales machine
- Up to 20 cold emails/day, personalized free tests as the hook.
- LinkedIn + Reddit follow-up; first calls.
- Sell Kits and the OrganicPosts Sprint.
- Feed learnings back into product pages and scripts.

---

## 5. Relationship to the ChampsFlow pipeline

The 7-phase pipeline and agent hierarchy in [CLAUDE.md](CLAUDE.md) and [docs/WORKFLOW.md](docs/WORKFLOW.md) remain the model for *how work is produced*. This document governs *how work is reviewed, gated, and shipped* now that OZvor is in launch/operations mode: GitHub PRs + risk gates are the operational instantiation of the pipeline's review discipline.
