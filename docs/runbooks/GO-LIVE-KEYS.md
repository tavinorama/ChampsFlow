# TrustIndex AI — Go-Live Keys & Config (exact addresses)

Everything you must set to make the funnel 100% ready, **where to get each value**, and **where to paste it**. Do it top to bottom. Tags: **[REQ]** = required for your case study (real multi-engine audit + weekly monitoring); **[NTH]** = nice-to-have.

**Your accounts (IDs already provisioned):**
- Supabase project: `wdeabrzpgshnouvnfvml` → dashboard `https://supabase.com/dashboard/project/wdeabrzpgshnouvnfvml`
- Railway project `trustindex-ai` → `https://railway.com/project/c3fc5744-b987-4070-9b02-51593d1c4e01` (services: **api**, **worker**, **web**)
- Stripe (live) → `https://dashboard.stripe.com`
- API URL: `https://api-production-2052.up.railway.app` · Web URL: `https://web-production-842ee.up.railway.app`

**How to set a variable in Railway:** open the project → click the service (api / worker / web) → **Variables** tab → **New Variable** → paste → it redeploys automatically. For the **web** service, variables are picked up at **build** time (the Dockerfile already declares them as build args).

---

## 1. Provider / AI engine keys — the heart of your case study

Set these on **BOTH the `api` and the `worker`** services (the worker runs the weekly audits).

| Var | Where to GET it (exact URL) | Tag |
|---|---|---|
| `ANTHROPIC_API_KEY` | `https://console.anthropic.com/settings/keys` → Create Key (already on api — **add to worker too**) | [REQ] |
| `OPENAI_API_KEY` | `https://platform.openai.com/api-keys` → Create new secret key | [REQ] |
| `GEMINI_API_KEY` | `https://aistudio.google.com/app/apikey` → Create API key | [REQ] |
| `PERPLEXITY_API_KEY` | `https://www.perplexity.ai/account/api/keys` (Settings → API) → Generate | [REQ] |
| `SERP_API_KEY` | **DataForSEO**: `https://app.dataforseo.com/api-access` → copy your **login + password** → the value is **base64("login:password")** (run `echo -n 'login:password' \| base64`). Powers Google AI Overview + Reddit + off-site authority. | [REQ] |

> Without OpenAI/Gemini/Perplexity/SERP the audit runs in **mock/demo** mode — fine to launch, but your "I appear across all engines" proof needs them live.

---

## 2. Supabase (auth + database)

Page for keys: **`https://supabase.com/dashboard/project/wdeabrzpgshnouvnfvml/settings/api`** (API → Project API keys).

| Var | Where / value | Set on | Tag |
|---|---|---|---|
| `SUPABASE_URL` | `https://wdeabrzpgshnouvnfvml.supabase.co` | api, worker | [REQ] |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → **`service_role`** secret (⚠️ secret, server-only) | api, worker | [REQ] |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wdeabrzpgshnouvnfvml.supabase.co` | **web** (build) | [REQ] |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page → **`anon` / publishable** key | **web** (build) | [REQ] |
| `DATABASE_URL` | dashboard → **Connect** (top bar) → **Session pooler** (port **5432**) → append **`?sslmode=require`**. Do NOT use the Transaction pooler (6543) — the app uses prepared statements. | api, worker | [REQ] |
| `OAUTH_TOKEN_KEY` | generate: `openssl rand -hex 32` (any 32+ char secret) | api | [REQ] |
| `APP_DB_ROLE` | literal value `app_user` | api, worker | [REQ] |

**Auth redirect allowlist** (so magic-link/login returns work): **`https://supabase.com/dashboard/project/wdeabrzpgshnouvnfvml/auth/url-configuration`** → add `https://web-production-842ee.up.railway.app/dashboard` and `https://trustindexai.com/dashboard` (Site URL + Redirect URLs). [REQ]

---

## 3. Stripe (payments)

| Var / action | Where (exact URL) | Tag |
|---|---|---|
| `STRIPE_SECRET_KEY` | `https://dashboard.stripe.com/apikeys` → **Secret key** (`sk_live_…`) (already set) | [REQ] |
| `STRIPE_WEBHOOK_SECRET` | `https://dashboard.stripe.com/webhooks` → **Add endpoint** → URL `https://api-production-2052.up.railway.app/api/billing/webhook` → events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` → after creating, **Reveal signing secret** (`whsec_…`). ⚠️ The API throws on boot without this. | [REQ] |
| `STRIPE_PRICE_ID_GROWTH` / `_AGENCY` / `_GROWTH_ANNUAL` / `_AGENCY_ANNUAL` / `STRIPE_PRICE_ID_KIT` | `https://dashboard.stripe.com/products` → open each product → copy its **price ID** (`price_…`) (catalog already created — verify they're set on api) | [REQ] |
| `STRIPE_FOUNDER_COUPON_ID` | `https://dashboard.stripe.com/coupons` → the 30% founder coupon → copy ID | [REQ] |
| Customer Portal | `https://dashboard.stripe.com/settings/billing/portal` → **Activate** (enable cancel + invoice history) | [REQ] |

Set the vars on the **api** service.

---

## 4. Core API/worker vars (mostly already set — verify)

| Var | Value | Set on |
|---|---|---|
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (Railway reference to the Redis service — must be the SAME instance on api + worker) | api, worker [REQ] |
| `WEB_ORIGIN` | `https://web-production-842ee.up.railway.app` now; switch to `https://trustindexai.com` after DNS | api [REQ] |
| `INTERNAL_API_URL` | `https://api-production-2052.up.railway.app` | **web** (build) [REQ] |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` | `https://upstash.com` → create a free Redis → REST URL+token (powers the rate limiters; without them rate-limit just no-ops) | api [NTH] |

**Worker must be scaled ≥1 and run continuously** — BullMQ weekly jobs only fire while the worker is connected. Railway → worker service → ensure 1 replica, not sleeping.

---

## 5. Email (optional — for bonus delivery + branded auth emails)

| Var / action | Where | Tag |
|---|---|---|
| `RESEND_API_KEY` | `https://resend.com/api-keys` → Create | [NTH] |
| `EMAIL_FROM` | e.g. `TrustIndex AI <no-reply@trustindexai.com>` | [NTH] |
| Verify sending domain | `https://resend.com/domains` → add `trustindexai.com` → add the SPF/DKIM DNS records | [NTH] |
| Branded auth emails | Supabase → Auth → SMTP + paste templates — full steps in `docs/runbooks/branded-auth-emails.md` | [NTH] |

Set on **api** (and worker for completeness).

---

## 6. Calendly + blog videos (optional)

| Var / action | Where |
|---|---|
| `NEXT_PUBLIC_CALENDLY_URL` (web, build) | your `https://calendly.com/<you>/<event>` link → enables `/book` + "Book a call" buttons (falls back to /test if unset) |
| Real video IDs | edit `apps/web/src/app/(marketing)/blog/posts.ts` → replace the `PLACEHOLDER_VIDEO_*` YouTube IDs |

---

## 7. DNS — put it on your real domain (Hostinger → Cloudflare recommended)

1. Point `trustindexai.com` at the Railway **web** domain (apex can't CNAME on Hostinger → use Cloudflare CNAME-flattening, or `www` CNAME + apex 301 redirect). In Railway → web → Settings → Networking → add custom domain → it shows the CNAME target + TXT to add.
2. **Do not touch your MX records** (keeps email working).
3. After it resolves + the cert issues: set `WEB_ORIGIN=https://trustindexai.com` (api) and add `https://trustindexai.com/dashboard` to the Supabase redirect allowlist (§2).

---

## 8. Final in-product steps (after the above)

1. Go to the web app → **sign up** (confirm you land on the dashboard — proves auth works).
2. **Create your brand** with **region = US** (so all 5 engines run; EU gates 3 of them).
3. Put your tenant on a paid plan (or apply the founder coupon).
4. **Toggle weekly monitoring ON** for the brand → registers the Monday 06:00 UTC recurring audit.
5. The **TrustIndex Score over time** chart on the brand page is your weekly screenshot. For a faster first video, also run a manual audit now to set your baseline.

---

### One-screen summary of what's still missing (from the live check)
- **[REQ] OPENAI_API_KEY, GEMINI_API_KEY, PERPLEXITY_API_KEY, SERP_API_KEY** on **api + worker** (live check shows these 4 not connected).
- **[REQ] Verify** STRIPE_WEBHOOK_SECRET + price IDs + founder coupon + Customer Portal active.
- **[REQ] Verify** the **web** build vars: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + INTERNAL_API_URL.
- **[REQ]** Supabase redirect allowlist + worker running continuously.
- **[NTH]** Resend, Calendly, real video IDs, DNS.

*TrustIndex AI · trustindexai.com · keep this with BRAND-GUIDE.md.*
