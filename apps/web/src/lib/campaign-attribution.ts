/**
 * campaign-attribution.ts — read ?from= + utm_* off the landing URL, once,
 * on mount, so the funnel POSTs (/api/test, /api/ai-audit/checkout) can carry
 * the campaign origin. Cold-outreach links look like:
 *
 *   ozvor.com/test?from=cold-atlanta-01
 *   ozvor.com/ai-audit?utm_source=email&utm_campaign=cold-atlanta-01
 *
 * Mirrors the /book pattern (BookIntakeForm reads window.location.search in a
 * mount effect — no useSearchParams, so no Suspense boundary needed). Callers
 * capture the result in state/ref on mount, so the origin survives the page's
 * internal state-machine navigation. The API re-sanitizes with the same rules
 * (apps/api/src/lib/campaign-attribution.ts is the authority).
 */

export const ATTRIBUTION_PARAMS = [
  "from",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

const MAX_LEN = 100;

/** Compact origin object from the current URL, or null when none present. */
export function readAttributionFromLocation(): Record<string, string> | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    for (const key of ATTRIBUTION_PARAMS) {
      const raw = params.get(key);
      if (!raw) continue;
      const clean = raw.trim().slice(0, MAX_LEN);
      if (clean) out[key] = clean;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}
