# Signal Engine × Ozvor — integração (spec)

> **TL;DR** — O founder tem um segundo produto, **reddit-signal-infrastructure**
> (repo privado, Python/FastAPI, ~250 arquivos, deploy Railway): um *Signal
> Engine* multi-tenant que coleta conversas reais (Reddit oficial, YouTube, X,
> Google Places, e Meta/TikTok só via provedor licenciado), prova origem num
> evidence ledger (FK obrigatória, quotes validadas por hash), classifica com
> LLM (que nunca gera número), e — a peça que interessa aqui — **produz uma
> fila "onde agir" para SEO/GEO/PPC**: `/tenants/{id}/action-queue`,
> `/me/opportunities`, `/me/google-visibility`, `/tenants/{id}/ai-citations`,
> `/kpis`, mais bibliotecas de anúncios (Reddit Ad Library via Apify; Meta Ad
> Library / Google Ads Transparency / TikTok Ad Library com schema pronto).
> Filosofia idêntica à nossa (dado real, honesto, humano publica, compliance por
> fonte). **Decisão: não reescrever em TS — acoplar como serviço**, em duas
> camadas: (1) sinal para os NOSSOS grafos de conteúdo/PPC; (2) o PRODUTO —
> "onde estão as SUAS oportunidades e o que fazer para ser GEO-rankeado". Este
> doc é a spec; a construção segue em PRs pequenos.

## 1. O que o Signal Engine já entrega (verificado no código, 17/08)

| Peça | Arquivo | O que faz | Serve para |
|---|---|---|---|
| Fila de oportunidades | `app/services/opportunities.py` | Para cada keyword rastreada, olha o SERP real (DataForSEO) e decide: nenhuma thread Reddit rankeia → **publique na sua comunidade hoje**; rankeia forte → **comente nela** (citável por IA, precisa karma); rankeia fraca (11–20) → **dispute com thread própria**; é você → **defenda**. Zero estimativa; sem snapshot = "sem dado". | Produto (o que o cliente faz) + nossos grafos (onde a Ozvor mesma publica) |
| Fila de ação (Tipo A) | `app/services/actions.py` | Score determinístico (severidade, confiança, risco, tipo, engajamento) sobre insights com evidência; `GET /tenants/{id}/action-queue`, `PATCH /action-items/{id}` | Ambos |
| Motor SEO/GEO | `app/services/seo.py` | Snapshots SERP, `audit_ai_citations` (SerpApi só AI Overview + Perplexity oficial; ChatGPT/Gemini manual com screenshot), GSC, KPIs, indexação, status de threads | Produto (mede resultado das ações) |
| Visibilidade Google da peça | `app/services/google_visibility.py` | "A thread onde estamos aparece no Google?" por título, com teto de custo (aprendeu com vazamento de $76) | Produto |
| Anúncios (PPC) | `connectors/apify_ads.py`, `app/services/ads_probe.py`, `ads_economics.py`, `ads_scenario.py`, `ads_run.py` | Biblioteca de anúncios do Reddit (o que o concorrente roda; `postUrl` + `destinationUrl` com UTMs = estrutura de campanha sem inferência); economia e cenários de mídia | Nossos grafos PPC + produto (benchmark do cliente) |
| Meta / TikTok | `connectors/meta.py`, `connectors/tiktok.py`, `licensed_provider.py` | Só via provedor licenciado; conector **recusa scraping**. Meta Ad Library / Google Ads Transparency / TikTok Ad Library: schema pronto, coletor a plugar (`docs/EXPANSION-PROJECT.md §3`) | Produto (quando o provedor entrar) |
| Compliance por fonte | `connectors/compliance.py` | Cada fonte declara `legal_basis` (official_api / licensed_provider / reseller_api / third_party_scraper com rótulo de proveniência) | Regra de casa nos dois produtos |
| Conteúdo | `content_gen.py`, `comment_ideas.py`, `angles.py`, `writing_rules.py`, `planned_comments.py`, `content_ledger.py`, `freshness.py` | Ideias de comentário/post por thread, ângulos, regras de escrita, ledger no-repeat | Nossos grafos (célula Reddit) |
| MCP | `app/mcp_server.py` (`POST /mcp`) | Ferramentas para agentes de IA do cliente | Fase 2 do nosso #150 |
| Portal + tenant API | `app/static/portal.html`, `POST /tenants`, API key por tenant, RLS `app.tenant_id` | Multi-tenant pronto | Um tenant por cliente Ozvor |

Princípios inegociáveis lá (README): dados reais, insight sem evidência é impossível por construção, URLs nunca saem do LLM, quotes validadas por hash, credenciais criptografadas por tenant, base legal por fonte. **São os nossos princípios.**

## 2. A integração — duas camadas, um contrato

### Camada 1 — Sinal para a Ozvor (nossos grafos)
Um tenant `ozvor` no Signal Engine, com keywords GEO/AI-search e subreddits do nicho. O que ele devolve alimenta:

- **`signal` nodes das esferas** (X, LinkedIn, IG, TikTok, YT, blog, vídeo): hoje o prompt "collect-signals" pede ao LLM que *imagine* sinais. Passa a receber um bloco `[__signals__]` com **conversas reais** (top threads/comentários por keyword, com URL de evidência) vindo de `/tenants/ozvor/insights` + `/me/opportunities`. O briefing cita fonte real; o crítico de compliance vê a URL.
- **`sphere-ppc`** (read-only, terça): recebe `/me/ads` (o que concorrentes rodam no Reddit; Meta/Google quando o coletor entrar) e `ads_economics` → os 3 anúncios saem ancorados em anúncios reais + cenários de custo, não em suposição.
- **`sphere-reddit`** (nova célula, gated): opportunities → briefing (qual thread, qual ação: publicar na comunidade própria / comentar / disputar) → draft (via `comment_ideas` + `writing_rules`) → crítico (compliance + "parece anúncio") → **approval** → publish (**manual pelo founder** no 1º momento — o Signal Engine é explícito: humanos publicam; registramos no `content_ledger`) → wait 72h → harvest (`google_visibility` da peça + `ai_citations`) → verdict. Métrica: `reddit_visibility`.
- **CDO/CPO/discovery**: `/kpis` e `/ai-citations` entram no snapshot `outcomes` como métrica de resultado GEO.

### Camada 2 — Produto: "onde estão as suas oportunidades e o que fazer"
Nova aba no dashboard-v3: **"Where to show up"** (nome final com você). Por marca:
1. **Provisionar** um tenant no Signal Engine (`POST /tenants` com `TENANT_PROVISIONING_KEY`, chave guardada no vault do cliente Ozvor) com as keywords do prompt-portfolio da marca + concorrentes + país. Chave por tenant fica em `provider_keys` (já criptografado) — nunca no front.
2. **Mostrar** a fila `/me/opportunities` traduzida em action cards do "Do next": *"Reddit não rankeia para 'best dentist in Austin': crie um post na sua comunidade hoje (sem gate)"* · *"r/austin já rankeia #3: comente nesta thread — precisa 50 karma"* · *"você rankeia #7 para X: defenda com resposta atualizada"*. Cada card com URL de evidência e a **ação exata**.
3. **Medir** de volta: `/me/google-visibility` + `/tenants/{id}/ai-citations` alimentam o score de **Execution** e um novo painel "GEO result" (posição Google da peça, citação em AI Overview/Perplexity, ChatGPT/Gemini registro manual). É o mesmo laço fechado dos nossos grafos, agora para o cliente.
4. **PPC do cliente**: `/me/ads` → "o que os seus concorrentes anunciam no Reddit (e onde)" + cenário de custo — read-only, indicação, nunca gasto.
5. **Plano**: Free = 3 oportunidades (teaser) · Growth = fila completa 1 marca · Agency = 10 marcas · **OrganicPosts = nós executamos a fila** (é literalmente o DFY). AI Audit $49 ganha uma seção "where to show up" no full.

### Contrato técnico
- Ozvor → Signal Engine: HTTPS com `Authorization: Bearer <tenant api key>`; cliente TS `packages/signal-engine/client.ts` (fetch + zod dos payloads; timeouts; fail-open com "sem dado", nunca inventa).
- Env: `SIGNAL_ENGINE_URL` (`https://<app>.up.railway.app`), `SIGNAL_ENGINE_PROVISIONING_KEY` (só no api, para criar tenants), tenant keys no `provider_keys` por marca (provider `signal_engine`).
- Cache: Redis 6h por endpoint/tenant (as filas são diárias lá).
- Honestidade: todo card mostra `checked_at` e a URL de evidência; "sem dado" é estado de UI, não zero.
- Compliance: herdamos `legal_basis` por fonte e mostramos a origem ("Reddit, API oficial"). Meta/TikTok só quando o provedor licenciado estiver plugado — até lá, o painel diz "ainda não coletamos Meta".

## 3. Bibliotecas de anúncios e fontes — o que entra e como
| Fonte | Acesso | Estado no Signal Engine | Uso na Ozvor |
|---|---|---|---|
| Reddit Ad Library | pública via Apify (pay-per-event, ~$0,50/sem/cliente) | ✅ coletor pronto | PPC (nosso e do cliente) |
| Meta Ad Library | API oficial pública (transparência; Graph API com app + token) | schema pronto, coletor a fazer | PPC benchmark do cliente + nosso |
| Google Ads Transparency | público oficial | schema pronto, coletor a fazer | idem |
| TikTok Ad Library | público oficial | schema pronto, coletor a fazer | idem |
| Reddit (conversa) | API oficial (PRAW) | ✅ | sinal + oportunidades |
| YouTube / X | API oficial (X paga) | ✅ | sinal |
| Google Places reviews | oficial (~5/local) | ✅ | Ozvor Pages (já usamos) |
| DataForSEO SERP | reseller API | ✅ (já usamos na auditoria) | oportunidades + resultado |
| GSC | oficial (cliente autoriza) | ✅ | resultado |
| AI citations | SerpApi só AI Overview + Perplexity oficial | ✅ | resultado GEO |
| Meta/TikTok conversa | só provedor licenciado | conector recusa scraping | quando houver provedor |

## 4. Ordem de construção (PRs pequenos, cada um verde e honesto)
1. `packages/signal-engine` cliente TS + zod + testes (fake server) — sem UI.
2. Worker: nó `signal` das esferas lê `[__signals__]` do Signal Engine (tenant ozvor) com fallback ao prompt atual quando o serviço não responde ("SEM SINAL EXTERNO", nunca inventa).
3. `sphere-ppc` recebe `/me/ads`.
4. `sphere-reddit` (nova célula, publish manual + content_ledger).
5. Produto: provisionamento por marca + aba "Where to show up" (fila → action cards) + painel de resultado.
6. Coletores Meta Ad Library / Google Ads Transparency no Signal Engine (repo dele; PR lá).
7. MCP: expor as ferramentas do Signal Engine no nosso MCP (#150 fase 2).

## 5. O que precisa do founder
- URL do Signal Engine em produção + `TENANT_PROVISIONING_KEY` (env no api da Ozvor).
- Confirmar que a Ozvor será um tenant do Signal Engine (e o nome do tenant).
- Meta Ad Library: criar o app na Meta e o token (é o único caminho oficial).
- Decidir o nome da aba do produto e o gate por plano acima.

*Fonte: clone raso do repo em 17/08/2026 (commit `058ae35`), README, EXPANSION-PROJECT.md, código dos serviços/conectores citados.*
