# SmartLead campaigns v4 — two campaigns, A/B, personal by trade and city (2026-09-17)

Branch `prep/smartlead-campaigns-v4`. Risk **MEDIUM**: a new workflow that can write to SmartLead, behind a dry-run default. No app code, no migration, no env. The copy was approved by the founder on 17/09.

## Why

Wave 1 sent 3,014 e-mails and got 0.1% real interest. On 17/09 the founder rejected the cold copy three times ("weak", "no punch", "generic and salesy") and asked for text that speaks to the owner's pain and urgency, with A/B variants, in only two active campaigns: **AI Geo Search** and **AI Audit Stack**. v4 is what was approved: it talks to a roofer in Oklahoma City, opens with the question that roofer's own customer asks ("My roof is leaking. Who is a good roofer in Oklahoma City?"), names the pain he already feels (the quiet phone, the hours on quotes), and carries urgency with a fact he lived through (the Yellow Pages). It does not threaten: nothing in it is a claim we cannot back.

## What is added

1. `docs/departments/sales/campaigns-v4.json` — the copy as data: two campaigns × four touches (days 0/3/7/14), variants A and B on touches 1 and 2, the literal opt-out footer, the rules, the source of the one statistic used, and the table of 27 trades (`trade`, `a_trade`, `buyer_question`, `job`, `pain_task`, `lost_hour`). Human mirror: `cold-copy-v4.md`.
2. `scripts/smartlead/campaigns_v4.py` (stdlib only) — `validate` (house rules on the MERGED text, for every trade, with worst-case long names), `render`, `personalize` (pure), `create`, `load`.
3. `.github/workflows/smartlead-campaigns-v4.yml` — thin: checkout, validate, run. `confirm=no` is the default and is a rehearsal.

## Guards (in code, tested)

- Copy that breaks a rule stops everything: link/domain in e-mail 1, more or fewer than one question, outside 40–80 words, a sentence over 12 words, an em dash, an unknown merge field, an ozvor.com link without `?from=`.
- **A lead that cannot be personalized is not loaded**: no recognizable trade, no city, no usable first name, STOP/unsubscribed, bad category, non-US, national franchise, no own site, duplicate domain, dead site. Each refusal is counted by reason; an empty merge field never reaches e-mail 1.
- Only leads in status `STARTED` (imported, never e-mailed — measured 11/09) leave the source campaigns.
- A destination campaign that is not DRAFTED/PAUSED aborts the load: adding a lead to an active campaign is sending e-mail.
- There is no start action. A campaign found active is paused and named. Starting stays with `smartlead-launch.yml` (`confirm=GO`).
- `create` reads the sequences BACK and compares the variant counts: if SmartLead did not keep A/B, the job says so and fails ("saved" is not "there").
- Output is aggregates only. No e-mail address, person name or phone is printed; the rehearsal sample uses `<first_name>`.
- The lead is re-added with `first_name`/`last_name` carried from the source record (in memory only), so `Hi {{first_name}},` cannot come out empty in the new campaign.

## Not verified (said before, not after)

The exact SmartLead payload for sequence variants (`seq_variants`, `variant_distribution_type`) follows their public API description and was **not** exercised live: no campaign was created from this branch. The read-back check exists for exactly that reason. First real run: `action=create`, `confirm=yes`, then read `variantes_lidas_de_volta` in the job summary.

## Measured today (context for the founder's "30k contacts")

200 Outlook mailboxes, all still in warm-up, 5 e-mails per mailbox per day: a ceiling of 1,000 e-mails/day. 1,573 leads never e-mailed (Ozvor 1: 1,400, OZ-A Agencies: 163, OZ-C SaaS: 24). The 11/09 selection found about 244 of those with a recognizable trade and a live site; `action=load` in rehearsal mode gives today's exact number, by trade and by refusal reason.

## Tests

`tests/unit/smartlead-campaigns-v4.test.ts` (12): validate passes on the committed copy; two campaigns, four touches, A/B on 1–2; tampered copy (link, second question, dash, unknown field) is refused and nothing else runs; articles; personalization routes HVAC to geo and an agency to stack with the right buyer question; seven refusal reasons; payload has two equal variants on touches 1–2, signature + opt-out at the end, `?from=<campaign>` resolved; workflow default is rehearsal; no start action; offline rehearsal prints the plan.

## Rollback

Revert the PR. Campaigns already created in SmartLead stay DRAFTED and can be deleted in the UI.

## Order of use

1. Import `SUPRESSAO-nao-enviar.csv` (62 addresses) into SmartLead's global block list.
2. `action=create`, `confirm=no` → read the plan. Then `confirm=yes` → check `ab: ok`.
3. `action=load`, `confirm=no` → read how many leads qualify, by trade and by reason. Then `confirm=yes`.
4. Attach mailboxes, send the whole sequence to your own inbox, then `smartlead-launch.yml`.
