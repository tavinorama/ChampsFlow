# OZvor — TUDO que falta (lista mestra)

**Refeita do zero:** 2026-08-22, 18h (Lisboa) · **Verificado hoje** por SQL de produção, HTTP público, código em `origin/main`, Railway (deploys; nunca valores de env) e GitHub Actions.
**Escopo desta lista:** absolutamente tudo — da primeira venda até a automação completa da empresa. Nada foi omitido por ser grande ou distante.

> **Como ler.** Cada item tem **dono** (👤 founder · ⚙️ engenharia · ⚖️ decisão), **esforço** (S ≤2h · M ≤2 dias · L > 2 dias), e **estado real** (não "mergeado" — *funcionando em produção*). Um item só sai daqui quando a dependência **existe em produção**.
> **Regra permanente (R0):** feature que depende de migração, env ou serviço externo é reportada **DESLIGADA** até a dependência existir.

---

## BLOCO 0 — O caminho até a PRIMEIRA VENDA (meta: terça 26/08)

| # | O que | Dono | Esf. | Estado / prova |
|---|---|---|---|---|
| **0.1** | **Compra-teste real de $49** em `ozvor.com/ai-audit` (cartão real, reembolsa depois) | 👤 | S | 🔴 **O ITEM.** Price criado e `STRIPE_PRICE_ID_AI_AUDIT` setada 22/08 13h56 (deploy SUCCESS). Só dinheiro real prova os 5 elos: price ativo em live · redeploy pegou a env · redirect + self-heal · webhook assinado · deliverable + e-mail. Banco: 0 pedidos |
| **0.2** | Cupom `AIAUDIT15` (15%) no Stripe + `STRIPE_COUPON_AIAUDIT15` | 👤 | S | 🔴 env já setada; falta o cupom existir no Stripe. Sem ele, só o desconto do assinante falha (0 assinantes hoje = risco nulo) |
| **0.3** | Links das campanhas frias: `ozvor.com/test?from=<campanha>` · `/ai-audit?from=` · `/book?from=` | 👤 | S | 🟢 **pronto para usar** — atribuição UTM/`from` mergeada (#513), origem aparece no `/admin` → Leads & CRM |
| **0.4** | Webhook do SmartLead nas campanhas novas (URL + token) | 👤 | S | 🟡 endpoint provado (2 pings autenticados em 10/08 → `crm_contact`); falta registrar nas campanhas do warm-up |
| **0.5** | Dry-run do funil frio: mandar 1 e-mail para si mesmo → clicar → ver o lead **com origem** no admin | 👤 | S | 🔴 fecha a prova de ponta a ponta antes do disparo real |

**Definição de pronto do Bloco 0:** um lead entra pelo link da campanha, aparece no admin com a origem, e uma compra de $49 chega ao e-mail com o resultado dentro.

---

## BLOCO 1 — VÍDEO AUTOMÁTICO (o pipeline que existe e não está ligado nas esferas)

> **Contexto (22/08, correção de rota):** antes das esferas, os vídeos curtos **eram criados e publicados automaticamente** — Pexels (b-roll) + Remotion (render) + job na VPS. Prova no próprio código: o nó `video-memory` do `daily-video` roda `tail -n 150 /root/vidjob.log` e lê linhas `VIDEO_OK` / `SCRIPTGEN` / `FORMAT` / queries do pexels. As esferas de IG/TikTok/YouTube nasceram só-texto e nunca foram plugadas nesse job — por isso o Postiz recusava ("You need one media") **depois** de o founder gastar o clique de aprovação. Paliativo aplicado (#516): as 3 esferas viraram report-only. **Este bloco desfaz o paliativo e liga o pipeline de verdade.**

| # | O que | Dono | Esf. | Estado / bloqueio |
|---|---|---|---|---|
| **1.1** | **Descobrir onde vive o código do job de vídeo** e seu contrato: `systemctl cat hermes.service \| grep -E "ExecStart\|WorkingDirectory"` → daí listar rotas (`app.get/post`), o handler do `video-job` e como o vídeo chega ao Postiz | 👤 (1 comando) | S | 🔴 **BLOQUEIA 1.2–1.5.** `/root/hermes-work` é só o cwd (dados do SmartLead); o código está noutro caminho |
| **1.2** | Definir o desenho: a esfera chama o job e **o job publica** (caminho curto), ou o job devolve URL e a esfera publica via Postiz com mídia? | ⚖️ | S | depende de 1.1 (se o job já publica, o caminho curto vence) |
| **1.3** | **Nó `render`** no runner: `finalize → render([RENDER BRIEF]) → approval (o founder vê o VÍDEO) → publish com mídia → wait → harvest` | ⚙️ | M | o `[RENDER BRIEF]` já é produzido pelas esferas com contrato fixo (`format/style/captions/music/pace/voice`) |
| **1.4** | Porta `hermes.render()` + payload de publish com mídia (hoje é `{channel, post}`, sem campo de mídia) | ⚙️ | M | |
| **1.5** | **Reverter o report-only (#516)** nas 3 esferas — devolver a cauda `approval → publish → harvest` | ⚙️ | S | ~5 linhas no `shortVideoSphere`; só depois de 1.3/1.4 provados |
| **1.6** | Vídeo com apresentador: HeyGen → Remotion (digital twin do founder) | 👤+⚙️ | L | conta HeyGen é do founder; apresentador a criar |
| **1.7** | Aposentar o produtor legado de vídeo/thread do X na VPS (duplica o grafo, publica sem portão) | 👤 | S | 🔴 live switch; incidente da thread duplicada em 14/08 |

---

## BLOCO 2 — CONTEÚDO E CANAIS (as 14 células)

| # | O que | Dono | Esf. | Estado / prova |
|---|---|---|---|---|
| **2.1** | **Coletor do LinkedIn na VPS parece morto** — `linkedinpage_*` tem **1 linha na vida** (17/08) | 👤+⚙️ | S–M | 🔴 sem ele, o loop de aprendizado do LinkedIn fica cego mesmo com as métricas já corrigidas (#514) |
| **2.2** | **Coletor de TikTok não existe** — nenhuma métrica `tiktok_*` é escrita | 👤+⚙️ | M | 🔴 o harvest fecha "SEM DADO" pela graça de 48h (honesto, mas cego) |
| **2.3** | **Thread real no X** via Postiz (hoje publica só o tweet 1 da thread) | ⚙️ | M | 🟡 paliativo em produção (#511) — nada morre, mas a cauda da thread se perde |
| **2.4** | `sphere-reddit` produzir o 1º brief de verdade (quarta 08:00) | ⚙️ | — | 🟡 depende das envs do Signal Engine (4.1); sem elas sai "SEM DADO" |
| **2.5** | Calendário editorial: revisar após 1 semana de dados reais | ⚙️ | S | 7 dias/semana já implantado |
| **2.6** | Blog: 1º artigo automático publicou 17/08; cadeia agora tem kimi como 4ª tentativa (#514) | ⚙️ | — | 🟢 **feito** · vigia de ausência dispara 1ª vez segunda 15:00 |
| **2.7** | Canais de citação (#118–#123): GSC, Bing/IndexNow, GA4, Reddit, LinkedIn company, Google Business Profile | 👤 | M | 🔴 precisam das contas do founder |

---

## BLOCO 3 — PRODUTO (a plataforma que o cliente usa)

| # | O que | Dono | Esf. | Estado |
|---|---|---|---|---|
| **3.1** | **Tier fantasma `starter`** — vive em `PLAN_LIMITS`, `STRIPE_PRICE_ID_STARTER`, contadores do cockpit (sempre 0) e no CHECK da migração de billing | ⚙️+👤 | M | 🔴 limpeza toca CHECK → migração em PR separado (merge do founder) |
| **3.2** | `/account/integrations` inteira "Coming soon" **dentro de produto pago** | ⚙️ | M | 🔴 |
| **3.3** | Conexões sociais: OAuth não configurado → painel é teaser | 👤+⚙️ | M | 🔴 |
| **3.4** | GA4 + atribuição no produto (MRR/conversão hoje leem "unknown") | ⚙️+👤 | M | 🔴 KR2.2 desde julho; a atribuição do funil (#513) resolveu só a origem do lead |
| **3.5** | Aba "Where to show up" **por marca** (hoje mostra a fila global) | ⚙️ | M | depende de 4.2 (provisionamento) |
| **3.6** | CCPA/AppLegalStrip no `/dashboard-v3` (o teste está `test.fixme` até a decisão) | ⚖️ | S | ver 8.1 |
| **3.7** | MCP fase 2: expor as ferramentas do Signal Engine no nosso MCP | ⚙️ | M | fase 1 mergeada (#451) |

---

## BLOCO 4 — SIGNAL ENGINE (o radar de oportunidades)

| # | O que | Dono | Esf. | Estado |
|---|---|---|---|---|
| **4.1** | **`SIGNAL_ENGINE_URL` + `_API_KEY`** na api e no worker | 👤 | S | 🔴 código fail-open pronto dos dois lados (sphere-reddit + aba do produto) — **liga sozinho** quando as envs existirem |
| **4.2** | `SIGNAL_ENGINE_PROVISIONING_KEY` + `POST /tenants` no repo do Signal Engine (tenant por marca) | 👤+⚙️ | M | 🔴 spec pronta (#498); destrava a aba per-marca |
| **4.3** | Coletor **Meta Ad Library** (Graph API oficial; cobertura UE honesta) | ⚙️ (repo do SE) | M | spec pronta (#498) |
| **4.4** | **Google Ads Transparency**: sem API oficial → provedor licenciado ou adiar | ⚖️ | — | ver 8.4 |
| **4.5** | Lado Ozvor do provisionamento: `provisioning.ts` + `provider_keys` | ⚙️ | M | migração em PR do founder |

---

## BLOCO 5 — AUTOMAÇÃO COMPLETA DA EMPRESA (o que ainda é você)

> Hoje o que roda sozinho é **marketing/conteúdo** (14 grafos) + os cérebros (watchdog, CDO, CPO, discovery). Todo o resto da empresa ainda depende de você. Esta é a fila para a empresa realmente se operar.

### 5.A — Vendas (a maior lacuna para "MUITA GRANA")
| # | O que | Dono | Esf. |
|---|---|---|---|
| **5.A.1** | **Grafo de prospecção**: ICP → lista → enriquecimento → sequência fria → resposta → CRM (hoje: SmartLead manual + webhook) | ⚙️ | L |
| **5.A.2** | **Grafo de follow-up**: lead respondeu → classifica intenção → rascunha resposta → **portão do founder** → envia | ⚙️ | L |
| **5.A.3** | Qualificação automática do lead (score por fit + sinal) alimentando a fila do `/admin` | ⚙️ | M |
| **5.A.4** | Pós-call: transcrição → resumo → proposta → follow-up automático | ⚙️ | L |
| **5.A.5** | Battle cards e objeções vivas (o `sales-researcher` existe como agente, nunca virou rotina) | ⚙️ | M |

### 5.B — CX (hoje 100% você)
| # | O que | Dono | Esf. |
|---|---|---|---|
| **5.B.1** | **CX como grafo**: inbox → triagem → rascunho com SLA → portão → resposta | ⚙️ | L |
| **5.B.2** | Base de conhecimento viva (KB) alimentada pelos tickets reais | ⚙️ | M |
| **5.B.3** | Alerta de churn/uso (cliente parou de auditar → nudge) | ⚙️ | M |
| **5.B.4** | Onboarding guiado do cliente novo (hoje: e-mail + dashboard) | ⚙️ | M |

### 5.C — Finanças
| # | O que | Dono | Esf. |
|---|---|---|---|
| **5.C.1** | P&L automático mensal (o `finance-reporter` existe, nunca virou rotina) | ⚙️ | M |
| **5.C.2** | Alerta de margem por plano usando `api_spend.tenant_id` (já grava, ninguém lê) | ⚙️ | M |
| **5.C.3** | Reconciliação Stripe ↔ ledger ↔ custo real | ⚙️ | M |
| **5.C.4** | Decisão de preço com dado medido (Agency lê negativo no modelo de taxa) | ⚖️+⚙️ | M |

### 5.D — Produto / Engenharia
| # | O que | Dono | Esf. |
|---|---|---|---|
| **5.D.1** | Loop discovery → spec → build → review sem humano no meio (hoje: `weekly-discovery` só reporta) | ⚙️ | L |
| **5.D.2** | Postmortem automático (o `postmortem-agent` existe; os 3 incidentes desta semana foram manuais) | ⚙️ | M |
| **5.D.3** | Anti-patterns alimentados pelos incidentes reais (arquivo existe, atualização é manual) | ⚙️ | S |
| **5.D.4** | Deploy com gate automático de qualidade (E2E required + smoke pós-deploy) | ⚙️ | M |

### 5.E — Governança e orquestração
| # | O que | Dono | Esf. |
|---|---|---|---|
| **5.E.1** | **Buzz / workspace dos agentes** — desenhado, **zero código**; hoje o "buzz" é o Telegram | ⚙️ | L |
| **5.E.2** | Approval Queue web (prometida no operating-cadence, nunca construída; o Telegram supre) | ⚙️ | M |
| **5.E.3** | Grafos de departamento além de marketing (VP Sales, VP CX, VP Finance com rotina própria) | ⚙️ | L |
| **5.E.4** | Migração n8n → cron VPS (teto 2.5k execuções/mês; só o Incident Watch saiu) | ⚙️+👤 | M |
| **5.E.5** | Relatório semanal consolidado ao founder (hoje: eu, manualmente) | ⚙️ | M |

---

## BLOCO 6 — INFRA, QUALIDADE E SEGURANÇA

| # | O que | Dono | Esf. | Estado |
|---|---|---|---|---|
| **6.1** | **Re-rotacionar `OZVOR_OPERATOR_KEY`** — a chave transitou por um agente de terceiros em 22/08 | 👤 | S | 🔴 |
| **6.2** | **Rotacionar os segredos expostos pelo tool de variáveis do Railway** (Stripe live, service_role, chaves de LLM) | 👤 | M | 🔴 o tool devolve valores em texto claro |
| **6.3** | Bot antigo do Telegram: revogar/retirar se o gateway não usar mais | 👤 | S | 🟡 o novo bot de aprovações está isolado e funcionando |
| **6.4** | **Codex re-auth na VPS** (`codex login`) | 👤 | S | 🔴 claude ✅ (provado 13h30+); a cadeia hoje pula claude→(codex morto)→kimi |
| **6.5** | E2E chromium como **required check** | 👤 | S | 🟡 depois de alguns dias estável (#502 tornou o gate honesto) |
| **6.6** | webkit-mobile estabilizar e voltar a bloquear (#170) | ⚙️ | M | 🟡 hoje roda não-bloqueante, explícito |
| **6.7** | SSH direto do Mac para a VPS (chave `ed25519`) — hoje toda operação depende de intermediários | 👤 | S | 🔴 |
| **6.8** | Backup/restore testado do Postgres (nunca exercitado) | 👤+⚙️ | M | 🔴 |
| **6.9** | Runbook de incidente (os 3 desta semana foram improvisados) | ⚙️ | M | 🔴 |

---

## BLOCO 7 — LEGAL E COMPLIANCE

| # | O que | Dono | Esf. | Estado |
|---|---|---|---|---|
| **7.1** | Encarregado LGPD (Art. 41) nomeado formalmente | 👤 | S | 🔴 trava o Gate 7 |
| **7.2** | GDPR Art. 27 documentado sem nome civil (founder reside na UE) | 👤 | S | 🔴 |
| **7.3** | DPAs com sub-processadores assinados | 👤 | M | 🔴 |
| **7.4** | Gate 7 (deploy) com veredito registrado no gate-log | ⚙️ | S | 🔴 |
| **7.5** | DPIA/ROPA atualizados com as capacidades novas (AI Audit, Signal Engine, atribuição) | ⚙️ | M | 🔴 |

---

## BLOCO 8 — DECISÕES PENDENTES (⚖️ 5 min cada)

| # | Decisão | Contexto |
|---|---|---|
| **8.1** | CCPA/AppLegalStrip no `/dashboard-v3`: repor ou manter fora? | teste `test.fixme` esperando; só afeta logados |
| **8.2** | `docs/PRODUCTS.md` desatualizado: pack de créditos **$13** (real) vs "$20"; Agency **10 marcas** (real) vs "15" | o site e o código estão consistentes; só o doc mente |
| **8.3** | Vídeo: a esfera chama o job e **ele publica**, ou devolve URL e nós publicamos? | ver 1.2 — muda o desenho do nó de render |
| **8.4** | Google Ads Transparency: provedor licenciado ou adiar? | sem API oficial; scraping está proibido pela nossa própria regra |
| **8.5** | OrganicPosts: manter fatura manual ou criar checkout self-serve? | hoje 100% manual |

---

## BLOCO 9 — AUDITORIAS DE FECHAMENTO (depois do Bloco 0)

| # | O que | Dono | Esf. |
|---|---|---|---|
| **9.1** | Auditoria geral promessa × entrega em tudo (#153) | ⚙️ | L |
| **9.2** | RED TEAM adversarial: produto, dados, dinheiro, agentes (#157) | ⚙️ | L |

---

## APÊNDICE — JÁ FEITO E PROVADO (para não voltar à fila)

**22/08 — o dia do laço fechado:** #505 cadeia de fallback claude→codex→kimi (provada ao vivo: kimi carregou a manhã) · #506 dois 500 de produção (créditos + Prime, validados com `PREPARE`) · #508 diagnóstico do Telegram + endpoint de status · #509/#510 lembrete de aprovação com trava por bot · #511 X thread → tweet 1 · #512 CTA $49 em 6 páginas + `/resources` (era 404) · #513 **atribuição UTM/`from`** · #514 métricas de harvest alinhadas + **vigia externo de liveness (R9)** + kimi no blog + zumbis · #516 report-only paliativo.
**Provado em produção 22/08:** 7 primeiras aprovações por botão do Telegram (bot próprio) · 2 publicações no LinkedIn · `GET /api/v1/agent-org/liveness` respondendo · claude primário de volta · **operator key viva (200)** · price $49 configurado.
**Antes:** #500 fome do tick + timeout 96h · #502 E2E honesto (bug real de CSP/WebKit) · #486/#488 nurture 0/1/2/2 com 9 sequências (CHECK aplicado) · #489 custo por tenant · #490 dashboard (créditos, AI Audit, Prime, /book) · #491 CTA site-wide · #463/#478 tabelas do $49 · #496 sphere-reddit · #497 aba "Where to show up" · #451 MCP fase 1 · #504 auto-registro do webhook.
**Resolvido por consequência:** válvula 6 vs 7 (B3) — com IG/TikTok/YT sem portão, restam 4 grafos gated contra teto 6.

---

*Fontes desta lista: varredura exaustiva de 22/08 (funil + org + infra) · SQL de produção · HTTP público · `origin/main` file:line · Railway · GitHub Actions. Onde não houve verificação, está escrito. Painel vivo: o artifact Operating Overview.*
