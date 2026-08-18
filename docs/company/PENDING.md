# OZvor — o que falta (lista fechada)

**Atualizado:** 2026-08-17, noite (Lisboa) · **Verificado:** SQL de produção + `origin/main` + Railway
**Fonte viva:** o painel Operating Overview (artifact) e `docs/company/STATE.md`. Este arquivo é a lista enxuta, por dono.

> Regra de leitura: um item só sai daqui quando a dependência **existe em produção**, não quando o PR mergeia. Migração/env é reportada como DESLIGADA até a dependência existir (regra R0).

---

## A. Só o founder — destrava receita hoje

| # | Ação | Destrava | Verificado |
|---|---|---|---|
| A1 | **Mergear #478** (`ai_audit_order`) | AI Audit $49 sai do 503 e vende | SQL: tabela ausente |
| A2 | **Mergear #463** (`ai_tool`) | catálogo real em vez de seed | SQL: tabela ausente |
| A3 | **3 envs do Telegram no serviço `api`** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`) + `setWebhook` | botão ✅/❌ funciona | SQL: 0 aprovações por botão |
| A4 | **`SIGNAL_ENGINE_URL` + `_API_KEY`** (api + worker) | `sphere-reddit` + aba "Where to show up" ligam | Railway: envs ausentes |
| A5 | **Stripe:** criar price $49 (`STRIPE_PRICE_ID_AI_AUDIT`) | checkout do $49 | — |
| A6 | **Stripe:** criar cupom 15% (`AIAUDIT15`) + `STRIPE_COUPON_AIAUDIT15` | desconto do assinante na aba | — |
| A7 | **`SIGNAL_ENGINE_PROVISIONING_KEY`** no api | provisionar tenant por marca (aba per-brand) | pré-req: #498 no repo do SE |
| A8 | **Rotacionar a chave do operator do Hermes** (#301) | cockpit CEO→VP→job deixa de ser cego | — |
| A9 | **Aposentar o produtor legado de vídeo/thread do X na VPS** | para a duplicação sem portão | live switch |

### Já feito por você (2026-08-17), confirmado no banco
- ✅ **#488** — CHECK do nurture com as 9 sequências → nurture agressivo inscreve de verdade.
- ✅ **#489** — `api_spend.tenant_id` → custo por cliente ligado.

---

## B. Decisões suas (mudam o que o cliente vê)
- **B1** — Pacote de créditos: **$13** (fórmula `overagePackUsd`) ou **$20** (docs/memória)?
- **B2** — Agency: **10 marcas** (`PricingPlans.tsx`) ou **15** (`docs/PRODUCTS.md`)?
- **B3** — Válvula `SPHERE_MAX_DAILY_APPROVALS`: **6** (default) com **7** grafos de marketing gated — sobe para 7 ou aceita o rodízio?
- **B4** — Google Ads Transparency (#498): provedor licenciado OU adiar? (não há API oficial; scraping proibido)

---

## C. Engenharia — fila (o que dá para fazer sem o founder)
- **C1** — Coletores **Meta Ad Library** + **Google** no repo do Signal Engine (spec pronta em #498; roda no repo do founder, precisa do SE no ar).
- **C2** — **Provisionamento de tenant por marca** — lado Ozvor: `provisioning.ts` + `provider_keys` (migração em PR do founder) quando o `POST /tenants` do #498 existir.
- **C3** — CTA do AI Audit nas **~10 páginas** restantes (`/compare`, `/learn`, `/research`, `/results`, `/vs`, `/welcome`, `/blog/watch`, legais, `/support`).
- **C4** — **E2E obrigatório de verdade** (#146) — hoje falha em toda run mas o workflow reporta sucesso; **maior risco** (pode travar todos os PRs se webkit-mobile ainda vermelho).
- **C5** — **webkit-mobile** (Safari mobile) real na E2E noturna (#170).
- **C6** — Limpeza do **tier fantasma `starter`** (PLAN_LIMITS + cockpit + CHECK de migração → PR do founder).
- **C7** — Vídeo com apresentador (HeyGen → Remotion, digital twin — apresentador a criar).
- **C8** — **CX como grafo** (inbox → triagem → resposta com SLA) — não começou; CX hoje é o founder.
- **C9** — Migrar o resto do n8n para cron VPS (teto 2.5k exec/mês; só o Incident Watch saiu).

## Já entregue nesta sessão (bloco D + bloco C)
D1–D12 (dashboard, nurture, Pages, Telegram buttons, spheres IG/TikTok/YT/PPC, blog robusto, pacote de conferência, Signal Engine, dossiê) · SPRINT-9 (CTA site-wide) · #492 (bug do X) · #493 (doc billing) · #494 (rate limit auditoria) · #495 (testes) · #496 (sphere-reddit) · #497 (aba Where to show up) · #498 (spec dos coletores).

---

## D. Legal & risco
- **D1** — Encarregado (LGPD Art. 41) + Art. 27 documentado sem nome civil (#142).
- **D2** — DPAs com sub-processadores assinados.
- **D3** — Gate 7 (deploy) com veredito registrado.
- **D4** — Op-sec: `list_variables` do Railway devolve **valores** de segredo em texto claro — restringir quem chama.

## E. Auditorias de fechamento (depois de A)
- **E1** — Auditoria geral promessa × entrega (#153).
- **E2** — RED TEAM adversarial (#157).

---

*Se você fizer só o bloco A esta semana, o AI Audit começa a vender, o nurture roda, o botão do Telegram funciona e os agentes ganham olhos externos — sem uma linha de código nova.*
