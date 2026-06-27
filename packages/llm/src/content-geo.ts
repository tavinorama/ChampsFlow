/**
 * content-geo.ts — Ozvor
 *
 * Multi-page content citation-worthiness analysis. Beyond the homepage
 * technical scan (site-crawl.ts), this fetches several key pages (via sitemap)
 * and scores the CONTENT against the traits the Princeton/KDD 2024 GEO research
 * found drive AI citations:
 *   - statistics / numbers (cited far more often)
 *   - direct quotations
 *   - sourced / cited claims (links, "according to", references)
 *   - answer-shaped passages (clear Q&A / definitional structure, FAQ markup)
 *   - fluency & specificity (headings, lists, depth)
 *
 * Output: contentScore (0–1) that feeds the PERFORMANCE vector, plus per-trait
 * coverage and findings. No JS execution, capped pages/bytes, public pages only.
 * No PII stored — only derived trait metrics + page paths.
 */

import { guardedFetch } from "./ssrf-guard";

const TIMEOUT_MS = 8000;
const MAX_BODY = 512 * 1024;
const MAX_PAGES = 6; // homepage + up to 5 sitemap pages
const UA = "OzvorBot-Crawler/1.0 (+https://ozvor.com/bot)";

export interface ContentGeoResult {
  analyzed: boolean;
  pagesAnalyzed: number;
  contentScore: number; // 0–1, feeds PERFORMANCE
  traits: {
    statistics: number;     // 0–1 fraction of pages with statistics
    quotations: number;     // 0–1 with direct quotes
    sourcedClaims: number;  // 0–1 with citations/references
    answerShaped: number;   // 0–1 with Q&A / FAQ / definitional structure
    depth: number;          // 0–1 headings + lists + length
  };
  findings: string[];
}

function normalizeUrl(domain: string): string {
  const d = domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return `https://${d}`;
}

async function safeFetch(url: string): Promise<string | null> {
  try {
    // GEO-SEC-1/4: user-supplied domain — block private/metadata targets and
    // re-validate every redirect hop (ssrf-guard).
    const res = await guardedFetch(url, {
      timeoutMs: TIMEOUT_MS,
      headers: { "User-Agent": UA, Accept: "text/html,application/xml,text/xml,*/*" },
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, MAX_BODY);
  } catch {
    return null;
  }
}

/** Strip tags to get visible-ish text for trait detection. */
function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

/** Extract up to MAX_PAGES-1 internal page URLs from a sitemap.xml. */
function parseSitemap(xml: string, base: string): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && urls.length < MAX_PAGES - 1) {
    const u = m[1] ?? "";
    if (u.startsWith(base)) urls.push(u);
  }
  return urls;
}

function scorePage(html: string): {
  statistics: boolean; quotations: boolean; sourcedClaims: boolean; answerShaped: boolean; depth: boolean;
} {
  const text = toText(html);
  const lower = text.toLowerCase();
  // Statistics: %, numbers with units, "X%", "1,234", "$X", "Nx"
  const statistics = /\b\d+(\.\d+)?\s?(%|percent|million|billion|x|users|customers)\b/i.test(text) || /\$\d/.test(text);
  // Direct quotations: quoted sentences
  const quotations = /[""][^""]{20,}[""]|"[^"]{20,}"/.test(text);
  // Sourced claims: "according to", "study", "research", "source", inline links to refs
  const sourcedClaims = /(according to|research (shows|by)|study (found|by)|source:|cited|reference)/i.test(lower) || /<a [^>]*href=["']https?:/i.test(html);
  // Answer-shaped: FAQ schema, question headings, definitional phrasing
  const answerShaped = /"@type"\s*:\s*"?(faqpage|qapage)"?/i.test(html) || /<h[1-3][^>]*>\s*(what|how|why|when|which|is|are|can|should)\b/i.test(html) || /\?\s*<\/h[1-3]>/i.test(html);
  // Depth: multiple headings + lists + reasonable length
  const headingCount = (html.match(/<h[1-3][\s>]/gi) ?? []).length;
  const listCount = (html.match(/<(ul|ol)[\s>]/gi) ?? []).length;
  const depth = headingCount >= 3 && (listCount >= 1 || text.length > 2000);
  return { statistics, quotations, sourcedClaims, answerShaped, depth };
}

/**
 * Analyze content citation-worthiness across several pages of the brand site.
 * Returns analyzed=false (with neutral 0.5) if no domain / unreachable.
 */
export async function analyzeContentGeo(domain: string | null | undefined): Promise<ContentGeoResult> {
  const findings: string[] = [];
  if (!domain || !domain.trim()) {
    return {
      analyzed: false, pagesAnalyzed: 0, contentScore: 0.5,
      traits: { statistics: 0.5, quotations: 0.5, sourcedClaims: 0.5, answerShaped: 0.5, depth: 0.5 },
      findings: ["No domain — content citation-worthiness not analyzed (neutral baseline)."],
    };
  }

  const base = normalizeUrl(domain);
  const home = await safeFetch(base);
  if (!home) {
    return {
      analyzed: false, pagesAnalyzed: 0, contentScore: 0.5,
      traits: { statistics: 0.5, quotations: 0.5, sourcedClaims: 0.5, answerShaped: 0.5, depth: 0.5 },
      findings: [`Could not reach ${base} — content not analyzed (neutral baseline).`],
    };
  }

  // Discover extra pages via sitemap.xml (best-effort).
  const sitemap = await safeFetch(`${base}/sitemap.xml`);
  const extraUrls = sitemap ? parseSitemap(sitemap, base) : [];
  const pages = [home];
  for (const u of extraUrls) {
    const p = await safeFetch(u);
    if (p) pages.push(p);
  }

  // Score each page; trait coverage = fraction of pages exhibiting the trait.
  const tallies = { statistics: 0, quotations: 0, sourcedClaims: 0, answerShaped: 0, depth: 0 };
  for (const html of pages) {
    const s = scorePage(html);
    if (s.statistics) tallies.statistics++;
    if (s.quotations) tallies.quotations++;
    if (s.sourcedClaims) tallies.sourcedClaims++;
    if (s.answerShaped) tallies.answerShaped++;
    if (s.depth) tallies.depth++;
  }
  const n = pages.length;
  const traits = {
    statistics: tallies.statistics / n,
    quotations: tallies.quotations / n,
    sourcedClaims: tallies.sourcedClaims / n,
    answerShaped: tallies.answerShaped / n,
    depth: tallies.depth / n,
  };
  // Weighted per GEO research: stats + sourced claims matter most for citation.
  const contentScore =
    traits.statistics * 0.28 +
    traits.sourcedClaims * 0.26 +
    traits.answerShaped * 0.22 +
    traits.quotations * 0.12 +
    traits.depth * 0.12;

  findings.push(`Analyzed ${n} page${n === 1 ? "" : "s"} for citation-worthiness.`);
  const gap = (label: string, v: number) => v < 0.5 ? `Weak: ${label} (${Math.round(v * 100)}% of pages).` : null;
  for (const f of [
    gap("statistics / data points", traits.statistics),
    gap("sourced claims (citations, 'according to')", traits.sourcedClaims),
    gap("answer-shaped passages (FAQ, Q&A headings)", traits.answerShaped),
    gap("direct quotations", traits.quotations),
  ]) if (f) findings.push(f);
  if (findings.length === 1) findings.push("Strong citation-worthiness across analyzed pages.");

  return { analyzed: true, pagesAnalyzed: n, contentScore, traits, findings };
}
