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

## ✅ Launch-eve status (verified 2026-07-12, QA audit)

**The product IS live.** Phases 0–5 of this runbook are DONE and verified in
production; this doc is now the *reference* for how it was stood up and how to
verify/rebuild it — not a to-do list. Evidence (all re-checked 2026-07-12):

- **Web/API/worker deployed** (Railway) — `https://ozvor.com` + all 23 public
  routes return 200; link crawler: 45/45 sitemap+nav URLs 2xx.
- **API healthy + LIVE mode** — `/healthz` `{postgres: ok, redis: ok}`;
  `/api/system/capabilities` reports `mode: "live"` with anthropic, openai,
  gemini, perplexity, serp, Supabase auth and Stripe billing all connected.
- **DB migrations current** on Supabase prod (applied via Supabase MCP as
  written; see the Phase 2 note + the ⚠️ migration-path warning below).
- **Stripe catalog LIVE in USD** — Growth $99/mo, Agency $549/mo (+annual),
  Kit $29 one-time, FOUNDER30 coupon (annual-only, verified count, no fake
  scarcity). Ozvor Pages $99 exists but is intentionally OFF (env unset).
- **Security posture** — the 2026-07 Hermes audit (issues #261/#262) is fully
  remediated in code: 8 PRs merged 2026-07-11/12 (#256–#268) incl. the billing
  CRITICAL session-binding fix, XFF rate-limit fix, CSS-injection fix, DPA
  fail-closed gate, fail-closed money guards, and launch polish.
- **Daily automated QA** — `.github/workflows/link-crawl.yml` (07:00 UTC) +
  nightly E2E (06:00 UTC).

**What remains is founder-held** (see `docs/launch/2026-07-13-launch-readiness.md`
for the launch-eve checklist): the paid-path smoke on issue #261, LinkedIn post
approval, the Stripe payment-methods check, Encarregado/Art. 27 paperwork, and
sub-processor DPA confirmations.

> ⚠️ **Migration deploy path**: Railway auto-deploy does NOT run DB migrations,
> and the manual `deploy.yml` workflow is disabled-by-design (its old runs show
> failures — that is expected; it is manual-only). Prod migrations are applied
> deliberately via the Supabase MCP / `npm run db:migrate` at merge time. When
> a PR contains a migration, applying it to prod is an explicit step — never
> assume the merge did it.

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
**api:** 🔑`DATABASE_URL`, 🔑`REDIS_URL`, ⚙️`SUPABASE_URL`, 🔑`OAUTH_TOKEN_KEY` (64-hex — `openssl rand -hex 32`), 🔑`ANTHROPIC_API_KEY`, 🔑`OPENAI_API_KEY`, 🔑`PERPLEXITY_API_KEY`, 🔑`GEMINI_API_KEY`, 🔑`SERP_API_KEY`, 🔑`STRIPE_SECRET_KEY`, 🔑`STRIPE_WEBHOOK_SECRET`, ⚙️`STRIPE_PRICE_ID_GROWTH/AGENCY` + ⚙️`STRIPE_PRICE_ID_KIT` (match the USD catalog Price IDs already created in Stripe; `STRIPE_PRICE_ID_PAGES` stays UNSET until Pages launch), ⚙️`DPA_CURRENT_VERSION=1.0` (**REQUIRED in production** — since PR #267 the API refuses to boot without it, fail-closed DPA gate; a blank-log "Starting Container" crash loop is the symptom of forgetting it), 🔑`UPSTASH_REDIS_REST_URL` + 🔑`UPSTASH_REDIS_REST_TOKEN` (rate limiting — incl. the D2 public-API per-key limit; fail-open if unset), ⚙️`WEB_ORIGIN=https://ozvor.com`, ⚙️`APP_DB_ROLE=app_user` (default), ⚙️`NODE_ENV=production`, ⚙️`TRUST_CF_CONNECTING_IP` + `TRUSTED_PROXY_HOPS` (optional; defaults are correct in production — see `apps/api/src/lib/client-ip.ts`)
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

## Phase 5 — Stripe (✅ DONE — live USD catalog; BRL/Pix optional later)

**Live catalog (verified on /pricing 2026-07-12):** Growth **$99/mo**, Agency
**$549/mo** (+ annual Prices), **Get-Cited Kit $29** one-time, **Ozvor Pages
$99** one-time (Price exists; env intentionally unset = feature OFF), coupon
**FOUNDER30** (30% off, annual-only, first-100 with live verified count).
Webhook endpoint + signing secret are configured on the prod API.

**Webhook events the endpoint MUST be subscribed to** (Dashboard → Developers →
Webhooks → the `/api/billing/webhook` endpoint → "Listening to"). The launch-eve
smoke (2026-07-12, issue #261) caught the endpoint subscribed to only the first
four — the `charge.refunded` from the refund test was never delivered (Stripe
does not deliver events to endpoints that weren't subscribed at emission time,
and won't redeliver them after you subscribe):

| Event | Handler does |
|---|---|
| `checkout.session.completed` | Kit/Pages/subscription grant (only when `payment_status ∈ {paid, no_payment_required}`) |
| `customer.subscription.updated` / `.deleted` | plan state sync |
| `invoice.payment_failed` | past-due flag |
| `charge.refunded` (#271) | FULL refund → revoke Kit token / Pages credit; subscription → local cancel + free (Stripe-side cancel stays manual — watch `stripe_subscription_revoked_local_only`) |
| `charge.dispute.created` (#271) | always revoke (fail-closed; 500 → Stripe retries) |
| `checkout.session.async_payment_succeeded` / `_failed` (#271) | delayed methods settle → grant / mark `failed` |

> ⚠️ **Order when re-creating this setup**: apply migration `20260712000002`
> (adds the `refunded`/`failed` statuses) BEFORE subscribing the new events — a
> `charge.refunded` arriving against the old CHECK constraint puts the webhook
> into a retry loop. Partial refunds intentionally do NOT revoke.

Remaining/optional:
1. ~~Create Products → Prices~~ ✅ done (USD; the old €99/€149 plan is superseded).
2. Brazil BRL + Pix/boleto Prices — **optional, future** (US-first launch; the
   MEI entity exists if/when this is wanted).
3. Stripe Tax for EU VAT — revisit when EU sales open.
4. 🧑 **Pre-launch check (5 min):** Dashboard → Settings → Payment methods —
   keep only instant-confirmation methods enabled (card/Apple Pay/Google Pay/
   Link). The webhook trusts `checkout.session.completed` without a
   `payment_status` re-check, so delayed-notification methods (boleto etc.)
   must stay OFF until that gate ships.

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

Tracked in `docs/compliance/`. Status re-verified against the gate log 2026-07-12.
**US-first launch note:** the EU Art. 27 rep and BR Encarregado obligations are
triggered by *serving EU/BR users*; a US-first soft launch defers them by intent
— but nothing geo-gates signups, so they stay on the founder's launch-week list.

- [x] legal-privacy-officer ratifies the Brazil/LGPD regulatory-map entry — ✅ done 2026-06-09 (gate-log, Gate 3→4)
- [x] Gate 3→4 **DPIA** produced — ✅ APPROVED_W_CONDITIONS 2026-06-09 (gate-log; conditions GEO-D1/D3 below)
- [x] Entity identity public — ✅ razão social (MEI), CNPJ 67.609.444/0001-08 + registered address live on /privacy-policy (verified 2026-07-12)
- [ ] 🧑 **EU Art. 27 representative** appointed — open; required before onboarding EU users (GEO-D1 also open: provider EU-path/SCC confirmations)
- [ ] 🧑 **Encarregado** (LGPD DPO) formally named — open. ⚠️ The live Privacy Policy currently *states* one "has been appointed" (dpo@ozvor.com); the cleanest fix is the founder formally self-appointing today and recording it in the ROPA — otherwise the page wording must be softened. Required before onboarding BR users (GEO-D3: BR→US transfer basis).
- [ ] 🧑 **Per-provider DPAs** confirmed — all 11 rows in `docs/departments/legal/STATE.md` are "UNCONFIRMED — founder to verify" (most are clickwrap already accepted at account creation; ~1–2h of confirming + marking the tracker)
- [ ] FTC disclosure wording (GEO-A1) — restated post-hoc: the Reddit module already shipped with disclosure copy in-product; **external-counsel sign-off outstanding** (queue for launch month; keep Reddit participation manual meanwhile)
- [ ] **Gate 7 verdict** — no pre-launch sign-off is logged in `gate-log.md`. Either dispatch the council for a fast Gate 7 pass (most conditions verifiably closed in code) or log an explicit founder waiver for the soft launch.

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

## "Demo → Live" switch (✅ FLIPPED — live since 2026-07-08)

Provider keys are set on api + worker; `GET /api/system/capabilities` reports
`"mode": "live"` (re-verified 2026-07-12) — audits hit real engines with
`repeat` confidence. Keep this section as the **verification/rollback
reference**: if capabilities ever reports `"demo"` in prod, a provider key was
lost — treat it as an incident (the integrity guard forbids mock scores in
production). Customers can also bring their own keys via `/account/integrations`
(BYOK).

---

## Fastest path to first revenue (updated 2026-07-12 — infra steps all DONE)

The original 4 steps (keys → migrate → deploy → DNS) are complete. What actually
stands between today and first revenue:

1. 🧑 **Paid-path smoke** (issue #261 "Mandatory smoke before sale"): one
   controlled Kit $29 checkout end-to-end — checkout → webhook → delivery email
   → `/kit/[token]` renders → refund. ~15 min. This is the Hermes gate on
   unrestricted paid traffic.
2. 🧑 Stripe Dashboard payment-methods check (see Phase 5 item 4).
3. 🧑 Approve the 3 drafted LinkedIn launch posts + send-yourself test on
   `support@ozvor.com`.
4. **Announce** (founder post) → free tests → Kit → Growth/Agency conversations.
