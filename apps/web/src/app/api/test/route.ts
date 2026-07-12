/**
 * Next.js App Router API route — /api/test
 *
 * Proxies POST requests to the Hono API server at INTERNAL_API_URL/api/test.
 * This keeps InvisibilityTestClient calling a same-origin URL (/api/test) without
 * CORS concerns, and preserves the real client IP so the Hono rate-limit
 * (8 free tests / hour / IP) buckets by actual user rather than the Railway
 * proxy IP.
 *
 * App Router routes take priority over next.config.js rewrites, so this route
 * REPLACES the rewrite for /api/test. The proxy logic lives here instead.
 *
 * In production: INTERNAL_API_URL is the Railway internal service URL.
 * In development: INTERNAL_API_URL defaults to http://localhost:3001.
 *
 * Hard rules:
 *  - No console.log
 *  - Forward the real client IP via X-Forwarded-For so the Hono layer can
 *    apply per-IP rate limiting correctly.
 *  - Do not log request body (may contain brand/email — PII)
 */

import { NextRequest, NextResponse } from "next/server";
import { clientIpForwardHeaders } from "../../../lib/forward-ip";

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ?? "http://localhost:3001";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(`${INTERNAL_API_URL}/api/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward cf-connecting-ip (unspoofable at the edge) + XFF for the
        // Hono rate limiter — the API prefers cf-connecting-ip.
        ...clientIpForwardHeaders(request),
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));

    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", code: "UPSTREAM_ERROR" },
      { status: 502 }
    );
  }
}
