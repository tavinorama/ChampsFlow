# Visibility integrity — isolated implementation, 14 September 2026

## TL;DR

Local branch `fix/visibility-integrity-20260914`, based on `ac423498ea1380b51a5b5fbb3a113a9d5e5c0147`. Implements bounded corrections for C01, C07 and C10. No credentials, production data, paid calls, push, PR, merge or deploy. This is implementation evidence, NOT reviewer approval, complete Visibility remediation or production readiness. Proposed risk HIGH because it changes paid-audit failure behavior and scoring semantics; founder-controlled release after independent review and CI.

## Changes

- C01: evaluated probe aggregates use a v2 hashed identity (tenant, brand ID and name, requested/stored/effective market, web-search mode), query, engine and methodology. Envelope identity is checked too. Unscoped v1 is not read. Preserve `absent` across cache round trips. Worker read/write callers both supply the same identity. `GEO_WEB_SEARCH` is the actual flag used by `webSearchEnabled()` in providers/types.ts.
- C07: only VERIFIED citing kinds count in two-pass extraction. Unresolved brand candidates expose `brand_verification_pending`. Paid scoring refuses those results before score persistence, records a failed audit and discards automatic retries. Shared terminal-error classification recognizes this refusal for alerts. Methodology identities bump to extraction 1.1 / GEO 2.2 so the new protocol is not silently called 2.1.
- C10: only a valid vendor result with no AIO block is `absent`. Empty AIO shells, malformed result envelopes and vendor failure within HTTP 200 fail collection instead of scoring a negative observation. Free test never reparses absent sentinels for either the brand, competitor or sentiment. Any failed probe rejects the free-test result through the existing API 502 path instead of presenting an incomplete score.

## Tests actually executed

Installed lockfile dependencies using `npm ci --ignore-scripts --no-audit --no-fund` from registry.npmjs.org after offline install reported ENOTCACHED. No installation scripts ran.

Baseline experiment temporarily restored the four original llm modules from the audited HEAD, ran the two NEW regression suites, and restored the modified modules in a finally block. Baseline: **2 suites failed; 9 failed / 2 passed tests**. Actual failures included sentinel brand count 1 instead of 0, empty shell and vendor failure resolving instead of rejecting, partial free-test collection returning an "invisible" score, and UNVERIFIED counting as citation. One baseline failure is an intentionally new guard function missing, not an independent old production incident; the cache test first failed on lost absence metadata, so this baseline count alone is not proof of each cache dimension.

After corrections: **7 suites, 80 tests passed**, including all five identity-dimension cache misses and transplanted-envelope rejection. Existing two-pass test runs an actual injected verifier failure, checks pending=true, and invokes the scoring guard to assert refusal; existing fallback test explicitly pins retained legacy behavior. `npm run build --workspace=packages/llm`, `npm run lint --workspace=apps/worker` and `git diff --check` pass.

Command: `npm test -- tests/unit/llm/visibility-integrity-regression.test.ts tests/unit/llm/free-test-integrity-regression.test.ts tests/unit/llm/probe-cache.test.ts tests/unit/llm/two-pass-extraction.test.ts tests/unit/llm/serp-absent.test.ts tests/unit/llm/invisibility-test.test.ts tests/unit/llm/sampling.test.ts`.

These are offline mocked/pure tests and typechecks. They do NOT prove a complete worker run with real Postgres/BullMQ, API HTTP behavior end-to-end, SQL PREPARE against deployed schema, UI E2E, live vendor parsing, billing/refunds or notification delivery. The new SQL references existing audit columns but still requires schema verification before release.

## Deliberate residuals / release blockers

1. C08 remains: verification is on the stored last response, not every repetition. Do not call the full multi-run citation protocol corrected. Existing explicit fallback/disabled extraction retains legacy semantics and degraded labeling; C07 is bounded to unresolved TWO_PASS candidates, not full removal of all unverified data from every historical/UI path.
2. Failed free tests report usage to the existing callback, but products.ts returns 502 before its spend-ledger write. Paid refusal also precedes its success-path ledger. Failure spend accounting, credit idempotency/refunds and terminal customer messaging must be tested in a separate reviewed capability before scaling these failures. No billing code altered here.
3. Cache identity does not yet version every configurable model, base-run count, provider locale or future surface option. Those changes require method/key versioning. Regional support itself is unchanged: BR/locales need the dedicated market workstream; cache separation is not BR engine coverage.
4. Genuine no-AIO still counts as no citation in the existing audit/free-test estimand; a conditional-on-AIO-exists rate and explicit surface availability UI remain separate product work. No new nullable score UI added.
5. Terminal classification tested as a pure helper. `job.discard`, failed SQL update, production retry/alert and cost effects need an isolated full-job integration test before deployment. Historical erroneous results are not rewritten here.

## Review and rollback

Independent backend/QA review required; author does not self-approve. Revalidate HEAD and deployed schema, run six required CI checks and a staging canary without customer/paid actions before requesting release authorization. Record failed-test/paid-run costs and validate the intended customer error path first.

Rollback must NOT simply restore unscoped cache, UNVERIFIED-as-cited or sentinel parsing. Hold affected features/consumers fail-closed or retain these integrity fixes while reverting unrelated release code. Old cache keys may expire naturally; no destructive cache purge or history deletion is part of this work. Methodology 2.1 and 2.2 must not be described as directly comparable without a controlled reconciliation.

## Reconciliação 14/09 (R2 — `prep/reconcile-2026-09-14`)

Base = candidato Codex `7b082cc` (identidade completa de cache com `absent`, gate `brand_verification_pending` + auditoria paga recusada, `citation_verification_pending` não retryável, `serp.ts` com `collection_failed`, versões 1.1/2.2). Sobreposto da preparação Claude `ff31245` e das decisões de `REVISAO-CLAUDE-PACOTE-2026-09-14.md` (F-A/F-B assumidas como recomendadas; o fundador pode reverter):

- **F-A — free test parcial rotulado, não 502.** Um motor cuja coleta falhou entra em `notMeasured[]` (novo campo do resultado e rótulo na UI de `/test`), fora de qualquer denominador; só um run em que NENHUM motor respondeu lança `collection_failed`. A classificação do Codex (shell vazio / task ≠ 20000 / payload malformado = falha de coleta, nunca ausência) fica intacta.
- **C10 — agregação pura `aggregateEngineCells`**: célula `absent` sai do denominador (`surfaceAbsentCells` / `eligibleCells` por motor), sentinel nunca é re-parseado (regex defensiva), o veredito do adaptador vence o parse de texto.
- **C07 — terceiro contador**: `unverified_count` em `ExtractionResult` → telemetria da auditoria → allowlist do sanitizer → painel (`VerifiedCitations` com "could not be checked"). Reportado, nunca contado. O gate do Codex para o caminho pago (F-B interino) continua: verificação pendente = sem score publicado.
- **A04 mínimo — ponte de comparabilidade por metodologia**: `markComparableTrend` recebe `methodology` (de `geo_audit.methodology_version`) e exclui da linha de tendência, com motivo, qualquer run com protocolo diferente do run que fixa o painel; ligado aos três endpoints (`/score` trend, histórico e `since-last-audit`). Sem isto, a subida para 2.2 misturaria 2.1 e 2.2 em silêncio.

Continua aberto (bloqueia ativação, não a preparação): A06 (ledger de gasto em falha em `products.ts:334–343` e teto de coverage-retry por origem), C08, retry só do verificador antes de falhar a auditoria paga, comentários legados em `audit-run.ts`. Suíte completa verde (3.508/253); `tsc` limpo em llm/shared/api/worker/web. HELD: sem push/PR/merge/deploy/env.
