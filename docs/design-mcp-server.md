# Design: Ozvor MCP Server

> **TL;DR (<=200 words).** Ozvor already has 90% of an MCP server: `apps/api/src/routes/api-keys.ts`
> ships an API-key-authed read API (`/api/v1/me`, `/brands`, `/brands/:id`, `/brands/:id/audits`,
> `/audits/:id`) plus an operator telemetry surface, with `ozk_live_` keys (240-bit entropy,
> SHA-256-only storage, soft revoke, 120 req/min per key) that resolve to a tenant and then run
> inside `runWithTenant()` so Postgres RLS enforces isolation as `app_user`. The missing piece is
> a protocol translator. This design adds ONE new Hono route module, `apps/api/src/routes/mcp.ts`,
> exposing stateless Streamable HTTP MCP at `POST /api/mcp`. Every tool call is dispatched as an
> internal sub-request through the existing `requireApiKey` middleware, so no MCP code ever touches
> the database and RLS cannot be bypassed by construction. Phase 1 ships 5 read tools in days.
> Phase 2 adds operator and competitor depth. Phase 3 adds the only tool that spends money,
> `ozvor_run_audit`, behind a new `write:audits` scope, an idempotency key, an explicit confirm
> flag, a fail-closed hourly limiter, and the three cost guards already enforced on the trigger
> route. New scope strings: `mcp`, `write:audits`, `write:content` (reserved).

---

## 0. Why this, why now

Peec AI ships API plus MCP as a data-portability differentiator, and gates the API to Enterprise
(`docs/marketing/research/competitor-analysis-peec-ai.md:20` and `:32`). Ozvor can ship MCP on
every paid tier because the auth, tenancy, and rate-limit substrate already exists and costs
nothing extra to expose.

The strategic shift is bigger than parity. Today a marketer opens ozvor.com to learn whether AI
assistants cite their brand. With an MCP server, the assistant itself can ask. Ozvor stops being
a website that people visit and becomes a tool that agents call, which is the same category shift
the product is selling to its customers.

**Scope of this document:** design only. No code is written by this document. Implementation
follows the normal branch, PR, CI, risk-gated approval flow in `AGENTS.md`.

---

## 1. What already exists (the 90%)

| Piece | Where | What it gives the MCP server |
|---|---|---|
| Key format and minting | `apps/api/src/routes/api-keys.ts:40` (`ozk_live_` prefix), `:41` (max 10 active keys), `generateApiKey()` | A credential an agent host can hold |
| Hash-only storage | `packages/db/migrations/20260626000004_api_key.up.sql` (`key_hash TEXT NOT NULL UNIQUE`) | Leaked DB does not leak usable keys |
| Auth middleware | `api-keys.ts:104` `requireApiKey(db)` | Hash lookup, revoke check (`:146`), scope gate (`:152`), rate limit (`:161`) |
| Tenant scoping | `api-keys.ts:181` `runWithTenant(key.tenant_id, () => next())` | Every downstream query runs as `app_user` under RLS |
| RLS enforcement | `20260626000004_api_key.up.sql`: `ENABLE` + `FORCE ROW LEVEL SECURITY`, `tenant_isolation` policy | The isolation guarantee itself |
| Rate limiting | `api-keys.ts:78` (120/min), `:81` `checkApiRateLimit()` | Per-key sliding window, already built |
| Read endpoints | `api-keys.ts:395`, `:405`, `:436`, `:477`, `:502` | The Phase 1 tool bodies, already written and tested |
| Operator endpoints | `api-keys.ts:533`, `:571`, `:586`, `:624` | The Phase 2 operator tool bodies |
| Future-proofed scopes | `scopes TEXT[]` column, documented as read-only at launch with the column reserving room for write scopes (`docs/05-impl-log.md:1506`) | Where the new scope strings go, with no migration |

The 10% that is missing: JSON-RPC framing, a tool catalog with descriptions and JSON Schemas,
scope-aware tool listing, and an `mcp` gate so existing keys do not silently gain a new surface.

---

## 2. Tool catalog

Naming convention: `ozvor_<verb>_<noun>`, lower snake case, prefixed so the tool set stays legible
when a host has merged tools from six servers. Descriptions are written **prescriptively** (they
say *when* to call, not only what the tool does), because current models reach for tools more
conservatively and a trigger condition in the description measurably raises the should-call rate.

Every tool returns JSON as its text content. Every output stays far below the ~100,000 character
threshold at which MCP tool output gets offloaded to a file by the host, so results always land
directly in the model's context.

### 2.1 Phase 1: read-only (ships first)

#### `ozvor_whoami`
- **Description:** "Confirm which Ozvor workspace this API key belongs to, which plan it is on,
  and which Ozvor tools are available. Call this first when you are unsure whether the Ozvor
  connection is working, or when the user asks what their Ozvor plan includes."
- **Input schema:** `{"type":"object","properties":{},"additionalProperties":false}`
- **Output shape:** `{ tenant_id, plan, scopes, tools_available: string[] }`
- **Wraps:** `GET /api/v1/me` (`api-keys.ts:395`). The `tools_available` array is computed by the
  MCP layer from the key's scopes, not by the route.
- **Required scope:** `mcp`

#### `ozvor_list_brands`
- **Description:** "List every brand tracked in this Ozvor workspace with its latest AI Visibility
  score (0 to 100). Call this whenever the user refers to a brand by name and you need its Ozvor
  brand id, or when they ask how their brands are performing in AI search overall."
- **Input schema:**
  ```json
  { "type": "object",
    "properties": {
      "limit":  { "type": "integer", "minimum": 1, "maximum": 50, "default": 25,
                  "description": "Maximum brands to return." },
      "cursor": { "type": "string", "description": "Opaque cursor from a previous call." } },
    "additionalProperties": false }
  ```
- **Output shape:** `{ data: [{ id, name, domain, category, region, monitoring_enabled,
  latest_score }], next_cursor: string | null }`
- **Wraps:** `GET /api/v1/brands` (`api-keys.ts:405`). `latest_score` is `geo_score.score_ai`, the
  Visibility score, matching the dashboard. Pagination is added by the MCP layer in Phase 1 by
  slicing (the route returns all brands, capped in practice by `max_brands`: 1 on free and growth,
  15 on agency, per `apps/api/src/integrations/stripe.ts:339-355`), and pushed into the route in
  Phase 2.
- **Required scope:** `read`

#### `ozvor_get_brand`
- **Description:** "Get one brand's configuration and its most recent three-score breakdown
  (Visibility, Citation Readiness, Execution). Call this after `ozvor_list_brands` when the user
  asks why a score is what it is, or which AI engines a brand is tracked across."
- **Input schema:**
  ```json
  { "type": "object",
    "properties": { "brand_id": { "type": "string", "format": "uuid",
                                  "description": "Ozvor brand id from ozvor_list_brands." } },
    "required": ["brand_id"], "additionalProperties": false }
  ```
- **Output shape:** `{ id, name, domain, category, region, monitoring_enabled, tracked_models,
  tracking_frequency, latest_score: { recorded_at, score_brand, score_performance, score_ai,
  score_overall } | null }`
- **Wraps:** `GET /api/v1/brands/:id` (`api-keys.ts:436`)
- **Required scope:** `read`

#### `ozvor_list_audits`
- **Description:** "List recent AI Visibility audits for one brand, newest first, with each
  audit's status and scores. Call this when the user asks whether a score moved, how a brand is
  trending, or when the last audit ran."
- **Input schema:** `brand_id` (uuid, required), `limit` (integer, 1 to 50, default 10)
- **Output shape:** `{ data: [{ id, status, score_brand, score_performance, score_ai,
  trustindex_score, created_at }] }`
- **Wraps:** `GET /api/v1/brands/:id/audits` (`api-keys.ts:477`, capped at 50 rows in SQL).
  `trustindex_score` is the derived overall from `withOverall()`; the MCP layer renames it to
  `overall_score` in the tool output, because "trustindex" is a retired brand name and must never
  reach a user-facing surface (CLAUDE.md rebrand rule).
- **Required scope:** `read`

#### `ozvor_get_audit`
- **Description:** "Get one audit's status and full score breakdown by audit id. Call this to
  check whether an audit you or the user started has finished, or to compare a specific historical
  audit against today's numbers."
- **Input schema:** `audit_id` (uuid, required)
- **Output shape:** `{ id, brand_id, status, score_brand, score_performance, score_ai,
  overall_score, created_at }`
- **Wraps:** `GET /api/v1/audits/:id` (`api-keys.ts:502`)
- **Required scope:** `read`

### 2.2 Phase 2: operator telemetry (separate scope, not customer-facing)

These wrap the operator surface and are intended for Hermes and the founder, not for subscribers.
They are exposed on the same endpoint but only listed when the key carries `operator`. They are
PII-free by construction, which is exactly why they are safe to hand to an agent.

| Tool | Wraps | Description trigger |
|---|---|---|
| `ozvor_system_health` | `GET /api/v1/operator/system-health` (`api-keys.ts:533`) | "Call when asked whether Ozvor is up, or which AI engines are currently configured." |
| `ozvor_recent_audits` | `GET /api/v1/operator/audits/recent` (`api-keys.ts:586`) | "Call to see the last 20 audits platform-wide with no tenant or brand identifiers." |
| `ozvor_engine_drift` | `GET /api/v1/operator/engine-drift` (`api-keys.ts:624`) | "Call when a score moved unexpectedly, to determine whether the engine drifted rather than the client." |
| `ozvor_list_assets` | `GET /api/v1/operator/assets` (`api-keys.ts:571`) | "Call to find the download URL for an Ozvor asset (kit, whitepaper, tracker)." |

**Never exposed via MCP at any phase:** anything gated on the `business` scope (leads with email
addresses, kit orders, opportunities, nurture enrollment). Those carry personal data, and an agent
loop that can read a lead list is one prompt injection away from exfiltrating it. `business` stays
HTTP-only, called deliberately by the Hermes VPS.

### 2.3 Phase 3: write tools (money moves here)

#### `ozvor_run_audit`
- **Description:** "Start a new AI Visibility audit for one brand. This costs real money and takes
  several minutes. Only call it when the user has explicitly asked for a fresh audit in this
  conversation. Do NOT call it to answer a question that `ozvor_get_brand` or `ozvor_list_audits`
  can already answer from the most recent audit."
- **Input schema:**
  ```json
  { "type": "object",
    "properties": {
      "brand_id":        { "type": "string", "format": "uuid" },
      "confirm":         { "type": "boolean", "enum": [true],
                           "description": "Must be true. Confirms the user explicitly asked for a new paid audit." },
      "idempotency_key": { "type": "string", "minLength": 8, "maxLength": 64,
                           "description": "Stable id for this request. Repeating a key within 24h returns the original audit instead of starting a new one." } },
    "required": ["brand_id", "confirm", "idempotency_key"],
    "additionalProperties": false }
  ```
- **Output shape (success):** `{ audit_id, status: "pending", estimated_cost_usd, poll_with:
  "ozvor_get_audit" }`
- **Output shape (blocked):** `{ started: false, reason: "AUDIT_ALREADY_RUNNING" |
  "AUDIT_WEEKLY_LIMIT" | "AUDIT_DAILY_LIMIT", audit_id?, next_allowed_at?, message }`
  returned as a **successful** tool result, never as a protocol error. See section 6.
- **Wraps:** the trigger logic at `apps/api/src/routes/audits.ts:1001`, which today is JWT-authed
  (`requireAuth` + `requireRole(["owner","editor"])`). Phase 3 must extract that handler body and
  mount an API-key-authed twin at `POST /api/v1/brands/:id/audit` behind
  `requireApiKey(db, { requireScope: "write:audits" })`. Extracting rather than duplicating is
  mandatory: the three cost guards live in that body and must not fork.
- **Required scope:** `write:audits`
- **Guards:** section 6.3.

#### `ozvor_generate_content_plan` (reserved, not designed here)
Wraps `POST /api/audits/:id/plan` (`audits.ts:1591`). Same shape of guards. Scope `write:content`.
Deferred until `ozvor_run_audit` has run in production for a month.

---

## 3. Scopes to tools

The `scopes TEXT[]` column already exists with a `DEFAULT ARRAY['read']` and was deliberately
future-proofed for write scopes (`docs/05-impl-log.md:1506`). No migration is needed to add any of
the strings below; they are just new array elements.

### 3.1 The exact scope strings

| Scope | Status | Grants | Default on new keys |
|---|---|---|---|
| `read` | exists | Tenant data through `/api/v1/*` and the Phase 1 read tools. Hard-required by `requireApiKey` at `api-keys.ts:152`. | yes |
| `operator` | exists | PII-free platform telemetry. Never enters a tenant scope (`requireOperatorKey`, `api-keys.ts:200`). | no (founder-minted only) |
| `business` | exists | Operator business data including lead emails. **Not exposed via MCP.** | no |
| `mcp` | **new** | Permission to use the key at the MCP endpoint at all. | **no** |
| `write:audits` | **new (Phase 3)** | `ozvor_run_audit`. | no |
| `write:content` | **new (reserved)** | `ozvor_generate_content_plan`. | no |

### 3.2 The mapping rule

The MCP server holds a static table of `tool name -> required scope`. Two enforcement points, both
mandatory:

1. **`tools/list` filters.** A key without `operator` never sees the operator tools exist. A key
   without `write:audits` never sees `ozvor_run_audit`. Hiding a tool is not security, but it stops
   the model from planning around a capability it cannot use and then reporting a false failure.
2. **`tools/call` re-checks.** Every call independently verifies the scope before dispatch and
   returns `-32001 forbidden` if it is missing. Never trust that the caller only calls what was
   listed.

| Tool | Required scope |
|---|---|
| `ozvor_whoami` | `mcp` |
| `ozvor_list_brands`, `ozvor_get_brand`, `ozvor_list_audits`, `ozvor_get_audit` | `read` |
| `ozvor_system_health`, `ozvor_recent_audits`, `ozvor_engine_drift`, `ozvor_list_assets` | `operator` |
| `ozvor_run_audit` | `write:audits` |
| `ozvor_generate_content_plan` | `write:content` |

`mcp` is required in addition to the per-tool scope on every request. It is the kill switch: a
customer who suspects their agent host is compromised revokes MCP access without breaking their
Zapier integration, and the founder can disable the whole MCP surface for one tenant with a single
array update.

### 3.3 Why `mcp` is off by default

The 10 keys a tenant may hold (`api-keys.ts:41`) were minted with `['read']` under a promise that
they grant read-only HTTP access. Silently making every one of them a live agent endpoint is a
capability expansion the key holder never consented to. Existing keys get `mcp` only by explicit
opt-in in the account UI. New keys get an MCP checkbox at mint time.

### 3.4 Convention note

Existing scopes are bare nouns (`read`, `operator`, `business`); `write:audits` introduces a
colon-namespaced form. That inconsistency is deliberate and worth the cost: write scopes must be
per-resource because each one authorizes a different amount of spend, and a flat `write` would be
a blank cheque. `mcp` stays a bare noun because it names a transport, not a resource.

---

## 4. Auth and tenancy (the safety property)

**This is the section that matters. Everything else is ergonomics.**

### 4.1 The invariant

> Every MCP tool call reaches the database only through a Hono handler that is already running
> inside `runWithTenant(key.tenant_id, ...)`. The MCP module never holds a database client and
> never issues SQL.

That is not a convention to be careful about. It is enforced structurally: `registerMcpRoutes` does
not receive the `db` handle as a usable query surface for tool bodies, and a lint rule plus a code
review checklist item forbid `db.query` anywhere in `apps/api/src/routes/mcp.ts` or
`apps/api/src/lib/mcp-tools.ts`. If a tool needs data no `/api/v1` route exposes, the fix is to add
the route behind `requireApiKey`, never to query from the MCP layer.

### 4.2 The chain, step by step

An agent host sends `POST /api/mcp` with `Authorization: Bearer ozk_live_...`.

1. **Outer guard** (`requireApiKey(db, { requireScope: "mcp", rateLimit: true })`) runs the exact
   existing sequence: SHA-256 the presented key (`api-keys.ts:124`), look the row up **unscoped**
   as the privileged login role because the tenant is not yet known (`:129-141`), reject if absent
   or `revoked_at` is set (`:146`), reject if the required scope is missing (`:152`), tick the
   sliding-window limiter (`:161`), touch `last_used_at`, then call
   `runWithTenant(key.tenant_id, () => next())` (`:181`).
2. **The MCP handler now runs inside the tenant scope.** It parses JSON-RPC, checks the batch cap,
   resolves the tool, and re-checks the tool's scope against `c.get("apiKey").scopes`.
3. **Dispatch.** The handler builds an internal `Request` for the wrapped route (for example
   `GET /api/v1/brands/<uuid>` with the caller's `Authorization` header forwarded verbatim) and
   calls `app.fetch(req)`.
4. **The inner route re-authenticates** through `requireApiKey(db, { rateLimit: false })`, which
   repeats steps 1a to 1e and enters `runWithTenant` again with the same tenant id. Every query the
   route issues runs as `app_user`, so the `tenant_isolation` policy from
   `20260626000004_api_key.up.sql` (`ENABLE` plus `FORCE`) decides what rows exist.
5. **The MCP handler shapes the JSON response** into an MCP tool result. It reads the response
   body; it never reads the database.

Points 3 and 4 are the whole design. Because the tool handler talks to the API over the same
front door a customer's curl would use, there is no second code path where tenancy could be
forgotten, and no way for a mistake in the MCP layer to widen data access: the worst an MCP bug can
do is call the wrong route with the caller's own key, which returns the caller's own data.

### 4.3 What a cross-tenant request looks like

An agent guesses a brand UUID belonging to another tenant and calls `ozvor_get_brand`. The request
reaches `GET /api/v1/brands/:id` inside tenant A's scope; the row belongs to tenant B; RLS filters
it out; the route returns `404 BRAND_NOT_FOUND` (`api-keys.ts:441`); the MCP layer returns a
"brand not found" tool result. No leak, no special-casing, no MCP-specific code involved. A test
must assert exactly this.

### 4.4 Why not shortcut the double middleware pass

Option (b) would be to extract each route body into a function and call it directly from both the
REST route and the MCP tool inside one `requireApiKey` pass. It saves one hash lookup per tool
call. It is rejected for Phase 1 because it requires refactoring five working, tested handlers to
ship a new surface, and because a shared function is a place where a future edit can forget which
callers are inside a tenant scope. The sub-request bridge cannot drift. Revisit only if the second
SHA-256 plus indexed single-row lookup shows up in latency measurement, which is unlikely.

The one adjustment `requireApiKey` needs is an options argument so the inner pass does not
double-tick the limiter, and so `requireScope` is configurable instead of hard-coded to `read`.
That keeps the existing zero-argument-behaviour identical: `requireApiKey(db)` continues to mean
`{ requireScope: "read", rateLimit: true }`.

### 4.5 Credential handling on the host side

- **Claude API MCP connector:** the server is declared as `{type: "url", name: "ozvor", url:
  "https://ozvor.com/api/mcp"}` plus a matching `{type: "mcp_toolset", mcp_server_name: "ozvor"}`
  entry, with the key passed as `authorization_token`. Both halves are required or the request is
  rejected; the beta flag `mcp-client-2025-11-20` applies. Not available on Amazon Bedrock or
  Vertex AI.
- **Managed Agents:** the agent declares the server with no auth; the `ozk_live_` key lives in a
  vault as a `static_bearer` credential keyed by the server URL, and Anthropic injects it at egress
  so the sandbox never sees it. Under `limited` networking the environment also needs
  `allow_mcp_servers: true` or `ozvor.com` in `allowed_hosts`.
- **Caveat:** hosted MCP servers consumed through consumer connector UIs commonly require a real
  OAuth flow rather than a pasted static token. A static `ozk_live_` bearer covers the Claude API,
  Managed Agents, and local Claude Code config. Consumer connector support is a Phase 3 item
  (section 7) and is listed as an unknown in section 8.
- Ozvor never sees or stores a host credential. The only secret in play is the customer's own key,
  which Ozvor already stores as a hash only.

---

## 5. Where it runs

**Recommendation: inside `apps/api` as a new route module. Do not build a separate service.**

One-line reason: the RLS-through-`runWithTenant` guarantee is free only inside the process that
already owns `requireApiKey` and the `db` client, and re-creating it in a second service means
re-creating the one thing that must never be gotten wrong.

The full comparison:

| | New route module in `apps/api` | Separate service |
|---|---|---|
| Tenancy safety | Inherits `runWithTenant` unchanged. Impossible to bypass because the module has no DB handle. | Either gets its own DB credentials (a second RLS-bypass surface, a second place to forget `SET LOCAL`) or calls the public API over HTTP anyway, which is what option 1 already does, but across a network. |
| Auth | Reuses the middleware verbatim. | Re-implements hash lookup, revoke check, scope gate, limiter. Four chances to drift. |
| Deploy | Zero new infrastructure. Merge to `main` auto-deploys via Railway, which is already the deploy gate. | A fourth Railway service, a second domain and TLS cert, a duplicated secret set, a second thing to monitor and to fail silently. |
| Cost | Zero. | Another Railway service on a company running lean. |
| Blast radius | An MCP bug can crash a shared process. Mitigated by the existing error handler, stateless handlers, and no long-lived streams (below). | Isolated. This is the only genuine advantage. |
| URL | `https://ozvor.com/api/mcp` works immediately, because Next already rewrites `/api/*` to the Hono backend (the D2 decision recorded in `docs/05-impl-log.md`). | New DNS record, new certificate, new CORS story. |

**Stateless Streamable HTTP.** The isolation argument for a separate service is mostly about
long-lived SSE connections holding API workers. That risk is removed rather than managed: Phase 1
implements MCP in stateless mode. Every request is a self-contained `POST /api/mcp` returning a
single JSON response; no session id is issued, no server-to-client stream is opened, `GET /api/mcp`
returns 405. Every Phase 1 and Phase 2 tool is pure request and response, so nothing is lost.
Server-initiated notifications, if ever needed, are the trigger to revisit this decision, not
before.

**Concrete placement:** `apps/api/src/routes/mcp.ts`, registered from `apps/api/src/index.ts`
alongside the other 20 route modules, mounted at `/api/mcp`.

---

## 6. Rate limiting, cost control, abuse

An agent is not a human. It retries on failure, it loops when confused, and it can issue twenty
calls in the time a person issues one. Every limit below is designed for that caller.

### 6.1 Read tools (cheap, but loopable)

| Control | Value | Rationale |
|---|---|---|
| Per-key sliding window | 120 requests/min, reusing `checkApiRateLimit` (`api-keys.ts:81`) | Already built and proven |
| **Ticked per tool call, not per HTTP request** | one tick per `tools/call` | Otherwise a JSON-RPC batch of 20 tool calls costs one unit and the limiter is defeated |
| Batch cap | max 10 tool calls per JSON-RPC request | Bounds fan-out and keeps one request from consuming a sixth of the window |
| Result cap | `limit` max 50 on every list tool, hard-capped server side regardless of input | Keeps output far under the ~100k character MCP offload threshold and bounds token spend for the customer |
| Body size cap | 64 KB on `POST /api/mcp` | A tool catalog request needs bytes, not megabytes |

Read tools hit Postgres only. Their marginal cost is effectively zero, so the limits above are
about protecting latency and the customer's token bill, not Ozvor's API spend.

### 6.2 What an audit actually costs

The repo gives three figures, all of them real, for different audit depths:

- `docs/methodology-changelog.md:71`: roughly $0.80 per audit at the base protocol, plus $0.10 to
  $0.25 for the 2.1 extraction layer.
- `docs/COST-MODEL.md:56-58`: a full audit is ~150 LLM probes at ~$0.50 to $1.50, plus DataForSEO
  at ~$0.10 to $0.50, total ~$0.60 to $2.00.
- `apps/api/src/integrations/stripe.ts:325`: a full 250-prompt audit (the Growth and Agency depth)
  costs roughly **$5** of platform API spend, which is the number the `monthly_audit_cap` margin
  guard is built on.

Take $5 as the planning number for a paid-tier audit. An agent that loops ten times has spent $50
of an account paying $99 a month. This is the only part of the MCP surface that can lose money, and
it is why write tools are Phase 3 rather than Phase 1.

### 6.3 Guards on `ozvor_run_audit`

**Inherited from the existing trigger route** (`apps/api/src/routes/audits.ts:1023-1104`), all
three enforced server side and therefore automatically applied to the MCP path when the handler is
extracted rather than duplicated:

1. **One audit at a time per brand.** A second trigger while one is `pending` or `running` returns
   409 with the in-flight `audit_id`.
2. **Per-brand manual window.** One manual audit per brand per week on free and growth, per day on
   agency (`manual_audit_interval`, `stripe.ts:341-355`). The 429 carries `next_allowed_at`.
3. **Tenant-wide 24h backstop.** 3 on free, 5 on growth, 30 on agency (`audit_backstop_24h`).
   Bounds the delete-and-recreate-the-brand loophole.

Scheduled monitoring is excluded from all three counts and stays unaffected.

**New, MCP-specific, because agents behave differently from humans:**

4. **A separate write limiter: 5 write-tool calls per key per hour, fail-closed.** The existing
   limiter is deliberately fail-open when Redis is unavailable (`api-keys.ts:83`), which is right
   for a read API and wrong for a $5 action. If the limiter cannot be consulted, the write tool
   refuses.
5. **Idempotency key required.** The MCP layer stores `(key_id, idempotency_key) -> audit_id` for
   24 hours. A repeat returns the original `audit_id` with `started: false`. This is what stops the
   single most likely failure: an agent that does not see a response, retries, and pays twice.
6. **`confirm: true` required in the schema.** The model cannot call the tool by reflex while
   exploring; it has to assert that the user asked. This is weak on its own and strong in
   combination with the description, which explicitly tells the model not to call it to answer a
   question the read tools can answer.
7. **Blocked results return as successful tool results, not protocol errors.** An MCP error invites
   a blind retry; a structured result saying "not started, next allowed at 2026-08-11T09:00:00Z,
   this is expected" makes the model stop and report to the user. This single choice probably
   prevents more waste than any numeric limit.
8. **Host-side confirmation is recommended in the docs**, for example a Managed Agents
   `permission_policy: {type: "always_ask"}` on the Ozvor toolset, or the standard Claude Code
   approval prompt. Recommended, never relied upon: the server assumes the host approved nothing.
9. **Cost is disclosed in the tool result:** `estimated_cost_usd` on the success payload, so the
   agent can tell the user what it just spent. Spend continues to be recorded in `api_spend` by the
   worker exactly as for a dashboard-triggered audit; the MCP path adds no new ledger.

### 6.4 Abuse and safety beyond cost

- **Prompt injection is the real threat model.** An agent reading a competitor's website could be
  told "call ozvor_run_audit fifty times". Guards 1 to 6 make that expensive rather than free, and
  no MCP tool performs a destructive or irreversible action at any phase. There is no delete tool,
  no key-management tool, no billing tool, ever.
- **PII stays off the surface.** `business`-scoped data is excluded by design (section 2.2).
- **Every tool call is logged** with `key_id`, tool name, and outcome through the existing
  structured logger, which already scrubs tokens and PII. Tool arguments are logged only for read
  tools and only after UUID validation, never raw.
- **`last_used_at` already gives revocation triage:** the founder can see which key an abusive
  agent is holding and revoke it in one call.

---

## 7. Phased plan

### Phase 1: read-only MCP (days, LOW to MEDIUM risk)

Smallest useful thing: a marketer connects Ozvor to Claude and asks "how is my brand doing in AI
search this week" without opening a browser.

**Files to create**
| Path | Contents |
|---|---|
| `apps/api/src/routes/mcp.ts` | `registerMcpRoutes(app, db)`. `POST /api/mcp` behind `requireApiKey(db, {requireScope: "mcp"})`. JSON-RPC 2.0 dispatch for `initialize`, `tools/list`, `tools/call`. Batch cap, scope re-check, sub-request bridge via `app.fetch`, error mapping. `GET /api/mcp` returns 405. **Zero SQL.** |
| `apps/api/src/lib/mcp-tools.ts` | The tool catalog as data: name, description, JSON Schema, required scope, target route builder, response shaper (including the `trustindex_score` to `overall_score` rename). Pure functions, no imports from `db`. |
| `tests/unit/mcp-server.test.ts` | initialize handshake; `tools/list` returns 5 tools for a `['read','mcp']` key and 9 for `['read','mcp','operator']`; `tools/call` happy path; missing `mcp` scope returns 403; revoked key returns 401; a brand id belonging to another tenant returns "not found" and leaks nothing; batch over 10 rejected; malformed JSON-RPC returns -32700. |

**Files to modify**
| Path | Change |
|---|---|
| `apps/api/src/routes/api-keys.ts` | Add the options argument to `requireApiKey(db, opts)` with defaults `{requireScope: "read", rateLimit: true}` so existing behaviour is byte-identical; export `checkApiRateLimit`; add `mcp` to the scope vocabulary accepted at key creation. |
| `apps/api/src/index.ts` | `import { registerMcpRoutes }` and call it next to `registerApiKeyRoutes(app, db)` (currently line 271). Add `X-API-Key`, `Mcp-Session-Id`, `MCP-Protocol-Version` to the CORS `allowHeaders` list (line 195) for browser-based hosts. |
| `apps/web/src/app/account/api-keys/page.tsx` | An "Enable MCP access" checkbox at mint time, an opt-in toggle for existing keys, and a copy-paste connection snippet showing the URL and the header. |
| `docs/05-impl-log.md` | Append the capability entry (append-only, per CLAUDE.md rule 10). |
| `apps/api/package.json` | Add the MCP SDK, or hand-roll ~150 lines of JSON-RPC. See section 8. |

**Definition of done:** a real `ozk_live_` key connected to a real MCP host returns a real brand
score, with the transcript pasted into the PR. Not "the tests pass".

### Phase 2: depth and operator profile (1 to 2 weeks, MEDIUM risk)

- Operator tools behind the `operator` scope, giving Hermes engine-drift and system-health access
  as tools instead of curl. Hermes stops guessing at log formats.
- Real cursor pagination pushed down into `GET /api/v1/brands`, replacing Phase 1 slicing.
- New read routes plus tools for the depth that closes the Peec gap: competitor benchmark
  (`ozvor_compare_competitors`) and prompt-level citation detail (`ozvor_list_prompts`), each
  needing a new `/api/v1` route behind `requireApiKey` first.
- MCP resources for static context: the methodology document and the score definitions, so a model
  can explain what a Visibility score means without inventing it.
- Public documentation page and a listing in the public MCP registries.

### Phase 3: write and real OAuth (MEDIUM to HIGH risk, founder merges)

- Extract the `POST /api/brands/:id/audit` handler body; mount the API-key twin; ship
  `ozvor_run_audit` with every guard in section 6.3.
- Idempotency store (Redis, 24h TTL, fail-closed).
- OAuth 2.1 authorization server metadata plus dynamic client registration, so consumer connector
  UIs can authorize without a pasted token. This is the item that turns "works in Claude Code" into
  "works as a connector".
- `ozvor_generate_content_plan` only after `ozvor_run_audit` has a clean month.

---

## 8. Honest gaps

1. **MCP protocol revision not verified against the live spec in this session.** The guidance
   consulted here documents the client contract (how Claude declares and calls an MCP server,
   Streamable HTTP transport, bearer auth, the ~100k character output offload) rather than the
   server-side spec. Exact `initialize` fields, capability negotiation, and the current protocol
   version string must be read from the live specification before writing `mcp.ts`, and the
   implementation must be tested against a real client, not against our own test double.
2. **Static bearer versus OAuth is unresolved for consumer surfaces.** An `ozk_live_` static token
   is known to work as a Claude API `authorization_token` and as a Managed Agents `static_bearer`
   vault credential. Whether claude.ai and ChatGPT connector UIs accept it, or require a full OAuth
   flow with dynamic client registration, is unverified. If they require OAuth, Phase 1 still ships
   value (Claude Code, Claude API, Managed Agents, Hermes) but the consumer story slips to Phase 3.
3. **SDK dependency risk.** Adding `@modelcontextprotocol/sdk` to `apps/api` is a new runtime
   dependency in a repo where a worker deploy previously failed repeatedly because the build did
   not install new dependencies, and shipped stale code that silently fabricated data. Either
   verify the Railway build installs it before merging, or hand-roll the JSON-RPC framing (about
   150 lines, no dependency). Leaning toward hand-rolling for Phase 1 given only three methods are
   needed.
4. **Cost figure discrepancy, unresolved.** The brief cited $1.50 to $2.80 per audit. The repo says
   ~$0.80 base (`methodology-changelog.md:71`), ~$0.60 to $2.00 total for a 150-call audit
   (`COST-MODEL.md:56-58`), and ~$5 for a 250-prompt audit (`stripe.ts:325`). Which figure is
   authoritative for which depth needs a founder answer before `estimated_cost_usd` is put in a
   tool response, because a wrong number in an agent's mouth is worse than no number.
5. **`GET /api/v1/brands` has no tenant predicate in its SQL** (`api-keys.ts:409-427`), relying
   entirely on RLS. That is correct today and it is the documented pattern, but it means a single
   defect in `runWithTenant` is a full cross-tenant leak with no second line of defence. Before
   amplifying this surface with agent traffic, add a belt-and-braces `WHERE tenant_id = $1` using
   the resolved tenant id. Cheap, and it converts a catastrophic failure mode into a caught one.
6. **The rate limiter fails open with no Redis** (`api-keys.ts:83`). Acceptable for reads, not for
   writes. Phase 3 must not inherit this behaviour, and the fail-closed path needs its own test.
7. **No per-tenant API spend ceiling exists at the API layer.** The `monthly_audit_cap` margin
   guard runs in the worker and only on the scheduled branch. An MCP-triggered audit is a manual
   audit and is bounded only by the per-brand window and the 24h backstop. A hard monthly ceiling
   on manual audits is worth adding alongside Phase 3 rather than after the first surprise bill.
8. **Unknown whether any subscriber currently holds a live `ozk_live_` key.** The D2 implementation
   log deferred the end-to-end call with a real issued key to QA. If the answer is zero, defaulting
   `mcp` to off costs nothing and the whole surface can be validated on the founder's own key
   first, which is the right sequencing regardless.
9. **CI reality check.** Playwright E2E is red on `main` and the workflow still reports success, so
   a green PR does not mean a green pipeline. Check `main` before attributing any failure to this
   work.
10. **Latency of the double middleware pass is estimated, not measured.** Two SHA-256 hashes plus
    two indexed single-row lookups per tool call should be sub-millisecond, but nobody has measured
    it under Railway's connection pool. Measure in Phase 1 and record the number; do not refactor
    to the shared-function design on a hunch.
11. **No design here for what happens when a customer downgrades.** A key with `mcp` on an agency
    plan that drops to free keeps its scopes. Plan limits are read per request, so data access
    stays correct, but the tool set does not shrink. Decide whether that matters before Phase 2.

---

**Status:** design only. No implementation authorized by this document. Phase 1 is LOW to MEDIUM
risk under `AGENTS.md` section 2 (new read-only route module, no schema change, no production data
touched); Phase 3 is MEDIUM to HIGH and requires founder merge.
