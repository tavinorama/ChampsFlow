/**
 * delivery-canary.ts — the Ozvor canary tenant (audit P0-09, RELATORIO §14).
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Aggregate SLOs across all tenants are lagging and easy to dilute: with ten
 * brands, one brand receiving nothing is 90% coverage — green. The audit asks
 * for the opposite instrument: ONE tenant, ours, run daily against prompts we
 * wrote down in advance, where any single failure is loud.
 *
 *   "Usar Ozvor como canário diário: golden prompts versionados; expected
 *    relevance and category; minimum action coverage; no false positive de
 *    entidade; draft canary; publish sandbox; verify canary; alerta que torna
 *    System Health amarelo/vermelho."           — RELATORIO:632-643
 *
 * The last clause is the point of the whole item: when the canary fails, the
 * admin's System Health changes colour. That wiring lives in
 * apps/api/src/routes/admin.ts; this module decides pass/fail.
 *
 * VERSIONED, AND WHY THAT MATTERS
 * ---------------------------------------------------------------------------
 * `CANARY_VERSION` is stamped on every result. Editing the golden set changes
 * what "passing" means, so a result from an older set is not comparable with a
 * newer one — the same disease `trend-comparability.ts` cures for scores. Bump
 * the version in the same commit that edits the set; a unit test enforces that
 * the version is present and that every prompt is complete.
 *
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------
 * No I/O. It receives an observation (built by
 * apps/api/src/lib/delivery-health-read.ts from our own tenant's real rows) and
 * returns a verdict. Facts we do not yet record come back as `not_measured` —
 * never as a pass. A canary that passes because nothing was checked is worse
 * than no canary.
 */

import {
  type DeliveryStatus,
  type DeliveryUnknownStatus,
} from "./delivery-health";

/**
 * Bump WITH any edit to OZVOR_GOLDEN_PROMPTS or CANARY_THRESHOLDS.
 * Format: YYYY-MM-DD.n
 */
export const CANARY_VERSION = "2026-09-04.1";

/** Buyer intent categories — same vocabulary as the prompt universe. */
export type GoldenCategory = "commercial" | "comparison" | "informational" | "local";

export interface GoldenPrompt {
  /** Stable id — never reused for different text. */
  id: string;
  /** The exact question a buyer asks. Matched against audit_prompt.text. */
  text: string;
  /** The category the prompt MUST be classified as. */
  expectedCategory: GoldenCategory;
  /** Minimum relevance the prompt must score once relevance is recorded (P0-06). */
  expectedRelevance: number;
  market: "US" | "EU" | "BR" | "global";
  language: "en" | "pt";
  /** Why this prompt is in the golden set — deleting it needs an argument. */
  rationale: string;
}

/**
 * Eight questions our own buyers ask. Deliberately small: a golden set nobody
 * reads is a golden set nobody maintains.
 */
export const OZVOR_GOLDEN_PROMPTS: readonly GoldenPrompt[] = [
  {
    id: "gp-01",
    text: "What is the best AI search visibility tool for small businesses?",
    expectedCategory: "commercial",
    expectedRelevance: 0.8,
    market: "US",
    language: "en",
    rationale: "The head commercial query for Ozvor Search. If we are absent here we are absent from the category.",
  },
  {
    id: "gp-02",
    text: "How do I check if ChatGPT recommends my brand?",
    expectedCategory: "informational",
    expectedRelevance: 0.8,
    market: "global",
    language: "en",
    rationale: "The pain in the buyer's own words — the free check's entire reason to exist.",
  },
  {
    id: "gp-03",
    text: "Ozvor vs Profound for AI visibility tracking",
    expectedCategory: "comparison",
    expectedRelevance: 0.75,
    market: "US",
    language: "en",
    rationale: "Named comparison against the closest funded competitor (RELATORIO §13).",
  },
  {
    id: "gp-04",
    text: "How much does AI search visibility tracking cost?",
    expectedCategory: "commercial",
    expectedRelevance: 0.75,
    market: "global",
    language: "en",
    rationale: "Price is the second question every SMB asks; being absent here loses the deal silently.",
  },
  {
    id: "gp-05",
    text: "What is generative engine optimization and how does it work?",
    expectedCategory: "informational",
    expectedRelevance: 0.7,
    market: "global",
    language: "en",
    rationale: "Category-definition query — the one that decides who the AI treats as the authority.",
  },
  {
    id: "gp-06",
    text: "Which AI tools should a small business actually use?",
    expectedCategory: "commercial",
    expectedRelevance: 0.7,
    market: "BR",
    language: "en",
    rationale: "The AI Audit Stack ICP-B entry question — a second product, a second loop to keep honest.",
  },
  {
    id: "gp-07",
    text: "Best agency for improving brand visibility in AI answers",
    expectedCategory: "commercial",
    expectedRelevance: 0.7,
    market: "EU",
    language: "en",
    rationale: "OrganicPosts DFY demand; also our highest-value lead source.",
  },
  {
    id: "gp-08",
    text: "How do I get my website cited by Perplexity and Google AI Overview?",
    expectedCategory: "informational",
    expectedRelevance: 0.75,
    market: "global",
    language: "en",
    rationale: "Execution-intent query; the answer is literally our product's output.",
  },
] as const;

export const CANARY_THRESHOLDS = {
  /** Share of golden prompts that must be present in the canary brand's set. */
  minGoldenPresence: 1.0,
  /** Share of matched prompts that must carry the expected category. */
  minCategoryMatch: 0.9,
  /** Share of matched prompts that must meet their own expectedRelevance. */
  minRelevancePass: 0.9,
  /** Share of gaps found by the canary audit that must carry an action. */
  minActionCoverage: 0.9,
  /** Entity false positives tolerated. Zero. That is the whole check. */
  maxEntityFalsePositives: 0,
  /** A canary draft older than this means hosted generation is not proving itself. */
  draftMaxAgeHours: 48,
  /** A canary audit older than this means the loop is not running daily. */
  auditMaxAgeHours: 48,
} as const;

// ---------------------------------------------------------------------------
// Observation — what the reader hands in
// ---------------------------------------------------------------------------

export interface CanaryPromptObservation {
  /** Golden prompt id this row matched, or null when the golden prompt is absent. */
  goldenId: string;
  present: boolean;
  /** Category as classified by the system (audit_prompt.intent_id), null when not recorded. */
  category: string | null;
  /** Relevance score, null when the system does not record it yet (P0-06). */
  relevance: number | null;
}

export interface CanaryObservation {
  /**
   * false when the canary brand is not configured (OZVOR_OWN_BRAND_ID unset) or
   * its rows cannot be read. Everything downstream becomes not_connected —
   * never a pass.
   */
  connected: boolean;
  /** Human reason when not connected. */
  disconnectedReason?: string;
  /** Most recent completed audit of the canary brand. */
  auditId: string | null;
  auditAgeHours: number | null;
  prompts: CanaryPromptObservation[];
  /** Gaps found by that audit, and how many carry an action. null = not readable. */
  gaps: { total: number; withAction: number } | null;
  /** Runs where a fictional/ambiguous entity was accepted as real. null = not measured. */
  entityFalsePositives: number | null;
  /** Most recent draft produced for the canary brand. */
  draft: { ageHours: number | null; succeeded: boolean } | null;
  /** Did the verification path actually move a card (verified or regressed)? */
  verify: { claimed: number; verified: number } | null;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export type CanaryCheckId =
  | "loop_ran"
  | "golden_prompts_present"
  | "expected_category"
  | "expected_relevance"
  | "action_coverage"
  | "entity_false_positive"
  | "draft_canary"
  | "verify_canary";

export interface CanaryCheck {
  id: CanaryCheckId;
  label: string;
  status: DeliveryStatus;
  /** Always a sentence a human can act on. Null only when healthy. */
  detail: string | null;
}

export interface CanaryResult {
  version: string;
  status: DeliveryStatus;
  checks: CanaryCheck[];
  /** Sentences for every non-healthy check — fed to the System Health flags. */
  reasons: string[];
  auditId: string | null;
  readAt: string;
}

const unknown = (
  id: CanaryCheckId,
  label: string,
  status: DeliveryUnknownStatus,
  detail: string
): CanaryCheck => ({ id, label, status, detail });

const pct = (n: number): string => `${Math.round(n * 1000) / 10}%`;

export function evaluateCanary(obs: CanaryObservation, readAt: string): CanaryResult {
  const checks: CanaryCheck[] = [];

  if (!obs.connected) {
    const detail =
      obs.disconnectedReason ??
      "canary brand not configured — set OZVOR_OWN_BRAND_ID to the Ozvor brand id";
    for (const [id, label] of CHECK_LABELS) {
      checks.push(unknown(id, label, "not_connected", detail));
    }
    return finish(checks, obs.auditId, readAt);
  }

  // 1. The loop ran at all.
  if (obs.auditAgeHours === null) {
    checks.push(
      unknown("loop_ran", "Canary audit ran", "not_measured", "no completed audit found for the canary brand")
    );
  } else if (obs.auditAgeHours > CANARY_THRESHOLDS.auditMaxAgeHours) {
    checks.push({
      id: "loop_ran",
      label: "Canary audit ran",
      status: "failing",
      detail: `last canary audit was ${Math.round(obs.auditAgeHours)}h ago (limit ${CANARY_THRESHOLDS.auditMaxAgeHours}h) — the daily loop is not running`,
    });
  } else {
    checks.push({ id: "loop_ran", label: "Canary audit ran", status: "healthy", detail: null });
  }

  // 2. Golden prompts present.
  const total = OZVOR_GOLDEN_PROMPTS.length;
  const present = obs.prompts.filter((p) => p.present);
  if (obs.prompts.length === 0) {
    checks.push(
      unknown(
        "golden_prompts_present",
        "Golden prompts present",
        "not_measured",
        "the canary brand's prompt set could not be read"
      )
    );
  } else {
    const missing = OZVOR_GOLDEN_PROMPTS.filter(
      (g) => !present.some((p) => p.goldenId === g.id)
    ).map((g) => g.id);
    const share = present.length / total;
    checks.push(
      share >= CANARY_THRESHOLDS.minGoldenPresence
        ? { id: "golden_prompts_present", label: "Golden prompts present", status: "healthy", detail: null }
        : {
            id: "golden_prompts_present",
            label: "Golden prompts present",
            status: share < 0.5 ? "failing" : "degraded",
            detail: `${present.length}/${total} golden prompts in the canary set — missing: ${missing.join(", ")}`,
          }
    );
  }

  // 3. Expected category.
  const categorised = present.filter((p) => p.category !== null);
  if (categorised.length === 0) {
    checks.push(
      unknown(
        "expected_category",
        "Expected category",
        "not_measured",
        "no matched prompt carries a category (audit_prompt.intent_id is null) — classification is not recorded, so this is unproven, not passing"
      )
    );
  } else {
    const ok = categorised.filter((p) => {
      const golden = OZVOR_GOLDEN_PROMPTS.find((g) => g.id === p.goldenId);
      return golden ? p.category === golden.expectedCategory : false;
    });
    const share = ok.length / categorised.length;
    checks.push(
      share >= CANARY_THRESHOLDS.minCategoryMatch
        ? { id: "expected_category", label: "Expected category", status: "healthy", detail: null }
        : {
            id: "expected_category",
            label: "Expected category",
            status: share < 0.6 ? "failing" : "degraded",
            detail: `${pct(share)} of matched golden prompts carry the expected category (need ${pct(CANARY_THRESHOLDS.minCategoryMatch)})`,
          }
    );
  }

  // 4. Expected relevance.
  const scored = present.filter((p) => p.relevance !== null);
  if (scored.length === 0) {
    checks.push(
      unknown(
        "expected_relevance",
        "Expected relevance",
        "not_measured",
        "prompt relevance is not scored anywhere yet (P0-06 adds it) — reported as unmeasured, never as a pass"
      )
    );
  } else {
    const ok = scored.filter((p) => {
      const golden = OZVOR_GOLDEN_PROMPTS.find((g) => g.id === p.goldenId);
      return golden ? (p.relevance as number) >= golden.expectedRelevance : false;
    });
    const share = ok.length / scored.length;
    checks.push(
      share >= CANARY_THRESHOLDS.minRelevancePass
        ? { id: "expected_relevance", label: "Expected relevance", status: "healthy", detail: null }
        : {
            id: "expected_relevance",
            label: "Expected relevance",
            status: share < 0.6 ? "failing" : "degraded",
            detail: `${pct(share)} of scored golden prompts meet their expected relevance (need ${pct(CANARY_THRESHOLDS.minRelevancePass)})`,
          }
    );
  }

  // 5. Minimum action coverage.
  if (obs.gaps === null) {
    checks.push(
      unknown("action_coverage", "Action coverage", "not_measured", "the canary brand's plan could not be read")
    );
  } else if (obs.gaps.total === 0) {
    checks.push(
      unknown(
        "action_coverage",
        "Action coverage",
        "insufficient_evidence",
        "the canary audit produced no gaps — with nothing to cover, coverage proves nothing"
      )
    );
  } else {
    const share = obs.gaps.withAction / obs.gaps.total;
    checks.push(
      share >= CANARY_THRESHOLDS.minActionCoverage
        ? { id: "action_coverage", label: "Action coverage", status: "healthy", detail: null }
        : {
            id: "action_coverage",
            label: "Action coverage",
            status: share < 0.6 ? "failing" : "degraded",
            detail: `${obs.gaps.withAction}/${obs.gaps.total} canary gaps carry an action (need ${pct(CANARY_THRESHOLDS.minActionCoverage)})`,
          }
    );
  }

  // 6. Entity false positives — zero tolerated.
  if (obs.entityFalsePositives === null) {
    checks.push(
      unknown(
        "entity_false_positive",
        "No entity false positive",
        "not_measured",
        "no negative-control battery row in the window — hallucination is unmeasured, so this check does not pass"
      )
    );
  } else if (obs.entityFalsePositives > CANARY_THRESHOLDS.maxEntityFalsePositives) {
    checks.push({
      id: "entity_false_positive",
      label: "No entity false positive",
      status: "failing",
      detail: `${obs.entityFalsePositives} run(s) accepted a non-existent entity as real — zero is the only passing number`,
    });
  } else {
    checks.push({ id: "entity_false_positive", label: "No entity false positive", status: "healthy", detail: null });
  }

  // 7. Draft canary.
  if (obs.draft === null) {
    checks.push(
      unknown("draft_canary", "Draft canary", "not_measured", "no draft row found for the canary brand")
    );
  } else if (!obs.draft.succeeded) {
    checks.push({
      id: "draft_canary",
      label: "Draft canary",
      status: "failing",
      detail: "the most recent canary draft failed to generate — hosted generation is broken for our own tenant",
    });
  } else if (obs.draft.ageHours !== null && obs.draft.ageHours > CANARY_THRESHOLDS.draftMaxAgeHours) {
    checks.push({
      id: "draft_canary",
      label: "Draft canary",
      status: "degraded",
      detail: `last successful canary draft was ${Math.round(obs.draft.ageHours)}h ago (limit ${CANARY_THRESHOLDS.draftMaxAgeHours}h)`,
    });
  } else {
    checks.push({ id: "draft_canary", label: "Draft canary", status: "healthy", detail: null });
  }

  // 8. Verify canary — completion claimed must be completion proven.
  if (obs.verify === null) {
    checks.push(
      unknown(
        "verify_canary",
        "Verify canary",
        "not_measured",
        "verified execution is unreadable (plan_task lifecycle migration pending)"
      )
    );
  } else if (obs.verify.claimed === 0) {
    checks.push(
      unknown(
        "verify_canary",
        "Verify canary",
        "insufficient_evidence",
        "no canary card claimed completion in the window — nothing to verify"
      )
    );
  } else if (obs.verify.verified === 0) {
    checks.push({
      id: "verify_canary",
      label: "Verify canary",
      status: "failing",
      detail: `${obs.verify.claimed} canary card(s) claim completion and none was verified — the verification path is not running`,
    });
  } else {
    checks.push({ id: "verify_canary", label: "Verify canary", status: "healthy", detail: null });
  }

  return finish(checks, obs.auditId, readAt);
}

const CHECK_LABELS: readonly (readonly [CanaryCheckId, string])[] = [
  ["loop_ran", "Canary audit ran"],
  ["golden_prompts_present", "Golden prompts present"],
  ["expected_category", "Expected category"],
  ["expected_relevance", "Expected relevance"],
  ["action_coverage", "Action coverage"],
  ["entity_false_positive", "No entity false positive"],
  ["draft_canary", "Draft canary"],
  ["verify_canary", "Verify canary"],
] as const;

function finish(checks: CanaryCheck[], auditId: string | null, readAt: string): CanaryResult {
  const reasons = checks
    .filter((c) => c.status !== "healthy" && c.detail)
    .map((c) => `${c.label} — ${c.detail as string}`);

  // Same asymmetry as the indicator rollup: any failure is failure; nothing
  // unknown may be reported as green.
  let status: DeliveryStatus = "healthy";
  if (checks.some((c) => c.status === "failing")) status = "failing";
  else if (checks.some((c) => c.status === "degraded")) status = "degraded";
  else if (checks.some((c) => c.status === "not_connected")) status = "not_connected";
  else if (checks.some((c) => c.status === "not_measured")) status = "not_measured";
  else if (checks.some((c) => c.status === "insufficient_evidence")) status = "insufficient_evidence";

  return { version: CANARY_VERSION, status, checks, reasons, auditId, readAt };
}

/** Normalises prompt text for matching against audit_prompt.text. */
export function canaryPromptKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Enforced by a unit test: the golden set is complete and internally sane. */
export function assertGoldenSetComplete(): string[] {
  const problems: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(CANARY_VERSION)) {
    problems.push("CANARY_VERSION must look like YYYY-MM-DD.n");
  }
  const seen = new Set<string>();
  for (const g of OZVOR_GOLDEN_PROMPTS) {
    if (seen.has(g.id)) problems.push(`${g.id}: duplicate id`);
    seen.add(g.id);
    if (g.text.trim().length < 15) problems.push(`${g.id}: text too short to be a real query`);
    if (g.rationale.trim().length < 20) problems.push(`${g.id}: rationale missing`);
    if (!(g.expectedRelevance > 0 && g.expectedRelevance <= 1)) {
      problems.push(`${g.id}: expectedRelevance must be in (0,1]`);
    }
  }
  if (OZVOR_GOLDEN_PROMPTS.length < 5) problems.push("golden set too small to be a canary");
  return problems;
}
