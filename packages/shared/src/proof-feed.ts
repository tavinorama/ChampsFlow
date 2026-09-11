/**
 * proof-feed.ts — the PURE half of the daily proof feed (canal C, founder
 * approval 2026-09-11).
 *
 * THE PROBLEM. sphere-linkedin publishes every day and the posts are CATEGORY
 * posts: true things about a market, with no number of our own behind them.
 * The founder wants the hook to be a measured one:
 *
 *   "I asked ChatGPT who to hire for roofing in Austin. Three names. None of
 *    them was the shop with 4.9 stars and 300 reviews."
 *
 * A hook like that is only honest if the number exists somewhere OUTSIDE the
 * model that wrote the sentence. So the measurement runs first, by code, lands
 * in ops.proof_run, and reaches the graph as the [__proof__] artifact. The
 * post is then allowed to carry only numbers that are already in that block —
 * and that is enforced here, by `validateProofNumbers`, not only asked of a
 * critic.
 *
 * THE ANONYMITY SPLIT (the rule that shapes this file). The target is a real
 * business that never asked to be written about. Its name, domain and e-mail
 * are stored for AUDIT (and so the same business is never measured twice), but
 * `renderProofBlock` never emits them. "Nunca nome de empresa sem
 * consentimento" therefore becomes the SHAPE of the read rather than an
 * instruction a model is trusted to follow. `proofBlockIsAnonymous` exists so
 * a test can assert it, permanently.
 *
 * Pure and dependency-free: importable by the API (prompts, runner), the
 * worker (the job) and the tests, with no I/O anywhere in it.
 */

// ---------------------------------------------------------------------------
// Row shape — mirrors ops.proof_run 1:1.
// ---------------------------------------------------------------------------

export interface ProofEngineResult {
  /** Canonical engine id: 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'serp'. */
  engine: string;
  /** true when a real provider answered (not the deterministic mock). */
  live: boolean;
  /** true when the target business was named in this engine's answer. */
  cited: boolean;
  /** 1-based position of the mention, when cited. */
  position: number | null;
}

/** The public, post-safe half of a proof row. */
export interface ProofFacts {
  /** ISO date (UTC) the measurement was taken. */
  date: string;
  segment: string;
  /** "Austin, TX" */
  city: string;
  /** The exact buyer question asked. */
  prompt: string;
  engines: ProofEngineResult[];
  enginesTotal: number;
  enginesLive: number;
  citedEngines: number;
  targetCited: boolean;
  /** Public Google rating, when the prospect record carried it. */
  targetRating: number | null;
  /** Public Google review count, when the prospect record carried it. */
  targetReviews: number | null;
  /**
   * Businesses the engines DID name, when a conservative code extractor could
   * count them confidently. null = not confidently countable — and then the
   * post may not claim a count of names at all.
   */
  citedNames: string[] | null;
}

/** The audit half — never rendered into a post. */
export interface ProofTargetIdentity {
  domain: string;
  name: string | null;
  email: string | null;
}

export interface ProofRow extends ProofFacts {
  identity: ProofTargetIdentity;
  costCents: number;
}

// ---------------------------------------------------------------------------
// Engines and cost. Explicit, because "custo explícito" is a house rule and a
// number nobody can find is a number nobody can cap.
// ---------------------------------------------------------------------------

/**
 * The engines the daily proof asks. Same five the free test asks, so the
 * number in the post is the number the reader gets when they run /test.
 * An engine without its API key answers in deterministic mock mode; those are
 * dropped from the proof (see `summarizeProofEngines`) because a mock answer
 * is not evidence.
 */
export const PROOF_ENGINES = ["openai", "anthropic", "gemini", "perplexity", "serp"] as const;

/**
 * The honest ceiling for one day's proof, in US cents. One prompt across five
 * engines, single run: the measured ledger rows have come in under this, and
 * the job refuses to run when the month's proof spend has already reached
 * PROOF_MONTHLY_CENTS_CAP. 1 test/day ≈ US$0.90/month.
 */
export const PROOF_DAILY_CENTS_CAP = 8;
/** Hard monthly stop for the whole feature — ~US$1/month, as approved. */
export const PROOF_MONTHLY_CENTS_CAP = 120;

/**
 * A proof needs at least this many LIVE engines to be publishable. One live
 * engine is an anecdote about one vendor's index, not a claim about "AI".
 */
export const PROOF_MIN_LIVE_ENGINES = 3;

// ---------------------------------------------------------------------------
// Segment vocabulary — the local-services US ICP, verbatim from
// docs/departments/sales/icp.md (segment B, local-services flavor). A fixed
// list, never a model's idea of what our ICP is.
// ---------------------------------------------------------------------------

export interface ProofSegment {
  /** Stable id stored in ops.proof_run.segment. */
  id: string;
  /** How the buyer phrases it inside the question ("a roofer"). */
  buyerNoun: string;
  /** How the post names the trade ("roofing"). */
  label: string;
  /** Lower-cased keywords that identify the trade in public page text. */
  keywords: string[];
}

export const PROOF_SEGMENTS: readonly ProofSegment[] = [
  { id: "roofing", buyerNoun: "a roofer", label: "roofing", keywords: ["roofing", "roofer", "roof repair", "re-roof"] },
  { id: "hvac", buyerNoun: "an HVAC company", label: "HVAC", keywords: ["hvac", "air conditioning", "heating and cooling", "furnace repair"] },
  { id: "plumbing", buyerNoun: "a plumber", label: "plumbing", keywords: ["plumbing", "plumber", "drain cleaning", "water heater"] },
  { id: "electrical", buyerNoun: "an electrician", label: "electrical work", keywords: ["electrician", "electrical contractor", "rewiring"] },
  { id: "dental", buyerNoun: "a dentist", label: "dentistry", keywords: ["dental", "dentist", "orthodont", "invisalign"] },
  { id: "physio", buyerNoun: "a physical therapist", label: "physical therapy", keywords: ["physical therapy", "physiotherapy", "sports rehab"] },
  { id: "med_spa", buyerNoun: "a med spa", label: "med spa treatments", keywords: ["med spa", "medspa", "botox", "aesthetics clinic"] },
  { id: "law", buyerNoun: "a lawyer", label: "legal help", keywords: ["law firm", "attorney", "lawyer", "personal injury"] },
  { id: "landscaping", buyerNoun: "a landscaper", label: "landscaping", keywords: ["landscaping", "lawn care", "hardscape"] },
  { id: "pest_control", buyerNoun: "a pest control company", label: "pest control", keywords: ["pest control", "exterminator", "termite"] },
] as const;

export function segmentById(id: string): ProofSegment | null {
  return PROOF_SEGMENTS.find((s) => s.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Deriving WHERE and WHAT from public data — code only, never a model.
//
// The target comes from the outbound pool, which stores a website but not a
// city or a trade. Both are readable from the business's own public homepage:
// LocalBusiness JSON-LD says them outright, and a title/description says them
// often enough. When neither does, the answer is "no proof today" — which is
// the fail-open the founder asked for, not a guess.
// ---------------------------------------------------------------------------

/** US state/territory codes, so "in Austin, TX" parses and "in Austin, Texas" does not silently pass as a code. */
const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","PR",
]);

/** Title-case a locality the way a post would write it ("fort worth" → "Fort Worth"). */
function titleCaseLocality(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length <= 2 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/**
 * Read "Austin, TX" out of a business's own public homepage.
 *
 * Order of trust, highest first:
 *  1. JSON-LD PostalAddress — the business asserting its own address in
 *     machine-readable form. This is the same markup our audit already reads.
 *  2. A "City, ST" pair in the <title> or meta description, which is how local
 *     businesses have written page titles for twenty years.
 *
 * Returns null rather than guessing. A wrong city makes the whole post a lie.
 */
export function deriveLocality(html: string | null | undefined): string | null {
  if (!html) return null;

  // 1 — JSON-LD PostalAddress. Deliberately regex over the raw script bodies
  // rather than a JSON parse: real pages ship truncated, multi-block and
  // slightly invalid JSON-LD, and a parse failure would throw away a perfectly
  // readable address.
  const ldBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of ldBlocks) {
    const body = block[1] ?? "";
    const locality = /"addressLocality"\s*:\s*"([^"]{2,60})"/i.exec(body)?.[1];
    const regionRaw = /"addressRegion"\s*:\s*"([^"]{2,30})"/i.exec(body)?.[1];
    if (locality && regionRaw) {
      const region = regionRaw.trim().toUpperCase();
      if (US_STATES.has(region)) return `${titleCaseLocality(locality)}, ${region}`;
    }
  }

  // 2 — "City, ST" inside the title or the meta description.
  const title = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html)?.[1] ?? "";
  const desc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,400})["']/i.exec(html)?.[1] ?? "";
  for (const text of [title, desc]) {
    const m = /([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}),\s*([A-Z]{2})(?![A-Za-z])/.exec(text);
    if (m && US_STATES.has(m[2]!)) return `${titleCaseLocality(m[1]!)}, ${m[2]!}`;
  }
  return null;
}

/**
 * Decide which ICP trade a target belongs to, from public text: the category
 * the prospect source recorded, plus the homepage's own title/description/
 * JSON-LD. First segment whose keyword appears wins; ties are impossible
 * because PROOF_SEGMENTS is ordered and the scan stops at the first hit.
 *
 * Returns null when nothing matches — the target is then simply not today's
 * proof, and the next candidate is tried.
 */
export function deriveSegment(input: { category?: string | null; html?: string | null }): ProofSegment | null {
  const haystackParts: string[] = [];
  if (input.category) haystackParts.push(input.category);
  const html = input.html ?? "";
  if (html) {
    haystackParts.push(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html)?.[1] ?? "");
    haystackParts.push(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,400})["']/i.exec(html)?.[1] ?? "");
    for (const m of html.matchAll(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/gi)) haystackParts.push(m[1] ?? "");
  }
  const haystack = haystackParts.join(" \n ").toLowerCase().replace(/<[^>]+>/g, " ");
  if (!haystack.trim()) return null;
  for (const seg of PROOF_SEGMENTS) {
    if (seg.keywords.some((k) => haystack.includes(k))) return seg;
  }
  return null;
}

/**
 * The buyer question the engines are asked. Deliberately the question a real
 * person types, not a brand-shaped one: the target's name is NEVER sent to a
 * provider (the same GEO-A2 rule the free test follows), so the answer is the
 * unbiased market answer and "the target was not in it" means something.
 */
export function buildProofPrompt(segment: ProofSegment, city: string): string {
  return `Who do you recommend for ${segment.label} in ${city}? Name specific local businesses.`;
}

// ---------------------------------------------------------------------------
// Counting the names an engine DID recommend.
//
// The founder's hook wants "three names". Counting names out of free prose is
// exactly the kind of thing that quietly invents a number, so this extractor is
// deliberately timid: it counts ONLY an explicit enumeration (a numbered or
// bulleted list, or bolded headings) and returns null for anything else. null
// means the post may not claim a name count that day — it falls back to the
// engine count, which is always exact.
// ---------------------------------------------------------------------------

/** Strip markdown emphasis/links so a name compares cleanly. */
function cleanName(s: string): string {
  return s
    .replace(/\[([^\]]{1,80})\]\([^)]*\)/g, "$1")
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:–—-]+$/, "")
    .trim();
}

/** A plausible business name: 1-6 words, starts with a capital, not a sentence. */
function looksLikeBusinessName(s: string): boolean {
  if (s.length < 3 || s.length > 60) return false;
  if (!/^[A-Z0-9]/.test(s)) return false;
  const words = s.split(/\s+/);
  if (words.length > 6) return false;
  // A trailing verb-ish clause means we grabbed a sentence, not a name.
  if (/\b(is|are|offers|provides|has|can|will|should|they|we|you)\b/i.test(s)) return false;
  return true;
}

/**
 * Count the distinct businesses an answer explicitly enumerates.
 * Returns null when the answer is not an explicit list — never a guess.
 */
export function extractRecommendedNames(raw: string | null | undefined): string[] | null {
  if (!raw || raw.trim().length === 0) return null;
  const names: string[] = [];
  for (const line of raw.split("\n")) {
    // "1. Acme Roofing", "- Acme Roofing", "* **Acme Roofing**"
    const m = /^\s{0,6}(?:\d{1,2}[.)]|[-*•])\s+(.{2,120})$/.exec(line);
    if (!m) continue;
    // The name is whatever precedes the first separator (— , : , –) on the item.
    const head = cleanName((m[1] ?? "").split(/\s[—–-]\s|:\s/)[0] ?? "");
    if (!looksLikeBusinessName(head)) continue;
    if (!names.some((n) => n.toLowerCase() === head.toLowerCase())) names.push(head);
  }
  // Fewer than two enumerated names is not an enumeration we can stand behind.
  return names.length >= 2 ? names : null;
}

// ---------------------------------------------------------------------------
// Summarizing a day's probes into facts.
// ---------------------------------------------------------------------------

export interface ProofProbeInput {
  engine: string;
  live: boolean;
  rawText: string;
  cited: boolean;
  position: number | null;
}

/**
 * Fold one prompt's per-engine answers into the publishable facts.
 *
 * MOCK ANSWERS ARE DROPPED. An engine without its key answers deterministically
 * and would otherwise contribute a fake "not cited" to the headline number —
 * the exact class of bug that produced the always-89 audit score. So the counts
 * here are over LIVE engines only, and `enginesTotal` says how many were asked.
 */
export function summarizeProofEngines(probes: ProofProbeInput[]): {
  engines: ProofEngineResult[];
  enginesTotal: number;
  enginesLive: number;
  citedEngines: number;
  targetCited: boolean;
  citedNames: string[] | null;
} {
  const engines: ProofEngineResult[] = probes.map((p) => ({
    engine: p.engine,
    live: p.live,
    cited: p.live ? p.cited : false,
    position: p.live && p.cited ? p.position : null,
  }));
  const live = probes.filter((p) => p.live);
  const citedEngines = live.filter((p) => p.cited).length;

  // Name counting uses the answer from the live engine that enumerated the
  // most names — one clear list beats averaging across differently-shaped
  // answers, and the block records which engine it came from.
  let citedNames: string[] | null = null;
  for (const p of live) {
    const found = extractRecommendedNames(p.rawText);
    if (found && (!citedNames || found.length > citedNames.length)) citedNames = found;
  }

  return {
    engines,
    enginesTotal: probes.length,
    enginesLive: live.length,
    citedEngines,
    targetCited: citedEngines > 0,
    citedNames,
  };
}

/** Is this measurement strong enough to open a public post with? */
export function proofIsPublishable(facts: Pick<ProofFacts, "enginesLive">): boolean {
  return facts.enginesLive >= PROOF_MIN_LIVE_ENGINES;
}

// ---------------------------------------------------------------------------
// The [__proof__] block.
// ---------------------------------------------------------------------------

/** The campaign tag for a given proof date: li-proof-YYYY-MM-DD. */
export function proofCampaignTag(date: string): string {
  return `li-proof-${date.slice(0, 10)}`;
}

/** The exact /test link the post must carry. */
export function proofTestLink(date: string): string {
  return `https://ozvor.com/test?from=${proofCampaignTag(date)}`;
}

/** Does a captured `?from=` value belong to the LinkedIn proof channel? */
export function isProofCampaign(from: string | null | undefined): boolean {
  return typeof from === "string" && /^li-proof-\d{4}-\d{2}-\d{2}$/.test(from.trim());
}

/** SQL LIKE pattern for the funnel reads. Kept next to the producer on purpose. */
export const PROOF_CAMPAIGN_LIKE = "li-proof-%";

/**
 * Render the day's measurement for the graph.
 *
 * Everything the post is allowed to say about the target is in here, and
 * nothing that identifies it is. The numbers are written out both as figures
 * and as the sentence they support, because a model handed raw fields invents
 * the sentence — and inventing the sentence is how a "4 of 5" becomes "almost
 * nobody".
 */
export function renderProofBlock(facts: ProofFacts): string {
  const seg = segmentById(facts.segment);
  const label = seg?.label ?? facts.segment;
  const lines: string[] = [
    `PROVA REAL DO DIA (medida por codigo em ${facts.date}, gravada em ops.proof_run — NAO e estimativa).`,
    `Esta e a UNICA fonte de numero que o post pode usar. Numero que nao esta aqui NAO entra no post.`,
    ``,
    `Pergunta feita aos motores, literal: "${facts.prompt}"`,
    `Setor: ${label} · Cidade: ${facts.city}`,
    `Motores consultados: ${facts.enginesTotal} · responderam ao vivo: ${facts.enginesLive}`,
    `Motores que citaram o negocio alvo: ${facts.citedEngines} de ${facts.enginesLive}`,
  ];
  if (facts.citedNames && facts.citedNames.length > 0) {
    lines.push(
      `Quantos negocios os motores NOMEARAM na melhor resposta: ${facts.citedNames.length} (contagem por codigo, lista explicita).`
    );
  } else {
    lines.push(
      `Quantos negocios os motores nomearam: NAO CONTAVEL com honestidade hoje. NAO afirme numero de nomes neste post.`
    );
  }
  if (facts.targetRating != null || facts.targetReviews != null) {
    const bits: string[] = [];
    if (facts.targetRating != null) bits.push(`${facts.targetRating} estrelas`);
    if (facts.targetReviews != null) bits.push(`${facts.targetReviews} avaliacoes`);
    lines.push(`Reputacao publica do alvo (Google, dado publico): ${bits.join(" e ")}.`);
  } else {
    lines.push(`Reputacao publica do alvo: SEM DADO. NAO invente estrelas nem numero de avaliacoes.`);
  }
  lines.push(
    ``,
    `A FRASE QUE ESTES NUMEROS SUSTENTAM (use-a como base, reescreva na sua voz, nao mude os numeros):`,
    proofHookSentence(facts),
    ``,
    `ANONIMATO — REGRA DURA: o negocio alvo NAO consentiu em ser citado. NUNCA escreva o nome dele,`,
    `o site dele, o telefone dele, nem nada que o identifique. Ele e "${label} em ${facts.city}" e mais nada.`,
    `Tambem NAO nomeie os concorrentes que a IA citou. Segmento + cidade + numero: so isso.`,
    `LINK: ${proofTestLink(facts.date)} — exatamente assim, com o ?from=.`,
  );
  return lines.join("\n");
}

/**
 * The one sentence the day's numbers actually support, built by code. The
 * draft prompt rewrites it in the channel's voice; the numbers inside it are
 * the only ones that may survive that rewrite.
 */
export function proofHookSentence(facts: ProofFacts): string {
  const seg = segmentById(facts.segment);
  const label = seg?.label ?? facts.segment;
  const namesPart =
    facts.citedNames && facts.citedNames.length > 0
      ? `It named ${facts.citedNames.length} businesses.`
      : `It named specific businesses.`;
  const repPart =
    facts.targetRating != null && facts.targetReviews != null
      ? ` — not even the one with ${facts.targetRating} stars and ${facts.targetReviews} reviews`
      : facts.targetReviews != null
        ? ` — not even the one with ${facts.targetReviews} reviews`
        : "";
  if (facts.targetCited) {
    return `I asked ${facts.enginesLive} AI engines who to hire for ${label} in ${facts.city}. ${namesPart} ${facts.citedEngines} of ${facts.enginesLive} engines named the local business I was checking${repPart ? repPart.replace(" — not even", " — including") : ""}.`;
  }
  return `I asked ${facts.enginesLive} AI engines who to hire for ${label} in ${facts.city}. ${namesPart} Zero of ${facts.enginesLive} named the local business I was checking${repPart}.`;
}

/**
 * Is a rendered block free of everything that identifies the target? Exported
 * so the guarantee is a test, not a comment.
 */
export function proofBlockIsAnonymous(block: string, identity: ProofTargetIdentity): boolean {
  const hay = block.toLowerCase();
  const secrets = [identity.domain, identity.name, identity.email].filter(
    (s): s is string => typeof s === "string" && s.trim().length > 2
  );
  // Compare the registrable label too: "acmeroofing.com" leaking as "Acme Roofing".
  for (const s of secrets) {
    const needle = s.toLowerCase().trim();
    if (hay.includes(needle)) return false;
    const bare = needle.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]?.split(".")[0] ?? "";
    if (bare.length >= 5 && hay.includes(bare)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The code gate: a number in the post must exist in the proof.
//
// A critic prompt that says "veto numbers without proof" is a request. This is
// the enforcement: it runs on the finalize artifact via the runner's
// config.validate hook, so a post carrying an invented figure FAILS the step
// and never reaches the founder's approval message.
// ---------------------------------------------------------------------------

/** Numbers that are part of writing, not claims: years, the link's date, ordinals. */
const NUMBER_NOISE = /^(19|20)\d{2}$/;

/** Every distinct number token in a text, as written. */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?%?/g)) {
    const tok = m[0]!;
    if (!out.includes(tok)) out.push(tok);
  }
  return out;
}

/** Small English number words a post will naturally use for the same facts. */
const WORD_NUMBERS: Record<string, number> = {
  zero: 0, none: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * The set of numeric values the day's proof licenses. Anything else in the post
 * is either an invention or a claim we cannot back, and both are the same
 * problem for us.
 */
export function allowedProofNumbers(facts: ProofFacts): Set<string> {
  const allowed = new Set<string>();
  const add = (n: number | null | undefined): void => {
    if (n == null || !Number.isFinite(n)) return;
    allowed.add(String(n));
    // 4.9 and 4,9 are the same claim; so are "300" and "300".
    allowed.add(String(n).replace(".", ","));
  };
  add(facts.enginesTotal);
  add(facts.enginesLive);
  add(facts.citedEngines);
  add(facts.targetRating);
  add(facts.targetReviews);
  if (facts.citedNames) add(facts.citedNames.length);
  for (const e of facts.engines) add(e.position);
  // The link's own date parts are typography, not claims.
  for (const part of facts.date.split("-")) allowed.add(part.replace(/^0+/, "") || "0");
  for (const part of facts.date.split("-")) allowed.add(part);
  return allowed;
}

export interface ProofNumberCheck {
  ok: boolean;
  /** Number tokens present in the post that the proof does not license. */
  unbacked: string[];
}

/**
 * Check a finished post against the day's proof.
 *
 * Scope note, stated honestly: this catches FABRICATED FIGURES, which is the
 * failure the founder named. It does not judge whether a sentence built from
 * licensed numbers is a fair reading of them — that stays the critic's job and
 * the founder's approval. Years (1999-2099) are treated as prose, and the
 * campaign link is excluded before scanning so `?from=li-proof-2026-09-11`
 * cannot fail its own post.
 */
export function validateProofNumbers(post: string, facts: ProofFacts | null): ProofNumberCheck {
  // No proof today = the post is a normal category post; there is nothing to
  // check it against, and blocking it would break the fail-open contract.
  if (!facts) return { ok: true, unbacked: [] };
  const allowed = allowedProofNumbers(facts);
  // Strip URLs first: a link is an address, not an assertion.
  const prose = post.replace(/https?:\/\/\S+/g, " ").replace(/\bozvor\.com\S*/gi, " ");
  const unbacked: string[] = [];
  for (const tok of numbersIn(prose)) {
    const bare = tok.replace(/%$/, "");
    if (allowed.has(bare) || allowed.has(bare.replace(",", "."))) continue;
    if (NUMBER_NOISE.test(bare)) continue;
    unbacked.push(tok);
  }
  // Word-numbers make the same claim as digits ("three names").
  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    const re = new RegExp(`(^|[^A-Za-z])${word}(?=[^A-Za-z]|$)`, "i");
    if (!re.test(prose)) continue;
    // "none of them" / "zero" are only claims when they quantify; both map to 0,
    // which the proof licenses whenever citedEngines is 0.
    if (!allowed.has(String(value))) unbacked.push(word);
  }
  return { ok: unbacked.length === 0, unbacked };
}

// ---------------------------------------------------------------------------
// Target selection — deterministic, and rotating by construction.
// ---------------------------------------------------------------------------

export interface ProofCandidate {
  /** crm_contact key. */
  email: string;
  /** Public business website. */
  website: string;
  /** Business name, when the prospect note recorded it. */
  name: string | null;
  /** Category string from the prospect source, when present. */
  category: string | null;
  rating: number | null;
  reviews: number | null;
}

/** FNV-1a — a stable, dependency-free hash so "deterministic" survives restarts. */
export function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Order the untouched pool for a given day. Same day + same pool = same order,
 * every time; different day = a different order, so the feed rotates through
 * the pool instead of hammering whoever sorts first alphabetically.
 */
export function orderCandidatesForDay(candidates: ProofCandidate[], date: string): ProofCandidate[] {
  return [...candidates].sort(
    (a, b) => stableHash(`${date}:${a.email}`) - stableHash(`${date}:${b.email}`) || a.email.localeCompare(b.email)
  );
}

/**
 * Has this (segment, city) pair already been the proof inside the window? The
 * anti-generic rule applies to the FACTS as much as to the prose: seven
 * roofing-in-Austin posts in a row is the repetition the founder complained
 * about, arriving through a different door.
 */
export const PROOF_PAIR_REPEAT_DAYS = 7;

export function pairIsFresh(
  pair: { segment: string; city: string },
  recent: Array<{ segment: string; city: string }>
): boolean {
  return !recent.some(
    (r) => r.segment === pair.segment && r.city.toLowerCase() === pair.city.toLowerCase()
  );
}
