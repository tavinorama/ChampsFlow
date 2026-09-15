# T0.2 — anthropic "empty" in the drift battery is an HTTP 400 we throw away (2026-09-15)

Read-only investigation. No env, code, cron or production change. Authorized as T0.2 by the founder on 15/09.

## What the battery has been saying since 10/09

`engine_drift_check.anthropic`: `failing`, `positive_rate 0`, `empty_runs 7 / error_runs 0`, reason *"no usable answers: 0 of 7 control runs errored and 7 came back empty — this engine measured nothing today"* — every day from 10/09 03:30Z through 15/09 03:30Z. Consequence: the drift guard pauses anthropic for every audit; every scheduled audit since then runs on 4 of 5 engines, is not comparable, and schedules a coverage repeat (which, until #620, died on the DELETE).

## What actually happens (worker logs, deployment `fe9f9d7d…` = `5d48727`, then `28f3268e…` = `db65caa`)

| Day 03:30Z | anthropic in the log | `api_spend` anthropic drift row |
| --- | --- | --- |
| 09/09 | no `[gateway] probe failed` lines for anthropic | `measured`, 52 997 in / 1 305 out tokens, model `claude-haiku-4-5` |
| 10/09 | `[gateway] probe failed provider=anthropic kind=permanent msg=anthropic HTTP 400` ×3 → `[gateway] circuit OPEN for provider=anthropic; consecutiveFailures=3` → 4× `circuit open` | `rate`, 0 tokens, model NULL |
| 11/09 … 15/09 | identical to 10/09 | identical |

- Same code on 09/09 and 10/09 (deployment `fe9f9d7d…` ran from 07/09 16:56Z to 11/09 06:26Z). No deployment of any kind between those two runs, so no Railway variable change on the worker either (a variable change redeploys).
- The 400 is **permanent** in the gateway's taxonomy: no retry, three strikes open the circuit, the other four controls never leave the process.
- The adapter throws `anthropic HTTP 400` **without the response body** (`packages/llm/src/providers/anthropic.ts`: `throw new ProviderError("anthropic", kind, res.status, \`anthropic HTTP ${res.status}\`)`). The body is where Anthropic says *why* (`{"error":{"type":"invalid_request_error","message":"…"}}`). We have been blind to the reason for six days.
- The gateway swallows the failure into `failedProviders` and returns no response; the drift caller (`apps/worker/src/jobs/drift-control.ts` `makeGatewayCaller`) returns `rawText ?? null`, so the battery counts the run as **empty**, not as an **error**. That is why `error_runs: 0` while the engine is rejecting us.
- Nobody was told. `drift_engines_failing` is `logger.error` only; there is no `alertOps` anywhere in the drift path. An engine has been paused for six days and the founder learned it from the Codex audit and from this investigation.

## Why the 400 (candidates, ordered by fit) — the body decides

Anthropic returns `400 invalid_request_error` for, among others (platform.claude.com/docs/en/api/errors):

1. **Organization or workspace spend limit reached** — "The API also returns a 400 when usage reaches an organization or workspace spend limit you set." Fits a mid-month cutoff with unchanged code. Spend on this key is small (see the number in the report), so a small self-set limit would trip exactly like this.
2. **Web search disabled for the organization** in the Claude Console privacy settings — "a request that includes the tool fails with a 400 invalid_request_error that says web search is not enabled". Our probe sends `tools:[{type:"web_search_20250305"}]` by default (`GEO_WEB_SEARCH` not set). If an admin toggled it on 09/09, every probe dies while a plain chat call would still work.
3. **Model id**: the probe uses `claude-haiku-4-5` (undated alias, via `ANTHROPIC_MODEL`); the deprecations table lists the API name as `claude-haiku-4-5-20251001` (Active, retirement not sooner than 2026-10-15). The alias worked on 09/09; if Anthropic dropped the undated alias, the body will say "model: … not found".
4. Credit balance / billing — usually 402 `billing_error`, but prepaid-credit exhaustion has historically surfaced as a 400 with "credit balance is too low".

Not candidates: key revoked/expired (would be 401), permission (403), rate limit or tier spend cap (429). Nothing in the repo changed between the two runs.

## What the founder can check in two minutes (no secrets to me)

- Claude Console → **Plans & billing**: credit balance, and **Limits → spend limits** on the organization and on the workspace that owns this key.
- Claude Console → **Settings → Privacy**: web search enabled or not.
- **Usage → Export**: the last successful day for the key should be 09/09.
- Or read the body directly (run with your own key; do not paste the key or the body's request_id here, the message alone is enough):

```bash
curl -sS https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5","max_tokens":64,"messages":[{"role":"user","content":"Say OK."}],"tools":[{"type":"web_search_20250305","name":"web_search","max_uses":1}]}'
```

Then the same call **without** `tools`, and once more with `"model":"claude-haiku-4-5-20251001"`. Whichever variant stops returning 400 names the cause. Each call costs a fraction of a cent.

## What changed in code (F1 authorized 15/09 — local branch `prep/t0-2-drift-http400`, base `0f58aef`, no push)

- `packages/llm/src/providers/types.ts`: `providerHttpError(provider, res)` reads the error body once (`error.type` + `error.message`, raw text fallback), redacts anything key-shaped (`redactProviderSecrets`: sk-ant-/sk-/AIza/pplx- keys, bearer tokens, `req_…` ids), collapses whitespace, caps at 200 chars. Classification unchanged (429/5xx retryable, other 4xx permanent).
- `anthropic.ts`, `openai.ts`, `gemini.ts`, `perplexity.ts`: every non-2xx goes through it — no adapter throws a bare `HTTP <status>` any more. `gateway.ts` logs 240 chars of the message instead of 100.
- `packages/llm/src/drift-control.ts`: each control result carries `lastError`; the verdict carries `cause` (`provider_errors` | `no_answers` | `behaviour`). With zero usable runs and ≥1 error the reason now reads *"N of M control runs were rejected or failed at the provider (<reason>) — a request, configuration or billing problem on our side, not engine behaviour"*. Status stays `failing` (the pause is a product decision left as is); the wording stops calling it drift.
- `apps/worker/src/jobs/drift-control.ts`: the gateway caller **throws** the provider's reason when the gateway reports the engine failed (was: returned null → counted as empty); `formatDriftFailingAlert` / `formatDriftOutageAlert` go to Telegram through `alertOps` — one message per daily battery for failing engines (cause first, reason quoted, paused or not) and one for an all-engine outage. Detail jsonb gains `cause` and per-control `last_error`.
- Tests: `tests/unit/llm/provider-http-error.test.ts` (reason kept, redaction, classification, adapter end to end with fetch stubbed, no bare throws left) and `tests/unit/drift-rejected-vs-empty.test.ts` (rejected ≠ empty ≠ behaviour, worker wiring, alert text). With the base sources the two files fail; on the branch the full suite is 3.537 green / 255 files.
- Not changed: env (`ANTHROPIC_MODEL`), the pause policy, `GEO_WEB_SEARCH`. The dated model id stays a founder decision once the 400 body is known.

### What the original proposal said (kept for the record)

1. **Adapter keeps the reason.** On `!res.ok`, read the JSON body and put `error.type` + the first 200 chars of `error.message` into the `ProviderError` message (no key, no request_id). Same for the other adapters that throw bare `HTTP <status>`.
2. **Battery distinguishes "rejected" from "empty".** A permanent 4xx from a provider is *our* problem (request, config, billing), not engine behaviour: the drift caller should throw so the run counts as `errorRuns`, and `evaluateDrift` should render `"7 of 7 runs rejected by the provider (HTTP 400: <type>) — configuration or billing, not drift"`. Whether that still pauses the engine is a product decision; the wording must stop saying "measured nothing".
3. **Alert once per day.** `drift_engines_failing` and any `circuit OPEN` go through `alertOps` with the reason text, so a paused engine is never silent for six days again.
4. **Pin the dated model id** (`claude-haiku-4-5-20251001`) once the body confirms or rules out candidate 3 — an env value, so the founder's call.

## Proof owed

One drift run at 03:30Z with anthropic `healthy` again (7 usable runs, measured tokens in `api_spend`), followed by one scheduled audit on 5 of 5 engines.
