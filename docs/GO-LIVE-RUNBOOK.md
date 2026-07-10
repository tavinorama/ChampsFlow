# Ozvor — Go-Live Runbook

> Step-by-step to take the product from "runs locally" to "live on the internet".
> Ordered by the critical path. Items marked 🧑 are founder-only (accounts/keys);
> 🤖 are already built/automated. Verified: all migrations apply cleanly via
> `packages/db/scripts/migrate.js`; web/api/worker Docker images build & run.
>
> Brand note: the platform is **Ozvor** (ozvor.com). The 3-vector score is the
> **"Ozvor AI Visibility Score"** (founder rule 2026-06-27 — never reintroduce
> "TrustIndex" in user-facing display; the earlier "keeps TrustIndex AI Score"
> note is superseded), and the consultancy arm is **"OrganicPosts by Ozvor"**.

---

## Phase 0 — Accounts you must create (🧑, ~1–2 hours total)

| Account | Used for | What to grab |
|---|---|---|
| **Supabase** | Auth (magic link) + Postgres | Project URL, anon key, service-role key, DB connection string (pooled), JWKS URL |
| **Anthropic** | Audit probes (Claude) — v1 default | `ANTHROPIC_API_KEY` |
| **OpenAI** | Audit probes (ChatGPT) | `OPENAI_API_KEY` (optional) |
| **Perplexity** | Audit probes (real citations) | `PERPLEXITY_API_KEY` (optional) |
| **Google AI Studio** | Audit probes (Gemini) | `GEMINI_API_KEY` (optional) |
| **DataForSEO or SerpAPI** | Off-site signal + Google AI Overview | `SERP_API_KEY` (base64 login:password for DataForSEO) |
| **Stripe** | Billing | secret key, webhook secret, 3 subscription Price IDs (Starter/Growth/Agency) + **1 one-time Price for the $29 Get-Cited Kit** (`STRIPE_PRICE_ID_KIT`) |
| **Resend** | Waitlist + login emails | `RESEND_API_KEY` + verified sender domain |
| **Railway** | Hosting (web/api/worker/redis) | project + service tokens |
| **Cloudflare** | DNS for ozvor.com + organicposts.ai | nameservers |

> Minimum to run REAL audits for early users: **Supabase + Anthropic + Resend + Railway + Cloudflare**. The rest can follow.

---

## Phase 1 — Supabase setup (🧑)

1. Create a project (region `eu-central-1` for EU data residency). *(Already done:
   project `wdeabrzpgshnouvnfvml`.)*
2. Auth → enable Email (magic link). Set **Site URL** = `https://ozvor.com` and add
   **Redirect URLs** allowlist: `https://ozvor.com/**` (and `http://localhost:3000/**`
   for dev). Social login (Google + Microsoft) also redirects through these.
3. **Custom JWT claims** — add a hook / set `app_metadata` on users:
   `{ "tenant_id": "<uuid>", "app_role": "owner" }`. The API reads these
   (`apps/api/src/auth/middleware.ts`). Without `tenant_id`, auth returns 401.
   (First-login provisioning at `POST /api/account/bootstrap` mints the tenant.)
4. Copy: `SUPABASE_URL`, anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`),
   service-role key, and the **pooled** DB connection string.

---

## Phase 2 — Database migrations (🤖 runner ready)

```bash
# From the repo root, against your Supabase DB:
DATABASE_URL="postgresql://...supabase.pooler...:6543/postgres" \
  npm run db:migrate
```
- SSL is ON by default (required by Supabase). For a local/non-SSL DB add `PGSSL=disable`.
- Idempotent: re-running skips applied migrations (tracked in `schema_migrations`).
- Applies every migration in `packages/db/migrations/` including geo_audit,
  competitors, provider_keys, brand_model_settings, lead sector/country, and
  `api_key` (D2 public API). *(Prod is already current — these were applied via
  the Supabase MCP as they were written.)*

---

## Phase 3 — Deploy services to Railway (🤖 configs ready)

Three services, each with a `railway.json` pointing at its Dockerfile:

| Service | Dockerfile | Start cmd | Port |
|---|---|---|---|
| web | apps/web/Dockerfile | `node apps/web/server.js` | 3000 |
| api | apps/api/Dockerfile | `node dist/apps/api/src/index.js` | 3001 |
| worker | apps/worker/Dockerfile | `node dist/apps/worker/src/index.js` | — |

Add a **Redis** plugin (Railway or Upstash). Postgres is Supabase (Phase 1).

### web build args (CRITICAL — baked at build time)
`NEXT_PUBLIC_*` and `INTERNAL_API_URL` must be **build args**, not just runtime env:
```
INTERNAL_API_URL = https://<api-service>.railway.internal:3001
NEXT_PUBLIC_SITE_URL = https://ozvor.com        # canonical URL, OG/metadata, public-API base
NEXT_PUBLIC_SUPABASE_URL = https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = <anon key>
```

### Environment variables per service
Legend: 🔑 = **secret** (founder pastes — never commit/echo) · ⚙️ = **non-secret config** (safe to set via Railway MCP).

**web (runtime):** ⚙️`INTERNAL_API_URL`, ⚙️`NEXT_PUBLIC_SITE_URL=https://ozvor.com`, 🔑`RESEND_API_KEY`, ⚙️`WAITLIST_FROM_EMAIL`
**api:** 🔑`DATABASE_URL`, 🔑`REDIS_URL`, ⚙️`SUPABASE_URL`, 🔑`OAUTH_TOKEN_KEY` (64-hex — `openssl rand -hex 32`), 🔑`ANTHROPIC_API_KEY`, 🔑`OPENAI_API_KEY`, 🔑`PERPLEXITY_API_KEY`, 🔑`GEMINI_API_KEY`, 🔑`SERP_API_KEY`, 🔑`STRIPE_SECRET_KEY`, 🔑`STRIPE_WEBHOOK_SECRET`, ⚙️`STRIPE_PRICE_ID_GROWTH/AGENCY` + ⚙️`STRIPE_PRICE_ID_KIT` (match the USD catalog Price IDs already created in Stripe), 🔑`UPSTASH_REDIS_REST_URL` + 🔑`UPSTASH_REDIS_REST_TOKEN` (rate limiting — incl. the D2 public-API per-key limit; fail-open if unset), ⚙️`WEB_ORIGIN=https://ozvor.com`, ⚙️`APP_DB_ROLE=app_user` (default), ⚙️`NODE_ENV=production`
**worker:** 🔑`DATABASE_URL`, 🔑`REDIS_URL`, 🔑`ANTHROPIC_API_KEY` (+ other provider keys), ⚙️`GEO_PROBE_REPEAT=3`. **Scale to ≥1 replica** (the audit queue is processed here).

> ⚠️ **NEVER set `DEV_AUTH_BYPASS` in production.** It is hard-gated to
> `NODE_ENV !== production`, but do not set it regardless.

---

## Phase 4 — DNS (🧑, Cloudflare)

- `ozvor.com` → web service (CNAME to Railway domain), proxied. Add the custom
  domain on the Railway **web** service first, then point the CNAME at it.
- `organicposts.ai` → legacy 301 redirect to `https://ozvor.com` (verified live 2026-07-06, together with `trustindexai.com`; the /organicposts page lives on ozvor.com — no separate deploy).
- SSL: Cloudflare "Full (strict)". Email routing for `hello@`, `support@`, `dpo@`.
- After DNS resolves, set `NEXT_PUBLIC_SITE_URL=https://ozvor.com` (web) and
  `WEB_ORIGIN=https://ozvor.com` (api) — without these, OG/canonical URLs and CORS
  still point at the old/placeholder origin.

---

## Phase 5 — Stripe (🧑, needs the Brazil entity for BRL/Pix)

1. Create Products → Prices: Starter, Growth (€99), Agency (€149). Copy Price IDs.
2. For Brazil: enable Pix + boleto, add BRL Prices.
3. Webhook endpoint → `https://<api>/api/billing/webhook`; copy signing secret.
4. Stripe Tax for EU VAT.

---

## Phase 5.5 — Runtime tenant isolation (✅ DONE — shipped)

The 2026-06-13 audit found RLS defined but inert at runtime. **This is now fixed
and shipped** (see `apps/api/src/db/{client,tenant-context}.ts`):

1. ✅ Every tenant-scoped query runs inside a transaction that sets
   `app.current_tenant_id` and drops into the non-superuser `app_user` role, so
   RLS actually applies. The tenant flows through an `AsyncLocalStorage` scope
   established by `requireAuth` (and by `requireApiKey` for the public API).
2. ✅ Boot guard `assertAppDbRoleSafe()` refuses to serve traffic if `APP_DB_ROLE`
   is missing / a superuser / unassumable — RLS can never be silently off.
3. ✅ CI guard `packages/db/scripts/check-rls.sql` covers all RLS tables.

**Founder action:** point `DATABASE_URL` (api + worker) at a **non-superuser**
role that is a member of `app_user`. On Supabase, do NOT use the service-role
connection for tenant traffic. If your login role differs, set `APP_DB_ROLE`.

## Phase 6 — Compliance gates (⚖️ before EU/BR launch)

These are **hard launch blockers** tracked in `docs/compliance/`:
- [ ] legal-privacy-officer ratifies the 2026-05-30 Brazil/LGPD regulatory-map entry
- [ ] Gate 3→4 **DPIA** produced
- [ ] **EU Art. 27 representative** appointed (non-EU entity serving EU users)
- [ ] **Encarregado** (LGPD DPO) named + ANPD disclosures in Privacy Policy
- [ ] **Per-provider DPAs** (Anthropic, OpenAI, Perplexity, Google, DataForSEO, Supabase, Stripe)
- [ ] FTC disclosure wording (GEO-A1) finalized before Reddit module ships

---

## Phase 7 — Smoke test in production

```bash
curl https://ozvor.com/healthz                  # {"status":"ok",...}  (or https://<api>/healthz)
curl https://ozvor.com/api/system/capabilities  # mode should be "live"
# Sign in via magic link → create a brand → run an audit → see real citations

# D2 public API: create a key at /account/api-keys, then:
curl https://ozvor.com/api/v1/me \
  -H "Authorization: Bearer ozk_live_…"          # {tenant_id, plan, scopes}
curl https://ozvor.com/api/v1/brands \
  -H "Authorization: Bearer ozk_live_…"          # {data:[…brands + latest score]}
```

### Stripe (Phase 5) — also verify
- Webhook endpoint = `https://ozvor.com/api/billing/webhook`; resend a test event,
  confirm 200 + `STRIPE_WEBHOOK_SECRET` matches.
- Enable the **Customer Portal** (Billing → portal config) so `POST /api/billing/portal` works.

---

## "Demo → Live" switch

The product runs end-to-end on mock data today. The single change that flips it
to genuinely live: **set the provider keys** (`ANTHROPIC_API_KEY`, etc.) on the
api + worker services. `GET /api/system/capabilities` will then report
`"mode": "live"`, audits hit real engines, and `repeat` confidence kicks in.
No code change required — customers can also bring their own keys via
`/account/integrations` (BYOK).

---

## Fastest path to first revenue
1. Supabase + Anthropic + Resend keys → audits become real
2. `npm run db:migrate` against Supabase
3. Deploy 3 services to Railway + add Redis
4. Point ozvor.com DNS + set `NEXT_PUBLIC_SITE_URL` / `WEB_ORIGIN`
→ **Run free GEO audits for waitlist users.** Stripe + entity follow for paid conversion.
