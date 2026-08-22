/**
 * campaign-attribution.ts — sanitizer for the tiny `attribution` object the
 * public funnel pages (/test, /ai-audit) send with their POST bodies.
 *
 * Cold outreach starts with links like ozvor.com/test?from=cold-atlanta-01.
 * The client captures ?from= + the five utm_* params on mount and forwards
 * them; this module is the ONLY gate between that untrusted body field and a
 * jsonb column. Contract:
 *
 *   - only the six known keys survive (anything else is dropped)
 *   - values must be strings; trimmed; truncated to 100 chars
 *   - empty result → null (callers write nothing, behavior identical to today)
 *
 * No migration: the object rides inside jsonb columns that already exist
 * (lead_capture.result / ai_audit_order.answers). Values are campaign labels
 * chosen by us, but they arrive from the URL, so they are never logged —
 * loggers may record key NAMES / counts only (PII-free log rule).
 */

export const ATTRIBUTION_KEYS = [
  "from",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

/** Max stored length per value — campaign labels, not essays. */
export const ATTRIBUTION_MAX_LEN = 100;

/**
 * Shape + sanitize an untrusted `attribution` body field.
 * Returns null when nothing usable survives (caller then writes nothing).
 */
export function parseAttribution(
  value: unknown
): Partial<Record<AttributionKey, string>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const src = value as Record<string, unknown>;
  const out: Partial<Record<AttributionKey, string>> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const raw = src[key];
    if (typeof raw !== "string") continue;
    const clean = raw.trim().slice(0, ATTRIBUTION_MAX_LEN);
    if (clean) out[key] = clean;
  }
  return Object.keys(out).length > 0 ? out : null;
}
