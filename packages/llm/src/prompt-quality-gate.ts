/**
 * prompt-quality-gate.ts — P0-06: what is allowed into the prompt universe.
 *
 * A prompt that enters the universe becomes part of the denominator of the
 * score. So the gate is not a lint pass — it is the thing that decides what
 * the number means. Six checks, each closing a failure we have actually seen
 * in the founder's own workspace:
 *
 *  1. RELEVANCE FLOOR   a prompt below the floor dilutes the score with a
 *                       question nobody in the market asks.
 *  2. SEMANTIC DEDUPE   two near-identical questions double-count one signal
 *                       and fabricate a tighter confidence interval than the
 *                       data has. (The pre-v2 portfolio shipped "best X for
 *                       small businesses" AND "best X for SMBs on a budget".)
 *  3. BUYER INTENT      an unclassified prompt cannot be aggregated per intent
 *                       and cannot produce an actionable gap.
 *  4. LOCALE COHERENCE  a pt-BR question tagged market=US measures nothing
 *                       real; script and market must agree with the locale.
 *  5. BRANDED EXPLICIT  branded and non-branded questions measure structurally
 *                       different things. The flag must be declared AND must
 *                       match the text — a mislabelled branded prompt inflates
 *                       the citation rate.
 *  6. FRESHNESS         an expired or not-yet-valid prompt must not silently
 *                       keep being probed.
 *
 * Severity: "error" blocks entry; "warning" is recorded and surfaced but does
 * not block. Nothing is ever silently dropped — every rejection carries a code
 * and a human sentence, because "your score changed" without "and here is what
 * we stopped asking" is exactly the failure this whole capability closes.
 *
 * Pure module: no I/O, no clock (callers pass `now`).
 */

import type { PromptDefinition } from "./prompt-universe";
import { PROMPT_INTENTS } from "./prompt-universe";

export type ViolationSeverity = "error" | "warning";

export type ViolationCode =
  | "relevance_below_floor"
  | "duplicate_prompt"
  | "near_duplicate_prompt"
  | "intent_missing"
  | "intent_unknown"
  | "locale_market_mismatch"
  | "locale_language_mismatch"
  | "branded_flag_contradicts_text"
  | "branded_flag_missing"
  | "expired"
  | "not_yet_valid"
  | "expiring_soon"
  | "demand_without_source"
  | "text_too_short";

export interface Violation {
  code: ViolationCode;
  severity: ViolationSeverity;
  /** One sentence a human can act on. Product language is English. */
  message: string;
}

export interface QualityGateConfig {
  /** Minimum relevanceScore to enter the universe. */
  relevanceFloor: number;
  /**
   * Jaccard similarity over normalised token sets above which two prompts are
   * treated as the same question. 0.8 catches "best X for small businesses" vs
   * "best X for SMBs on a budget" once the SMB alias is folded, while leaving
   * genuinely different questions apart.
   */
  duplicateThreshold: number;
  /** Warn when a prompt expires within this many days. */
  expiryWarningDays: number;
}

export const DEFAULT_QUALITY_GATE: Readonly<QualityGateConfig> = Object.freeze({
  relevanceFloor: 0.5,
  duplicateThreshold: 0.8,
  expiryWarningDays: 14,
});

export interface PromptVerdict {
  promptId: string;
  /** False when any violation is an error. */
  accepted: boolean;
  violations: Violation[];
}

export interface QualityGateResult {
  accepted: PromptDefinition[];
  rejected: PromptVerdict[];
  /** Every verdict, accepted ones included (warnings live here). */
  verdicts: PromptVerdict[];
}

// ---------------------------------------------------------------------------
// Language / market coherence
// ---------------------------------------------------------------------------

/**
 * Markets where a locale's language is a plausible language of search. This is
 * deliberately permissive — English is a real search language nearly
 * everywhere, and being stricter would reject legitimate EU tracking. What it
 * refuses is the actual bug: a locale whose language cannot be the language of
 * the tagged market at all (pt-BR tagged US, de-DE tagged BR).
 */
const MARKET_LANGUAGES: Record<string, readonly string[]> = {
  US: ["en", "es"],
  GB: ["en"],
  IE: ["en"],
  CA: ["en", "fr"],
  AU: ["en"],
  BR: ["pt", "en"],
  PT: ["pt", "en"],
  ES: ["es", "en"],
  FR: ["fr", "en"],
  DE: ["de", "en"],
  NL: ["nl", "en"],
  IT: ["it", "en"],
};

/** Scripts/diacritics that betray a language regardless of the locale tag. */
const PORTUGUESE_MARKERS = /\b(como|qual|quais|para|não|você|marca|aparece|melhor)\b/i;
const SPANISH_MARKERS = /\b(cómo|cuál|para|mejor|marca|aparece)\b/i;
const GERMAN_MARKERS = /\b(wie|welche|beste|marke|für)\b/i;

function languageOf(locale: string): string {
  return (locale.split("-")[0] ?? "").toLowerCase();
}

function detectLanguage(text: string): string | null {
  if (PORTUGUESE_MARKERS.test(text)) return "pt";
  if (SPANISH_MARKERS.test(text)) return "es";
  if (GERMAN_MARKERS.test(text)) return "de";
  // No positive signal: we do not guess "en" — an undetected language is
  // unknown, and unknown must not become a mismatch accusation.
  return null;
}

// ---------------------------------------------------------------------------
// Branded detection
// ---------------------------------------------------------------------------

/**
 * Does the text name the brand (or one of its aliases)? Word-boundary match so
 * "Ozvor" does not fire inside an unrelated word.
 */
export function mentionsBrand(text: string, brandNames: readonly string[]): boolean {
  for (const raw of brandNames) {
    const name = raw.trim();
    if (name.length < 2) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}([^\\p{L}\\p{N}]|$)`, "iu");
    if (re.test(text)) return true;
  }
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Semantic dedupe
// ---------------------------------------------------------------------------

/**
 * Aliases folded before comparison, so the pre-v2 duplicate pair collapses:
 * "small businesses" and "SMBs" are the same question to a search engine.
 */
const SYNONYMS: Record<string, string> = {
  smb: "smallbusiness",
  smbs: "smallbusiness",
  sme: "smallbusiness",
  smes: "smallbusiness",
  small: "smallbusiness",
  business: "smallbusiness",
  businesses: "smallbusiness",
  companies: "company",
  company: "company",
  tools: "tool",
  tool: "tool",
  platforms: "tool",
  platform: "tool",
  vendors: "vendor",
  vendor: "vendor",
  providers: "vendor",
  provider: "vendor",
  top: "best",
  greatest: "best",
  best: "best",
};

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "of", "for", "to", "in",
  "on", "at", "by", "with", "and", "or", "what", "which", "who", "how", "do",
  "does", "did", "can", "should", "my", "your", "their", "it", "that", "this",
  "as", "from", "about", "into", "actually",
]);

export function normaliseTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map((t) => SYNONYMS[t] ?? t);
  return new Set(tokens);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export interface QualityGateContext {
  /** ISO timestamp. Callers pass it — this module has no clock. */
  now: string;
  /** Brand name + aliases, used by the branded-vs-non-branded check. */
  brandNames: readonly string[];
  config?: Partial<QualityGateConfig>;
}

/**
 * Evaluate ONE prompt in isolation (everything except dedupe, which needs the
 * rest of the set). Exported so a UI can validate a prompt as it is typed.
 */
export function evaluatePrompt(
  prompt: PromptDefinition,
  ctx: QualityGateContext
): PromptVerdict {
  const cfg = { ...DEFAULT_QUALITY_GATE, ...(ctx.config ?? {}) };
  const v: Violation[] = [];
  const nowMs = Date.parse(ctx.now);
  if (Number.isNaN(nowMs)) throw new Error(`quality_gate_now_invalid: "${ctx.now}"`);

  // 0. Substance.
  if (prompt.text.trim().length < 10) {
    v.push({
      code: "text_too_short",
      severity: "error",
      message: "Prompt text is too short to be a real buyer question.",
    });
  }

  // 1. Relevance floor.
  if (prompt.relevanceScore < cfg.relevanceFloor) {
    v.push({
      code: "relevance_below_floor",
      severity: "error",
      message: `Relevance ${prompt.relevanceScore} is below the floor of ${cfg.relevanceFloor}; this question would dilute the score.`,
    });
  }

  // 2. Buyer intent.
  if (!prompt.intent) {
    v.push({
      code: "intent_missing",
      severity: "error",
      message: "No buyer intent: the prompt cannot be aggregated or turned into a gap.",
    });
  } else if (!(PROMPT_INTENTS as readonly string[]).includes(prompt.intent)) {
    v.push({
      code: "intent_unknown",
      severity: "error",
      message: `Intent "${prompt.intent}" is not in the vocabulary.`,
    });
  }

  // 3. Locale / market coherence.
  const lang = languageOf(prompt.locale);
  const allowed = MARKET_LANGUAGES[prompt.market.toUpperCase()];
  if (!lang) {
    v.push({
      code: "locale_language_mismatch",
      severity: "error",
      message: `Locale "${prompt.locale}" has no language subtag.`,
    });
  } else if (allowed && !allowed.includes(lang)) {
    v.push({
      code: "locale_market_mismatch",
      severity: "error",
      message: `Locale "${prompt.locale}" (${lang}) is not a search language of market ${prompt.market}.`,
    });
  }
  const detected = detectLanguage(prompt.text);
  if (lang && detected && detected !== lang) {
    v.push({
      code: "locale_language_mismatch",
      severity: "error",
      message: `Prompt text reads as "${detected}" but the locale says "${lang}".`,
    });
  }

  // 4. Branded flag: declared AND consistent with the text.
  if (typeof prompt.branded !== "boolean") {
    v.push({
      code: "branded_flag_missing",
      severity: "error",
      message:
        "Branded vs non-branded is not declared. Unknown is not 'non-branded' — the two measure different things.",
    });
  } else {
    const names = mentionsBrand(prompt.text, ctx.brandNames);
    if (names && !prompt.branded) {
      v.push({
        code: "branded_flag_contradicts_text",
        severity: "error",
        message:
          "Prompt names the brand but is flagged non-branded; counting it as non-branded inflates the citation rate.",
      });
    }
    if (!names && prompt.branded) {
      v.push({
        code: "branded_flag_contradicts_text",
        severity: "error",
        message: "Prompt is flagged branded but does not name the brand or any alias.",
      });
    }
  }

  // 5. Freshness.
  const from = Date.parse(prompt.validFrom);
  if (!Number.isNaN(from) && from > nowMs) {
    v.push({
      code: "not_yet_valid",
      severity: "error",
      message: `Prompt is not valid until ${prompt.validFrom}.`,
    });
  }
  if (prompt.validUntil) {
    const until = Date.parse(prompt.validUntil);
    if (!Number.isNaN(until)) {
      if (until <= nowMs) {
        v.push({
          code: "expired",
          severity: "error",
          message: `Prompt expired on ${prompt.validUntil}; probing it would keep measuring a dead question.`,
        });
      } else if (until - nowMs <= cfg.expiryWarningDays * 86_400_000) {
        v.push({
          code: "expiring_soon",
          severity: "warning",
          message: `Prompt expires on ${prompt.validUntil} — schedule a replacement before the trend loses it.`,
        });
      }
    }
  }

  // 6. Demand provenance (mirrors audit_prompt_demand_source_chk).
  if (prompt.demand && !prompt.demand.source.trim()) {
    v.push({
      code: "demand_without_source",
      severity: "error",
      message: "Demand value carries no source; a number with no provenance is not evidence.",
    });
  }

  return {
    promptId: prompt.id,
    accepted: !v.some((x) => x.severity === "error"),
    violations: v,
  };
}

/**
 * Run the gate over a whole candidate set, including semantic dedupe.
 *
 * Dedupe is order-dependent by design: the FIRST occurrence is kept and later
 * near-duplicates are rejected against it, and the caller controls the order
 * (highest priority first). Rejecting the higher-value twin because it came
 * second would quietly downgrade the universe.
 *
 * A prompt that fails an individual check is not used as a dedupe anchor —
 * otherwise one bad prompt could evict its own good replacement.
 */
export function runQualityGate(
  prompts: readonly PromptDefinition[],
  ctx: QualityGateContext
): QualityGateResult {
  const cfg = { ...DEFAULT_QUALITY_GATE, ...(ctx.config ?? {}) };
  const verdicts: PromptVerdict[] = [];
  const accepted: PromptDefinition[] = [];
  const keptTokens: Array<{ id: string; text: string; tokens: Set<string> }> = [];

  for (const p of prompts) {
    const verdict = evaluatePrompt(p, ctx);

    if (verdict.accepted) {
      const tokens = normaliseTokens(p.text);
      for (const kept of keptTokens) {
        const sim = jaccard(tokens, kept.tokens);
        if (sim >= 1) {
          verdict.violations.push({
            code: "duplicate_prompt",
            severity: "error",
            message: `Identical question to "${kept.text}" — probing both double-counts one signal.`,
          });
          break;
        }
        if (sim >= cfg.duplicateThreshold) {
          verdict.violations.push({
            code: "near_duplicate_prompt",
            severity: "error",
            message: `Near-duplicate of "${kept.text}" (similarity ${sim.toFixed(2)}); the pair would fabricate a tighter confidence interval than the data supports.`,
          });
          break;
        }
      }
      verdict.accepted = !verdict.violations.some((x) => x.severity === "error");
      if (verdict.accepted) {
        accepted.push(p);
        keptTokens.push({ id: p.id, text: p.text, tokens });
      }
    }

    verdicts.push(verdict);
  }

  return {
    accepted,
    rejected: verdicts.filter((x) => !x.accepted),
    verdicts,
  };
}
