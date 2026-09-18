# SmartLead: a watch that does not cry wolf, a source on every lead, and a DNS check of the sending domains (18/09)

**TL;DR.** Day 1 of the v4 campaigns (17/09): 200 sent, 6 bounces (3.0% each), 0 replies. Three things were learned and each is fixed here. (1) `smartlead-send-watch` went red with "ENVIO PARADO" on a day with 200 sends, because it compared with the measurement of four hours earlier and the daily quota (100 new leads per campaign) goes out in the first hour. The ruler is now day over day (newest measurement at least 20h old), the logic lives in a tested script, and the measurement is saved even when the alarm fires. (2) Nothing on a lead said where it came from, so the bounces could not be traced to a list. Every lead loaded from now on carries the custom field `source` (`own-<campaign id>` or `sp-<trade>`); it is not used in the copy. (3) The bounce notices stored by the webhook show 4 of 6 bounces were spam or policy rejections at the recipient (3 Mimecast 5.7.352, 1 5.7.1), 1 a Microsoft 365 group address, and only 1 a non-existent address. That points at sender authentication and reputation (R18), so a read-only `deliverability` command now checks SPF, DKIM (Microsoft selectors) and DMARC for every sending domain over public DNS.

## What changed
- `scripts/smartlead/send_watch.py` (new) + `.github/workflows/smartlead-send-watch.yml`: day-over-day ruler; `actions/cache/restore` + `actions/cache/save` with `if: always()` and the run attempt in the key; an ACTIVE campaign whose analytics cannot be read is "did not measure", never "zero".
- `scripts/smartlead/campaigns_v4.py`: `source_tag`, stamped in `load` and `prospect`; `deliverability` command and the pure `domain_auth` verdict (`nao_li` is never `ausente`).
- `.github/workflows/smartlead-campaigns-v4.yml`: action `deliverability` (read-only).
- `scripts/sql/smartlead-bounce-reasons.sql`: read-only, aggregates only.
- Tests: `tests/unit/smartlead-send-watch.test.ts` (5), 3 new in `tests/unit/smartlead-campaigns-v4.test.ts`.

## What it does not do
- It does not back-fill `source` on the ~1,070 leads already in the two campaigns (that is a write to SmartLead per lead; needs the founder's word).
- It does not change DNS, pause a campaign, or touch sending. Risk: LOW. No migration, no env, no paid call.

## Also measured on 18/09 (no code)
136 of the 200 people e-mailed on 17/09 had already received an e-mail from the archived wave-1 campaigns between 02 and 10/09: the same address sat as `STARTED` (never e-mailed) in one old campaign and had been e-mailed in another. The founder authorised re-using old leads minus bounce and STOP on 17/09, and the block list covers bounce, reply and unsubscribe, so this is inside the instruction; it is recorded because the house default for non-responders is a two-month rest.
