/**
 * promise-ledger.ts — C01 / P19 (Codex 19/09; still open on 23/09).
 *
 * "Home, preço, posts, e-mail e contrato não divergem de quantidade, prazo,
 * prova e preço." The prices already have one source (pricing.ts); the
 * QUANTITIES, TIMELINES and GUARANTEES did not, and the claims that need
 * evidence ("replace a specialist", "six weeks later") had no register of
 * whether that evidence exists. This ledger is that register, and
 * tests/unit/promise-ledger.test.ts scans the SKU pages against it: an
 * amount not derivable from here, or a watched claim without an entry here,
 * fails the build. An `unsupported` claim is allowed to stay on the page only
 * while it is listed here by id — visible, owned, and pinned by the test so
 * a second one cannot arrive silently.
 */
import { LIST_PRICE_USD, LIST_PRICE_ANNUAL_USD, founderAnnualPerMonthUsd, perBrandUsd } from "./pricing";
import { PLAN_LIMITS } from "./plan-limits";
import { DRIFT_ENGINES } from "./engine-names";

export type EvidenceState =
  /** measured on our own data and reproducible */
  | "measured"
  /** a stated policy we honour (refund terms, cancellation) */
  | "policy"
  /** an explicit disclaimer: the page says what we do NOT promise */
  | "honesty"
  /** an illustrative story; must read as a story, never as a result */
  | "scenario"
  /** derived from a constant (price, plan limit, engine count) */
  | "derived"
  /** no evidence on file — stays only while listed here; founder decides */
  | "unsupported";

export interface PromiseClaim {
  id: string;
  /** The wording on the page, as a regex the test matches against source text. */
  pattern: RegExp;
  sku: "kit" | "aiAudit" | "pages" | "growth" | "agency" | "organicposts" | "all";
  evidence: EvidenceState;
  note: string;
}

/** Quantities the pages promise, one source each. */
export const PROMISED_QUANTITIES = {
  engines: DRIFT_ENGINES.length, // "all 5 engines" / "five engines"
  agencyBrands: PLAN_LIMITS.agency.max_brands, // "up to 10 brands"
  kitFixes: 3, // "your top 3 fixes"
  kitDrafts: 3, // "3 ready-to-publish drafts"
  pagesPerSite: 5, // "5-page site"
  refundDays: 30, // "30-day money-back"
} as const;

/** Dollar amounts a SKU page may print, and why. */
export function allowedAmounts(): Map<number, string> {
  const m = new Map<number, string>();
  for (const [k, v] of Object.entries(LIST_PRICE_USD)) m.set(v, `list price ${k}`);
  for (const [k, v] of Object.entries(LIST_PRICE_ANNUAL_USD)) m.set(v, `annual list ${k}`);
  m.set(founderAnnualPerMonthUsd("growth"), "founder annual per month growth");
  m.set(founderAnnualPerMonthUsd("agency"), "founder annual per month agency");
  m.set(Math.round(Number(perBrandUsd(LIST_PRICE_USD.agency, PLAN_LIMITS.agency.max_brands))), "agency per brand, rounded");
  m.set(0, "free tier");
  m.set(100, "'under $100/mo' — Growth is $99 (derived ceiling)");
  // Story amounts (scenario): allowed only inside a claim listed below.
  m.set(30000, "story: '$30k/yr specialist' (claim pricing-replace-specialist)");
  m.set(40000, "story: 'Tuesday. A $40,000 job.' (claim home-film-story)");
  return m;
}

/**
 * Wording that must not appear on a SKU page unless a claim below covers
 * it. Ported from the cold-email FALSE_CLAIMS (campaigns_v4.py) and
 * widened with the site's own tells.
 */
export const WATCH_PATTERNS: RegExp[] = [
  /\bguarantee[ds]?\b/i, // word only — never the GuaranteeChip identifier
  /six weeks|6 weeks|in \d+ days|within \d+ (?:days|weeks)/i,
  /replaces? (?:a|an|your) (?:\$?[\d,]+k?(?:\/yr)? )?(?:specialist|agency|consultant)/i,
  /only (?:tool|platform|one) /i,
  /#1\b|number one|the first (?:tool|platform)/i,
  /can(?:no|'?)t check (?:it |this )?yoursel|only we can|nobody else can/i,
  /will (?:go under|go out of business|lose your business)/i,
];

export const PROMISE_LEDGER: PromiseClaim[] = [
  {
    id: "refund-30-days",
    pattern: /30[- ]day money[- ]back(?: guarantee| on any paid plan)?/i,
    sku: "all",
    evidence: "policy",
    note: "Refund policy on paid plans; terms page is the contract.",
  },
  {
    id: "deliverable-guarantee",
    pattern: /guarantee the deliverable|if your (?:5-page site|3 drafts) (?:isn|aren)/i,
    sku: "all",
    evidence: "policy",
    note: "We guarantee what we deliver (the site, the drafts), never AI outcomes.",
  },
  {
    id: "no-citation-guarantee",
    pattern: /no guaranteed citations|don'?t guarantee citations|not a guarantee of citation|guaranteed citations overnight/i,
    sku: "all",
    evidence: "honesty",
    note: "The explicit disclaimer. Keep it wherever a score or plan is sold.",
  },
  {
    id: "home-film-story",
    pattern: /Same question\. Six weeks later\.|six weeks later, with his name|\$40,000 job/i,
    sku: "growth",
    evidence: "scenario",
    note: "The home film is a story (a roofer, a Tuesday). It must read as a story: no customer, no measured lift behind 'six weeks'.",
  },
  {
    id: "pricing-replace-specialist",
    pattern: /Replace a \$30k\/yr specialist for under \$100\/mo/i,
    sku: "growth",
    evidence: "unsupported",
    note: "No evidence on file that Growth replaces a $30k/yr specialist. Listed so it is visible; the founder decides: reword, or produce the evidence (a customer who cancelled a specialist).",
  },
];

export function unsupportedClaims(): PromiseClaim[] {
  return PROMISE_LEDGER.filter((c) => c.evidence === "unsupported");
}

export function claimFor(text: string): PromiseClaim | null {
  return PROMISE_LEDGER.find((c) => c.pattern.test(text)) ?? null;
}
