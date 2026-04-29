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
**Open questions for next phase**:
1.
2.

**Pending compliance conditions** (from gate verdict):
- [ ]
- [ ]
```
