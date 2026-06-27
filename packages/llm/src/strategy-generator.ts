/**
 * strategy-generator.ts — Ozvor · C3 GEO Content Plan
 *
 * Converts a completed audit's measured signals into a prioritized, dated
 * action plan + 4-week content calendar. Deterministic rules engine (no LLM
 * required) so it runs without keys; an LLM enrichment pass can rephrase later.
 *
 * Maps each weak signal to a recommendation tagged to a GEO vector
 * (brand/performance/ai) with effort + impact + priority (AC-C3-1/2).
 * Builds a 4-week calendar from the highest-impact recommendations (AC-C3-3).
 *
 * GEO-A2: competitor brand names are NOT used to generate content prompts here;
 * the plan references competitor PRESSURE only as an anonymised count.
 * Everything is a DRAFT requiring human review (AC-C3-4).
 */

export interface StrategyInputs {
  scores: { brand: number; performance: number; ai: number; overall: number | null };
  /** measured input vectors from the audit breakdown (0–1 each / booleans). */
  components: {
    brand: Record<string, number | boolean>;
    performance: Record<string, number | boolean>;
    ai: Record<string, number | boolean>;
  } | null;
  /** off-site source presence (label + present) from the audit. */
  offsiteSources?: Array<{ label: string; present: boolean }>;
  /** content citation-worthiness traits (0–1). */
  contentTraits?: Record<string, number> | null;
  /** number of competitors detected displacing the brand (anonymised count). */
  displacedByCompetitors?: number;
  /** Prompts (verbatim question text) where the brand was ABSENT in all/most runs. Safe to show — these are the brand's own category prompts. */
  absentPrompts?: string[];
  /** Per-engine absence — which providers did NOT cite the brand (for evidence). */
  absentEngines?: string[];
  /** High-authority off-site sources that are MISSING by name (G2, Trustpilot, etc. — these are not competitors, safe to name). */
  missingSources?: string[];
  /** Specific crawler(s) blocked in robots.txt (e.g., "GPTBot", "ClaudeBot"). */
  blockedCrawlers?: string[];
  /** Brand name — used to fill [brand] placeholders in calendar topics. */
  brandName?: string;
  /** Category / industry — used to fill [category] placeholders in calendar topics. */
  category?: string;
}

export interface Recommendation {
  vector: "brand" | "performance" | "ai";
  gap: string;
  action: string;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  priority: number; // higher = sooner
  evidence?: string;   // specific finding from THIS audit
  metric?: string;     // what to watch to know it worked
  owner?: "you" | "organicposts" | "platform";
}

export interface CalendarItem {
  week: number; // 1–4
  topic: string;
  channel: string;
  vector: "brand" | "performance" | "ai";
}

export interface StrategyPlan {
  recommendations: Recommendation[];
  calendar: CalendarItem[];
}

const impactRank = { low: 1, medium: 2, high: 3 } as const;

function num(v: number | boolean | undefined): number {
  if (typeof v === "boolean") return v ? 1 : 0;
  return typeof v === "number" ? v : 0.5;
}

/**
 * Generate the plan. Pure function — deterministic from inputs.
 */
export function generateStrategy(inputs: StrategyInputs): StrategyPlan {
  const recs: Recommendation[] = [];
  const perf = inputs.components?.performance ?? {};
  const ai = inputs.components?.ai ?? {};

  // ---- PERFORMANCE recommendations ----
  if (num(perf["schemaCoverage"]) < 0.6) {
    recs.push({
      vector: "performance",
      gap: "Your site has limited schema.org structured data, so AI engines can't easily parse what you offer.",
      action: "Add Organization, FAQPage, and Article schema to your key pages.",
      effort: "medium", impact: "high", priority: 90,
      metric: "Schema coverage score (target: >60%)",
      owner: "you",
    });
  }
  // Knowledge-graph entity recognition (C7). Google's 2026 guidance: be a
  // recognized, consistent entity — not llms.txt files (which Google says are
  // not required, so we no longer recommend them).
  if (num((inputs.components?.brand ?? {})["entityCompleteness"]) < 0.7) {
    recs.push({
      vector: "brand",
      gap: "Your brand isn't strongly resolved as a knowledge-graph entity, so AI engines may not recognize you as a distinct, trusted entity.",
      action: "Create or complete your Wikidata entity (official website, industry, founding date) and keep name/description consistent across sources — this is what drives AI entity recognition.",
      effort: "medium", impact: "high", priority: 82,
      metric: "Entity completeness score in Wikidata/Wikipedia (target: >70%)",
      owner: "you",
    });
  }
  if (num(perf["aiCrawlerAccess"]) < 1) {
    const crawlerEvidence =
      inputs.blockedCrawlers && inputs.blockedCrawlers.length > 0
        ? `The following AI crawlers are blocked in your robots.txt: ${inputs.blockedCrawlers.join(", ")}.`
        : undefined;
    recs.push({
      vector: "performance",
      gap: "One or more AI crawlers (GPTBot, ClaudeBot, PerplexityBot) are blocked in robots.txt.",
      action: "Allow the major AI crawlers in robots.txt so engines can read your site.",
      effort: "low", impact: "high", priority: 95,
      ...(crawlerEvidence !== undefined ? { evidence: crawlerEvidence } : {}),
      metric: "AI crawler access score (target: fully allowed)",
      owner: "you",
    });
  }

  // ---- AI recommendations ----
  if (num(ai["citationRate"]) < 0.5) {
    let citationEvidence: string | undefined;
    if (inputs.absentPrompts && inputs.absentPrompts.length > 0 && inputs.absentEngines && inputs.absentEngines.length > 0) {
      const sample = inputs.absentPrompts.slice(0, 2);
      citationEvidence = `Your brand was not mentioned for ${inputs.absentPrompts.length} tested prompt(s). Example prompts where you're absent: "${sample.join('", "')}". Engines that didn't cite you: ${inputs.absentEngines.join(", ")}.`;
    } else if (inputs.absentPrompts && inputs.absentPrompts.length > 0) {
      citationEvidence = `Your brand was not mentioned for ${inputs.absentPrompts.length} tested prompt(s). Example: "${inputs.absentPrompts[0]}".`;
    }
    const aiScore = inputs.scores.ai;
    const citMetric =
      aiScore != null
        ? `Citation rate across buyer prompts (current: ${aiScore}% → target: >50%)`
        : "Citation rate across buyer prompts (current: see audit → target: >50%)";
    recs.push({
      vector: "ai",
      gap: "Your brand is cited in fewer than half of the buyer prompts we tested.",
      action: "Publish answer-shaped content (comparison pages, FAQs) targeting the prompts where you're absent.",
      effort: "high", impact: "high", priority: 100,
      ...(citationEvidence !== undefined ? { evidence: citationEvidence } : {}),
      metric: citMetric,
      owner: "you",
    });
  }
  if (num(ai["avgPositionScore"]) < 0.5 && num(ai["citationRate"]) >= 0.5) {
    recs.push({
      vector: "ai",
      gap: "When cited, your brand tends to appear low in the AI answer.",
      action: "Strengthen authority signals and specificity so engines rank you higher in answers.",
      effort: "medium", impact: "medium", priority: 75,
      metric: "Average citation position in AI answers (target: top 2)",
      owner: "you",
    });
  }

  // ---- BRAND recommendations from off-site gaps ----
  const missing = (inputs.offsiteSources ?? []).filter((s) => !s.present).map((s) => s.label);
  if (missing.length > 0) {
    const offsiteEvidence =
      inputs.missingSources && inputs.missingSources.length > 0
        ? `Your brand is absent from: ${inputs.missingSources.join(", ")}. These are among the highest-authority sources AI cites when answering buyer questions in your category.`
        : `You're absent from high-authority sources AI cites most: ${missing.join(", ")}.`;
    recs.push({
      vector: "brand",
      gap: `You're absent from high-authority sources AI cites most: ${missing.join(", ")}.`,
      action: `Establish presence on ${missing.slice(0, 3).join(", ")} (profiles, reviews, or genuine community participation).`,
      effort: "medium", impact: "high", priority: 88,
      evidence: offsiteEvidence,
      metric: "Number of high-authority sources where you have a verified presence (target: 5+ of 7)",
      owner: "you",
    });
  }

  // ---- Content citation-worthiness ----
  const traits = inputs.contentTraits ?? {};
  if (num(traits["statistics"]) < 0.5) {
    recs.push({
      vector: "performance",
      gap: "Your content lacks statistics and data points — a top driver of AI citations.",
      action: inputs.absentPrompts && inputs.absentPrompts.length > 0
        ? `Add specific statistics, benchmarks, and data to your key pages — especially on "${inputs.absentPrompts[0]}" type queries where buyers expect data-backed answers.`
        : "Add specific statistics, benchmarks, and data points (with year and source) to your key pages.",
      effort: "medium", impact: "high", priority: 85,
      metric: "Content citation-worthiness score — statistics trait (target: >50%)",
      owner: "you",
      ...(inputs.absentPrompts && inputs.absentPrompts.length > 0
        ? { evidence: `Your brand is absent for buyer queries like: "${inputs.absentPrompts[0]}". Answer-shaped content directly addresses these.` }
        : {}),
    });
  }
  if (num(traits["sourcedClaims"]) < 0.5) {
    recs.push({
      vector: "performance",
      gap: "Few sourced claims — AI engines prefer content that cites authoritative references.",
      action: "Back key claims with citations and links to credible sources.",
      effort: "low", impact: "medium", priority: 65,
      metric: "Content citation-worthiness score — sourced-claims trait (target: >50%)",
      owner: "you",
    });
  }
  if (num(traits["answerShaped"]) < 0.5) {
    recs.push({
      vector: "ai",
      gap: "Little answer-shaped content (FAQ / Q&A structure) for engines to extract.",
      action: inputs.absentPrompts && inputs.absentPrompts.length > 0
        ? `Add FAQ sections and Q&A-shaped headings to your service pages. Start with the exact buyer question: "${inputs.absentPrompts[0]}"`
        : "Add FAQ sections and question-style headings to your service pages.",
      effort: "low", impact: "high", priority: 82,
      metric: "Content citation-worthiness score — answer-shaped trait (target: >50%)",
      owner: "you",
      ...(inputs.absentPrompts && inputs.absentPrompts.length > 0
        ? { evidence: `Your brand is absent for buyer queries like: "${inputs.absentPrompts[0]}". Answer-shaped content directly addresses these.` }
        : {}),
    });
  }

  // ---- Competitor pressure (anonymised count, GEO-A2) ----
  if ((inputs.displacedByCompetitors ?? 0) > 0) {
    recs.push({
      vector: "ai",
      gap: `Competitors were recommended instead of you in ${inputs.displacedByCompetitors} prompt(s).`,
      action: "Create comparison and alternative pages targeting those buyer questions.",
      effort: "high", impact: "high", priority: 92,
      // evidence omitted: competitor names must NOT appear here (GEO-A2); only the anonymised count is in gap
      metric: "Citation rate on prompts where competitors displaced you (target: appear in those prompts)",
      owner: "you",
    });
  }

  // Always ensure at least 5 recommendations (AC-C3-1) — add evergreen GEO plays.
  // Evergreen cards have no evidence/metric — they are truly generic.
  const evergreen: Recommendation[] = [
    {
      vector: "brand",
      gap: "Consistent entity signals improve how AI identifies your brand.",
      action: "Audit name, logo, description, and website URL across all public profiles for exact consistency.",
      effort: "low", impact: "medium", priority: 50, owner: "you",
      metric: "Entity completeness score (target: >70% on next audit)",
    },
    {
      vector: "performance",
      gap: "Fresh, dated content is favoured over stale pages by AI engines.",
      action: "Publish or refresh one citation-worthy article per week — include a 'Last updated: [date]' line and at least one statistic.",
      effort: "medium", impact: "medium", priority: 45, owner: "you",
      metric: "Content freshness: number of pages with 'Last updated' within 90 days",
    },
    {
      vector: "ai",
      gap: "Without regular monitoring, AI answer drift goes undetected.",
      action: "Enable weekly monitoring in Ozvor AI Visibility to catch score drops before they compound.",
      effort: "low", impact: "medium", priority: 40, owner: "you",
      metric: "Ozvor AI Visibility Score trend week-over-week (target: stable or improving)",
    },
  ];
  for (const e of evergreen) {
    if (recs.length >= 5) break;
    recs.push(e);
  }

  // Sort by priority desc.
  recs.sort((a, b) => b.priority - a.priority);

  // ---- 4-week calendar from the top recommendations (AC-C3-3) ----
  const channelFor = (v: string) =>
    v === "ai" ? "Website (comparison/FAQ)" : v === "performance" ? "Website (content)" : "LinkedIn + profiles";
  const calendar: CalendarItem[] = recs.slice(0, 4).map((r, i) => ({
    week: i + 1,
    topic: toCalendarTopic(r, inputs.absentPrompts, inputs.brandName, inputs.category),
    channel: channelFor(r.vector),
    vector: r.vector,
  }));

  return { recommendations: recs, calendar };
}

/**
 * Convert a recommendation's action instruction into a publishable content topic.
 *
 * The calendar `action` field is written as an instruction (e.g. "Add Organization,
 * FAQPage, and Article schema to your key pages."). That is not a content topic.
 * This function derives a buyer-facing topic from the recommendation's vector,
 * gap, and any absent buyer prompts so the calendar entry can be handed directly
 * to the Content Studio.
 *
 * @param rec - The recommendation to derive a topic from.
 * @param absentPrompts - Verbatim buyer queries where the brand was absent
 *   (from the audit's citation_check). Used as the most specific signal for
 *   AI-vector entries.
 */
export function toCalendarTopic(
  rec: Recommendation,
  absentPrompts?: string[],
  brandName?: string,
  category?: string,
): string {
  const action = rec.action;
  const brand = brandName ?? "[brand]";
  const cat = category ?? "[category]";

  // AI vector — highest priority: use an absent prompt if available, as that is
  // the exact buyer question the piece must answer.
  if (rec.vector === "ai") {
    if (absentPrompts && absentPrompts.length > 0) {
      // Use the first absent prompt directly — it is the exact buyer query to answer.
      return absentPrompts[0] as string;
    }
    // No absent prompts — derive from the action text.
    if (/comparison|alternative/i.test(action)) {
      return "Comparison guide: what to look for (and what to avoid)";
    }
    if (/FAQ|question/i.test(action)) {
      return "Frequently asked questions: what buyers ask before choosing";
    }
    // Generic AI fallback.
    return stripInstruction(action);
  }

  // Performance vector — schema / content / data oriented.
  if (rec.vector === "performance") {
    if (/schema/i.test(action)) {
      return `What is ${cat}? A complete buyer's guide`;
    }
    if (/statistic|number|benchmark|data/i.test(action)) {
      return `The data: key benchmarks buyers use to evaluate ${cat}`;
    }
    if (/FAQ|question/i.test(action)) {
      return `FAQ: the most common questions about ${cat}`;
    }
    if (/crawl|robot|access/i.test(action)) {
      return `How ${brand} makes its expertise findable in AI search`;
    }
    // Generic performance fallback.
    return stripInstruction(action);
  }

  // Brand vector — entity / off-site / profile oriented.
  if (rec.vector === "brand") {
    if (/off-site|profile|review|G2|Trustpilot|LinkedIn|reddit/i.test(action)) {
      return `About us: what ${brand} does and who we serve`;
    }
    if (/entity|Wikidata|Wikipedia|consistent/i.test(action)) {
      return `${brand} company profile: who we are and what we stand for`;
    }
    // Generic brand fallback.
    return stripInstruction(action);
  }

  // Unknown vector — safe fallback.
  return stripInstruction(action);
}

/**
 * Strip leading imperative verbs from an action string to turn an instruction
 * into a topic. Caps at 80 characters.
 *
 * E.g. "Add Organization, FAQPage, and Article schema to your key pages."
 *   → "Organization, FAQPage, and Article schema on your key pages"
 */
function stripInstruction(action: string): string {
  return action
    .replace(/^(Add|Create|Publish|Establish|Allow|Strengthen|Enable|Back|Ensure)\s+/i, "")
    .replace(/\.$/, "")
    .slice(0, 80);
}
