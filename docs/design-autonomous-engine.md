# Design — Autonomous Study Engine + Paid Opportunity Engine (Fase B)

> **TL;DR (≤200 palavras).** Desenho técnico completo, sem implementação. Dois módulos sobre a
> stack existente (Next+Hono+BullMQ+Supabase+Railway): **(A) Study Engine** — pipeline autônomo
> de 30 dias com especialistas por capacidade, QA em 2 camadas (validadores mecânicos em código +
> revisão adversarial LLM), gestor de área com palavra final entre agentes, e UM portão humano em
> lote; **(B) Paid Opportunity Engine v1** — motor determinístico que traduz sinais já coletados
> (displacement, prompts ausentes, Reddit, GSC/GA4) em recomendações de campanha
> (Google/Reddit/Meta/LinkedIn Ads) com hipótese, evidência, risco e `approval_required` —
> nunca executa, nunca gasta. **Convergência-chave:** ambos usam a MESMA infraestrutura nova —
> tabelas `recommendation` + `evidence_item` + fila de aprovação (generalização dos Action
> Cards). A Fase B (~2-3 dias) constrói essa base; o Study Engine (~2 semanas) a reutiliza.
> Trilhos determinísticos, LLM só em pesquisa/redação/julgamento; dead-man's switch e invariantes
> contra falha silenciosa (lição do worker fabricador); autonomia Level 2→3, nunca 4.

---

## 0. Princípios (herdados do que já provamos)
1. **Trilhos determinísticos, LLM passageiro** — orquestração, scoring, filas, risco e agregação
   em código testável; LLM só pesquisa, redige e julga.
2. **Quem faz não aprova; quem aprova não edita; execução externa só com humano.**
3. **Toda afirmação carrega ponteiro de evidência** (direct > observed > inference > hypothesis).
4. **O sistema vigia a si mesmo com código burro** (heartbeats, invariantes), não com IA.
5. **Nunca fabricar**: sem evidência → `hypothesis` explícito; sem dado → falha honesta.

## 1. Visão geral

```
                                VOCÊ (founder / agência)
                    ┌──────────────────────────────────────────┐
                    │  Approval Queue (lote) · Exceções · Digest │
                    └────────────────▲─────────────────────────┘
                                     │ recomendações QA-aprovadas
┌────────────────────────────────────┴────────────────────────────────────┐
│                        GESTOR DE ÁREA (LLM, 1 por área)                 │
│      arbitra especialista×QA · consolida pacote · decide o que sobe     │
├──────────────┬───────────────────────────────┬──────────────────────────┤
│ ÁREA INTEL   │ ÁREA CONTEÚDO                 │ ÁREA PAID                │
│ serp/competi-│ geo_content / distribution /  │ bridge (determinístico)  │
│ tor/community│ linkedin / community_reply    │ + google/reddit/meta/    │
│ /ads_intel*  │ (reusa Content Studio BYOK)   │   linkedin ads (drafts)  │
└──────┬───────┴───────────────┬───────────────┴───────────┬──────────────┘
       │        saída tipada (schema) por tarefa           │
┌──────▼────────────────────────▼───────────────────────────▼─────────────┐
│ QA CAMADA 1 — validadores em código (schema, evidência, links, claims,  │
│ números×fonte, risk preenchido) — 100% das saídas, custo ~zero          │
│ QA CAMADA 2 — adversarial LLM ("tente refutar"), lentes por risco:      │
│ LOW=amostra 10% · MEDIUM=1 lente · HIGH=3 lentes+maioria                │
└──────▲───────────────────────────────────────────────────▲──────────────┘
       │                 TRILHOS (código, não LLM)          │
┌──────┴─────────────────────────────────────────────────────┴────────────┐
│ BullMQ (Railway Redis): cycle:daily · agent:task · qa:review ·          │
│ manager:review · cron diário/semanal/mensal (infra já existente)        │
│ + pipeline_heartbeat (dead-man) + invariantes de integridade            │
└──────────────────────────────────────────────────────────────────────────┘
│ SUBSTRATO: audit engine 5-engines · attribution (GSC/GA4) · Reddit      │
│ module · competitor benchmark · Content Studio · api_spend budget        │
└──────────────────────────────────────────────────────────────────────────┘
```

## 2. Banco de dados (1 migração nova, padrão RLS das 22 existentes)

```sql
-- Núcleo compartilhado (Fase B constrói; Study Engine reutiliza)
recommendation (
  id uuid PK, tenant_id, brand_id, cycle_id nullable,
  kind text CHECK (kind IN ('paid_campaign','organic_content','page_update',
                            'community_reply','linkedin_post','cro','other')),
  channel text nullable,            -- google_ads|reddit_ads|meta_ads|linkedin_ads|...
  risk text CHECK (risk IN ('low','medium','high','blocked')),
  status text CHECK (status IN ('pending','approved','rejected','edited','executed','expired')),
  hypothesis text, payload jsonb,   -- targeting, angles, budget_range, landing_page, metrics
  qa_verdicts jsonb, manager_note text,
  approved_by uuid nullable, approved_at timestamptz nullable,
  created_at
)
evidence_item (
  id uuid PK, tenant_id, recommendation_id FK nullable, task_id FK nullable,
  source_type text CHECK (source_type IN ('direct','observed','inference','hypothesis')),
  source_ref text,                  -- URL, audit_id#probe, gsc:query, ga4:page…
  finding text, snapshot jsonb nullable, captured_at
)
-- Só Study Engine
cycle (id, tenant_id, brand_id, day0 date, autonomy_level int CHECK (1..3),
       status, plan jsonb, created_at)
agent_task (id, tenant_id, brand_id, cycle_id, agent_key text,
  status CHECK ('queued','running','qa1','qa2','manager','done','failed','escalated'),
  input jsonb, output jsonb, schema_version text, attempts int, error text, timestamps)
learning (id, tenant_id, observation text, evidence jsonb,
  status CHECK ('proposed','approved','rejected'), approved_by, created_at)
pipeline_heartbeat (id, job_key text, expected_at, ran_at nullable, ok bool)
```

Regras de integridade em código (camada 1): recommendation sem ≥1 `evidence_item` não-hypothesis
⇒ força `risk='high'` e marca `hypothesis`; `kind='paid_campaign'` ⇒ `approval_required` sempre;
nome de concorrente em `payload.ad_copy` ⇒ `blocked` (guardrail de marca registrada).

## 3. FASE B — Paid Opportunity Engine v1 (~2-3 dias)

### 3.1 Motor — `packages/llm/paid-opportunity.ts` (determinístico, SEM LLM)
Assinatura: `generatePaidOpportunities(inputs) → PaidOpportunity[]` com inputs 100% já coletados:

| Regra (sinal → oportunidade) | Fonte existente | Canal | Risco default |
|---|---|---|---|
| Concorrente citado ≥N vezes onde cliente ausente | competitor_citation | Google Search (alternativa/comparativo) | medium |
| Prompts de compra com cliente ausente | citation_check cited=false | Google Search (keywords por intenção + negatives) | medium |
| Threads/subreddits ativos do nicho | reddit module breakdown | Reddit Ads (subreddit targeting + copy nativa + lead magnet) | **high** |
| Query GSC com impressões e CTR < limiar | attribution/GSC | Google Search + landing dedicada | medium (direct data) |
| Página GA4 com tráfego alto e conversão baixa | attribution/GA4 | Retargeting Meta/LinkedIn + nota CRO | medium |
| Conteúdo aprovado com melhor tração | content_piece + attribution | LinkedIn Thought Leadership | low |

Cada `PaidOpportunity`: `channel · hypothesis · evidence[] · targeting · ad_angles[3] ·
landing_page_needed · budget_test_range (faixa, ex. "US$20–50/dia · 7–14 dias") ·
success_metrics · risk · approval_required: true`. **Proibições codificadas:** nunca estimar
CPC/volume sem fonte (sem conector Ads ⇒ campo omitido, não inventado); nunca marca de
concorrente no texto de anúncio; Reddit Ads sempre high.

### 3.2 Persistência + worker
Hook no fim de `audit-run.ts` (mesmo padrão do strategy plan): gera oportunidades → insere
`recommendation(kind='paid_campaign')` + `evidence_item[]`. Idempotente por (brand, cycle,
regra, alvo) — re-audit atualiza em vez de duplicar.

### 3.3 API + UI
- `GET /api/brands/:id/paid-opportunities` · `PATCH /api/recommendations/:id` (approve/reject/edit
  — requireAuth + audit log; mesmo middleware dos Action Cards).
- Dashboard da marca: seção **"Paid Opportunities"** — cards com badge de canal + risco,
  hipótese, evidências clicáveis, faixa de budget, Approve/Dismiss. Visual = Action Cards.
- **White-label report (Agency)**: seção "Paid opportunities (evidence-backed)" — argumento de
  venda central para agências.
- Free/Growth: seção visível com 1 oportunidade + upsell Agency (decisão comercial default;
  ajustável).

### 3.4 Fora de escopo da v1 (explícito)
Sem conector de Ads (Fase C) · sem execução/lançamento (Fase D) · sem LLM no motor · sem
estimativas de mercado não-fontadas.

## 4. STUDY ENGINE (~2 semanas, pós-Fase B)

### 4.1 Roster de agentes (por capacidade; prompts versionados no repo)
| Área | Agente (agent_key) | Modelo sugerido | Reusa |
|---|---|---|---|
| — | `planner` (plano semanal do ciclo; único LLM "gestor-mestre"; plano é DADO, trilho executa) | forte | — |
| Intel | `serp_intel` · `competitor_intel` · `community_intel` | médio | gateway SERP, gooseworks/brightdata adapters, reddit module |
| Intel | `ads_intel` (Fase C; lê exports/conector) | médio | attribution |
| Conteúdo | `geo_content` · `distribution` · `linkedin_authority` · `community_reply_drafts` | médio | Content Studio (BYOK do cliente p/ conteúdo dele) |
| Paid | bridge determinístico (§3) + `google_ads_drafts` · `reddit_ads_drafts` · `meta_ads_drafts` · `linkedin_ads_drafts` (só drafts de campanha) | médio | recommendation infra |
| QA | validadores camada 1 (código) · `qa_adversarial` (lentes: factual/marca/especificidade) | camada 2: forte p/ high | vitest p/ camada 1 |
| Gestão | `manager_intel` · `manager_content` · `manager_paid` (arbitragem com regras escritas) | forte | — |

Regras de arbitragem (exemplos, codificadas no prompt do manager): QA reprova por evidência ⇒
retorna ao especialista (máx 2 tentativas, depois `escalated`); reprova por estilo ⇒ manager
decide; conflito manager×QA em `high` ⇒ sobe pro humano SEMPRE.

### 4.2 Fluxo de uma tarefa
```
enqueue(agent:task) → especialista (LLM, saída schema-validada)
  → QA1 código (falhou ⇒ retry com feedback, máx 2)
  → QA2 adversarial (por risco)  → manager (consolida/arbitra)
  → recommendation(pending) + evidence → Approval Queue
Aprovado ⇒ executor INTERNO apenas (draft vira approved no Content Studio, report atualiza…)
Ação EXTERNA (publicar/postar/responder/gastar) ⇒ humano executa ou Fase D com gate.
```

### 4.3 Cadência (cron BullMQ — infra existente)
Diário 08:00 digest + monitoring · scan de comunidade 11h/16h · batch de conteúdo ter/qui ·
sexta: weekly report + fila da semana · mensal: re-audit completo + baseline vs atual.

### 4.4 Anti-falha-silenciosa
`pipeline_heartbeat` por job + verificador que alerta via Resend se job esperado não rodou ou
produziu 0 outputs · invariantes (ex.: task `done` sem output schema-válido = impossível) ·
`api_spend` estende para orçamento por ciclo/cliente com corte suave (para de gerar, nunca
corta aprovação) · replays idempotentes.

### 4.5 Superfícies humanas (as únicas)
1. **Approval Queue** (web, extensão do padrão Action Cards): filtros por risco/kind/cliente,
   aprovação em lote, "pedir mais evidência" (reenfileira com feedback).
2. **Digest diário** (e-mail Resend): 5 linhas — o que rodou, o que está na fila, exceções.
3. **Weekly report** (já existe; ganha seção do ciclo).
Meta: ≤30 min/dia por cliente.

### 4.6 Custos estimados (ordem de grandeza, a calibrar com metering real)
Por cliente/ciclo-30d no plano "standard" do brief (~300 execuções): LLM ~US$5–25 (roteamento
barato/médio/forte) + infra marginal ~0 (Railway já roda). Coerente com o brief; irrelevante
frente ao custo humano — que este desenho reduz ao portão único.

## 5. Sequenciamento e esforço
| Sprint | Entrega | Esforço | Gate |
|---|---|---|---|
| B1 | migração `recommendation`+`evidence_item` + motor paid + hook worker | ~1,5 dia | pós-lançamento |
| B2 | API + painel dashboard + white-label report | ~1 dia | — |
| S1 | `cycle`/`agent_task`/heartbeat + QA1 validadores + 2 especialistas Intel | ~4 dias | 1º cliente Agency/OrganicPosts |
| S2 | QA2 adversarial + managers + digest + Approval Queue geral | ~4 dias | — |
| S3 | learning loop + autonomy Level 3 interno | ~2 dias | após 1 ciclo real |
| C | conector Google Ads read-only (OAuth) + gate privacidade (ROPA/DPIA) | ~3 dias | 2+ clientes com Ads |
| D | execução pós-aprovação (Google Ads primeiro) | a definir | demanda explícita |

## 6. Riscos do desenho e mitigação
Genericidade das recomendações (emissão condicionada a achado específico citável) · custo QA
(amostragem por risco) · drift de agente (learning só vira regra com aprovação humana) · falha
silenciosa (heartbeat + invariantes) · compliance conectores (gate privacidade antes de EU) ·
escopo-fantasma (este doc é o contrato; fora dele = novo design).
