# Ozvor — mapa de produto e funil (Discovery Fase 0B)

> **Estado:** MAPEAMENTO. **Nenhuma mudança de preço, billing ou entitlement foi feita nesta entrega.**
> **Branch:** `docs/closed-loop-discovery` · **Baseline de main:** `8d6a6a9`
> Documento irmão: `docs/ozvor-closed-loop-remediation.md`

---

## TL;DR

Existem seis destinos de compra (`/test` grátis, Kit $29, AI Audit $49, Pages $99, Growth $99/mês, Agency $549/mês) mais dois serviços fora do Stripe (GEO Sprint $1.500, Managed GEO $1.900), e o catálogo de preços **não está drifted** — está em dois ficheiros partilhados que concordam nos números. O que está drifted são os **limites**: o código impõe 10 marcas e 10 sites (`plan-limits.ts:107`–`:108`), enquanto cinco sítios anunciam 15 — incluindo o system prompt do chatbot de vendas, que cita o preço-por-marca errado a prospects — e um comentário na API diz 25. Três números para um limite.

O achado mais consequente para o programa closed loop: **`entryMotion` não existe em lado nenhum** (zero ocorrências em `apps`, `packages`, `tests`). Todo novo tenant nasce idêntico — free, papel owner — venha do teste grátis, do Kit, do AI Audit, do Pages ou de uma subscrição Growth. A única diferenciação é uma tentativa retroativa de casar a compra por e-mail depois do facto (`onboarding.ts:44`). O relatório pede dois funis com `entryMotion` separado (`RELATORIO:1136`); o ponto de inserção existe e é único, o que torna a mudança pequena — mas é a fundação de tudo o resto.

Duas rotas mencionadas na encomenda não existem como escritas: **`/pages` não existe** (marketing é `/local-pages`, app é `/landing-pages`) e **`/dashboard` é só um redirect** para `/dashboard-v3`.

---

## 1. Rotas, CTAs e checkout — o que existe de facto

### `/` — home
- `apps/web/src/app/(marketing)/page.tsx:53` — shell de metadata que renderiza `<HomeFilm />`. **Nenhum CTA neste ficheiro.**
- `apps/web/src/app/(marketing)/HomeFilm.tsx` — o film de scroll. O único link de saída é `:222` → `/how-we-measure`.
- O CTA real da home é o formulário embebido: `apps/web/src/components/film/FilmStartForm.tsx:90` → `router.push("/test")`, `:133` `redirectPath="/test"`. Recolhe website + e-mail e passa o rascunho ao `/test`.
- CTA partilhado: `apps/web/src/components/marketing/FreeTestCta.tsx:33`, `:39` — rótulo *"Check my brand, free →"*, `href="/test"`.

### `/test` — teste grátis, topo de funil
- `apps/web/src/app/(marketing)/test/page.tsx:153` — shell → `TestFilmHero` + `InvisibilityTestClient`.
- `apps/web/src/app/(marketing)/test/InvisibilityTestClient.tsx:1377` — `fetch("/api/test", …)`; **e-mail obrigatório**.
- Upsells pós-resultado: `:1440` — `const kitHref = \`/kit?${kitParams.toString()}\`` (parâmetros levados para o Kit); `:131` — `const AI_AUDIT_HREF = "/ai-audit"`.

### `/kit` — Get-Cited Kit, $29 one-time
- `apps/web/src/app/(marketing)/kit/page.tsx` — shell; tiles de upsell em `:159` (`/ai-audit`) e `:175` (`/organicposts`).
- `apps/web/src/app/(marketing)/kit/KitCheckoutForm.tsx:207` — botão *"Get the Kit — $29"*; `:92` `fetch("/api/kit/checkout")`; `:107` `window.location.href = data.url` (Stripe, ou URL de entrega em dev-unlock).

### `/ai-audit` — AI Audit Stack, $49 one-time
- `apps/web/src/app/(marketing)/ai-audit/AiAuditClient.tsx:213` — `fetch("/api/ai-audit/checkout")`; `:226` redirect para Stripe. E-mail capturado no passo 0 (`:78`); `:184` `fetch("/api/ai-audit/entry")` para o teaser.
- Entrega: `apps/web/src/app/(marketing)/ai-audit/[token]/page.tsx`.

### `/pricing`
- `apps/web/src/app/(marketing)/pricing/page.tsx` (server) + `apps/web/src/app/(marketing)/pricing/PricingPlans.tsx` (client).
- Escada de CTAs — `PricingPlans.tsx`:

| Plano | Rótulo do CTA | Destino | Linha |
|---|---|---|---|
| Free | "Run my test — free" | `/test` | `:71` |
| Kit | "Get the Kit — $29" | `/kit` | `:92` |
| AI Audit | "Get my AI stack — $49" | `/ai-audit` | `:113` |
| Growth | "Start Growth" | POST `/api/checkout/direct` | `:127` (via `useDirectCheckout`, `:24`/`:30`) |
| Agency | "Start Agency" | POST `/api/checkout/direct` | `:142` |

- Upsells de página (`pricing/page.tsx:207`–`:227`): OrganicPosts → `/organicposts` ("Starts with a call"); AI Audit Stack $49 → `/ai-audit`; "Book a 20-min call" grátis → `/book`.

### `/organicposts` — done-with-you / DFY
- `apps/web/src/app/(marketing)/organicposts/page.tsx:88` — *"Scope your project →"* → `/book`; `:149` *"Book a scoping call →"* → `/book`; `:150` *"Compare plans"* → `/pricing`.

### `/book`
- `apps/web/src/app/(marketing)/book/page.tsx:102` — `const hasCalendly = Boolean(CALENDLY_URL)`; `:231` `<CalendlyEmbedSection …/>`, embed inline com ramo de fallback quando não há Calendly.
- CTAs secundários `:214` e `:291` → `/test`.

### `/pages` — **a rota não existe**
- Marketing do produto Ozvor Pages vive em `/local-pages`: `apps/web/src/app/(marketing)/local-pages/page.tsx:155` (`href="#buy"`), rótulo *"Get your site — $99 one-time"* (`:164`), secundário `:167` → `/pricing`.
- Widget de compra: `apps/web/src/app/(marketing)/local-pages/PagesBuyForm.tsx`; API `POST /api/pages/checkout` (`apps/api/src/routes/products.ts:672`).
- `apps/web/src/app/landing-pages/` é a **superfície autenticada**, não marketing: `page.tsx`, `[siteId]/page.tsx`, `[siteId]/pages/[pageId]/page.tsx`, `[siteId]/leads/page.tsx`.
- **Consequência SEO**, que o relatório também apanhou (`RELATORIO:459`): `/landing-pages` é um shell autenticado sem canonical, e o produto público é `/local-pages`.

### `/dashboard` e `/dashboard-v3`
- `apps/web/src/app/dashboard/page.tsx:16` — `redirect("/dashboard-v3")`. Puro shim, sem CTAs.
- CTAs de upsell no v3: `:1302` (aviso de limite de marcas → `/pricing`), `:1916` (*"Build a 5-page site →"* → `/landing-pages`), `:2259`/`:2262`/`:2266` (→ `/pricing`), `:2398` (*"Add a brand →"* → `/create`).
- Widget de créditos: `apps/web/src/components/credits/CreditsWidgets.tsx:162` → `/pricing`.

### Diagrama do funil real

```
/ (HomeFilm) ──form(site+email)──> /test ──POST /api/test──> resultados
                                     ├─> /kit?<params>  ──> POST /api/kit/checkout      ($29)
                                     └─> /ai-audit      ──> POST /api/ai-audit/checkout ($49)
/pricing ─┬─ Free      -> /test
          ├─ Kit $29   -> /kit
          ├─ Audit $49 -> /ai-audit
          ├─ Growth    -> POST /api/checkout/direct -> Stripe -> /welcome?session_id=
          ├─ Agency    -> POST /api/checkout/direct -> Stripe -> /welcome?session_id=
          └─ upsell    -> /organicposts | /ai-audit | /book
/organicposts ──> /book (Calendly inline) ──> /test (pré-call)
/local-pages  ──> #buy -> POST /api/pages/checkout ($99)
/welcome ──> POST /api/account/bootstrap  (tenant free + claimPendingSubscription)
/dashboard -> redirect /dashboard-v3 ──> /pricing | /landing-pages | /create
```

---

## 2. Fonte de verdade de produtos, preços e Stripe IDs

### Dois catálogos — separação deliberada, números concordantes

**Catálogo A — `packages/shared/src/plan-limits.ts`** (tiers de subscrição + limites), `:28`–`:32`:
```ts
export const PLAN_PRICE_USD: Record<PlanTier, number> = {
  free: 0, growth: 99, agency: 549,
};
```

**Catálogo B — `packages/shared/src/pricing.ts`** (preços de tabela + matemática de MRR), `:15`–`:22`:
```ts
export const LIST_PRICE_USD = {
  kit: 29, pages: 99, growth: 99, agency: 549, geoSprint: 1500, managedGeo: 1900,
};
```
Anual em `:31`–`:34` (`growth: 831`, `agency: 4611`); `PLAN_MRR_USD` em `:75`–`:81` reafirma growth/agency uma terceira vez, mas **por referência** a `LIST_PRICE_USD`, logo sem drift numérico; `DFY_PRICE_USD` em `:87`–`:90` (`geo_sprint: 1500`, `managed_geo: 1900`).

A API **re-exporta** em vez de redefinir: `apps/api/src/integrations/stripe.ts:337`–`:341` importa `PLAN_PRICE_USD`/`PLAN_LIMITS` de shared. A web importa o mesmo módulo (`pricing/PricingPlans.tsx:57`, `components/PlanCard.tsx:25`). **Os preços não estão drifted.**

### Catálogo completo

| Produto | Preço | Origem do Stripe price | Definição |
|---|---|---|---|
| Free | $0 | — | `packages/shared/src/plan-limits.ts:28` |
| Growth | $99/mês | `STRIPE_PRICE_ID_GROWTH` | `apps/api/src/integrations/stripe.ts:51` |
| Growth anual | $831/ano | `STRIPE_PRICE_ID_GROWTH_ANNUAL` | `apps/api/src/integrations/stripe.ts:55` |
| Agency | $549/mês | `STRIPE_PRICE_ID_AGENCY` | `apps/api/src/integrations/stripe.ts:52` |
| Agency anual | $4.611/ano | `STRIPE_PRICE_ID_AGENCY_ANNUAL` | `apps/api/src/integrations/stripe.ts:56` |
| Get-Cited Kit | $29 one-time | `STRIPE_PRICE_ID_KIT` | `apps/api/src/integrations/stripe.ts:579` |
| Ozvor Pages | $99 one-time | `STRIPE_PRICE_ID_PAGES` | `apps/api/src/integrations/stripe.ts:629` |
| AI Audit Stack | $49 one-time | `STRIPE_PRICE_ID_AI_AUDIT` | `apps/api/src/integrations/stripe.ts:828` |
| GEO Sprint (DFY) | $1.500 | **nenhuma — fora do Stripe** | `packages/shared/src/pricing.ts:88` |
| Managed GEO (DFY) | $1.900 | **nenhuma — fora do Stripe** | `packages/shared/src/pricing.ts:89` |

**Só existe um Stripe ID chapado no repo, e está num comentário, não em código:** `apps/api/src/integrations/stripe.ts:619` (`price_1TrRnOJd5OWcDDzU35opwEAP`, `prod_UrA7pxoSdiegPy`). Todo o resto vem de variáveis de ambiente — o que é o comportamento correto.

---

## 3. Entitlements e créditos

**Limites definidos:** `packages/shared/src/plan-limits.ts:34`–`:111` — um registo por tier com `max_brands`, `max_competitors`, `prompts_per_audit`, `weekly_monitoring`, `max_landing_sites`, `max_pages_per_site`, `manual_audit_interval`, `audit_backstop_24h`, `monthly_audits_total`, `pages_regens_per_site_month`.

**Onde são impostos:**
- `apps/api/src/routes/audits.ts:267` (`planLimitsFor`), `:458` (max_brands), `:625` (max_competitors), `:1085` (intervalo de audit manual + backstop 24h, rejeita **429** antes de qualquer trabalho).
- `apps/worker/src/jobs/audit-run.ts` — runs agendados saltam quando excedem `monthly_audits_total` (documentado em `plan-limits.ts:71`–`:75`).
- `apps/api/src/routes/landing.ts:226` (helper de bypass, *"Exported so the decision is unit-testable"*), `:538` (entitlement de site = base do plano + créditos comprados), `:1186`.
- `apps/api/src/lib/landing-allowance.ts:26` — `maxSites: limits.max_landing_sites + Math.max(0, extraSites)`.

**Créditos:**
- Aritmética pura: `packages/shared/src/credits.ts:39` (`CREDITS_PER_PROMPT_AUDIT = 50`), `:91` (`creditsForAudit`), `:101` (`monthlyCreditsFor`), `:117` (`FREE_SIGNUP_RESIDUAL_CREDITS = 200`), `:126` (`CREDITS_LOW_PCT = 20`), `:150` (`creditsState`).
- BD: `apps/api/src/lib/credits.ts:172` (`debitForAudit`) — insere em `credit_ledger`, idempotente por `ON CONFLICT (tenant_id, ref_type, ref_id) DO NOTHING`.
- Débito no worker: `apps/worker/src/jobs/audit-run.ts:1609`–`:1616`; e-mail de créditos esgotados em `:1633`.
- **Decisão de arquitetura importante**, `apps/api/src/lib/credits.ts:167`–`:170`: *"Deliberately NOT a gate … Two systems guarding the same door is how one of them ends up silently doing nothing."* O teto real é a contagem de audits (`monthly_audits_total`), não o saldo. Isto é coerente e bem justificado — mas significa que **abrir geração de conteúdo hospedada exige decidir qual dos dois sistemas a governa**, porque hoje nenhum a governa (ver secção 4 do documento irmão).
- Migrações: `packages/db/migrations/20260805000001_credit_ledger.up.sql`, `20260810000001_credit_ledger_worker_debit.up.sql`, `20260710000004_usage_counters.up.sql`.

**`super_admin` / tier efetivo:**
- Claim: `apps/api/src/auth/middleware.ts:84` (*"Custom claim for platform admin — set manually only"*), `:112`, `:201`, `:400`.
- Bypass: `apps/api/src/routes/audits.ts:272` — dentro de `planLimitsFor`, `if (isSuperAdmin)` devolve ilimitado; propagado em `:459`, `:626`, `:1089`, `:1254`. Pages: `apps/api/src/routes/landing.ts:226`, `:538`, `:1186`.
- **Billing é a exceção deliberada:** `apps/api/src/routes/billing.ts:411`–`:415` — super_admin não é faturado como ilimitado; o bypass cobre imposição, não cobrança.
- Convenção na web: `null = unlimited` (`apps/web/src/app/dashboard-v3/page.tsx:369`, `apps/web/src/app/account/billing/page.tsx:62`). `apps/web/src/app/admin/page.tsx:3205` é verificação de cliente; a API impõe o gate real.

---

## 4. Sobreposições e conflitos

### C1 — Capacidade Agency: três números para um limite (o conflito mais caro)

Imposto: `packages/shared/src/plan-limits.ts:107` — agency `max_brands: 10`; `:108` — `max_landing_sites: 10`.

| Onde | O que diz | Linha |
|---|---|---|
| Página de pricing | "$54.90 per brand", "up to 10 brands" — **correto** | `apps/web/src/app/(marketing)/pricing/PricingPlans.tsx:141` |
| Marketing Pages | "Agency includes up to 15" | `apps/web/src/app/(marketing)/local-pages/page.tsx:100` |
| Recurso citation tracker | "Agency: $549/mo … up to 15" | `apps/web/src/app/(marketing)/resources/llm-citation-tracker/page.tsx:882` |
| **System prompt do chatbot de vendas** | "up to 15 client brands (just $36.60 per brand…)" | `apps/api/src/routes/chat.ts:81` |
| E-mail de entrega do Kit | "for up to 15 client brands (about $37 each)" | `packages/shared/src/emails/kit-delivery.ts:71`, `:145` |
| E-mail de bónus | "white-label AI-visibility for up to 15 client brands" | `packages/shared/src/emails/bonus-delivery.ts:105` |
| Comentário na API | "(free 0 / growth 1 / agency 25)" | `apps/api/src/routes/landing.ts:8` |

O chatbot de vendas cita com confiança um preço-por-marca que não existe: $549/15 = $36,60, quando a 10 marcas é $54,90. A página de pricing e o chatbot dão números diferentes para o mesmo plano ao mesmo prospect. É o R11 do relatório, com o detalhe adicional de que o erro está no prompt do agente de vendas.

### C2 — Sobreposição de entrega entre ofertas

| Sobreposição | Onde colidem |
|---|---|
| **Kit $29 vs Free `/test`** | Ambos produzem um diagnóstico de visibilidade; o Kit acrescenta 3 drafts e reteste. A fronteira é de profundidade, não de tipo — o cliente não tem como saber onde acaba um e começa o outro sem ler a copy. |
| **Kit $29 vs Growth $99** | O Kit usa chave de plataforma (`kit-deliverable.ts:266`) e entrega conteúdo; o Growth exige BYOK e **não** entrega conteúdo sem chave (`content-studio.ts:520`). **Um cliente de $29 recebe conteúdo gerado; um de $99 pode não receber.** É a inversão de valor mais grave do catálogo. |
| **AI Audit $49 vs OrganicPosts** | O AI Audit é um funil diferente (AI Ops), mas hoje o seu único upsell aponta para OrganicPosts (`kit/page.tsx:175`), que é conteúdo/autoridade — precisamente o desalinhamento semântico que o relatório nomeia em `RELATORIO:832`. |
| **Pages $99 vs Growth/Agency** | Pages é one-time mas consome entitlement de subscrição (`landing-allowance.ts:26` soma base do plano + créditos comprados). Compra avulsa e plano recorrente competem pelo mesmo contador. |
| **OrganicPosts $1.500/$1.900 vs Agency $549** | Ambos vendidos como "nós fazemos"; nenhum dos dois está no Stripe (só `pricing.ts:88`–`:89`), logo a fronteira comercial é decidida em call, não no produto. |

### C3 — `/pages` não existe; `/landing-pages` é app sem canonical
Já descrito na secção 1. Impacto: SEO (rota autenticada indexável sem canonical) e confusão de nomenclatura entre marketing e produto.

### C4 — `/dashboard` é redirect
`apps/web/src/app/dashboard/page.tsx:16`. Qualquer link, e-mail ou material que aponte para `/dashboard` faz um salto extra.

### C5 — Nomenclatura Prime vs OrganicPosts
O ecrã usa "Prime" (`apps/web/src/app/dashboard-v3/PrimeTab.tsx`, rota `apps/api/src/routes/prime.ts`), o marketing usa OrganicPosts. Confirma `RELATORIO:352`.

---

## 5. `entryMotion` — onde caberiam dois, sem duplicar conta

### O que existe hoje: nada

**`entryMotion` / `entry_motion`: NÃO ENCONTRADO.** Zero ocorrências em `apps`, `packages`, `tests` (`*.ts`, `*.tsx`, `*.sql`). Não existe um conceito de motion no código — não é "um só motion", é nenhum.

O que existe é um único endpoint de provisionamento indiferenciado:
- `apps/api/src/routes/onboarding.ts:306` — `app.post("/api/account/bootstrap", …)`, a **única** rota do ficheiro.
- Cabeçalho `:1`–`:18`: no primeiro login provisiona (1) uma linha em `tenants` **(tier free)**, (2) uma linha em `users` (papel `owner`), (3) escreve `app_metadata { tenant_id, app_role: 'owner' }` no Supabase. Idempotente; 503 sem `SUPABASE_SERVICE_ROLE_KEY`.
- O único ramo que se assemelha a classificação é retroativo: `:44`–`:60` `claimPendingSubscription(db, tenantId, verifiedEmail)` casa uma `pending_subscription` não reclamada pelo e-mail verificado do JWT. Best-effort — `:50`–`:51`: *"if the claim fails, the user still gets their account."*
- `apps/web/src/app/(marketing)/welcome/` é a aterragem pós-checkout (`apps/api/src/routes/checkout.ts:213` — `successUrl = ${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`).

**Conclusão factual:** todo novo tenant nasce idêntico — free, papel owner — venha do teste grátis, do Kit, do AI Audit, do Pages ou de uma subscrição Growth/Agency. A única diferenciação é o casamento por e-mail depois do facto.

### Arquitetura alvo — dois motions, uma conta

O relatório pede pipeline comum com `entryMotion` separado (`RELATORIO:1136`–`:1148`). O código torna isso barato porque **existe exatamente um ponto de nascimento de conta**.

**Princípio:** `entryMotion` é uma propriedade do **percurso de aquisição**, não da conta e nunca do tenant. Uma empresa pode entrar por visibility e comprar ai_ops seis meses depois; se o motion viver no tenant, essa segunda compra ou sobrescreve o primeiro ou obriga a uma segunda conta. Nenhuma das duas é aceitável.

Forma recomendada:

| Camada | O que guarda | Onde encaixa |
|---|---|---|
| `tenant` | **nada de motion** | inalterado, `apps/api/src/routes/onboarding.ts:306` |
| `tenant_module` (novo) | um registo por módulo ativo: `visibility` \| `ai_ops`, com entitlements, data de ativação e origem | novo; consumido por `planLimitsFor` (`audits.ts:267`) |
| `acquisition_entry` (novo, append-only) | um registo por entrada: `entryMotion` (`visibility` \| `ai_ops`), produto de entrada, campanha, primeiro toque, e-mail | escrito em `bootstrap` (`onboarding.ts:306`) e nos webhooks de checkout |

**Onde cada peça se liga, com o ficheiro exato:**
1. **Captura na origem.** Os quatro caminhos de checkout (`/api/kit/checkout`, `/api/ai-audit/checkout`, `/api/pages/checkout` — `apps/api/src/routes/products.ts:672` — e `/api/checkout/direct`) já sabem qual o produto. Basta carimbar o motion nos metadados da sessão Stripe. Hoje nenhum o faz.
2. **Persistência no nascimento.** `apps/api/src/routes/onboarding.ts:306` é o ponto único; `claimPendingSubscription` (`:44`) já lá está para casar a compra — é o sítio natural para escrever `acquisition_entry` e o primeiro `tenant_module`.
3. **Entitlements por módulo.** `planLimitsFor` (`apps/api/src/routes/audits.ts:267`) é o único resolvedor de limites do lado do audit, e `apps/api/src/lib/landing-allowance.ts:26` o do lado do Pages. São os dois pontos a passar a consultar `tenant_module` em vez do tier plano.
4. **Navegação por módulo.** `apps/web/src/app/dashboard-v3/page.tsx:188` já tem um mapa de features (`whereToShowUp: true` chapado) — é a costura onde a navegação passa a depender de módulos, e resolve de passagem o problema do Opportunity Radar aparecer a todos (secção 5 do documento irmão).
5. **Cross-sell com razão registada.** O relatório exige `cross_sell_reason`, `evidenceIds`, `owner`, `nextReviewAt` (`RELATORIO:998`). Isso é um registo em `acquisition_entry`, não campos no tenant.

**O que NÃO fazer, e porquê:**
- **Não** pôr `entry_motion` como coluna em `tenants`: destrói o caso dual, que é a tese comercial central do relatório.
- **Não** criar tenant separado por motion: duplica marca, entidade, histórico de score e faturação — e o histórico longitudinal comparável é precisamente o moat de retenção que o relatório identifica (`RELATORIO:1059`).
- **Não** derivar motion do plano: o plano muda, a origem não.

---

## 6. Riscos

| # | Risco | Gravidade | Mitigação |
|---|---|---|---|
| RK1 | O chatbot de vendas cita capacidade e preço-por-marca errados a prospects (`apps/api/src/routes/chat.ts:81`) | **ALTA** — é uma afirmação comercial falsa dita por nós, em tempo real | Corrigir o prompt e derivá-lo de `PLAN_LIMITS` em vez de texto |
| RK2 | Cliente de $29 recebe conteúdo gerado; cliente de $99 pode não receber (`kit-deliverable.ts:266` vs `content-studio.ts:520`) | **ALTA** — inversão de valor percebido, causa direta de churn | Caminho hospedado com medidor (secção 4 do doc irmão) |
| RK3 | Introduzir `entryMotion` no sítio errado (tenant) bloqueia o caso dual | **ALTA**, e é irreversível na prática | Motion em `acquisition_entry`, módulos em `tenant_module` |
| RK4 | Mudar entitlements sem migrar contas existentes altera silenciosamente o que clientes atuais podem fazer | **ALTA** | Grandfather explícito por registo, nunca por default de código |
| RK5 | Pages one-time e planos recorrentes competem pelo mesmo contador (`landing-allowance.ts:26`) | MÉDIA | Separar entitlement comprado de entitlement de plano no novo `tenant_module` |
| RK6 | Créditos não são gate por decisão deliberada (`credits.ts:167`); abrir conteúdo hospedado sem escolher o guardião cria custo sem teto | MÉDIA-ALTA | Decidir **um** guardião antes de abrir o caminho hospedado |
| RK7 | `/landing-pages` indexável sem canonical | MÉDIA (SEO) | Fora do escopo deste discovery; ver P1-04 do relatório |
| RK8 | GEO Sprint e Managed GEO existem em código mas não no Stripe (`pricing.ts:88`) | BAIXA hoje, ALTA ao escalar | Decisão comercial antes de vender em volume |

---

## 7. Decisões que precisam do founder antes de qualquer implementação

Nenhuma linha de código deve mudar antes destas respostas.

**Preço e catálogo (nada foi alterado nesta entrega):**
1. **10 ou 15 marcas no Agency?** Cinco sítios anunciam 15, o código impõe 10. Alinhar a copy para 10 (barato, imediato) ou subir o limite para 15 (mexe em custo e margem — o histórico já mostra Agency com margem negativa a 25 marcas)?
2. **Growth $99 → $149?** O relatório propõe (`RELATORIO:935`) com grandfathering. Fora do escopo deste discovery; precisa de decisão explícita antes de qualquer trabalho de billing.
3. **GEO Sprint e Managed GEO entram no Stripe** ou continuam faturados fora do produto?
4. **Kit, AI Audit e Pages passam a add-ons** (proposta do relatório, `RELATORIO:410`) ou continuam como ofertas independentes?

**Closed loop:**
5. **A Execution % passa a mostrar o número verificado?** Ele vai partir perto de 0 contra os 100 de hoje. Comunicamos a mudança aos clientes existentes, ou mostramos os dois números lado a lado durante um período de transição?
6. **Conteúdo hospedado: quem é o guardião do custo** — contagem de audits (o teto atual) ou saldo de créditos? O código proíbe deliberadamente ter os dois (`credits.ts:167`).
7. **Opportunity Radar: esconder ou gated?** Se gated, o mecanismo tem de ser construído — não existe.
8. **Mudar os prompts por defeito muda todos os scores.** Aceita-se o bump de metodologia e a quebra da linha de tendência de todos os clientes? Quando?
9. **O caminho de enchimento genérico (`strategy-generator.ts:236`) morre ou fica?** Se fica, tem de deixar de contar para a Execution %.

**Operação:**
10. **Reaper de audits presos:** qual a margem antes de matar um audit em `running`? Um valor errado mata trabalho legítimo.
11. **O `box-sizing` global vale o risco de regressão visual em massa?** Se sim, vai num PR isolado com prova visual antes/depois.
12. **Confirmar contra a base de produção**, antes de tudo: (a) o `plan_task_vector_check` ainda é `('brand','performance','ai')`; (b) que `methodology_version` têm os audits de 30/06 e 02/09; (c) por que ficaram as três auditorias de 17/08 incompletas. As três respostas mudam o plano.
