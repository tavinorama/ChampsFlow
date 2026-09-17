/**
 * prompt-portfolio-local.ts — buyer questions for a LOCAL SERVICE business, used
 * by the Design Partner Pack only.
 *
 * Why it exists (17/09): the default portfolio (prompt-portfolio.ts) is written
 * for software — "How to choose a {cat} vendor", "Best {cat} for SMBs on a
 * budget", "Most trusted {cat} companies". The first live pack asked a criminal
 * defense attorney in Portland those questions. A roofer or a lawyer reading
 * "vendor" and "SMBs on a budget" sees a template, and the founder's rule is
 * that nothing generic goes out. The product portfolio is NOT changed here:
 * its texts are part of the audit methodology and score comparability.
 *
 * Same five intents, two formulations each, same order of intents — so the
 * sampler's per-intent aggregation works unchanged.
 */
import type { PortfolioPrompt } from "./prompt-portfolio";

/** "a roofer" / "an HVAC company" — the article a person would say. */
function withArticle(service: string): string {
  return /^[aeiou]/i.test(service) || /^(hvac|mba|fbi)\b/i.test(service) ? `an ${service}` : `a ${service}`;
}

export function buildLocalServicePortfolio(brandName: string, service: string, place: string): PortfolioPrompt[] {
  const svc = service.trim();
  const where = place.trim();
  const a = withArticle(svc);
  return [
    { text: `Who is the best ${svc} in ${where}?`, intentId: "local_best", formulationIx: 0 },
    { text: `I need ${a} in ${where}. Who should I call?`, intentId: "local_service", formulationIx: 0 },
    { text: `Which ${svc} options in ${where} should I compare before I hire one?`, intentId: "comparison", formulationIx: 0 },
    { text: `Which ${svc} in ${where} has the best reviews?`, intentId: "trust_review", formulationIx: 0 },
    { text: `Most trusted ${svc} in ${where}`, intentId: "trust_review", formulationIx: 1 },
    { text: `Best rated ${svc} near ${where}`, intentId: "local_best", formulationIx: 1 },
    { text: `${brandName} vs other ${svc} options in ${where}`, intentId: "brand_direct", formulationIx: 0 },
    { text: `Is ${brandName} a good ${svc} in ${where}?`, intentId: "brand_direct", formulationIx: 1 },
    { text: `What should I ask before I hire ${a} in ${where}?`, intentId: "comparison", formulationIx: 1 },
    { text: `How do I choose ${a} in ${where}?`, intentId: "local_service", formulationIx: 1 },
  ];
}
