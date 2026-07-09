/**
 * /auth/callback — server-side OAuth + magic-link callback (PKCE).
 *
 * Both `signInWithOAuth({ redirectTo })` and magic-link `emailRedirectTo` point
 * here. Supabase sends a one-time `code`; we exchange it for a session
 * SERVER-SIDE and set the session cookies, then redirect into the app. This
 * means OAuth tokens never appear in the browser URL (#193) and the session
 * lives in cookies the middleware/server can read (#191, #195).
 *
 * `next` is validated to be a same-origin relative path (no open redirect).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase-server";

function safeNext(next: string | null): string {
  // Only same-origin relative paths — never protocol-relative (`//evil.com`).
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const errorParam = searchParams.get("error") ?? searchParams.get("error_description");

  if (errorParam) {
    return NextResponse.redirect(`${origin}/login?error=oauth_denied`);
  }

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    } catch {
      // fall through to the error redirect
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
