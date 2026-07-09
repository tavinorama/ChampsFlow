---
title: "Full 3-Layer QA Audit — Complete Report with Internal Pages"
risk: MEDIUM
labels: hermes-review, claude-ready
---

## Full QA Audit: All Layers + Internal Pages

**Date:** 2026-07-09  
**Scope:** ozvor.com — marketing pages, `/test` free test, auth/OAuth flows, all authenticated app pages (dashboard, brands, billing, connections, integrations, API keys, data privacy, system status, legal, white-label, admin, agency, schedule, drafts, create), checkout/payment flow, security headers  
**Methodology:** Source code analysis + live browser testing (16 pages navigated) + CSP/security header review

---

## Layer 1 — UX / Frontend

### 🔴 CRITICAL T1: OAuth buttons positioned above all form fields instead of next to email

**Pages:** `/test`  
**File:** InvisibilityTestClient.tsx (deployed: component `l.F`)

**Problem:** The OAuth buttons render at the TOP of the form, separated from the email field by website, brand, and category fields. Current DOM order:

```
<OAuth Google/GitHub/LinkedIn buttons>    ← TOP
<Website field>
<Brand field>
<Category field>
<Email field>                              ← OAuth buttons too far
```

**Expected:** OAuth buttons immediately above the email field, with "or sign in with" clear visual separator.

---

### 🔴 CRITICAL T2: No email prefill from OAuth session after redirect

**Page:** `/test`  
**File:** InvisibilityTestClient.tsx (deployed build)

**Problem:** After OAuth redirect back to `/test`, the form restores from sessionStorage but only restores what was **already typed**. The authenticated email from `getSupabase().auth.getUser()` is never fetched. So if user clicks "Google" on empty form → OAuth → lands back on `/test` → email field stays empty.

The restore logic (`e=>U(r=>r||e)`) means "restore saved email but only if current is empty" — but the saved email is also empty because nothing was typed before OAuth.

**Fix:** After OAuth redirect, call `getSupabase().auth.getUser()` and if `email` isn't already set, prefill it. Also prefill brand/domain from user profile if available.

---

### 🔴 CRITICAL T3: Form button stays disabled even if email were prefilled

**Page:** `/test`  
**File:** InvisibilityTestClient.tsx

**Problem:** The "Run my free test" submit button requires ALL fields to be non-empty + valid email. If only email were prefilled from OAuth, the button remains disabled — user authenticated but can't run the test.

**Fix:** After OAuth completes, populate email AND show clear "website + brand + category required" state. Or auto-prefill brand/domain from OAuth profile metadata.

---

### 🟡 HIGH T4: Duplicate "Add brand" CTA links to wrong section

**Page:** `/dashboard`  
**File:** Dashboard page.tsx

**Problem:** The "+ Add brand" button links to `/brands` (the full brands page), but the brands page has the "Add a brand" form right there. However, on dashboard it says "Run your first audit →" which is just a text link, not a button. These should be coordinated — either always go to `/brands/new` or open inline.

---

### 🟡 HIGH T5: Navigation sidebar "Competitors" and "Citation sources" both point to `/brands`

**Page:** All authenticated pages  
**File:** AppSidebar.tsx (lines 41-42)

**Problem:** Both "Competitors" and "Citation sources" links in the sidebar's Intelligence section point to `/brands`. These are placeholder URLs with no actual /competitors or /citation-sources routes implemented. Users click them expecting dedicated pages and land on the wrong section.

```typescript
{ href: "/brands", label: "Competitors", description: "Who AI recommends instead", icon: "◇" },
{ href: "/brands", label: "Citation sources", description: "Reddit, LinkedIn, G2 and more", icon: "↗" },
```

**Should be:** Either stub pages with "Coming soon" state, or remove from nav until implemented.

---

### 🟡 HIGH T6: "/schedule" (Calendar) always shows error state

**Page:** `/schedule`  
**File:** schedule/page.tsx

**Problem:** The Calendar page shows an alert with "Try again" button on load because the API call fails. There's no graceful empty state or demo state. For a user with no scheduled posts, it should show "No scheduled posts yet" instead of an error.

---

### 🟡 HIGH T7: "/drafts" (Fix queue) always shows error state "Couldn't load your fixes"

**Page:** `/drafts`  
**File:** drafts/page.tsx

**Problem:** Similar to T6 — the fix queue shows a hard error state instead of an empty state when there are no fixes or when the API is unreachable. For new users, this looks broken. Should show "No fixes yet — run an audit to get started."

---

### 🟢 LOW T8: "/create" page shows "Generate post draft" button disabled with no guidance

**Page:** `/create`

**Problem:** The "Generate post draft" button is disabled until the user provides a topic/URL, but there's no explanation of what the feature does or what to type. For unauthenticated users (no social accounts connected), it should explain that they need to connect a publishing platform first.

---

### 🟢 LOW T9: Cannot dismiss the cookie banner after accepting on some pages

**Page:** Various

**Problem:** After clicking "Accept all" on cookie consent, the banner disappears but an alert "Cookie preferences saved: all cookies accepted." remains and cannot be dismissed on some pages.

---

### 🟢 LOW T10: "Back" button on app pages goes to wrong place

**Page:** All authenticated pages  
**File:** AppTopBar.tsx

**Problem:** The "Go back" button (labeled "Back") uses `router.back()` which goes to browser history. For users who came directly to `/account/billing` from a bookmark or notification, `router.back()` goes to whatever was before (potentially another site), not to `/dashboard` as expected.

**Fix:** On app entry pages (no referrer from within the app), "Back" should default to `/dashboard`.

---

## Layer 2 — Authentication & OAuth

### 🔴 CRITICAL A1: OAuth identity never linked to existing magic-link accounts

**Pages:** `/login`, `/test`  
**Root cause:** No Supabase `linkIdentity()` call anywhere + no `/auth/callback` route

**Problem (the "connects with old email" bug):** When a user:
1. First signs up with email magic link → Supabase creates user A (e.g., `otavio@company.com`)
2. Later clicks "Continue with Google" and authenticates with `otavio@gmail.com` → Supabase creates user B

These are **two separate users** with **different databases**. When user signs in via Google OAuth, they see an empty dashboard because user B has no brands, no audits.

**Evidence:** No `linkIdentity()` call anywhere in the codebase. No `/auth/callback` route. The `/login` page's `handleOAuth` function just calls `signInWithOAuth()` without any identity linking logic (login/page.tsx:164-201).

**Fix:** Implement a proper `/auth/callback` route that:
1. Checks if the OAuth email matches an existing user
2. If yes, calls `supabase.auth.linkIdentity()` to merge accounts
3. If no, proceeds with new account creation

---

### 🟡 HIGH A2: No server-side `/auth/callback` route

**Missing file:** `apps/web/src/app/auth/callback/route.ts`

**Problem:** The entire OAuth flow relies on client-side `detectSessionInUrl: true` in `@supabase/supabase-js` (supabase-browser.ts:32). This means:
1. OAuth tokens (`#access_token`) are visible in the browser URL after redirect
2. No HTTP-only session cookie — session stored only in localStorage
3. Server components cannot verify auth state on SSR
4. No opportunity for identity linking
5. Fragile: any URL param mismatch silently fails to detect the session

**Fix:** Implement server-side auth callback route that exchanges OAuth code server-side + sets HTTP-only cookie.

---

### 🟡 HIGH A3: Free test OAuth creates full platform session

**Pages:** `/test`  
**File:** InvisibilityTestClient.tsx (deployed)

**Problem:** The OAuth on `/test` uses the same `signInWithOAuth()` call as the `/login` page. This conflates two intents:
1. **Platform login** — user wants full account
2. **Free test auth** — user just wants their test results saved

A user clicking "Continue with Google" on `/test` gets a full Supabase Auth session they may not want. Their email is now registered as a platform user even if they only wanted a one-off test.

---

### 🟡 HIGH A4: No session-aware redirect on app pages

**Pages:** All authenticated routes

**Problem:** There's no middleware or layout-level check that redirects unauthenticated users to `/login`. Loading any authenticated route without a session shows error states instead of redirecting to login. The root layout checks path prefixes but doesn't check auth state. The DPA gate wraps content but doesn't redirect for auth.

**Fix:** Add auth check to middleware.ts for authenticated route prefixes, redirecting to `/login?next=<original_path>` when no valid session exists.

---

### 🟢 LOW A5: Welcome page has no OAuth after purchase

**Page:** `/welcome`

**Problem:** Post-payment `/welcome` page only offers email magic-link sign-in. Users who just paid via Stripe and want to sign in with Google must find `/login` manually.

---

## Layer 3 — Backend & Security

### 🟡 HIGH B1: CSP blocks Calendly and other resources

**File:** `middleware.ts`

**Problem:** Content-Security-Policy is missing several domains used by the application:

| Missing From | Missing Domains |
|---|---|
| `connect-src` | `https://calendly.com`, `https://*.calendly.com` |
| `frame-src` | `https://calendly.com` |
| `img-src` | `https://*.calendly.com` |
| `font-src` | `https://assets.calendly.com` |

The `/book` page uses a Calendly embed (`CalendlyEmbedSection.tsx`) which will be silently blocked by CSP.

Also, `js.stripe.com` is in `script-src` as fallback but `api.stripe.com` and `r.stripe.com` are only in `connect-src`. The `frame-src` for Stripe is correct.

---

### 🟡 HIGH B2: No server-side session management (no HTTP-only cookies)

**File:** `supabase-browser.ts`

**Problem:** The Supabase session is stored exclusively in browser `localStorage`. Every authenticated API call must manually extract the token from `getSupabase().auth.getSession()` and add `Authorization: Bearer <token>` via `apiFetch()`. This means:
- Tokens can be read by any JS in the same origin (XSS vulnerability)
- Tokens can expire without the app knowing until the next `apiFetch()` call fails
- Server components cannot determine auth state on initial render
- The app renders content before knowing if the user is authenticated

**Current architecture:** Client → localStorage session → `apiFetch(path, { headers })` → Hono API with JWT verify

**Best practice:** Client → HTTP-only cookie → Next.js middleware → Server Component reads cookie → API call with `Authorization: Bearer <cookie_session>`

---

### 🟡 HIGH B3: Stripe Webhook idempotency key uses Redis NX but missing durable fallback

**File:** `billing.ts:101-107`

**Problem:** The webhook idempotency check uses `redis.set(key, "1", { nx: true, ex: 7 * 24 * 3600 })`. If Redis is down, the NX returns null (treated as "already processed"), silently skipping webhook processing. This means a Redis outage during a `checkout.session.completed` event causes the user to pay but never have their account upgraded.

The DB update also uses `WHERE stripe_event_id_last IS DISTINCT FROM $eventId` as a durable fallback, which provides protection — but the Redis-first check can still drop events during Redis downtime.

**Risk:** Low probability but high impact — user paid but no plan activated, with no error raised to anyone.

---

### 🟡 HIGH B4: Social accounts OAuth popup polling instead of postMessage

**File:** `connections/page.tsx:537-545`

```typescript
const interval = setInterval(() => {
  if (googlePopupRef.current && googlePopupRef.current.closed) {
    googlePopupRef.current = null;
    if (selectedBrandId) void loadConnections(selectedBrandId);
  }
}, 500);
```

**Problem:** Polling `window.closed` every 500ms is inefficient (120 polls for a 60-second flow). If the popup closes due to user canceling OAuth in the popup, the page assumes success and tries to load connections. The popup could also be blocked by the browser and not detected.

**Fix:** Use postMessage API: the OAuth callback popup posts a message to the parent window with success/failure, and the parent listens for the `message` event once.

---

### 🟢 LOW B5: Admin page accessible to all authenticated users

**Page:** `/admin`

**Problem:** The admin page route exists and is accessible from the app navigation (sidebar → no direct link, but `/admin` is directly accessible). While the page content likely checks for `super_admin` role, the route itself is listed in `AUTHED_APP_PREFIXES` in the root layout (layout.tsx:111). Unauthorized users see an error instead of a redirect.

**Fix:** Route-level guard rather than content-level guard.

---

### 🟢 LOW B6: Stripe API key check on every webhook load throws error

**File:** `stripe.ts:61-66`

```typescript
if (!secretKey) throw new Error("STRIPE_SECRET_KEY ...");
if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET ...");
```

**Problem:** These throw on module import if env vars are missing, crashing the entire API startup. Should be graceful warning + disabled Stripe routes instead.

---

### 🟢 LOW B7: Checkout rate limit key uses truncated IP as sole identifier

**File:** `checkout.ts:79-88`

**Problem:** The rate limit key is `checkout_direct_rl:{truncatedIp}`. Corporate NAT users behind the same public IP share the rate limit bucket (10/hour). If 11 people from the same office try to checkout in the same hour, only 10 succeed. Low impact but worth noting.

---

### 🟢 LOW B8: System status page hardcodes "Live mode" text

**Page:** `/account/system-status`

**Problem:** The page shows "● Live mode — querying real AI engines" as static text, not fetched from the API. If the system is actually in degraded mode, the status page would incorrectly report everything is fine.

---

## Internal Pages Specific Issues

### Brand Form (`/brands`)

- 🟡 **B9:** "Add brand" button disabled until all fields filled — but no "Brand name" shows no error state if user tries to submit with empty brand name
- 🟡 **B10:** "Public profiles (optional)" collapsible section labeled as a button with `aria-expanded` but is a `<div>` not a `<button>` — accessibility violation
- 🟢 **B11:** No max-length validation on brand name or category inputs

### API Keys (`/account/api-keys`)

- 🟢 **B12:** "Create key" button uses `type="button"` but should use `type="submit"` in a form context
- 🟢 **B13:** No key created state shown (how does the user see their newly created key?)

### Data Privacy (`/account/data-privacy`)

- 🟢 **B14:** "Limit use of sensitive personal information" switch defaults to unchecked with no confirmation on toggle
- 🟢 **B15:** All DSR links go to separate pages, forcing navigation away — could use inline modals

### Billing (`/account/billing`)

- 🟢 **B16:** "Manage in Stripe" button shown even when `managed_by_stripe` is false (granted/founder accounts) — fix confirmed present in code but may still render if API doesn't return the field
- 🟢 **B17:** No loading skeleton for plan cards — raw text appears before styling

### Integrations (`/account/integrations`)

- 🟡 **B18:** "Could not load your connections" alert shown even though user IS NOT logged in — should redirect to login or show "Sign in to connect platforms"
- 🟢 **B19:** "Tool connectors (MCP)" section has empty content — "Tutorials" link goes nowhere useful

### White-Label (`/account/white-label`)

- 🟢 **B20:** Page shows "Agency plan required" which is correct, but the "Upgrade to Agency" link goes to `/account/billing` — correct but could be more specific

### Admin (`/admin`)

- 🟡 **B21:** On unauthenticated access, shows "Admin" heading with an empty alert — should redirect to `/login` or show "Access denied"

---

## Priority Action Plan

| Prio | ID | Issue | Component | Effort |
|------|-----|-------|-----------|--------|
| 🔥P0 | A1 | OAuth identity linking (old email bug) | Auth flow | 4-8h |
| 🔥P0 | T1+T2+T3 | OAuth pos + email prefill on /test | InvisibilityTestClient | 4-6h |
| 🔥P0 | A4 | No auth redirect on app pages | Middleware | 2-4h |
| 🟡P1 | T5 | Nav competitors/citation broken links | AppSidebar | 0.5h |
| 🟡P1 | A2 | No server-side auth callback | New /auth/callback route | 4-6h |
| 🟡P1 | B1 | CSP blocks Calendly | middleware.ts | 0.5h |
| 🟡P1 | B2 | No HTTP-only session cookies | Auth infrastructure | 8-16h |
| 🟡P1 | T6+T7 | Always-error empty states | schedule + drafts | 2-4h |
| 🟡P2 | A3 | Free test OAuth conflated w/ login | InvisibilityTestClient | 2-4h |
| 🟡P2 | B3 | Stripe webhook Redis-only idempotency | billing.ts | 2h |
| 🟡P2 | B4 | OAuth popup polling | connections/page.tsx | 2h |
| 🟢P3 | T8-T10, B5-B21 | Various minor | Various | Per-item |

---

## Files Modified

This PR is documentation-only. The audit report is saved at `docs/03-qa-audit-report.md`. Claude Code should use this report to create individual fix PRs scoped per issue.
