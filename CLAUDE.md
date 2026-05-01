# CLAUDE.md

This file is loaded into context for every Claude Code session in this project. It teaches Claude (and any agent) the rules of how this AI-native company is built and run.

**Two entry points:**
- **Single product mode** → start with `product-manager` (uses `docs/STATE.md`)
- **Full company mode** → start with `ceo-agent` (uses `docs/company/STATE.md`)

---

## Project meta
> Filled by `product-manager` (product mode) or `ceo-agent` (company mode) on init. Update only when the project itself changes.

- **Name**: _(fill on init)_
- **One-line description**: _(fill on init)_
- **Sector**: _(general SaaS | fintech | healthtech | edtech | adtech | HR-tech | other)_
- **Jurisdictions**: EU + US _(default — change here if scope differs)_
- **Repository**: _(URL when set)_
- **Initialized**: _(date)_

---

## How this project is built

ChampsFlow has two layers:

### Layer 1 — Product pipeline (7 phases). **Code is Phase 5 — never start there.**

```
1. Discovery        →  discovery-researcher  +  discovery-validator    →  Gate 0→1
2. Product (PRD)    →  product-spec-writer   +  spec-reviewer          →  Gate 2→3
3. Architecture     →  system-architect      +  architecture-reviewer  →  Gate 3→4
4. UX/UI            →  ux-designer           +  ux-reviewer            →  Gate 4→5
5. Implementation   →  coder (orchestrator)  +  code-reviewer          →  Gate 5→6
6. QA               →  qa-engineer           +  qa-reviewer            →  Gate 6→7
7. Deploy           →  devops-engineer       +  devops-reviewer        →  Gate 7
```

Phase 5 expands into specialized sub-agents dispatched by the `coder` orchestrator:
```
coder (orchestrator)
 ├── database-agent      → backend-reviewer
 ├── auth-agent          → backend-reviewer
 ├── backend-coder       → backend-reviewer
 ├── integration-coder   → backend-reviewer
 └── frontend-coder      → frontend-reviewer
```

### Layer 2 — Executive hierarchy (company-wide orchestration)

```
CEO Agent → VP Engineering → product-manager → [7-phase pipeline]
         → VP Marketing   → marketing-strategist / content-writer / seo-agent
         → VP Sales       → sales-researcher
         → VP CX          → support-agent
         → VP Finance     → finance-reporter / invoice-processor
         → VP Legal       → legal-privacy-officer / ai-ethics-reviewer / security-compliance-officer
```

Each gate is reviewed by the **Compliance & Ethics Council**:
- `legal-privacy-officer` — GDPR, EU AI Act privacy, CCPA/CPRA + state laws, FTC §5, sector regimes
- `ai-ethics-reviewer` — EU AI Act risk classification, NIST AI RMF, US sectoral AI laws
- `security-compliance-officer` — STRIDE, OWASP, SOC 2 / ISO 27001 readiness

Full pipeline detail: [docs/WORKFLOW.md](docs/WORKFLOW.md).

---

## State hierarchy

- `docs/company/STATE.md` — CEO reads this (company OKRs, department status)
- `docs/departments/[dept]/STATE.md` — each VP reads their own department state
- `docs/STATE.md` — product pipeline state (VP Engineering reads this, PM updates it)

Each layer reads only its own STATE + TL;DRs from the layer below.

---

## Hard rules (any session, any agent)

1. **Read the right STATE first** — `docs/company/STATE.md` (CEO mode), `docs/departments/[dept]/STATE.md` (VP mode), or `docs/STATE.md` (PM mode).
2. **Do not skip phases.** Code (Phase 5) requires Phases 1–4 complete and gated.
3. **Do not advance past a phase** without an `APPROVED` gate verdict in `docs/compliance/gate-log.md`.
4. **Both jurisdictions are mandatory.** Every compliance artifact must address EU and US explicitly.
5. **Compliance artifacts are incremental.** DPIA, ROPA, threat model, AI risk assessment — update sections, never rewrite from scratch.
6. **TL;DRs are contracts.** Every artifact opens with ≤200-word TL;DR. Read TL;DR first; full body only on demand.
7. **Never write code, specs, copy, or compliance content as the main session.** Always dispatch the specialist agent via Task.
8. **One agent per turn.** Sequential dispatch — no parallel sub-agents in the main flow.
9. **Workers cannot self-approve.** Reviewers cannot edit. Gate verdicts cannot be overridden silently.
10. **Append-only logs** (`docs/05-impl-log.md`, `docs/compliance/gate-log.md`, all decisions logs) — never edit historical entries.
11. **Each level reads only its level.** CEO doesn't read PRDs. VP Engineering doesn't read code. PM doesn't read company OKRs (CEO summarizes them down).

---

## Agent dispatch quick-reference

Always use the Task tool with `subagent_type` set to one of:

### Executive layer
| Need | Agent |
|---|---|
| Coordinate the entire company (OKRs, departments) | `ceo-agent` |
| Engineering department management | `vp-engineering` |
| Marketing department management | `vp-marketing` |
| Sales department management | `vp-sales` |
| Customer experience management | `vp-cx` |
| Finance department management | `vp-finance` |
| Legal & compliance management | `vp-legal` |

### Product pipeline
| Need | Agent |
|---|---|
| Decide what to do next in product, update STATE | `product-manager` |
| Phase 1 work | `discovery-researcher` → `discovery-validator` |
| Phase 2 work | `product-spec-writer` → `spec-reviewer` |
| Phase 3 work | `system-architect` → `architecture-reviewer` |
| Phase 4 work | `ux-designer` → `ux-reviewer` |
| Phase 5 orchestration | `coder` (dispatches specialists below) |
| Database schema, migrations | `database-agent` |
| Auth flows, RBAC | `auth-agent` |
| API endpoints, business logic | `backend-coder` |
| Third-party integrations, webhooks | `integration-coder` |
| UI components, pages, design system | `frontend-coder` |
| Backend layer review | `backend-reviewer` |
| Frontend layer review | `frontend-reviewer` |
| Cross-layer gate review | `code-reviewer` |
| Phase 6 work | `qa-engineer` → `qa-reviewer` |
| Phase 7 work | `devops-engineer` → `devops-reviewer` |

### Compliance council
| Need | Agent |
|---|---|
| Privacy gate | `legal-privacy-officer` |
| AI ethics gate | `ai-ethics-reviewer` |
| Security gate | `security-compliance-officer` |

### Business specialists
| Need | Agent |
|---|---|
| Marketing strategy + content calendar | `marketing-strategist` |
| Blog posts, landing copy, emails | `content-writer` |
| Keyword research + SEO audit | `seo-agent` |
| Sales playbook + battle cards | `sales-researcher` |
| KB articles + escalation playbook | `support-agent` |
| Financial reports (P&L, cashflow) | `finance-reporter` |
| Invoice processing | `invoice-processor` |

### Learning loop
| Need | Agent |
|---|---|
| Post-failure root cause + anti-pattern extraction | `postmortem-agent` |

---

## File map

```
.claude/agents/        40 agent definitions
CLAUDE.md              this file — workflow rules + project meta
docs/
  WORKFLOW.md          full pipeline reference
  STATE.md             product pipeline state (PM updates every turn)
  _handoff-template.md required structure of every phase artifact
  01-discovery.md      Phase 1 output (and its review)
  02-prd.md            Phase 2 output (and its review)
  03-architecture.md   Phase 3 output (and its review)
  04-ux.md             Phase 4 output (and its review)
  05-impl-log.md       append-only log of capabilities shipped
  05-review-*.md       per-capability code review
  06-qa.md             Phase 6 output (and its review)
  07-deploy.md         Phase 7 output (and its review)
  company/
    STATE.md           company OKRs + department status (CEO reads this)
  departments/
    engineering/STATE.md   eng dept state (VP Engineering owns)
    marketing/STATE.md     marketing dept state (VP Marketing owns)
    sales/STATE.md         sales dept state (VP Sales owns)
    cx/STATE.md            CX dept state (VP CX owns)
    finance/STATE.md       finance dept state (VP Finance owns)
    legal/STATE.md         legal dept state (VP Legal owns)
  compliance/
    regulatory-map.md  EU + US scope (gate 0)
    dpia.md            Data Protection Impact Assessment (gate 3)
    ai-risk-assessment.md  EU AI Act + NIST AI RMF (gates 2, 3, 6)
    threat-model.md    STRIDE per trust boundary (gate 3)
    ropa.md            Record of Processing Activities (living)
    model-cards/       one per AI feature (gate 6)
    gate-log.md        append-only verdict log
  learning/
    anti-patterns.md   ALL Phase 5 agents read before coding
    patterns.md        proven patterns
    postmortems/       per-incident root-cause analyses
```

---

## Starting a new project from this scaffolding

### Option A — Single product (recommended for MVPs)
```
You: "product-manager: start a new SaaS — [your idea]"
```
The PM populates `Project meta`, initializes `docs/STATE.md`, and dispatches `discovery-researcher` to begin Phase 1.

### Option B — Full company (multi-department)
```
You: "ceo-agent: start a new company — [your vision]"
```
The CEO asks for company name, mission, stage, top 3 quarterly objectives, and which departments are active. Then it initializes `docs/company/STATE.md` and dispatches the most urgent VP.

If you skip the orchestrator and try to write code/copy/contracts directly, every agent in this project is instructed to refuse and route you back through the pipeline.

---

## Token economy

- Read order: relevant STATE → relevant TL;DRs → full body only if a verdict references a specific section.
- Each agent has narrow tools; reviewers cannot edit; council agents only append to `gate-log.md`.
- Compliance docs are living — update sections, do not rewrite.
- Default model per agent is in its frontmatter (CEO: opus; VPs + workers: sonnet; some supervisors: haiku; council: sonnet).
- Hierarchy reads up to one level only — CEO does NOT read PRDs; VP Engineering does NOT read code.
