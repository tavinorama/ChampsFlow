# Design: The Ozvor Agent Organization — Cells, the Chief Dreaming Officer, the LEAN Watchdog, and Buzz

> **TL;DR (≤200 words).** On 2026-08-13 the orchestrator lit up: a real graph run went
> memory→signal→briefing→3 angles→4 critics→synthesis→**human approval**, every step written to
> `ops.agent_run/agent_step/agent_outcome`. That substrate — identity (`vp_owner`), permission
> (operator key), audit trail (the ops tables), and a runner that coordinates agents — is exactly
> the foundation this vision needs. Three additions turn the current single-agent pipeline into a
> proactive organization: (1) **Cells** — each specialist point becomes ≥3 divergent agents →
> debate → synthesis, each carrying its own sphere memory; the fan-out already proven in the video
> graph, generalized. (2) **Chief Dreaming Officer (CDO)** — a planner graph that reads the
> substrate's outcomes and asks "how does this reach 10×, return 100×?", then *spawns* brainstorm
> runs inside the cells; a graph that generates graphs. (3) **Watchdog (LEAN)** — a kaizen agent
> that reads every process (graphs, crons, `ops.*`, docs) and proposes the leanest, clearest
> version, measured in cost-per-outcome and cycle time. **Buzz** (Block's open-source AI-native
> Slack+GitHub, agents as first-class members with crypto identity + audit) becomes the *surface*
> that hosts all of this, replacing the Telegram+overview+n8n glue. Economics: the flat-fee VPS
> engine is what makes ≥3-agent cells affordable. Nothing publishes or spends without the founder.
> This document is design only — no code ships from it.

---

## 0. Why this, why now

The company just crossed from *built* to *running*: the daily-video graph executes end-to-end and
parks at a human gate. But it is still **one agent per point, reactive** (cron- or manually
triggered). The founder's ask is a step-change:

- **Proactive** agents, not scheduled ones — the org should *initiate* opportunity, not wait.
- **Cells of ≥3 agents** at each point — diversity and debate beat a single voice, and redundancy
  removes single points of failure.
- A **Chief Dreaming Officer** — an agent whose entire job is imagining the 10×/100× version of
  every part of the company and turning that into experiments the cells run.
- A **Watchdog** — an agent whose entire job is keeping every process LEAN and clear.
- All of it living in **Buzz**, an AI-native workspace where agents are teammates.

The strategic frame: Ozvor sells *AI visibility* to companies. Running the company itself as an
agent organization — visibly, auditably — is the proof of the product. Buzz makes that visible.

**Scope of this document:** design only. Implementation follows the normal branch → PR → CI →
risk-gated approval flow in `AGENTS.md`.

---

## 1. What already exists (the 70%)

| Piece | Where | What it gives the org |
|---|---|---|
| Agent substrate | `packages/db/migrations/20260806000002_ops_agent_substrate` — `ops.agent_run/agent_step/agent_outcome` | Identity (`vp_owner`), the audit trail, the outcome memory (`lift`) |
| Graph brain | `apps/api/src/lib/agent-graphs.ts` — versioned definitions, `validateGraph`, `readyNodes` | Fan-out/join with no operator; the two hard rules (nothing publishes without approval; every publish learns) |
| Graph runner (body) | `apps/api/src/lib/graph-runner.ts` + `apps/worker/src/jobs/graph-tick.ts` | The engine that advances runs: task/debate/synthesis/approval/publish/wait/harvest/verdict |
| Prompt registry | `apps/api/src/lib/graph-prompts.ts` | Prompts as data next to definitions — new cell roles are new entries, not redeploys |
| Operator surface | `apps/api/src/routes/operator-agents.ts`, `operator-graphs.ts` | Start/inspect runs, record outcomes — the API the CDO/Watchdog call to spawn and read |
| Reach harvest | `/root/ozvor-social-harvest.mjs` (VPS cron) → `agent_outcome` | The feedback the CDO optimizes against (what actually reached people) |
| CEO→VP→job analysis | `apps/api/src/lib/agent-ops.ts` | The org-chart rollup the Watchdog extends with a LEAN lens |
| Flat-fee VPS engine | Hermes task server (claude Max / ChatGPT / kimi fallback) | The economics that make ≥3-agent cells affordable |
| Human gate | approval node → Telegram (today) | The governance the whole org still bows to |

The 30% that is new: the **cell** pattern, the **CDO** planner, the **Watchdog** analyst, and the
**Buzz** surface. Each is described below in the same shape.

---

## 2. Cells — ≥3 agents at every point (proactive)

### 2.1 The pattern

Today a "specialist" is one agent. A **cell** is the debate we already run in the video graph,
generalized into a reusable fragment:

```
        ┌─ agent A (lens/angle 1) ─┐
 INPUT ─┼─ agent B (lens/angle 2) ─┼─ DEBATE (≥3 critics, distinct lenses) ─ SYNTHESIS ─ OUTPUT
        └─ agent C (lens/angle 3) ─┘         (veto lenses: compliance, freshness)
```

- **≥3 divergent producers**, each with a different stance (story / contrarian / how-to; or
  channel-specific angles). More than 3 when the surface is wide (a launch), fewer never.
- **≥3 critics with distinct lenses** — the pattern proven in daily-video v2 (hook / brand /
  compliance / freshness), where compliance and freshness carry *veto*, not just a score.
- **A synthesis** that must obey the vetoes.
- **A cell memory**: each cell reads its own sphere's `agent_outcome` history before producing, so
  it stops repeating what didn't work (the anti-repetition rule, generalized from the video memory
  node).

This is #156 (specialists per sphere) evolved: a sphere is not one agent, it is a cell.

### 2.2 Cells as graph fragments

A cell is expressed as a sub-graph in `agent-graphs.ts` — a set of nodes with a shared parent and a
join. Because the runner already handles fan-out/join with no operator, a cell needs **no new
runner code** — only new definitions + prompts. The registry (`GRAPH_REGISTRY`) grows one entry per
cell-bearing graph.

Spheres to cell-ify first (ranked by the harvest's real signal — Instagram responds, X is near
dead): **content-per-channel** (LinkedIn, IG, video), then **sales-outbound**, then **audits**.

### 2.3 What "proactive" means, concretely

Reactive = a cron or a human starts a run. Proactive = **an agent decides to start a run** from a
signal. Two triggers, both already expressible:

1. **Verdict-driven**: the `verdict` node writes an outcome; a low `lift` (a post that
   under-reached) enqueues a "why + retry-different" run in the same cell.
2. **Opportunity-driven**: the CDO (below) spawns runs when it sees headroom.

Proactivity is therefore not a new engine — it is the CDO + verdict edges closing onto the same
runner. The guard rails hold: a proactive run still parks at the human approval node before
anything publishes or spends.

---

## 3. The Chief Dreaming Officer (CDO)

### 3.1 The job

> Given the company's current state and its outcome history, imagine the 10×-reach / 100×-return
> version of any part of it, and turn the best imaginings into experiments the cells run.

Concretely: the CDO reads the substrate (`agent_outcome.lift` per metric, per sphere), the reach
harvest, the cost model, and the cell memories, and produces **dream briefs** — hypotheses of the
form *"campaign X reaches 10× if we do Y; here is the experiment to test it."*

### 3.2 The CDO is a graph that generates graphs

A new node kind, `dream`, and a new graph, `daily-dream`:

```
 STATE READ ─ pull outcomes/lift, reach, cost, cell memories (substrate + harvest)
   │
 DREAM (fan-out ≥5 divergent hypotheses) ─ "how does <target> get 10× reach / 100× result?"
   │        each hypothesis from a different frame: distribution · offer · format · channel · timing
 SCORE (debate ≥3 judges) ─ expected lift × confidence × cost-to-test; kill the hand-wavy
   │
 SYNTHESIS ─ the top 1–3 experiments, each as a runnable brief
   │
 HUMAN APPROVAL (Telegram/Buzz) ─ founder picks which experiments run
   │
 SPAWN ─ for each approved brief, start a run in the target cell (POST /operator/graph-runs)
   │
 WAIT + HARVEST + VERDICT ─ did the experiment move the metric? write it back → the CDO learns
```

Key properties:
- **It reads the whole company through the substrate**, so its dreams are grounded in what actually
  happened, not vibes. A dream that ignores the harvest ("let's 10× on X") is scored down because
  the data says X is dead.
- **It spawns, it does not publish.** The CDO's output is *approved experiments that become cell
  runs*; the cells still park at their own human gates. Two gates, not zero.
- **It learns**: the verdict on each experiment updates the CDO's next dream (an experiment that
  10×'d gets its pattern reinforced).

### 3.3 The "cell brainstorm" the founder described

When the founder (or the CDO) asks *"how does this marketing campaign reach 100× more people?"*,
that question becomes a `dream` fan-out **inside the relevant cell's memory** — the LinkedIn cell
brainstorms LinkedIn-native 100× moves, the video cell brainstorms video-native ones, each drawing
on its own outcome history. The CDO aggregates and scores across cells. This is exactly the
"brainstorm inside the specialist cell, using its memory and the whole process" the founder wants.

---

## 4. The Watchdog (LEAN / kaizen)

### 4.1 The job

> Read every process the company runs — graphs, crons, `ops.*`, the process docs — and continuously
> propose the leanest, clearest version of each, measured objectively.

The Watchdog is the CDO's opposite number: the CDO adds (opportunity), the Watchdog removes (waste).
Together they are offense and defense on the same substrate.

### 4.2 What it measures (objective, from the substrate)

| Metric | Source | LEAN question it answers |
|---|---|---|
| Cost per outcome | `agent_step.cost_cents` ÷ realized `lift` | Which processes spend most for least? |
| Cycle time | `run.ended_at − started_at`; step `ms` | Where does a run stall? (the 10-min tick? a wait?) |
| Failure rate | `run.status='failed'` share, by graph/node | Which node breaks most? |
| Redundancy | duplicate graphs/crons/triggers (e.g. the 08:30 harvest dup) | What runs twice for one result? |
| Silent degradation | steps with no outcome (`stepsMissingOutcome`) | What produces but never reads back? |

### 4.3 The output: proposals, not edits

The Watchdog **proposes** — it opens a "process finding" (a row / a Buzz thread / a spawned task)
with the waste, the evidence, and the leaner alternative. A human (or the founder's standing rule)
decides. It never silently rewrites a process; that would violate "nothing degrades silently" by
degrading the *process* silently. It is the automated, continuous version of the #157 red team and
the #153 general audit, run daily instead of once.

### 4.4 Relationship to existing work

The Watchdog subsumes and continues: #151 (agent-ops analysis — its read layer), #157 (red team —
its adversarial lens), #153 (general audit — its promise-vs-delivery lens). Those become *lenses of
the Watchdog cell*, not separate one-off tasks.

---

## 5. Buzz — the surface

### 5.1 Why Buzz fits, specifically

Buzz (Block, open-source, self-hostable; agents are first-class members with cryptographic
identity, their own permissions, and their own audit trail; built-in Git; swappable model harness)
maps 1:1 onto what we built:

| Buzz concept | Our equivalent (already built) |
|---|---|
| Agent identity (crypto) | `vp_owner` + operator key per agent/cell |
| Agent permissions | operator scopes (`operator`, `business`, `write:audits`) |
| Agent audit trail | `ops.agent_run/step/outcome` |
| Agents run workflows / coordinate agents | the graph runner + `POST /operator/graph-runs` |
| Built-in Git, agents open PRs | our branch→PR→CI flow (agents already open PRs) |
| Swappable harness | the flat-fee engine fallback chain (claude→kimi→codex) |
| Channels / threads | per-cell + per-graph streams |

Buzz does not replace the substrate — it **renders** it, and gives humans + agents one place to
talk, approve, and see the audit. The Telegram approval, the overview artifact, and the n8n glue
collapse into Buzz channels.

### 5.2 Integration model (to be validated by a spike)

Two layers:
1. **Read/replicate**: mirror `ops.agent_run/step/outcome` events into Buzz channels (a run =
   a thread; steps = messages; the verdict = a pinned result). Low-risk, high-value: the company's
   activity becomes legible in one workspace.
2. **Act**: register the CDO, Watchdog, and cells as Buzz agents with identities; the human approval
   node posts to a Buzz channel with approve/reject; approving calls the same `#445` step-finish
   route. Buzz's Git hosting can host the graph definitions so *editing a cell is a Buzz PR*.

Because Buzz is self-hostable, it lives on the same VPS ethos as the Hermes engine — no per-seat
SaaS lock-in, full auditability, which is also the compliance posture the company already argues.

### 5.3 Honest unknowns (spike will answer)

- Buzz's agent-identity API and how an external runner (our worker) posts as an agent.
- Whether Buzz's Git can be the source of truth for graph definitions, or mirrors GitHub.
- Self-host cost/ops on the current VPS (resource footprint).
- Maturity: it launched 2026-07-21; a spike de-risks betting the org's surface on a young product.

---

## 6. Cost & governance (the hard rules, unchanged)

- **≥3-agent cells + a dreaming officer multiply token spend.** The only reason this is viable is
  the **flat-fee VPS engine** (claude Max / ChatGPT plans, kimi fallback): dreaming, debating, and
  critiquing run there at no per-call cost. **Rule:** all divergent/ideation/critique work runs on
  the flat-fee engine; only publish and audit (which cost real money) cross the paid gate.
- **Nothing publishes or spends without the founder.** The CDO spawns experiments; each still parks
  at a human approval node. Two gates on any money/publish path, never zero.
- **The Watchdog proposes, never silently edits** a process.
- **Everything is on the substrate** — every dream, critique, and finding is a row with a hash, so
  the org is auditable end to end (and Buzz renders that audit).
- **Budget stance:** the CDO/Watchdog cadence is bounded (e.g. one dream run/day, one watchdog
  run/day) and the flat-fee engine has session limits — so the fallback chain and a per-day run cap
  keep it from runaway. A "spend ceiling" env, like the graph-tick cadence, governs it.

---

## 7. Phased plan (design only — each phase is its own PR chain)

| Phase | What | Depends on | Risk |
|---|---|---|---|
| **P1** | **Cell pattern**: generalize the video fan-out into a reusable cell fragment + one real cell (the LinkedIn content cell) with sphere memory | orchestrator (live) | LOW — definitions + prompts, no runner change |
| **P2** | **Watchdog v1**: daily graph reading `ops.*` + producing process findings (cost/cycle/failure/redundancy) to a table + Telegram/Buzz | substrate (live) | LOW — read-only analysis |
| **P3** | **CDO v1**: `dream` node + `daily-dream` graph that reads outcomes, fans out hypotheses, scores, parks for approval, spawns approved experiments | cells (P1) | MEDIUM — new node kind, spawns runs |
| **P4** | **Buzz spike**: self-host Buzz, mirror `ops.*` into channels, register one agent, prove approve-in-Buzz | P1–P3 to have content to show | MEDIUM — new infra, young product |
| **P5** | **Buzz full**: cells/CDO/Watchdog as Buzz agents; approvals + graph-definition PRs in Buzz; retire Telegram/overview glue | P4 spike green | HIGH — surface migration |

Recommended order matches the founder's "design first": this document → review → P1 (cells, the
cheapest high-value step) and P2 (Watchdog, pure read) in parallel → P3 (CDO) → then the Buzz spike
once there is a real org to render.

---

## 8. Open decisions for the founder

1. **Buzz commitment level** — spike-and-evaluate (recommended, given it is 3 weeks old) vs. commit
   the org's surface to it now.
2. **Cell size default** — 3 producers + 3 critics is the floor; wider for launches. Confirm the
   floor and the "wider when" trigger.
3. **CDO cadence & ambition** — one dream/day is the safe start; the founder may want it hotter
   (per-campaign, on-demand "dream this" button).
4. **Watchdog authority** — proposal-only (recommended) vs. allowed to auto-apply LOW-risk process
   cuts (e.g. delete a proven-duplicate cron) under a standing rule.
5. **Priority after this doc** — P1 (cells) or P2 (Watchdog) first. Recommendation: both, in
   parallel — they do not conflict and cover offense-readiness and efficiency at once.

---

*Sources on Buzz: TechCrunch (2026-07-21), The Next Web, Stork.AI, TMC Insight — Block's
open-source AI-native workspace where agents are first-class teammates.*
