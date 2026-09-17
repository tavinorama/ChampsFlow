# T0.3 — a mute watchdog still watches (2026-09-16)

Local branch `prep/t0-3-monitors-without-telegram`, base `7a64900`. Risk **LOW** (four GitHub Actions workflows; no app code, no env, no migration). HELD until F2/F3.

## What was measured

`gh run list --branch main` from 11/09 to 16/09: `Post-deploy smoke (main)`, `Agent-org liveness (30 min)`, `Main CI after auto-merge (15 min)` and `Link Health` red on **every** run. Reading the runs (Codex N3, confirmed 15/09): the failure is always the first step, *"TELEGRAM_BOT_TOKEN missing — o vigia estaria mudo; exit 1"*, and the probe step is `skipped`. Consequences:

- the post-deploy smoke never compared the deployed SHA with the merged one (the #618, #620 and #621 deploys were verified by hand);
- the liveness probe never measured the API;
- the main-after-merge reconciliation ran (`if: always()`) but painted every run red, so a real reconciliation failure would look identical to the daily noise;
- the link crawl never crawled.

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` exist on Railway (api and worker) and are absent from the Actions secrets (`gh secret list`: HERMES_BLOG_TOKEN, HERMES_TASK_TOKEN, SMARTLEAD_API_KEY). Copying them is the founder's 2-minute action and remains item 6 of the list; this change makes the watchdogs useful **without** it.

## What changes

In all four workflows the first step becomes *"Check the alarm channel (TELEGRAM secrets) — warn, never skip the probe"* (`id: alarm`):

- a missing secret emits `::warning::` naming it, appends an `ALARM CHANNEL NOT WIRED` line to the job summary, and sets `wired=0` in the step output — **the step never exits non-zero**;
- the probe / reconcile / crawl step runs regardless (none is gated on `steps.alarm`);
- the existing "send Telegram on failure" steps are untouched: with the channel they alert, without it they already wrote "alarm only in the job summary";
- a **real** failure still turns the run red (`exit 1` survives in the probe-failure steps of smoke, liveness and main-after-merge).

Header comments in `post-deploy-smoke.yml` and `main-after-merge.yml` updated to the new policy.

## Tests

`tests/unit/monitors-without-telegram.test.ts` reads the four files: no `exit 1` / "estaria mudo" inside the alarm step, warnings + summary + `wired` output present, probe not gated on the alarm, Telegram-on-failure still present, `exit 1` still present outside the alarm step for the three workflows that fail on a bad probe. YAML parsed with `yaml.safe_load` for all four.

## Rollback

Revert the branch: the workflows go back to failing on the first step.

## Proof owed after merge

The next scheduled runs of the four workflows: `Verify deployed version + vitals`, `Probe the liveness route` and the crawl step **executed** (green or red on their own merit), with the `⚠️ ALARM CHANNEL NOT WIRED` line in the summary until the founder adds the two secrets — after which the line disappears and a synthetic failure reaches Telegram.

## Addendum 2026-09-17 — two more watchers had the same gate

Read on 17/09 from the failed runs: `smartlead-send-watch.yml` (red twice a day, "TG:" empty, exit 1 in the preflight — it never measured whether sending had stopped) and `cron-absence-watch.yml` (same assert as the original four). Both now use the same warn step. The SmartLead watch keeps `SMARTLEAD_API_KEY` as a hard requirement (without it there is nothing to measure — that red is true), and when sending is stopped but the channel is missing it prints the alarm into the job summary, records `telegram: "sem_canal (…)"` in its result line, and still exits 1. `blog-autopublish.yml` was checked and already degrades to the job summary.

Six workflows covered; the test asserts all six. The two-minute fix remains the founder's: copy `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` into the repository's Actions secrets.
