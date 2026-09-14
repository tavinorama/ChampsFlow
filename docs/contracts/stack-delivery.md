# AI Audit Stack — proposed operational delivery contract

## TL;DR

Version 0.1, 2026-09-14; B01/L3, proposed, not shipped. Stack investigates a defined operational workflow and recommends an appropriate tool/process decision, including not automating. A diagnostic does not include an implementation sprint; software access does not imply managed operations. An optional sprint proves correct execution in a controlled environment before any authorized live change. Value is evaluated with comparable before/after periods, recorded volume and case mix, active human time, elapsed time, errors, interventions and total cost. Recurrence funds necessary monitoring, maintenance and measured improvements, not artificial work. The funnel can end in a useful diagnostic or operational improvement; OrganicPosts is not its default destination. The [common contract](README.md) governs capacity, authority, data, commercial handoff, support and exit. Requirements below need implementation and independent evidence before being sold as delivered capabilities.

## 1. Primary user, discovery and inputs

Primary user: an SMB owner with a costly, slow or unreliable workflow and limited implementation capacity. Begin with one named workflow, its business purpose, owner, trigger, inputs/outputs, users, dependencies, existing tools and current failure modes. Define successful and invalid cases before recommending a product.

Input record: tenant and workflow ID/version, scope boundaries, case taxonomy, representative redacted cases, observation windows, volumes, handling steps, existing cost/tool contracts, human roles, exception path, access constraints and customer acceptance criteria. Self-reported effort is labelled self-reported and never promoted to instrumented baseline. Do not request an entire customer database or broad admin credentials to inspect one workflow.

| Mode | Deliverable | Boundary |
|---|---|---|
| Diagnostic one-time | Process map, observed/self-reported baseline, constraints, tool-fit options, risks and prioritized recommendation with implementation brief | No installation, custom integration, verified savings or recurring management implied |
| Software access, only if implemented/available | Contracted analysis/history/monitoring functions and export within entitlements | A proposed Stack dashboard is not a shipped subscription; customer owns execution unless separately contracted |
| Implementation sprint | Approved bounded workflow change, controlled tests, exception handling, runbook, rollback and acceptance record | Separate scope, start date and effort; live rollout requires its own authorization |
| Managed maintenance, only when useful | Contracted health checks, incident handling, compatibility/security review and evidence-backed iteration | No unlimited custom development or recurring fee justified merely by job count |

## 2. Decision quality and baseline

Evaluate a short set of options: simplify the process, improve current tooling, buy/configure an existing tool, build a bounded integration, or do not automate. Each option records assumptions, integration effort, human review, vendor/privacy/security constraints, reversibility, ongoing cost and expected benefit as a hypothesis. A no-automation recommendation can be a successful diagnostic when evidence supports it.

The baseline and post-change reading must record equivalent windows, volume, workload mix, definition versions and exclusions. Include:

- Active human handling time per case, separate from elapsed end-to-end time and waiting time.
- Error rate with numerator/eligible denominator and error taxonomy; retries/reopened work are not silently removed.
- Human intervention rate, exception frequency and severity, completion/abandonment, output acceptance and escalation.
- Tool/provider cost, allocated human time, onboarding, supervision and rework; missing cost remains unknown.

Changes in case mix/seasonality/volume, staff, access or tracking may invalidate a simple delta. Stratify or use an agreed comparable subset and disclose coverage; otherwise report inconclusive and collect more evidence under a bounded plan. Do not claim causal savings from unrelated monthly totals, synthetic cases or model-generated forecasts. Record distributions/exception tails where averages would hide service failures.

## 3. Sprint, execution and acceptance

Proposed lifecycle: `discovery → baseline_pending → options_review → scope_approved → prepared → controlled_validation → awaiting_live_authorization → pilot → accepted → monitoring`, with blocked/failed/rejected/cancelled alternatives. A diagnostic may validly close after options_review; live access is not a prerequisite for every purchase. These are required business distinctions, not existing database enums.

Every implemented change carries workflow/change ID and version, approved scope, tenant/target, owner, approved permission/spend limits, test inputs and expected outputs, execution IDs/receipts, observed outputs, exception logs and rollback instructions. A successful cron or n8n run alone does not prove the business outcome. Compare the approved behavior with actual effects, including downstream integrations and duplicate/partial execution. Synthetic fixtures remain labelled; customer acceptance names the exact version and environment.

Default rollout is controlled and reversible: read-only diagnosis → synthetic/redacted tests → approved bounded pilot → monitored release. Use an explicit manual fallback and safe stop when outputs are uncertain, dependencies fail, approval expires or budgets are exhausted. No autonomous retry loop may duplicate invoices, messages, records or spend. Founder approval and customer authority are separate requirements where both apply; neither is inferred from purchasing the diagnostic.

On failure, display the affected workflow/cases, known side effects, last successful state and accountable recovery decision. Verify restoration/reconciliation before resuming. If acceptance fails, classify defect versus scope change, preserve evidence, propose repair or renegotiation under agreed terms, and do not mark the sprint accepted to start recurring billing.

## 4. Customer experience, maintenance and cross-sell

The customer receives a concise process map, baseline confidence, why the selected option fits, what changed, test/pilot results, remaining manual work, operating instructions and ownership of integrations. They can see unresolved incidents, actual effort/cost and a next decision without reading raw agent logs or exposing secrets.

Each agreed maintenance review asks whether the workflow is healthy, whether workload/vendor requirements changed, whether interventions/cost exceed the accepted baseline, and whether any improvement is worth its cost. Continue, change scope, revert, hand over or end maintenance based on evidence. Export the entitled workflow documentation, configuration inventory without secrets, evidence and runbook; explain any vendor portability restrictions before sale.

Stack → Visibility is proposed only when discovery shows inadequate relevant demand rather than an internal process bottleneck. Visibility → Stack is appropriate when qualified demand is lost through response/qualification/delivery failures. Both need separate scope and customer consent. Sales/CRM qualification, RevOps, organic publishing, SEO or PPC workflows may be selected for a sprint, but selecting one never includes all of them. Traffic/PPC shares a single approved acquisition budget; ad spend activation and landing-page conversion tracking are separately gated. Signal may inform opportunities only through permitted sources and isolated access, not an assumed global tenant.

## 5. Acceptance scenarios and measures

| ID | Given / When / Then | Dependency / acceptance evidence |
|---|---|---|
| STK-01 | Given incomplete or self-reported baseline data, when the diagnostic recommends an option, then provenance/uncertainty remain visible and savings are labelled hypotheses | B01/B11; source-linked diagnostic review |
| STK-02 | Given no economically or safely justified automation, when options are reviewed, then a reasoned no-automation recommendation can fulfill the agreed diagnostic | B01/B07/B11; alternative comparison and customer acceptance |
| STK-03 | Given different volume or case mix, when before/after results are calculated, then invalid comparisons are withheld or stratified with coverage and limitations | A01/B11; changed-mix and missing-data fixtures |
| STK-04 | Given a workflow test, when elapsed time improves but human handling/errors worsen, then all separate measures remain visible and the agreed success criterion can fail | B02/B11; recorded cases, denominators and acceptance decision |
| STK-05 | Given a retried/partial run, when external effects are attempted, then the same logical operation is reconciled without duplicate writes, messages or charges | A06/A08/B02; idempotency/failure and recovery tests |
| STK-06 | Given an expired approval, wrong tenant or scope change, when a pilot/live execution is requested, then it stops without unauthorized effects | A07/A08/B02; negative access/version/budget tests |
| STK-07 | Given scheduler success but rejected downstream output, when sprint completion is evaluated, then the service remains unaccepted with a recovery owner | A08/B02/B08; native output/receipt and rejection scenario |
| STK-08 | Given a failed pilot, when rollback is invoked, then the manual fallback and restoration are verified before resuming | A08/B02; controlled rollback record, not only a runbook |
| STK-09 | Given a stable workflow with no justified iteration, when renewal is reviewed, then necessary maintenance is explained or scope is reduced/ended instead of inventing work | B08/B11; service review and customer decision |
| STK-10 | Given a paid diagnostic without implementation scope, when fulfillment ends, then no live integration, OrganicPosts purchase or recurring charge is implied | A06/A09/B01/B07; order→artifact→billing trace |

Operational measures: time to accepted diagnostic, baseline completeness, accepted-output rate, active time/elapsed time/error/intervention per eligible case, actual total cost, incident recovery and customer continuation reason. Track effort estimates versus actuals and maintain capacity reservations from [README §5](README.md#5-capacity-and-operating-economics). Numeric performance targets belong to the approved per-workflow baseline/scope; this specification provides no invented SLA or savings percentage. Dependency names are defined in the shared contract and completion plan.

## Handoff

**Next agent:** spec-reviewer. **Context:** [shared contract](README.md), [Visibility counterpart](visibility-delivery.md), B01/B02/B07/B08/B11 and relevant A01/A06–A09 gates.
**Open decisions:** first workflow/segment, actual modes available, sample/window comparability, permitted access, sprint capacity, acceptance and maintenance terms.
**Pending:** customer/founder scope approval, implementation, independent review, applicable compliance/security gates and controlled/live proof when authorized. No workflow, infrastructure, billing or campaign was changed by this document.

---
Handoff to: spec-reviewer

---

## Anexo PT-BR — o que o cliente vê e as réguas (da preparação Claude `ff31245`, 11/09)

> Anexo de leitura para o fundador; a especificação operacional acima (EN, Codex `49d69ec`) prevalece em caso de conflito. Continua **proposto, não ativado**. Stack não compra posts; cross-sell só com evidência de gargalo.


### Entrada

Um workflow operacional do cliente (exemplo ilustrativo, não caso real: orçamento por e-mail respondido em 2 dias). Capturar: objetivo, trigger, etapas, sistemas, volume/mês, minutos por caso, taxa de erro/retrabalho, dados envolvidos, aprovações, caminho de falha, KPI atual.

### Entrega do Snapshot

- Baseline **medido** no período de referência: volume, minutos por caso, tempo decorrido, erros, intervenções humanas. Faltando dado → `insufficient_data`, nunca zero.
- Três opções com fonte e data: configurar o que já tem · integrar/automatizar · não fazer nada. "Não automatizar" listado.
- ROI em **faixa** com premissas editáveis (ocorrências, minutos, custo-hora, redução esperada, custo da ferramenta/implantação/manutenção). Nunca renderizado como garantia.

### Entrega da sprint (se contratada)

Integração implantada com SOP, human check, logs e rollback. **Resultado medido** em períodos **equivalentes** antes/depois (mesma duração, volume e mix registados): minutos por caso, tempo decorrido, taxa de erro, intervenções humanas, tempo ativo. Diferença reportada como observada, com `insufficient_data` quando o período não fecha.

### Estados (propostos)

`discovered → evidence_needed → qualified → designed → approved → implementing → live → adopted → verified` · laterais: `rejected | blocked | paused | regressed | retired`.

### O que o cliente vê

O workflow escolhido, o baseline, as três opções, a faixa de ROI com as premissas, o que ficou fora, o que mudou (se sprint), o custo, a próxima revisão e a próxima ação. Sem score opaco.

### Régua de entrega (proposta)

| Métrica | Numerador | Denominador |
|---|---|---|
| Baseline completo | campos medidos | campos obrigatórios |
| Workflow ao vivo | workflows `live` com SOP e rollback | workflows aprovados |
| Resultado medido | workflows com antes/depois equivalentes | workflows `live` |
| Adoção | casos tratados pelo fluxo novo | casos do período |

### Recorrência

Receita recorrente só com contrato/assinatura, cobrança e continuidade; avulso separado. Revisão periódica com próxima ação; sem manutenção artificial.
