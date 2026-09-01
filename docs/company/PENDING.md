# OZvor — TUDO que falta (lista mestra v3)

**Refeita:** 2026-08-24 · **atualizada 2026-08-27, 13h (Lisboa)** — Bloco 0 fechado com compra real · verificada por SQL de produção, HTTP público, `origin/main`, Railway, GitHub Actions **e o raio-X da VPS** (hermes-task-server.mjs 293 linhas + ozvor-video-job.mjs + crontab).
**Escopo:** absolutamente tudo — da primeira venda à **autonomia 100% com memória e auto-melhoria**.

> **Como ler.** Dono: 👤 founder · ⚙️ engenharia · ⚖️ decisão. Esforço: S ≤2h · M ≤2 dias · L >2 dias. Estado = *funcionando em produção*, nunca "mergeado".
> **R0 permanente:** dependência de migração/env/serviço externo ausente = feature reportada DESLIGADA, com a ação nominal que destrava.

---

## BLOCO 0 — PRIMEIRA VENDA

| # | O que | Dono | Esf. | Estado |
|---|---|---|---|---|
| 0.1 | Compra-teste real de $49 — prova os 5 elos que só dinheiro prova | 👤 | S | 🟢 **PROVADO 27/08**: 11h15 checkout → 11h18 pago+entregue no mesmo minuto → e-mail com resultado → 2 nurtures; cupom de teste 100% desativado |
| 0.2 | Cupom `AIAUDIT15` no Stripe (env já setada) | 👤 | S | 🟢 confirmado pelo founder 27/08 |
| 0.3 | Links de campanha `?from=`/`utm_*` (/test, /ai-audit, /book) | 👤 | S | 🟢 #513 + **bug real achado no teste de fogo e corrigido no mesmo dia (#527)**: a origem se perdia quando o lead navegava antes de comprar; agora first-touch em sessionStorage, capturado em qualquer página pública |
| 0.4 | Webhook SmartLead | 👤 | S | 🟢 **registrado GLOBAL e provado fim-a-fim 27/08** (Test → `smartlead_event` → CRM `contacted` em 1s). Warm-up é por caixa, sem campanha — webhook por campanha entra no checklist do dia do disparo |
| 0.5 | Dry-run: e-mail → clique → lead com origem no admin | 👤 | S | 🟡 teste de fogo provou clique→lead→compra; a ORIGEM falhou (era o bug do 0.3) — re-teste de 2 min após o deploy do #527: abrir `/ai-audit?from=x` numa aba anônima, navegar, voltar e conferir no admin |

### NOVO 01/09 — diretivas do founder
| # | O que | Dono | Esf. | Estado |
|---|---|---|---|---|
| 0.6 | **Dois ICPs separados-e-conectados** (GEO tool + AI Stack $49): `prospect-batch` alimenta as DUAS trilhas; cada lote separa por produto | ⚙️ | S–M | 🟡 EM CONSTRUÇÃO 01/09 |
| 0.7 | **Campanha SmartLead do AI Stack**: kit pronto (`docs/departments/sales/aistack-campaign-kit.md` — ICP-2 + 3 e-mails EN nos padrões + passos de carga); founder cria a campanha no SmartLead com o 1º lote | 👤 (kit ⚙️ ✅) | S | 🟡 kit entregue; carga é sua |
| 0.8 | **Anti-genérico permanente**: críticos recebem as últimas N publicações do canal e vetam repetição de ângulo/gancho/estrutura; genericidade = veto; ciclo verificar→criar→aplicar→auditar em TODA publicação, TODA plataforma (alcance, views, integrações, participação) | ⚙️ | M | 🟡 EM CONSTRUÇÃO 01/09 (a metade "auditar→aprender" já existe: harvest/verdict/memória/tuner — as migrações #531/#537 ligam) |

> **Checklist do dia do disparo (1ª campanha real):** 1º e-mail SEM nenhum link (regra 27/08; deliverability) · links `?from=` só do 2º e-mail em diante · webhook por campanha (se o global não cobrir) · correlação do 1º toque é por e-mail do lead.

## BLOCO 1 — VÍDEO AUTOMÁTICO *(reescrito 24/08 após o raio-X da VPS)*

> **Realidade corrigida:** o pipeline legado (`/video-job` → `ozvor-video-job.mjs`: roteiro claude→kimi→codex, render Pexels/Remotion, Postiz **com mídia**) **está vivo e publicou HOJE 14:04 em IG+TikTok+YT (3×200)**. Os canais nunca estiveram mortos — só os GRAFOS nunca publicaram neles. As métricas `instagramstandalone_*`/`youtube_*` colhidas vêm dessas publicações. **O único defeito real: publica SEM portão do founder** — a única exceção viva à regra "nada publica sem aprovação". Item 1.7 muda de "aposentar" para "**absorver**".

| # | O que | Dono | Esf. | Estado |
|---|---|---|---|---|
| 1.1 | ⚖️ **D-vídeo**: até o gate existir — (a) aceitar o legado sem portão como exceção DOCUMENTADA (status quo, recomendado) ou (b) pausar o disparo (canais mudos) | ⚖️ | 5 min | 🔴 decide o resto |
| 1.2 | **Onde o n8n chama `/video-job`** (qual workflow; tem aprovação antes?) | 👤 | S | 🔴 pendente de resposta |
| 1.3 | **Fase 1 — gate por injeção de roteiro** (🟡 spec PRONTA e mergeada: `docs/specs/video-gate-fase1.md`, #523; falta founder aplicar o patch na VPS + responder o grep dos PROMPTS): `/video-job` repassa body→env (`VIDEOJOB_SCRIPT/FORMAT/CHANNELS`) e o job usa o roteiro recebido em vez do `claudeJSON` (~15 linhas na VPS) → grafo produz → founder aprova → worker chama com o roteiro aprovado | ⚙️+👤(aplicar na VPS) | S–M | 🔴 |
| 1.4 | Fase 2 — porta `hermes.render()` no worker + reverter o report-only (#516) nas 3 esferas | ⚙️ | M | depois de 1.3 |
| 1.5 | ⚖️ 1 vídeo/dia para os 3 canais (como o legado) ou 1 por canal (3 renders)? E qual grafo alimenta o roteiro | ⚖️ | 5 min | 🔴 |
| 1.6 | **IG com IMAGEM já** (independente de vídeo): `/postiz-schedule` aceita `image[]`; card brandado via `renderCardPng` existe — religar sphere-instagram com card + legenda | ⚙️(+patch VPS mínimo) | S–M | 🔴 ganho rápido |
| 1.7 | HeyGen → Remotion (apresentador digital) | 👤+⚙️ | L | 🔴 |
| 1.8 | Alinhar o vigia `check-video-posted.sh` (15:20) ao desenho final | ⚙️ | S | 🔴 |

## BLOCO 2 — CONTEÚDO E CANAIS

| # | O que | Dono | Esf. | Estado |
|---|---|---|---|---|
| 2.1 | **Coletor LinkedIn morto** no `ozvor-social-harvest.mjs` (1 linha na vida; IG/X/YT gravam) — diagnóstico: `grep -in linkedin` no script | 👤+⚙️ | S–M | 🔴 loop cego no LinkedIn |
| 2.2 | Coletor TikTok inexistente (o legado POSTA no TikTok; ninguém colhe) | 👤+⚙️ | M | 🔴 |
| 2.3 | Thread real no X via Postiz (o server aceita thread com image no 1º item!) — hoje publicamos só o tweet 1 | ⚙️ | M | 🟡 paliativo #511 |
| 2.4 | sphere-reddit: 1º brief real (qua 08:00) — depende das envs 4.1 | ⚙️ | — | 🟡 |
| 2.5 | Canais de citação #118–#123 (GSC, Bing, GA4, Reddit, LinkedIn company, GBP) | 👤 | M | 🔴 |
| 2.6 | Revisar calendário editorial com 1 semana de dados | ⚙️ | S | 🟡 |
| 2.7 | **Skill claude-seo ADOTADA (27/08)** — instalada no Mac (runtime ok, Python 3.12 via `CLAUDE_SEO_PYTHON`), 1ª análise GEO de ozvor.com feita: **63/100** | ⚙️ | — | 🟢 |
| 2.8 | GEO do nosso site | ⚙️ | S–M | 🟢 engenharia concluída (#534 regras+llms.txt · #545 BlogPosting; 'fontes no /research' era falso positivo — página já cita tudo). Resta SÓ a decisão da byline de Person (founder) |
| 2.9 | /seo drift + audit mensais | ⚙️ | S | 🟡 baseline das 5 páginas-chave capturado 01/09; falta só a rotina mensal no calendário |
| 2.10 | ~~Auditoria-de-discovery~~ 🟢 feito (#547): mini-probe automático por prospect no lote semanal + playbook `docs/departments/sales/discovery-audit-playbook.md` (escalação com /seo audit antes de call) | ⚙️+👤 | S | fechado |

## BLOCO 3 — PRODUTO

| # | O que | Dono | Esf. |
|---|---|---|---|
| 3.1 | Tier fantasma `starter` (PLAN_LIMITS + cockpit + CHECK; migração = PR do founder) | ⚙️+👤 | M |
| 3.2 | `/account/integrations` "coming soon" em produto pago | ⚙️ | M |
| 3.3 | OAuth social do cliente (painel é teaser) | 👤+⚙️ | M |
| 3.4 | GA4 + atribuição no produto (MRR/conversão "unknown") | ⚙️+👤 | M |
| 3.5 | "Where to show up" por marca (depende de 4.2) | ⚙️ | M |
| 3.6 | ⚖️ CCPA/AppLegalStrip no /dashboard-v3 (teste em `fixme`) | ⚖️ | S |
| 3.7 | MCP fase 2 (ferramentas do Signal Engine no nosso MCP) | ⚙️ | M |

## BLOCO 4 — SIGNAL ENGINE

| # | O que | Dono | Esf. |
|---|---|---|---|
| 4.1 | `SIGNAL_ENGINE_URL` + `_API_KEY` (api+worker) — fail-open pronto dos 2 lados, liga sozinho | 👤 | S |
| 4.2 | `POST /tenants` no repo do SE + `SIGNAL_ENGINE_PROVISIONING_KEY` (spec #498) | 👤+⚙️ | M |
| 4.3 | Coletor Meta Ad Library (Graph API oficial; app Meta = founder) | ⚙️(repo SE)+👤 | M |
| 4.4 | ⚖️ Google Ads Transparency: provedor licenciado ou adiar | ⚖️ | — |
| 4.5 | Lado Ozvor do provisionamento (`provider_keys`; migração founder) | ⚙️ | M |

## BLOCO 5 — AUTOMAÇÃO COMPLETA (a empresa se operando)

### 5.A Vendas — a maior lacuna para a grana
| # | O que | Esf. |
|---|---|---|
| 5.A.1 | ~~Grafo de prospecção~~ 🟢 código mergeado (#547, 32 testes): lote semanal qua 07h30 — engines sugerem, CÓDIGO verifica site+extrai e-mail, mini-GEO-probe real, 3 e-mails EN com **1º sem link imposto por código**, gate do founder, CRM stage new; máquina nunca envia. 1º lote: qua 02/09 | L |
| 5.A.2 | Grafo de follow-up: resposta → intenção → rascunho → **portão** → envia | L |
| 5.A.3 | Lead scoring alimentando a fila do /admin | M |
| 5.A.4 | Pós-call: transcrição → resumo → proposta → follow-up | L |
| 5.A.5 | Battle cards vivas (o agente existe, nunca virou rotina) | M |

### 5.B CX — hoje 100% founder
| 5.B.1 | CX como grafo (inbox → triagem → rascunho SLA → portão → resposta) | L |
| 5.B.2 | KB viva alimentada por tickets | M |
| 5.B.3 | Alerta de churn/uso | M |
| 5.B.4 | Onboarding guiado | M |

### 5.C Finanças
| 5.C.1 | P&L automático mensal | M |
| 5.C.2 | ~~Alerta de margem por plano~~ 🟢 feito (#524): custo/margem por tenant no snapshot diário do watchdog | M |
| 5.C.3 | Reconciliação Stripe ↔ ledger ↔ custo | M |
| 5.C.4 | ⚖️ Preço com dado medido (Agency lê negativo no modelo) | M |

### 5.D Produto/Engenharia
| 5.D.1 | Loop discovery → spec → build → review (discovery hoje só reporta) | L |
| 5.D.2 | ~~Postmortem AUTOMÁTICO~~ 🟢 feito (#532): grafo diário 07:00 detecta assinaturas por SQL (3+ steps falhados/starved/timeouts em massa), rascunha no formato da casa, gate no Telegram; dia quieto = silêncio auditável | M |
| 5.D.3 | Anti-patterns alimentados por incidentes automaticamente (12 entradas manuais em #521) | S–M |
| 5.D.5 | ~~Apertar limiar~~ 🟢 feito (#539): assinatura 4 `approved-content-lost`, n=1, com a regressão de sábado como teste | S |
| 5.D.6 | ~~Resiliência a pulo de cron~~ 🟢 feito (#539): absence-watch re-dispara o autopublish, com trava anti-dupla-publicação | S |
| 5.D.4 | Gate de deploy (E2E required + smoke pós-deploy) | M |

### 5.E Governança/Orquestração
| 5.E.1 | Buzz/workspace dos agentes (desenhado, zero código; Telegram supre) | L |
| 5.E.2 | Approval Queue web | M |
| 5.E.3 | Grafos de departamento (VP Sales/CX/Finance com rotina própria) | L |
| 5.E.4 | n8n → cron VPS (teto 2.5k/mês; só Incident Watch migrou) | M |
| 5.E.5 | ~~Relatório semanal consolidado~~ 🟢 feito (#525): grafo weekly-report, 1ª edição seg 07h30 UTC | M |

### 5.F — MEMÓRIA E AUTO-MELHORIA *(novo, 24/08 — o pedido de autonomia 100%)*
> O que existe: memória por esfera (outcomes 30–60d + rejeições do founder com o porquê), lift real vs baseline, verdict por run, calendário anti-repetição, anti-patterns/postmortems escritos. **O que falta é fechar o círculo: o sistema aprender SOZINHO com o próprio registro.**

| # | O que | Esf. | O gap exato |
|---|---|---|---|
| 5.F.1 | ~~Consolidação de memória~~ 🟢 código mergeado (#530); **DESLIGADA até o founder mergear+aplicar a migração #531** (`ops.memory_lesson`) | M | fechado no código |
| 5.F.2 | ~~Prompt-tuning gated~~ 🟢 código mergeado (#536, 31 testes): tuner semanal (3ª 06h30) propõe ≤1 mudança com evidência, allowlist dura (nunca approval/publish/self), rollback por linha nova; **OFF até o founder mergear+aplicar a migração #537** (`ops.prompt_override`) | L | fechado no código |
| 5.F.3 | ~~Anti-patterns → críticos~~ 🟢 feito (#525): `[__lessons__]` (CONTENT_LESSONS) injetado nos nós de debate/crítica dos grafos de marketing | S–M | fechado |
| 5.F.4 | ~~Experimentos contínuos~~ 🟢 código em PR (feat/learning-loop, 13 testes): grafo `ab-experiment` semanal (6ª 06h30) — duas variantes/UM eixo declarado, mesmo canal, UMA aprovação combinada (rejeição = cancela o par, nunca variante solitária), válvula respeitada (2ª variante adia; janela deslocada registrada), veredito por CÓDIGO grava vencedor em `agent_outcome` + linha `ab-winner: axis=… variant=… lift=…` que 5.F.1/5.F.2 já leem; liga no deploy do worker, sem env/migração | M | fechado no código |
| 5.F.5 | ~~Cadência auto-ajustada~~ 🟢 código em PR (feat/learning-loop, 10 testes): weekly-report v2 ganha seção de cadência 100% SQL/código (posts/dia vs média por post, 30d, amostra mínima 10) colada VERBATIM no relatório de 2ª; founder aplica via env `CHANNEL_DAILY_CAP_<CANAL>` — **cap nunca muda sozinho (por desenho)**; liga no deploy do worker | M | fechado no código |
| 5.F.6 | ~~Auto-cura ampliada~~ 🟢 código em PR (#540, 18 testes): retry budget 2/node (aprovação/store NUNCA), publish ambíguo pergunta ao founder (silêncio nunca reposta), circuit breaker 3-falhas/canal, alarme 1×/6h; liga no deploy do worker, sem env/migração | M | fechado no código |
| 5.F.7 | ~~Postmortem→código~~ 🟢 código mergeado (#542, 20 testes): aprovar o rascunho do postmortem grava as lições propostas (verbatim, extração por regex) em ops.memory_lesson → watchdog/weekly-report as leem; críticos de marketing seguem com a memória mensal (domínios separados); anti-patterns.md segue 100% humano; perna do store OFF até a migração #531 | M | **BLOCO 5.F INTEIRO EM CÓDIGO 31/08** |

## BLOCO 6 — INFRA, QUALIDADE, SEGURANÇA

| # | O que | Dono | Esf. |
|---|---|---|---|
| 6.1 | Re-rotacionar `OZVOR_OPERATOR_KEY` (transitou por agente 3º em 22/08) | 👤 | S |
| 6.2 | Rotacionar segredos expostos pelo tool do Railway (Stripe live, service_role, LLM) | 👤 | M |
| 6.3 | Bot antigo do Telegram: revogar se o gateway não usar | 👤 | S |
| 6.4 | Codex re-auth na VPS — **pendente de confirmação** (`codex exec "ok"`) | 👤 | S |
| 6.5 | E2E chromium como required check (1 comando, após estabilidade) | 👤 | S |
| 6.6 | webkit-mobile estabilizar e voltar a bloquear (#170) | ⚙️ | M |
| 6.7 | SSH direto do Mac (chave ed25519) — fim dos intermediários | 👤 | S |
| 6.8 | Backup/restore do Postgres testado (nunca exercitado) | 👤+⚙️ | M |
| 6.9 | ~~Simulado de incidente~~ 🟢 drill do runbook "Agent-org freeze" executado ao vivo 27/08 | ⚙️ | S |

## BLOCO 7 — LEGAL

| 7.1 | Encarregado LGPD Art. 41 | 👤 | S |
| 7.2 | GDPR Art. 27 documentado sem nome civil | 👤 | S |
| 7.3 | DPAs com sub-processadores | 👤 | M |
| 7.4 | Gate 7 com veredito registrado | ⚙️ | S |
| 7.5 | ~~DPIA/ROPA atualizados~~ 🟢 feito (#526): G21–G26, SP-15–18, seção 13-GEO, riscos R14/R15; **decisões GEO-D6..D9 continuam com o founder** | ⚙️ | M |

## BLOCO 8 — DECISÕES (⚖️ 5 min cada)

| # | Decisão |
|---|---|
| 8.1 | **D-vídeo** (=1.1): legado sem portão até a Fase 1 — aceitar documentado ou pausar? |
| 8.2 | **1 vídeo/dia p/ 3 canais ou 1 por canal** (=1.5)? E qual grafo alimenta o roteiro |
| 8.3 | CCPA strip no /dashboard-v3 |
| 8.4 | Google Transparency: provedor ou adiar |
| 8.5 | OrganicPosts: checkout self-serve ou manual |
| 8.6 | Docs desatualizados: pack $13 real vs "$20" · Agency 10 real vs "15" (corrigir PRODUCTS.md) |

## BLOCO 9 — AUDITORIAS DE FECHAMENTO

| 9.1 | Promessa × entrega em tudo (#153) | ⚙️ | L |
| 9.2 | RED TEAM: produto, dados, dinheiro, agentes (#157) | ⚙️ | L |
| 9.3 | Revisão pós-primeira-semana de cold outreach (funil real com dados reais) | ⚙️ | M |

---

## APÊNDICE — FEITO E PROVADO (não volta à fila)

**31/08:** **ANEL DE AUTONOMIA INTEIRO EM CÓDIGO NUM DIA** — #536 tuner gated · #539 incidente n=1 + auto-retry blog · #540 auto-cura (retry budget + circuit breaker) · #541 A/B contínuo + cadência medida · #542 incidente→memória · tudo com 2.368 testes verdes; faltam só as migrações #531/#537 (founder) para memória e tuner ligarem. Também: 1º weekly-report entregue 07h50 · cron do blog pulado pelo GitHub, detectado e re-disparado (post citável no ar 13h45) · fim de semana 28-30 100% autônomo.
**27/08:** **BLOCO 0 FECHADO** — funil $49 provado com compra real (lead→pago→entregue no mesmo minuto→e-mail→2 nurtures) · webhook SmartLead global provado fim-a-fim (Test→CRM 1s) · bug de atribuição achado no teste de fogo e corrigido no dia (#527, first-touch sessionStorage) · regra nova: 1º cold email SEM link · anel 2 entregue (#524 custo/tenant, #525 weekly-report+lessons, #526 DPIA/ROPA) · drill do runbook passou ao vivo · 25+ cliques de aprovação acumulados.
**24/08:** blog passou NO CRON (1ª vez; #518) · fim de semana com 0 falhas e 7 publicações · X voltou (#511 provado sáb+seg) · experimento do CDO publicado (ciclo sonho→spawn→aprovação→post) · vigia calibrado (#519, estacionado≠parado) · **válvula de cadência (#520, provada ao vivo: vídeo adiado às 14:10 com 2/2 no LinkedIn)** · postmortems+12 anti-patterns+runbook (#521) · 17 cliques de botão · raio-X completo da VPS (endpoints, mídia no Postiz, video-job vivo com guard ok).
**22/08:** fallback claude→codex→kimi (#505, provado) · 500s credits/prime (#506, PREPARE) · webhook auto-registro + status (#504/#508) · lembretes por bot (#509/#510) · CTAs+/resources (#512) · atribuição UTM (#513) · métricas de harvest + vigia externo (#514) · report-only IG/TikTok/YT (#516) · operator key viva · price $49 setado · bot próprio de aprovações (7 primeiros cliques).
**Antes:** #500 fome do tick · #502 E2E honesto · #486/#488 nurture 9 seqs · #489 custo/tenant · #490 dashboard · #491 CTA site-wide · #463/#478 tabelas $49 · #496/#497 Signal Engine consumidor · #451 MCP · 38 e-mails renderizados · specs (#498).

*Fontes: varreduras 22–24/08 + raio-X da VPS 24/08. Painel vivo: artifact Operating Overview.*
