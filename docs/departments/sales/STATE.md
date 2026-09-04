# Sales Department State

> Owned by vp-sales. Read by ceo-agent (TL;DR only). Updated after every sales agent dispatch.

## TL;DR
> **Rewritten 2026-09-02** (the launch-week TL;DR below-referenced is superseded; sources: PENDING v4 Bloco 0 + 10.D, SmartLead API analysis 01/09).

**Armed, not firing.** Two ICPs separate-and-connected ([icp.md](icp.md) v2: A agencies · B organic-dependent SMBs · C wrong-tools SMBs → AI Audit $49). Inventory: **7,881 leads** in SmartLead (OZ-B Local 1,866 · OZ-A Agencies 489 · OZ-C SaaS/ecom 72 · Ozvor 1 mixed 4,200 · campaign 3888686 AISTACK with 1,254 classified), **4 campaigns DRAFTED, zero e-mails ever sent**, warm-up of the inboxes **ended 02/09**. Machine side in production: `prospect-batch` weekly (#547; 1st batch 02/09 extracted 0 site e-mails → source migrates to lead-finder/Apify, 10.C.17), reply follow-up with founder gate (#561, auto-send OFF until `SMARTLEAD_API_KEY`), SmartLead→CRM webhook proven 27/08, first-touch attribution (#527). Docs complete 02/09: [aistack-campaign-kit.md](aistack-campaign-kit.md) + [geo-campaign-kit.md](geo-campaign-kit.md) (mandatory opt-out footer; postal address = founder-accepted risk) + [sop-dia-do-disparo.md](sop-dia-do-disparo.md) + AI Stack battle card. **Dispatch blockers: paste the CAN-SPAM footer into the 4 DRAFTED campaigns, run the SOP checklist, founder activates.** Funnel proof exists: real $49 purchase 27/08, delivered same minute.

## Department meta
- **Head**: vp-sales
- **Playbook**: [icp.md](icp.md) (canonical, v2) · [aistack-campaign-kit.md](aistack-campaign-kit.md) · [geo-campaign-kit.md](geo-campaign-kit.md) · [sop-dia-do-disparo.md](sop-dia-do-disparo.md) · [discovery-audit-playbook.md](discovery-audit-playbook.md) · [battlecards.md](battlecards.md) · [first-week-playbook.md](first-week-playbook.md) (§4 cold sequence is PRE-rules history — the kits govern) · [signal-shortlist.md](signal-shortlist.md)
- **CRM**: `crm_contact` + `smartlead_event` in the product DB = system of record (webhook-fed); [crm-tracker.md](crm-tracker.md) + [week1-crm.csv](week1-crm.csv) are the launch-week historical tracker. Retention: no reply after 3 cycles or 12 months → erase (ROPA G29; purge job pending — founder purges manually with the recycling CSV).

## Metrics dashboard
| Metric | This month | Last month | Target |
|---|---|---|---|
| MRR/ARR | | | |
| New pipeline added | | | |
| MQL→SQL rate | | | |
| SQL→Demo rate | | | |
| Demo→Close rate | | | |
| Avg deal cycle (days) | | | |
| Win rate | | | |

## Pipeline summary
| Stage | # Deals | Total value | Avg days in stage |
|---|---|---|---|
| MQL | | | |
| SQL | | | |
| Demo Scheduled | | | |
| Proposal | | | |
| Closed Won | | | |
| Closed Lost | | | |

## Top loss reasons (this quarter)
- _(empty on init)_

## Open risks
- **CAN-SPAM postal address absent** — founder-accepted risk 02/09 (SOP §7); re-review at ~5k e-mails/month.
- **Reply SLA** — follow-up gate is 96h; a hot reply can die silently (10.D.8); interim: founder checks the Telegram draft queue 2×/day.
- **Prospect source** — engine-suggest + site-scrape yielded 0 usable e-mails in batch 1 (10.C.17); migrate to SmartLead lead-finder (2k credits/month FIRST) + Apify (blocked until SP-20 terms + GEO-D10 code geofence).

## Decisions log (append-only)
- **2026-09-02** | STATE rewritten to the armed-not-firing reality; ICP-2 merged into icp.md as Segment C (separate-and-connected, founder 01/09); GEO campaign kit + SOP do disparo created; opt-out footer mandatory in all kits, postal address = accepted risk; battle cards refreshed (AI Stack card, Agency corrected to 10 brands). Sources: PENDING v4, SmartLead API analysis 01/09, sweep 10.D.
