/**
 * GET /api/version — deployed-version probe for the post-deploy smoke (10.B.3).
 *
 * Returns the git SHA the running web container was built from (Railway
 * injects RAILWAY_GIT_COMMIT_SHA). The smoke workflow asserts this equals the
 * pushed commit — the only externally observable proof that "merge → deploy"
 * actually swapped the image, catching the failure mode where a deploy fails
 * and the OLD build keeps serving behind a green healthcheck.
 *
 * Registered as a local App Router handler so it wins over the /api/:path*
 * rewrite to the Hono API (local handlers take precedence — next.config.js).
 * No secrets: a public commit SHA of a public deploy is not sensitive.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      service: "web",
      sha: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
