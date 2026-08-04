/**
 * POST /api/internal/revalidate — on-demand purge of the public Ozvor Pages cache.
 *
 * WHY THIS EXISTS (measured incident, 2026-08-04):
 * A landing site was deleted from the database. The public API correctly
 * returned 404 immediately, and the page component correctly calls notFound()
 * on a miss. The public page nevertheless kept serving HTTP 200 with the full
 * cached HTML for more than fifteen minutes, across several `revalidate = 300`
 * windows and dozens of requests. It only went dark at the exact second a
 * deploy replaced the running instance.
 *
 * The lesson: `export const revalidate` is a freshness hint, not a delete. When
 * a re-render resolves to notFound(), Next keeps serving the previously cached
 * entry. Nothing in this repo ever called revalidatePath, so the only reliable
 * purge was a deploy.
 *
 * That is not acceptable for this surface. A customer who unpublishes or
 * deletes their site must see it leave the internet in seconds, not whenever
 * we happen to ship. It is also a data-deletion obligation (LGPD/GDPR right to
 * erasure): content removed from the database must not stay publicly readable.
 *
 * DESIGN
 * revalidatePath() only exists inside Next, and the mutations live in the Hono
 * API, so the API calls this route. Shared-secret auth with a timing-safe
 * compare; no tenant data crosses the wire, only paths.
 *
 * FAILS CLOSED ON AUTH, OPEN ON EVERYTHING ELSE: a bad secret is rejected, but
 * the caller treats any failure here as non-fatal. A cache purge must never be
 * the reason a customer's delete or unpublish fails.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

/** Only these prefixes may be purged. Keeps the endpoint from becoming a
 *  site-wide cache-buster if the secret ever leaks. */
const ALLOWED_PREFIXES = ["/l/"];

/** Bound the batch: one site is 1 home + 4 pages, so 16 is already generous. */
const MAX_PATHS = 16;

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which itself leaks length, so
  // compare lengths first and keep the comparison constant-time after that.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<NextResponse> {
  const expected = process.env["REVALIDATE_SECRET"];
  if (!expected) {
    // Not configured yet: say so plainly instead of pretending to purge.
    return NextResponse.json(
      { ok: false, error: "revalidate_not_configured" },
      { status: 503 }
    );
  }

  const provided = req.headers.get("x-revalidate-secret") ?? "";
  if (!provided || !secretMatches(provided, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { paths?: unknown };
  try {
    body = (await req.json()) as { paths?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const raw = Array.isArray(body.paths) ? body.paths : [];
  const paths = raw
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim())
    .filter((p) => p.startsWith("/") && !p.includes("..") && ALLOWED_PREFIXES.some((pre) => p.startsWith(pre)))
    .slice(0, MAX_PATHS);

  if (paths.length === 0) {
    return NextResponse.json({ ok: false, error: "no_valid_paths" }, { status: 400 });
  }

  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ ok: true, revalidated: paths.length, paths });
}
