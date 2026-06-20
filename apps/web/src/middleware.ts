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

export function middleware(request: NextRequest) {
  // Edge-runtime-safe nonce (no Node Buffer available here).
  const nonce = btoa(crypto.randomUUID());

  const csp = [
    "default-src 'self'",
    // Nonce + strict-dynamic for Next.js inline + chunk scripts.
    // Host allowlist (js.stripe.com) is a fallback for browsers that ignore
    // strict-dynamic.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    // Next.js injects inline <style> for CSS-in-JS; 'unsafe-inline' for styles
    // is low-risk (styles can't exfiltrate data) and required.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://media.licdn.com https://pbs.twimg.com https://instagram.com https://cdninstagram.com https://images.unsplash.com",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co https://api.stripe.com https://r.stripe.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
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

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

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
