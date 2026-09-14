# Visibility — proposed operational delivery contract

## TL;DR

Version 0.1, 2026-09-14; B01/L3, proposed, not shipped. Visibility answers where a brand appears in a declared AI-search sample, what can be acted on, what was actually implemented and what later changed. It does not guarantee citations, rankings, leads or a rising score. Diagnostic, software monitoring and managed execution are distinct scopes, subject to actual availability. A fixed comparable panel anchors trend reporting; exploratory samples are separately labelled. Missing evidence is unknown, not absence. A detected gap or later citation never proves OZVOR executed a fix. Every managed action requires a stable identity, approved artifact version, correct target, native receipt where applicable and verification. The customer receives a decision-ready next step even when collection or attribution is inconclusive. [Common contract](README.md) governs capacity, authority, commercial handoff, data, failure, renewal and exit. This document defines requirements and test scenarios; implementation and operational proof are pending.

## 1. Primary user, scope and inputs

Primary user: a business owner needing understandable discovery evidence and an actionable, bounded improvement program. Sales first establishes the buyer question and market; it does not turn a free sample into a universal visibility score.

Required input record: tenant/brand ID, canonical name/domain and approved aliases, market/country/city where relevant, language, buyer intents, agreed competitors, owned assets, business objective and approved data/source access. Record unavailable engines/surfaces before accepting a coverage promise. A model API, web-search-enabled API, Google AI Overview and consumer application are different surfaces and cannot be presented interchangeably.

| Mode | Included only when scoped and available | Completion / explicit exclusions |
|---|---|---|
| Diagnostic one-time | Declared sample, evidence-backed findings, limitations, prioritized actions and agreed artifacts/checklist | Accepted diagnostic package and next decision; no ongoing monitoring or publication implied |
| Software recurring | Entitled measurements, history, alerts and actionable plan at the contracted cadence | Usable evidence and truthful status each cycle; customer owns execution unless separately purchased |
| Managed execution | Agreed priorities, artifact preparation, version approval, execution within authority, verification and value review | Accepted work and explicit outcome reading; only listed assets/channels are covered, not unlimited content/SEO/PPC |

Free test remains a bounded discovery aid. No missing engine is presented as measured zero; partial sampling cannot support a full-coverage headline. Additional implementation can be delivered by the customer, another provider or separately scoped OrganicPosts work.

## 2. Measurement and customer explanation

- Persist an immutable measurement identity: tenant/brand, query set/version, intent, market/language/location, engine/model/surface, methodology/scoring version, repetition plan, timestamps, coverage and eligible denominator. Cache must preserve that identity; another brand's response is not reusable brand evidence.
- Classify observations separately: valid mention, verified citation, valid absence, collection failure and verification pending/unknown. A response listing a source consulted is not automatically a citation to the customer's asset. Do not collapse all repeat observations to the last response or silently count missing repeats as valid.
- Compare a fixed eligible panel under equivalent settings and denominator rules; report uncertainty/coverage and the exact comparison pair. Surface/model/query/methodology changes can invalidate a headline delta. Keep exploratory prompts and new markets separate; start a labelled new baseline when required.
- Distinguish diagnostic readiness, observed discovery and execution status. Customer report: “what was sampled; what we observed; what changed under a valid comparison; what we executed; what cannot yet be concluded; what we decide next.” An unchanged or lower score can be real variation, a panel change, a collection defect or an actual change; investigate evidence before attributing it.
- No causal claim solely from before/after movement. Record intervention timing, confounders, comparison limitations and uncertainty; “observed after” is not “caused by.” More runs incur cost and require an approved budget, not infinite retry until a higher score appears.

## 3. Do Next and execution proof

An action record needs stable action ID, tenant, target asset/query cluster, source finding/run IDs, rationale, priority and confidence, estimated effort/cost, dependency, owner, contract version and a next review decision. A repeat audit updates evidence or opens a new version; it must not erase approval/artifact history or drop newly important gaps because an old cap is full.

Proposed action states: `proposed → accepted → prepared → approved → executed → verification_pending → execution_verified`, with `rejected`, `blocked`, `failed` and `removed_later`. These are required business distinctions, not implemented schema claims. Publication, indexation, mention/citation and business outcome are separate observations with their own timestamps/statuses, not automatic promotions of execution state.

An `execution_verified` decision requires approved artifact version/hash, actor/time, correct tenant/target, observed content and a receipt appropriate to the action. For publication, retain the platform-native post ID/URL; an accepted scheduler job is insufficient. Document expected platform transformations and comparison/normalization rules rather than requiring universal byte equality. A technical change may use a deployment/change ID plus an observable check. Later edits, removal or inaccessible content update verification status without erasing the original receipt.

If the score has no defensible actionable gap, say so and propose monitoring or investigation with a decision date. If data is insufficient, the next step is repairing access/collection or agreeing a manual evidence review, not inventing three generic improvements. Manual review still needs provenance and cannot disguise a broken automated result as reliable proof.

## 4. Recurring value and service boundaries

Each contracted review shows accepted work versus promised work, active blockers, outcome coverage/comparability, actual human/provider cost, proposed next actions and customer decisions. Monitoring, repair or iteration must have a purpose; do not generate repetitive content to justify renewal. SEO reports indexation/qualified search traffic separately; organic platforms report native publication and qualified response separately. PPC and landing-page execution require their own optional scope and one approved acquisition budget.

Visibility → Stack cross-sell requires evidence that workflow/capacity is losing demand or preventing delivery. Record that problem and obtain a separate discovery/scope decision; no default dependency or bundled checkout. Signal opportunities remain unavailable to external customers until entitlement, tenant isolation, permitted sources and evidence gates are proven.

## 5. Acceptance scenarios and measures

| ID | Given / When / Then | Dependency / acceptance evidence |
|---|---|---|
| VIS-01 | Given brand A and B with the same query, when cached probes are read, then neither receives the other's evidence and legacy unsafe entries are refused | A02/A07; identity collision/legacy negative tests |
| VIS-02 | Given an absent result, failed provider or unverified citation, when scoring runs, then those states remain distinct and invalid coverage cannot create a complete score | A02/A03; observation fixtures through score/API |
| VIS-03 | Given repeated probes and a BR market, when the audit executes, then each observation and actual market/surface are retained without a silent foreign fallback | A03; repeat and routing fixtures plus approved canary |
| VIS-04 | Given different panel/methodology versions, when the customer reads a delta and explanation, then both use the same valid pair or explicitly say incomparable | A04; API/UI pair identity and changed-universe tests |
| VIS-05 | Given a prior approved action and new high-priority gaps, when the plan refreshes, then stable identity/history survive and new gaps receive a deliberate disposition | A05; repeat refresh, cap and transactional-failure tests |
| VIS-06 | Given a later citation but no execution receipt, when the loop evaluates progress, then it cannot mark OZVOR's action execution verified | A05/B02; forbidden transition test |
| VIS-07 | Given scheduler acceptance, changed content or a wrong target, when verifying publication, then native receipt/content/tenant checks prevent false completion | A07/B02/B03; approved→observed and removal scenarios |
| VIS-08 | Given unknown or contaminated social metrics, when recommendations/reviews run, then the customer sees unavailable evidence rather than learned success or a zero | A01/B03/B04/B09; consumer lineage and fail-closed tests |
| VIS-09 | Given a technical retry or paid audit failure, when fulfillment resumes, then billing follows the same logical operation and agreed remedy, without duplicate purchase | A06/A08; idempotency and recovery canary |
| VIS-10 | Given a cycle with no verified improvement, when the review is delivered, then it states completed work, uncertainty and a useful next decision without claiming guaranteed growth | B02/B08/B11; reviewed real-cycle report |

Proposed operational measures: coverage/comparable-pair rate; time to first accepted diagnostic and first verified action; fraction of actions with complete proof; unresolved/aged blockers; actual hours/cost per accepted deliverable; useful next-decision completeness; continuation/cancellation reasons. Targets are agreed after baseline, not invented here. Hard invariants: no cross-tenant evidence, no unsupported execution verification, no fabricated measurements. Passing local tests is not a production-service certificate.

## Handoff

**Next agent:** spec-reviewer. **Context:** [shared contract](README.md), [Stack counterpart](stack-delivery.md), A01–A09 and B02–B11 in the completion plan.
**Open decisions:** saleable coverage/modes, cadence and limits, action evidence rules by channel, acceptance window, costs and first pilot.
**Pending:** engineering, independent review, applicable privacy/security/billing gates and authorized end-to-end evidence. This document changes no service state or public promise.

---
Handoff to: spec-reviewer

---

## Anexo PT-BR — o que o cliente vê e as réguas (da preparação Claude `ff31245`, 11/09)

> Anexo de leitura para o fundador; a especificação operacional acima (EN, Codex `49d69ec`) prevalece em caso de conflito. Continua **proposto, não ativado**.


### O que o cliente vê, por ordem

| Painel | Conteúdo | Fonte | Estado |
|---|---|---|---|
| **Agora** | Nota com intervalo, motores que responderam (ex.: 4 de 5), data do run, versão do universo de perguntas | `geo_score` + `geo_audit.prompt_set_version` | medido |
| **Porquê** | Por pergunta perdida: motor, concorrentes citados, fonte citada (domínio), o que a resposta disse | `visibility-loop` evidência por card | medido |
| **Fazer** | 1–3 ações com evidência clicável, artefacto rascunhado, custo em créditos, quem aprova, critério de aceite, data do reteste | `plan_task` + hosted generation | medido (ações), a implementar (`action_id` estável, artefacto ligado) |
| **Prova** | Por ação: hash do conteúdo aprovado, alvo, receipt com ID da plataforma, acessibilidade verificada, estado `pending | published | failed | removed_later` | a implementar (lote 3/4) | proposto |
| **Mudou** | Reteste no MESMO painel fixo: `gap_resolved_observed` (sim / não / inconclusivo) separado de `execution_verified`; narrativa "o que mudou, em que perguntas, o que não é comparável" | `since-last-audit` com `to.audit_id == headline.audit_id` | a implementar (lote 3) |

### Estados de uma ação (propostos)

`proposed → drafting → review → approved → published (receipt) → verified_execution → observed` · laterais: `rejected | blocked | expired | regressed | removed_later`.

- `execution_verified` exige: conteúdo aprovado (hash) = conteúdo observado no alvo; tenant/alvo corretos; ID nativo da plataforma (job do agendador **não** é publicação); acessibilidade verificada na data.
- `gap_resolved_observed` é a observação do reteste, nunca prova de execução, nunca causalidade.
- Citação espontânea sem artefacto → `gap_resolved_observed`, `execution 0%`.

### Régua de entrega (proposta)

| Métrica | Numerador | Denominador | Janela |
|---|---|---|---|
| Ações com evidência | ações com pergunta/motor/fonte ligadas | ações abertas | por run |
| Execução provada | ações `execution_verified` | ações aprovadas | 30 d |
| Reteste comparável | runs no painel fixo com `comparable=true` | runs do período | 30 d |
| Gap resolvido observado | cards com observação sim/não/inconclusivo após reteste | cards executados | por reteste |

### O que não prometemos

Subida de nota, citação garantida, prazo para aparecer, causalidade entre ação e mudança. Prometemos: medição repetível no mesmo painel, ação específica com evidência, prova de execução, explicação honesta do que mudou e do que não é comparável, e a próxima decisão.

### Dependências de código (lotes)

L2 (cache por marca, extração com três contadores, free test sem sentinel) · lote 3 (`gap_resolved_observed`, `action_id`, `since-last` coerente) · lote 4 (receipt nativo).
