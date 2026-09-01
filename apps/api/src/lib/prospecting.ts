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

export interface CandidateBusiness {
  name: string;
  /** Normalized absolute URL (https:// prepended when the engine omitted it). */
  website: string;
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

/** Campaign slug for the run — the ?from= value of emails 2+ (never email 1). */
export function campaignSlug(d: Date): string {
  return `cold-${d.toISOString().slice(0, 10)}`;
}

export interface VerifiedProspect {
  name: string;
  website: string;
  /** Code-extracted from the site's own HTML, or null (no CRM row possible). */
  email: string | null;
  /** 1-3 code-verified findings — the discovery-audit ammunition. */
  findings: string[];
}

export interface DroppedCandidate {
  name: string;
  website: string;
  reason: string;
}

/** Sentinel first line of a batch with zero verified prospects — honest empty. */
export const EMPTY_BATCH_SENTINEL = "SEM PROSPECTS VERIFICADOS NESTA RODADA";

/**
 * Render the verified batch as the [prospects] artifact — the single source
 * of truth downstream: the draft prompt reads it, the approval box shows it,
 * and the CRM store PARSES THIS BLOCK (never the LLM output) for contacts.
 */
export function renderProspectBlock(input: {
  campaign: string;
  icpSource: string;
  listed: number;
  verified: VerifiedProspect[];
  dropped: DroppedCandidate[];
}): string {
  const lines: string[] = [];
  if (input.verified.length === 0) {
    lines.push(`${EMPTY_BATCH_SENTINEL} — engines listaram ${input.listed} candidato(s), 0 passaram na verificacao de codigo.`);
  } else {
    lines.push("LOTE DE PROSPECCAO (verificado por CODIGO — site respondeu 200, nome confere no HTML; nada abaixo e palpite de LLM)");
  }
  lines.push(`CAMPANHA: ${input.campaign}`);
  lines.push(`ICP: ${input.icpSource}`);
  lines.push(
    `CANDIDATOS LISTADOS PELOS ENGINES: ${input.listed} · VERIFICADOS: ${input.verified.length} · DESCARTADOS: ${input.dropped.length}`
  );
  for (const p of input.verified) {
    lines.push("");
    lines.push(`=== PROSPECT: ${p.name} ===`);
    lines.push(`SITE: ${p.website}`);
    lines.push(`EMAIL: ${p.email ?? "SEM EMAIL VERIFICADO"}`);
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

export interface CrmProspectContact {
  email: string;
  name: string;
  website: string;
  finding: string;
}

/**
 * Parse the code-generated [prospects] block back into CRM rows — the store
 * step reads THIS (config.contactsNode), never the LLM's sequences, so a
 * model rewrite can never alter what lands in crm_contact. Only prospects
 * whose EMAIL line is a real address become contacts.
 */
export function parseProspectsForCrm(block: string): { campaign: string; contacts: CrmProspectContact[] } {
  const campaign = /^CAMPANHA:\s*(\S+)/m.exec(block)?.[1] ?? "cold-unknown";
  const contacts: CrmProspectContact[] = [];
  const sections = block.split(/^=== PROSPECT:\s*/m).slice(1);
  for (const section of sections) {
    const name = section.split("===")[0]?.trim() ?? "";
    const website = /^SITE:\s*(\S+)/m.exec(section)?.[1] ?? "";
    const emailRaw = /^EMAIL:\s*(.+)$/m.exec(section)?.[1]?.trim() ?? "";
    const finding = /^-\s*(.+)$/m.exec(section.split("ACHADOS")[1] ?? "")?.[1]?.trim() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailRaw)) continue;
    contacts.push({ email: emailRaw.toLowerCase(), name, website, finding });
  }
  return { campaign, contacts };
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
 * The exact-sentinel empty batch ("SEM PROSPECTS VERIFICADOS...") is VALID:
 * an honest nothing beats an invented prospect.
 */
export function validateColdSequenceBatch(text: string): SequenceValidation {
  const errors: string[] = [];
  const trimmed = text.trim();
  if (trimmed.startsWith(EMPTY_BATCH_SENTINEL)) return { ok: true, errors };
  const sequences = splitProspectSequences(trimmed);
  if (sequences.length === 0) {
    return { ok: false, errors: ["nenhum bloco '=== PROSPECT: ... ===' encontrado no lote"] };
  }
  for (const seq of sequences) {
    const label = seq.prospect || "(sem nome)";
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
      for (const url of ozvorUrlsIn(`${email.subject ?? ""}\n${email.body}`)) {
        if (!/[?&]from=/.test(url)) {
          errors.push(`'${label}': EMAIL ${n} tem link ozvor.com sem ?from=<campanha> — atribuicao obrigatoria do 2o toque em diante`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
