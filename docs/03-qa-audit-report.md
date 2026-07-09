# Ozvor — 3-Layer QA Audit Report

**Date:** 2026-07-09  
**Auditor:** Hermes Agent  
**Scope:** Full website (ozvor.com) including marketing pages, free test form, authentication, dashboard, connections, and API routes  
**Methodology:** Source code analysis + live browser testing (3 layers: UX/Frontend → Auth/OAuth → Backend/Security)

---

## Layer 1 — UX & Frontend

### 🔴 CRITICAL BUG T1: OAuth buttons positioned at top of form instead of next to email field

**Location:** `/test` — InvisibilityTestClient.tsx (deployed build)

**Problem:** The "Continue with Google / GitHub / LinkedIn" buttons render at the TOP of the free test form, above all fields. The user must fill in website, brand, and category before reaching the email field — but the OAuth sign-in should authenticate the user first and populate their email.

**Current DOM order:**
```
<OAuth buttons>  ← top
<Website field>
<Brand field>
<Category field>
<Email field>    ← too far from OAuth buttons
```

**Expected order:**
```
<Website field>
<Brand field>
<Category field>
<OAuth buttons> ← next to email
<Email field>   ← pre-filled from OAuth
```

**Fix:** Move `l.F` (OAuthButtons component) from before the website field to just above/beside the email field.

---

### 🟡 HIGH BUG T2: No email prefill from OAuth session on form restore

**Location:** `/test` — InvisibilityTestClient.tsx (deployed build)

**Problem:** After OAuth sign-in redirects back to `/test`, the state restoration mechanism (`d.tw` / `onBeforeRedirect`) saves the form to sessionStorage but restores only what was **already typed** before the redirect. The authenticated email from the OAuth provider (`getUser().email`) is never fetched and pre-filled.

**Flow that fails:**
1. User lands on `/test` with empty form
2. Clicks "Continue with Google" immediately (no email typed yet)
3. Google OAuth succeeds, redirects back to `/test`
4. Saved form state has `email: ""` (nothing was typed)
5. No attempt to fetch `getSupabase().auth.getUser()` → email stays empty

**Fix:** After OAuth redirect completes, always read `getSupabase().auth.getUser()` and if no email was previously saved in sessionStorage, populate from the authenticated user's email.

---

### 🟡 HIGH BUG T3: OAuth redirect target drops user back on generic page

**Location:** `/test` and `/login`

**Problem:** The `redirectTo` for OAuth on `/test` takes the user through Supabase OAuth callback, then back to `/test`. But after completing, the page performs a **full reload** — losing the scroll position, the "already used" test detection, and any unsaved form progress. Worse, if the OAuth redirect URL param handling is slightly off, the user ends up at `/dashboard` instead of back at `/test` with their result.

**Evidence:** The deployed build's OAuth flow uses `signInWithOAuth({ options: { redirectTo } })` where `redirectTo` is the current page URL. After OAuth, the browser lands on that URL, but the `detectSessionInUrl: true` in Supabase client processes the URL fragment and then **removes it** — a browser navigation that can trigger a full SSR render reset.

---

### 🔴 CRITICAL BUG T4: No "Run my free test" enabled after OAuth prefill

**Location:** `/test` form

**Problem:** Even if the email were pre-filled from OAuth, the "Run my free test" submit button is only enabled when ALL required fields are filled (website, brand, category, email) AND the email is valid. If only email was pre-filled, the button remains disabled — terrible UX: the user authenticated but still can't run the test.

**Fix:** After OAuth prefills email, the form should also pre-fill website and brand from the authenticated user's profile (if available) or at minimum show a clear "what's missing" state.

---

### 🟢 LOW BUG T5: "Already used free test" state has no OAuth-aware reset

**Location:** `/test` — alreadyUsed state

**Problem:** When a returning user sees "You've already used your free test," the CTAs are "Create your account →" (Stripe checkout) and "Get the Kit — $29". Neither offers to sign them into their existing account. If they already have an account (with this email), they should be directed to `/login` or `/dashboard`.

---

### 🟢 LOW BUG T6: Cookie consent banner overlaps form fields

**Location:** `/test`

**Problem:** On first visit, the "We value your privacy" overlay banner sits directly on top of the form fields. The user must dismiss it before seeing the form. This adds friction to a conversion funnel that should be as smooth as possible.

**Suggestion:** Move the cookie banner to a persistent bottom bar or accept automatically on the `/test` funnel (with an opt-out in the footer) to reduce conversion friction.

---

## Layer 2 — Authentication & OAuth Flows

### 🔴 CRITICAL BUG A1: OAuth identity never linked to existing magic-link accounts

**Location:** `/login` page, Supabase Auth, no `/auth/callback` route

**Problem:** This is the "connects with old email" bug. When a user first signs up with email magic link (e.g., `otavio@company.com`), Supabase creates a user record with that email.

When the same user later clicks "Continue with Google" and authenticates with `otavio@gmail.com`, Supabase (by default) creates a **second, separate user**. The two identities are NOT linked.

The result: the user signs into the platform via Google OAuth and sees an **empty dashboard** (no brands, no audits) because it's a different Supabase user than the one with their data.

**No account linking flow exists** in the codebase:
- No `auth/callback` route to merge identities
- No Supabase `linkIdentity()` call anywhere
- No `/login?link_account=true` flow

**Fix:** Implement Supabase `linkIdentity()` after OAuth sign-in, or implement a proper `/auth/callback` route that detects existing users by email and links OAuth identities. See Supabase docs: https://supabase.com/docs/reference/javascript/auth-linkidentity

---

### 🟡 HIGH BUG A2: No `/auth/callback` route

**Location:** Missing route — should be `apps/web/src/app/auth/callback/route.ts`

**Problem:** The Next.js app has **no server-side route handler for Supabase Auth callbacks**. The OAuth flow relies entirely on the client-side `detectSessionInUrl: true` option in `@supabase/supabase-js`.

This creates several failure modes:
1. **Token in URL:** After OAuth flow, the URL contains `#access_token=...` or `?code=...` — these are visible to the user and could be leaked via referrer headers
2. **No server-side session cookie:** The session is only stored in `localStorage` (client-side), making it unavailable on initial SSR
3. **No identity linking:** Without server-side interception of the OAuth callback, there's no opportunity to check if the OAuth email matches an existing user and link identities
4. **Fragile redirect:** If any URL param is missing or malformed, the client silently fails to detect the session

**Fix:** Implement `apps/web/src/app/auth/callback/route.ts` as a server-side route that:
1. Exchanges OAuth code for session (server-side)
2. Sets HTTP-only session cookie
3. Redirects to the original page without exposing tokens in the URL

---

### 🟡 HIGH BUG A3: Free test OAuth flow and platform login OAuth flow are conflated

**Location:** `/test` and `/login`

**Problem:** The OAuth on the `/test` page uses the **same Supabase `signInWithOAuth()` call** as the `/login` page. This conflates two different intents:

1. **Platform login** (on `/login`): User wants to sign into their Ozvor account
2. **Free test authentication** (on `/test`): User wants to authenticate their email so results are saved

When a user on the free test clicks "Continue with Google", they are creating a full Supabase Auth user session — not just a lightweight email verification. This:
- Creates a session they may not want (they just wanted a free test)
- Pollutes the user database with OAuth identities for free-test-only users
- Creates confusion when the free test redirects to Google OAuth instead of staying on the page

**Fix:** For the free test, use a **lightweight OTP or separate lightweight identity** — or clearly document that OAuth on the free test creates a platform account.

---

### 🟢 LOW BUG A4: Welcome page has no OAuth option

**Location:** `/welcome` — WelcomePage.tsx

**Problem:** The post-payment `/welcome` page only offers email magic-link sign-in. Users who just paid and want to sign in with Google are confused. They need to go to `/login` separately.

---

## Layer 3 — Backend & Security

### 🟡 HIGH BUG B1: Lack of server-side session management

**Location:** All authenticated pages

**Problem:** The app stores Supabase session **only in browser localStorage** (client-side). There is:
- No Supabase `setSession()` call on the server
- No `createServerClient()` for server components
- No HTTP-only session cookie

This means:
- Every `apiFetch()` call must use `getSupabase().auth.getSession()` client-side, then manually pass `Authorization: Bearer <token>` — the token could be stale
- Server components cannot verify auth state
- The app cannot do server-side redirects for unauthenticated users

**Fix:** Implement Supabase server-side client in middleware or a dedicated auth route. Set an HTTP-only cookie with the session.

---

### 🟡 HIGH BUG B2: CSP blocks some required resources

**Location:** `middleware.ts` Content-Security-Policy

**Problem:** The Content-Security-Policy in `middleware.ts` is missing several domains that the application uses:

```
Missing from connect-src:
- https://assets.calendly.com  ← Calendly embed on /book
- https://calendly.com         ← Calendly API

Missing from frame-src:
- https://calendly.com          ← Calendly iframe for booking

Missing from img-src:
- https://*.calendly.com        ← Calendly images

Missing from font-src:
- https://assets.calendly.com   ← Calendly fonts
```

**Current CSP violations observed:**
- Calendly embed may fail silently on the `/book` page
- Any resource from Calendly is blocked, breaking the booking flow

---

### 🟢 LOW BUG B3: Social accounts popup polling instead of postMessage

**Location:** `/account/connections` — `page.tsx:537-545`

**Problem:** The Google OAuth connections flow polls `window.closed` every 500ms:
```tsx
const interval = setInterval(() => {
  if (googlePopupRef.current && googlePopupRef.current.closed) {
    googlePopupRef.current = null;
    if (selectedBrandId) void loadConnections(selectedBrandId);
  }
}, 500);
```

This is inefficient (runs 120 times for a 60-second OAuth flow) and fragile (if the popup closes without completing the OAuth, the page acts as if it succeeded).

**Fix:** Use `postMessage` or the OAuth redirect URL pattern instead of popup polling.

---

### 🟢 LOW BUG B4: Shared report access token validation is client-side only

**Location:** `apps/web/src/app/r/[token]/page.tsx`

**Problem:** The `/r/[token]` page validates the report token only on the client side via a `useEffect` with `fetch()`. There is no server-side rendering with the token, meaning:
- The report URL cannot be crawled by Google/SEO
- There's a flash of "Loading report…" before content appears
- 404 responses are handled client-side

**Fix:** Convert to a server component with async data fetching for SSR.

---

### 🟢 LOW BUG B5: Google OAuth state tokens potentially expose brandId

**Location:** `apps/api/src/auth/google-oauth-state.ts`

**Observation:** The Google OAuth state payload includes `brandId`, `tenantId`, and `userId` in Redis. While the state string is random 256-bit entropy and single-use, the `brandId` in the payload is a **non-PII identifier** — but it could theoretically be used for enumeration if the state is leaked before consumption.

**Risk:** Very low — state tokens are single-use with 10-min TTL. Documented here for completeness.

---

## Summary & Priority Action Plan

| Priority | Bug | Component | Estimated Effort |
|----------|-----|-----------|-----------------|
| 🔴🔥 **P0** | **A1:** OAuth not linked to existing accounts → "connects with old email" | `/login`, Supabase Auth | 4-8h (add `/auth/callback` + `linkIdentity()`) |
| 🔴🔥 **P0** | **T1:** OAuth buttons at top of form, not next to email | `/test` form | 1-2h (move component) |
| 🔴🔥 **P0** | **T4:** OAuth prefills email but form still disabled | `/test` form | 2-4h (post-OAuth state restoration) |
| 🟡 **P1** | **A2:** No server-side `/auth/callback` route | Missing route | 4-6h (implement auth callback) |
| 🟡 **P1** | **A3:** Free test OAuth conflated with platform login | `/test` OAuth | 2-4h (separate concerns or document) |
| 🟡 **P1** | **T2:** No email prefill from OAuth session | `/test` post-OAuth state | 2h (read `getUser()` on restore) |
| 🟡 **P2** | **B1:** No server-side session management | Auth infrastructure | 8-16h (server-side Supabase client + cookies) |
| 🟡 **P2** | **B2:** CSP blocks Calendly resources | `middleware.ts` | 0.5h (update CSP) |
| 🟢 **P3** | **T5,T6,A4,B3,B4** | Various | Per-item |

---

## Recommended First Actions

1. **Fix the OAuth → email mismatch (A1):** Add a `/auth/callback` route handler that checks if the OAuth email matches an existing user and calls `supabase.auth.linkIdentity()` to merge accounts.

2. **Fix the free test form layout (T1):** Move the OAuth buttons from the top of the form to immediately above the email field. Add a clear visual separator ("Or sign in with Google...").

3. **Fix post-OAuth email prefill (T2+T4):** After OAuth redirect to `/test`, fetch `getSupabase().auth.getUser()` and populate the email field. If the form was empty before OAuth, populate all available fields from the user profile.

4. **Fix CSP (B2):** Add Calendly domains to the Content-Security-Policy.

5. **Add account identity linking:** On the `/login` page, when a user signs in with OAuth and there's already a user with the same email, call `supabase.auth.linkIdentity()` to merge the identities.
