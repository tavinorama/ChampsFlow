/**
 * reddit-signal.ts — Ozvor · C5 Reddit deep-dive
 *
 * Reddit is the #1 most-cited domain across ChatGPT / Gemini / Perplexity
 * (2025 Semrush studies). offsite-signal.ts already records a binary
 * present/absent for Reddit; this module goes DEEPER on the single highest-
 * value source: how many threads mention the brand, which subreddits, and how
 * the brand is portrayed (sentiment over the public result snippets).
 *
 * COMPLIANCE:
 *  - GEO-A2: only the client's OWN brand name is ever queried — never a
 *    competitor's.
 *  - Live path uses a SERP API over PUBLIC Reddit results (aggregate counts +
 *    public snippets) — NOT the Reddit Data API. Activating direct Reddit Data
 *    API access requires a Reddit commercial data licence AND the GEO-A1 FTC
 *    disclosure (regulatory-map.md) — gated, not enabled here.
 *  - Stores only counts, subreddit names, and derived sentiment — no usernames,
 *    no comment bodies, no PII.
 *
 * Mock path (no SERP_API_KEY): deterministic per-brand data so the feature is
 * visible without keys. Never throws — always returns a result.
 *
 * Output feeds the BRAND vector (alongside off-site + on-site E-E-A-T) and is
 * rendered as evidence under the Brand breakdown.
 */

import { analyzeSentiment } from "./sentiment";

const TIMEOUT_MS = 12_000;
const REDDIT_DOMAIN = "reddit.com";

export interface RedditSignalResult {
  /** true if measured via a live SERP API, false if mock fallback. */
  live: boolean;
  /** 0–1 Reddit presence+perception score (feeds BRAND vector). */
  redditScore: number;
  /** Approx number of public Reddit threads mentioning the brand. */
  threadCount: number;
  /** Distinct subreddits the brand appears in (names only, no PII). */
  subreddits: string[];
  /** Sentiment of the brand across Reddit result snippets. */
  sentiment: { positive: number; neutral: number; negative: number; score: number };
  findings: string[];
}

interface SerpSnippet {
  url: string;
  title: string;
  snippet: string;
}

/** Extract a subreddit name (e.g. "r/smallbusiness") from a Reddit URL. */
export function subredditFromUrl(url: string): string | null {
  const m = url.match(/reddit\.com\/(r\/[A-Za-z0-9_]+)/i);
  return m && m[1] ? m[1].toLowerCase() : null;
}

async function serpReddit(query: string, apiKey: string): Promise<SerpSnippet[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Basic ${apiKey}` },
      body: JSON.stringify([{ keyword: query, language_code: "en", location_code: 2840, depth: 30 }]),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      tasks?: Array<{ result?: Array<{ items?: Array<{ url?: string; title?: string; description?: string }> }> }>;
    };
    const items = data.tasks?.[0]?.result?.[0]?.items ?? [];
    return items
      .filter((it) => (it.url ?? "").includes(REDDIT_DOMAIN))
      .map((it) => ({ url: it.url ?? "", title: it.title ?? "", snippet: it.description ?? "" }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const MOCK_SUBREDDITS = ["r/smallbusiness", "r/entrepreneur", "r/marketing", "r/saas", "r/startups", "r/webdev"];
const MOCK_POS = "Honestly {b} has been reliable and the support is great — would recommend.";
const MOCK_NEU = "Anyone using {b}? Looking at options for my team, comparing a few.";
const MOCK_NEG = "{b} felt a bit expensive and the setup was confusing for us.";

function mockSnippets(brand: string): SerpSnippet[] {
  let h = 0;
  const str = brand.toLowerCase();
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const n = (h % 5) + 2; // 2–6 threads
  const out: SerpSnippet[] = [];
  for (let i = 0; i < n; i++) {
    const sub = MOCK_SUBREDDITS[(h + i) % MOCK_SUBREDDITS.length];
    const pick = (h + i) % 3;
    const tmpl = pick === 0 ? MOCK_POS : pick === 1 ? MOCK_NEU : MOCK_NEG;
    out.push({
      url: `https://www.${REDDIT_DOMAIN}/${sub}/comments/${(h + i).toString(36)}/thread/`,
      title: `${brand} — discussion`,
      snippet: tmpl.replace(/\{b\}/g, brand),
    });
  }
  return out;
}

/**
 * Analyze a brand's Reddit footprint. Live when SERP_API_KEY is set, else mock.
 * GEO-A2: queries only the client's own brand.
 */
export async function analyzeRedditPresence(brandName: string): Promise<RedditSignalResult> {
  const apiKey = process.env["SERP_API_KEY"];
  const findings: string[] = [];
  let live = false;
  let snippets: SerpSnippet[];

  if (apiKey) {
    const r = await serpReddit(`site:${REDDIT_DOMAIN} "${brandName}"`, apiKey);
    if (r) {
      live = true;
      snippets = r;
    } else {
      snippets = mockSnippets(brandName);
      findings.push("Reddit SERP call failed — showing demo data.");
    }
  } else {
    snippets = mockSnippets(brandName);
    findings.push("Reddit deep-dive is using demo data — connect a SERP API key for live measurement.");
  }

  const threadCount = snippets.length;
  const subreddits = Array.from(
    new Set(snippets.map((s) => subredditFromUrl(s.url)).filter((x): x is string => !!x))
  );

  // Sentiment over the public snippets (reuse the AI-vector classifier).
  const sent = analyzeSentiment(
    snippets.map((s) => ({ text: `${s.title}. ${s.snippet}`, mentioned: true })),
    brandName
  );
  const sentiment = {
    positive: sent.positive,
    neutral: sent.neutral,
    negative: sent.negative,
    score: sent.sentimentScore,
  };

  // redditScore: presence (threads + subreddit diversity) blended with perception.
  // Presence saturates: ~5 threads or ~3 subreddits ≈ strong presence.
  const presence = Math.min(1, threadCount / 5) * 0.6 + Math.min(1, subreddits.length / 3) * 0.4;
  const redditScore = threadCount === 0 ? 0 : presence * 0.7 + sentiment.score * 0.3;

  if (threadCount === 0) {
    findings.push("Not found on Reddit — the single highest-value AI-citation source. A high-priority gap.");
  } else {
    findings.push(`Found in ${threadCount} Reddit thread${threadCount === 1 ? "" : "s"} across ${subreddits.length} subreddit${subreddits.length === 1 ? "" : "s"}${subreddits.length ? `: ${subreddits.join(", ")}` : ""}.`);
    if (sentiment.negative > sentiment.positive) {
      findings.push("⚠ Reddit sentiment skews negative — AI engines weigh Reddit heavily, so this can suppress citations.");
    } else if (sentiment.positive > 0) {
      findings.push("Reddit sentiment is net positive — a strong AI-citation signal.");
    }
  }

  return { live, redditScore, threadCount, subreddits, sentiment, findings };
}
