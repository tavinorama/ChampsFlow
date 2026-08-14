/**
 * engine.ts — the AI Audit Stack recommendation engine (PURE).
 *
 * Given a client's questionnaire answers and a tool catalog, produce the data
 * for the founder's 9-section assessment deck. No I/O, no DB, no clock — the
 * moat is the rules/weights here (the research found no OSS product to fork),
 * so this is where the product's intelligence lives and where it is tested.
 *
 * Scoring is transparent on purpose: a client (or the founder tuning weights)
 * can read WHY a tool was recommended. Every recommendation is anchored in the
 * pains it matches — a tool that matches no stated pain never surfaces, so the
 * report can never invent a fit. Honest-empty: if nothing matches, the report
 * says so instead of padding.
 */

import type {
  AuditReport,
  Effort,
  EntryResult,
  FinancialImpact,
  Impact,
  PlanStep,
  Quadrant,
  QuestionnaireAnswers,
  ScoredTool,
  Tool,
} from "./types";

/** Weeks per month for monthly ROI from weekly hours. */
const WEEKS_PER_MONTH = 4.33;
/** Default blended hourly rate (USD) when the client doesn't give one. */
const DEFAULT_HOURLY_RATE = 50;
/** How many tools the deck's "Recommended Solutions" section shows. */
const MAX_RECOMMENDED = 6;
/** The 4-day plan length (deck section 6). */
const PLAN_DAYS = 4;

const IMPACT_WEIGHT: Record<Impact, number> = { low: 1, medium: 2, high: 3 };
const EFFORT_WEIGHT: Record<Effort, number> = { low: 3, medium: 2, high: 1 };

/** A tool counts as "high impact" for the matrix unless it is explicitly low. */
const isHighImpact = (t: Tool): boolean => t.impact !== "low";
/** A tool counts as "low effort" for the matrix unless it is explicitly high. */
const isLowEffort = (t: Tool): boolean => t.setupEffort !== "high";

/** The deck's 2×2 placement (section 3), from impact × setup effort. */
export function quadrantOf(tool: Tool): Quadrant {
  if (isHighImpact(tool)) return isLowEffort(tool) ? "quick-win" : "major-project";
  return isLowEffort(tool) ? "fill-in" : "ignore";
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Score one tool against the answers. Anchored in pain matches: a tool with
 * zero matched pains scores 0 and is dropped. Niche and focus alignment and
 * the tool's own impact/effort refine the ranking; over-budget tools are
 * demoted (penalty) but never hidden — the client sees the trade-off.
 */
export function scoreTool(tool: Tool, answers: QuestionnaireAnswers): ScoredTool {
  const wantedPains = new Set(answers.pains.map(normalize));
  const toolPains = new Set(tool.pains.map(normalize));
  const matchedPains = [...wantedPains].filter((p) => toolPains.has(p));

  const nicheMatch =
    tool.niches.length === 0
      ? 0.5 // general-purpose: a mild, non-zero fit for any niche
      : tool.niches.map(normalize).includes(normalize(answers.businessType))
        ? 1
        : 0;
  const focusMatch = normalize(tool.category) === normalize(answers.primaryFocus) ? 1 : 0;

  const budget = answers.maxMonthlyBudgetUsd;
  const overBudget = typeof budget === "number" && tool.monthlyCostUsd > budget;

  // Weights: pains dominate (the anchor), then fit, then intrinsic value.
  const score =
    matchedPains.length * 5 +
    nicheMatch * 3 +
    focusMatch * 2 +
    IMPACT_WEIGHT[tool.impact] +
    EFFORT_WEIGHT[tool.setupEffort] -
    (overBudget ? 4 : 0);

  return { tool, score, matchedPains, quadrant: quadrantOf(tool), overBudget };
}

/** Deterministic ordering: score desc, then hours saved desc, then name. */
function byRank(a: ScoredTool, b: ScoredTool): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.tool.hoursSavedWeekly !== a.tool.hoursSavedWeekly) {
    return b.tool.hoursSavedWeekly - a.tool.hoursSavedWeekly;
  }
  return a.tool.name.localeCompare(b.tool.name);
}

function financialImpact(tools: ScoredTool[], hourlyRate: number): FinancialImpact {
  const totalMonthlyToolCostUsd = round2(tools.reduce((s, t) => s + t.tool.monthlyCostUsd, 0));
  const weeklyTimeReturnedHours = round2(tools.reduce((s, t) => s + t.tool.hoursSavedWeekly, 0));
  const monthlyValue = weeklyTimeReturnedHours * WEEKS_PER_MONTH * hourlyRate;
  // EFFORT saved = the recurring chores the stack takes off the client's plate,
  // one per distinct pain a recommended tool covers. Honest count, not a guess.
  const choresRemoved = new Set(tools.flatMap((t) => t.matchedPains)).size;
  return {
    weeklyTimeReturnedHours,
    choresRemoved,
    monthlyNetRoiUsd: round2(monthlyValue - totalMonthlyToolCostUsd),
    totalMonthlyToolCostUsd,
    hourlyRateUsd: hourlyRate,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function painSummaryOf(answers: QuestionnaireAnswers): string {
  if (answers.pains.length === 0) return "No specific pains were selected.";
  return `Time lost to: ${answers.pains.join(", ")}.`;
}

/**
 * The LOW-TICKET entry result: ONE niche-fit tool (never a household-name
 * giant) + the honest count of what the full audit would surface. Selection:
 * drop already-owned and giants, keep only pain-anchored matches, then PREFER
 * a tool whose niches include the client's business type (the personal touch)
 * and, among those, the highest score. When no niche-fit tool exists, fall
 * back to the best non-giant match; when nothing matches, return empty (the
 * honest "let's talk" state) — never a giant, never invented.
 */
export function buildEntryResult(
  answers: QuestionnaireAnswers,
  catalog: Tool[]
): EntryResult {
  const owned = new Set((answers.toolsInUse ?? []).map(normalize));
  const bt = normalize(answers.businessType);

  const matched = catalog
    .filter((t) => !owned.has(normalize(t.id)))
    .map((t) => scoreTool(t, answers))
    .filter((s) => s.matchedPains.length > 0)
    .sort(byRank);

  const nonGiant = matched.filter((s) => s.tool.isGeneric !== true);
  const nicheFit = nonGiant.filter((s) => s.tool.niches.map(normalize).includes(bt));
  const pick = nicheFit[0] ?? nonGiant[0] ?? null;

  const totalMatched = matched.length;
  return {
    pick,
    reason: pick
      ? `Picked for your ${answers.businessType} work in ${answers.primaryFocus}. ${pick.tool.oneLiner} Most teams have not found this one yet.`
      : "No niche tool clearly fits your answers yet. The full audit, with a human review, is the honest next step.",
    totalMatched,
    withheldCount: Math.max(0, totalMatched - 1),
    painSummary: painSummaryOf(answers),
    empty: pick === null,
  };
}

/**
 * Build the full 9-section deck data from answers + catalog. The single entry
 * point; everything above is exposed for testing and weight-tuning.
 */
export function buildAuditReport(
  answers: QuestionnaireAnswers,
  catalog: Tool[]
): AuditReport {
  const hourlyRate = answers.hourlyRateUsd ?? DEFAULT_HOURLY_RATE;
  const owned = new Set((answers.toolsInUse ?? []).map(normalize));

  // Score everything the client doesn't already own; keep only real matches.
  const scored = catalog
    .filter((t) => !owned.has(normalize(t.id)))
    .map((t) => scoreTool(t, answers))
    .filter((s) => s.matchedPains.length > 0)
    .sort(byRank);

  const matrix: Record<Quadrant, ScoredTool[]> = {
    "quick-win": scored.filter((s) => s.quadrant === "quick-win"),
    "major-project": scored.filter((s) => s.quadrant === "major-project"),
    "fill-in": scored.filter((s) => s.quadrant === "fill-in"),
    ignore: scored.filter((s) => s.quadrant === "ignore"),
  };

  const quickWins = matrix["quick-win"];
  // The recommended stack leads with quick wins, then fills up to 6 with the
  // next best (major projects, then fill-ins) — never the "ignore" cell.
  const recommendedSolutions = [
    ...quickWins,
    ...matrix["major-project"],
    ...matrix["fill-in"],
  ].slice(0, MAX_RECOMMENDED);

  const fourDayPlan: PlanStep[] = quickWins.slice(0, PLAN_DAYS).map((s, i) => ({
    day: i + 1,
    tool: s.tool,
    action: `Set up ${s.tool.name}. ${s.tool.oneLiner}`,
  }));

  const hoursReclaimedWeekly = round2(
    quickWins.reduce((sum, s) => sum + s.tool.hoursSavedWeekly, 0)
  );

  const topPick = quickWins[0] ?? recommendedSolutions[0] ?? null;
  const topPickReason = topPick
    ? `Best fit. It solves ${topPick.matchedPains.length} of your pains, takes ${topPick.tool.setupEffort} setup, and saves about ${topPick.tool.hoursSavedWeekly}h a week.`
    : "No tool clearly matched your pains. A human review is the honest next step.";

  return {
    businessType: answers.businessType,
    primaryFocus: answers.primaryFocus,
    painSummary: painSummaryOf(answers),
    outcomeSummary:
      quickWins.length > 0
        ? `Reclaim about ${hoursReclaimedWeekly}h a week. Start with ${quickWins.length} quick win${quickWins.length > 1 ? "s" : ""}.`
        : "No quick wins for these answers. See the recommended path below.",
    hoursReclaimedWeekly,
    matrix,
    quickWins,
    recommendedSolutions,
    fourDayPlan,
    whatComesAfter: matrix["major-project"],
    financialImpact: financialImpact(recommendedSolutions, hourlyRate),
    topPick,
    topPickReason,
    empty: scored.length === 0,
  };
}
