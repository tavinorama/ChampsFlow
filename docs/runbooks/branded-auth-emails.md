# Runbook — Branded Auth Emails (TrustIndex AI, not Supabase)

**Goal:** signup/login emails arrive as **TrustIndex AI**, not the default Supabase sender.
**Owner:** founder (this is dashboard + DNS configuration — it cannot be done from code).
**Status:** templates + app-side bonus delivery are built; the SMTP + DNS steps below are the remaining founder action.

There are two separate email surfaces:

| Surface | Who sends it | How it's branded |
|---|---|---|
| **Auth emails** (confirm signup, magic link, reset password, change email) | **Supabase Auth** | Custom SMTP (Resend) + the HTML templates in `docs/runbooks/email-templates/` (steps below) |
| **Transactional emails** (bonus delivery on paid signup, DSR/CCPA) | **the app** (Resend, `packages/shared/src/emails/*`) | Already branded in code. Just needs `RESEND_API_KEY` + a verified sending domain |

Both depend on **one prerequisite: a verified `trustindexai.com` sending domain in Resend.**

---

## Step 1 — Verify the sending domain in Resend (DNS)

1. Resend dashboard → **Domains → Add Domain** → `trustindexai.com` (or a subdomain like `mail.trustindexai.com`).
2. Resend shows DNS records to add. In your DNS provider (Cloudflare / Hostinger), add:
   - **SPF** (TXT) — e.g. `v=spf1 include:_spf.resend.com ~all` (merge with any existing SPF; never publish two SPF records).
   - **DKIM** (the CNAME/TXT records Resend gives — usually `resend._domainkey...`).
   - **DMARC** (TXT) at `_dmarc` — start with `v=DMARC1; p=none; rua=mailto:dmarc@trustindexai.com`.
   - These coexist with your **MX** records — do **not** touch MX (your inbound email keeps working).
3. Wait for Resend to show the domain **Verified** (minutes to a few hours).

## Step 2 — Point Supabase Auth at Resend (custom SMTP)

Supabase Dashboard → **Authentication → Emails → SMTP Settings** → enable **Custom SMTP**:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) — or `587` (STARTTLS) |
| Username | `resend` |
| Password | your **`RESEND_API_KEY`** |
| Sender email | `no-reply@trustindexai.com` (or `hello@trustindexai.com`) |
| Sender name | `TrustIndex AI` |

Save. (Without this, Supabase uses its own low-rate shared sender and the emails look like Supabase.)

## Step 3 — Paste the branded templates

Supabase → **Authentication → Emails → Templates**. For each template, paste the matching file from `docs/runbooks/email-templates/`:

| Supabase template | File |
|---|---|
| Confirm signup | `confirm-signup.html` |
| Magic Link | `magic-link.html` |
| Reset Password | `reset-password.html` |
| Change Email Address | `change-email.html` |

The templates already include the Supabase variables (`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .SiteURL }}`, `{{ .Email }}`). Set the subject lines too (suggested subjects are in a comment at the top of each file).

## Step 4 — Set the app's email env (for bonus delivery + DSR emails)

On the **Railway `api`** service, set:
- `RESEND_API_KEY` = your Resend key (also lets bonus-delivery + DSR emails send).
- `EMAIL_FROM` (optional) = `TrustIndex AI <no-reply@trustindexai.com>` (defaults to `TrustIndex AI <hello@trustindexai.com>`).

Once set, a new **Growth/Agency** subscription automatically triggers `sendBonusDeliveryEmail` from the Stripe webhook (`apps/api/src/routes/billing.ts`), emailing the customer their 3 bonuses (30-page guide, citation tracker .xlsx + methodology, 5 templates) with download links.

## Step 5 — Test

- Supabase → trigger a test signup → confirm the email arrives branded as TrustIndex AI.
- Stripe (test mode) → complete a Growth checkout → confirm the bonus-delivery email arrives with working `/downloads/*` links.
- Check Resend dashboard → Logs for deliverability (SPF/DKIM "pass").

---

**Remaining founder action:** Steps 1–4 (DNS records + Supabase SMTP/templates + Railway env). Everything code-side (templates, bonus-delivery sender, webhook hook, branded transactional emails) is already shipped.
