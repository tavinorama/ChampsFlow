# Signal Engine — coletores Meta/Google + provisionamento por marca (spec de build)

**Escopo:** o lado PRODUTOR, no repo `reddit-signal-infrastructure` (FastAPI/Railway). O lado consumidor já está pronto na Ozvor: `sphere-reddit` (PR #496) consome a fila `[__signals__]`, e a aba **"Where to show up"** (PR #497) mostra `/me/opportunities` por marca com estado honesto de "ainda não conectado". Esta spec detalha as três peças que ligam essas duas telas com dados reais.

> **Regra que atravessa tudo:** o Signal Engine é o repo do founder. Esta é uma spec para PRs *lá*, não uma reescrita. Nada de scraping onde a fonte proíbe; toda fonte carrega `legal_basis` e a Ozvor mostra a origem. "Sem dado" é estado, nunca zero fabricado.

---

## 0. Onde encaixa (recapitulação de 1 parágrafo)

Hoje o Signal Engine já entrega `/me/opportunities`, `/me/ads` (Reddit Ad Library), `/tenants/{id}/action-queue|insights|ai-citations|kpis`. Faltam três coisas para a Ozvor sair da "fila global do tenant ozvor" e virar "a fila DA marca do cliente, com benchmark de anúncios Meta/Google": **(A)** coletor Meta Ad Library, **(B)** coletor/importador Google Ads Transparency, **(C)** provisionamento de um tenant por marca do cliente. A ordem importa: **C destrava o produto** (a aba passa a ser por-marca); A e B enriquecem o PPC benchmark. Faça **C primeiro**.

---

## 1. (C) Provisionamento de tenant por marca — FAÇA PRIMEIRO

É o que faz a aba #497 deixar de mostrar a fila global e passar a mostrar a fila da marca. A aba já carrega `brandId` no contrato; só falta o mapa marca → tenant.

### Contrato (Signal Engine expõe)
- **`POST /tenants`** — cria/idempotentemente-retorna um tenant.
  - Auth: `Authorization: Bearer <PROVISIONING_KEY>` (chave separada, só a Ozvor-api tem; **nunca** no front, nunca no worker de conteúdo).
  - Body: `{ external_ref, name, country, keywords[], competitors[], subreddits?[] }`.
    - `external_ref` = o `brand_id` da Ozvor (idempotência: mesmo `external_ref` → mesmo tenant, nunca duplica).
    - `keywords` = o prompt-portfolio da marca (as queries que já rodamos na auditoria) + termos do nicho.
    - `competitors` = os concorrentes já cadastrados na marca.
  - Resposta: `{ tenant_id, api_key, status: "provisioning"|"ready" }`. A `api_key` é **por tenant** e só serve para GET read-only daquele tenant.
- **`GET /tenants/{id}`** — status do provisionamento (as filas lá são diárias; o primeiro snapshot leva até 24h → o tenant nasce `provisioning`, a aba mostra "radar ligando").
- **`PATCH /tenants/{id}`** — atualizar keywords/competitors quando a marca muda (a Ozvor reprovisiona no save de settings da marca).
- **`DELETE /tenants/{id}`** (soft) — quando a marca é removida ou o plano cai. LGPD/GDPR: apagar keywords é apagar dado do cliente.

### Lado Ozvor (PR separado, neste repo, depois que o contrato existir)
1. Migração: nada novo — reusar `provider_keys` (já criptografado). Provider `signal_engine`, escopo por `brand_id`, guarda `{ tenant_id, api_key }`. **Migração em PR próprio, merge do founder** (regra da casa).
2. Serviço `apps/api/src/lib/signals/provisioning.ts`: `ensureTenant(brandId)` → lê `provider_keys`; se não existe, chama `POST /tenants` com `SIGNAL_ENGINE_PROVISIONING_KEY`, grava a resposta. Idempotente. Fail-open: se o Signal Engine não responde, a aba fica "não conectado" (já é o comportamento de #497).
3. Gatilhos: no primeiro acesso à aba por marca (lazy), e no save de settings da marca (reprovisiona keywords). Nunca em massa.
4. A aba #497 troca `opportunities()` (fila global) por `actionQueue(tenantId)` quando `provider_keys` tem a chave da marca — **sem mudança de contrato do front** (o agente que construiu já deixou o `brandId` passando).

### Envs do founder
- `SIGNAL_ENGINE_PROVISIONING_KEY` no serviço **api** (além de `SIGNAL_ENGINE_URL` + `SIGNAL_ENGINE_API_KEY` que ligam sphere-reddit e a fila global).

### Gate por plano (na Ozvor, não no Signal Engine)
Free = 3 oportunidades (teaser) · Growth = fila completa 1 marca · Agency = 10 marcas · OrganicPosts = nós executamos a fila (é o DFY). A seção "where to show up" do AI Audit $49 full usa a fila global (sem provisionar).

---

## 2. (A) Coletor Meta Ad Library

### O caminho oficial (o único que a spec permite)
- **Endpoint:** Graph API `GET /{version}/ads_archive` (`https://graph.facebook.com/v21.0/ads_archive`), com `access_token` de um app Meta.
- **Params-chave:** `search_terms` (ou `search_page_ids`), `ad_reached_countries` (obrigatório), `ad_active_status` (`ACTIVE`/`ALL`), `ad_type`, `fields` (`page_name, ad_creation_time, ad_delivery_start_time, ad_snapshot_url, ad_creative_bodies, publisher_platforms, impressions, spend, currency, target_locations` — os campos de impressão/gasto só vêm para anúncios de tema social/eleitoral).
- **A nuance que decide o escopo:** historicamente a Ad Library API só expunha anúncios **políticos/de tema social** na maioria das regiões. Sob a **DSA da UE**, **todos** os anúncios que atingem a UE ficam acessíveis. Então: para benchmark de PPC de SMB (não-político), o alcance confiável hoje é **anúncios com alcance na UE**; fora da UE, a cobertura de anúncios comerciais é limitada. **Diga isso na UI** — a aba PPC mostra "Meta: cobertura UE (DSA); fora da UE, parcial", não finge cobertura total.
- **Rate limit:** o app tem cota; colete por `page_id` dos concorrentes conhecidos (mais barato e preciso que `search_terms` amplo), diariamente, com backoff.
- **Compliance:** `legal_basis = "Meta Ad Library API (official, DSA/transparency)"`. Sem scraping do site; sem login de usuário. O `ad_snapshot_url` é público — guarde a URL, não rehospede o criativo.

### Schema (o repo já tem o schema pronto, per a spec de integração)
Mapear para a mesma tabela `ads` que o Reddit Ad Library usa: `{ source: "meta", advertiser, first_seen, last_seen, platforms[], creative_text, snapshot_url, countries[], est_spend_range?, legal_basis }`. `/me/ads` passa a devolver Reddit + Meta unificados; a Ozvor já renderiza a lista (só ganha um selo de fonte).

### Env do founder
- App Meta + `META_AD_LIBRARY_TOKEN`. É o único caminho oficial (a spec de integração já lista isso como pendência do founder).

---

## 3. (B) Google Ads Transparency — honestidade primeiro

- **Não há API oficial pública** para o Ads Transparency Center do Google. É uma superfície web.
- **Portanto, o conector NÃO faz scraping do Transparency Center** (ToS + fragilidade). Duas saídas honestas:
  1. **Provedor licenciado** (o mesmo tipo de acordo pay-per-event que o Reddit Ad Library usa hoje via Apify, se houver um actor/loja que exponha o Transparency Center sob licença) — trata como fonte paga, com `legal_basis` do provedor.
  2. **Adiar** e a UI diz "Google: ainda não coletamos" (o mesmo padrão honesto de Meta/TikTok antes do provedor). **Melhor adiar do que scraping.**
- Schema idêntico ao de Meta (`source: "google"`), então quando a fonte existir é só ligar. `/me/ads` continua unificado.
- **Decisão do founder:** existe provedor licenciado aceitável para o Transparency Center? Se não, B fica "adiado honesto" e o benchmark de PPC é Reddit + Meta(UE).

---

## 4. Ordem de PRs (cada um verde e honesto, no repo do Signal Engine)
1. **`POST/GET/PATCH/DELETE /tenants`** (provisionamento idempotente por `external_ref`). ← destrava o produto.
2. Ozvor: `provisioning.ts` + `provider_keys` (migração em PR do founder) + a aba troca para `actionQueue(tenantId)`. ← neste repo.
3. **Coletor Meta Ad Library** (por `page_id`, diário, cobertura UE honesta) → `/me/ads` unificado.
4. **Google Transparency**: provedor licenciado OU "adiado honesto".
5. (já feito na Ozvor) sphere-reddit + aba consomem tudo isso assim que as envs existirem.

## 5. O que precisa do founder (fechado)
- `SIGNAL_ENGINE_PROVISIONING_KEY` no api da Ozvor (além de URL + API_KEY).
- App Meta + `META_AD_LIBRARY_TOKEN`.
- Decisão sobre Google Transparency: provedor licenciado ou adiar.
- Confirmar o nome/limites do tenant por marca (external_ref = brand_id) e o gate por plano da §1.

---

*Complementa `docs/signal-engine-integration.md` (a spec macro). Fonte: contrato verificado do Signal Engine (client TS `packages/llm/src/signal-engine.ts`, commit do repo `058ae35`) + o consumidor já mergeado (sphere-reddit #496, aba "Where to show up" #497). Onde a fonte externa é incerta (cobertura Meta fora da UE, ausência de API Google), está dito explicitamente — não presuma cobertura que a fonte não dá.*
