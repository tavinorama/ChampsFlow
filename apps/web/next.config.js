/** @type {import('next').NextConfig} */

const path = require("path");

// ---------------------------------------------------------------------------
// Security headers (SEC-G7-4 / S-13 / S-15)
// ---------------------------------------------------------------------------
// Applied on every response from the Next.js frontend.
// API security headers are separately configured in apps/api/src/index.ts
// via Hono secureHeaders() with explicit options.
//
// CSP notes:
//  - script-src: 'self' + Stripe.js (required for Stripe Elements).
//    No 'unsafe-inline' for scripts. Nonces via Next.js experimental.nonce
//    may be added in a future iteration if inline event handlers are needed.
//  - connect-src: 'self' + Stripe telemetry + Supabase Auth
//  - frame-src: Stripe (for Stripe Payment Element iframe)
//  - img-src: 'self' + data URIs for Next.js Image placeholder + LinkedIn/Meta CDNs
// ---------------------------------------------------------------------------

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  // NOTE: Content-Security-Policy is intentionally NOT set here.
  // It is generated per-request (with a fresh nonce + strict-dynamic) in
  // middleware.ts, because a static `script-src 'self'` CSP blocks the inline
  // scripts Next.js App Router needs to stream/hydrate content — which renders
  // a blank page in production. A nonce-based CSP can only be dynamic, so it
  // lives in middleware. The headers below remain static and safe to set here.
];

const nextConfig = {
  // Pin the file-tracing root to THIS app's monorepo root (…/apps/web → ../..).
  // Without it, Next infers the root by scanning for lockfiles and — in a git
  // worktree or any checkout nested under another repo — finds TWO lockfiles and
  // guesses the wrong parent directory, emitting the "inferred your workspace
  // root, but it may not be correct" warning. Pinning it makes `output:
  // standalone` tracing deterministic (the Railway bundle traces the right root)
  // and silences the warning. __dirname is …/apps/web in every checkout.
  outputFileTracingRoot: path.join(__dirname, "../.."),

  // Standalone output for Docker — produces a minimal runtime bundle in
  // .next/standalone/. Enabled ONLY when NEXT_OUTPUT=standalone is set
  // (the Docker build sets it). The key is fully ABSENT in `next dev`
  // so it can never interfere with the dev middleware pipeline.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone" }
    : {}),

  // Apply security headers to all routes
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  // Permanent redirects for legacy / promised URLs.
  // /privacy/dsr was published in our compliance records (ROPA/DPIA) as the
  // public DSR intake portal, but the implemented public form lives at
  // /legal/dsr-request — so the promised URL 404'd (Hermes daily brief
  // 2026-07-14, B4). Redirect it (and the shorter /privacy/dsr-request alias)
  // to the real form so any regulator- or policy-facing link resolves.
  async redirects() {
    return [
      {
        source: "/privacy/dsr",
        destination: "/legal/dsr-request",
        permanent: true,
      },
      {
        source: "/privacy/dsr-request",
        destination: "/legal/dsr-request",
        permanent: true,
      },
    ];
  },

  // Proxy API calls to the Hono API server. Next.js route handlers under
  // src/app/api/* (e.g. /api/waitlist) take precedence over rewrites, so this
  // catch-all only forwards the routes that DON'T have a local handler
  // (/api/brands, /api/audits, /api/reports, etc.) to the Hono backend.
  // INTERNAL_API_URL is the Railway internal service URL in prod; localhost in dev.
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL ?? "http://localhost:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      // /play serves the GEO Search Runner game (a self-contained static HTML
      // in public/) under a clean URL. The game posts its optional email lead
      // to /api/game-lead (proxied to Hono above).
      {
        source: "/play",
        destination: "/geo-runner.html",
      },
    ];
  },

  // Ensure images from external CDNs used for social account avatars are allowed
  images: {
    domains: [
      "media.licdn.com",
      "pbs.twimg.com",
      "instagram.com",
      "cdninstagram.com",
    ],
  },

  // TypeScript and ESLint strictness
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
