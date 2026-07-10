# Cookie Policy — Ozvor

**Live page**: https://ozvor.com/legal/cookies (source of record: `apps/web/src/app/legal/cookies/page.tsx`)
**Last updated (live)**: 24 June 2026
**Internal mirror refreshed**: 2026-07-10 (issue #213 — entity/brand refresh)

> This file is the internal markdown mirror of the live Cookie Policy. The live page is the operative customer-facing text; keep this mirror in sync when the page changes. The prior pre-launch draft (2026-05-17, "Organic Posts" / Plausible-only — superseded) is preserved in git history. Note: the analytics posture changed from the old draft — Plausible was replaced by **consent-gated Google Analytics 4** (opt-in banner; ad_storage denied).

---

## TL;DR (≤100 words)

Ozvor deploys **only strictly necessary cookies** by default (Supabase auth session) plus a localStorage theme preference. The single exception is **Google Analytics 4**, which loads **only if you opt in** via the consent banner — decline (or don't answer) and no analytics cookie is ever set; ad-related signals are permanently disabled (Consent Mode: ad_storage denied). No marketing cookies or advertising pixels are active. Jurisdictions: LGPD (Brazil, home jurisdiction), GDPR/ePrivacy (EU/EEA), CCPA/CPRA (California). Contact: **dpo@ozvor.com**.

---

**Intro.** This Cookie Policy explains what cookies and similar technologies Ozvor places on your device, why we use them, and how you can control them. It should be read alongside our Privacy Policy. Home jurisdiction: Brazil (LGPD); we also comply with the GDPR / ePrivacy Directive (EU/EEA) and CCPA/CPRA (California, US).

## 1. What are cookies?

Cookies are small text files stored on your device when you visit a website. They allow the site to recognise your device across page loads and sessions. We also use **localStorage** (a browser storage mechanism) for lightweight UI preferences such as your colour-scheme choice. Neither mechanism identifies you to third parties; they are scoped to our domain only.

## 2. Cookies we use at launch

By default Ozvor deploys **only strictly necessary cookies**. The single exception is **Google Analytics 4**, which loads **only if you opt in** to analytics via the consent banner — decline (or simply don't answer) and no analytics cookie is ever set. No marketing cookies and no advertising pixels are active.

| Cookie / key | Purpose | First- or third-party | Retention |
|---|---|---|---|
| `sb-[project]-auth-token` | Supabase authentication session token. Set only after login; verifies identity across page loads. | First-party (ozvor.com) | Session; refreshed on activity (7-day rotation) |
| `sb-[project]-refresh-token` | Supabase session refresh token; silently renews the session. | First-party (ozvor.com) | 7 days; rotated on use |
| `localStorage: theme` | Light/dark colour-scheme preference. Not a cookie; never transmitted to our servers. | First-party (ozvor.com) | Persistent until cleared or changed |

The Supabase auth cookies do not track you across websites. They are scoped strictly to ozvor.com and contain only an encrypted session identifier — no personal data in the cookie payload itself.

## 3. Cookie categories — status at launch

| Category | Description | In use at launch | Consent required? |
|---|---|---|---|
| **Strictly necessary** | Authentication session cookies that allow you to stay logged in. | Yes | No — exempt under ePrivacy Directive, LGPD, and CCPA (necessary for service delivery) |
| **Functional / preferences** | Non-essential user choices. Only localStorage theme preference used today (non-cookie; no server transmission). | Not in use (cookie) | Would require consent if cookies were used |
| **Analytics / performance** | **Google Analytics 4** (Google LLC) — aggregate usage data (page views, session duration, referrer). Cookies: `_ga`, `_ga_*` (persist up to 13 months). Loaded **only after opt-in** via the consent banner. Ad-related signals permanently disabled (Consent Mode: ad_storage denied). | Consent-gated | Opt-in required (EU/BR); opt-out honored (US). Withdraw any time via "Cookie preferences" in the footer. |
| **Marketing / advertising** | Cross-site tracking for advertising/retargeting (e.g., Meta Pixel, Google Ads, LinkedIn Insight Tag). None deployed. | Not in use | Explicit opt-in consent (EU/BR); "Do Not Sell or Share" opt-out (California) |

## 4. Legal basis for cookies

**Brazil (LGPD):** Strictly necessary cookies are processed on the basis of contract performance (Art. 7, V LGPD) — they are required to provide the authenticated service you requested. No consent is required for these cookies.

**EU/EEA (GDPR + ePrivacy Directive):** Strictly necessary cookies fall within the "essential technical purpose" exception to the ePrivacy consent requirement, processed under contract performance (Art. 6(1)(b) GDPR). Any non-essential cookie category requires prior, freely given, specific and informed consent (opt-in) from EU users before being set.

**California (CCPA/CPRA):** Strictly necessary cookies are exempt from the "sale"/"sharing" restrictions because they are used solely to provide the requested service. No marketing cookies are in use, so no "Do Not Sell or Share" opt-out is triggered by cookies. If marketing cookies are introduced, a compliant opt-out mechanism will be provided.

## 5. Third-party cookies

At launch, no third-party advertising, social, or embedded widgets set cookies on ozvor.com. The Supabase auth cookies are first-party. GA4 cookies (first-party, `_ga*`) are set only after analytics opt-in. Future integrations introducing third-party cookies will be disclosed in a policy update, with consent obtained before those cookies are set.

## 6. Your choices and controls

- **Strictly necessary cookies** cannot be disabled without breaking the authenticated application.
- **Analytics (GA4)**: opt in/out and withdraw at any time via "Cookie preferences" in the footer.
- **Browser controls**: delete or block cookies via browser settings (Chrome, Firefox, Safari, Edge guidance linked on the live page; see also allaboutcookies.org). Deleting auth cookies logs you out.
- **Do Not Track (DNT)**: honoured as a best-effort measure; no behavioural tracking is deployed that would be affected by it.

## 7. Changes to this policy

The Cookie Policy is updated before adding any new cookie category or analytics tool. Material changes — such as new marketing or analytics cookies — are notified via in-app notification and by email to registered users at least 14 days before the change takes effect. The "Last updated" date on the live page reflects the most recent revision.

## 8. Contact

Questions or data rights: dpo@ozvor.com · [Data Subject Request](https://ozvor.com/legal/dsr-request) · [Privacy Policy](https://ozvor.com/privacy-policy).

---

_This mirror reflects operator-authored live copy. It does not constitute legal advice._
