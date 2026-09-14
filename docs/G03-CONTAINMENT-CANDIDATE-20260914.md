# G03/G04 — isolated containment candidate, 2026-09-14

## TL;DR

Local candidate only, base `ac423498ea1380b51a5b5fbb3a113a9d5e5c0147`, risk **HIGH**, activation **HELD**. No push, PR, merge, deployment, production SQL, cron change or paid call. Contains known graph-derived social metrics and legacy learning; it does **not** repair metrics, migrate history or certify the company incident closed. Unknown/malformed input is not zero. Re-enabling needs a reviewed lineage/window contract, not an environment switch. Existing raw collectors, ops/product/incident snapshots, static editorial guidance and unrelated business operations are not replaced. New focused tests and five selected suites pass after explicit contract updates; broader regression/operational gates remain. Worker cannot self-approve.

## Implemented boundaries

- Shared quarantine for current social metric namespaces and `ab_*`, guarding `readHarvest` and `recordOutcome` before any SQL baseline/read/write.
- `outcomes`, `memory`, `tuning`, `cadence` snapshots return `business_state=invalid_g03` before touching their mixed/derived history. This intentionally hides even potentially valid rows while their provenance is unknown. It does not label collector-only SUM as correct.
- Runner contains affected waiting harvests, single social verdicts and every A/B verdict. No numerical performance claim or derived outcome write. The old A/B verdict calculation/persistence/notification branch is removed; approved content publication remains in its separate nodes. The pure comparison helper is not a release gate or validated attribution model.
- Affected completed evidence artifacts from old runs stop the run before waiting-maintenance effects. Existing artifacts remain unchanged for investigation.
- Marketing runs with existing steps and no code-owned `__g03_evidence_v1__` marker stop before approving/publishing/reporting old drafts; a new run receives the marker before creating content. Expired/missing marker is fail-closed, never an implicit trust reset.
- Legacy marketing memory, prompt overrides and recent published-text injection are suppressed: all can contain unsupported historical performance claims and lack a reconciled provenance contract. Static content lessons, anti-generic rules and editorial calendar remain. This temporarily reduces repetition-avoidance context; restoration needs clean provenance, not bypass.
- Memory/override activation graphs stop, including already-approved old proposals. Worker ports also refuse legacy learning writes. Incident lessons retain their distinct prefix path; no destructive cleanup.
- Single-verdict G04 parser rejects absent/malformed JSON, arrays, missing fields, numeric strings, non-finite values, negative values, fractional sample counts and inconsistent no-data payloads. A well-formed non-social measurement with `n > 0, total = 0` remains a legitimate zero.

## Validation performed

All fixtures local. New suite blocks `fetch`; worker DB ports use fakes and assert zero SQL calls for quarantined paths. No production credentials needed.

```sh
./node_modules/.bin/vitest run tests/unit/graph-metric-containment.test.ts
./node_modules/.bin/vitest run tests/unit/graph-runner.test.ts tests/unit/graph-self-healing.test.ts tests/unit/graph-tick-starvation.test.ts tests/unit/graph-tick-tenant-cost.test.ts tests/unit/graph-metric-containment.test.ts
./node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json
./node_modules/.bin/tsc --noEmit -p apps/worker/tsconfig.json
git diff --check
```

- Focused candidate suite: **26/26 passed**.
- First selected candidate regression run: **95 total, 80 passed, 15 failed**. After explicit containment assertions and the unaffected store fixture described below: **95/95 passed**. This is **NOT full CI**.
- `graph-tick-starvation`: 13/13; `graph-tick-tenant-cost`: 3/3.
- Legacy `graph-runner` initially 22/36: 14 failures asserted old social outcome writes, mute-source wording or snapshot-port calls now suppressed. Scope: daily-video (3), daily-dream (1), weekly-discovery (1), X (2), LinkedIn (2), blog (1), TikTok/YouTube (2), PPC (1), content-experiment (1). Updated tests now explicitly require `invalid_g03`, no derived write, no claimed collector outage and guarded snapshot artifacts, while preserving approval, publication, static content and unrelated operational assertions: **36/36**.
- Legacy `graph-self-healing` initially 16/17: memory-store fixture expected to reach an activation gate now contained. The non-idempotent-store retry contract now uses an unaffected CRM-store with a persisted ambiguous failure, proving no retry and preserved failure. Learning activation prohibition is tested separately in the new suite: **17/17**.
- Before/after baseline used a detached worktree at the same SHA and the identical new test file: **23 failures / 3 passes before, 26/26 after**. A baseline passing invalid prompt-override fixture was already failing closed for other reasons; it is not counted as a newly reproduced defect.
- API and worker TypeScript checks passed (no emit); `git diff --check` passed.

### Adjacent regression gate — still RED

Seven additional unchanged suites were executed: **110 tests, 78 passed / 32 failed**. Combined with the five updated suites, the executed selection has **205 tests, 173 passed / 32 failed**; not a full-suite result and not merge-ready.

| Suite | Passed | Failed | Contract still awaiting independent reconciliation |
|---|---:|---:|---|
| ab-experiment | 9 | 4 | Numeric winner, shifted-window winner, no-data alarm and tie expectations versus suspended evaluation |
| anti-generic-recent | 8 | 1 | Injection of legacy recent marketing text versus quarantine |
| cadence-recommendation | 8 | 2 | SQL/aggregation and honest-empty expectations versus explicit unavailable evidence |
| incident-to-memory | 19 | 1 | Test expects monthly marketing memory still loaded while excluding incident rows; incident store/extraction paths passed |
| memory-consolidation | 11 | 10 | Snapshot aggregation/empty, five activation-flow cases, dynamic memory injection and two durable-store cases |
| prompt-tuning | 18 | 13 | Seven activation-flow cases, dynamic override injection, three snapshot cases and two durable-store cases |
| weekly-report-graph | 5 | 1 | Expects all three snapshot ports read; only ops remains eligible |

These are observed contract conflicts with contained behavior, not permission to silently disable tests or claim no other regression exists. Exact test names and assertion traces are in the generated local report `/private/tmp/ozvor-separate-20260914.HSMEF2/metrics-broader-tests.json`, to be preserved with the handoff. The much broader change to these seven files was intentionally left outside this minimal implementation pass; activation stays HELD until reviewer-approved test/contract alignment and required CI. No source guards were relaxed to make the old behavior green.

## Mandatory release work — not completed here

1. Independent review of behavior and the 15 legacy-contract test changes, without disabling assertions or restoring invalid inputs. Complete relevant memory/tuning/cadence/report/anti-generic/AB suites and required CI (not only these five files).
2. Inventory every other reader/writer of the ledger (operator/admin APIs, cron scripts outside repository, VPS collector, n8n, Postiz, Telegram digest and previously generated documents). This candidate guards the identified graph entry points, **not all company-wide consumers**. A report claiming global containment would be false.
3. Founder approval of impact: old marketing runs fail closed, including pending approvals; learning schedules may create newly failed runs until the operator handles cadence. No automatic schedule edits or bulk state mutation are included.
4. Verify negative behavior against a throwaway DB/Redis and deployment-equivalent version; test actual scheduler restart, marker expiry, mixed API/worker versions and incident-lesson preservation. Mock SQL tests do not prove production schema or process topology.
5. Coordinate API+worker rollout and in-flight execution: a currently executing old process can still emit results until drained. No static code patch establishes a cluster-wide atomic barrier. Include a founder-approved containment/maintenance procedure and read-only checks.
6. Monitoring must surface `invalid_g03` as **business unavailable**, even where the mechanics mark a harvest/verdict step succeeded. Existing green run counts are not valid delivery success. No UI/health migration is in this slice.

## Historical reconciliation and re-enable gate

Keep history append-only. Find first affected record by lineage, not an arbitrary 08–11 September window. Classify unknown/rolling-only/recursive/both/not-affected with evidence; do not infer chronology from independent minimum-date/minimum-value aggregates. Reconcile tenant/account/entity IDs, source kind, eligible input IDs, native receipts, timezone, window start/end, metric definition/version, dedup and completeness. A rolling-window delta is net window change, not newly earned impressions. Do not compare ratios across different populations.

Before any learning/ranker/tuner activation: clean source contract and versioned eligibility, negative recursive-input fixtures, repeated collection→evaluation→collection test, native analytics reconciliation, isolated tenant tests, monitored canary and explicit reviewed approval. G03 containment does not fix G02 attribution/statistical confidence or G05 publish receipts. Do not use the invalid historical metrics in sales proof.

## Rollback

No rollback to the unguarded base. If this candidate malfunctions, keep the affected evaluation/learning paths unavailable while preserving collection and records; ship a containment-preserving fix through the same review gate. Removing a guard/marker, loading old overrides, restoring prior SUM semantics, or replaying held drafts is **not** an acceptable rollback. A code-owned marker is an operational quarantine boundary, not a security signature or a proof of valid measurement.

## Reconciliação 14/09 (R1 — `prep/reconcile-2026-09-14`)

Base deste documento = candidato Codex `1e63a64`. O que a reconciliação com a preparação Claude `ff31245` mudou, por decisão registada em `REVISAO-CLAUDE-PACOTE-2026-09-14.md` §2.5–§2.6 (decisões F-C/F-D assumidas como recomendadas; o fundador pode reverter):

- **Allowlist, não denylist.** `isQuarantinedGraphMetric` passa a quarentenar tudo o que não esteja em `ALLOWED_GRAPH_METRIC_PREFIXES` (hoje só `sales_reply_rate_`). Um nome de métrica novo é desconhecido, logo quarentenado. A regex das famílias contaminadas fica como documentação.
- **Run de marketing legado não é morto (F-C).** Recebe o marcador `partial_g03`, um step `__g03_review__` e UM aviso no Telegram ("reveja o texto antes de aprovar"); a porta humana decide. A guarda de artefacto legado só halta runs sem porta humana (report-only, brains).
- **Grafos de aprendizado terminam `skipped` + run `succeeded` (F-D)**, não `failed`: sem LLM, sem store, sem Telegram e sem run falhado para o detetor de incidentes agrupar a cada cron. Pausar os schedules continua a ser decisão do fundador.
- **Snapshots `memory` e `cadence` parciais.** Os factos de publicação e as rejeições (contagens de steps) sobrevivem; as secções derivadas de `ops.agent_outcome` são substituídas pelo marcador `partial_g03`. `outcomes` e `tuning` continuam totalmente suspensos. O runner marca o artefacto parcial ele próprio, para a guarda só disparar em evidência anterior à contenção.
- **Linhagem no `readHarvest`** (métricas permitidas): cada linha lida volta com `sourceKind raw|derived` pela origem (`social-harvest`/`harvest:*` = raw). O `total` continua a ser a soma legada, só para o summary.
- **`assessRawObservations` dormente** (gauge, dedup por dia, derivado invalida): semântica proposta, sem chamador em runtime; reabrir = PR revisado com a semântica confirmada junto ao coletor, nunca flag de ambiente.
- **`scripts/sql/reconcile-g03.sql`** (READ ONLY): classifica cada derivado histórico em `not_affected | rolling_only | recursive | both | unknown` por janela do run, sem inferir cronologia de agregados.
- **A/B**: o ramo numérico do veredito ficou removido (Codex); `computeAbVerdict` puro continua; reabertura restaura o ramo a partir de `ac42349` sobre linhagem.

Testes: suíte completa verde (3.478/249 ficheiros) com os 34 contratos adjacentes reescritos para o comportamento contido — nenhum teste apagado, nenhuma guarda relaxada. Continua HELD: sem push, PR, merge, deploy, env, cron ou SQL de produção.
