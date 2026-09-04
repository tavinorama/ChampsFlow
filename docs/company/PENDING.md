# OZvor — TUDO que falta (lista mestra v3)

**Refeita:** 2026-08-24 · **v4 em 2026-09-02** — 4 auditorias paralelas (produto/código · ops/segurança · agent-org/conteúdo · negócio/legal/docs) somadas à lista; Bloco 10 e CORREÇÕES no fim · verificada por SQL de produção, HTTP público, `origin/main`, Railway, GitHub Actions **e o raio-X da VPS** (hermes-task-server.mjs 293 linhas + ozvor-video-job.mjs + crontab).
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
| 0.7 | ~~Campanha AI Stack~~ 🟢 **CRIADA via API 01/09** (`campaign_id 3888686`, DRAFTED/pausada, 3 e-mails, 1º sem link validado por assert; jobs determinísticos no Actions com secret `SMARTLEAD_API_KEY`) — ativar + importar leads = founder | 👤 | S | ✅ |
| 0.9 | **ANÁLISE SMARTLEAD (01/09, via API)**: 4 campanhas, TODAS DRAFTED, zero enviados — **7.881 leads já na conta**: Ozvor 1 = 5.454 (mista, classificar) · OZ-B Local services = 1.866 (ICP GEO) · OZ-A Agencies = 489 · OZ-C SaaS/ecom = 72. Lead-finder (2k créditos/mês) = só via UI. **Mês 1 dos 30k e-mails ~coberto sem Apify** | ⚙️ ✅ | — | 🟢 gravado |
| 0.10 | ~~Classificar Ozvor 1~~ 🟢 feito 01/09 via API (keywords, ambíguo fica): **1.254 leads AISTACK-claras movidas para a campanha 3888686** (Ozvor 1: 5.454→4.200; total 7.881 constante = zero duplicata, confirmado por dedupe) · 🔴 resta gastar os **2k créditos** do lead-finder (UI) na trilha AISTACK | ⚙️✅+👤 | S | 🟡 metade |
| 0.8 | **Anti-genérico permanente**: críticos recebem as últimas N publicações do canal e vetam repetição de ângulo/gancho/estrutura; genericidade = veto; ciclo verificar→criar→aplicar→auditar em TODA publicação, TODA plataforma (alcance, views, integrações, participação) | ⚙️ | M | 🟡 EM CONSTRUÇÃO 01/09 (a metade "auditar→aprender" já existe: harvest/verdict/memória/tuner — as migrações #531/#537 ligam) |

> **Checklist do dia do disparo (1ª campanha real):** 1º e-mail SEM nenhum link (regra 27/08; deliverability) · links `?from=` só do 2º e-mail em diante · webhook por campanha (se o global não cobrir) · correlação do 1º toque é por e-mail do lead.

## BLOCO 1 — VÍDEO AUTOMÁTICO *(reescrito 24/08 após o raio-X da VPS)*

> **Realidade corrigida:** o pipeline legado (`/video-job` → `ozvor-video-job.mjs`: roteiro claude→kimi→codex, render Pexels/Remotion, Postiz **com mídia**) **está vivo e publicou HOJE 14:04 em IG+TikTok+YT (3×200)**. Os canais nunca estiveram mortos — só os GRAFOS nunca publicaram neles. As métricas `instagramstandalone_*`/`youtube_*` colhidas vêm dessas publicações. **O único defeito real: publica SEM portão do founder** — a única exceção viva à regra "nada publica sem aprovação". Item 1.7 muda de "aposentar" para "**absorver**".

| # | O que | Dono | Esf. | Estado |
|---|---|---|---|---|
| 1.1 | ~~D-vídeo~~ ⚖️ **DECIDIDO 01/09 pelo founder: ACEITO** — o pipeline legado de vídeo (VPS, Pexels+Remotion → IG/TikTok/YT diário) segue publicando SEM portão como **exceção documentada e temporária** à regra "nada publica sem aprovação", até a Fase 1 do gate (spec #523) ser aplicada na VPS. Esta linha é o registro da exceção. | ⚖️ | — | 🟢 decidido |
| 1.2 | **Onde o n8n chama `/video-job`** (qual workflow; tem aprovação antes?) | 👤 | S | 🔴 pendente de resposta |
| 1.3 | **Fase 1 — gate por injeção de roteiro** (🟡 spec PRONTA e mergeada: `docs/specs/video-gate-fase1.md`, #523; falta founder aplicar o patch na VPS + responder o grep dos PROMPTS): `/video-job` repassa body→env (`VIDEOJOB_SCRIPT/FORMAT/CHANNELS`) e o job usa o roteiro recebido em vez do `claudeJSON` (~15 linhas na VPS) → grafo produz → founder aprova → worker chama com o roteiro aprovado | ⚙️+👤(aplicar na VPS) | S–M | 🔴 |
| 1.4 | Fase 2 — porta `hermes.render()` no worker + reverter o report-only (#516) nas 3 esferas | ⚙️ | M | depois de 1.3 |
| 1.5 | ⚖️ 1 vídeo/dia para os 3 canais (como o legado) ou 1 por canal (3 renders)? E qual grafo alimenta o roteiro | ⚖️ | 5 min | 🔴 |
| 1.6 | **IG com IMAGEM já** (independente de vídeo) — 🟡 engenharia PRONTA (PR feat/ig-image): sphere-instagram virou célula de CARD (PNG brandado renderizado por código do `[CARD HOOK]` aprovado + legenda), pipeline padrão (aprovação mostra hook+legenda → publish com `image[]` → válvula/circuit/retry). **DESLIGADO até:** (1) founder aplicar `docs/specs/ig-image-fase1.md` na VPS (`/postiz-schedule` aceita `image[]` inline base64 → upload ao Postiz), (2) env `IG_IMAGE_PUBLISH=1` no worker E no api. Sem isso: report-only com o card+legenda prontos. Caminho de mídia: sem endpoint de upload no Hermes, URL pública não verificável → inline (opção c). | 👤(aplicar patch VPS + env) | 15 min | 🟡 |
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
| 5.A.2 | ~~Grafo de follow-up~~ 🟢 em produção (#561, 38 testes; scan */30 registrado no worker 18h34): reply → intenção → rascunho EN validado por código → SEU portão no Telegram → envio pela API do SmartLead (falha nunca re-tenta). **Envio automático OFF até `SMARTLEAD_API_KEY` no Railway worker** (até lá: rascunho aprovado chega para colar) | L |
| 5.A.3 | Lead scoring alimentando a fila do /admin | M |
| 5.A.4 | Pós-call: transcrição → resumo → proposta → follow-up | L |
| 5.A.5 | Battle cards vivas (o agente existe, nunca virou rotina) | M |

### 5.B CX — hoje 100% founder
| 5.B.1 | CX como grafo (inbox → triagem → rascunho SLA → portão → resposta) — o 5.A.2 já é o molde: mesmo padrão scan→intenção→rascunho→portão | L |
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
| 5.D.4 | Gate de deploy: 🟢 smoke pós-deploy em produção (#562: 4 endpoints vitais 4 min após cada push na main, grita no Telegram) · 🔴 E2E required = 1 comando do founder (6.5) | M |

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


---

## BLOCO 10 — VARREDURA 01-02/09 (4 auditorias paralelas, só evidência com path:line)

> Itens NOVOS (não estavam na lista). Fontes: Sweep A produto/código · B ops/segurança · C agent-org/conteúdo · D negócio/legal/docs. Estado inicial 🔴 salvo indicação.

### 10.A — Produto & honestidade (promessa × entrega)
| # | O que | Dono | Esf. |
|---|---|---|---|
| 10.A.1 | **Chatbot vende plano que não existe**: Growth "250-prompt audits" (real 33), Agency "15 marcas, $36.60/marca" (real 10) — prompt fixo em `routes/chat.ts:80-81,133`; derivar de PLAN_LIMITS | ⚙️ | S |
| 10.A.2 | **"15 marcas" vivo no site**: `agencies/page.tsx:94`, `local-pages/page.tsx:100,233` (real: 10) — não é só PRODUCTS.md (corrige 8.6) | ⚙️ | S |
| 10.A.3 | "Priority support · 4h SLA" (pricing/agencies/faq/chat) × `/support` "1 business day"; PrimeTab "Chat with SLA" borrado — decidir UMA promessa e alinhar | ⚖️+⚙️ | S |
| 10.A.4 | "Client approval workflow" vendido (pricing, agencies, kit, chat) sem código (0 ocorrências) — construir ou retirar | ⚖️+⚙️ | M |
| 10.A.5 | Pages $99 anunciado "InStock" (JSON-LD + hero) com checkout OFF por env `STRIPE_PRICE_ID_PAGES` — setar env ou marcar indisponível | 👤 | S |
| 10.A.6 | Metadata do /pricing e preços anuais/founder hardcoded (`pricing/page.tsx:33,37`, `PricingPlans.tsx:122-138`) — derivar de `pricing.ts` | ⚙️ | S |
| 10.A.7 | Tier fantasma `starter` em mais lugares que 3.1 lista: `pricing.ts:77`, admin tile `:3626`, CHECK da migração 20260613 aceita 'starter' e 'pro' | ⚙️ | S |
| 10.A.8 | Deletes otimistas engolindo erro no dashboard-v3 (API key "revogada" pode seguir viva; `page.tsx:1618,1834,1994,2093`) | ⚙️ | S |
| 10.A.9 | Tabelas escritas e nunca lidas: `ccpa_requests` (**pedido CCPA cai no vazio**), `landing_events`, `waitlist`; mortas: `source_registry`, `workspaces` | ⚙️ | S |
| 10.A.10 | Índices: `ops.agent_step (status, started_at)` e `(node, status, started_at)`; `crm_contact (updated_at)` | ⚙️ | S |
| 10.A.11 | **Sitemap omite 9 rotas** vivas; **robots deixa indexáveis** `/admin`, `/dashboard-v3`, `/ai-audit/<token>`, `/r/<token>`; páginas de token sem `noindex` | ⚙️ | S |
| 10.A.12 | Env duplicado/sem fallback: `FRONTEND_URL` (social-accounts) vs `WEB_ORIGIN` (26 pontos); `HERMES_TASK_URL` 3×; `EMAIL_FROM` vs `RESEND_FROM_ADDRESS`; confirmar caixas `dpo@`/`privacy@`/`noreply@` | ⚙️+👤 | S |
| 10.A.13 | Dívida de testes honesta: 58 pulados sem DB (não 42) + 12 E2E `fixme` + 24 arquivos que testam texto-fonte; headers "TODO stub" stale nos providers LLM; `rls-client.ts` do worker com 10× `any`; analytics nunca ligado em `cookieConsent.ts` (raiz do 3.4) | ⚙️ | M |
| 10.A.14 | Promessas de roadmap públicas (custom domain, code export em /local-pages) sem item; posts de vídeo com `youtubeId PLACEHOLDER` | ⚖️ | S |

### 10.B — Ops, infra, segurança
| # | O que | Dono | Esf. |
|---|---|---|---|
| 10.B.1 | **Backup NÃO EXISTE** (0 jobs) e o DPIA R5 afirma "S3 a cada 6h" — decidir Supabase PITR vs pg_dump e corrigir o DPIA (corrige 6.8) | ⚖️👤+⚙️ | M |
| 10.B.2 | `deploy.yml` morto (environments/serviços inexistentes) = único rollback automatizado não roda — apagar ou reescrever | ⚙️ | S |
| 10.B.3 | **Smoke pós-deploy não detecta deploy falhado com imagem velha servindo** (sem check de versão/SHA), não cobre worker, `/healthz`, hostname público — corrige 5.D.4 (🟡, não 🟢) | ⚙️ | S |
| 10.B.4 | Vigia sem vigia: `agent-org-liveness` (*/30), `link-crawl` (sem Telegram), E2E noturno — sem absence-watch; padrão do blog só para o blog | ⚙️ | S |
| 10.B.5 | **Worker sem health check, `restartPolicyMaxRetries: 5` → fica morto**; sem validação de env no boot; `REDIS_URL` default localhost; API `maxRetries: 3` idem | ⚙️ | S |
| 10.B.6 | **VPS = executor único** (claude→codex→kimi no mesmo host); sem probe de reachability; silêncio do harvest não detectado; scripts/crontab da VPS não versionados no repo; sem runbook de restart | ⚙️+👤 | M |
| 10.B.7 | **Conteúdo pendente de aprovação vive só no Redis** (TTL 7d, persistência desconhecida) — perda = `approved-content-lost` em massa; persistir artefato no Postgres na fronteira store/approval | ⚙️ | M |
| 10.B.8 | **Telegram = canal único** de toda aprovação E todo alarme; sem fallback (Resend existe); token lido no boot; compare não constant-time em `telegram.ts:100` | ⚙️ | M |
| 10.B.9 | Rotas públicas sem rate limit: `POST /api/kit/checkout`, `/api/pages/checkout`, `…/deliver` (custo LLM); limiters `.catch(()=>true)` fail-open sem log em landing-public/agency | ⚙️ | S |
| 10.B.10 | `smartlead_event`: **PII sem RLS, sem grants, sem retenção, fora do `check-rls.sql`**; check-rls não cobre 11 tabelas — derivar lista de `pg_tables` | ⚙️ | S |
| 10.B.11 | Retenção inexistente: `smartlead_event` (~0.5M linhas/ano a 30k e-mails/mês), `ops.agent_step`, `api_spend`, `landing_events`, `lead_capture` — job mensal + ROPA | ⚙️+⚖️ | S |
| 10.B.12 | Rotação: runbook cobre 6 de ~17 segredos; **tabela de rotação vazia (nunca rotacionou nada)**; runbooks citam `docs/07-deploy.md` inexistente — 6.1/6.2 são L, não S | 👤+⚙️ | L |
| 10.B.13 | `WEB_ORIGIN` opcional → CORS com credentials cai em localhost em produção; `ccpa.ts` engole falta de RESEND | ⚙️ | S |
| 10.B.14 | Sem request/correlation id; tenant/user id crus no log HTTP | ⚙️ | S |
| 10.B.15 | Filas do worker sem alarme (audits, nurture, publish, landing, drift); Stripe/SmartLead/Resend falhas só em log; liveness "vivo ≠ funcionando" (tick carimba mesmo com 100% de nós falhando) — expor `last_tick_failures`/`circuit_open` | ⚙️ | M |
| 10.B.16 | `operating-system.md` descreve proteção de branch que não é a real; lista de required checks não está em lugar nenhum; **6.5 como está quebraria PRs** (E2E tem `paths:` filter) | ⚙️ | S |
| 10.B.17 | Migrações aplicam no boot de api+worker (`migrate.js`): o portão real é o merge — docs/PENDING que dizem "founder aplica" estão errados (5.F.1/5.F.2/5.F.7 corrigidos: aplicadas 01/09) | ⚙️ docs | S |

### 10.C — Agent org & conteúdo (loop de autonomia)
| # | O que | Dono | Esf. |
|---|---|---|---|
| 10.C.1 | **`publishedToday` ignora `publish-a/publish-b`** → o par A/B fura o cap de 2/dia do LinkedIn (`graph-tick.ts:1648`) | ⚙️ | S |
| 10.C.2 | **Veredito A/B compara janelas agregadas do canal, não variantes** (`readHarvest` LIKE-sum) — vencedor = efeito do dia da semana; corrige 5.F.4 | ⚙️ | M |
| 10.C.3 | **Memória do sphere-linkedin cega a rejeições** (prefixo `linkedin_` vs métrica `linkedinpage_`; só sphere-x funciona); `blog_`/`reddit_` sem escritor | ⚙️ | S |
| 10.C.4 | `daily-video` colhe `youtube_views` do vídeo LEGADO como resultado do post de LinkedIn — aprendizado contaminado | ⚙️ | S |
| 10.C.5 | **Override do tuner apaga guardas**: só `LESSONS_VETO_RULE` é reanexada; ENGLISH_FIRST, ANTI_GENERIC_DRAFT_RULE, copy rules e contrato de saída somem (`graph-prompts.ts:1244-1251`) — corrige 5.F.2 | ⚙️ | S |
| 10.C.6 | **prospect-batch e follow-up fora do anti-genérico/[__recent__]/[__lessons__]** (owner sales não recebe injeção); `blog-generate.py` = 2ª implementação (drift; "British English"; sem regra 15-17/≤12 palavras) | ⚙️ | S |
| 10.C.7 | **Blog announce no LinkedIn+X via `/publish-async` SEM portão, sem crítico, sem válvula, fora de `ops.agent_step`** (`blog-autopublish.yml:148-158`) — corrige 1.1 ("única exceção" é falso) | ⚙️ | S |
| 10.C.8 | Brief de 5ª do sphere-blog não alimenta o autopublish de 2ª (THEME só manual) | ⚙️ | M |
| 10.C.9 | Sem guard de em-dash por código no publish dos grafos; finalize/synthesize sem "≤12 palavras"; "sonho honesto" e "fonte inline" ausentes dos drafts (tabela por prompt na Sweep C) | ⚙️ | S |
| 10.C.10 | Memória newest-wins sem acumulação (mês N+1 apaga N); lições de incidente não chegam à consolidação/tuner; tuner sem medição de efeito nem auto-rollback | ⚙️ | M |
| 10.C.11 | Watchdog/CPO/discovery propõem no vazio (sem ledger de propostas, dedupe, "agiu?") | ⚙️ | M |
| 10.C.12 | LinkedIn cap-2 com atraso permanente de 1 dia quando há extras; `content-experiment` e `ab-brief` hardcoded no LinkedIn | ⚙️ | S |
| 10.C.13 | Timeout de aprovação em massa (3 esferas/dia) vira postmortem + treina tuner/memória com a ausência do founder; `FOLLOWUP_BATCH_CAP` é por scan (5/30min = 240/dia) | ⚙️ | S |
| 10.C.14 | **Ruído no Telegram ~150-200 msgs/semana** (só ~15% aprovações); sem modo digest; após Fase 2 do vídeo a válvula 6 estoura (decisão "6 vs 7" está no STATE, não no Bloco 8) | ⚙️+⚖️ | M |
| 10.C.15 | Loop de vendas sem veredito: taxa de resposta nunca vira `agent_outcome`; `metricLike` com `_` sem escape (wildcard SQL) | ⚙️ | S |
| 10.C.16 | Fase 2 do vídeo exige payload de publish com mídia (`hermes.publish` só {channel, post}) — 1.4 subestima; vigias de vídeo não veem IG/TikTok/YT após Fase 2 (1.8); STATE R7: legado também posta thread no X sem portão (verificar `grep twitter /root/ozvor-video-job.mjs`) | ⚙️+👤 | M |
| 10.C.17 | **prospect-batch v1: 1º lote (02/09, aprovado 08h10) rendeu 0 e-mails extraídos de site** → o motor "engine sugere + raspa site" não escala; migrar a fonte para SmartLead lead-finder/Apify (5.A.6) | ⚙️ | M |

### 10.D — Negócio, legal, docs
| # | O que | Dono | Esf. |
|---|---|---|---|
| 10.D.1 | **CAN-SPAM: cold emails sem endereço físico nem opt-out** (kit, campanha 3888686, validador, follow-up) — decidir opt-out textual ("reply STOP") + linha de endereço em TODOS; adicionar ao validador de código ANTES do GO | ⚖️+⚙️ | S 🔴 |
| 10.D.2 | **SmartLead não é sub-processador registrado** (ROPA, `/legal/sub-processors`, privacy); guarda texto de replies desde 10/08 | ⚖️ | S |
| 10.D.3 | prospect-batch = nova atividade ROPA (raspa sites, grava e-mails) + LIA + **geofence US em código** (hoje só no prompt) | ⚖️+⚙️ | M |
| 10.D.4 | Follow-up manda resposta do prospect para claude→codex→**kimi/Moonshot** (sem DPA/transferência) e para o Telegram — **viola GEO-D7** ("zero PII de cliente no Telegram") | ⚖️+⚙️ | S |
| 10.D.5 | Reciclagem infinita sem regra de retenção de `crm_contact` (N ciclos ou 12 meses → apagar) + ROPA; dossiê no ROPA; DSR export/erasure cobrindo `crm_contact`/`smartlead_event` | ⚖️+⚙️ | M |
| 10.D.6 | **Kit da trilha GEO não existe** (só aistack); `first-week-playbook §4` anterior às regras; ICP-2 fora do `icp.md` canônico; battle cards paradas em 02/07 e sem AI Stack; objeções só GEO | ⚙️ | M |
| 10.D.7 | **Reembolso do $49 prometido no e-mail 2 sem lastro** em `/refund`/ToS §4; `hello@` vs `support@` para refund; recibos/faturas dos one-time (Stripe receipts ou `invoice_creation`) | ⚖️+⚙️ | S |
| 10.D.8 | SLA de reply inexistente: portão do follow-up com 96h = reply quente pode morrer calado — timeout curto + escalação | ⚙️ | S |
| 10.D.9 | SOPs faltando como docs: checklist do dia do disparo, carga SmartLead trilha GEO, "2k créditos antes de Apify", reciclagem (quem baixa o CSV), uso do dossiê | ⚙️ | S |
| 10.D.10 | **STATE files todos desatualizados** (company diz "$49 dá 503", produto congelado em 06/11, sales/CX/finance/legal/marketing/engineering em launch-week ou Q2 "Organic Posts"); CLAUDE.md meta stale | ⚙️ | M |
| 10.D.11 | PRODUCTS.md/COST-MODEL.md: faltam Pages $99, pack de créditos, AIAUDIT15, cupom de retenção, custos medidos por `api_spend`; **5.C.4 usa premissa impossível (25 marcas; limite é 10)**; vendor/cost tracker vazio | ⚙️+⚖️ | S |
| 10.D.12 | KB de suporte sem $49/Pages/créditos/chat; ferramenta de suporte "TBD" desde 08/07; link-crawl nunca rodado sobre os 38 e-mails de nurture | ⚙️ | S |
| 10.D.13 | Conselho de compliance: **#526, #547, #561 sem veredito no gate-log**; Gate 7 nunca emitido (regra 3 violada desde julho) | ⚖️ | S |
| 10.D.14 | Cookie Policy não cobre o sessionStorage de atribuição (#527); privacy "90 dias" × ROPA G16 "12 meses"; representante Art.27 "not designated" na privacy vs decisão "eu mesmo" | ⚖️ | S |
| 10.D.15 | AI risk assessment sem a exceção do vídeo (1.1) nem marcação Art. 50(4) dos vídeos | ⚖️ | S |
| 10.D.16 | AGENTS.md: migrações classificadas MEDIUM/auto-merge (regra da casa = nunca); "Hermes approval" vs auto-merge; convenção clone-em-/tmp não documentada; WORKFLOW 18 vs 40 agentes; 12 docs "TrustIndex"; Approval Queue "not planned" vs 5.E.2 | ⚙️ | S |
| 10.D.17 | Órfãos do legal STATE: trademark Ozvor BR/EU/US, DPA contra-assinado, counsel externo pré-venda EU/BR, `dpo@` routing, GEO-D1..D5, EV-1..9; 7.3 mal especificado (11 DPAs já aceitos; faltam 7 NOT ASSESSED + SmartLead/Kimi/Apify/GitHub) | ⚖️👤 | M |

### CORREÇÕES à lista (o que estava ERRADO)
- **1.1** "única exceção viva" → falso: o blog announce (LinkedIn+X) publica sem portão (10.C.7); legado pode postar thread no X (10.C.16).
- **5.F.1/5.F.2/5.F.7** "DESLIGADA até founder aplicar migração" → migrações aplicadas 01/09 (boot aplica; portão real = merge). Estado: ON, primeiras execuções tuner 08/09 e memória 01/10.
- **5.F.4** "válvula respeitada / vencedor por código" → cap não conta o par (10.C.1) e o veredito é agregado (10.C.2).
- **5.F.2** "allowlist dura" → override apaga guardas (10.C.5).
- **5.D.4** smoke 🟢 → 🟡 (10.B.3).
- **6.8** "nunca exercitado" → backup NÃO EXISTE (10.B.1).
- **6.1/6.2** S/M → L (10.B.12).
- **6.5** "1 comando" → precisa mudar o workflow antes (10.B.16).
- **7.5** "feito" → defasado por #547/#561/reciclagem/dossiê/SmartLead (10.D.2-5).
- **7.3** → 11 DPAs já aceitos; escopo real em 10.D.17.
- **8.6** → número errado está em produção e no chatbot, não só no PRODUCTS.md (10.A.1/2).
- **2.8** "engenharia concluída" → sitemap/robots/noindex pendentes (10.A.11).
- **0.7** campanha "criada e validada" → copy não cumpre CAN-SPAM (10.D.1) — **corrigir antes de ativar**.
- **Bloco 0 "fechado"** → 0.5 segue 🟡 e 10.D.1 bloqueia o disparo.
- **5.C.4** premissa de 25 marcas inválida (10.D.11).
- **5.E.2** contradiz STATE ("not planned") — decidir.
- **Contagem "42 testes pulados"** → 58 + 12 fixme + 2 (10.A.13).

**Apêndice 02/09:** classificação Ozvor 1 concluída (1.254 → aistack, zero duplicata) · 1º lote prospect-batch rodou e foi aprovado (0 e-mails úteis → 10.C.17) · postmortem-scan 2º dia quieto · sphere-reddit 1º brief (SEM DADO, envs 4.1) · bug de créditos (107.900) corrigido no banco + fix #566 · migrações #531/#537 aplicadas (memória+tuner ON).

---

## BLOCO 11 — PROGRAMA CLOSED-LOOP (relatório de auditoria de 03/09, no repo em `RELATORIO-AUDITORIA-COMPLETA-OZVOR.md`)

> **Veredito do relatório: NO-GO para ESCALAR aquisição.** Vender em modo fundador/concierge, volume baixo, acompanhamento manual, até os P0 fecharem. As campanhas já ativas continuam — o que está proibido é AUMENTAR volume/tráfego pago.
> Sequência obrigatória (do próprio plano): **Parte I (P0 visibilidade) → Parte II (dois funis/catálogo) → Parte III (Signal Intelligence)**. Nada da II ou III começa antes da I fechar.

### 11.A — Parte I, Gate 1 (P0 de 48h)
| # | Item | Estado | Onde |
|---|---|---|---|
| 11.A.1 | P0-01 impedir "All caught up" falso | 🟢 **fechado**: política central única em `packages/llm/src/delivery-policy.ts` (invariante do §3.1 → `DELIVERY_LOOP_BROKEN`), alvo de visibilidade configurável (`OZVOR_VISIBILITY_TARGET`, default documentado 50). Violação abre card de investigação no worker, derruba o indicador `do_next_invariant` do Delivery Health e faz o dashboard mostrar a frase honesta. Fail-soft do #574 deixou de ser silencioso | #574 · **este PR** |
| 11.A.2 | P0-02 atividade ≠ execução verificada | 🟡 código pronto; **desligado** até a migração | #587 · migração #586 👤 |
| 11.A.3 | P0-03 promessas vazias (Radar, Prime/OrganicPosts, 3/3 vs 5) | 🟢 | #589 |
| 11.A.4 | P0-04 vazamento editorial (lint pré-publicação) | 🟢 código · ⚠️ **o post já publicado é ação do founder** (runbook `docs/departments/marketing/p0-04-linkedin-leak-runbook.md`; ninguém abriu o LinkedIn — não sabemos se ainda está no ar) | #589 |
| 11.A.5 | P0-05 trust registry dos comparativos | 🟢 estrutura + páginas congeladas · ⚠️ **todos os claims nascem `stale`, fonte nula** — ninguém abriu página de concorrente | #589 |
| 11.A.6 | P0-10 responsividade | 🟢 320–1440px · **o relatório errou o alvo**: 390px não reproduziu; a faixa real era 768px (navbar com min-width 970px) · ⚠️ **dashboard logado nunca foi medido** (307 → /login) | #589 |

### 11.B — Parte I, Gate 2 (P0 de 7 dias)
| # | Item | Estado |
|---|---|---|
| 11.B.1 | P0-06 Prompt Universe v2 | 🟡 código pronto, **opt-in por marca**; desligado até migração #585 👤 |
| 11.B.2 | P0-07 Gap Classifier + Action Generator com evidência | 🟢 **fechado**: `packages/llm/src/gap-classifier.ts` traz o `NormalizedObservation` completo (§5.1), as 7 categorias da tabela §5.3, o objeto `VisibilityAction` (§5.2) e o guarda de especificidade que RECUSA template genérico — os 5 templates fotografados no §3.1 têm teste. O worker classifica cada resposta e reescreve a card com hipótese, evidência, owner, artefato/canal, critério de aceite e data da próxima rechecagem |
| 11.B.3 | P0-08 geração hospedada (fim do BYOK obrigatório) | 🔴 **NÃO FEITO** — é o item que mais dói para SMB: a auditoria não produz rascunho sem chave do cliente |
| 11.B.4 | P0-09 Delivery Health + tenant canário | 🔴 **NÃO FEITO** — o System Health continua medindo infraestrutura, não entrega |

### 11.C — Parte I, Gate 3 (P1, 30 dias)
Measurement v2 completo (7 métricas separadas) · Entity Registry + falso-positivo (a IA confunde a marca com medicamentos) · GSC/GA/GBP operacionais (null ≠ zero) · UX Now/Change/Why/Do/Proof · crawler de SEO em CI · diff de contradições legais para counsel · reconciliação de pacotes/entitlements (10 vs 15 marcas, 9 Kits vs 2 no analytics). **Nenhum iniciado.**

### 11.D — Partes II e III
Parte II (dois funis, catálogo versionado, AI Ops de 7 dimensões, Command Center, US$10k MRR scorecard) e Parte III (Signal Intelligence: CI, compliance registry, S2S, API v1, outbox, Opportunity contract) — **não iniciadas por decisão de sequência**. Reddit fica `compliance_state=blocked` para uso comercial até haver contrato (P0 legal duro da Parte III).

### 11.E — Decisões do founder
| # | Decisão | Estado |
|---|---|---|
| 11.E.1 | Execution % passa a mostrar o número verificado | ✅ **SIM** (03/09) |
| 11.E.2 | Trocar prompts padrão, aceitando quebra rotulada da tendência | ✅ **SIM** (03/09) |
| 11.E.3 | 10 ou 15 marcas no Agency (copy × limite real) | ⏳ pendente |
| 11.E.4 | Guardião do custo da geração hospedada: contagem de audits ou créditos | ⏳ pendente |
| 11.E.5 | Manter `strict` na proteção da main (branch atualizada antes de mergear) | ⏳ pendente — recomendo MANTER |
| 11.E.6 | Aplicar o universo de prompts a TODAS as marcas ou só à Ozvor | ⏳ pendente — hoje só a Ozvor |
