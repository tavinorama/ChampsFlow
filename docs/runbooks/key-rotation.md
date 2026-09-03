# Key Rotation Runbook — OAUTH_TOKEN_KEY

> Owner: devops-engineer · Rotation cadence: every 12 months (or immediately on suspected compromise)

## TL;DR

`OAUTH_TOKEN_KEY` is the AES-256-GCM field-level encryption key for OAuth tokens in `social_accounts`. The key supports versioning via `key_version INT` on the `social_accounts` table, enabling non-blocking rotation: new tokens encrypt with the new key version; old tokens decrypt with their stored version until re-encrypted.

## Rotation Steps

### Step 1 — Generate the New Key

```bash
openssl rand -hex 32
# Output: a 64-character hex string. Record this securely.
```

### Step 2 — Add the New Key Version to the Application

The `packages/shared/src/crypto.ts` module reads keys from a versioned key store. Add the new key as version N+1 in the Railway secret as a JSON object:

```
OAUTH_TOKEN_KEY={"1":"<existing-hex-key>","2":"<new-hex-key>","current":2}
```

The `current` field tells the encryption function which version to use for new encryptions. Existing rows encrypted with version 1 continue to decrypt correctly.

### Step 3 — Deploy the Updated Secret

Update the `OAUTH_TOKEN_KEY` Railway secret in all environments — current infrastructure is the Railway project `trustindex-ai` (legacy project slug; brand is Ozvor) with `api`, `worker`, and `web` services (see `docs/runbooks/GO-LIVE-KEYS.md`):
- `api` and `worker` services (production)
- any staging environment, if configured
*(Updated 2026-07-10, issue #213 — the former `organicposts-eu-prod` / `organicposts-us-prod` / `organicposts-staging` environment names were from the archived v1 architecture and were never provisioned.)*

Redeploy api and worker services after updating the secret.

### Step 4 — Re-encrypt Existing Tokens (background job)

After deploying the new key version, schedule a one-shot background job that:

1. Queries all `social_accounts` rows where `key_version < current_key_version`.
2. For each row: decrypts `access_token_enc` and `refresh_token_enc` with the old key version, re-encrypts with the new key version, updates `key_version` on the row.
3. Does this in batches of 100 rows to avoid locking.

This job can be run via Railway:

```bash
railway run --service worker --environment production-eu -- node dist/jobs/reencrypt-tokens.js
```

### Step 5 — Verify and Clean Up

After all rows have `key_version = new_version`, remove the old key version from `OAUTH_TOKEN_KEY`:

```
OAUTH_TOKEN_KEY={"2":"<new-hex-key>","current":2}
```

Redeploy to pick up the simplified config.

### Step 6 — Document

Append a rotation record to this file:

| Date | Version promoted | Triggered by | Completed | Verified by |
|---|---|---|---|---|
| (initial) | 1 | Launch | 2026-05-11 | devops-engineer |

## Emergency Rotation (Suspected Compromise)

If the key is suspected compromised:

1. Generate a new key immediately (Step 1 above).
2. Rotate to the new key version in all environments (Steps 2–3) immediately.
3. Force-revoke all social account OAuth tokens via the admin Supabase SQL:
   ```sql
   UPDATE social_accounts SET revoked_at = NOW() WHERE revoked_at IS NULL;
   ```
4. Email all affected users: their social accounts have been disconnected and they need to reconnect.
5. Re-encrypt all rows with the new key (Step 4).
6. File a security incident post-mortem.

## Related Secrets Rotation

For other secrets with 12-month rotation cadence (inventário completo na seção "Inventário completo de segredos" abaixo — a antiga referência a `docs/07-deploy.md` apontava para um arquivo que não existe; corrigida 2026-09-02), the procedure is:

1. Generate or rotate the secret in the respective service console (Anthropic, Supabase, Stripe, LinkedIn, Meta, Resend, Axiom).
2. Update the Railway environment variable.
3. Redeploy the affected services.
4. Verify `/healthz` and a functional smoke test.

## GEO Provider Keys Rotation (GEO-SEC-5)

> Added 2026-06-11 per Gate 3→4 security condition GEO-SEC-5.
> Cadence: **every 6 months** (or immediately on suspected compromise / staff departure).

The GEO audit engine uses these provider keys on the **api and worker** services.
They are bearer secrets with billing exposure — a leaked key burns money and
quota even if it leaks no customer data.

| Env var | Console to rotate in | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | probes (audit) + plan/draft generation |
| `OPENAI_API_KEY` | platform.openai.com → API Keys | probes |
| `GEMINI_API_KEY` | aistudio.google.com → API Keys | probes |
| `PERPLEXITY_API_KEY` | perplexity.ai → API settings | probes (non-EU brands only, GEO-A3) |
| `SERP_API_KEY` | DataForSEO/SerpAPI dashboard | off-site signal, Reddit deep-dive, AI Overview |

Procedure (no key-versioning needed — these are stateless bearer keys, nothing
stored in the DB is encrypted with them):

1. Create the NEW key in the provider console (do not revoke the old one yet).
2. Update the Railway env var on **api + worker**, redeploy both.
3. Smoke test: `GET /api/system/capabilities` must show the provider as
   connected and mode "live"; run one audit and confirm the provider appears in
   `providers_used`.
4. Revoke the OLD key in the provider console.
5. Append a rotation record to the table below.

Notes:
- **Customer BYOK keys** (`/account/integrations`) are the customer's own; we
  never rotate those — rotation guidance is shown in the integrations UI.
  They are stored AES-256-GCM encrypted under `OAUTH_TOKEN_KEY`, so rotating
  `OAUTH_TOKEN_KEY` (procedure above) re-protects them at rest.
- Mock fallback means a botched rotation degrades to demo mode rather than
  hard-failing audits — but treat that as an incident, not a feature.

| Date | Key rotated | Triggered by | Completed | Verified by |
|---|---|---|---|---|
| — | — | — | — | — |

## Inventário completo de segredos (10.B.12 — adicionado 2026-09-02)

> NOMES apenas — valores nunca aparecem em runbook nenhum. Owner de TODA
> rotação: **founder** (regra: agentes nunca tocam segredo/.env). "Onde vive":
> Railway = variáveis dos serviços `api`/`worker`/`web` no projeto
> `trustindex-ai`; GH = GitHub Actions secrets do repo. Depois de qualquer
> rotação: atualizar a variável, redeploy dos serviços afetados, smoke
> (`/healthz` + um fluxo real), registrar na tabela de rotação deste runbook.

| # | Segredo (nome) | Vive em | Console onde rotaciona | Serviços afetados | Cadência |
|---|---|---|---|---|---|
| 1 | `DATABASE_URL` | Railway (api, worker) | Supabase → Database → reset password | api, worker | na suspeita |
| 2 | `REDIS_URL` | Railway (referência `${{Redis.REDIS_URL}}`) | Railway → Redis service | api, worker | na suspeita |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` | Railway (api, worker) | Supabase → API keys | api, worker | 12 meses |
| 4 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Railway (web) | Supabase → API keys (par com o service_role) | web | junto com o #3 |
| 5 | `OAUTH_TOKEN_KEY` | Railway (api, worker) | gerado local (`openssl rand -hex 32`) — procedimento versionado no topo deste runbook | api, worker | 12 meses |
| 6 | `ANTHROPIC_API_KEY` | Railway (api, worker) | console.anthropic.com | api, worker | 6 meses (GEO-SEC-5) |
| 7 | `OPENAI_API_KEY` | Railway (api, worker) | platform.openai.com | api, worker | 6 meses |
| 8 | `GEMINI_API_KEY` | Railway (api, worker) | aistudio.google.com | api, worker | 6 meses |
| 9 | `PERPLEXITY_API_KEY` | Railway (api, worker) | perplexity.ai | api, worker | 6 meses |
| 10 | `SERP_API_KEY` (DataForSEO) | Railway (api, worker) | app.dataforseo.com | api, worker | 6 meses |
| 11 | `GOOGLE_OAUTH_CLIENT_SECRET` | Railway (api) | console.cloud.google.com → Credentials | api | 12 meses |
| 12 | `GOOGLE_PLACES_API_KEY` | Railway (api) | console.cloud.google.com → APIs | api | 12 meses |
| 13 | `STRIPE_SECRET_KEY` | Railway (api, worker) | dashboard.stripe.com → API keys (roll) | api, worker | 12 meses / na suspeita |
| 14 | `STRIPE_WEBHOOK_SECRET` | Railway (api) | dashboard.stripe.com → Webhooks (roll signing secret) | api | junto com o endpoint |
| 15 | `RESEND_API_KEY` | Railway (api, worker) | resend.com → API keys | api, worker | 12 meses |
| 16 | `TELEGRAM_BOT_TOKEN` | Railway (api, worker) + GH Actions | @BotFather (`/revoke`) | api, worker + TODOS os workflows-vigia | na suspeita |
| 17 | `TELEGRAM_CHAT_ID` | Railway (api, worker) + GH Actions | não é segredo forte (id do chat), mas par operacional do #16 | idem | com o #16 |
| 18 | `TELEGRAM_WEBHOOK_SECRET` | Railway (api) | gerado local; re-registra via boot (`ensureTelegramWebhook`) | api | 12 meses |
| 19 | `HERMES_TASK_TOKEN` | Railway (worker) + GH Actions + VPS | gerado local; atualizar VPS (`hermes.service`) + GH + Railway juntos | worker, workflows, VPS | 12 meses |
| 20 | `HERMES_BLOG_TOKEN` | GH Actions | idem #19 (escopo blog) | blog-autopublish | 12 meses |
| 21 | `SMARTLEAD_API_KEY` | Railway (worker) | app.smartlead.ai → Settings | worker | 12 meses |
| 22 | `SMARTLEAD_WEBHOOK_SECRET` | Railway (api) | gerado local; atualizar a URL registrada no SmartLead | api | 12 meses |
| 23 | `SIGNAL_ENGINE_API_KEY` | Railway (api) | repo signal-engine (founder) — token do serviço FastAPI | api | 12 meses |
| 24 | `REVALIDATE_SECRET` | Railway (api, web) | gerado local (`openssl rand -hex 32`) | api, web | 12 meses |
| 25 | `ADMIN_INTERNAL_KEY` | Railway (api) | gerado local | api | 12 meses |
| 26 | Operator API keys (tabela `api_key`, hash) | Postgres (hash apenas) | rotação via endpoint próprio (`/api/account/api-keys` / operator key rotation) | api | na suspeita |
| 27 | Chaves BYOK de clientes | Postgres (AES-256-GCM sob `OAUTH_TOKEN_KEY`) | o CLIENTE rotaciona; nós nunca | — | — |

**Tabela de rotação (append-only — registrar TODA rotação aqui):** usar a
tabela "Date / Key rotated / Triggered by / Completed / Verified by" já
existente acima. Ela está vazia porque nenhum segredo foi rotacionado desde o
go-live — isso é um fato registrado, não um esquecimento; a primeira rotação
completa (itens 3–15) está devida no ciclo de 6/12 meses contado do go-live.
