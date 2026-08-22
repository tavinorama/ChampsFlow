# OZvor — o que falta (lista fechada)

**Atualizado:** 2026-08-22, 17h30 (Lisboa) — pós-varredura exaustiva · **Verificado:** SQL de produção + `origin/main` + Railway
**Fonte viva:** o painel Operating Overview (artifact) e `docs/company/STATE.md`. Este arquivo é a lista enxuta, por dono.

> Regra de leitura: um item só sai daqui quando a dependência **existe em produção**, não quando o PR mergeia. Migração/env é reportada como DESLIGADA até a dependência existir (regra R0).

---

## A. Só o founder — destrava receita hoje

| # | Ação | Destrava | Verificado |
|---|---|---|---|
| A0 | **Re-autenticar CODEX na VPS** (`codex login`) — claude ✅ FEITO 22/08 (provado: todos os steps 13h30+ saem `via claude`) | a cadeia hoje pula claude→(codex morto)→kimi | SQL: claude ok, codex falhou 11h13–12h13 |
| A1 | **COMPRA-TESTE REAL de $49** em ozvor.com/ai-audit (+ refund depois) | price criado e env setada 22/08 13h56 (deploy SUCCESS); só dinheiro real prova os 5 elos: price ativo · redeploy · redirect+self-heal · webhook assinado · deliverable+e-mail | env presente, 0 orders no banco |
| A2 | Cupom `AIAUDIT15` → `STRIPE_COUPON_AIAUDIT15` | 15% do assinante na aba | — |
| A3 | **3 envs do Telegram no serviço `api`** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`) + `setWebhook` | botão ✅/❌ funciona | SQL: 0 aprovações por botão |
| A4 | **`SIGNAL_ENGINE_URL` + `_API_KEY`** (api + worker) | `sphere-reddit` + aba "Where to show up" ligam | Railway: envs ausentes |
| A5 | **Stripe:** criar price $49 (`STRIPE_PRICE_ID_AI_AUDIT`) | checkout do $49 | — |
| A6 | **Stripe:** criar cupom 15% (`AIAUDIT15`) + `STRIPE_COUPON_AIAUDIT15` | desconto do assinante na aba | — |
| A7 | **`SIGNAL_ENGINE_PROVISIONING_KEY`** no api | provisionar tenant por marca (aba per-brand) | pré-req: #498 no repo do SE |
| A8 | **Rotacionar a chave do operator do Hermes** (#301) | cockpit CEO→VP→job deixa de ser cego | — |
| A9 | **Aposentar o produtor legado de vídeo/thread do X na VPS** | para a duplicação sem portão | live switch |

### Já feito, confirmado no banco
- ✅ **#488** — CHECK do nurture com as 9 sequências · ✅ **#489** — custo por tenant
- ✅ **#463** — `ai_tool` (12 tools, verified=FALSE) · ✅ **#478** — `ai_audit_order` (21/08: mergeados por autorização direta; o CHECK-regression do #478 foi removido antes do merge)
- ✅ **#500** — fix do incidente de starvation (18–20/08) mergeado + deployado + recuperação verificada por SQL
- ✅ **22/08 (varredura + consertos):** #505 fallback claude→codex→kimi (provado ao vivo) · #506 dois 500 do dashboard (credits/prime) · #508 diagnóstico do Telegram · #509/#510 lembrete de aprovação por bot · #511 X thread→tweet 1 · #512 CTA $49 em 6 páginas + /resources índice + noindex · #513 **atribuição UTM/from** no /test e /ai-audit (admin mostra origem) · #514 **métricas de harvest alinhadas + vigia externo de liveness (R9) + kimi no blog + zumbis**
- ✅ **PROVADO EM PRODUÇÃO 22/08:** 7 primeiras aprovações por botão do Telegram (bot próprio) · 2 publicações no LinkedIn · `GET /api/v1/agent-org/liveness` respondendo · claude primário de volta · operator key 200
- ✅ **#504** — api auto-registra o webhook do Telegram no boot (zero cliques jamais chegaram) · ✅ **#505** — cadeia de fallback claude→codex→kimi (outage #2, 26h, verificado ao vivo: kimi carregando) · ✅ **#506** — 500 em /billing/credits (tipos $2) e /prime/status (brand→brands), validados com PREPARE na produção

---

## B. Decisões suas (mudam o que o cliente vê)
- **B5 (NOVA, urgente-ish)** — **IG/TikTok/YouTube não publicam**: as esferas produzem roteiro/legenda em TEXTO e os canais exigem vídeo/imagem (Postiz recusa: "No video/images selected"). 0 publicações na história desses 3 canais. Opções: **(a)** paliativo — trocar `publish` por `report` nessas 3 esferas até o pipeline Remotion existir (para de queimar aprovação em falha certa, S) ou **(b)** manter e conviver com a falha diária. **Recomendo (a).** O fix real (nó de render Remotion → URL pública → Postiz) é L, pós-terça.
- **B3 (com cenário concreto)** — válvula 6 vs 7: na segunda, se você aprovar o experimento do dream antes das 14h, o sphere-youtube é pulado pela válvula. Subir para 7 = 1 env.
- **B0 (nova, do #502)** — o `/dashboard-v3` ao vivo **não tem** o AppLegalStrip nem o CaliforniaBanner (decisão documentada no layout que conflita com a exigência CCPA do strip). Manter assim ou repor o strip? (teste marcado `test.fixme` até você decidir)
- **B1** — Pacote de créditos: **$13** (fórmula `overagePackUsd`) ou **$20** (docs/memória)?
- **B2** — Agency: **10 marcas** (`PricingPlans.tsx`) ou **15** (`docs/PRODUCTS.md`)?
- **B3** — Válvula `SPHERE_MAX_DAILY_APPROVALS`: **6** (default) com **7** grafos de marketing gated — sobe para 7 ou aceita o rodízio?
- **B4** — Google Ads Transparency (#498): provedor licenciado OU adiar? (não há API oficial; scraping proibido)

---

## C. Engenharia — fila (o que dá para fazer sem o founder)
- **C1** — Coletores **Meta Ad Library** + **Google** no repo do Signal Engine (spec pronta em #498; roda no repo do founder, precisa do SE no ar).
- **C2** — **Provisionamento de tenant por marca** — lado Ozvor: `provisioning.ts` + `provider_keys` (migração em PR do founder) quando o `POST /tenants` do #498 existir.
- ✅ **C3 — CTA do AI Audit FEITO (#512)** nas 6 páginas restantes + /resources (era 404) — todas verificadas 200 com o CTA. Restam apenas páginas legais e /support, deliberadamente sem CTA. ~~C3 antigo~~ (`/compare`, `/learn`, `/research`, `/results`, `/vs`, `/welcome`, `/blog/watch`, legais, `/support`).
- ✅ **C4 — E2E honesto (#146/#170) — FEITO (#502, 21/08).** Causa do falso-verde: `continue-on-error: true` no nível do job. Os 15 vermelhos do webkit-mobile eram um **bug real**: a CSP emitia `upgrade-insecure-requests` também em localhost e o WebKit matava todo o JS — corrigido (CSP de produção intacta). Chromium agora BLOQUEANTE + alarme Telegram; webkit-mobile não-bloqueante explícito. Local: 15 failed → **0 failed / 48 passed**. Tornar required = 1 comando do founder (no corpo do #502), após alguns dias estável.
- **C5** — **webkit-mobile** (Safari mobile) real na E2E noturna (#170).
- **C6** — Limpeza do **tier fantasma `starter`** (PLAN_LIMITS + cockpit + CHECK de migração → PR do founder).
- **C7** — Vídeo com apresentador (HeyGen → Remotion, digital twin — apresentador a criar).
- **C8** — **CX como grafo** (inbox → triagem → resposta com SLA) — não começou; CX hoje é o founder.
- **C9** — Migrar o resto do n8n para cron VPS (teto 2.5k exec/mês; só o Incident Watch saiu).
- ✅ **C10 — Vigia externo de liveness FEITO (#514)**: rota pública `/api/v1/agent-org/liveness` + workflow cron `*/30` que grita no Telegram e falha vermelho se o tick sumir >30min ou runs travarem >90min. Verificado ao vivo em produção.

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
