# Project State

> Single source of truth. The `product-manager` agent reads this first every turn and updates it after every dispatched agent completes.

## Project meta
- **Name**: _(fill on init)_
- **Initialized**: _(date)_
- **Jurisdictions**: EU + US
- **Sector**: _(general SaaS | fintech | healthtech | edtech | adtech | HR-tech | other)_
- **Tech stack snapshot**: _(filled by system-architect at Phase 3 — e.g. Next.js 14 / FastAPI / PostgreSQL)_

## Current state
- **Current phase**: _(0 not started | 1 Discovery | 2 PRD | 3 Architecture | 4 UX | 5 Impl | 6 QA | 7 Deploy)_
- **Current step**: _(worker pending | worker done | supervisor done | gate pending | gate done)_
- **Last verdict**: _(APPROVED | APPROVED_WITH_CONDITIONS | BLOCKED)_
- **Next action**: _(which agent to dispatch next)_

## Phase 5 capability tracker
_Updated by PM after each capability completes. One row per PRD capability._

| Capability | Status | Layers used | Review cycles | Postmortem? |
|---|---|---|---|---|
| _(empty on init)_ | | | | |

## Pending gate conditions
_List of unresolved `APPROVED_WITH_CONDITIONS` items the next worker must address._
- [ ] _(empty on init)_

## Open risks
_Material risks surfaced by any phase. Update freely._
- _(empty on init)_

## Decisions log (append-only)
_Each entry: date | who decided | what | why._
- _(empty on init)_

## Phase status
| Phase | Worker | Supervisor | Gate | Verdict | Date |
|---|---|---|---|---|---|
| 1 Discovery | ☐ | ☐ | ☐ 0→1 |  |  |
| 2 PRD | ☐ | ☐ | ☐ 2→3 |  |  |
| 3 Architecture | ☐ | ☐ | ☐ 3→4 |  |  |
| 4 UX | ☐ | ☐ | ☐ 4→5 |  |  |
| 5 Implementation | ☐ | ☐ | ☐ 5→6 |  |  |
| 6 QA | ☐ | ☐ | ☐ 6→7 |  |  |
| 7 Deploy | ☐ | ☐ | ☐ 7 go-live |  |  |
