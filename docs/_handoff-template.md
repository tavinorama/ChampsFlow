# Handoff Template

> Every phase artifact must end with a Handoff block. The next agent reads ONLY the TL;DR + Handoff block by default. Body is consulted on demand.

## Required structure (every phase artifact)

```
# [Phase N — Title]

## TL;DR
_≤200 words. Reader should understand the phase outcome without scrolling._
- Goal:
- Decisions made:
- Top risks:
- Status:

## [Phase-specific sections — see each agent prompt]

---

## Handoff
**Next phase**: [N+1 — name]
**Next agent**: [agent name]
**Context to load**: [list of file paths + section anchors that next agent must read]

**Phase 5 routing hint** _(fill only on handoff TO Phase 5)_:
- Database layer needed: [yes/no — why]
- Auth layer needed: [yes/no — why]
- Backend layer needed: [yes/no — why]
- Frontend layer needed: [yes/no — why]
- Integration layer needed: [yes/no — which services]

**Learning references** _(fill if known anti-patterns apply)_:
- Check `docs/learning/anti-patterns.md` § [relevant section]

**Open questions for next phase**:
1.
2.

**Pending compliance conditions** (from gate verdict):
- [ ]
- [ ]
```
