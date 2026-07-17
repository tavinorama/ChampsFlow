# Ozvor — GO-LIVE ULTIMATE (tudo que falta, atualizado)

> Marca: plataforma **Ozvor** (ozvor.com). O score chama-se **"Ozvor AI Visibility Score"** (regra do fundador 2026-06-27 — nunca reintroduzir "TrustIndex" em display; a nota anterior "o score mantém TrustIndex AI Score" está SUPERSEDIDA); a consultoria é **"OrganicPosts by Ozvor"**.

_Atualizado: 2026-06-26. Este é o documento único e completo: o que JÁ está feito, e exatamente o que VOCÊ precisa fazer para o produto ficar 100% funcional e vendendo._

**Legenda:** ✅ = feito (eu) · 🔑 = você (chave secreta — eu não posso colar) · ⚙️ = você (config no painel) · ⭐ = obrigatório p/ o case study (auditoria real + monitoramento)

**Seus recursos (já provisionados):**
- Supabase: `wdeabrzpgshnouvnfvml` → `https://supabase.com/dashboard/project/wdeabrzpgshnouvnfvml`
- Railway: projeto `trustindex-ai` → `https://railway.com/project/c3fc5744-b987-4070-9b02-51593d1c4e01` (serviços **api / worker / web** + **Redis**)
- Stripe (LIVE): `https://dashboard.stripe.com`
- URLs: API `https://api-production-2052.up.railway.app` · Web `https://web-production-842ee.up.railway.app`

---

## OVERVIEW — onde está

**Produto: 100% construído e deployado.** Funil completo (free test → Kit $29 → Growth $99 / Agency $549 → DFY GEO Sprint/Managed), dashboard com trend, admin, blog, chat AI, nutrição (LGPD), cookie banner, legais, schema/SEO, emails branded. Banco 100% migrado.

**O que falta NÃO é código — é ligar config que só você controla:** as chaves de API (secretas), o webhook do Stripe, o DNS, e apontar 2 env vars do Stripe. Sem as chaves de engine a auditoria roda em **mock** (4 de 5 motores) — esse é o item nº 1.

**Já resolvido por mim no Stripe:** catálogo correto (Kit $29, Growth $99/$1.188, **Agency $549/$6.588 criados**), cupom **FOUNDER30** ativo, **checkout de baixa fricção** (mostra card + Apple Pay + Google Pay + Link 1-clique).

---

## 1. RAILWAY — variáveis de ambiente

Railway → serviço → aba **Variables** → **Raw Editor** → colar. Os valores **não-secretos já estão preenchidos** (price IDs, etc.); troque os `PASTE_…` pelas suas chaves (de onde pegar → §1.4).

### 1.1 Serviço `api`
```
DATABASE_URL=PASTE_SUPABASE_SESSION_POOLER_5432_URL?sslmode=require
REDIS_URL=${{Redis.REDIS_URL}}
SUPABASE_URL=https://wdeabrzpgshnouvnfvml.supabase.co
SUPABASE_SERVICE_ROLE_KEY=PASTE_SERVICE_ROLE_KEY
OAUTH_TOKEN_KEY=PASTE_OPENSSL_RAND_HEX_32
APP_DB_ROLE=app_user
WEB_ORIGIN=https://web-production-842ee.up.railway.app
ANTHROPIC_API_KEY=PASTE_ANTHROPIC_KEY
OPENAI_API_KEY=PASTE_OPENAI_KEY
GEMINI_API_KEY=PASTE_GEMINI_KEY
PERPLEXITY_API_KEY=PASTE_PERPLEXITY_KEY
SERP_API_KEY=PASTE_DATAFORSEO_BASE64
STRIPE_SECRET_KEY=PASTE_STRIPE_LIVE_SECRET
STRIPE_WEBHOOK_SECRET=PASTE_WHSEC
STRIPE_PRICE_ID_KIT=price_1TlZ7QJd5OWcDDzU7mUvTow8
STRIPE_PRICE_ID_GROWTH=price_1TlZ7LJd5OWcDDzUjC4BhgIz
STRIPE_PRICE_ID_GROWTH_ANNUAL=price_1TlZ7MJd5OWcDDzUGkXW2Nvh
STRIPE_PRICE_ID_AGENCY=price_1TmM1lJd5OWcDDzUeTLwZny1
STRIPE_PRICE_ID_AGENCY_ANNUAL=price_1TmM1vJd5OWcDDzUoZehN3P8
STRIPE_FOUNDER_COUPON_ID=FOUNDER30
RESEND_API_KEY=PASTE_RESEND_KEY
EMAIL_FROM=Ozvor <hello@ozvor.com>
```

### 1.2 Serviço `worker` (⭐ é onde as auditorias + a nutrição rodam)
```
DATABASE_URL=PASTE_SUPABASE_SESSION_POOLER_5432_URL?sslmode=require
REDIS_URL=${{Redis.REDIS_URL}}
SUPABASE_URL=https://wdeabrzpgshnouvnfvml.supabase.co
SUPABASE_SERVICE_ROLE_KEY=PASTE_SERVICE_ROLE_KEY
APP_DB_ROLE=app_user
ANTHROPIC_API_KEY=PASTE_ANTHROPIC_KEY
OPENAI_API_KEY=PASTE_OPENAI_KEY
GEMINI_API_KEY=PASTE_GEMINI_KEY
PERPLEXITY_API_KEY=PASTE_PERPLEXITY_KEY
SERP_API_KEY=PASTE_DATAFORSEO_BASE64
RESEND_API_KEY=PASTE_RESEND_KEY
EMAIL_FROM=Ozvor <hello@ozvor.com>
```
⚙️ **Garanta o worker com ≥1 réplica e sempre ligado** (Railway → worker → Settings) — BullMQ só dispara o monitoramento semanal e a nutrição com o worker conectado.

### 1.3 Serviço `web` (⚠️ são **build-time** — após colar, force um redeploy)
```
NEXT_PUBLIC_SUPABASE_URL=https://wdeabrzpgshnouvnfvml.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PASTE_ANON_KEY
INTERNAL_API_URL=https://api-production-2052.up.railway.app
NEXT_PUBLIC_SITE_URL=https://ozvor.com   (canônico/OG/metadata + base da API pública /api/v1)
NEXT_PUBLIC_CALENDLY_URL=PASTE_SEU_LINK_CALENDLY   (opcional — ativa /book)
```

### 1.4 Onde pegar cada chave
| Chave | Endereço |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | supabase.com/dashboard/project/wdeabrzpgshnouvnfvml/settings/api |
| `DATABASE_URL` | mesmo dashboard → **Connect** → **Session pooler (5432)** → adicionar `?sslmode=require` |
| `OAUTH_TOKEN_KEY` | gerar: `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | console.anthropic.com/settings/keys |
| `OPENAI_API_KEY` | platform.openai.com/api-keys |
| `GEMINI_API_KEY` | aistudio.google.com/app/apikey |
| `PERPLEXITY_API_KEY` | perplexity.ai/account/api/keys |
| `SERP_API_KEY` | app.dataforseo.com/api-access → `base64("login:password")` |
| `STRIPE_SECRET_KEY` | dashboard.stripe.com/apikeys (sk_live_…) |
| `STRIPE_WEBHOOK_SECRET` | criar webhook (→ §2) e copiar o `whsec_…` |
| `RESEND_API_KEY` | resend.com/api-keys |

---

## 2. STRIPE — o que falta (catálogo já resolvido por mim ✅)

- ✅ **Preços corretos** (Kit $29, Growth $99/$1.188, Agency $549/$6.588) + cupom **FOUNDER30** (30%, anual). Os price IDs já estão no §1.1.
- ⚙️ **Criar o webhook:** dashboard.stripe.com/webhooks → **Add endpoint** → URL `https://api-production-2052.up.railway.app/api/billing/webhook` → eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` → **Reveal signing secret** → colar em `STRIPE_WEBHOOK_SECRET` (§1.1). ⭐ A API exige isso.
- ⚙️ **Ativar pagamento rápido:** Settings → Payments → **Payment methods** → garantir **Link**, **Apple Pay**, **Google Pay** ligados (na Hosted Checkout o Apple Pay funciona sem verificar domínio). Link já costuma vir ligado.
- ⚙️ **Customer Portal:** dashboard.stripe.com/settings/billing/portal → **Activate**.
- 🧹 Depois que o env do Agency apontar pros preços novos (§1.1), me avise que **eu arquivo os preços antigos de $149** (`price_1TlZ7O…` / `price_1TlZ7P…`) via MCP — não faço antes pra não quebrar checkout.

---

## 3. SUPABASE
- ✅ Banco 100% migrado (inclui nurture, brand_model_settings, lead sector/country, e **api_key** da API pública D2 — todas aplicadas via MCP).
- ⚙️ **Auth → URL Configuration:** adicionar `https://web-production-842ee.up.railway.app/dashboard` (e `https://ozvor.com/dashboard` após DNS) à allowlist de redirect → login/magic-link funciona.

---

## 4. DNS (Hostinger → Cloudflare recomendado)
1. Apontar `ozvor.com` pro domínio web do Railway (apex não faz CNAME na Hostinger → use Cloudflare CNAME-flattening, ou `www` CNAME + redirect 301 do apex). Railway → web → Settings → Networking → Add custom domain (ele mostra o alvo CNAME + TXT).
2. **NÃO mexer nos registros MX** (mantém email funcionando).
3. Depois que resolver + emitir o cert: `WEB_ORIGIN=https://ozvor.com` (api) + adicionar à allowlist do Supabase (§3).

---

## 5. NO PRODUTO (depois de 1–3)
1. **Signup** no web → confirmar que cai no dashboard (prova que auth funciona).
2. **Criar sua marca com região = US** (todos os 5 motores; EU bloqueia 3).
3. Assinar um plano (ou aplicar o cupom founder).
4. **Ligar o monitoramento semanal** da marca → registra a auditoria recorrente (segunda 06:00 UTC).
5. Rodar 1 auditoria manual = seu **baseline**. O gráfico de evolução do score é o seu print/vídeo semanal.
6. (Opcional, D2) **API pública:** crie uma chave em **/account/api-keys** e puxe seus Ozvor AI Visibility Scores via `GET https://ozvor.com/api/v1/brands` (header `Authorization: Bearer ozk_live_…`). Read-only, 120 req/min. Rate-limit por chave usa Upstash — se `UPSTASH_*` não estiver setado, ele libera (fail-open).

---

## 5b. GOOGLE — "Connect your data" (GA4 + Search Console no dashboard)

O conector nativo já está no ar (aba **Connections** do dashboard), mas mostra
"não configurado" porque faltam 3 variáveis. É 1 OAuth client no Google Cloud
(~10 min), sem custo:

1. **console.cloud.google.com** → criar/usar um projeto → **APIs & Services**:
   - **Enable APIs**: "Google Analytics Data API" e "Google Search Console API".
   - **OAuth consent screen**: External → nome "Ozvor", domínio `ozvor.com`,
     scopes: `analytics.readonly` + `webmasters.readonly` (read-only, nada de escrita).
2. **Credentials → Create credentials → OAuth client ID** → tipo **Web application**:
   - Authorized redirect URI (exatamente): `https://ozvor.com/api/google/callback`
3. **Railway (serviço `api`)** — colar as 3 variáveis:
   | Variável | Valor |
   |---|---|
   | `GOOGLE_OAUTH_CLIENT_ID` | do passo 2 |
   | `GOOGLE_OAUTH_CLIENT_SECRET` | do passo 2 |
   | `GOOGLE_OAUTH_REDIRECT_URI` | `https://ozvor.com/api/google/callback` |
4. Prova: `curl https://ozvor.com/api/google/status` → `{"configured":true}`.
   No dashboard, Connections → "Optional: connect your data" → **Connect** vira
   1 clique (o cliente autoriza no Google e volta pro dashboard conectado).

Tokens ficam criptografados (AES) no banco; escopo só-leitura; o callback
valida state anti-CSRF de uso único.

---

## 6. CONTEÚDO / OPCIONAL
- **Vídeos do blog:** os slots de vídeo estão escondidos até você publicar. Grave (ex.: seus vídeos de case study), suba no YouTube, e troque os `youtubeId` em `apps/web/src/app/(marketing)/blog/posts.ts` (eu posso fazer essa troca quando você me passar os IDs). A plataforma NÃO gera vídeo — gera texto.
- **Calendly:** `NEXT_PUBLIC_CALENDLY_URL` no web → ativa `/book` e os botões "Book a call".
- **Emails branded (Supabase Auth):** opcional — Supabase SMTP via Resend + os 4 templates em `docs/runbooks/email-templates/` (guia: `docs/runbooks/branded-auth-emails.md`).

---

## ✅ CHECKLIST FINAL (ordem de impacto)
1. ⭐🔑 Chaves de engine (OPENAI/GEMINI/PERPLEXITY/SERP/ANTHROPIC) no **api + worker** → auditoria real.
2. ⭐🔑 Core do api+worker: DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OAUTH_TOKEN_KEY, REDIS_URL ref, APP_DB_ROLE, WEB_ORIGIN.
3. ⭐🔑 Web build args: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + INTERNAL_API_URL → login funciona.
4. ⭐⚙️ Stripe webhook + `STRIPE_WEBHOOK_SECRET` + ativar Customer Portal + wallets.
5. ⭐⚙️ Supabase redirect allowlist + worker contínuo (≥1).
6. 🔑 RESEND_API_KEY (api+worker) + domínio Resend → nutrição + bônus por email.
7. ⚙️ DNS ozvor.com → flip WEB_ORIGIN.
8. ⚙️ No produto: marca US + monitoramento semanal + baseline.

_O Railway MCP está **desconectado agora** (precisa de `railway login` de novo no seu lado). Quando reconectar, eu seto todos os NÃO-secretos (price IDs, WEB_ORIGIN, APP_DB_ROLE, SUPABASE_URL, INTERNAL_API_URL, NEXT_PUBLIC_SITE_URL, EMAIL_FROM, cupom, Redis ref) por você — aí só sobram as chaves secretas (🔑) pra você colar._
