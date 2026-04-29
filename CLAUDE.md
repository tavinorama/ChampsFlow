# CLAUDE.md

This file is loaded into context for every Claude Code session in this project. It teaches Claude (and any agent) the rules of how this SaaS gets built. The single source of *current* state is `docs/STATE.md` — read it first.

---

## Project meta
> Filled by `product-manager` agent on init. Update only when the project itself changes.

- **Name**: _(fill on init)_
- **One-line description**: _(fill on init)_
- **Sector**: _(general SaaS | fintech | healthtech | edtech | adtech | HR-tech | other)_
- **Jurisdictions**: EU + US _(default — change here if scope differs)_
- **Repository**: _(URL when set)_
- **Initialized**: _(date)_

---

## How this project is built

This project follows a 7-phase agentic workflow. **Code is Phase 5 — never start there.**

```
1. Discovery        →  discovery-researcher  +  discovery-validator    →  Gate 0→1
2. Product (PRD)    →  product-spec-writer   +  spec-reviewer          →  Gate 2→3
3. Architecture     →  system-architect      +  architecture-reviewer  →  Gate 3→4
4. UX/UI            →  ux-designer           +  ux-reviewer            →  Gate 4→5
5. Implementation   →  coder                 +  code-reviewer          →  Gate 5→6   ← code starts here
6. QA               →  qa-engineer           +  qa-reviewer            →  Gate 6→7
7. Deploy           →  devops-engineer       +  devops-reviewer        →  Gate 7 (go-live)
```

Each gate is reviewed by the **Compliance & Ethics Council**:
- `legal-privacy-officer` — GDPR, EU AI Act privacy, CCPA/CPRA + state laws, FTC §5, sector regimes
- `ai-ethics-reviewer` — EU AI Act risk classification, NIST AI RMF, US sectoral AI laws
- `security-compliance-officer` — STRIDE, OWASP, SOC 2 / ISO 27001 readiness

Full pipeline detail: [docs/WORKFLOW.md](docs/WORKFLOW.md).

---

## Hard rules (any session, any agent)

1. **Read `docs/STATE.md` first.** It's the only source of truth for what phase we're in.
2. **Do not skip phases.** Code (Phase 5) requires Phases 1–4 complete and gated.
3. **Do not advance past a phase** without an `APPROVED` gate verdict in `docs/compliance/gate-log.md`.
4. **Both jurisdictions are mandatory.** Every compliance artifact must address EU and US explicitly.
5. **Compliance artifacts are incremental.** DPIA, ROPA, threat model, AI risk assessment — update sections, never rewrite from scratch.
6. **TL;DRs are contracts.** Every artifact opens with ≤200-word TL;DR. Read TL;DR first; full body only on demand.
7. **Never write code, specs, or compliance content as the main session.** Always dispatch the specialist agent via Task.
8. **One agent per turn.** Sequential dispatch — no parallel sub-agents in the main flow.
9. **Workers cannot self-approve.** Reviewers cannot edit. Gate verdicts cannot be overridden silently.
10. **Append-only logs** (`docs/05-impl-log.md`, `docs/compliance/gate-log.md`) — never edit historical entries.

---

## Agent dispatch quick-reference

Always use the Task tool with `subagent_type` set to one of:

| Need | Agent |
|---|---|
| Decide what to do next, update STATE | `product-manager` |
| Phase 1 work | `discovery-researcher` → `discovery-validator` |
| Phase 2 work | `product-spec-writer` → `spec-reviewer` |
| Phase 3 work | `system-architect` → `architecture-reviewer` |
| Phase 4 work | `ux-designer` → `ux-reviewer` |
| Phase 5 work | `coder` → `code-reviewer` (one capability per invocation) |
| Phase 6 work | `qa-engineer` → `qa-reviewer` |
| Phase 7 work | `devops-engineer` → `devops-reviewer` |
| Privacy gate | `legal-privacy-officer` |
| AI ethics gate | `ai-ethics-reviewer` |
| Security gate | `security-compliance-officer` |

---

## File map

```
.claude/agents/        18 agent definitions
CLAUDE.md              this file — workflow rules + project meta
docs/
  WORKFLOW.md          full pipeline reference
  STATE.md             live project state (PM updates every turn)
  _handoff-template.md required structure of every phase artifact
  01-discovery.md      Phase 1 output (and its review)
  02-prd.md            Phase 2 output (and its review)
  03-architecture.md   Phase 3 output (and its review)
  04-ux.md             Phase 4 output (and its review)
  05-impl-log.md       append-only log of capabilities shipped
  05-review-*.md       per-capability code review
  06-qa.md             Phase 6 output (and its review)
  07-deploy.md         Phase 7 output (and its review)
  compliance/
    regulatory-map.md  EU + US scope (gate 0)
    dpia.md            Data Protection Impact Assessment (gate 3)
    ai-risk-assessment.md  EU AI Act + NIST AI RMF (gates 2, 3, 6)
    threat-model.md    STRIDE per trust boundary (gate 3)
    ropa.md            Record of Processing Activities (living)
    model-cards/       one per AI feature (gate 6)
    gate-log.md        append-only verdict log
```

---

## Starting a new project from this scaffolding

```
You: "product-manager: start a new SaaS — [your idea]"
```

The PM will:
1. Populate the Project meta block above
2. Initialize `docs/STATE.md`
3. Dispatch `discovery-researcher` to begin Phase 1

If you skip the PM and try to write code directly, every agent in this project is instructed to refuse and route you back through the pipeline.

---

## Token economy

- Read order: STATE.md → relevant TL;DRs → full body only if a verdict references a specific section.
- Each agent has narrow tools; reviewers cannot edit; council agents only append to `gate-log.md`.
- Compliance docs are living — update sections, do not rewrite.
- Default model per agent is in its frontmatter (workers: sonnet; many supervisors: haiku; council: sonnet).
