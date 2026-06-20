# TrustIndex AI — Client Journey, BYOK Cost Model & Operations

> Verified against code (3-investigator audit, 2026-06-13). Clearly marks
> **BUILT** vs **INTENDED (not yet wired)** so it doubles as the spec for the
> remaining work. The founder's question — "my key for the preliminary analysis,
> the client's key for their internal/content work — is that in the project?" —
> answered honestly below: **it is the design intent, but NOT implemented yet.**

---

## 1. The API-cost / BYOK boundary (BEGIN · MIDDLE · END)

### Intended model (what the founder wants — the right margin model)
| Phase | What happens | Whose API key pays |
|---|---|---|
| **BEGIN** — acquisition | Free **AI Invisibility Test** + first **TrustIndex Score audit** ("does the brand appear in AI?") | **YOUR (platform) key** — it's the free wedge / loss-leader |
| **MIDDLE** — paid monitoring | Weekly re-audits, competitor/off-site tracking | Platform key within plan limits **→** client key above a threshold |
| **END** — client-internal | **Content generation** (blog/LinkedIn/FAQ), the client's deep/ongoing work | **CLIENT'S OWN key (BYOK)** — they pay their AI costs |

This protects your margin: you only pay for the cheap, bounded "show them the gap" step; the expensive, open-ended content/analysis runs on the client's own provider account.

### Current reality (CODE TRUTH — verified)
- **Everything runs on the PLATFORM key today.** Both the audit AND content generation read `process.env` (your keys) — `content-studio.ts:149`, all 5 probe adapters, `offsite-signal.ts:96`, `reddit-signal.ts:112`.
- **BYOK is HALF-built:** clients can SAVE their keys (`POST /api/account/provider-keys`, encrypted AES-256-GCM, `provider_keys` table, RLS-isolated) and list/delete them — but the stored key is **never decrypted or used**. The only query on the table is `SELECT provider` (presence only); `key_encrypted` is written and never read (`system.ts:37`).
- **No key-selection logic exists** — nothing chooses platform-vs-client key by operation or plan tier. The UI string "platform key or your own (BYOK)" (`system.ts:143`) is aspirational.
- **Net:** the deep client-internal content work currently runs on YOUR key — the opposite of the intended model.

### What it takes to build the intended model (spec)
1. **Key-resolution layer:** a function `resolveProviderKey(tenantId, provider) → plaintext` that loads the tenant's `provider_keys` row and decrypts it with `decryptToken` (already proven for OAuth tokens). Returns platform `process.env` key as fallback.
2. **Thread the key through:** add an optional `apiKey` to `ProbeCallOptions` (`types.ts`) and to `generateContent(...)`; adapters use the passed key if present, else `process.env`.
3. **Policy:** audit/free-test path → always platform key. Content-generation + (optionally) heavy monitoring → client BYOK key required (or a plan that includes platform-paid generation). Enforce: if a paid tier requires BYOK and none is set, block with a clear "connect your AI key" message.
4. **(Optional) metering:** count platform-key audit calls per tenant against `prompts_per_audit` so the free/cheap step stays bounded.

→ Effort: ~1 focused build (the crypto + storage + UI already exist; it's wiring + a policy). Tracked as a recommended next task.

---

## 2. End-to-end client journey (as built)

```
STRANGER
  └─ Landing → "Free AI Invisibility Test" (/test, PUBLIC, no account)
       → instant scorecard + email captured (lead_capture)        [YOUR key]
  └─ Upsell → "Get-Cited Kit" $29 (/kit, PUBLIC, Stripe one-time)
       → full audit + 3 fixes + 3 drafts                          [YOUR key today]

SIGN UP  (/login — passwordless Supabase magic-link)
  └─ ⚠️ GAP: a brand-new user has NO tenant_id yet → API returns 401.
     Today onboarding is MANUAL (you set the user's tenant in Supabase) or
     dev-bypass. Self-service signup does NOT work until provisioning is built.

AUTHENTICATED APP (after the user has a tenant_id + role)
  └─ /dashboard      — all their brands + latest TrustIndex Score + weekly-monitoring toggle
  └─ /brands         — add a brand, run an audit
  └─ /brands/[id]    — ⭐ the score + 3-vector breakdown + evidence + competitors
                        + Reddit + entity + GEO plan + Content Studio (drafts)
  └─ /account/integrations — connect AI/SERP keys (BYOK — stored, not yet used)
  └─ /account/connections  — OAuth (LinkedIn/Instagram/Facebook)
  └─ /account/billing      — Stripe checkout / billing portal
  └─ /account/data-privacy — DSR / do-not-sell (LGPD/GDPR/CCPA)
  └─ (/create, /schedule, /drafts/[id] — legacy social-post flow)

MONITORING (flywheel) — weekly re-audit cron when the brand toggle is ON
```

### How the client interacts (by role)
- **owner** — full control: add brands, run audits, generate content, billing, connect keys.
- **editor** — create/run/generate, no billing.
- **viewer** — read-only (all write methods blocked by `requireRole`).
Roles come from the Supabase JWT claim `app_metadata.app_role`; tenant from `app_metadata.tenant_id` (never from the request body).

---

## 3. How YOU (operator) control clients — today

There is **no admin panel**. You operate through external consoles + 2 UI-less endpoints:

| To do this | You use… |
|---|---|
| Onboard a client / set their tenant / role | **Supabase Auth console** — edit the user's `app_metadata`: `{ tenant_id, app_role, super_admin }` (read-only in code; "set manually only") |
| Change/comp/suspend a plan | **Stripe dashboard** (or the client's Stripe Billing Portal) → webhook syncs `tenants.plan_tier`. Cancel/past-due past grace = de-facto suspend (`requireActiveSubscription`) |
| Make yourself super-admin | Set `app_metadata.super_admin=true` by hand in Supabase |
| Fulfill a privacy request (DSR) | `POST /api/dsr/:id/fulfill` (super_admin) — **via curl/Bearer**, no UI. You learn the id from the ops email to `privacy@trustindexai.com` |
| See system status | `GET /api/system/capabilities` (which engines are live/demo) |
| Metrics | `GET /metrics` (Prometheus, super_admin) |
| Toggle a brand's weekly monitoring | client self-service (`PUT /api/brands/:id/monitoring`) |

**Roles in the system:** tenant-level `owner/editor/viewer` + platform-level `super_admin` (you). DB role `organicposts_admin` exists as a read-only SQL break-glass (Supabase SQL editor), not used by the app.

---

## 4. Gaps to make the journey production-real (prioritized)

> **Update 2026-06-18:** gaps #1–#6 were built this cycle (code written,
> typechecks clean, 514 unit/integration tests pass, +8 live RLS isolation
> tests pass against local Postgres). #1 (provisioning) and #2 (BYOK) still need
> a real Supabase + `SUPABASE_SERVICE_ROLE_KEY` / a live provider key to
> exercise end-to-end. #6 (runtime RLS) is now **enforced and proven** on the
> API request surface — the remaining residual is the background worker (runs
> unscoped with explicit `tenant_id` filters).

| # | Gap | Status | Impact | Effort |
|---|---|---|---|---|
| 1 | **No tenant provisioning** — self-service signup 401s (no code creates a tenant / sets `app_metadata`). | ✅ **Built** — `POST /api/account/bootstrap` (`onboarding.ts`) + `ensureProvisioned()` on dashboard mount create the tenant + user (owner) and set Supabase `app_metadata` via the Admin API, then refresh the session. **Needs `SUPABASE_SERVICE_ROLE_KEY` + real Supabase to verify.** | **Blocks self-serve SaaS.** | Medium |
| 2 | **BYOK not wired** — client keys stored but unused; all AI runs on your key. | ✅ **Built** — `resolveProviderKey()` (`system.ts`) decrypts the client key; content route passes it to `generateContent({apiKey})` which returns `keyUsed: client\|platform\|none`. Content → client key, falls back to platform. **Needs a live client key to verify the `client` path.** | Cost model holds. | Medium |
| 3 | **Plan limits not enforced** — `max_brands`/`competitors`/`prompts` never checked. | ✅ **Built + verified live** — `planLimitsFor()` in `audits.ts`; `POST /api/brands` and `POST …/competitors` 403 `PLAN_LIMIT_*` over the tier cap. (Smoke-tested: free tier, 2nd brand → 403.) | Clients held to tier. | Medium |
| 4 | **Billing bug — plan_tier CHECK** allows only `free/starter/pro` but code writes `growth/agency`. | ✅ **Fixed** — migration `20260613000001_plan_tier_widen` widens the CHECK to `free/starter/growth/agency/pro`. Applied to local pg (verified `growth` accepted). | Paid checkout completes. | Low |
| 5 | **Billing bug — `GET /api/billing/plan`** queries non-existent `revoked` column → 500. | ✅ **Fixed** — `revoked` → `revoked_at IS NULL` in `billing.ts`. | Plan page works. | Low |
| 6 | **Runtime RLS inert** (the audit's HIGH item) — isolation rests on explicit `WHERE tenant_id` filters, not RLS; `GET /api/brands` has no explicit filter. | ✅ **Built + verified live** — `requireAuth` now runs each authenticated request inside an AsyncLocalStorage tenant scope (`db/tenant-context.ts`); the db client wraps every tenant-scoped query in a transaction that sets `app.current_tenant_id` and drops into the non-superuser `app_user` role (`db/client.ts`), so `FORCE ROW LEVEL SECURITY` actually applies. Proven by a real 2-tenant test (`tests/integration/db/rls.test.ts`): cross-tenant SELECT/UPDATE/DELETE all return 0 rows; same-tenant works; superuser control sees both. **Residual: the BullMQ worker still runs unscoped (relies on explicit `tenant_id` filters) — see audit doc.** | Multi-tenant isolation enforced. | Done (API surface) |
| 7 | **No admin panel** — manage clients via Supabase + Stripe consoles. | ⚪ Deferred | Operationally manual (fine to start). | Optional later |

> **For launch:** single-operator, manual onboarding + selling the
> consultancy/Kit works TODAY. With #1–#6 built, self-serve signup, BYOK, plan
> enforcement, and **runtime RLS isolation** are in place — pending
> live-credential verification (#1/#2) and a worker-RLS follow-up. The API
> request surface is now safe for paid multi-tenant clients; provisioning and
> BYOK just need the production Supabase + provider keys wired to verify e2e.
