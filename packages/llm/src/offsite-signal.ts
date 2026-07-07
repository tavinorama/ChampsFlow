/**
 * offsite-signal.ts — Ozvor
 *
 * Measures a brand's presence on the high-authority sources AI engines cite
 * MOST often (frequently more than the brand's own site): Reddit, Wikipedia,
 * G2, Trustpilot, Crunchbase, LinkedIn, YouTube, and industry directories.
 *
 * This is a major GEO lever. The 2025 Semrush studies found Reddit is the #1
 * cited domain across ChatGPT/Gemini/Perplexity and LinkedIn #2; if a brand is
 * absent from these, it is structurally hard to be cited by AI.
 *
 * Live path: a SERP API (DataForSEO/SerpAPI) runs `site:<source> "<brand>"`
 * queries and counts results per source. Mock path (no SERP_API_KEY): a
 * deterministic per-brand presence map so the feature is visible without keys.
 *
 * Output feeds the BRAND vector (off-site authority) and is shown as evidence.
 * Stores only source names + presence/count — no PII, no scraped content.
 */

import { guardedFetch } from "./ssrf-guard";

const TIMEOUT_MS = 12_000;
const PROFILE_REACH_TIMEOUT_MS = 5_000;

/** The authoritative citation sources we check, with a weight reflecting how
 *  heavily AI engines cite each (Reddit/Wikipedia highest per 2025 studies). */
export const OFFSITE_SOURCES: Array<{ id: string; label: string; domain: string; weight: number }> = [
  { id: "reddit", label: "Reddit", domain: "reddit.com", weight: 0.22 },
  { id: "wikipedia", label: "Wikipedia", domain: "en.wikipedia.org", weight: 0.20 },
  { id: "linkedin", label: "LinkedIn", domain: "linkedin.com", weight: 0.15 },
  { id: "g2", label: "G2", domain: "g2.com", weight: 0.13 },
  { id: "trustpilot", label: "Trustpilot", domain: "trustpilot.com", weight: 0.10 },
  { id: "crunchbase", label: "Crunchbase", domain: "crunchbase.com", weight: 0.10 },
  { id: "youtube", label: "YouTube", domain: "youtube.com", weight: 0.10 },
];

export interface OffsitePresence {
  id: string;
  label: string;
  domain: string;
  present: boolean;
  /** Approx result count from the SERP (or mock). */
  count: number;
  /** True when a provided profile URL was used and confirmed reachable (live) or trusted (mock). */
  verified?: boolean;
  /** The profile URL supplied by the brand owner (if any). */
  providedUrl?: string;
}

export interface OffsiteSignalResult {
  /** true if measured via a live SERP API, false if mock fallback. */
  live: boolean;
  /** 0–1 weighted authority score across all sources (feeds BRAND vector). */
  offsiteScore: number;
  sources: OffsitePresence[];
  findings: string[];
}

function mockPresence(brand: string): OffsitePresence[] {
  // Deterministic per-brand: hash the brand+source so results are stable.
  return OFFSITE_SOURCES.map((s) => {
    let h = 0;
    const str = `${brand.toLowerCase()}|${s.id}`;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    const present = h % 3 !== 0; // ~66% present
    return { id: s.id, label: s.label, domain: s.domain, present, count: present ? (h % 40) + 1 : 0 };
  });
}

async function serpCount(query: string, apiKey: string): Promise<number | null> {
  // DataForSEO-style: POST a SERP task. Implementations vary; we keep this a
  // thin, replaceable call. Returns result count or null on failure.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${apiKey}`, // DataForSEO uses base64(login:password)
      },
      body: JSON.stringify([{ keyword: query, language_code: "en", location_code: 2840, depth: 10 }]),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tasks?: Array<{ result?: Array<{ items_count?: number; se_results_count?: number }> }>;
    };
    const r = data.tasks?.[0]?.result?.[0];
    return r?.se_results_count ?? r?.items_count ?? 0;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Measure off-site presence for a brand. Uses live SERP when SERP_API_KEY is
 * set, else a deterministic mock. Never throws — returns a result either way.
 *
 * @param brandName   The brand name to look up.
 * @param profileUrls Optional map from source id to a brand-provided profile URL
 *                    (e.g. `{ "linkedin": "https://linkedin.com/company/acme" }`).
 *                    When provided, the SERP lookup for that source is skipped in
 *                    live mode and the URL is confirmed with a lightweight HEAD
 *                    fetch instead. In mock mode the provided URL is treated as
 *                    present without a network call.
 */
export async function measureOffsiteSignal(
  brandName: string,
  profileUrls?: Partial<Record<string, string>>
): Promise<OffsiteSignalResult> {
  const apiKey = process.env["SERP_API_KEY"];
  const findings: string[] = [];

  let presence: OffsitePresence[];
  let live = false;

  if (apiKey) {
    live = true;
    const results = await Promise.all(
      OFFSITE_SOURCES.map(async (s): Promise<OffsitePresence> => {
        const providedUrl = profileUrls?.[s.id];

        if (providedUrl) {
          // Brand supplied a profile URL — skip SERP, verify reachability via HEAD.
          let reachable = false;
          try {
            const res = await guardedFetch(providedUrl, { timeoutMs: PROFILE_REACH_TIMEOUT_MS });
            // 2xx or 3xx-terminal (guardedFetch follows redirects manually and
            // returns the final non-redirect response, so status < 400 = success).
            reachable = res.status < 400;
          } catch {
            // Network error, SSRF block, or timeout → treat as absent.
            reachable = false;
          }

          if (reachable) {
            findings.push(`${s.label}: verified via provided profile URL.`);
            return { id: s.id, label: s.label, domain: s.domain, present: true, count: 1, verified: true, providedUrl };
          } else {
            findings.push(`${s.label}: provided profile URL did not resolve — counted as absent.`);
            return { id: s.id, label: s.label, domain: s.domain, present: false, count: 0, verified: false, providedUrl };
          }
        }

        // No provided URL — use normal SERP lookup.
        const count = await serpCount(`site:${s.domain} "${brandName}"`, apiKey);
        // null = SERP call failed for this source; treat as unknown→absent but note it.
        const c = count ?? 0;
        return { id: s.id, label: s.label, domain: s.domain, present: c > 0, count: c };
      })
    );
    presence = results;
  } else {
    // Mock mode — deterministic hash-based results.
    const mock = mockPresence(brandName);
    presence = mock.map((p) => {
      const providedUrl = profileUrls?.[p.id];
      if (providedUrl) {
        // In mock mode, treat any provided URL as present (no real network call).
        // Add a demo-mode note so consumers know this is not a live confirmation.
        return { ...p, present: true, count: p.count > 0 ? p.count : 1, verified: true, providedUrl };
      }
      return p;
    });
    findings.push("Off-site signal is using demo data — connect a SERP API key for live measurement.");

    // Note any provided URLs used in demo mode so the caller knows.
    for (const s of OFFSITE_SOURCES) {
      if (profileUrls?.[s.id]) {
        findings.push(`${s.label}: profile URL recorded (demo mode — not verified against a live endpoint).`);
      }
    }
  }

  // Weighted authority score across sources.
  const totalWeight = OFFSITE_SOURCES.reduce((a, s) => a + s.weight, 0);
  let scored = 0;
  for (const p of presence) {
    const src = OFFSITE_SOURCES.find((s) => s.id === p.id);
    if (src && p.present) scored += src.weight;
  }
  const offsiteScore = totalWeight > 0 ? scored / totalWeight : 0;

  const present = presence.filter((p) => p.present).map((p) => p.label);
  const absent = presence.filter((p) => !p.present).map((p) => p.label);
  if (present.length) findings.push(`Found on: ${present.join(", ")}.`);
  if (absent.length) findings.push(`Missing from: ${absent.join(", ")} — high-value gaps (AI engines cite these heavily).`);

  return { live, offsiteScore, sources: presence, findings };
}
