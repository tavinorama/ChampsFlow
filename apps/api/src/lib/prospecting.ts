/**
 * prospecting.ts — the PURE half of the prospect-batch graph (5.A.1 + 2.10).
 *
 * Everything here is decisions, no I/O — importable by the runner, by the
 * worker's probe and by the unit tests. The design carries the house split:
 * the LLM is a SUGGESTION engine, the code is the TRUTH gate. Engines list
 * candidate businesses; code verifies each site exists (worker half), and
 * THIS file owns every parse/validate/render step so none of it can drift
 * into a model's imagination ("o vigia também mente" — aggregation is code,
 * the LLM only writes prose from gathered facts).
 *
 * Hard rules encoded here:
 *  - COLD EMAIL 1 HAS ZERO LINKS (founder, 27/08): validateColdSequenceBatch
 *    REFUSES any URL/domain in email 1 — enforced by CODE on the draft and
 *    the finalize artifacts, not just asked in the prompt. Correlation of
 *    touch 1 is by the lead's email (the SmartLead reply webhook → crm_contact
 *    path already live in prod); ?from=<campanha> links only from email 2+.
 *  - Only prospects with a CODE-extracted email can become crm_contact rows
 *    (the table is email-keyed); engine-claimed emails are never trusted.
 *  - A prospect with ZERO code-verified findings is dropped: no honest
 *    ammunition, no cold email.
 */

/** Default cap of verified prospects per weekly batch (env override in worker). */
export const DEFAULT_PROSPECT_BATCH_CAP = 10;

/**
 * 0.6 (founder 01/09) — the weekly batch runs TWO tracks, one per ICP:
 *  - 'geo'     → the existing local-services ICP (visibility pain; offer =
 *                free test, campaign slug cold-<date>);
 *  - 'aistack' → ICP-2 from docs/departments/sales/aistack-campaign-kit.md
 *                (tool/process pain; offer = AI Stack Audit $49 at
 *                ozvor.com/ai-audit, campaign slug aistack-<date>).
 * The CRM is one; the contact's note names the track + campaign so the
 * founder loads each track into its own SmartLead campaign.
 */
export type ProspectTrack = "geo" | "aistack";
export const PROSPECT_TRACKS: readonly ProspectTrack[] = ["geo", "aistack"];

/**
 * v1 ICP, static and cited — NOT invented from thin air. Source:
 * docs/departments/sales/icp.md (canonical ICP card, launch 2026-07-13),
 * Segment B "organic-dependent SMBs", local-services flavor: US businesses
 * that live off being FOUND (local search, and now AI answers) — the segment
 * whose entry ladder is free test → Ozvor Pages $99 / Kit $29 → Growth $99.
 * They are the best cold target for the mini-GEO-probe because robots.txt,
 * schema and SSR findings are concrete, checkable and theirs to fix.
 * Extension point: env PROSPECT_ICP overrides this text (worker reads it);
 * the batch cap moves via env PROSPECT_BATCH_CAP.
 */
export const DEFAULT_PROSPECT_ICP = [
  "US small businesses (1-50 people) that depend on being DISCOVERED online",
  "to win customers — local/AI-search discovery is their lifeline. Priority",
  "verticals: roofers, contractors, HVAC/plumbing, clinics (dental, physio,",
  "med spa), law firms, home services, and small digital/SEO agencies (3-40",
  "people) serving such clients. They have a real website, real reviews, and",
  "organic/local traffic they cannot afford to lose to AI answers that never",
  "mention them. (Fonte: docs/departments/sales/icp.md — segmento B",
  "organic-dependent SMBs + segmento A agencias; recorte local-services US.)",
].join(" ");

/**
 * ICP-2 (AISTACK track), static and cited — NOT invented. Source:
 * docs/departments/sales/aistack-campaign-kit.md (01/09, PR #549): US SMB of
 * ANY niche drowning in the wrong tools, not (only) invisible in AI search.
 * The $49 AI Stack Audit reads their pains and names the right AI tool —
 * catalog-fit is the qualifier. Override: env PROSPECT_ICP_AISTACK.
 */
export const DEFAULT_PROSPECT_ICP_AISTACK = [
  "US small businesses (1-50 people) of ANY niche with visible tool/process",
  "pain: they pay for several SaaS tools yet still do repetitive work by hand",
  "(admin, marketing, customer service, scheduling, quotes). Signals: lean",
  "teams wearing many hats, service businesses with manual intake/booking,",
  "small e-commerce or agencies drowning in busywork. They have a real",
  "website and a real operation, and no time to test 100 AI apps — a $49",
  "audit that names the ONE right AI tool for their worst bottleneck is an",
  "easy yes. (Fonte: docs/departments/sales/aistack-campaign-kit.md — ICP-2",
  "da trilha AI STACK, regra do founder 01/09.)",
].join(" ");

export interface CandidateBusiness {
  name: string;
  /** Normalized absolute URL (https:// prepended when the engine omitted it). */
  website: string;
}

// ---------------------------------------------------------------------------
// Source abstraction (10.C.17 / 5.A.6, founder decision 2 de 02/09).
//
// The batch pipeline (verify site → mini-GEO-probe → sequences → founder
// approval → CRM) is IDENTICAL for every source; only candidate ACQUISITION
// changes:
//  - 'engine': the historic v1 — hermes engines SUGGEST candidates (LLM);
//  - 'apify' : a REAL data source (Google-Maps-scraper-class actor) that
//    costs money per run and therefore NEVER runs on its own — no cron, no
//    default; it runs only from an explicit founder-confirmed dispatch
//    (workflow_dispatch confirm=yes, or the operator endpoint with
//    confirm:true) with the estimated cost shown FIRST.
// ---------------------------------------------------------------------------

export type ProspectSource = "engine" | "apify";

/** A candidate from a real data source — engine candidates carry name+site only. */
export interface ApifyCandidate extends CandidateBusiness {
  phone: string | null;
  category: string | null;
  /** Google rating (e.g. 4.6) — "fechabilidade" proxy (regra custo/receita do founder). */
  rating: number | null;
  /** Review count — the other fechabilidade proxy. */
  reviewsCount: number | null;
  /** Email as provided by the actor (scraped data, kept as FALLBACK only —
   * the code-extracted email from the prospect's own site still wins). */
  email: string | null;
}

/**
 * Apify actor id FORMAT validation only — we never assume a given actor
 * exists (that is the run's problem, reported honestly). Accepted:
 * "owner/actor-name" (store slug) or a bare platform id (17 alnum chars).
 */
export function isValidApifyActorId(id: string): boolean {
  if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\/[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(id)) return true;
  return /^[a-zA-Z0-9]{17}$/.test(id);
}

/** Hard per-run cap on places — one dispatch must never be an open faucet. */
export const APIFY_MAX_PLACES_PER_RUN = 500;

export interface ApifyRunSpec {
  track: ProspectTrack;
  /** Search strings the actor understands, e.g. "roofing contractor Fort Worth TX". */
  queries: string[];
  /** Max places PER QUERY (the actor's maxCrawledPlacesPerSearch). */
  maxPlaces: number;
  /** Actor to run; when absent the worker uses env APIFY_MAPS_ACTOR. */
  actorId?: string;
  /** Extra actor input merged over the generated one (advanced, optional). */
  input?: Record<string, unknown>;
}

/**
 * Parse + validate the JSON run spec (from the workflow/operator request —
 * actor id and input come from the REQUEST, never hardcoded).
 */
export function parseApifyRunSpec(raw: unknown): { ok: boolean; spec?: ApifyRunSpec; errors: string[] } {
  const errors: string[] = [];
  const o = (raw ?? {}) as Record<string, unknown>;
  const track = o["track"];
  if (track !== "geo" && track !== "aistack") errors.push("track deve ser 'geo' ou 'aistack'");
  const rawQueries = Array.isArray(o["queries"]) ? o["queries"] : [];
  const queries = rawQueries
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.trim())
    .filter((q) => q.length >= 3 && q.length <= 200)
    .slice(0, 10);
  if (queries.length === 0) errors.push("queries: pelo menos 1 termo de busca (3-200 chars; max 10)");
  const maxPlacesRaw = Number(o["maxPlaces"] ?? o["max_places"]);
  const maxPlaces = Number.isFinite(maxPlacesRaw) ? Math.floor(maxPlacesRaw) : NaN;
  if (!Number.isFinite(maxPlaces) || maxPlaces < 1) errors.push("maxPlaces deve ser um inteiro >= 1");
  const totalPlaces = (Number.isFinite(maxPlaces) ? maxPlaces : 0) * queries.length;
  if (totalPlaces > APIFY_MAX_PLACES_PER_RUN) {
    errors.push(`queries × maxPlaces = ${totalPlaces} excede o teto de ${APIFY_MAX_PLACES_PER_RUN} places por dispatch`);
  }
  const actorId = typeof o["actorId"] === "string" ? o["actorId"].trim() : typeof o["actor_id"] === "string" ? (o["actor_id"] as string).trim() : "";
  if (actorId && !isValidApifyActorId(actorId)) errors.push(`actorId '${actorId}' invalido (formato owner/nome ou id de 17 chars)`);
  const input = o["input"] != null && typeof o["input"] === "object" && !Array.isArray(o["input"]) ? (o["input"] as Record<string, unknown>) : undefined;
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors,
    spec: {
      track: track as ProspectTrack,
      queries,
      maxPlaces,
      ...(actorId ? { actorId } : {}),
      ...(input ? { input } : {}),
    },
  };
}

/** Places in a spec's worst case — what the cost estimate is computed on. */
export function apifySpecPlaces(spec: Pick<ApifyRunSpec, "queries" | "maxPlaces">): number {
  return spec.queries.length * spec.maxPlaces;
}

/** env APIFY_PRICE_PER_1K_USD (default 5): USD per 1000 scraped places. */
export function apifyPricePer1kUsd(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env["APIFY_PRICE_PER_1K_USD"]);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/** env APIFY_MONTHLY_BUDGET_USD (default 100): monthly Apify spend ceiling. */
export function apifyMonthlyBudgetUsd(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env["APIFY_MONTHLY_BUDGET_USD"]);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

/** Estimated cost in USD for `places` places at `pricePer1kUsd` per 1000. */
export function estimateApifyCostUsd(places: number, pricePer1kUsd: number): number {
  if (!Number.isFinite(places) || places <= 0) return 0;
  if (!Number.isFinite(pricePer1kUsd) || pricePer1kUsd <= 0) return 0;
  return Math.round((places / 1000) * pricePer1kUsd * 100) / 100;
}

export interface ApifyRunDecision {
  allowed: boolean;
  reason: string;
}

/**
 * The single confirm+budget gate — the operator endpoint and the worker both
 * apply THIS decision (never a re-implementation). "Pergunte sempre antes de
 * rodar": no confirmation, no call; estimate over what remains of the monthly
 * budget, no call.
 */
export function decideApifyRun(input: {
  confirmed: boolean;
  estimateUsd: number;
  monthSpentUsd: number;
  budgetUsd: number;
}): ApifyRunDecision {
  if (!input.confirmed) {
    return {
      allowed: false,
      reason: `sem confirmacao explicita (confirm=yes) — estimativa $${input.estimateUsd.toFixed(2)}; NADA foi chamado`,
    };
  }
  const after = input.monthSpentUsd + input.estimateUsd;
  if (after > input.budgetUsd) {
    return {
      allowed: false,
      reason: `orcamento mensal Apify estouraria: gasto $${input.monthSpentUsd.toFixed(2)} + estimativa $${input.estimateUsd.toFixed(2)} > teto $${input.budgetUsd.toFixed(2)} (APIFY_MONTHLY_BUDGET_USD)`,
    };
  }
  return { allowed: true, reason: `confirmado; estimativa $${input.estimateUsd.toFixed(2)} cabe no orcamento (gasto do mes $${input.monthSpentUsd.toFixed(2)} / teto $${input.budgetUsd.toFixed(2)})` };
}

/**
 * Map raw Apify dataset items (Google-Maps-scraper-class shape: title,
 * website, phone, categoryName, totalScore, reviewsCount, emails[]) into
 * candidates. Deterministic parse — items without a plausible public website
 * are dropped here (same bar as parseCandidateList); dedup by hostname.
 */
export function parseApifyItems(items: unknown[], cap = 60): ApifyCandidate[] {
  const out: ApifyCandidate[] = [];
  const seenHosts = new Set<string>();
  for (const raw of items) {
    if (out.length >= cap) break;
    if (raw == null || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const name = String(o["title"] ?? o["name"] ?? "").trim();
    if (!name || name.length > 120) continue;
    let site = String(o["website"] ?? o["url"] ?? "").trim();
    if (!site) continue;
    if (!/^https?:\/\//i.test(site)) site = `https://${site}`;
    let url: URL;
    try {
      url = new URL(site);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || host === "localhost") continue;
    if (/(^|\.)google\.[a-z.]+$|(^|\.)facebook\.com$|(^|\.)instagram\.com$/i.test(host)) continue; // maps profile, not a site
    if (seenHosts.has(host)) continue;
    seenHosts.add(host);
    const ratingRaw = Number(o["totalScore"] ?? o["rating"]);
    const reviewsRaw = Number(o["reviewsCount"] ?? o["reviews_count"]);
    const emailsRaw = Array.isArray(o["emails"]) ? o["emails"] : o["email"] != null ? [o["email"]] : [];
    const email = emailsRaw
      .map((e) => String(e ?? "").trim().toLowerCase())
      .find((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && !EMAIL_JUNK.test(e));
    out.push({
      name,
      website: `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`,
      phone: typeof o["phone"] === "string" && o["phone"].trim() ? o["phone"].trim().slice(0, 30) : null,
      category: typeof o["categoryName"] === "string" && o["categoryName"].trim() ? o["categoryName"].trim().slice(0, 60) : null,
      rating: Number.isFinite(ratingRaw) && ratingRaw > 0 ? ratingRaw : null,
      reviewsCount: Number.isFinite(reviewsRaw) && reviewsRaw >= 0 ? Math.floor(reviewsRaw) : null,
      email: email ?? null,
    });
  }
  return out;
}

/**
 * Parse the engine's candidate list — one `Name | website` per line, numbered
 * or not. Anything that does not parse as a plausible public website is
 * dropped HERE, before any network call: no scheme? https:// is prepended;
 * no dot in the hostname, an IP, localhost, or a duplicate hostname → out.
 */
export function parseCandidateList(text: string, cap = 30): CandidateBusiness[] {
  const out: CandidateBusiness[] = [];
  const seenHosts = new Set<string>();
  for (const raw of text.split("\n")) {
    if (out.length >= cap) break;
    const m = /^\s*(?:[-*•]|\d+[.)])?\s*(.+?)\s*\|\s*(\S+)\s*$/.exec(raw);
    if (!m) continue;
    const name = m[1]!.trim();
    if (!name || name.length > 120) continue;
    let site = m[2]!.trim().replace(/[),.;]+$/, "");
    if (!/^https?:\/\//i.test(site)) site = `https://${site}`;
    let url: URL;
    try {
      url = new URL(site);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase();
    if (!host.includes(".")) continue;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) continue; // raw IP
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".example")) continue;
    if (host.endsWith("example.com")) continue;
    if (seenHosts.has(host)) continue;
    seenHosts.add(host);
    out.push({ name, website: `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}` });
  }
  return out;
}

/** The AI crawlers the mini-GEO-probe checks in robots.txt (2.10). */
export const AI_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"] as const;

/**
 * Which AI crawlers does this robots.txt block from the ROOT? Group-aware:
 * a `User-agent:` group blocks a crawler when it names it (case-insensitive)
 * and carries `Disallow: /` (root). The `*` group blocks a crawler only when
 * NO specific group exists for it (standard robots precedence). null/absent
 * robots.txt blocks nothing.
 */
export function robotsBlockedAiCrawlers(robotsTxt: string | null): string[] {
  if (!robotsTxt) return [];
  interface Group {
    agents: string[];
    rootDisallow: boolean;
  }
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const ua = /^user-agent:\s*(.+)$/i.exec(line);
    if (ua) {
      // Consecutive User-agent lines share one group (robots spec).
      if (!current || !lastWasAgent) {
        current = { agents: [], rootDisallow: false };
        groups.push(current);
      }
      current.agents.push(ua[1]!.trim().toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    const dis = /^disallow:\s*(.*)$/i.exec(line);
    if (dis && dis[1]!.trim() === "/") current.rootDisallow = true;
  }
  const blocked: string[] = [];
  for (const crawler of AI_CRAWLERS) {
    const key = crawler.toLowerCase();
    const specific = groups.filter((g) => g.agents.includes(key));
    if (specific.length > 0) {
      if (specific.some((g) => g.rootDisallow)) blocked.push(crawler);
      continue;
    }
    const star = groups.filter((g) => g.agents.includes("*"));
    if (star.some((g) => g.rootDisallow)) blocked.push(crawler);
  }
  return blocked;
}

/** Strip scripts/styles/tags/entities to the text a no-JS crawler would read. */
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** SSR visible word count — what a non-JS AI crawler actually gets. */
export function visibleWordCount(html: string): number {
  const text = stripHtmlToText(html);
  return text ? text.split(" ").filter((w) => w.length > 0).length : 0;
}

/** JSON-LD @type values found in the page's ld+json blocks (dedup, capped). */
export function jsonLdTypes(html: string): string[] {
  const types = new Set<string>();
  const blocks = html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const b of blocks) {
    const body = b[1] ?? "";
    for (const t of body.matchAll(/"@type"\s*:\s*"([^"]+)"/g)) {
      if (types.size < 8) types.add(t[1]!);
    }
    // A block that exists but declares no @type still counts as "has JSON-LD".
    if (types.size === 0 && body.trim()) types.add("(sem @type)");
  }
  return [...types];
}

export interface ProbeFacts {
  robotsFound: boolean;
  blockedAiCrawlers: string[];
  jsonLdTypes: string[];
  hasTitle: boolean;
  hasMetaDescription: boolean;
  visibleWords: number;
}

/** Homepages rendering fewer SSR words than this get the "thin without JS" finding. */
export const THIN_SSR_WORD_THRESHOLD = 120;

/**
 * The 2.10 mini-GEO-probe: pure parse of homepage HTML + robots.txt into 2-3
 * concrete, code-verified findings — the discovery-audit ammunition for
 * email 2+ (and for email 1, in plain words). Findings are ENGLISH because
 * they feed outbound copy verbatim-ish; every one is checkable by the
 * prospect in under a minute.
 */
export function probeSite(input: { html: string | null; robotsTxt: string | null }): {
  facts: ProbeFacts;
  findings: string[];
} {
  const html = input.html ?? "";
  const blocked = robotsBlockedAiCrawlers(input.robotsTxt);
  const types = jsonLdTypes(html);
  const words = visibleWordCount(html);
  const hasTitle = /<title[^>]*>[^<]*\S[^<]*<\/title>/i.test(html);
  const hasMetaDescription = /<meta[^>]+name\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']*\S/i.test(html)
    || /<meta[^>]+content\s*=\s*["'][^"']*\S[^"']*["'][^>]*name\s*=\s*["']description["']/i.test(html);

  const facts: ProbeFacts = {
    robotsFound: input.robotsTxt != null,
    blockedAiCrawlers: blocked,
    jsonLdTypes: types,
    hasTitle,
    hasMetaDescription,
    visibleWords: words,
  };

  const findings: string[] = [];
  if (blocked.length > 0) {
    findings.push(`robots.txt blocks ${blocked.join(" and ")} — those AI crawlers cannot read the site`);
  }
  if (types.length === 0) {
    findings.push("no JSON-LD structured data on the homepage (no LocalBusiness/Organization schema)");
  }
  if (words < THIN_SSR_WORD_THRESHOLD) {
    findings.push(`homepage renders only ${words} words of visible text without JavaScript`);
  }
  if (!hasMetaDescription) {
    findings.push("homepage has no meta description");
  }
  if (!hasTitle) {
    findings.push("homepage has no <title> tag");
  }
  // 2-3 concrete findings per prospect — strongest first, capped at 3.
  return { facts, findings: findings.slice(0, 3) };
}

/** Obvious non-contact matches an email regex drags out of real-world HTML. */
const EMAIL_JUNK = /(?:\.(?:png|jpe?g|gif|webp|svg|css|js)$)|example\.|sentry|wixpress|godaddy|@(?:2x|3x)\b|no-?reply|placeholder|yourdomain|your-?email|email@email/i;

/** Code-extracted contact emails from raw HTML (mailto + plain text), deduped. */
export function extractContactEmails(html: string | null): string[] {
  if (!html) return [];
  const found = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const out: string[] = [];
  for (const raw of found) {
    const email = raw.toLowerCase();
    if (EMAIL_JUNK.test(email)) continue;
    if (email.length > 80) continue;
    if (!out.includes(email)) out.push(email);
    if (out.length >= 3) break;
  }
  return out;
}

const NAME_STOPWORDS = new Set([
  "the", "and", "of", "for", "llc", "inc", "co", "corp", "ltd", "llp", "pllc", "company", "group", "services", "service",
]);

/**
 * Does the claimed business name actually appear in the fetched HTML?
 * Token-based (significant tokens >= 3 chars, stopwords out); at least half
 * of them must appear, case-insensitively, in the stripped text or title.
 * "Smith Roofing LLC" matches a site saying "Smith Roofing"; an engine
 * hallucination pointing at an unrelated real domain does not.
 */
export function nameMatchesHtml(name: string, html: string): boolean {
  const haystack = `${stripHtmlToText(html)} ${html.slice(0, 4000)}`.toLowerCase();
  const tokens = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
  if (tokens.length === 0) return false;
  const matched = tokens.filter((t) => haystack.includes(t)).length;
  return matched >= Math.ceil(tokens.length / 2);
}

/**
 * Campaign slug for the run — the ?from= value of emails 2+ (never email 1).
 * Per track (0.6): geo keeps the historic cold-<date>; aistack follows the
 * kit's SmartLead naming, aistack-<date>.
 */
export function campaignSlug(d: Date, track: ProspectTrack = "geo"): string {
  const day = d.toISOString().slice(0, 10);
  return track === "aistack" ? `aistack-${day}` : `cold-${day}`;
}

export interface VerifiedProspect {
  name: string;
  website: string;
  /** Code-extracted from the site's own HTML, or null (no CRM row possible). */
  email: string | null;
  /** 1-3 code-verified findings — the discovery-audit ammunition. */
  findings: string[];
  /** Which source produced the candidate (default 'engine' when absent). */
  source?: ProspectSource;
  /** Fechabilidade proxies (Apify source) — kept in the artifact + CRM note. */
  phone?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  category?: string | null;
}

export interface DroppedCandidate {
  name: string;
  website: string;
  reason: string;
}

/** Sentinel first line of a batch with zero verified prospects — honest empty. */
export const EMPTY_BATCH_SENTINEL = "SEM PROSPECTS VERIFICADOS NESTA RODADA";

/**
 * Render one verified batch (one track, or legacy single-track) as the
 * [prospects] artifact — the single source of truth downstream: the draft
 * prompt reads it, the approval box shows it, and the CRM store PARSES THIS
 * BLOCK (never the LLM output) for contacts. When `track` is present (0.6),
 * every prospect section carries its own TRILHA/CAMPANHA lines so the parse
 * and the validator route per prospect.
 */
export function renderProspectBlock(input: {
  campaign: string;
  icpSource: string;
  listed: number;
  verified: VerifiedProspect[];
  dropped: DroppedCandidate[];
  track?: ProspectTrack;
}): string {
  const lines: string[] = [];
  if (input.verified.length === 0) {
    lines.push(`${EMPTY_BATCH_SENTINEL} — engines listaram ${input.listed} candidato(s), 0 passaram na verificacao de codigo.`);
  } else {
    lines.push("LOTE DE PROSPECCAO (verificado por CODIGO — site respondeu 200, nome confere no HTML; nada abaixo e palpite de LLM)");
  }
  if (input.track) lines.push(`TRILHA: ${input.track}`);
  lines.push(`CAMPANHA: ${input.campaign}`);
  lines.push(`ICP: ${input.icpSource}`);
  lines.push(
    `CANDIDATOS LISTADOS PELOS ENGINES: ${input.listed} · VERIFICADOS: ${input.verified.length} · DESCARTADOS: ${input.dropped.length}`
  );
  for (const p of input.verified) {
    lines.push("");
    lines.push(`=== PROSPECT: ${p.name} ===`);
    if (input.track) {
      lines.push(`TRILHA: ${input.track}`);
      lines.push(`CAMPANHA: ${input.campaign}`);
    }
    lines.push(`SITE: ${p.website}`);
    lines.push(`EMAIL: ${p.email ?? "SEM EMAIL VERIFICADO"}`);
    if (p.source === "apify") lines.push("FONTE: apify");
    if (p.phone) lines.push(`FONE: ${p.phone}`);
    if (p.rating != null || p.reviewsCount != null) {
      lines.push(`RATING: ${p.rating != null ? p.rating : "?"} (${p.reviewsCount != null ? p.reviewsCount : "?"} reviews)`);
    }
    if (p.category) lines.push(`CATEGORIA: ${p.category}`);
    lines.push("ACHADOS (verificados por codigo):");
    for (const f of p.findings) lines.push(`- ${f}`);
  }
  if (input.dropped.length > 0) {
    lines.push("");
    lines.push("DESCARTADOS PELA VERIFICACAO (nunca viram prospect):");
    for (const d of input.dropped.slice(0, 20)) lines.push(`- ${d.name} (${d.website}): ${d.reason}`);
  }
  return lines.join("\n");
}

/** One track's worth of dual-batch material (0.6). */
export interface TrackBatch {
  track: ProspectTrack;
  campaign: string;
  icpSource: string;
  listed: number;
  verified: VerifiedProspect[];
  dropped: DroppedCandidate[];
}

/**
 * Render the DUAL batch (0.6): one [prospects] artifact, two clearly-separated
 * track sections, each prospect stamped with TRILHA + CAMPANHA. Both tracks
 * empty → the honest overall sentinel FIRST LINE (the draft prompt's empty
 * contract keys off it, unchanged).
 */
export function renderDualProspectBlock(tracks: TrackBatch[]): string {
  const totalVerified = tracks.reduce((n, t) => n + t.verified.length, 0);
  const totalListed = tracks.reduce((n, t) => n + t.listed, 0);
  const lines: string[] = [];
  if (totalVerified === 0) {
    lines.push(
      `${EMPTY_BATCH_SENTINEL} — engines listaram ${totalListed} candidato(s) nas ${tracks.length} trilhas, 0 passaram na verificacao de codigo.`
    );
  } else {
    lines.push(
      "LOTE DE PROSPECCAO DUAL (verificado por CODIGO — site respondeu 200, nome confere no HTML; nada abaixo e palpite de LLM)"
    );
  }
  lines.push(`TRILHAS: ${tracks.map((t) => `${t.track} (campanha ${t.campaign})`).join(" + ")}`);
  for (const t of tracks) {
    lines.push("");
    lines.push(`--- TRILHA ${t.track.toUpperCase()} — campanha ${t.campaign} ---`);
    lines.push(
      renderProspectBlock({
        campaign: t.campaign,
        icpSource: t.icpSource,
        listed: t.listed,
        verified: t.verified,
        dropped: t.dropped,
        track: t.track,
      })
    );
  }
  return lines.join("\n");
}

export interface CrmProspectContact {
  email: string;
  name: string;
  website: string;
  finding: string;
  /** Which track sourced this contact (0.6) — 'geo' when the block predates tracks. */
  track: ProspectTrack;
  /** The track's campaign slug — the SmartLead campaign this contact belongs to. */
  campaign: string;
  /** Fechabilidade proxies (Apify source) — travel from the block into the note. */
  phone?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
}

/** The crm_contact note line for one approved prospect — one source (worker + tests). */
export function crmNoteFor(c: CrmProspectContact): string {
  const proxies: string[] = [];
  if (c.phone) proxies.push(`fone=${c.phone}`);
  if (c.rating != null) proxies.push(`rating=${c.rating}`);
  if (c.reviewsCount != null) proxies.push(`reviews=${c.reviewsCount}`);
  const proxyPart = proxies.length > 0 ? ` ${proxies.join(" ")}` : "";
  return `[prospect-batch] trilha=${c.track} campanha=${c.campaign}${proxyPart} — ${c.finding || "sem achado registrado"} — ${c.website}`;
}

/**
 * Parse the code-generated [prospects] block back into CRM rows — the store
 * step reads THIS (config.contactsNode), never the LLM's sequences, so a
 * model rewrite can never alter what lands in crm_contact. Only prospects
 * whose EMAIL line is a real address become contacts. Track/campaign come
 * from each prospect's OWN section lines (0.6); a legacy block without them
 * degrades to geo + the block's global campaign.
 */
export function parseProspectsForCrm(block: string): { campaign: string; contacts: CrmProspectContact[] } {
  const campaigns = [...block.matchAll(/^CAMPANHA:\s*(\S+)/gm)].map((m) => m[1]!);
  const campaign = [...new Set(campaigns)].join("+") || "cold-unknown";
  const globalCampaign = campaigns[0] ?? "cold-unknown";
  const contacts: CrmProspectContact[] = [];
  const sections = block.split(/^=== PROSPECT:\s*/m).slice(1);
  for (const section of sections) {
    const name = section.split("===")[0]?.trim() ?? "";
    const website = /^SITE:\s*(\S+)/m.exec(section)?.[1] ?? "";
    const emailRaw = /^EMAIL:\s*(.+)$/m.exec(section)?.[1]?.trim() ?? "";
    const finding = /^-\s*(.+)$/m.exec(section.split("ACHADOS")[1] ?? "")?.[1]?.trim() ?? "";
    // FIRST match only: a section runs until the next '=== PROSPECT:' and can
    // therefore contain the NEXT track's header lines — the prospect's own
    // TRILHA/CAMPANHA lines always come first (right under its header).
    const track: ProspectTrack = /^TRILHA:\s*(geo|aistack)\b/m.exec(section)?.[1] === "aistack" ? "aistack" : "geo";
    const ownCampaign = /^CAMPANHA:\s*(\S+)/m.exec(section)?.[1] ?? globalCampaign;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailRaw)) continue;
    // Fechabilidade proxies (Apify source) — parsed back from the CODE block.
    const phone = /^FONE:\s*(.+)$/m.exec(section)?.[1]?.trim() ?? null;
    const ratingM = /^RATING:\s*([\d.]+|\?)\s*\((\d+|\?)\s*reviews\)/m.exec(section);
    const rating = ratingM && ratingM[1] !== "?" ? Number(ratingM[1]) : null;
    const reviewsCount = ratingM && ratingM[2] !== "?" ? Number(ratingM[2]) : null;
    contacts.push({
      email: emailRaw.toLowerCase(),
      name,
      website,
      finding,
      track,
      campaign: ownCampaign,
      ...(phone ? { phone } : {}),
      ...(rating != null ? { rating } : {}),
      ...(reviewsCount != null ? { reviewsCount } : {}),
    });
  }
  return { campaign, contacts };
}

/**
 * Name → {track, campaign} map from the code-generated block — the validator
 * routes each LLM sequence on it (0.6). Email is irrelevant here: a prospect
 * without a verified email still gets a sequence (the founder can source the
 * address by hand), and its links must still match its track.
 */
export function prospectTracksFromBlock(block: string): Map<string, { track: ProspectTrack; campaign: string }> {
  const out = new Map<string, { track: ProspectTrack; campaign: string }>();
  const globalCampaign = /^CAMPANHA:\s*(\S+)/m.exec(block)?.[1] ?? "cold-unknown";
  for (const section of block.split(/^=== PROSPECT:\s*/m).slice(1)) {
    const name = section.split("===")[0]?.trim() ?? "";
    if (!name) continue;
    // FIRST match only — see parseProspectsForCrm: the section may contain the
    // next track's header lines after this prospect's own fields.
    const track: ProspectTrack = /^TRILHA:\s*(geo|aistack)\b/m.exec(section)?.[1] === "aistack" ? "aistack" : "geo";
    const campaign = /^CAMPANHA:\s*(\S+)/m.exec(section)?.[1] ?? globalCampaign;
    out.set(name, { track, campaign });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cold-sequence validation — the CODE-ENFORCED half of the 27/08 rule.
// ---------------------------------------------------------------------------

/**
 * Does this text contain anything a mail client would render as a link?
 * Deliberately strict: schemes, www., markdown links, mailto AND bare
 * domains (acme.com) all count — deliverability treats them all as links.
 */
export function containsLink(text: string): boolean {
  if (/https?:\/\//i.test(text)) return true;
  if (/\bwww\.[a-z0-9-]/i.test(text)) return true;
  if (/mailto:/i.test(text)) return true;
  if (/\]\([^)]+\)/.test(text)) return true; // markdown [text](url)
  if (/\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|ai|co|us|dev|app|site|online|biz|info)\b/i.test(text)) return true;
  return false;
}

/** Every ozvor.com URL-ish mention in a text (for the ?from= check). */
export function ozvorUrlsIn(text: string): string[] {
  return text.match(/(?:https?:\/\/)?(?:www\.)?ozvor\.com[^\s)\]"'<>]*/gi) ?? [];
}

export interface ParsedSequenceEmail {
  index: number;
  subject: string | null;
  body: string;
}

export interface ParsedProspectSequence {
  prospect: string;
  emails: ParsedSequenceEmail[];
}

/** Parse the draft/finalize output contract: === PROSPECT === + [EMAIL n] blocks. */
export function splitProspectSequences(text: string): ParsedProspectSequence[] {
  const out: ParsedProspectSequence[] = [];
  const sections = text.split(/^=== PROSPECT:\s*/m).slice(1);
  for (const section of sections) {
    const prospect = section.split("===")[0]?.trim() ?? "";
    const emails: ParsedSequenceEmail[] = [];
    const parts = section.split(/^\[EMAIL\s+(\d)\]\s*$/m);
    // parts: [preamble, "1", body1, "2", body2, ...]
    for (let i = 1; i + 1 < parts.length + 1; i += 2) {
      const idx = Number(parts[i]);
      const raw = (parts[i + 1] ?? "").trim();
      if (!Number.isFinite(idx)) continue;
      const subjectMatch = /^SUBJECT:\s*(.+)$/m.exec(raw);
      const body = raw.replace(/^SUBJECT:.*$/m, "").trim();
      emails.push({ index: idx, subject: subjectMatch?.[1]?.trim() ?? null, body });
    }
    out.push({ prospect, emails });
  }
  return out;
}

export interface SequenceValidation {
  ok: boolean;
  errors: string[];
}

/**
 * The code validator the runner applies to the draft AND the finalize
 * artifacts (config.validate === 'cold-email-batch'). A draft that violates
 * the 27/08 rule FAILS THE STEP — it never reaches the approval box.
 *
 *  - >= 1 prospect, exactly 3 emails each;
 *  - EMAIL 1: zero links of any shape (subject included) + at least one
 *    question mark (touch 1 is reply-seeking by design);
 *  - EMAILS 2-3: every ozvor.com mention must carry ?from= (campaign
 *    attribution — links without it are wasted correlation).
 *
 * 0.6 — when the code-generated [prospects] block is handed in as context,
 * the validator also routes PER TRACK (the track comes from the block, never
 * from the LLM):
 *  - aistack prospect: every ozvor link in emails 2-3 must target /ai-audit
 *    with ?from=<the track's campaign> (aistack-*), and EMAIL 2 must carry
 *    the offer link (the kit's mold);
 *  - geo prospect: ozvor links must NOT target /ai-audit (the geo offer is
 *    the free test — /test or the root) — track mixing is a code failure;
 *  - a sequence for a name outside the verified block is refused (an
 *    invented prospect must never reach the approval box).
 *
 * The exact-sentinel empty batch ("SEM PROSPECTS VERIFICADOS...") is VALID:
 * an honest nothing beats an invented prospect.
 */
export function validateColdSequenceBatch(text: string, prospectsBlock?: string | null): SequenceValidation {
  const errors: string[] = [];
  const trimmed = text.trim();
  if (trimmed.startsWith(EMPTY_BATCH_SENTINEL)) return { ok: true, errors };
  const sequences = splitProspectSequences(trimmed);
  if (sequences.length === 0) {
    return { ok: false, errors: ["nenhum bloco '=== PROSPECT: ... ===' encontrado no lote"] };
  }
  const tracks = prospectsBlock ? prospectTracksFromBlock(prospectsBlock) : null;
  for (const seq of sequences) {
    const label = seq.prospect || "(sem nome)";
    const info = tracks?.get(seq.prospect.trim());
    if (tracks && tracks.size > 0 && !info) {
      errors.push(`'${label}': prospect fora do bloco verificado — sequencia para nome nao verificado por codigo`);
    }
    const byIndex = new Map(seq.emails.map((e) => [e.index, e]));
    for (const n of [1, 2, 3]) {
      if (!byIndex.get(n)?.body) errors.push(`'${label}': [EMAIL ${n}] ausente ou vazio`);
    }
    const email1 = byIndex.get(1);
    if (email1) {
      const full = `${email1.subject ?? ""}\n${email1.body}`;
      if (containsLink(full)) {
        errors.push(`'${label}': EMAIL 1 contem link/URL/dominio — regra 27/08: primeiro toque frio e texto puro, zero links`);
      }
      if (!email1.body.includes("?")) {
        errors.push(`'${label}': EMAIL 1 sem pergunta — o primeiro toque busca RESPOSTA (uma pergunta)`);
      }
    }
    for (const n of [2, 3]) {
      const email = byIndex.get(n);
      if (!email) continue;
      const urls = ozvorUrlsIn(`${email.subject ?? ""}\n${email.body}`);
      for (const url of urls) {
        if (!/[?&]from=/.test(url)) {
          errors.push(`'${label}': EMAIL ${n} tem link ozvor.com sem ?from=<campanha> — atribuicao obrigatoria do 2o toque em diante`);
        }
        if (info?.track === "aistack") {
          if (!/ozvor\.com\/ai-audit\b/i.test(url)) {
            errors.push(`'${label}': EMAIL ${n} (trilha aistack) linka fora de /ai-audit — a oferta da trilha e o AI Stack Audit`);
          }
          if (!new RegExp(`[?&]from=${info.campaign.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[&\\s])`).test(url)) {
            errors.push(`'${label}': EMAIL ${n} (trilha aistack) com ?from= fora da campanha ${info.campaign}`);
          }
        }
        if (info?.track === "geo" && /ozvor\.com\/ai-audit\b/i.test(url)) {
          errors.push(`'${label}': EMAIL ${n} (trilha geo) linka /ai-audit — trilha errada: a oferta geo e o teste gratis (/test ou raiz)`);
        }
      }
      if (info?.track === "aistack" && n === 2 && !urls.some((u) => /ozvor\.com\/ai-audit\b/i.test(u))) {
        errors.push(`'${label}': EMAIL 2 (trilha aistack) sem o link da oferta /ai-audit?from=${info.campaign}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
