"use client";

/**
 * Supabase browser client (singleton) + authenticated API fetch helper.
 *
 * The client uses ONLY the public anon key (NEXT_PUBLIC_*) — never the service
 * role key (that is server-side only, per .env.example). Auth is passwordless
 * (magic link / OTP), so this app never handles passwords directly.
 *
 * apiFetch() attaches the current session's access token as a Bearer header so
 * the Hono API's requireAuth middleware (RS256 JWT verify) can authenticate
 * the request and resolve tenant_id from the JWT app_metadata claim.
 */

import { createBrowserClient } from "@supabase/ssr";
import { type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  // createBrowserClient stores the session in cookies (readable by middleware +
  // server components), NOT localStorage. getSession()/onAuthStateChange/
  // signInWithOAuth all still work exactly as before.
  _client = createBrowserClient(url, anonKey);
  return _client;
}

/**
 * Whether Supabase env is present. UI can use this to show a friendly
 * "auth not configured" state instead of throwing in local/demo builds.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Authenticated fetch to the API. Attaches the current Supabase access token
 * as `Authorization: Bearer <jwt>`. Calls are same-origin (`/api/...`) which
 * Next rewrites/proxies to the Hono API.
 *
 * Throws { status: 401 } semantics by returning the Response; callers handle
 * non-OK. If there is no session, the request is sent without a token and the
 * API will respond 401 — callers should redirect to /login on 401.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);

  if (isSupabaseConfigured()) {
    try {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch {
      // No session / client error — send unauthenticated; API returns 401.
    }
  }

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, { ...init, headers });
}

/**
 * First-login provisioning. A brand-new magic-link user has no tenant_id claim
 * yet, so the API would 401. Call this once after login (e.g. on the dashboard
 * mount): it asks the API to create the tenant + user and set the Supabase
 * app_metadata, then refreshes the session so the new JWT carries the claims.
 *
 * Returns true if the session was refreshed (caller should re-fetch data).
 * No-op when Supabase isn't configured (local/demo).
 */
export async function ensureProvisioned(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return false;
    const res = await fetch("/api/account/bootstrap", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { refresh?: boolean };
    if (body.refresh) {
      await getSupabase().auth.refreshSession(); // pull the new tenant_id claim
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
