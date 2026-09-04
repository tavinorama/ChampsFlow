/**
 * content-fact-check.ts — P0-08 item 4. The gate a hosted draft passes BEFORE
 * it is offered for review.
 *
 * THE ORDER THE REPORT SPECIFIES
 * "O pacote de evidência/claims entra no prompt; fact-check/claim registry
 * antes da revisão." Grounding first, checking second, human review third. A
 * fact-check that runs after a human has already read and approved a draft is
 * not a gate, it is a post-mortem.
 *
 * THIS FILE INTEGRATES THE TWO REGISTRIES THAT ALREADY EXIST. It does not
 * invent a third:
 *   - ./editorial-leak.ts (P0-04) — internal scaffolding must never reach a
 *     reader. It was written for the publish path; a draft that carries a
 *     leak marker should never get as far as the publish path in the first
 *     place, so the same check runs here too.
 *   - ./competitive-claims.ts (P0-05) — nothing is asserted about a competitor
 *     without a source, a check date and a named owner. `effectiveClaimStatus`
 *     is the authority; silence in the registry means nobody has vouched for
 *     anything, and this file treats it exactly that way.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It does not try to verify arbitrary prose against the world — an LLM
 * fact-checking an LLM is two guesses wearing a trench coat. It checks the
 * three things that are actually decidable from data we hold: did internal
 * scaffolding leak, did the draft assert something about a named competitor
 * that nobody has verified, and is the artifact real rather than a placeholder
 * skeleton.
 */

import { checkEditorialLeaks, describeEditorialLeaks } from "./editorial-leak";
import { effectiveClaimStatus, type CompetitiveClaim } from "./competitive-claims";

// ---------------------------------------------------------------------------
// The evidence pack
// ---------------------------------------------------------------------------

/**
 * One grounded statement the draft is allowed to rely on, carried from the
 * audit into the prompt and then stored beside the draft so a reviewer sees
 * what the writer was given — not just what it wrote.
 */
export interface DraftEvidence {
  /** Stable id so a claim in the draft can be traced to the row behind it. */
  id: string;
  /** The statement, in the customer's language. */
  statement: string;
  /** Where it came from: "audit gap", "absent prompt", "missing source", … */
  source: string;
}

/**
 * Render the evidence pack for a system prompt.
 *
 * Numbered on purpose: an unnumbered list of facts invites the model to blend
 * them, and a numbered one lets the rationale point at [E2] specifically.
 */
export function renderEvidencePack(evidence: readonly DraftEvidence[]): string {
  if (evidence.length === 0) return "";
  const lines = evidence.map((e, i) => `[E${i + 1}] (${e.source}) ${e.statement}`);
  return [
    "VERIFIED EVIDENCE — these are the only brand-specific facts you may assert.",
    ...lines,
    "",
    "Rules for using them:",
    "- Do not state any other fact about this brand, its customers, its numbers or its competitors.",
    "- Do not name a competitor. Refer to competitive pressure in the abstract.",
    "- General, widely-known industry knowledge is allowed; invented specifics are not.",
    "- If the evidence does not support a point you want to make, leave the point out.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export type FactCheckCode =
  | "editorial_leak"
  | "unverified_competitor_claim"
  | "placeholder_artifact"
  | "empty_artifact"
  | "ungrounded";

export interface FactCheckFinding {
  code: FactCheckCode;
  /** What a reviewer reads. Plain language, no internal jargon. */
  detail: string;
}

export interface FactCheckResult {
  /** False when the draft must NOT be stored or charged for. */
  ok: boolean;
  /** Findings that stop the draft. */
  blocking: FactCheckFinding[];
  /** Findings a reviewer should see but which do not stop the draft. */
  warnings: FactCheckFinding[];
  /** How many evidence items the draft was grounded on. 0 is a warning, not a lie. */
  evidenceCount: number;
}

/**
 * Placeholder markers.
 *
 * A WARNING, not a block, and the distinction is deliberate. The system prompt
 * explicitly instructs the model to write `[PLACEHOLDER: …]` rather than invent
 * a fact it does not have (the FABRICATION RULE in content-studio.ts) — that is
 * the model behaving correctly, and blocking it would punish honesty and
 * reward fabrication. The reviewer needs to SEE it; they do not need us to
 * throw the draft away.
 *
 * The genuinely dishonest case — a rules-template skeleton badged as
 * AI-authored — is caught earlier and differently, by `generatedBy !== "llm"`
 * in the route.
 */
const PLACEHOLDER_MARKERS = [/\[PLACEHOLDER/i, /\bTBD\b/, /\bLorem ipsum\b/i];

/** Below this a "draft" is not an artifact, it is an apology. */
export const MIN_DRAFT_BODY_CHARS = 200;

export function factCheckDraft(input: {
  title: string | null;
  body: string;
  evidence: readonly DraftEvidence[];
  /** Competitor names registered for THIS brand — the words we look for. */
  competitorNames: readonly string[];
  /** The competitive claim registry. Empty means nobody has vouched for anything. */
  claims?: readonly CompetitiveClaim[];
  now?: Date;
}): FactCheckResult {
  const blocking: FactCheckFinding[] = [];
  const warnings: FactCheckFinding[] = [];
  const now = input.now ?? new Date();
  const body = input.body ?? "";

  // 1. Is it an artifact at all? -------------------------------------------
  if (body.trim().length === 0) {
    blocking.push({ code: "empty_artifact", detail: "The draft came back empty." });
  } else if (body.trim().length < MIN_DRAFT_BODY_CHARS) {
    blocking.push({
      code: "empty_artifact",
      detail: `The draft came back too short to be usable (${body.trim().length} characters).`,
    });
  }
  if (PLACEHOLDER_MARKERS.some((re) => re.test(body))) {
    warnings.push({
      code: "placeholder_artifact",
      detail:
        "The draft leaves a placeholder where it needed a fact it does not have. Fill it in before you publish.",
    });
  }

  // 2. Editorial leak (P0-04 registry, reused) -------------------------------
  const leaks = checkEditorialLeaks(`${input.title ?? ""}\n${body}`);
  if (!leaks.ok) {
    blocking.push({
      code: "editorial_leak",
      detail: `The draft contains internal notes that must never reach a reader: ${describeEditorialLeaks(leaks)}`,
    });
  }

  // 3. Competitor naming vs the claim registry (P0-05 registry, reused) ------
  // A competitor may be named ONLY when a claim about them is `current` — i.e.
  // sourced, checked, in date and owned by a person. No registered claim means
  // nobody has vouched, and unvouched is not publishable. This is the exact
  // rule isComparisonFrozen applies to the /vs pages; a customer's blog post
  // does not get a weaker standard than our own marketing.
  const registry = input.claims ?? [];
  for (const name of input.competitorNames) {
    const trimmed = name.trim();
    if (trimmed.length < 3) continue; // too short to match without false positives
    if (!mentions(body, trimmed) && !mentions(input.title ?? "", trimmed)) continue;
    const vouched = registry.some(
      (c) => c.competitor.toLowerCase() === trimmed.toLowerCase() && effectiveClaimStatus(c, now) === "current"
    );
    if (!vouched) {
      blocking.push({
        code: "unverified_competitor_claim",
        detail: `The draft names "${trimmed}", and we hold no checked, sourced claim about them. Nothing was published or charged.`,
      });
    }
  }

  // 4. Grounding ------------------------------------------------------------
  // A draft with no evidence behind it is generic filler — the exact failure
  // RELATORIO §3 names elsewhere. It is a WARNING rather than a block: a
  // customer asking for a piece on a topic with no audit yet should still get
  // one, but the reviewer must see that it stands on nothing.
  if (input.evidence.length === 0) {
    warnings.push({
      code: "ungrounded",
      detail: "This draft was written without audit evidence behind it, so it makes no brand-specific claims.",
    });
  }

  return { ok: blocking.length === 0, blocking, warnings, evidenceCount: input.evidence.length };
}

/**
 * Word-boundary-ish match, case-insensitive.
 *
 * Escaped because a competitor name is customer-supplied text and an unescaped
 * one compiles into a regex — "C++" would throw, and something more deliberate
 * would not.
 */
function mentions(haystack: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, "iu").test(haystack);
}

/** One line for a log or a reviewer banner. Never carries the draft body. */
export function describeFactCheck(result: FactCheckResult): string {
  if (result.ok && result.warnings.length === 0) return "passed";
  return [...result.blocking, ...result.warnings].map((f) => `${f.code}: ${f.detail}`).join("; ");
}
