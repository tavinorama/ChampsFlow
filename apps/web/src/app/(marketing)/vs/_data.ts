/**
 * Competitor comparison data for /vs/[competitor].
 *
 * Sourced from docs/departments/sales/battlecards.md (the sales team's
 * researched battle cards). Pricing figures marked `pricingNote` where the
 * battlecards flagged them as review-site-sourced / unverified — surfaced
 * honestly on the page rather than presented as fact. That honesty is the
 * point of the page: we hold ourselves to the same measurement standard we
 * sell.
 *
 * Every claim about a competitor is either their published pricing or a
 * capability gap corroborated in the battlecards. When we lose, we say so —
 * the `whenTheyWin` field is rendered on the page.
 */

export interface CompetitorRow {
  feature: string;
  ozvor: string;
  them: string;
  /** 'ozvor' | 'them' | 'tie' — which side the row favors, for the check mark. */
  edge: "ozvor" | "them" | "tie";
}

export interface Competitor {
  slug: string;
  name: string;
  /** One-line category descriptor. */
  category: string;
  /** Hero sub-thesis: the single sharpest true difference. */
  thesis: string;
  entryPrice: string;
  pricingNote?: string;
  strengths: string[];
  gaps: string[];
  rows: CompetitorRow[];
  /** Honest: the buyer for whom they are the right call. */
  whenTheyWin: string;
  /** The battlecard's landmine question, reframed for the reader. */
  landmine: string;
}

const OZVOR_LADDER = "Free audit → $29 Kit → $99/mo Growth → $249/mo Agency (white-label)";

export const COMPETITORS: Competitor[] = [
  {
    slug: "profound",
    name: "Profound",
    category: "Enterprise AEO platform",
    thesis:
      "Profound's own reviewers say the useful tier starts at $399/mo — and still needs a dedicated person to run the dashboard. Ozvor ships the audit, the plan and the content drafts together, from $99/mo.",
    entryPrice: "$99/mo (Starter — ChatGPT only, 50 prompts)",
    pricingNote:
      "Independent reviews note real functionality starts at the $399/mo Growth tier; Starter is effectively a teaser.",
    strengths: [
      "Up to 10 answer engines at the Enterprise tier",
      "SSO/SAML, SOC 2 — real enterprise governance",
      "Established brand with venture backing",
    ],
    gaps: [
      "Functional tier is $399/mo minimum (per their own reviewers)",
      "Steep learning curve; onboarding is Enterprise-only",
      "No content generation, no evidence-backed action plan, no done-for-you arm",
      "No SMB pricing, no white-label agency tier at our price point",
    ],
    rows: [
      { feature: "Entry price", ozvor: "Free → $29 → $99/mo", them: "$99/mo (functional at $399/mo)", edge: "ozvor" },
      { feature: "Turns the audit into content", ozvor: "Yes — BYOK drafts in the same session", them: "No", edge: "ozvor" },
      { feature: "Evidence-backed action plan", ozvor: "Yes — every audit", them: "No", edge: "ozvor" },
      { feature: "Done-for-you execution", ozvor: "OrganicPosts, from $1,500", them: "No", edge: "ozvor" },
      { feature: "White-label agency tier", ozvor: "$249/mo, 25 brands", them: "Not at this price point", edge: "ozvor" },
      { feature: "Public measurement methodology", ozvor: "Yes — /how-we-measure", them: "Not published", edge: "ozvor" },
      { feature: "Engine coverage", ozvor: "5 engines", them: "Up to 10 (Enterprise)", edge: "them" },
      { feature: "SSO / SOC 2", ozvor: "On the roadmap", them: "Yes (Enterprise)", edge: "them" },
    ],
    whenTheyWin:
      "A Fortune 1000 or venture-backed company that needs SOC 2, SSO, 10-engine coverage and has budget for a $399–2,000+/mo tool with a dedicated marketing-ops person should choose Profound. That's a genuinely different buyer than ours.",
    landmine:
      "At $99/mo Starter you get ChatGPT only and 50 prompts. Is that enough to run a real program — or were you already budgeting for the $399 tier?",
  },
  {
    slug: "peec",
    name: "Peec AI",
    category: "AI-search monitoring",
    thesis:
      "Peec tells you where you stand. Ozvor tells you where you stand and hands you an evidence-backed plan plus ready-to-review content drafts — in the same session, no separate tool, no agency handoff.",
    entryPrice: "~$95/mo (Starter — 50 prompts, 3 models)",
    pricingNote:
      "Peec's own pricing page did not render dollar figures on fetch; these are corroborated by review sites, not Peec's own page text. Treat as verify-before-quoting.",
    strengths: [
      "Strong, focused monitoring product with a 5.0 G2 rating",
      "Clean, agency-grade UI",
      "Established in the direct-monitoring category",
    ],
    gaps: [
      "Explicitly diagnosis-only — tracks mentions but doesn't write content",
      "No action-plan generator, no BYOK content engine, no DFY arm",
      "Per-prompt pricing scales fast; extra engines cost $35–165/mo each",
      "No detailed public methodology beyond marketing copy",
    ],
    rows: [
      { feature: "Entry price", ozvor: "Free → $29 → $99/mo", them: "~$95/mo (unverified)", edge: "ozvor" },
      { feature: "Turns the audit into content", ozvor: "Yes — BYOK drafts", them: "No", edge: "ozvor" },
      { feature: "Evidence-backed action plan", ozvor: "Yes", them: "No", edge: "ozvor" },
      { feature: "Done-for-you execution", ozvor: "OrganicPosts", them: "No", edge: "ozvor" },
      { feature: "White-label agency tier", ozvor: "$249/mo, 25 brands", them: "Not found on public pages", edge: "ozvor" },
      { feature: "Monitoring depth", ozvor: "5 engines, weekly", them: "Strong, dedicated", edge: "tie" },
    ],
    whenTheyWin:
      "If a prospect only wants monitoring — no interest in acting on findings themselves, already has a content team — and needs deep multi-engine coverage with a polished UI today, Peec's monitoring depth and 5.0 rating make it a legitimate choice.",
    landmine:
      "When Peec tells you your citation rate dropped, what happens next in your workflow — who writes the content to fix it, and how long does that take?",
  },
  {
    slug: "otterly",
    name: "Otterly.AI",
    category: "Budget AI-search monitoring",
    thesis:
      "Otterly's $29/mo Lite tier is genuinely SMB-friendly — but it's pure diagnosis. Our $29 Get-Cited Kit matches the price and adds an evidence-backed action plan, not just a score.",
    entryPrice: "$29/mo (Lite — 15 prompts)",
    strengths: [
      "Lowest published entry price in direct monitoring ($29/mo)",
      "50+ country tracking on every tier",
      "Page-level GEO audit (AI-readiness grading) is a real differentiator",
    ],
    gaps: [
      "Zero content creation — audits pages but can't write or optimize",
      "No GA4 integration, no traffic/revenue attribution",
      "Per-prompt pricing compounds — $189/mo covers only 100 prompts",
      "Reported data-refresh lag from scheduled crawl cycles",
    ],
    rows: [
      { feature: "Entry price", ozvor: "Free → $29 Kit", them: "$29/mo", edge: "tie" },
      { feature: "Turns the audit into content", ozvor: "Yes — BYOK drafts", them: "No", edge: "ozvor" },
      { feature: "Evidence-backed action plan", ozvor: "Yes", them: "No", edge: "ozvor" },
      { feature: "Revenue / GA4 attribution", ozvor: "Yes — connectors", them: "No", edge: "ozvor" },
      { feature: "Done-for-you execution", ozvor: "OrganicPosts", them: "No", edge: "ozvor" },
      { feature: "Per-page GEO grading", ozvor: "In the audit", them: "Dedicated feature", edge: "them" },
      { feature: "Country coverage", ozvor: "US/EU regions", them: "50+ countries", edge: "them" },
    ],
    whenTheyWin:
      "A team that specifically wants granular per-page GEO grading as a standalone SEO-adjacent workflow, and is comfortable pairing it with its own content and dev resources, may prefer Otterly's narrower, cheaper entry tier.",
    landmine:
      "If Otterly flags a page as AI-unreadable, who on your team writes the fix — and does anyone track whether it actually moved your citation rate?",
  },
  {
    slug: "athenahq",
    name: "AthenaHQ",
    category: "Action-oriented AI-visibility",
    thesis:
      "AthenaHQ validates our thesis — monitoring alone isn't enough, so they built an action agent too. But their Starter tier is $295/mo, roughly 3× our Growth tier, before you reach real optimization actions.",
    entryPrice: "$295/mo (Starter — 3,600 credits, 9 models)",
    pricingNote:
      "Older sources cite $95/mo; the current verified Starter price is $295/mo. Promotions sometimes discount the first month to ~$95.",
    strengths: [
      "Genuinely more action-oriented than monitoring-only tools",
      "Broad engine coverage (9 models) at Starter",
      "Usable free tier for a first look",
    ],
    gaps: [
      "$295/mo Starter is a 3×–10× jump over our entry tiers",
      "Credit metering (1 credit = 1 AI response) can create usage anxiety",
      "No BYOK model found — content-agent cost control undisclosed",
      "No white-label agency tier or DFY arm on public pages",
    ],
    rows: [
      { feature: "Entry price", ozvor: "Free → $29 → $99/mo", them: "$295/mo", edge: "ozvor" },
      { feature: "Action layer", ozvor: "Evidence plan + BYOK drafts", them: "Content-optimization agent", edge: "tie" },
      { feature: "Client-visible content cost", ozvor: "Yes — you control the model", them: "Opaque credit metering", edge: "ozvor" },
      { feature: "White-label agency tier", ozvor: "$249/mo, 25 brands", them: "Not found", edge: "ozvor" },
      { feature: "Done-for-you execution", ozvor: "OrganicPosts", them: "No", edge: "ozvor" },
      { feature: "Engine coverage", ozvor: "5 engines", them: "9 models (Starter)", edge: "them" },
    ],
    whenTheyWin:
      "A team with $295+/mo budget that wants an all-in-one agent doing on-page and off-page actions automatically, and values Enterprise-only features like Oracle discrepancy detection, may prefer AthenaHQ's more automated action layer over our human-approved BYOK drafting.",
    landmine:
      "At $295/mo for 3,600 credits, what happens to your program the month you burn through them faster than expected?",
  },
  {
    slug: "semrush-ai",
    name: "Semrush AI Toolkit",
    category: "SEO incumbent + AI module",
    thesis:
      "Semrush bolts an AI-visibility module onto an SEO suite. Ozvor is GEO-native — and the only option here that turns the audit into content, not just another dashboard tab.",
    entryPrice: "$99/mo standalone (25 prompts) / $199/mo bundled",
    pricingNote:
      "Semrush's own pricing page did not render dollar figures on direct fetch; these are review-site corroborated.",
    strengths: [
      "Deep, established SEO platform you may already pay for",
      "AI visibility across 5+ platforms at the bundled tier",
      "Trusted incumbent brand",
    ],
    gaps: [
      "AI module retrofitted onto an SEO suite, not GEO-native",
      "No content generation, no action plan, no DFY arm",
      "Full coverage requires stacking add-ons ($199+/mo)",
      "No free trial for the standalone AI toolkit",
    ],
    rows: [
      { feature: "Entry price", ozvor: "Free → $29 → $99/mo", them: "$99/mo standalone", edge: "tie" },
      { feature: "GEO-native", ozvor: "Yes — built for it", them: "AI module on an SEO suite", edge: "ozvor" },
      { feature: "Turns the audit into content", ozvor: "Yes — BYOK drafts", them: "No", edge: "ozvor" },
      { feature: "Public measurement methodology", ozvor: "Yes", them: "Not published", edge: "ozvor" },
      { feature: "Done-for-you execution", ozvor: "OrganicPosts", them: "No", edge: "ozvor" },
      { feature: "Broad traditional-SEO tooling", ozvor: "Not our focus", them: "Deep, mature", edge: "them" },
    ],
    whenTheyWin:
      "A team already running a full Semrush subscription for traditional SEO, that wants AI visibility as one more tab in a tool it already pays for and doesn't need content generation or a DFY arm, will find the bundle convenient.",
    landmine:
      "When the Semrush AI tab flags a gap, does anything in your workflow actually produce the content to close it — or is it one more chart to screenshot?",
  },
  {
    slug: "ahrefs-brand-radar",
    name: "Ahrefs Brand Radar",
    category: "SEO incumbent + AI add-on",
    thesis:
      "Brand Radar is an AI add-on on top of an Ahrefs base plan — full coverage runs toward $828/mo combined, and independent testing has questioned its mention accuracy. Ozvor measures live and says so when a probe fails.",
    entryPrice: "$199/mo add-on (+$129/mo Ahrefs base required)",
    pricingNote:
      "Realistic full multi-platform coverage lands near ~$828/mo combined. Accuracy figures below come from a competing vendor's test — treat the exact numbers as a claim, not established fact.",
    strengths: [
      "Deep, established backlink/SEO platform",
      "Useful if you already run Ahrefs for traditional SEO",
    ],
    gaps: [
      "Add-on on top of a base plan — realistic cost ~$828/mo for full coverage",
      "Claude missing from the engine list entirely",
      "Independent test reported significant mention undercounts",
      "No content generation, no action plan, no DFY arm",
    ],
    rows: [
      { feature: "Entry price", ozvor: "Free → $29 → $99/mo", them: "$199/mo add-on (+base)", edge: "ozvor" },
      { feature: "Claude coverage", ozvor: "Yes", them: "Not covered", edge: "ozvor" },
      { feature: "Turns the audit into content", ozvor: "Yes — BYOK drafts", them: "No", edge: "ozvor" },
      { feature: "Fails honestly instead of guessing", ozvor: "Yes — audit fails if a probe fails", them: "Undercount concerns reported", edge: "ozvor" },
      { feature: "Done-for-you execution", ozvor: "OrganicPosts", them: "No", edge: "ozvor" },
      { feature: "Backlink / traditional SEO depth", ozvor: "Not our focus", them: "Deep, mature", edge: "them" },
    ],
    whenTheyWin:
      "An SEO team already deep in the Ahrefs ecosystem for backlinks and traditional rank tracking, that wants AI visibility as a bolt-on and isn't bothered by the missing Claude coverage, may prefer keeping everything in one vendor.",
    landmine:
      "If an independent test found Brand Radar reporting a fraction of the actual ChatGPT and Perplexity mentions, how confident are you acting on its numbers — and where would you double-check them?",
  },
];

export const COMPETITOR_SLUGS = COMPETITORS.map((c) => c.slug);

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}

export const OZVOR_ONELINE =
  "GEO-native audit → evidence-backed plan → BYOK content drafts → OrganicPosts done-for-you.";
export const OZVOR_LADDER_TEXT = OZVOR_LADDER;
