# SaaS Build Workflow

End-to-end agentic pipeline from idea to production. Code is **Phase 5** of 7 — never the first step.

## Cast (18 agents)

### Orchestrator
- **`product-manager`** — coordinates everything. Reads only TL;DRs. Dispatches one agent per turn.

### Phase pairs (1 worker + 1 supervisor each)
| Phase | Worker | Supervisor |
|---|---|---|
| 1 Discovery | `discovery-researcher` | `discovery-validator` |
| 2 Product Definition | `product-spec-writer` | `spec-reviewer` |
| 3 Architecture | `system-architect` | `architecture-reviewer` |
| 4 UX/UI | `ux-designer` | `ux-reviewer` |
| 5 Implementation | `coder` | `code-reviewer` |
| 6 QA | `qa-engineer` | `qa-reviewer` |
| 7 Deploy | `devops-engineer` | `devops-reviewer` |

### Compliance & Ethics Council (cross-cutting, gate-based)
- **`legal-privacy-officer`** — GDPR, EU AI Act privacy, US federal + state privacy laws
- **`ai-ethics-reviewer`** — EU AI Act risk classification, NIST AI RMF, US sectoral AI laws
- **`security-compliance-officer`** — STRIDE threat model, OWASP, SOC 2 / ISO 27001 readiness

## Gate map

| Gate | When | Reviewers |
|---|---|---|
| 0 → 1 | After Discovery | legal-privacy |
| 2 → 3 | After PRD | legal-privacy + ai-ethics |
| 3 → 4 | After Architecture | all 3 (DPIA + threat model produced here) |
| 4 → 5 | After UX | legal-privacy (consent flows, dark patterns) |
| 5 → 6 | After Implementation | security-compliance |
| 6 → 7 | After QA | ai-ethics + security-compliance |
| 7 (go-live) | Pre-launch | all 3 — joint sign-off required |

## Token-economy principles

1. **TL;DR contracts**. Every artifact opens with ≤200-word TL;DR. PM and downstream agents read TL;DR by default; full body only on demand.
2. **Agents have narrow tools.** Reviewers cannot edit. Workers cannot approve themselves.
3. **State lives on disk.** `docs/STATE.md` is the only source of truth. PM touches it on every turn.
4. **Append-only logs.** `docs/05-impl-log.md` and `docs/compliance/gate-log.md` grow; nothing is overwritten silently.
5. **One agent per turn.** Sequential dispatch. No parallel sub-agents in the main flow.
6. **Compliance is incremental.** DPIA, ROPA, threat model, AI risk assessment update — not rewrite — across gates.

## How to run a session

1. Tell the `product-manager` agent your product idea.
2. PM populates `CLAUDE.md` `Project meta` block + initializes `docs/STATE.md`, then dispatches `discovery-researcher`.
3. After each agent finishes, you (or PM in autopilot) trigger the next dispatch.
4. PM blocks phase advance until the corresponding gate is `APPROVED`.
5. Repeat until Phase 7 ships.

> `CLAUDE.md` is the persistent project context loaded into every Claude Code session — workflow rules + project meta. `docs/STATE.md` is the live state. PM keeps both in sync.

## Files at a glance

```
.claude/agents/             # 18 agent definitions
CLAUDE.md                   # persistent context — workflow rules + project meta
docs/
  WORKFLOW.md               # this file
  STATE.md                  # project state, updated by PM every turn
  _handoff-template.md      # required structure of every phase artifact
  01-discovery.md           # Phase 1 output
  01-discovery-review.md    # Phase 1 supervisor verdict
  02-prd.md                 # Phase 2 output
  02-prd-review.md
  03-architecture.md
  03-architecture-review.md
  04-ux.md
  04-ux-review.md
  05-impl-log.md            # append-only per-capability log
  05-review-[capability].md # per-capability code review
  06-qa.md
  06-qa-review.md
  07-deploy.md
  07-deploy-review.md
  compliance/
    regulatory-map.md       # gate 0 → updated as scope evolves
    dpia.md                 # gate 3
    ai-risk-assessment.md   # gate 2 → updated 3, 6
    threat-model.md         # gate 3
    ropa.md                 # gate 3 → living
    model-cards/            # one per AI feature, gate 6
    gate-log.md             # append-only verdict log
```

## Jurisdictions baked in

- **EU**: GDPR, ePrivacy, EU AI Act, DSA, NIS2, Cyber Resilience Act
- **US federal**: FTC §5, CAN-SPAM, COPPA, HIPAA, GLBA, FCRA, FERPA (where applicable)
- **US state privacy**: CA (CCPA/CPRA), VA, CO (+ CO AI Act), CT, UT, TX, OR, MT, IA, DE, plus newer states
- **AI-specific US**: NIST AI RMF, NYC Local Law 144 (AEDT), IL AI Video Interview Act, CA SB-942

## Sector overrides
If `docs/compliance/regulatory-map.md` flags fintech / healthtech / edtech / adtech / HR-tech, the council agents add the corresponding sector regime (HIPAA, GLBA, COPPA, FCRA, FERPA, etc.) to gate checks automatically.
