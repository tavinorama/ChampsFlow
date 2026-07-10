# OZvor Local Pages — Landing Builder bidirecional

> Autor: Hermes · Data: 2026-07-09
> Status: Discovery / PRD inicial
> Objetivo: definir uma ferramenta robusta de criação de landing pages locais que se vende sozinha e, ao mesmo tempo, alimenta o core de AI Visibility/GEO do OZvor.

---

## 1. Tese

OZvor Local Pages não deve ser um criador de sites genérico. Deve ser o braço de **execução local** do OZvor:

- O **Landing Builder** cria páginas locais fortes a partir de dados reais do negócio.
- O **OZvor AI Visibility** audita se essas páginas fazem a marca aparecer melhor em AI Search, SEO local e motores de resposta.
- Cada lado vende o outro continuamente.

Flywheel:

```txt
Google Maps / endereço / website / GBP
  → Local Landing Builder
  → página local publicada
  → lead + analytics + schema + conteúdo citável
  → OZvor AI Visibility audit
  → gaps/recomendações
  → novas páginas/ajustes
  → monitoramento/assinatura/Agency/OrganicPosts
```

---

## 2. Referências competitivas analisadas

### Brila — brila.ai

Homepage observada: “AI Website Builder for Local Business via Google Maps”. O fluxo central é colar um link do Google Maps. A promessa é usar reviews do Google Maps, aplicar Jobs To Be Done e gerar copy baseada nos motivos reais pelos quais clientes escolhem o negócio. A página mostra catálogo público com milhares de sites gerados.

Pontos fortes:
- Entrada extremamente simples: Google Maps share link.
- Copy baseada em reviews, não em prompt genérico.
- Posicionamento local muito claro.
- Catálogo/prova social de páginas geradas.

Limites/oportunidade para OZvor:
- Parece focado em “gerar website rápido”.
- Não posiciona fortemente o pós-publicação: AI visibility, antes/depois, monitoramento, concorrentes, plano contínuo.
- OZvor pode ganhar com o ciclo de medição e melhoria.

### Sitely

O domínio informado apresentou erro SSL no acesso automatizado durante a inspeção. Pelo exemplo fornecido pelo founder, a proposta é semelhante: inserir link do Google Maps, importar dados/fotos/avaliações e gerar site rápido para pequeno negócio.

Pontos a copiar/adaptar:
- Time-to-site muito baixo.
- Input por Google Maps link.
- Foco em pequenos negócios.

### Dorik

Página observada: Dorik AI Website Builder. Posicionamento mais amplo: prompt → website completo, no-code editor, CMS, SEO nativo, domínio customizado, analytics, forms, white-label CMS para agências.

Pontos fortes:
- Builder mais completo/robusto.
- Editor no-code.
- CMS, forms, analytics, domínios, white-label para agências.

Limites/oportunidade para OZvor:
- Mais genérico.
- Não é profundamente local/GEO/AI Visibility por padrão.
- OZvor deve combinar robustez de builder com inteligência local e AI search.

---

## 3. Regra crítica: “scraping” Google Maps

Google Maps Platform Terms restringem scraping, cache e rehosting de Google Maps Content. O produto deve evitar scraping ilegal do Google Maps.

Design seguro:

1. Usar **Google Places API / Maps JavaScript API / Business Profile API** quando envolver conteúdo Google.
2. Permitir “colar link do Google Maps” como UX, mas resolver o `place_id` e buscar dados via API oficial.
3. Não armazenar/republicar conteúdo Google além do permitido; manter `place_id` e snapshots mínimos conforme política.
4. Reviews/fotos vindos de Google exigem atribuição e cuidado. Para copy derivada de reviews, a rota mais segura é:
   - cliente conecta/autoriza Google Business Profile; ou
   - cliente importa seus próprios reviews/depoimentos; ou
   - usar reviews apenas como sinais agregados/temporários e gerar copy com aprovação humana, sem rehostar review bruto.
5. Fazer scraping/crawling do **site do próprio cliente** é aceitável com SSRF guard, limites e consentimento.
6. Para concorrentes: usar dados agregados/permitidos via API ou web pública fora do Google, sem copiar reviews/fotos/conteúdo protegido.

---

## 4. Posicionamento

Nome de trabalho:

**OZvor Local Pages**

Promise:

> Turn any local business into an AI-search-ready landing page — then track whether AI and search actually trust it.

PT:

> Crie páginas locais prontas para Google, clientes e IA — e veja se elas realmente melhoram sua visibilidade.

Não competir como “Wix com IA”. Competir como:

> Local landing builder + AI Visibility operating system.

---

## 5. Produto robusto — módulos necessários

### 5.1 Entrada / ingestão de dados

Fontes:

- Google Maps share link → resolver place_id.
- Nome + endereço + categoria.
- Website atual do cliente.
- Google Business Profile OAuth, fase posterior.
- Upload/import manual de reviews/depoimentos.
- Fotos do cliente.
- GSC/GA4, quando disponível.
- Dados do audit OZvor: prompts, concorrentes, gaps, fontes citadas.

Dados extraídos:

- Nome, categoria, endereço, telefone, website.
- Área atendida, cidade, bairro, lat/lng.
- Horários.
- Fotos permitidas/autorizadas.
- Rating/review count quando permitido.
- Temas dos reviews/depoimentos.
- Serviços detectados no website.
- FAQs e objeções.
- Concorrentes locais.
- Queries locais de intenção comercial.

### 5.2 Geração de landing

Tipos de página:

- Página principal local.
- Serviço + cidade: `emergency-plumber-austin`.
- Serviço específico: `water-heater-repair`.
- Bairro/área atendida.
- Comparativo/alternativa, com cuidado legal.
- Página de campanha para Google Ads/Reddit/Meta/LinkedIn.
- Página de prova/reviews.
- FAQ/answer page para AI search.

Blocos:

- Hero local.
- Mapa/localização.
- CTA: chamada, WhatsApp, formulário, booking.
- Serviços.
- Prova social.
- Review themes, não necessariamente reviews brutos.
- Fotos.
- Horários.
- Áreas atendidas.
- FAQ local.
- Trust/proof bar.
- Before/after ou “why choose us”.
- Schema preview.
- AI-readable answer blocks.

### 5.3 Editor completo

- Seções reordenáveis.
- Edição inline de texto.
- Troca de CTA.
- Tema/cores/logo.
- Upload de imagens.
- Regenerate section.
- Tone/style.
- Multi-language.
- SEO fields: title, meta, slug, OG.
- Schema editor.
- Preview mobile/desktop.
- Histórico de versões.
- Approval flow para agência.

### 5.4 Publicação

- URL hospedada pelo OZvor: `/l/[slug]` ou subdomínio.
- Custom domain, fase posterior.
- Export HTML, fase posterior.
- Forms internos.
- Webhook/Zapier/Make, fase posterior.
- Analytics de leads/eventos.

### 5.5 GEO/SEO/OZvor Intelligence embutido

Cada página deve receber:

- LocalBusiness schema.
- Service schema.
- FAQPage schema.
- BreadcrumbList.
- Conteúdo answer-shaped.
- Citações/provas verificáveis.
- Internal linking.
- AI readiness score.
- Page-level OZvor audit.
- Before/after visibility.
- Competitor comparison.

---

## 6. Via de mão dupla obrigatória

### OZvor → Local Pages

Quando o audit OZvor encontra lacunas, gera Action Cards:

- Create local landing page.
- Create service page.
- Create city page.
- Create FAQ/schema page.
- Create competitor response page.
- Refresh page with stronger proof.
- Create campaign page for query.

Exemplo:

> AI engines cite 3 competitors for “best emergency plumber in Austin”, but not you. Generate a landing page targeting this query with LocalBusiness schema, FAQ, review themes and quote CTA.

### Local Pages → OZvor

Dentro do builder:

- Run AI Visibility Audit for this page.
- Track weekly.
- Compare against local competitors.
- Generate authority/content plan.
- Upgrade to Growth monitoring.
- Add client to Agency dashboard.
- Sell OrganicPosts Local Sprint.

---

## 7. Dados/modelo técnico proposto

Entidades novas:

```txt
local_business_profiles
landing_sites
landing_pages
landing_page_versions
landing_leads
landing_events
monitored_assets
landing_action_cards
local_competitors
review_insights
```

Relação com OZvor existente:

```txt
tenant
  → brand
    → local_business_profile
      → landing_site
        → landing_page
          → monitored_asset
            → geo_audit / geo_score / citation_check
          → landing_leads / landing_events
```

---

## 8. MVP sem API paga primeiro

Para não depender de Google billing no início:

1. Formulário manual: negócio, website, endereço, categoria.
2. Crawl seguro do site do cliente.
3. Upload/colar reviews/depoimentos próprios.
4. Gerador de landing local.
5. Editor básico de seções.
6. Publicação em `/l/[slug]`.
7. Lead form.
8. Schema LocalBusiness/FAQ.
9. Action Card OZvor ↔ Landing Builder.
10. Audit page-level.

Depois, com aprovação do founder:

- Places API.
- Maps JavaScript.
- Business Profile OAuth.

---

## 9. Pricing/funil recomendado

| Degrau | Produto | Objetivo |
|---|---|---|
| Free | Local Page Preview / Local AI Visibility Scan | Capturar lead pelo builder ou pelo audit |
| Entry | 1 Local Page Kit — $29–$49 one-time | Venda rápida, tangível |
| Growth | Local Pages + Weekly AI Visibility — ~$99/mo | Retenção |
| Agency | Multi-client / white-label — ~$199–299/mo inicial | Canal B2B |
| DFY | OrganicPosts Local Sprint | Serviço premium |

---

## 10. PRs sugeridos

### PR 1 — PRD + arquitetura
- Documento produto.
- Data model.
- UX flows.
- Risk classification.

### PR 2 — MVP Local Builder manual
- `/local-builder`.
- Formulário manual.
- Geração de draft.
- Preview.

### PR 3 — Editor + publicação
- `/landing-sites`.
- `/landing-sites/[id]/editor`.
- `/l/[slug]` público.
- Formulário de lead.
- Schema.

### PR 4 — Via de mão dupla OZvor
- Action Cards create_landing_page.
- Landing page como monitored_asset.
- Botões “Run OZvor Audit” e “Generate Page from Audit Gap”.
- Before/after report.

### PR 5 — Agency basics
- Multi-client.
- Templates.
- White-label basics.

### PR 6 — Google integration, founder approval required
- Places API.
- Maps JS.
- Place Details.
- Policy/attribution layer.
- Billing limits.

---

## 11. Riscos

| Risco | Nível | Mitigação |
|---|---:|---|
| Google Maps scraping/ToS | Alto | API oficial, sem scraping, attribution, armazenamento mínimo |
| API paga Google | Critical | aprovação explícita, budgets/quotas, field masks |
| Produto virar builder genérico | Alto | manter foco local + AI Visibility + GEO |
| Reviews/fotos | Alto | autorização, atribuição, não rehostar bruto sem permissão |
| Complexidade de editor | Médio | editor de seções primeiro, canvas livre depois/nunca |
| Custom domains | Médio/Alto | fase posterior |

---

## 12. Diferencial OZvor

Concorrentes geram site rápido. OZvor deve gerar, medir e melhorar.

Diferença central:

```txt
Brila/Sitely: Google Maps → site
Dorik: prompt → site genérico robusto
OZvor: Maps/site/reviews/audit → local landing → AI visibility monitoring → next actions → leads
```

O produto deve vender sozinho pelo builder e vender o core OZvor pelo resultado.

---

## 13. Claude Code feasibility review request

Hermes requests Claude Code to treat this document as a planning PR, not an implementation PR.

Please verify the full feasibility and return a concrete implementation project plan before writing production code:

1. **Codebase fit**
   - Inspect current `apps/web`, `apps/api`, `apps/worker`, `packages/llm`, `packages/db`, auth, billing/plan limits, agency/white-label surfaces, and existing dashboard navigation.
   - Confirm where the existing dashboard landing-creation entry point lives, if any, and whether it should become `/local-builder`, `/landing-sites`, or another route.

2. **Architecture validation**
   - Validate the proposed tables, API routes, worker jobs, and shared types.
   - Identify any missing RLS, audit log, plan-limit, data-retention, or compliance requirements.
   - Decide whether public pages should initially render dynamically from Postgres or as static artifacts in object storage/CDN.

3. **Google/Maps policy and cost risk**
   - Do **not** implement scraping of Google Maps.
   - Design the Google Maps-link flow around official APIs only: Places API, Maps JavaScript API, and later Business Profile OAuth where the user owns/authorizes the profile.
   - Mark any Google API activation, billing, quota, or production key requirement as **CRITICAL / founder approval required**.

4. **MVP scope**
   - Propose the smallest shippable MVP that avoids paid Google APIs:
     - manual business input;
     - website crawl with existing SSRF guard patterns;
     - review/testimonial manual import;
     - generated landing draft;
     - section editor;
     - public `/l/[slug]` publishing;
     - lead capture;
     - LocalBusiness/FAQ schema;
     - OZvor audit/action-card loop.

5. **PR breakdown**
   - Split implementation into small PRs with risk labels: LOW / MEDIUM / HIGH / CRITICAL.
   - Include migrations and RLS as their own reviewable PR.
   - Keep custom domains and Google Places/GBP integration out of the first implementation unless explicitly approved by the founder.

6. **Verification plan**
   - For each PR, define required tests: unit, route smoke, migration/RLS checks, public page rendering, form submission, plan-limit enforcement, and no-secret/no-paid-API checks.
   - Confirm CI expectations according to `AGENTS.md`.

Expected Claude output on this PR:

- A comment with feasibility verdict.
- A concrete issue/PR sequence for the MVP and follow-up phases.
- Any objections to the data model, route model, publication model, or pricing/limits.
- No live Google API activation, no production DNS changes, no paid actions, and no destructive commands without founder approval.
