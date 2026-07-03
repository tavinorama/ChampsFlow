# Roadmap — Paid Opportunity Engine (a Ponte Orgânico → Pago)

> **TL;DR (≤200 palavras).** Avaliação do brief "OZvor Traffic Engine" (founder, 2026-07-03):
> **~60-70% do brief já está em produção** — audit multi-engine, competitor benchmark, Action
> Cards com approval, Content Studio BYOK, monitoring, GSC/GA4 connectors, e o "Authority
> Engine" como serviço É o OrganicPosts. **Não** construir sistema repo-first paralelo nem
> sub-marca nova. O incremento genuíno é a **Parte 3 do brief: traduzir sinais orgânicos em
> recomendações estruturadas de tráfego pago** (Google/Reddit/Meta/LinkedIn Ads), com hipótese,
> evidência, risco e aprovação humana obrigatória — nada paid-facing existe hoje. Fase B (~2-3
> dias, pós-primeira-receita): motor de regras determinístico sobre dados que JÁ coletamos +
> tabela `paid_opportunity` + painel no dashboard + inclusão no white-label report. Nunca executa
> campanha; nunca gasta; `approval_required` sempre. Fase C: conector Google Ads read-only.
> Fase D (condicional): execução pós-aprovação. Fonte: `~/Downloads/OZVOR_TRAFFIC_ENGINE_FULL_CLAUDE_CODE_BRIEF.md`.

## Decisões de posicionamento
1. **Sem sub-marca "Authority Engine"** — o serviço descrito já existe como OrganicPosts
   (Sprint $1.500 / Managed $1.900/mo). O módulo novo vende-se como **"Paid Intelligence"**
   dentro do produto (Agency tier / add-on) e como entregável do OrganicPosts.
2. **Sem sistema repo-first paralelo** — estender o SaaS. O tooling interno de operação de
   clientes (pastas, evidence ledger, filas) nasce quando o OrganicPosts tiver o 1º cliente
   Sprint, reutilizando os agentes existentes do repo.
3. **Guardrails do brief = nosso ethos atual** (draft-and-confirm, evidência obrigatória,
   nunca fabricar). Adotar o risk scoring LOW/MEDIUM/HIGH/BLOCKED nas novas recomendações.

## Fase B — Paid Opportunity Engine v1 (pós-primeira-receita; ~2-3 dias)

### Motor (packages/llm/paid-opportunity.ts — determinístico, sem LLM, irmão do strategy-generator)
Mapeamento sinal→oportunidade usando SÓ dados já coletados:

| Sinal (fonte existente) | Recomendação paga gerada |
|---|---|
| Competitor displacement (competitor_citation) | Google Ads campanha alternativa/comparativo (cuidado legal com marca alheia) |
| Prompts onde a marca está ausente (citation_check cited=false) | Keyword list Search por intenção + negative keywords |
| Threads/subreddits do módulo Reddit | Reddit Ads: subreddit targeting + copy nativa educativa + lead magnet (risk: HIGH) |
| GSC queries com impressões e CTR baixo (attribution connector) | Search campaign + nova copy + landing dedicada |
| GA4 páginas com tráfego e baixa conversão (attribution connector) | Retargeting (Meta/LinkedIn) + recomendação CRO |
| Conteúdo aprovado com melhor tração | LinkedIn Thought Leadership ad |

### Formato (por oportunidade)
`channel · hypothesis · evidence[] (com fonte real ou marcado hypothesis) · targeting · ad_angles ·
landing_page_needed · budget_test_range · success_metrics · risk (LOW/MEDIUM/HIGH/BLOCKED) ·
approval_required: true`. **Nunca ativa campanha, nunca toca conta de ads, nunca gasta.**

### Persistência + UI
- Migração: tabela `paid_opportunity` (tenant/brand, status pending/approved/dismissed, payload
  jsonb, risk, evidence jsonb, created_at) — RLS igual às demais.
- Worker: gera oportunidades no fim do audit (reusa breakdown) — mesmo padrão do strategy plan.
- Dashboard: seção "Paid Opportunities" no brand page (cards com Approve/Dismiss, badge de risco).
- Agency: entra no white-label report (argumento de venda forte para agências).

## Fase C — Conectores de ads (read-only)
Google Ads OAuth (search terms, CPC, CTR, CVR) → alimenta o motor com direct data + fecha o loop
pago→orgânico ("termo caro que converte → criar página GEO definitiva"). Depois: Reddit/Meta/
LinkedIn Ads readers. Cada conector segue o padrão do attribution (#86).

## Fase D — Execução (condicional a demanda)
Lançamento de campanha pós-aprovação via APIs oficiais, começando por Google Ads. Manter Level 2
do brief (agente prepara, humano aprova, agente executa) — nunca Level 4.

## O que do brief NÃO faremos
- CLI Python repo-first paralela ao produto (duplicaria filas/aprovação/evidência já existentes).
- Sub-marca/página "Authority Engine" (canibaliza OrganicPosts).
- Contas OZvor pagando LLM de conteúdo do cliente (nosso BYOK é superior ao proposto).
- Qualquer automação de posting em comunidades (já vetado pelo nosso próprio ethos e pelo brief).
