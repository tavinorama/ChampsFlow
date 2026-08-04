/**
 * landing-revalidate — purge the public Ozvor Pages cache after a mutation.
 *
 * THE INCIDENT THIS ANSWERS (measured in production, 2026-08-04)
 * A landing site was deleted. The database was empty, and GET
 * /api/public/landing/:slug correctly returned 404 straight away. The public
 * page at /l/:slug kept serving HTTP 200 with the full cached HTML for over
 * fifteen minutes, through several `revalidate = 300` windows and dozens of
 * requests. It went dark at the exact second a deploy replaced the instance.
 *
 * So `revalidate` is a freshness hint, not a delete: when the re-render
 * resolves to notFound(), Next keeps serving the entry it already had. Until
 * this file, nothing in the repo ever purged a path, which left "wait for the
 * next deploy" as the only way to take a page down.
 *
 * That fails a customer who unpublishes (their page stays up), and it fails a
 * deletion request (content removed from the database stays publicly
 * readable). Both are fixed by telling the web app to drop the path.
 *
 * FAIL OPEN, ALWAYS
 * Every function here swallows its own errors and returns void. A cache purge
 * must never be the reason a delete, unpublish, or regenerate fails: the
 * database change is the source of truth, and this is best-effort propagation.
 * When it cannot run (env not set, web unreachable) it logs and moves on, so
 * the degradation is visible in logs rather than silent.
 */
import { logger } from "../../../../packages/shared/src/logger";

/** Web origin to call. Railway internal URL in prod, localhost in dev. */
function webUrl(): string | null {
  const raw = process.env["WEB_INTERNAL_URL"] ?? process.env["NEXT_PUBLIC_SITE_URL"];
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function secret(): string | null {
  return process.env["REVALIDATE_SECRET"] ?? null;
}

/** True when both halves of the bridge are configured. */
export function revalidateConfigured(): boolean {
  return Boolean(webUrl() && secret());
}

/**
 * Every public path a site occupies: the home page plus one path per child
 * page. Purging the home alone would leave /l/slug/faq live after a delete.
 */
export function sitePaths(siteSlug: string, pageSlugs: readonly string[] = []): string[] {
  const base = `/l/${siteSlug}`;
  const children = pageSlugs
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .map((s) => `${base}/${s.trim()}`);
  return [base, ...children];
}

/**
 * Ask the web app to drop these paths from its cache. Never throws.
 *
 * Deliberately not awaited by callers on the happy path: the customer's
 * response should not wait on a cache purge. Callers use `void`.
 */
export async function revalidateLandingPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  const base = webUrl();
  const key = secret();
  if (!base || !key) {
    // Not a crash, but not silent either: without this, a delete leaves the
    // page live until the next deploy, and nobody would know why.
    logger.warn("landing_revalidate_not_configured", {
      paths: paths.length,
      missing: !base ? "WEB_INTERNAL_URL" : "REVALIDATE_SECRET",
      effect: "public pages stay cached until the next deploy",
    });
    return;
  }

  try {
    const res = await fetch(`${base}/api/internal/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-revalidate-secret": key },
      body: JSON.stringify({ paths }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn("landing_revalidate_failed", { status: res.status, paths: paths.length });
      return;
    }
    logger.info("landing_revalidated", { paths: paths.length });
  } catch (err: unknown) {
    logger.warn("landing_revalidate_error", {
      message: (err as Error).message?.slice(0, 160),
      paths: paths.length,
    });
  }
}

/** Convenience: purge a whole site (home + children) without awaiting. */
export function revalidateSite(siteSlug: string, pageSlugs: readonly string[] = []): void {
  void revalidateLandingPaths(sitePaths(siteSlug, pageSlugs));
}
