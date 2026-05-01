# ChampsFlow

**End-to-end agentic workflow for building SaaS products and running an AI-native company** — from idea to production, with compliance and ethics baked into every gate, and a full executive hierarchy on top.

ChampsFlow is a Claude Code scaffolding template with **40 specialized subagents** organized in two layers:
- **Product pipeline** — 7 structured phases from Discovery to Deploy. Code is **Phase 5**, never Phase 1.
- **Executive hierarchy** — CEO + 6 VP agents that orchestrate the company across Engineering, Marketing, Sales, CX, Finance, and Legal.

EU and US compliance checks block phase transitions automatically.

---

## Why this exists

Most AI-assisted dev workflows jump straight to code. ChampsFlow enforces the discipline that ships *products*, not just software:

- Every feature traces back to a validated user pain point
- Architecture decisions are made before any file is created
- Compliance (GDPR, EU AI Act, CCPA, SOC 2) is a gate, not an afterthought
- Workers build; supervisors review; council agents block bad decisions
- A learning loop captures failures and prevents them from repeating

---

## The 7-phase pipeline

```
Phase 1  Discovery       research market, competition, user pain points
Phase 2  Product (PRD)   scope, user stories, success metrics, data inventory
Phase 3  Architecture    stack, data model, API contracts, threat model
Phase 4  UX / UI         flows, wireframes, design system, consent UX
Phase 5  Implementation  ← code starts here (one capability at a time)
Phase 6  QA              unit, integration, e2e, compliance test scenarios
Phase 7  Deploy          CI/CD, IaC, observability, incident response
```

Each phase has a **worker** that produces and a **supervisor** that reviews. No worker approves their own output.

---

## The 40 agents

### Executive layer (company-wide orchestration)

```
CEO Agent → VP Engineering → product-manager → [7-phase pipeline]
         → VP Marketing   → marketing-strategist / content-writer / seo-agent
         → VP Sales       → sales-researcher
         → VP CX          → support-agent
         → VP Finance     → finance-reporter / invoice-processor
         → VP Legal       → legal-privacy-officer / ai-ethics-reviewer / security-compliance-officer
```

| Agent | Model | Role |
|---|---|---|
| `ceo-agent` | opus | Translates founder vision + OKRs into department goals. Reads `docs/company/STATE.md`. Dispatches one VP per turn. |
| `vp-engineering` | sonnet | Wraps the ChampsFlow product pipeline. Tracks velocity, technical debt, system health. |
| `vp-marketing` | sonnet | Owns content, SEO, campaigns. Tracks traffic, MQLs, brand. |
| `vp-sales` | sonnet | Owns pipeline, playbook, CRM hygiene. Tracks ARR, conversion, win rate. |
| `vp-cx` | sonnet | Owns support, NPS, retention. Surfaces Voice of Customer to Engineering. |
| `vp-finance` | sonnet | Owns P&L, cashflow, vendor contracts, runway. |
| `vp-legal` | sonnet | Owns compliance posture, DPAs, regulatory monitoring. Coordinates the Compliance Council operationally. |

State hierarchy:
- `docs/company/STATE.md` — CEO reads this
- `docs/departments/[dept]/STATE.md` — each VP owns their own
- `docs/STATE.md` — product pipeline state (VP Engineering reads, PM updates)

### Product pipeline orchestrator
| Agent | Role |
|---|---|
| `product-manager` | Reads only TL;DRs. Dispatches one agent per turn. Never executes work itself. |

### Phase pairs (worker → supervisor)
| Phase | Worker | Supervisor |
|---|---|---|
| 1 Discovery | `discovery-researcher` | `discovery-validator` |
| 2 Product | `product-spec-writer` | `spec-reviewer` |
| 3 Architecture | `system-architect` | `architecture-reviewer` |
| 4 UX/UI | `ux-designer` | `ux-reviewer` |
| 5 Implementation | `coder` (orchestrator) | `code-reviewer` (cross-layer gate) |
| 6 QA | `qa-engineer` | `qa-reviewer` |
| 7 Deploy | `devops-engineer` | `devops-reviewer` |

### Phase 5 Specialist Sub-Agents
Phase 5 is no longer a single coder + reviewer pair. The `coder` is now an **orchestrator** that dispatches specialized agents per layer:

```
coder (Phase 5 Orchestrator)
├── database-agent       ← schema, migrations, indexes (runs first)
│   └── backend-reviewer ← reviews migration safety
├── auth-agent           ← login flows, tokens, RBAC (runs second)
│   └── backend-reviewer ← reviews auth code
├── backend-coder        ← API endpoints, services, business logic
│   └── backend-reviewer ← reviews backend code
├── integration-coder    ← third-party APIs, webhooks, adapters
│   └── backend-reviewer ← reviews integration code
└── frontend-coder       ← UI, components, routing, state (runs last)
    └── frontend-reviewer ← reviews accessibility, design system, spec alignment
```

After all layers are approved, `code-reviewer` performs a final cross-layer integration check before the gate.

### Compliance & Ethics Council
| Agent | Domain |
|---|---|
| `legal-privacy-officer` | GDPR · ePrivacy · EU AI Act (privacy) · CCPA/CPRA · US state laws · HIPAA · GLBA |
| `ai-ethics-reviewer` | EU AI Act risk classification · NIST AI RMF · bias/fairness · US sectoral AI laws |
| `security-compliance-officer` | STRIDE threat model · OWASP · SOC 2 / ISO 27001 · NIST CSF |

### Business department specialists (dispatched by VP agents)
| Agent | Dispatched by | Role |
|---|---|---|
| `marketing-strategist` | vp-marketing | GTM strategy, ICP, messaging, 90-day content calendar |
| `content-writer` | vp-marketing | Blog posts, landing copy, email campaigns (one piece per invocation) |
| `seo-agent` | vp-marketing | Keyword research, SERP analysis, technical SEO checklist |
| `sales-researcher` | vp-sales | Sales playbook, battle cards, objection handling, outreach sequences |
| `support-agent` | vp-cx | Knowledge base articles, FAQ, troubleshooting guides, escalation playbook |
| `finance-reporter` | vp-finance | Monthly P&L, cashflow statements, budget variance reports |
| `invoice-processor` | vp-finance | Invoice categorization + expense log + anomaly flags |

### Learning Loop Agent
| Agent | Role |
|---|---|
| `postmortem-agent` | Invoked after 2+ blocked review cycles or a gate failure. Extracts root causes and updates `docs/learning/` to prevent repeat mistakes. |

---

## Compliance gates

Council agents issue `APPROVED / APPROVED_WITH_CONDITIONS / BLOCKED` verdicts before each phase transition. The PM cannot advance without an `APPROVED` verdict in the gate log.

| Gate | After phase | Reviewers |
|---|---|---|
| 0 → 1 | Discovery | legal-privacy |
| 2 → 3 | PRD | legal-privacy + ai-ethics |
| 3 → 4 | Architecture | **all 3** — DPIA + threat model produced here |
| 4 → 5 | UX | legal-privacy (consent flows, dark patterns) |
| 5 → 6 | Implementation | security-compliance |
| 6 → 7 | QA | ai-ethics + security-compliance |
| 7 go-live | Deploy | **all 3** — joint sign-off required |

### Jurisdictions covered

| Jurisdiction | Regulations |
|---|---|
| EU | GDPR · ePrivacy Directive · EU AI Act · Digital Services Act · NIS2 · Cyber Resilience Act |
| US federal | FTC Act §5 · CAN-SPAM · COPPA · HIPAA · GLBA · FCRA · FERPA |
| US state | CA (CCPA/CPRA) · VA · CO (+ CO AI Act) · CT · UT · TX · OR · MT · IA · DE and newer state laws |
| AI-specific | NIST AI RMF · NYC Local Law 144 (AEDT) · IL AI Video Interview Act · CA SB-942 |

---

## Learning loop

ChampsFlow gets smarter over time through a structured learning system.

When a capability requires 2+ blocked review cycles, or a compliance gate returns BLOCKED, the PM dispatches `postmortem-agent`. It:

1. Analyzes the BLOCKED review and the fix that resolved it
2. Writes a postmortem in `docs/learning/postmortems/YYYY-MM-DD-[slug].md`
3. Appends the root cause as a named anti-pattern in `docs/learning/anti-patterns.md`
4. Optionally records a proven pattern in `docs/learning/patterns.md`

Every Phase 5 specialist reads `docs/learning/anti-patterns.md` before writing any code. This means mistakes made early in a project cannot be repeated in later capabilities.

The learning docs are committed to the repository and grow with the project — they are institutional knowledge, not generated artifacts.

---

## Token economy

ChampsFlow is designed for long sessions and large codebases without burning context.

- **TL;DR contracts** — every artifact opens with a ≤200-word summary. The PM reads only that; it goes deep only when a gate returns `BLOCKED` with a section reference.
- **Narrow tool lists** — reviewers cannot edit; workers cannot approve themselves; council agents only append to `gate-log.md`.
- **Append-only logs** — `docs/05-impl-log.md` and `docs/compliance/gate-log.md` grow, never overwrite.
- **One agent per turn** — sequential dispatch keeps the orchestrator's context clean.
- **Living compliance docs** — DPIA, ROPA, threat model, and AI risk assessment update incrementally across gates instead of being rewritten from scratch.
- **Layer-scoped specialists** — each Phase 5 sub-agent reads only the slice of the architecture relevant to its layer, keeping context small.

---

## Compliance artifacts (auto-generated)

| File | What it is | Created at gate |
|---|---|---|
| `docs/compliance/regulatory-map.md` | Applicable EU + US regulations per sector | 0 → 1 |
| `docs/compliance/dpia.md` | Data Protection Impact Assessment (GDPR Art. 35) | 3 → 4 |
| `docs/compliance/ai-risk-assessment.md` | EU AI Act classification + NIST AI RMF | 2 → 3, updated 3→4 and 6→7 |
| `docs/compliance/threat-model.md` | STRIDE analysis per trust boundary | 3 → 4 |
| `docs/compliance/ropa.md` | Record of Processing Activities (GDPR Art. 30) | 3 → 4, living |
| `docs/compliance/model-cards/` | One model card per AI feature | 6 → 7 |
| `docs/compliance/gate-log.md` | Append-only verdict log from all gates | All gates |

---

## Repository structure

```
.claude/agents/             40 agent definitions
CLAUDE.md                   loaded every session — rules + project meta
docs/
  WORKFLOW.md               full pipeline reference
  STATE.md                  product pipeline state (PM updates every turn)
  _handoff-template.md      required structure of every phase artifact
  01-discovery.md           Phase 1 output + review
  02-prd.md                 Phase 2 output + review
  03-architecture.md        Phase 3 output + review
  04-ux.md                  Phase 4 output + review
  05-impl-log.md            append-only log of capabilities shipped
  05-review-[capability].md per-capability code review
  06-qa.md                  Phase 6 output + review
  07-deploy.md              Phase 7 output + review
  company/
    STATE.md                company OKRs + dept status (CEO reads this)
  departments/
    engineering/STATE.md    eng dept state — VP Engineering owns
    marketing/STATE.md      marketing dept state
    sales/STATE.md          sales dept state
    cx/STATE.md             CX dept state
    finance/STATE.md        finance dept state
    legal/STATE.md          legal dept state
  learning/
    anti-patterns.md        append-only; all Phase 5 agents read before coding
    patterns.md             append-only; proven approaches validated in this codebase
    postmortems/            one file per incident — YYYY-MM-DD-[slug].md
  compliance/
    regulatory-map.md
    dpia.md
    ai-risk-assessment.md
    threat-model.md
    ropa.md
    model-cards/
    gate-log.md
```

---

## How to use ChampsFlow

### 1. Clone the scaffolding for your project

```bash
git clone https://github.com/tavinorama/ChampsFlow.git my-saas
cd my-saas
rm -rf .git && git init -b main
```

### 2. Open Claude Code in the project directory

```bash
claude
```

### 3. Start your project — choose ONE of two modes

**Mode A — Single product (recommended for MVPs):**
```
product-manager: start a new SaaS — [your idea in 1–2 sentences]
```
The PM asks for project name, sector, and jurisdictions, then runs the 7-phase pipeline.

**Mode B — Full company (multi-department orchestration):**
```
ceo-agent: start a new company — [your vision in 1–2 sentences]
```
The CEO asks for company name, mission, stage, top 3 quarterly objectives, and which departments are active. Then it initializes `docs/company/STATE.md` and dispatches the first VP.

### 4. Follow the pipeline

After each agent completes, the orchestrator (PM or CEO) dispatches the next one. Compliance gates block phase transitions automatically — no manual tracking required.

### 5. Request work directly

You can also dispatch any VP or specialist directly:

```
vp-marketing: ship the launch campaign for [feature]
sales-researcher: build the sales playbook for the new pricing
support-agent: write KB articles for the onboarding flow
vp-finance: run the monthly P&L for October
```

---

## Prerequisites

- [Claude Code](https://claude.ai/code) with subagent support
- `ANTHROPIC_API_KEY` set in your environment

---

## Sector overrides

When `legal-privacy-officer` classifies the sector in `regulatory-map.md`, the relevant regime is added to gate checks automatically:

| Sector | Additional regime |
|---|---|
| Healthtech | HIPAA Security + Privacy Rule |
| Fintech | GLBA · PCI DSS (if payments) |
| Edtech | FERPA · COPPA (if minors) |
| HR-tech | EEOC AI guidance · NYC LL 144 · IL AI Video |
| Adtech | ePrivacy · IAB TCF · FTC behavioral advertising guidance |

---

## Contributing

Contributions welcome — especially:
- New jurisdiction coverage (LGPD, PIPL, PDPA, etc.)
- Sector-specific agent variants
- Improved UX for the PM orchestration loop

Open an issue or PR at [github.com/tavinorama/ChampsFlow](https://github.com/tavinorama/ChampsFlow).

---

## License

MIT
