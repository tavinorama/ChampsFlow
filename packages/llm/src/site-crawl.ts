/**
 * Site crawl — Ozvor
 *
 * Turns the Brand + Performance score vectors from baseline placeholders into
 * MEASURED signal by analyzing the brand's actual website. No new deps: uses
 * native fetch (Node 20+) with a hard timeout and capped body size.
 *
 * What it measures (all normalised 0–1 for the scoring engine):
 *   PERFORMANCE
 *     - schemaCoverage    : fraction of expected schema.org types found in JSON-LD
 *     - llmsTxtPresent    : /llms.txt reachable (bool)
 *     - aiCrawlerAccess   : fraction of AI crawlers (GPTBot, ClaudeBot,
 *                           PerplexityBot, Google-Extended) NOT disallowed in robots.txt
 *   BRAND
 *     - entityCompleteness: fraction of org-identity signals present
 *                           (Organization schema, logo, sameAs links, contact, description)
 *     - eeaSignal         : fraction of E-E-A-T signals present
 *                           (author markup, about page link, named expertise, dates)
 *
 * Safety: requests time out (8s), follow <=3 redirects (native), cap body at
 * ~512KB, never execute page JS, and only read public pages. No PII is stored —
 * only the derived 0–1 metrics + a short human-readable findings list.
 */

const TIMEOUT_MS = 8000;
const MAX_BODY = 512 * 1024; // 512KB
const UA = "OzvorBot-Crawler/1.0 (+https://ozvor.com/bot)";

export interface SiteCrawlResult {
  reachable: boolean;
  performance: {
    schemaCoverage: number;
    llmsTxtPresent: boolean;
    aiCrawlerAccess: number;
  };
  brand: {
    entityCompleteness: number;
    eeaSignal: number;
  };
  /** Human-readable findings shown in the breakdown UI (no PII). */
  findings: string[];
}

import { guardedFetch } from "./ssrf-guard";

const AI_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];
const EXPECTED_SCHEMA = ["Organization", "WebSite", "BreadcrumbList", "FAQPage", "Article"];

function normalizeUrl(domain: string): string {
  const d = domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return `https://${d}`;
}

async function safeFetch(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    // GEO-SEC-1/4: user-supplied domain — block private/metadata targets and
    // re-validate every redirect hop (ssrf-guard).
    const res = await guardedFetch(url, {
      timeoutMs: TIMEOUT_MS,
      headers: { "User-Agent": UA, Accept: "text/html,text/plain,*/*" },
    });
    // Read at most MAX_BODY characters.
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text.slice(0, MAX_BODY) };
  } catch {
    return { ok: false, status: 0, body: "" };
  }
}

function measureSchema(html: string): { coverage: number; types: string[] } {
  // Extract JSON-LD blocks and collect @type values.
  const found = new Set<string>();
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const block = m[1] ?? "";
    for (const t of EXPECTED_SCHEMA) {
      if (new RegExp(`"@type"\\s*:\\s*"?${t}"?`, "i").test(block)) found.add(t);
    }
  }
  return { coverage: found.size / EXPECTED_SCHEMA.length, types: [...found] };
}

function measureAiCrawlerAccess(robotsTxt: string): { fraction: number; blocked: string[] } {
  if (!robotsTxt) return { fraction: 1, blocked: [] }; // no robots.txt = nothing disallowed
  const lower = robotsTxt.toLowerCase();
  const blocked: string[] = [];
  for (const bot of AI_CRAWLERS) {
    // crude but effective: a user-agent block for the bot with a Disallow: /
    const idx = lower.indexOf(`user-agent: ${bot.toLowerCase()}`);
    if (idx !== -1) {
      const section = lower.slice(idx, idx + 300);
      if (/disallow:\s*\//.test(section)) blocked.push(bot);
    }
  }
  return { fraction: (AI_CRAWLERS.length - blocked.length) / AI_CRAWLERS.length, blocked };
}

function measureBrand(html: string): { entityCompleteness: number; eeaSignal: number; entitySignals: string[]; eeaSignals: string[] } {
  const h = html.toLowerCase();
  const entityChecks: Array<[string, boolean]> = [
    ["Organization schema", /"@type"\s*:\s*"?organization"?/i.test(html)],
    ["logo", /"logo"\s*:/i.test(html) || /<link[^>]+rel=["']icon/i.test(html)],
    ["sameAs / social links", /"sameas"\s*:/i.test(html) || /(twitter|linkedin|facebook)\.com/i.test(h)],
    ["contact info", /"contactpoint"|mailto:|tel:/i.test(html)],
    ["description meta", /<meta[^>]+name=["']description["']/i.test(html)],
  ];
  const eeaChecks: Array<[string, boolean]> = [
    ["author markup", /"author"\s*:|rel=["']author["']|by\s+[A-Z]/.test(html)],
    ["about page link", /href=["'][^"']*about/i.test(html)],
    ["expertise / credentials", /(certified|expert|years of experience|founded|since \d{4})/i.test(h)],
    ["dated content", /datepublished|datemodified|<time/i.test(html)],
  ];
  const entitySignals = entityChecks.filter(([, ok]) => ok).map(([n]) => n);
  const eeaSignals = eeaChecks.filter(([, ok]) => ok).map(([n]) => n);
  return {
    entityCompleteness: entitySignals.length / entityChecks.length,
    eeaSignal: eeaSignals.length / eeaChecks.length,
    entitySignals,
    eeaSignals,
  };
}

/**
 * Crawl a brand's website and derive measured Brand + Performance inputs.
 * Returns reachable=false (with neutral 0.5 baselines) if the domain is absent
 * or unreachable — the caller decides whether to treat inputs as measured.
 */
export async function crawlSite(domain: string | null | undefined): Promise<SiteCrawlResult> {
  const findings: string[] = [];

  if (!domain || !domain.trim()) {
    findings.push("No website domain provided — Brand & Performance use neutral baselines.");
    return {
      reachable: false,
      performance: { schemaCoverage: 0.5, llmsTxtPresent: false, aiCrawlerAccess: 0.5 },
      brand: { entityCompleteness: 0.5, eeaSignal: 0.5 },
      findings,
    };
  }

  const base = normalizeUrl(domain);
  const home = await safeFetch(base);

  if (!home.ok || !home.body) {
    findings.push(`Could not reach ${base} (status ${home.status}). Using neutral baselines.`);
    return {
      reachable: false,
      performance: { schemaCoverage: 0.5, llmsTxtPresent: false, aiCrawlerAccess: 0.5 },
      brand: { entityCompleteness: 0.5, eeaSignal: 0.5 },
      findings,
    };
  }

  // Fetch robots.txt + llms.txt in parallel.
  const [robots, llms] = await Promise.all([
    safeFetch(`${base}/robots.txt`),
    safeFetch(`${base}/llms.txt`),
  ]);

  const schema = measureSchema(home.body);
  const crawler = measureAiCrawlerAccess(robots.ok ? robots.body : "");
  const brand = measureBrand(home.body);
  const llmsTxtPresent = llms.ok && llms.body.length > 0;

  findings.push(
    schema.types.length
      ? `Schema.org found: ${schema.types.join(", ")} (${Math.round(schema.coverage * 100)}% of expected types). Standard SEO structured data — Google grounds AI answers in your indexed content.`
      : "No schema.org markup detected — standard structured-data hygiene that helps your normal Search presence."
  );
  // Informational only — Google's 2026 guide states llms.txt is NOT required for
  // generative AI search, so this does not affect the score.
  findings.push(
    llmsTxtPresent
      ? "llms.txt present (informational — Google does not require it for AI search)."
      : "No llms.txt found (informational — Google states it is not required for AI search; does not affect your score)."
  );
  findings.push(
    crawler.blocked.length
      ? `AI crawlers blocked in robots.txt: ${crawler.blocked.join(", ")} — these engines can't read your site.`
      : "All major AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) are allowed."
  );
  findings.push(`Brand identity signals: ${brand.entitySignals.join(", ") || "none detected"}.`);
  findings.push(`E-E-A-T signals: ${brand.eeaSignals.join(", ") || "none detected"}.`);

  return {
    reachable: true,
    performance: {
      schemaCoverage: schema.coverage,
      llmsTxtPresent,
      aiCrawlerAccess: crawler.fraction,
    },
    brand: {
      entityCompleteness: brand.entityCompleteness,
      eeaSignal: brand.eeaSignal,
    },
    findings,
  };
}
