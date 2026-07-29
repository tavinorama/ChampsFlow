/**
 * extraction.ts — B3 · Two-pass citation extraction with a BLIND verifier.
 *
 * WHY (the problem this fixes):
 *   Single-pass extraction (citation-parser.ts) counts a citation whenever the
 *   brand token appears in the answer text. That produces false positives that
 *   inflate the Visibility score with things that are not citations:
 *     - negation      — "I would not recommend Acme for this"
 *     - homonym       — "Acme Corp" (the 1940s cartoon prop maker), not the client
 *     - source-only   — the brand appears solely inside a URL/footnote
 *     - neutral       — the brand is listed in a comparison, never recommended
 *
 * HOW (the protocol):
 *   PASS 1 — EXTRACTOR: one cheap LLM call per answer. Returns every candidate
 *            mention of the client brand or a competitor, with the exact text,
 *            its character offsets, the entity it refers to, and a `kind`.
 *   PASS 2 — BLIND VERIFIER: one cheap LLM call per candidate mention. The
 *            verifier sees the answer text and ONE candidate (text + offsets +
 *            entity) and NOTHING about the extractor's conclusion, then votes
 *            VERIFIED / REJECTED and classifies the kind itself. It rejects
 *            homonyms, negations, hallucinated mentions and offsets that do not
 *            match the real text.
 *
 * COST RULES (hard):
 *   - The verifier NEVER runs on an empty answer or on zero mentions.
 *   - At most MAX_VERIFIED_MENTIONS (8) mentions are verified per answer. The
 *     remainder are returned with verdict "UNVERIFIED_CAP" and an explicit
 *     reason — never silently dropped. Client-brand mentions are verified first.
 *   - A candidate whose text is absent from the answer is rejected LOCALLY
 *     (no LLM call) — the deterministic check is free and exact.
 *
 * FAILURE MODES (the audit must never break):
 *   - Extractor returns malformed JSON → 1 retry with a corrective instruction
 *     → still malformed (or no LLM key at all) → extraction_mode
 *     "fallback_single_pass" using the legacy parseCitation() behaviour.
 *   - Offsets that do not match → recomputed by searching for text_exact; if
 *     the text is genuinely absent the mention is REJECTED with that reason.
 *   - Verifier throws / times out / returns junk → the mention stays
 *     "UNVERIFIED" with the reason, and the audit continues.
 *
 * Rollback: GEO_TWO_PASS_EXTRACTION=0 → old single-pass behaviour
 * (same pattern as GEO_WEB_SEARCH and GEO_PROBE_CACHE).
 *
 * Privacy: input is the engine's own answer text (synthetic category answer,
 * no PII by construction) plus brand/competitor names. Nothing here is logged
 * or persisted — the caller stores aggregates only.
 */

import { parseCitation } from "./citation-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MentionKind =
  | "direct_recommendation"
  | "neutral_mention"
  | "cited_source"
  | "negative_mention";

export type MentionVerdict =
  /** The blind verifier confirmed it is a real mention of that company. */
  | "VERIFIED"
  /** The blind verifier rejected it (homonym, negation, hallucination, bad offset). */
  | "REJECTED"
  /** Verification could not run (verifier error/timeout/junk). Fail-open. */
  | "UNVERIFIED"
  /** Beyond the per-answer verification cap. Kept, never silently dropped. */
  | "UNVERIFIED_CAP";

/** A candidate mention as produced by PASS 1 (the extractor). */
export interface Mention {
  /** Verbatim substring of the answer text. */
  text_exact: string;
  /** 0-based inclusive start offset into the answer text. */
  offset_start: number;
  /** 0-based exclusive end offset into the answer text. */
  offset_end: number;
  /** Canonical entity the mention refers to (client brand or a competitor). */
  entity: string;
  kind: MentionKind;
  /** Present when the mention is (or hangs off) a URL. */
  url?: string;
}

/** A candidate mention after PASS 2 (the blind verifier). */
export interface VerifiedMention extends Mention {
  verdict: MentionVerdict;
  /** One-line justification (verifier's or the local check's). */
  reason: string;
  /** The verifier's own classification. Falls back to the extractor's kind
   *  when verification did not run (UNVERIFIED / UNVERIFIED_CAP). */
  kind_confirmed: MentionKind;
}

export type ExtractionMode =
  | "two_pass"
  | "fallback_single_pass"
  | "disabled";

export interface ExtractionResult {
  mentions: VerifiedMention[];
  verified_count: number;
  rejected_count: number;
  methodology_version: string;
  /** Which path actually produced these mentions. */
  extraction_mode: ExtractionMode;
  /**
   * Convenience for the scorer: does a CITING mention of the client brand
   * survive? A citing mention is kind direct_recommendation or cited_source
   * whose verdict is not REJECTED. neutral_mention and negative_mention are
   * NOT citations.
   * In fallback/disabled mode this mirrors the legacy single-pass boolean.
   */
  brand_cited: boolean;
  /** LLM calls this extraction consumed (cost telemetry). */
  llm_calls: number;
  /** Why the run degraded, when it did. Empty in the happy path. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Constants / flag
// ---------------------------------------------------------------------------

/**
 * Extraction protocol identity. Bumped with GEO_METHODOLOGY_VERSION when the
 * meaning of a "citation" changes (it did: B3 dropped neutral/negative
 * mentions from the citation count).
 */
export const EXTRACTION_METHODOLOGY_VERSION = "1.0";

/** Hard per-answer verification budget (cost rule). */
export const MAX_VERIFIED_MENTIONS = 8;

/** Kinds that count as an actual citation for the score. */
const CITING_KINDS: ReadonlySet<MentionKind> = new Set<MentionKind>([
  "direct_recommendation",
  "cited_source",
]);

const ALL_KINDS: ReadonlySet<string> = new Set([
  "direct_recommendation",
  "neutral_mention",
  "cited_source",
  "negative_mention",
]);

/**
 * GEO_TWO_PASS_EXTRACTION default ON; "0" rolls back to single-pass
 * (same convention as GEO_WEB_SEARCH / GEO_PROBE_CACHE).
 */
export function twoPassExtractionEnabled(): boolean {
  return process.env["GEO_TWO_PASS_EXTRACTION"] !== "0";
}

/** True when a mention counts as a citation for scoring purposes. */
export function countsAsCitation(m: VerifiedMention): boolean {
  return m.verdict !== "REJECTED" && CITING_KINDS.has(m.kind_confirmed);
}

// ---------------------------------------------------------------------------
// LLM plumbing (injectable — tests never hit the network)
// ---------------------------------------------------------------------------

export interface ExtractionLLMRequest {
  system: string;
  user: string;
  maxTokens: number;
}

/** Returns the model's raw text answer (expected to be JSON). */
export type ExtractionLLM = (req: ExtractionLLMRequest) => Promise<string>;

export class ExtractionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionUnavailableError";
  }
}

/**
 * Default extraction model = the CHEAP tier, same precedence convention as the
 * audit probe adapters (AUDIT_<P>_MODEL → legacy <P>_MODEL → cheap default).
 * These two passes are classification, not generation — a frontier model would
 * multiply the audit cost for no measurable gain.
 *
 * AUDIT_EXTRACTION_MODEL overrides everything.
 * Anthropic is preferred (v1 default provider, DPA CONFIRMED); OpenAI is the
 * fallback when only that key exists. With no key at all we throw so the caller
 * degrades to single-pass instead of fabricating a verdict.
 */
export const defaultExtractionLLM: ExtractionLLM = async (req) => {
  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  const openaiKey = process.env["OPENAI_API_KEY"];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    if (anthropicKey) {
      const model =
        process.env["AUDIT_EXTRACTION_MODEL"] ??
        process.env["AUDIT_ANTHROPIC_MODEL"] ??
        "claude-haiku-4-5";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens,
          temperature: 0,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic HTTP ${res.status}`);
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      return (data.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
    }

    if (openaiKey) {
      const model =
        process.env["AUDIT_EXTRACTION_MODEL"] ??
        process.env["AUDIT_OPENAI_MODEL"] ??
        "gpt-4o-mini";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens,
          temperature: 0,
          // Structured output where the provider supports it (OpenAI): forces a
          // JSON object, which removes the "model wrapped it in prose" failure.
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`openai HTTP ${res.status}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content ?? "";
    }

    throw new ExtractionUnavailableError(
      "no extraction model key present (ANTHROPIC_API_KEY / OPENAI_API_KEY)"
    );
  } finally {
    clearTimeout(timer);
  }
};

// ---------------------------------------------------------------------------
// Prompts (English — the answers we analyse are English-first)
// ---------------------------------------------------------------------------

const EXTRACTOR_SYSTEM = `You are the extraction pass of a brand-citation audit.

You receive: (a) the verbatim answer text produced by an AI search engine,
(b) the CLIENT brand name, (c) a list of COMPETITOR brand names.

Find every place where the client brand or any competitor is referred to.

Answer with a single JSON object and NOTHING else (no prose, no markdown fence):
{"mentions":[{"text_exact":"...","offset_start":0,"offset_end":0,"entity":"...","kind":"direct_recommendation","url":"https://..."}]}

Field rules:
- text_exact: copied character-for-character from the answer text. Never paraphrase.
- offset_start / offset_end: 0-based character indices such that
  answer.slice(offset_start, offset_end) === text_exact.
- entity: the canonical brand name this mention refers to. Use one of the names
  you were given. Never a person's name.
- kind, exactly one of:
  * "direct_recommendation" - the answer recommends, endorses or presents the
    entity as a good option for the user's need.
  * "neutral_mention" - the entity is merely named, listed or described without
    endorsement.
  * "cited_source" - the entity appears only as the source of the information
    (a URL, a footnote, "according to <entity>").
  * "negative_mention" - the answer advises against the entity, criticises it,
    or says it does not fit the need.
- url: include ONLY when the mention is, or is attached to, a URL.

Hard rules:
- NEVER invent a mention. If neither the client brand nor any competitor
  appears, answer {"mentions":[]}.
- A company with a similar name that is clearly a DIFFERENT organisation is
  still reported, with entity set to what the text actually names.`;

const VERIFIER_SYSTEM = `You are the blind verification pass of a brand-citation audit.

You receive the verbatim answer text produced by an AI search engine and ONE
candidate mention: its exact text, its character offsets and the company it is
claimed to refer to. You do NOT know how the previous pass classified it, and
you must decide independently.

Answer with a single JSON object and NOTHING else:
{"verdict":"VERIFIED","reason":"one short line","kind_confirmed":"direct_recommendation"}

verdict must be "VERIFIED" or "REJECTED". kind_confirmed must be one of
"direct_recommendation", "neutral_mention", "cited_source", "negative_mention".

REJECT when any of these is true:
1. HALLUCINATION - the quoted text does not appear in the answer at all.
2. WRONG OFFSET - the quoted text is not what sits at the stated offsets.
3. HOMONYM - the text names a DIFFERENT organisation (or a person, place or
   ordinary word) that merely resembles the claimed company.
4. NEGATION - the answer advises against the company, says it does not fit, or
   otherwise refuses to recommend it ("I would not recommend X", "X does not
   serve this need"). Set kind_confirmed to "negative_mention" in this case.

Otherwise VERIFY, and classify kind_confirmed yourself:
- "direct_recommendation" when the answer recommends or endorses the company.
- "cited_source" when the company only appears as the source of information.
- "neutral_mention" when it is named without endorsement.

reason must be ONE short line stating the deciding fact.`;

const JSON_REPAIR_SUFFIX =
  "\n\nYour previous answer was not valid JSON. Answer again with ONLY the JSON object described above, starting with { and ending with }. No prose, no markdown fence.";

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

/** Strip markdown fences and grab the outermost JSON object. */
function extractJsonObject(raw: string): unknown {
  const text = (raw ?? "").trim();
  if (!text) throw new Error("empty response");
  const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(fenced.slice(start, end + 1));
}

function asKind(v: unknown, fallback: MentionKind): MentionKind {
  return typeof v === "string" && ALL_KINDS.has(v) ? (v as MentionKind) : fallback;
}

function parseExtractorPayload(raw: string): Mention[] {
  const obj = extractJsonObject(raw) as { mentions?: unknown };
  if (!obj || typeof obj !== "object") throw new Error("payload is not an object");
  const list = obj.mentions;
  if (!Array.isArray(list)) throw new Error("mentions is not an array");

  const out: Mention[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const textExact = typeof m["text_exact"] === "string" ? m["text_exact"] : "";
    const entity = typeof m["entity"] === "string" ? m["entity"] : "";
    if (!textExact || !entity) continue; // unusable candidate — drop it
    const startRaw = Number(m["offset_start"]);
    const endRaw = Number(m["offset_end"]);
    const mention: Mention = {
      text_exact: textExact,
      offset_start: Number.isFinite(startRaw) ? Math.max(0, Math.floor(startRaw)) : -1,
      offset_end: Number.isFinite(endRaw) ? Math.max(0, Math.floor(endRaw)) : -1,
      entity,
      kind: asKind(m["kind"], "neutral_mention"),
    };
    if (typeof m["url"] === "string" && m["url"]) mention.url = m["url"];
    out.push(mention);
  }
  return out;
}

interface VerifierPayload {
  verdict: "VERIFIED" | "REJECTED";
  reason: string;
  kind_confirmed: MentionKind;
}

function parseVerifierPayload(raw: string, fallbackKind: MentionKind): VerifierPayload {
  const obj = extractJsonObject(raw) as Record<string, unknown>;
  const verdictRaw = typeof obj["verdict"] === "string" ? obj["verdict"].toUpperCase() : "";
  if (verdictRaw !== "VERIFIED" && verdictRaw !== "REJECTED") {
    throw new Error("verdict missing or invalid");
  }
  const reason =
    typeof obj["reason"] === "string" && obj["reason"].trim()
      ? obj["reason"].trim().slice(0, 200)
      : "no reason given";
  return {
    verdict: verdictRaw,
    reason,
    kind_confirmed: asKind(obj["kind_confirmed"], fallbackKind),
  };
}

// ---------------------------------------------------------------------------
// Offsets + dedup
// ---------------------------------------------------------------------------

/** Normalised form for entity/brand comparison. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Does this mention refer to the client brand (not a competitor)? */
export function isBrandMention(m: { entity: string; text_exact: string }, brandName: string): boolean {
  const b = norm(brandName);
  if (!b) return false;
  const e = norm(m.entity);
  if (e === b) return true;
  // The extractor sometimes echoes the surface form ("Acme Inc." for "Acme").
  return e.startsWith(`${b} `) || e.endsWith(` ${b}`) || e.includes(` ${b} `);
}

type OffsetFix =
  | { ok: true; start: number; end: number; corrected: boolean }
  | { ok: false };

/**
 * Reconcile the extractor's offsets with the real text.
 *  - exact match at the stated offsets → keep them
 *  - text present elsewhere → recompute by search (corrected)
 *  - text absent → not fixable (caller rejects the mention locally)
 */
function reconcileOffsets(answer: string, m: Mention): OffsetFix {
  const { text_exact: t, offset_start: s, offset_end: e } = m;
  if (s >= 0 && e > s && e <= answer.length && answer.slice(s, e) === t) {
    return { ok: true, start: s, end: e, corrected: false };
  }
  const found = answer.indexOf(t);
  if (found >= 0) return { ok: true, start: found, end: found + t.length, corrected: true };
  // Case-insensitive last resort (models often re-case a quoted fragment).
  const ciFound = answer.toLowerCase().indexOf(t.toLowerCase());
  if (ciFound >= 0) return { ok: true, start: ciFound, end: ciFound + t.length, corrected: true };
  return { ok: false };
}

function dedupe(mentions: Mention[]): Mention[] {
  const seen = new Set<string>();
  const out: Mention[] = [];
  for (const m of mentions) {
    const key = `${norm(m.entity)}|${m.text_exact}|${m.offset_start}|${m.offset_end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fallback (single pass) — never breaks the audit
// ---------------------------------------------------------------------------

function fallbackResult(
  answer: string,
  brandName: string,
  notes: string[],
  llmCalls: number,
  mode: ExtractionMode
): ExtractionResult {
  const legacy = parseCitation(answer, brandName);
  const mentions: VerifiedMention[] = [];
  if (legacy.mentioned) {
    const idx = answer.toLowerCase().indexOf(brandName.toLowerCase());
    mentions.push({
      text_exact: idx >= 0 ? answer.slice(idx, idx + brandName.length) : brandName,
      offset_start: idx >= 0 ? idx : -1,
      offset_end: idx >= 0 ? idx + brandName.length : -1,
      entity: brandName,
      // Kinds are NOT classified on this path — the flag says so explicitly.
      kind: "neutral_mention",
      verdict: "UNVERIFIED",
      reason: `single-pass fallback (${mode}) — mention not classified or verified`,
      kind_confirmed: "neutral_mention",
    });
  }
  return {
    mentions,
    verified_count: 0,
    rejected_count: 0,
    methodology_version: EXTRACTION_METHODOLOGY_VERSION,
    extraction_mode: mode,
    // Legacy semantics: any brand mention counted as a citation.
    brand_cited: legacy.mentioned,
    llm_calls: llmCalls,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExtractionInput {
  /** The engine's answer text. */
  rawText: string;
  /** The client brand being audited. */
  brandName: string;
  /** Competitor names (may be empty). Used to classify who else is mentioned. */
  competitors?: string[];
}

export interface ExtractionOptions {
  /** Injected LLM caller (tests). Defaults to the cheap-tier default caller. */
  llm?: ExtractionLLM;
  /** Verification cap per answer. Defaults to MAX_VERIFIED_MENTIONS (8). */
  maxVerified?: number;
  /** Force-disable the two-pass protocol regardless of the env flag. */
  enabled?: boolean;
}

/**
 * extractMentions — run the two-pass protocol over ONE engine answer.
 *
 * Never throws. Always returns a usable ExtractionResult; degradations are
 * reported in `extraction_mode` + `notes`.
 */
export async function extractMentions(
  input: ExtractionInput,
  opts: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const answer = input.rawText ?? "";
  const brandName = (input.brandName ?? "").trim();
  const competitors = (input.competitors ?? []).filter((c) => !!c && c.trim().length > 0);
  const notes: string[] = [];
  const enabled = opts.enabled ?? twoPassExtractionEnabled();
  const maxVerified = Math.max(0, Math.floor(opts.maxVerified ?? MAX_VERIFIED_MENTIONS));
  const llm = opts.llm ?? defaultExtractionLLM;

  if (!enabled) {
    return fallbackResult(answer, brandName, ["GEO_TWO_PASS_EXTRACTION=0"], 0, "disabled");
  }

  // COST RULE: an empty answer has nothing to extract — no LLM call at all
  // (and therefore the verifier can never run either).
  if (!answer.trim() || !brandName) {
    return {
      mentions: [],
      verified_count: 0,
      rejected_count: 0,
      methodology_version: EXTRACTION_METHODOLOGY_VERSION,
      extraction_mode: "two_pass",
      brand_cited: false,
      llm_calls: 0,
      notes: answer.trim() ? ["no brand name given"] : ["empty answer — no extraction call"],
    };
  }

  // ---- PASS 1: extractor (1 call, +1 retry on malformed JSON) --------------
  const extractorUser = [
    `CLIENT BRAND: ${brandName}`,
    `COMPETITORS: ${competitors.length > 0 ? competitors.join(", ") : "(none provided)"}`,
    "",
    "ANSWER TEXT (verbatim, offsets are indices into this exact string):",
    "<<<ANSWER",
    answer,
    "ANSWER",
  ].join("\n");

  let llmCalls = 0;
  let candidates: Mention[] | null = null;
  for (let attempt = 0; attempt < 2 && candidates === null; attempt++) {
    try {
      llmCalls += 1;
      const raw = await llm({
        system: attempt === 0 ? EXTRACTOR_SYSTEM : EXTRACTOR_SYSTEM + JSON_REPAIR_SUFFIX,
        user: extractorUser,
        maxTokens: 1500,
      });
      candidates = parseExtractorPayload(raw);
    } catch (err) {
      const msg = (err as Error).message?.slice(0, 160) ?? "unknown error";
      if (err instanceof ExtractionUnavailableError) {
        // No key at all — do not burn a retry, degrade immediately.
        return fallbackResult(
          answer,
          brandName,
          [`extractor unavailable: ${msg}`],
          llmCalls - 1,
          "fallback_single_pass"
        );
      }
      notes.push(`extractor attempt ${attempt + 1} failed: ${msg}`);
    }
  }

  if (candidates === null) {
    // Malformed twice (or the provider is down) → legacy behaviour, audit lives.
    return fallbackResult(answer, brandName, notes, llmCalls, "fallback_single_pass");
  }

  // Keep only mentions of entities we actually asked about (client or a listed
  // competitor). An entity the extractor invented is not scoreable.
  const knownEntities = [brandName, ...competitors].map(norm);
  const scoped = dedupe(candidates).filter((m) => {
    const e = norm(m.entity);
    return knownEntities.some((k) => k && (e === k || e.includes(k) || k.includes(e)));
  });
  if (scoped.length < candidates.length) {
    notes.push(`${candidates.length - scoped.length} mention(s) dropped: unknown entity`);
  }

  // ---- Deterministic pre-check: offsets / presence (free, no LLM) ---------
  interface Prepared {
    mention: Mention;
    /** null when the text is absent from the answer → local rejection. */
    fix: OffsetFix;
  }
  const prepared: Prepared[] = scoped.map((m) => ({ mention: m, fix: reconcileOffsets(answer, m) }));

  // Verify the client brand first — those mentions are what moves the score.
  const order = prepared
    .map((p, ix) => ({ p, ix }))
    .sort((a, b) => {
      const ab = isBrandMention(a.p.mention, brandName) ? 0 : 1;
      const bb = isBrandMention(b.p.mention, brandName) ? 0 : 1;
      if (ab !== bb) return ab - bb;
      return a.ix - b.ix;
    });

  const results: VerifiedMention[] = new Array(prepared.length);
  let verifiedBudget = maxVerified;

  for (const { p, ix } of order) {
    const m = p.mention;

    // (a) text absent → REJECTED locally, no verifier call spent.
    if (!p.fix.ok) {
      results[ix] = {
        ...m,
        verdict: "REJECTED",
        reason: "text_exact not present in the answer (extractor hallucination)",
        kind_confirmed: m.kind,
      };
      continue;
    }

    const start = p.fix.start;
    const end = p.fix.end;
    const corrected = p.fix.corrected;

    // (b) verification cap — kept, flagged, never silently dropped.
    if (verifiedBudget <= 0) {
      results[ix] = {
        ...m,
        offset_start: start,
        offset_end: end,
        verdict: "UNVERIFIED_CAP",
        reason: `verification cap of ${maxVerified} mentions per answer reached — extractor kind kept, not verified`,
        kind_confirmed: m.kind,
      };
      continue;
    }

    // (c) PASS 2 — blind verifier. It is told the text and the claimed company
    //     ONLY; the extractor's kind is deliberately withheld.
    verifiedBudget -= 1;
    const verifierUser = [
      "ANSWER TEXT (verbatim):",
      "<<<ANSWER",
      answer,
      "ANSWER",
      "",
      "CANDIDATE MENTION:",
      `- quoted text: ${JSON.stringify(m.text_exact)}`,
      `- offset_start: ${start}`,
      `- offset_end: ${end}`,
      `- claimed company: ${m.entity}`,
    ].join("\n");

    try {
      llmCalls += 1;
      const raw = await llm({ system: VERIFIER_SYSTEM, user: verifierUser, maxTokens: 300 });
      const payload = parseVerifierPayload(raw, m.kind);
      results[ix] = {
        ...m,
        offset_start: start,
        offset_end: end,
        verdict: payload.verdict,
        reason: corrected
          ? `${payload.reason} (offsets recomputed from text_exact)`
          : payload.reason,
        kind_confirmed: payload.kind_confirmed,
      };
    } catch (err) {
      // Fail-open: an unverifiable mention is reported as such, the audit runs.
      results[ix] = {
        ...m,
        offset_start: start,
        offset_end: end,
        verdict: "UNVERIFIED",
        reason: `verifier unavailable: ${(err as Error).message?.slice(0, 120) ?? "error"}`,
        kind_confirmed: m.kind,
      };
    }
  }

  const mentions = results.filter(Boolean);
  const verified_count = mentions.filter((m) => m.verdict === "VERIFIED").length;
  const rejected_count = mentions.filter((m) => m.verdict === "REJECTED").length;
  const brand_cited = mentions.some((m) => isBrandMention(m, brandName) && countsAsCitation(m));

  return {
    mentions,
    verified_count,
    rejected_count,
    methodology_version: EXTRACTION_METHODOLOGY_VERSION,
    extraction_mode: "two_pass",
    brand_cited,
    llm_calls: llmCalls,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Batch helper — bounded concurrency so an audit cannot open 50 sockets at once
// ---------------------------------------------------------------------------

export async function extractMentionsBatch(
  inputs: ExtractionInput[],
  opts: ExtractionOptions & { concurrency?: number } = {}
): Promise<ExtractionResult[]> {
  const concurrency = Math.max(1, Math.floor(opts.concurrency ?? 4));
  const out: ExtractionResult[] = new Array(inputs.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const ix = cursor++;
      const input = inputs[ix];
      if (ix >= inputs.length || input === undefined) return;
      out[ix] = await extractMentions(input, opts);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  return out;
}
