# TrustIndex AI — Product Overview (canonical reference)

> Owned by product-manager · Criado 2026-06-13
> **Todos os números deste doc foram verificados contra o código** (workflow de
> 4 verificadores paralelos, 2026-06-13): fórmulas de score, pesos, endpoints,
> páginas, migrações, segurança e compliance. Onde o código muda, atualize aqui.

---

## 1. O que é
Plataforma SaaS de **AI Search Trust Intelligence** para SMBs. Pergunta de verdade
ao ChatGPT/Claude/Perplexity/Gemini/Google AI Overview, calcula o **TrustIndex
Score** (0–100), mostra as provas, compara com concorrentes e entrega plano +
conteúdo pronto para a marca ser citada. **OrganicPosts** é o braço de consultoria.
Home: Brasil (LGPD). Clientes: EU (GDPR) + EUA (CCPA/FTC).

---

## 2. Produtos (escada de valor — método Hormozi)

| Degrau | Produto | Preço | Passo | Como é usado |
|---|---|---|---|---|
| 0 | **The AI Invisibility Test** | Grátis | VER | 1 prompt × marca vs 1 concorrente → placar em 60s → captura e-mail → CTA p/ Kit |
| 1 | **The Get-Cited Kit** | **US$29 one-time** | DIAGNOSTICAR + CORRIGIR | Checkout Stripe (mode `payment`, `STRIPE_PRICE_ID_KIT`) → auditoria completa + top-3 fixes + **3 posts prontos** (blog/LinkedIn/FAQ c/ schema) + checklist |
| 2 | **Growth** | €99/mês | MONITORAR | 1 marca, 10 concorrentes, 250 prompts, monitoramento semanal |
| 3 | **Agency** | €149/mês | MONITORAR | Multi-marca (25), white-label, workflow de aprovação |
| 4 | **OrganicPosts** | Sprint / Managed | ESCALAR | Consultoria feito-para-você (alta margem) |

Espinha: **VER → DIAGNOSTICAR → CORRIGIR → MONITORAR → ESCALAR.** Cada degrau é um
passo real do mesmo processo (detalhe em `docs/marketing/value-ladder.md`).

---

## 3. O TrustIndex Score — 3 vetores (fórmulas verificadas)

**Overall = Brand×0.30 + Performance×0.35 + AI×0.35** (cada sub-score 0–100).

| Vetor | Fórmula exata (verificada em `scoring.ts`) |
|---|---|
| **AI** (35%) | `(citationRate×0.50 + avgPositionScore×0.30 + sentimentScore×0.20) × 100` |
| **Performance** (35%) | `(schemaCoverage×0.30 + aiCrawlerAccess×0.25 + citationShareVsCompetitors×0.30 + (aioPresence?0.15:0)) × 100` |
| **Brand** (30%) | `(entityCompleteness×0.40 + citationVolume×0.40 + eeaSignal×0.20) × 100` |

> **Alinhado ao Google 2026:** `llms.txt` foi REMOVIDO da nota (peso 0, só
> informativo) — Google declarou que não é exigido. Schema é tratado como SEO
> padrão. (Confirmado: scoring.ts:27-29, 174-177.)

**Pesos auxiliares (verificados):**
- Off-site (7 fontes, somam 1.00): Reddit 0.22 · Wikipedia 0.20 · LinkedIn 0.15 · G2 0.13 · Trustpilot 0.10 · Crunchbase 0.10 · YouTube 0.10
- Conteúdo (traços Princeton/KDD, somam 1.00): statistics 0.28 · sourcedClaims 0.26 · answerShaped 0.22 · quotations 0.12 · depth 0.12

---

## 4. Funcionalidades — o motor (`packages/llm`)

**Camada de análise/geração (11 módulos) + 5 adapters de provedor + helpers.**

| Módulo | Função | Especificidade verificada |
|---|---|---|
| `providers/` (gateway + 5 adapters) | Pergunta a Anthropic/OpenAI/Gemini/Perplexity/SERP | repeat 3× live / 1× mock; EU exclui Perplexity; sanitização de prompt no gateway (GEO-SEC-2); cada adapter cai em **mock determinístico** sem chave |
| `citation-parser` | Citado? posição? fontes? | determinístico; descarta texto bruto; URLs limpas |
| `competitor-detect` | Concorrentes citados no seu lugar | word-boundary; **nunca enviado aos provedores** (GEO-A2) |
| `sentiment` | Como a marca é retratada (pos/neu/neg) | léxico ponderado + negação |
| `site-crawl` | Site: schema, llms.txt, robôs de IA, E-E-A-T | 8s/512KB, sem JS, **protegido contra SSRF** |
| `content-geo` | Multi-página: traços citáveis | pesos Princeton (acima) |
| `offsite-signal` | Presença nas 7 fontes que a IA mais cita | SERP `site:` ou mock |
| `reddit-signal` | Aprofunda no Reddit (fonte nº1) | threads + subreddits + sentimento |
| `entity-graph` | Wikidata/Wikipedia | API pública sem chave; fecha o baseline do Brand |
| `scoring` | Combina nos 3 vetores | puro/determinístico |
| `strategy-generator` | Lacunas → plano + calendário 4 semanas | ≥5 recs com esforço/impacto/prioridade; GEO-A2 (invariante que lança erro se vazar nome) |
| `content-studio` | Drafts blog/LinkedIn/FAQ + schema | usa `[PLACEHOLDER]` em vez de inventar |
| `ssrf-guard` *(helper)* | Fetch seguro p/ URLs do usuário | bloqueia IP privado/loopback/metadados; redirect manual revalidado |
| `prompt-sanitizer` *(helper)* | Anti-injeção compartilhado | strip control chars, cap 4000, rejeita padrões |
| `invisibility-test` *(produto)* | Orquestra o lead magnet | 1 prompt; GEO-A2 |
| `kit-deliverable` *(produto)* | Orquestra o Kit $29 | auditoria + top-3 + 3 drafts, tenant-free |

---

## 5. Especificidades técnicas (verificadas)

| Aspecto | Detalhe |
|---|---|
| Arquitetura | Monorepo: `apps/web` (Next.js 15), `apps/api` (Hono), `apps/worker` (BullMQ), `packages/{llm,db,shared}` |
| Banco | Postgres multi-tenant; **ENABLE + FORCE Row-Level Security em 24 tabelas**; **16 migrações** |
| Auth | Supabase magic-link (sem senha); `tenant_id`+`app_role` via JWT |
| Append-only | `ai_generation_log` com `REVOKE UPDATE/DELETE` (GEO-A6) |
| Segurança | SSRF guard, sanitização no gateway, payloads de fila só IDs+região, BYOK AES-256-GCM — **5/5 condições GEO-SEC ratificadas** (1ª rotação de chave = item operacional Gate 7) |
| Mock↔Live | 100% mock determinístico sem chaves; presença de `ANTHROPIC_API_KEY` etc. vira real **sem mudar código** |
| Transparência | cada input rotulado **measured** vs **baseline**; evidência por prompt |
| Compliance | Gates 0→4 logados (privacidade + AI-ethics + segurança); LGPD+GDPR+CCPA/FTC |
| Qualidade | 500 testes (unit + segurança + viés GEO-A8 + e2e) + CI |

---

## 6. Superfície (verificada)

- **API: 32 rotas** em `apps/api/src/routes/*.ts` (+ `/healthz` em `index.ts`).
  - Aquisição: `POST /api/test`, `POST /api/kit/checkout`, `GET /api/kit/:token`, `POST /api/kit/:token/deliver`, `POST /api/waitlist`
  - Core GEO: `POST /api/brands`, `GET /api/brands`, `POST /api/brands/:id/audit`, `GET /api/audits/:id`, `GET /api/audits/:id/breakdown`, `GET /api/brands/:id/{score,plan,content,competitors}`, `GET /api/reports/:token` (público)
  - Sistema: `GET /api/system/capabilities`, BYOK provider-keys
  - Billing: `/api/billing/{plan,checkout,portal,webhook}`
  - Compliance: `/api/dpa/*`, `/api/ccpa/*`, `/api/dsr/*`
- **Web: 30 páginas.** Destaques: `/` (landing), `/test`, `/kit` + `/kit/[token]`,
  `/how-it-works`, `/dashboard`, `/brands` + `/brands/[id]` (página-estrela),
  `/account/integrations` (BYOK), `/organicposts`, `/account/*` + `/legal/*`.

---

## 7. Forma de funcionamento e uso

### Jornada do cliente
```
Landing → "Free AI Test" (placar instantâneo) → cadastro (magic-link)
→ /create (marca: nome+site+categoria) → /brands roda auditoria (~30s)
→ /brands/[id]: Score + 3 vetores + evidências + concorrentes + Reddit + entity
   + plano (aceitar/rejeitar) + Content Studio (gerar drafts)
→ /dashboard: liga monitoramento semanal → /account/integrations: conectar chaves
```

### Fluxo do sistema numa auditoria
```
POST /api/brands/:id/audit → enfileira no Redis (payload só IDs+região)
→ worker: 10 prompts × 5 motores (repeat 3×) → parse de citações
   ‖ site-crawl ‖ off-site (7 fontes) ‖ Reddit ‖ entity-graph ‖ content-geo
→ sentiment sobre as respostas → computeGeoScore (3 vetores)
→ grava geo_score (série temporal) + evidências + log append-only
→ /brands/[id] faz polling até "complete" e mostra o breakdown
```

### As 6 etapas (expostas em `/api/system/capabilities` → `/how-it-works`)
1. **AI Visibility Audit** — sondagem multi-motor
2. **Authority & Perception Analysis** — sentiment + Reddit + off-site + entity
3. **TrustIndex Score** — os 3 vetores, com measured-vs-baseline
4. **GEO Content Plan** — plano priorizado + calendário
5. **Organic Publishing (OrganicPosts)** — drafts + publicação (humano aprova)
6. **Weekly Monitor (flywheel)** — re-auditoria semanal + tracking

---

## 8. Modelo de honestidade (diferencial)
Nunca prometemos "100% de precisão" nem citação garantida (IA é não-determinística;
seria contra FTC/LGPD). Em vez disso: **rigor + confiança honesta** — repetição de
prompts, rótulo measured-vs-baseline, evidência por prompt, e o **checklist de 3
perguntas do Google** respondido publicamente em `/how-it-works`.

---

## 9. O que falta (resumo — detalhe em FOUNDER-GUIDE.md)
- **Você:** Fase A (Supabase/Anthropic/Resend/Railway/Cloudflare + `db:migrate`) → Fase B (CNPJ + Stripe `STRIPE_PRICE_ID_KIT` + Prices) → Fase C (rep EU, Encarregado LGPD, DPAs, base LGPD BR→EUA, disclosure FTC).
- **Eu (não bloqueia):** materiais de venda, envio de e-mail (Resend) p/ Teste+Kit, model cards (Gate 6→7), webhook Stripe do Kit.
- **Backlog:** Reddit Data API (licença), sentiment via LLM, IP-pinning SSRF, X/TikTok.
