/**
 * cookieConsent.ts — Ozvor consent storage + gating utilities
 *
 * JURISDICTION HEURISTIC
 * ─────────────────────────────────────────────────────────────────────────
 * Server-side IP geolocation is NOT available here (client-only helper).
 * We derive jurisdiction from two browser APIs that don't require any
 * network request or permissions:
 *
 *   1. Intl.DateTimeFormat().resolvedOptions().timeZone
 *      • Starts with "Europe/" → EU/EEA (opt-in)
 *      • "America/Sao_Paulo", "America/Fortaleza", etc. → Brazil (opt-in via LGPD)
 *        Detected with: zone starts with "America/" and Intl locale suggests pt-BR.
 *      • "America/" + English locale → US (opt-out / CCPA)
 *      • All other zones → UNKNOWN (default to stricter opt-in per GDPR Art. 25)
 *
 *   2. navigator.language (fallback signal)
 *      • "pt-BR" → Brazil (opt-in)
 *      • Zones not covered above fall back to opt-in (safest default)
 *
 * KNOWN LIMITATIONS
 *   - A VPN user will see the wrong regime. This is acceptable for a heuristic;
 *     opt-in is always the default for unknowns.
 *   - A US user with a pt-BR browser would get opt-in treatment (conservative).
 *   - Explicit "do-not-sell" always stays available regardless of jurisdiction.
 *
 * CONSENT STORAGE SHAPE
 * ─────────────────────────────────────────────────────────────────────────
 * Stored in BOTH:
 *   • localStorage key: "ti_cookie_consent"
 *   • First-party cookie (SameSite=Strict; path=/): "ti_cookie_consent"
 *
 * Shape (JSON):
 * {
 *   version:      string,     // policy version — bump to re-prompt on change
 *   timestamp:    string,     // ISO 8601 when consent was recorded
 *   jurisdiction: "opt-in" | "opt-out" | "unknown",
 *   essential:    true,       // always true — cannot be denied
 *   analytics:    boolean,
 *   marketing:    boolean,
 * }
 *
 * CONSENT GATING
 * ─────────────────────────────────────────────────────────────────────────
 * Call hasConsent('analytics') before loading any analytics script.
 * Call hasConsent('marketing') before loading any marketing/ad pixel.
 *
 * Example (DO NOT add actual analytics until scripts are ready):
 *
 *   // In a Client Component or useEffect:
 *   import { hasConsent } from '@/lib/cookieConsent';
 *
 *   if (hasConsent('analytics')) {
 *     // TODO: import and initialise your analytics SDK here
 *     // e.g. initPostHog(POSTHOG_KEY);
 *   }
 *
 *   if (hasConsent('marketing')) {
 *     // TODO: load Meta Pixel / LinkedIn Insight Tag / etc. here
 *   }
 *
 * POLICY VERSION
 * ─────────────────────────────────────────────────────────────────────────
 * Bump CONSENT_VERSION when the cookie policy changes materially (e.g., a
 * new analytics tool is introduced). The banner will re-prompt any user
 * whose stored version doesn't match this constant.
 */

/** Bump this string when the cookie policy changes materially. */
export const CONSENT_VERSION = "2026-06-25-v1";

/** Cookie name + localStorage key used for the consent record. */
export const CONSENT_STORAGE_KEY = "ti_cookie_consent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConsentCategory = "analytics" | "marketing";

export type JurisdictionRegime = "opt-in" | "opt-out" | "unknown";

export interface ConsentRecord {
  version: string;
  timestamp: string;
  jurisdiction: JurisdictionRegime;
  /** Always true — essential cookies are never gated by consent. */
  essential: true;
  analytics: boolean;
  marketing: boolean;
}

// ---------------------------------------------------------------------------
// Jurisdiction detection
// ---------------------------------------------------------------------------

/**
 * EU/EEA timezone prefixes.  "Europe/" covers all EU + CH + NO + IS + LI + GB.
 */
const EU_TZ_PREFIX = "Europe/";

/**
 * Brazilian IANA timezones (America/* zone + pt-BR language).
 * We check the zone + language together to avoid false-positives for US/Eastern.
 */
const BRAZIL_TZ_ZONES = new Set([
  "America/Sao_Paulo",
  "America/Noronha",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Araguaina",
  "America/Maceio",
  "America/Bahia",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Manaus",
  "America/Eirunepe",
  "America/Rio_Branco",
]);

/**
 * US IANA timezone prefixes and common zones.
 * Any "America/*" zone that isn't Brazil/Canada/Caribbean and whose
 * navigator.language starts with "en" is treated as US opt-out.
 */
function isUsTz(tz: string, lang: string): boolean {
  if (!tz.startsWith("America/")) return false;
  // Brazil covered separately
  if (BRAZIL_TZ_ZONES.has(tz)) return false;
  // Canada/Caribbean often use "en" too — be conservative and treat as opt-in
  // unless the timezone is an unambiguous US zone.
  const US_SPECIFIC_ZONES = new Set([
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "America/Anchorage",
    "America/Adak",
    "America/Indiana/Indianapolis",
    "America/Indiana/Knox",
    "America/Indiana/Marengo",
    "America/Indiana/Petersburg",
    "America/Indiana/Tell_City",
    "America/Indiana/Vevay",
    "America/Indiana/Vincennes",
    "America/Indiana/Winamac",
    "America/Kentucky/Louisville",
    "America/Kentucky/Monticello",
    "America/North_Dakota/Beulah",
    "America/North_Dakota/Center",
    "America/North_Dakota/New_Salem",
    "America/Detroit",
    "America/Menominee",
    "America/Boise",
    "America/Sitka",
    "America/Juneau",
    "America/Yakutat",
    "America/Nome",
    "America/Metlakatla",
    "Pacific/Honolulu",
  ]);
  if (US_SPECIFIC_ZONES.has(tz)) return true;
  // Remaining America/* with English language → US (best-effort)
  if (lang.startsWith("en") && !lang.startsWith("en-CA")) return true;
  return false;
}

/**
 * Detect the user's jurisdiction regime from browser APIs only.
 * Never makes a network request.
 * When uncertain, returns "opt-in" (strictest — GDPR Art. 25 by design).
 */
export function detectJurisdiction(): JurisdictionRegime {
  try {
    const tz =
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const lang = (
      (typeof navigator !== "undefined" && navigator.language) ||
      "en"
    ).toLowerCase();

    if (tz.startsWith(EU_TZ_PREFIX)) return "opt-in";
    if (BRAZIL_TZ_ZONES.has(tz)) return "opt-in";
    if (lang === "pt-br") return "opt-in"; // language-only fallback for BR
    if (isUsTz(tz, lang)) return "opt-out";

    // Unknown/ambiguous → stricter opt-in (GDPR-safe default)
    return "opt-in";
  } catch {
    return "opt-in"; // safe fallback if Intl throws
  }
}

// ---------------------------------------------------------------------------
// Storage read/write
// ---------------------------------------------------------------------------

/** Read the stored consent record. Returns null if none exists yet. */
export function readConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsentRecord;
  } catch {
    return null;
  }
}

/**
 * Write the consent record to both localStorage and a first-party cookie.
 * The cookie is SameSite=Strict so it is readable server-side (future use).
 * Max-age: 13 months (GDPR annex recommendation for consent expiry).
 */
export function writeConsent(record: ConsentRecord): void {
  if (typeof window === "undefined") return;
  const json = JSON.stringify(record);
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, json);
  } catch {
    // localStorage may be blocked in private mode — continue to cookie
  }
  try {
    const maxAge = 13 * 30 * 24 * 60 * 60; // ~13 months in seconds
    document.cookie = [
      `${CONSENT_STORAGE_KEY}=${encodeURIComponent(json)}`,
      `path=/`,
      `max-age=${maxAge}`,
      `SameSite=Strict`,
      // Secure flag is handled by the server at response layer (middleware);
      // we don't add it here because localhost dev doesn't serve HTTPS.
    ].join("; ");
  } catch {
    // Best-effort — localStorage is the primary store
  }
}

/** Remove the stored consent from both stores (e.g. for testing or re-prompting). */
export function clearConsent(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    document.cookie = `${CONSENT_STORAGE_KEY}=; path=/; max-age=0; SameSite=Strict`;
  } catch {
    // ignore
  }
}

/**
 * Check whether the user has consented to a given non-essential cookie category.
 *
 * Always returns false if:
 *   - No consent has been recorded yet (banner not yet shown / dismissed)
 *   - The stored consent version is older than CONSENT_VERSION
 *
 * Usage:
 *   if (hasConsent('analytics')) { initAnalytics(); }
 *   if (hasConsent('marketing')) { loadMarketingPixel(); }
 */
export function hasConsent(category: ConsentCategory): boolean {
  const record = readConsent();
  if (!record) return false;
  if (record.version !== CONSENT_VERSION) return false;
  return record[category] === true;
}

/**
 * True if the user has already seen and interacted with the banner for
 * the current policy version (even if they rejected all optional cookies).
 */
export function hasRecordedConsent(): boolean {
  const record = readConsent();
  return record !== null && record.version === CONSENT_VERSION;
}

/**
 * Build a default opt-in consent record (all non-essential = false).
 * Used for "Reject non-essential" flows.
 */
export function buildRejectRecord(
  jurisdiction: JurisdictionRegime
): ConsentRecord {
  return {
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
    jurisdiction,
    essential: true,
    analytics: false,
    marketing: false,
  };
}

/**
 * Build an "Accept all" consent record.
 */
export function buildAcceptAllRecord(
  jurisdiction: JurisdictionRegime
): ConsentRecord {
  return {
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
    jurisdiction,
    essential: true,
    analytics: true,
    marketing: true,
  };
}

/**
 * Build a custom consent record from granular toggle state.
 */
export function buildCustomRecord(
  jurisdiction: JurisdictionRegime,
  analytics: boolean,
  marketing: boolean
): ConsentRecord {
  return {
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
    jurisdiction,
    essential: true,
    analytics,
    marketing,
  };
}
