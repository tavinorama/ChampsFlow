# TrustIndex AI — Go-Live Runbook

> Step-by-step to take the product from "runs locally" to "live on the internet".
> Ordered by the critical path. Items marked 🧑 are founder-only (accounts/keys);
> 🤖 are already built/automated. Verified: all 16 migrations apply cleanly via
> `packages/db/scripts/migrate.js`; web/api/worker Docker images build & run.

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
| **Cloudflare** | DNS for trustindexai.com + organicposts.ai | nameservers |

> Minimum to run REAL audits for early users: **Supabase + Anthropic + Resend + Railway + Cloudflare**. The rest can follow.

---

## Phase 1 — Supabase setup (🧑)

1. Create a project (region `eu-central-1` for EU data residency).
2. Auth → enable Email (magic link). Set Site URL = `https://trustindexai.com`.
3. **Custom JWT claims** — add a hook / set `app_metadata` on users:
   `{ "tenant_id": "<uuid>", "app_role": "owner" }`. The API reads these
   (`apps/api/src/auth/middleware.ts`). Without `tenant_id`, auth returns 401.
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
- Applies all 16 migrations including geo_audit, competitors, provider_keys.

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
NEXT_PUBLIC_SUPABASE_URL = https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = <anon key>
```

### Environment variables per service
**web (runtime):** `INTERNAL_API_URL`, `RESEND_API_KEY`, `WAITLIST_FROM_EMAIL`
**api:** `DATABASE_URL`, `REDIS_URL`, `SUPABASE_URL`, `OAUTH_TOKEN_KEY` (64-hex — `openssl rand -hex 32`), `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `GEMINI_API_KEY`, `SERP_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_STARTER/GROWTH/AGENCY`, `STRIPE_PRICE_ID_KIT` (one-time $29), `WEB_ORIGIN=https://trustindexai.com`, `NODE_ENV=production`
**worker:** `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY` (+ other provider keys), `GEO_PROBE_REPEAT=3`

> ⚠️ **NEVER set `DEV_AUTH_BYPASS` in production.** It is hard-gated to
> `NODE_ENV !== production`, but do not set it regardless.

---

## Phase 4 — DNS (🧑, Cloudflare)

- `trustindexai.com` → web service (CNAME to Railway domain), proxied.
- `organicposts.ai` → web service too (the /organicposts page) or a separate deploy later.
- SSL: Cloudflare "Full (strict)". Email routing for `hello@`, `support@`, `dpo@`.

---

## Phase 5 — Stripe (🧑, needs the Brazil entity for BRL/Pix)

1. Create Products → Prices: Starter, Growth (€99), Agency (€149). Copy Price IDs.
2. For Brazil: enable Pix + boleto, add BRL Prices.
3. Webhook endpoint → `https://<api>/api/billing/webhook`; copy signing secret.
4. Stripe Tax for EU VAT.

---

## Phase 5.5 — Runtime tenant isolation (🔴 HIGH — before paid multi-tenant launch)

Audit 2026-06-13 found RLS + append-only are correctly DEFINED but not enforced
at runtime because the app connects as the Postgres **superuser** (superusers
bypass RLS + REVOKE), and the tenant variable isn't transaction-scoped on pooled
connections. Required before onboarding multiple paying tenants:

1. **Connect as a non-superuser role.** Create `app_user` WITH LOGIN, NOSUPERUSER,
   NOBYPASSRLS + the table grants the migrations define; point `DATABASE_URL` at
   it (api + worker). On Supabase, use the RLS-respecting pooled role (not the
   service-role key) for tenant traffic.
2. **Transaction-scope the tenant context.** Tenant-scoped reads/writes must run
   inside one transaction that begins with `set_config('app.current_tenant_id',
   $tid, true)` (refactor the PostgresClient to a `withTenant(tid, fn)` and adopt
   it across the ~39 route call sites). `set_config(local)` outside a transaction
   does not survive the connection pool.
3. **Prove it:** add a two-tenant insert/select isolation test run as `app_user`.
   The CI guard `packages/db/scripts/check-rls.sql` now covers all 23 RLS tables.

Until done, run as single-tenant (founder's own brands) only.

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
curl https://<api>/healthz                      # {"status":"ok",...}
curl https://<api>/api/system/capabilities      # mode should be "live"
# Sign in via magic link → create a brand → run an audit → see real citations
```

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
4. Point trustindexai.com DNS
→ **Run free GEO audits for waitlist users.** Stripe + entity follow for paid conversion.
