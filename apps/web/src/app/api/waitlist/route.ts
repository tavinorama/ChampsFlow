/**
 * Next.js App Router API route — /api/waitlist
 *
 * Proxies POST requests to the Hono API server at INTERNAL_API_URL/api/waitlist.
 * This keeps the WaitlistForm calling a same-origin URL (/api/waitlist) without
 * CORS concerns, and without exposing the internal Hono server URL to the client.
 *
 * In production: INTERNAL_API_URL is the Railway internal service URL.
 * In development: INTERNAL_API_URL defaults to http://localhost:3001.
 *
 * Rate limiting is enforced at the Hono layer. This route does not duplicate it.
 *
 * Hard rules:
 *  - No console.log
 *  - Forward the real client IP via X-Forwarded-For so the Hono layer can
 *    apply per-IP rate limiting correctly.
 *  - Do not log request body (may contain email — PII)
 */

import { NextRequest, NextResponse } from "next/server";

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

  // Forward the real client IP for rate limiting on the Hono side
  const forwardedFor =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "";

  try {
    const upstream = await fetch(`${INTERNAL_API_URL}/api/waitlist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
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
