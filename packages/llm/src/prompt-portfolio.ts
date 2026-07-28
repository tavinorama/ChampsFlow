/**
 * prompt-portfolio.ts — canonical default buyer-prompt portfolio (B1).
 *
 * Single source of truth for the 10 default audit prompts, now classified into
 * 5 named buyer INTENTS × 2 FORMULATIONS each. The prompt TEXTS are unchanged
 * from the pre-B1 portfolio (same wording, same order) — B1 only classifies
 * them so the sampler can aggregate runs per intent with a Wilson interval.
 *
 * Consumers:
 *  - apps/worker/src/jobs/audit-run.ts  (probe portfolio + intent tagging)
 *  - apps/api/src/routes/prompts.ts     (Prompt Library default list)
 *
 * ORDER MATTERS: the array order is the legacy display/cap order (free tier
 * caps at 10 prompts; the Prompt Library UI renders defaults in this order).
 * Do not reorder without checking both consumers.
 *
 * No PII: prompts are synthetic category/brand questions (GEO-A2).
 */

/** Named buyer intents in the default portfolio. */
export const PORTFOLIO_INTENTS = [
  "local_best", // "best X for a small business" — the money question
  "local_service", // finding / choosing a provider
  "comparison", // alternatives, pros & cons
  "trust_review", // trust and expert recommendation
  "brand_direct", // brand-name queries
] as const;

export type PortfolioIntent = (typeof PORTFOLIO_INTENTS)[number];

export interface PortfolioPrompt {
  text: string;
  /** Named buyer intent this prompt formulates. */
  intentId: string;
  /** 0-based formulation index within the intent. */
  formulationIx: number;
}

/**
 * buildIntentPortfolio — the default 10-prompt portfolio for a brand, with
 * intent classification. Texts and order are IDENTICAL to the legacy
 * buildPromptPortfolio() (guarded by unit test) — only the classification
 * metadata is new.
 */
export function buildIntentPortfolio(
  brandName: string,
  category: string | null
): PortfolioPrompt[] {
  const cat = category && category.trim() ? category.trim() : "solution";
  return [
    { text: `What is the best ${cat} for small businesses?`, intentId: "local_best", formulationIx: 0 },
    { text: `Top ${cat} providers in 2026`, intentId: "local_service", formulationIx: 0 },
    { text: `${cat} alternatives worth considering`, intentId: "comparison", formulationIx: 0 },
    { text: `Which ${cat} do experts recommend?`, intentId: "trust_review", formulationIx: 0 },
    { text: `Most trusted ${cat} companies`, intentId: "trust_review", formulationIx: 1 },
    { text: `Best ${cat} for SMBs on a budget`, intentId: "local_best", formulationIx: 1 },
    { text: `${brandName} vs competitors`, intentId: "brand_direct", formulationIx: 0 },
    { text: `Is ${brandName} a good choice?`, intentId: "brand_direct", formulationIx: 1 },
    { text: `Pros and cons of leading ${cat} options`, intentId: "comparison", formulationIx: 1 },
    { text: `How to choose a ${cat} vendor`, intentId: "local_service", formulationIx: 1 },
  ];
}
