/**
 * Next.js App Router API route — /api/public/landing/[siteSlug]/lead
 *
 * Proxies POST requests to the Hono API server at
 * INTERNAL_API_URL/api/public/landing/[siteSlug]/lead. Mirrors
 * apps/web/src/app/api/test/route.ts: keeps LeadForm calling a same-origin
 * URL without CORS concerns, and PRESERVES THE REAL CLIENT IP (Next.js
 * rewrites don't) so the Hono rate limit (8 lead submissions / hour / IP)
 * buckets by the actual visitor rather than the Railway proxy IP.
 *
 * App Router routes take priority over next.config.js rewrites, so this
 * route REPLACES the generic `/api/:path*` rewrite for this exact path.
 *
 * Hard rules:
 *  - No console.log
 *  - Forward the real client IP via X-Forwarded-For
 *  - Do not log the request body (name/email/phone/message — PII)
 */

import { NextRequest, NextResponse } from "next/server";
import { clientIpForwardHeaders } from "../../../../../../lib/forward-ip";

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3001";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteSlug: string }> }
): Promise<NextResponse> {
  const { siteSlug } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent") ?? "";

  try {
    const upstream = await fetch(
      `${INTERNAL_API_URL}/api/public/landing/${encodeURIComponent(siteSlug)}/lead`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Forward cf-connecting-ip (unspoofable at the edge) + XFF for the
          // Hono rate limiter — the API prefers cf-connecting-ip.
          ...clientIpForwardHeaders(request),
          ...(userAgent ? { "user-agent": userAgent } : {}),
        },
        body: JSON.stringify(body),
      }
    );

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", code: "UPSTREAM_ERROR" },
      { status: 502 }
    );
  }
}
