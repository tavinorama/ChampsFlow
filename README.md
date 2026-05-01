# ChampsFlow

**End-to-end agentic workflow for building SaaS products** — from idea to production, with compliance and ethics baked into every gate.

ChampsFlow is a Claude Code scaffolding template with 18 specialized subagents that guide a product through 7 structured phases. Code is **Phase 5**, never Phase 1. EU and US compliance checks block phase transitions automatically.

---

## Why this exists

Most AI-assisted dev workflows jump straight to code. ChampsFlow enforces the discipline that ships *products*, not just software:

- Every feature traces back to a validated user pain point
- Architecture decisions are made before any file is created
- Compliance (GDPR, EU AI Act, CCPA, SOC 2) is a gate, not an afterthought
- Workers build; supervisors review; council agents block bad decisions

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

## The 18 agents

### Orchestrator
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
| 5 Implementation | `coder` | `code-reviewer` |
| 6 QA | `qa-engineer` | `qa-reviewer` |
| 7 Deploy | `devops-engineer` | `devops-reviewer` |

### Compliance & Ethics Council
| Agent | Domain |
|---|---|
| `legal-privacy-officer` | GDPR · ePrivacy · EU AI Act (privacy) · CCPA/CPRA · US state laws · HIPAA · GLBA |
| `ai-ethics-reviewer` | EU AI Act risk classification · NIST AI RMF · bias/fairness · US sectoral AI laws |
| `security-compliance-officer` | STRIDE threat model · OWASP · SOC 2 / ISO 27001 · NIST CSF |

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
| 🇪🇺 EU | GDPR · ePrivacy Directive · EU AI Act · Digital Services Act · NIS2 · Cyber Resilience Act |
| 🇺🇸 US federal | FTC Act §5 · CAN-SPAM · COPPA · HIPAA · GLBA · FCRA · FERPA |
| 🇺🇸 US state | CA (CCPA/CPRA) · VA · CO (+ CO AI Act) · CT · UT · TX · OR · MT · IA · DE and newer state laws |
| 🤖 AI-specific | NIST AI RMF · NYC Local Law 144 (AEDT) · IL AI Video Interview Act · CA SB-942 |

---

## Token economy

ChampsFlow is designed for long sessions and large codebases without burning context.

- **TL;DR contracts** — every artifact opens with a ≤200-word summary. The PM reads only that; it goes deep only when a gate returns `BLOCKED` with a section reference.
- **Narrow tool lists** — reviewers cannot edit; workers cannot approve themselves; council agents only append to `gate-log.md`.
- **Append-only logs** — `docs/05-impl-log.md` and `docs/compliance/gate-log.md` grow, never overwrite.
- **One agent per turn** — sequential dispatch keeps the orchestrator's context clean.
- **Living compliance docs** — DPIA, ROPA, threat model, and AI risk assessment update incrementally across gates instead of being rewritten from scratch.

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
.claude/agents/             18 agent definitions
CLAUDE.md                   loaded every session — rules + project meta
docs/
  WORKFLOW.md               full pipeline reference
  STATE.md                  live project state (PM updates every turn)
  _handoff-template.md      required structure of every phase artifact
  01-discovery.md           Phase 1 output + review
  02-prd.md                 Phase 2 output + review
  03-architecture.md        Phase 3 output + review
  04-ux.md                  Phase 4 output + review
  05-impl-log.md            append-only log of capabilities shipped
  05-review-[capability].md per-capability code review
  06-qa.md                  Phase 6 output + review
  07-deploy.md              Phase 7 output + review
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

### 3. Start your project

```
product-manager: start a new SaaS — [your idea in 1–2 sentences]
```

The PM will ask for your project name, sector, and jurisdiction preferences, then populate `CLAUDE.md` and kick off Phase 1.

### 4. Follow the pipeline

After each agent completes, the PM dispatches the next one. Compliance gates block phase transitions automatically — no manual tracking required.

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
