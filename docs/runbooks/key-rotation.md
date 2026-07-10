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

For other secrets with 12-month rotation cadence (see `docs/07-deploy.md` Section 5), the procedure is:

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
