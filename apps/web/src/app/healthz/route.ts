/**
 * Next.js App Router route — GET /healthz  (public production smoke probe)
 *
 * Gives operators a single public health URL on the primary domain:
 * `https://ozvor.com/healthz`. The GO-LIVE runbook (Phase 7) and the deploy
 * runbooks document exactly this command, but /healthz lives at the API service
 * ROOT (`apps/api/src/index.ts`), OUTSIDE the `/api/:path*` rewrite in
 * next.config.js — so before this handler `ozvor.com/healthz` 404'd while
 * `ozvor.com/api/system/capabilities` worked (issue #145).
 *
 * This proxies to the API's own /healthz (which checks Postgres + Redis) and
 * adds the "web can reach API" hop, so a 200 here means the whole public stack
 * — web → API → Postgres/Redis — is reachable end to end.
 *
 * Why a route handler and not a next.config rewrite: a handler is unit-testable
 * (see tests/unit/healthz-web-route.test.ts) and lets us FAIL CLOSED (503) on a
 * short timeout instead of hanging on a stuck upstream.
 *
 * Hard rules:
 *  - No console.log; no secrets in the response (only status + component checks).
 *  - Fail closed: any upstream error/timeout → 503 (never a false 200).
 *  - Never cached: always reflect current health.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ?? "http://localhost:3001";

const UPSTREAM_TIMEOUT_MS = 4000;

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET(): Promise<NextResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${INTERNAL_API_URL}/healthz`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    const data = (await upstream.json().catch(() => ({}))) as {
      status?: string;
      checks?: Record<string, string>;
    };

    const ok = upstream.ok && data.status === "ok";
    return NextResponse.json(
      {
        status: ok ? "ok" : "degraded",
        web: "ok",
        api: data.status ?? "error",
        checks: data.checks ?? {},
      },
      { status: ok ? 200 : 503, headers: NO_STORE }
    );
  } catch {
    // API unreachable or timed out: the web tier is up, but the stack is not
    // healthy end to end, so report degraded rather than a misleading 200.
    return NextResponse.json(
      { status: "degraded", web: "ok", api: "unreachable", checks: {} },
      { status: 503, headers: NO_STORE }
    );
  } finally {
    clearTimeout(timeout);
  }
}
