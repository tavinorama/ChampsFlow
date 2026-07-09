import "server-only";

/**
 * Supabase server client (`@supabase/ssr`) for Route Handlers + Server
 * Components. Reads/writes the session cookies via next/headers. Used by the
 * /auth/callback route to exchange the OAuth/magic-link code for a session
 * server-side (so tokens never sit in the URL).
 *
 * Public anon key only — never the service role key.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type SupabaseClient } from "@supabase/supabase-js";

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured (server).");
  }
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component render (cookies are read-only there);
          // the middleware refreshes the session cookie on the next request.
        }
      },
    },
  });
}
