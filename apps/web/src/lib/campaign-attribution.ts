/**
 * campaign-attribution.ts — read ?from= + utm_* off the landing URL and keep
 * it for the whole browsing session, so the funnel POSTs (/api/test,
 * /api/ai-audit/checkout) can carry the campaign origin. Cold-outreach links
 * look like:
 *
 *   ozvor.com/test?from=cold-atlanta-01
 *   ozvor.com/ai-audit?utm_source=email&utm_campaign=cold-atlanta-01
 *
 * Real leads do not buy on the pageview they landed on: they click the link,
 * wander through /, /kit, /how-it-works, and only later reload /ai-audit with
 * a clean URL and buy. Reading only window.location on that final mount loses
 * the origin (proven in the 2026-08-27 fire test — the ?from= landing was
 * three pageviews before the checkout POST). So the first pageview that
 * carries attribution params persists them in sessionStorage, and later
 * pageviews fall back to the stored value. sessionStorage (not localStorage)
 * on purpose: it dies with the tab, which keeps this a same-visit memory
 * rather than a tracking cookie. A newer link click with params overwrites
 * the stored origin (the most recent campaign touch wins).
 *
 * The API re-sanitizes with the same rules
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
const STORAGE_KEY = "ozvor_attribution";

/** Pure URL read — params off the current location, or null when none. */
function readFromUrl(): Record<string, string> | null {
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

function readFromStorage(): Record<string, string> | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    // Re-apply the same allowlist + limits — storage is user-writable.
    const out: Record<string, string> = {};
    for (const key of ATTRIBUTION_PARAMS) {
      const val = (parsed as Record<string, unknown>)[key];
      if (typeof val !== "string") continue;
      const clean = val.trim().slice(0, MAX_LEN);
      if (clean) out[key] = clean;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

function persist(attribution: Record<string, string>): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Private mode / blocked storage — the URL value still returns below.
  }
}

/**
 * Campaign origin for the current visit: URL params when present (persisted
 * for later pageviews), else the origin stored earlier in this tab session.
 * Call on mount from any page that sends funnel POSTs — and from the
 * marketing layout's AttributionCapture, so a landing on ANY page stores it.
 */
export function readAttributionFromLocation(): Record<string, string> | null {
  if (typeof window === "undefined") return null;
  const fromUrl = readFromUrl();
  if (fromUrl) {
    persist(fromUrl);
    return fromUrl;
  }
  return readFromStorage();
}
