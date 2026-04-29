# Gate Log

> Append-only log of every gate verdict from the council agents.
> Format: each verdict is a level-2 heading. Newest at the bottom.

## Gate 0 — initial regulatory map
_Populated by `legal-privacy-officer` after Phase 1 (Discovery)._

---

## Template — copy when issuing a verdict
```
## Gate [N] — [YYYY-MM-DD] — [agent-name]
**Verdict**: APPROVED | APPROVED_WITH_CONDITIONS | BLOCKED
**Inputs reviewed**: [paths]
**Conditions / Blockers**:
1. [severity] [requirement] — [what must happen, with article/section reference]
2. ...
**Artifacts updated**: [paths]
**Next action**: [if APPROVED → advance phase; if conditions → which worker addresses them; if BLOCKED → which worker re-runs]
```

## Verdicts
_(empty on init — agents append below)_
