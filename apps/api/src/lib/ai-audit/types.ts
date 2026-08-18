/**
 * types.ts — the AI Audit Stack domain (new product, founder 2026-08-13).
 *
 * The product reads a client's pains/goals and recommends the right stack of
 * AI tools, delivered as the founder's 9-section assessment deck (see
 * docs/product-ai-audit-stack.md). This module is the PURE domain — no I/O, no
 * DB, no clock — exactly like agent-graphs.ts. The engine (engine.ts) turns a
 * questionnaire + a tool catalog into the deck's data; a body (route + UI +
 * pgvector matching) arrives later around this core.
 *
 * Capilaridade (founder's depth bar) lives in the data model: every tool
 * carries niches[] and pains[] so a recommendation can be niche-aware, plus the
 * numbers the deck's Impact–Effort matrix and Financial Impact need.
 */

export type Effort = "low" | "medium" | "high";
export type Impact = "low" | "medium" | "high";

/** The four cells of the deck's Impact–Effort matrix (section 3). */
export type Quadrant = "quick-win" | "major-project" | "fill-in" | "ignore";

/**
 * The five engines every business runs, whatever the industry (founder,
 * 2026-08-14): Attract (get found) · Convert (win the customer) · Deliver (do
 * the work) · Retain (keep and grow) · Run (the back office). The questionnaire
 * asks where each engine breaks; tools are tagged with the engines they serve,
 * so a clinic's Convert/Run gargalos surface clinic tools, not "use ChatGPT".
 */
export type BusinessEngine = "attract" | "convert" | "deliver" | "retain" | "run";

/**
 * One entry in the tool catalog. The catalog is DATA (seeded + curated, then
 * kept fresh) — never hardcoded in the engine. Costs/hours are estimates that
 * must be verified before they appear in a client-facing report.
 */
export interface Tool {
  id: string;
  name: string;
  url: string;
  /** writing · support · ops · marketing · sales · dev · data · video · meetings … */
  category: string;
  /** Verticals it fits; [] = general-purpose (the capilaridade axis). */
  niches: string[];
  /** Pain slugs it addresses — the join key with the questionnaire. */
  pains: string[];
  /** Monthly USD cost of a realistic plan (0 = free tier viable). */
  monthlyCostUsd: number;
  /** How hard to adopt — feeds the matrix effort axis + the deck's "Setup". */
  setupEffort: Effort;
  /** Business impact — feeds the matrix impact axis. */
  impact: Impact;
  /** Which of the five business engines this tool serves (industry-agnostic). */
  engines: BusinessEngine[];
  /** Hours saved per week once adopted — feeds ROI + "Saves". */
  hoursSavedWeekly: number;
  /** One line of what it does / the "Saves" description in section 5. */
  oneLiner: string;
  /**
   * True for the household-name generalist AIs everyone already reaches for
   * (ChatGPT, Claude…). The low-ticket ENTRY result deliberately skips these:
   * its single recommendation should be a specialized, niche-fit tool the
   * client probably hasn't found — that's what makes the free/entry check feel
   * personal, and what leaves the obvious giants (and the full ranked stack,
   * plan and ROI) as the reason to buy the full audit. Defaults to false.
   */
  isGeneric?: boolean;
}

/** The client's questionnaire answers (section 1 intake). */
export interface QuestionnaireAnswers {
  /** Business type / vertical — matched against tool.niches. */
  businessType: string;
  /** Primary focus area — matched against tool.category. */
  primaryFocus: string;
  /** Selected pain slugs — matched against tool.pains. */
  pains: string[];
  /** Which of the five engines hurt (from the questionnaire) — matched against tool.engines. */
  engines?: BusinessEngine[];
  /** Blended hourly rate for ROI. Defaults applied by the engine if absent. */
  hourlyRateUsd?: number;
  /** Optional monthly budget cap; tools above it are demoted, never hidden. */
  maxMonthlyBudgetUsd?: number;
  /** Tools the client already uses (by id) — excluded from recommendations. */
  toolsInUse?: string[];
}

export interface ScoredTool {
  tool: Tool;
  /** Higher = better fit for these answers. */
  score: number;
  /** Which of the client's pains this tool addresses. */
  matchedPains: string[];
  /** Which of the client's hurting engines this tool serves. */
  matchedEngines: BusinessEngine[];
  quadrant: Quadrant;
  /** True when the tool's monthly cost exceeds the client's stated budget. */
  overBudget: boolean;
}

export interface PlanStep {
  day: number;
  tool: Tool;
  action: string;
}

/**
 * The three KPIs the pitch promises the client (founder, 14/08): Time, Effort,
 * and Money saved. The whole product exists because there are too many AI tools
 * to choose from; we understand the client's pains and adapt their stack, and
 * these three numbers are the proof.
 */
export interface FinancialImpact {
  /** TIME saved: sum of recommended tools' weekly hours saved. */
  weeklyTimeReturnedHours: number;
  /** EFFORT saved: how many recurring chores (distinct pains) the stack removes. */
  choresRemoved: number;
  /** MONEY saved: weeklyHours × 4.33 × hourlyRate − monthly tool cost. */
  monthlyNetRoiUsd: number;
  /** Supporting number: what the recommended stack costs per month. */
  totalMonthlyToolCostUsd: number;
  /** The hourly rate used (echoed for transparency). */
  hourlyRateUsd: number;
}

/**
 * The full deliverable data — one object that fills every section of the deck.
 * The report generator (md-to-pdf / anthropic-skills:pdf) renders this; the
 * low-ticket web result renders a subset (topPick + matrix + financialImpact).
 */
export interface AuditReport {
  // §1–2 — cover + executive summary
  businessType: string;
  primaryFocus: string;
  /** Human summary of the pains selected (deck: "The Pain"). */
  painSummary: string;
  /** Human summary of the outcome (deck: "The Outcome"). */
  outcomeSummary: string;
  /** Headline hours reclaimed/week — the quick wins' hours (deck section 2). */
  hoursReclaimedWeekly: number;
  // §3 — impact–effort matrix
  matrix: Record<Quadrant, ScoredTool[]>;
  // §4 — quick wins
  quickWins: ScoredTool[];
  // §5 — recommended solutions (the tool stack; up to 6)
  recommendedSolutions: ScoredTool[];
  // §6 — 4-day quick-wins plan
  fourDayPlan: PlanStep[];
  // §7 — what comes after (major projects)
  whatComesAfter: ScoredTool[];
  // §8 — financial impact
  financialImpact: FinancialImpact;
  // low-ticket: the single best pick + a one-line why
  topPick: ScoredTool | null;
  topPickReason: string;
  /** True when nothing scored — the honest "no confident recommendation" state. */
  empty: boolean;
}

/**
 * The LOW-TICKET entry result: ONE personalized, niche-fit tool — never a
 * household-name giant — plus an honest count of how much more the full audit
 * would surface. The upsell is baked into the shape: the client sees exactly
 * what they're NOT getting (the ranked stack, the plan, the ROI), which is the
 * curiosity hook into the $1,500 AI Audit Stack inside OrganicPosts.
 */
export interface EntryResult {
  /** The single niche recommendation, or null when nothing niche-fit matched. */
  pick: ScoredTool | null;
  /** One-line why this tool, for this client. */
  reason: string;
  /** How many tools in total matched the client's pains (what the full audit ranks). */
  totalMatched: number;
  /** totalMatched − 1 (the tools this entry check deliberately withholds). */
  withheldCount: number;
  /** Human summary of the pains (deck: "The Pain"), echoed for the entry card. */
  painSummary: string;
  /** True when no niche-fit tool matched — the honest "book a call" state. */
  empty: boolean;
}
