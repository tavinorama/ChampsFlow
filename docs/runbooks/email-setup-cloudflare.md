# Runbook — Operational email + cold-outreach inboxes (Cloudflare)

> **TL;DR (≤200 words).** Ozvor needs two kinds of mailbox: (1) **operational** addresses on
> `ozvor.com` (hello@, support@, billing@, founder@) for receiving real mail, and (2) **cold-outreach**
> inboxes on the two satellite domains `trustindexai.com` and `organicposts.com`, whose websites
> 301-redirect to `ozvor.com` but whose *email* stays live so replies land somewhere.
>
> **Key fact that trips everyone up:** Cloudflare **Email Routing is receive-only** — it forwards
> incoming mail to a real mailbox for free, but it **cannot send**. Sending (which cold outreach
> needs) requires either Google Workspace/Microsoft 365 or a dedicated cold-email platform
> (Instantly / Smartlead / Lemlist) connected to the domain. Never send cold outreach from
> `ozvor.com` itself — one spam complaint can poison the primary domain's deliverability. That is
> exactly why the satellite domains exist.
>
> This runbook covers, per domain: MX + Email Routing (receive), the SPF/DKIM/DMARC records that
> keep you out of spam, the website redirect (HTTP) that is independent of email (MX), and the
> warmup discipline that keeps the sending domains alive. All steps are founder-executed in the
> Cloudflare dashboard + the chosen email provider — no code change in this repo.

---

## 0. Architecture at a glance

```
                         RECEIVING                         SENDING (cold outreach)
ozvor.com            ──▶ Cloudflare Email Routing      ──▶ (do NOT send cold mail from here)
  hello@ support@        forwards → founder's real
  billing@ founder@      mailbox (Gmail/Workspace)

trustindexai.com     ──▶ Email Routing forwards          ──▶ cold-email tool (Smartlead/Instantly)
  (web → 301 ozvor.com)  replies → founder mailbox            warmed inboxes, low daily volume
organicposts.com     ──▶ Email Routing forwards          ──▶ cold-email tool
  (web → 301 ozvor.com)  replies → founder mailbox
```

Two independent layers on every domain:
- **Email = MX records.** Decides where mail is *received*. Cloudflare Email Routing sets these.
- **Website = HTTP.** A redirect rule sends browser traffic to `ozvor.com`. It does **not** touch MX,
  so you can redirect the website *and* still receive email on the same domain.

---

## 1. Operational inboxes on `ozvor.com` (receive — free, 10 min)

Use Cloudflare Email Routing to forward role addresses to one real mailbox you already read.

1. Cloudflare dash → select **ozvor.com** → **Email** → **Email Routing** → **Get started**.
2. Cloudflare auto-proposes the **MX** + **SPF (TXT)** records. Click **Add records** (it writes them
   for you). If `ozvor.com` already has MX for another provider, Email Routing will warn — only keep
   one mail receiver per domain.
3. **Destination addresses** → add the founder's real mailbox (e.g. `tavinorama@gmail.com`) → confirm
   the verification email Cloudflare sends to it.
4. **Routing rules** → **Custom addresses** → create each:
   | Address | Forwards to |
   |---|---|
   | `hello@ozvor.com` | founder mailbox |
   | `support@ozvor.com` | founder mailbox (later: helpdesk) |
   | `billing@ozvor.com` | founder mailbox |
   | `founder@ozvor.com` | founder mailbox |
   | `dpo@ozvor.com` (LGPD/GDPR DSR contact — already referenced in legal pages) | founder mailbox |
5. (Optional) **Catch-all** → forward anything else to the founder mailbox so no message is silently dropped.

> **To SEND as `hello@ozvor.com`** (e.g. reply to support), Email Routing is not enough. Either:
> - add **Google Workspace** on ozvor.com (paid, ~US$7/user/mo) — full send+receive, best for the
>   primary brand mailbox; *replaces* Email Routing's MX, or
> - keep Email Routing for receiving and add **"Send mail as"** in Gmail via an SMTP relay
>   (e.g. Resend SMTP, which the app already uses) so replies come *from* `hello@ozvor.com`.

---

## 2. Cold-outreach inboxes on the satellite domains

Cold outreach has different rules than transactional mail. Do this on `trustindexai.com` and
`organicposts.com`, **never on ozvor.com**.

### 2a. Decide the sending stack (founder choice)
| Option | Send? | Warmup? | Cost | Best for |
|---|---|---|---|---|
| **Cold-email platform** (Smartlead, Instantly, Lemlist) | ✅ | ✅ built-in | ~US$30–40/mo | **Recommended** — rotation, warmup, reply detection |
| Google Workspace inboxes + manual | ✅ | ❌ (buy a warmup add-on) | US$7/inbox/mo | Small volume, hands-on |
| Cloudflare Email Routing alone | ❌ receive only | — | free | **Receiving replies only** |

The standard cold-outreach setup is: **Workspace/private mailboxes connected to a cold-email
platform** that handles warmup + sending, **plus** Cloudflare Email Routing as a cheap safety net so
any reply that bypasses the tool still reaches you.

### 2b. Per satellite domain — DNS for deliverability
Add these in Cloudflare DNS for **each** sending domain (values come from your sending provider):

| Type | Name | Value | Purpose |
|---|---|---|---|
| `MX` | `@` | (provider's MX, or Cloudflare Email Routing MX) | receive replies |
| `TXT` (SPF) | `@` | `v=spf1 include:<provider-spf> ~all` | authorize senders |
| `TXT` (DKIM) | `<selector>._domainkey` | (provider's DKIM key) | sign mail |
| `TXT` (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@ozvor.com; fo=1` | monitor first, tighten later |

Rules:
- **SPF:** exactly **one** `v=spf1` record per domain. If using both Email Routing (receive) and a
  cold-email provider (send), merge their `include:` mechanisms into the single SPF record.
- **DMARC:** start at `p=none` (monitor), read the `rua` reports for ~2 weeks, then move to
  `p=quarantine` and eventually `p=reject` once SPF+DKIM pass cleanly.
- Keep the satellite domains' DKIM **selector** exactly as the provider gives it.

### 2c. Warmup discipline (non-negotiable for cold outreach)
- New domain/inbox: **warm up 3–4 weeks** before any real campaign (the platform automates this).
- Cap **~20–40 sends/day per inbox**; scale slowly. Use **2–3 inboxes per domain** and rotate.
- Personalize, include a real unsubscribe/opt-out line, and respect CAN-SPAM / GDPR / LGPD:
  identify yourself, give a physical address, honor opt-outs. (Cold B2B to EU needs a legitimate-
  interest basis under GDPR; to Brazil, LGPD legitimate interest + easy opt-out.)
- Buy domains a few weeks early — domain age helps deliverability.

---

## 3. Website redirect (HTTP) — keep email, send browsers to ozvor.com

This is independent of the MX records above. In Cloudflare, for **each** satellite domain:

1. Ensure an (orange-cloud / proxied) DNS record exists for the apex, e.g. `A @ 192.0.2.1` proxied,
   or a CNAME — the IP is a dummy; the redirect rule intercepts before it's used.
2. **Rules → Redirect Rules → Create rule**:
   - **When incoming requests match:** `Hostname` `equals` `trustindexai.com` **OR** `www.trustindexai.com`
   - **Then:** **Static redirect** → `https://ozvor.com` (or dynamic, preserving path:
     `concat("https://ozvor.com", http.request.uri.path)`), **301 Permanent**, **Preserve query string** on.
3. Repeat for `organicposts.com`.
4. Verify: `curl -sI https://trustindexai.com` → `HTTP/2 301` + `location: https://ozvor.com`.

> Optional UTM: redirect to `https://ozvor.com/?utm_source=outreach&utm_medium=email&utm_campaign=<domain>`
> so attribution shows which satellite domain drove the click (the app already tracks GA4/UTMs).

---

## 4. Verification checklist

Receiving:
- [ ] Send a test mail to `hello@ozvor.com` → arrives in founder mailbox.
- [ ] Reply to a test from each satellite domain → lands in the founder mailbox / cold-email tool.

Sending / deliverability (use mail-tester.com or the platform's checker):
- [ ] SPF = pass, DKIM = pass, DMARC = pass on each sending domain.
- [ ] A warmup test email scores ≥ 9/10 on mail-tester.
- [ ] DMARC `rua` reports arriving at `dmarc@ozvor.com` (add it as an Email Routing address).

Redirect:
- [ ] `curl -sI https://trustindexai.com` → 301 → `https://ozvor.com`.
- [ ] `curl -sI https://organicposts.com` → 301 → `https://ozvor.com`.
- [ ] Email on both still receives **after** the redirect is live (MX untouched).

---

## 5. What this does NOT do
- Does not let you send from `ozvor.com` — that needs Workspace or an SMTP relay (§1).
- Does not bulk-send cold mail — that's the cold-email platform's job (§2a).
- Does not bypass anti-spam law — warmup + opt-out + identification are mandatory (§2c).

---

_Owner: founder (Cloudflare dash + email provider). No repo code change. Cross-ref:
[[branded-auth-emails]] (transactional auth mail via Resend), [[GO-LIVE-KEYS]] (env/secrets)._
