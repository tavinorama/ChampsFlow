/**
 * Next.js middleware
 *
 * Two responsibilities:
 *
 * 1. x-pathname header — so Server Components (root layout) can know the
 *    current pathname and render different chrome on marketing vs app pages.
 *
 * 2. Nonce-based Content-Security-Policy — Next.js App Router injects many
 *    inline <script> tags to stream and hydrate content. A static
 *    `script-src 'self'` CSP (previously set in next.config.js) BLOCKED those
 *    inline scripts in production, leaving a blank page. The secure fix is a
 *    per-request nonce + 'strict-dynamic': Next.js stamps the nonce on its own
 *    scripts, and strict-dynamic lets those trusted scripts load the rest.
 *    This keeps us off 'unsafe-inline' (compliance requirement) while letting
 *    the App Router work.
 *
 * The CSP is set on BOTH the request headers (so Next.js can read the nonce)
 * and the response headers (so the browser enforces it).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthedAppPath } from "./lib/routes";

export async function middleware(request: NextRequest) {
  // Edge-runtime-safe nonce (no Node Buffer available here).
  const nonce = btoa(crypto.randomUUID());

  const csp = [
    "default-src 'self'",
    // Nonce + strict-dynamic for Next.js inline + chunk scripts.
    // Host allowlist (js.stripe.com) is a fallback for browsers that ignore
    // strict-dynamic.
    // js.stripe.com (Stripe) + assets.calendly.com (Calendly widget.js) are
    // host-allowlist fallbacks for browsers that ignore 'strict-dynamic'.
    // www.googletagmanager.com (GA4 gtag.js, consent-gated in Ga4Analytics) is
    // a host-allowlist fallback like the others below.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://assets.calendly.com https://www.googletagmanager.com`,
    // Next.js injects inline <style> for CSS-in-JS; 'unsafe-inline' for styles
    // is low-risk (styles can't exfiltrate data) and required. Calendly also
    // injects its own inline styles for the embed.
    "style-src 'self' 'unsafe-inline' https://assets.calendly.com",
    // *.google-analytics.com / *.googletagmanager.com: GA4 collect pixels.
    "img-src 'self' data: https://media.licdn.com https://pbs.twimg.com https://instagram.com https://cdninstagram.com https://images.unsplash.com https://*.calendly.com https://*.google-analytics.com https://*.googletagmanager.com",
    "font-src 'self' https://assets.calendly.com",
    // GA4 sends hits to regionalized *.google-analytics.com / *.analytics.google.com.
    "connect-src 'self' https://*.supabase.co https://api.stripe.com https://r.stripe.com https://calendly.com https://*.calendly.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
    // Calendly renders its booking UI in an iframe from calendly.com.
    // https://www.google.com — Ozvor Pages' Maps Embed iframe (map_nap
    // section, #208 PR-9): free/unlimited Maps Embed API, browser-restricted
    // key baked into the src, no script execution — the iframe itself is the
    // sandbox boundary.
    "frame-src https://js.stripe.com https://hooks.stripe.com https://calendly.com https://www.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the nonce from the CSP on the *request* headers.
  requestHeaders.set("Content-Security-Policy", csp);

  // --- Auth gate (SSR cookie sessions) --------------------------------------
  // Redirect a logged-OUT visitor off authenticated app pages to /login. The
  // decision is based on the PRESENCE of a Supabase auth cookie only, so a
  // Supabase outage can never lock out a user who genuinely has a session
  // (fail-open). The API still does the real RS256 JWT verification.
  const path = request.nextUrl.pathname;
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  if (!hasSession && isAuthedAppPath(path)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    const redirect = NextResponse.redirect(redirectUrl);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Refresh the Supabase session cookie when one exists (skips the network call
  // for anonymous public traffic). getUser() rotates the token via setAll below.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (hasSession && supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });
    try {
      await supabase.auth.getUser();
    } catch {
      // Fail open — never block a request on a Supabase hiccup.
    }
  }

  // The browser enforces the CSP from the *response* headers.
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /_next/static (static assets)
     * - /_next/image (image optimization)
     * - favicon and common static image files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
