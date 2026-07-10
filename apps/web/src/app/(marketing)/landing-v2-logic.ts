/**
 * landing-v2-logic.ts — pure, framework-free logic for the v2 homepage
 * (feat/landing-v2-home, design handoff: design_handoff_ozvor_landing/).
 *
 * Every function here is a pure derivation of the small interactive state
 * {scene, tick, paused, score, faqOpen, answerPlaying, answerTick, kitPlaying,
 * kitTick} owned by LandingV2.tsx — kept here (no React, no DOM) so it can be
 * unit-tested directly (see landing-v2-logic.test.ts) and so the client
 * component stays a thin rendering layer. Mirrors the "logic class" pattern
 * from the design handoff's .dc.html reference.
 *
 * Founder-approved deltas from the raw design handoff:
 *  - Gold (#e6a93f) replaced with emerald on every Kit-related element
 *    (BRAND-GUIDE.md: "Gold is reserved for OrganicPosts only"). Gold is kept
 *    ONLY on the two explicitly whitelisted gradient hairlines (hero progress
 *    bar, score-card border) — rendered directly in LandingV2.tsx, not here.
 *  - Real self-audit values (2026-07-10 geo_score row) replace the
 *    prototype's placeholder 71/78/70 sub-scores.
 *  - Hero demo cut from 4 scenes to 3 (the score-reveal scene duplicated the
 *    live score card in section 2 — 2026-07-11 founder feedback).
 *  - Section 2 + 3 simulations redesigned to three distinct "visual
 *    grammars" (2026-07-11 founder feedback: the original checklist-style
 *    sims for hero/weekly/Kit all looked the same): hero = product story,
 *    section 2 = streaming AI-answer chat, section 3 = document-flip cards.
 *  - All three sims are simulated product animations, not real screen
 *    recordings — every surface says so ("EXAMPLE DATA"), per the house rule
 *    against rendering fabricated metrics as if real.
 */

// ---------------------------------------------------------------------------
// Real self-audit data — Ozvor's own Ozvor AI Visibility Score.
// SOURCE: geo_score row dated 2026-07-10 ("we run Ozvor on Ozvor" — the same
// build-in-public claim the old homepage sourced from GET /api/showcase/geo).
// TODO(post-launch): wire this to that same public self-score endpoint
// instead of a hardcoded snapshot, so the number updates automatically every
// week rather than needing a manual edit here.
// ---------------------------------------------------------------------------
export const REAL_SCORE = {
  overall: 73,
  visibility: 54,
  citationReadiness: 82,
  execution: 0,
} as const;

export const SUB_SCORES = [
  { key: "visibility", label: "Visibility", val: REAL_SCORE.visibility },
  { key: "citationReadiness", label: "Citation Readiness", val: REAL_SCORE.citationReadiness },
  { key: "execution", label: "Execution", val: REAL_SCORE.execution },
] as const;

const RING_CIRCUMFERENCE = 339; // matches the r=54 circle in the score-card SVG

/** SVG stroke-dashoffset for the score ring at a given (animating) score. */
export function ringOffset(score: number): number {
  const clamped = Math.min(100, Math.max(0, score));
  return RING_CIRCUMFERENCE * (1 - clamped / 100);
}

/**
 * Sub-score bar width (%) at a given point in the ring's 0 -> REAL_SCORE.overall
 * count-up animation. Bars fill in lockstep with the ring so they finish
 * together. Execution's target is 0, so it always renders honestly flat.
 */
export function subScoreWidthPct(targetVal: number, score: number): number {
  const overall: number = REAL_SCORE.overall; // widened to `number` — guards a real /0 if this const ever changes
  if (overall === 0) return 0;
  const clamped = Math.min(overall, Math.max(0, score));
  return Math.round(targetVal * (clamped / overall));
}

// ---------------------------------------------------------------------------
// Hero demo — 3 scenes x 7 ticks = 21s loop (score-reveal scene cut).
// ---------------------------------------------------------------------------
export const HERO_SCENE_COUNT = 3;
export const HERO_TICKS_PER_SCENE = 7;
export const HERO_TOTAL_TICKS = HERO_SCENE_COUNT * HERO_TICKS_PER_SCENE; // 21

export const HERO_CAPTIONS = [
  "Type your brand. Hit run.",
  "Track your visibility, week over week.",
  "Get a prioritized fix list. Ship it.",
] as const;

/** Loop progress bar fill, 0-100. */
export function heroLoopPct(scene: number, tick: number): number {
  return Math.round(((scene * HERO_TICKS_PER_SCENE + tick + 1) / HERO_TOTAL_TICKS) * 100);
}

/** Advances the hero {scene, tick} reducer by one 1s interval tick. */
export function nextHeroTick(scene: number, tick: number): { scene: number; tick: number } {
  const t = tick + 1;
  if (t >= HERO_TICKS_PER_SCENE) return { scene: (scene + 1) % HERO_SCENE_COUNT, tick: 0 };
  return { scene, tick: t };
}

export interface HeroCompetitor {
  name: string;
  blur: string;
  color: string;
  bar: string;
  barColor: string;
  cites: string;
  citesColor: string;
  bg: string;
  border: string;
}

/** Scene index 1 = "who AI cites instead" visibility-growth time-lapse. */
export function heroGrowth(
  scene: number,
  tick: number
): { growWeek: string; growNote: string; competitors: HeroCompetitor[] } {
  const playing = scene === 1;
  const p = playing ? Math.min(1, tick / 5) : 0;
  const week = playing ? Math.min(8, 1 + Math.round(p * 7)) : 1;
  const yourBar = Math.round(22 + p * (78 - 22));
  const yourCites = Math.round(3 + p * (14 - 3));
  return {
    growWeek: `WEEK ${week}`,
    // Honesty pass: describes tracking, not a growth guarantee.
    growNote: p < 0.5 ? "You're being skipped — but watch what the fixes do." : "Every fix you ship is tracked here.",
    competitors: [
      {
        name: "competitor-a.com",
        blur: "blur(4px)",
        color: "#9fb0a4",
        bar: "86%",
        barColor: "rgba(39,201,138,0.35)",
        cites: "12 cites",
        citesColor: "#9fb0a4",
        bg: "rgba(255,255,255,0.02)",
        border: "rgba(255,255,255,0.07)",
      },
      {
        name: "competitor-b.com",
        blur: "blur(4px)",
        color: "#9fb0a4",
        bar: "61%",
        barColor: "rgba(255,255,255,0.25)",
        cites: "8 cites",
        citesColor: "#9fb0a4",
        bg: "rgba(255,255,255,0.02)",
        border: "rgba(255,255,255,0.07)",
      },
      {
        name: "yourbrand.com",
        blur: "none",
        color: "#5fdfa8",
        bar: `${yourBar}%`,
        barColor: "#27c98a",
        cites: `${yourCites} cites`,
        citesColor: p > 0 ? "#5fdfa8" : "#9fb0a4",
        bg: "rgba(39,201,138,0.07)",
        border: "rgba(39,201,138,0.35)",
      },
    ],
  };
}

export const HERO_ACTION_CARDS = [
  { title: "Add an FAQ page AI can quote", impact: "HIGH", done: true },
  { title: "Fix your schema markup", impact: "HIGH", done: false },
  { title: "Publish a comparison page", impact: "MED", done: false },
] as const;

// ---------------------------------------------------------------------------
// Section 2 demo — "the AI answer" (streaming chat), click-to-play.
// Grammar deliberately different from the hero + Kit demos (founder
// feedback, 2026-07-11): a chat-style question + streaming answer with an
// inline citation, instead of another checklist.
// ---------------------------------------------------------------------------
export const AI_ANSWER_QUERY = "best AI visibility platform?";

/** citation index marks which token is the highlighted "yourbrand.com" chip. */
export const AI_ANSWER_TOKENS = [
  "The",
  "top",
  "pick",
  "buyers",
  "keep",
  "mentioning",
  "is",
  "yourbrand.com",
  "—",
  "it's",
  "cited",
  "across",
  "ChatGPT",
  "and",
  "Perplexity.",
] as const;
export const AI_ANSWER_CITATION_INDEX = 7; // "yourbrand.com"
export const AI_ANSWER_TICK_COUNT = 11; // matches the interval's modulo range

export interface AiAnswerState {
  idle: boolean;
  revealedCount: number;
  cited: boolean;
  caption: string;
  badge: string;
}

/** `tick` is expected in [0, AI_ANSWER_TICK_COUNT) — the caller owns the modulo. */
export function aiAnswerSim(playing: boolean, tick: number): AiAnswerState {
  if (!playing) {
    return {
      idle: true,
      revealedCount: AI_ANSWER_TOKENS.length,
      cited: true,
      caption: "",
      badge: "CITED ✓",
    };
  }
  const revealedCount = tick === 0 ? 0 : Math.min(AI_ANSWER_TOKENS.length, tick * 2);
  const cited = revealedCount > AI_ANSWER_CITATION_INDEX;
  const caption =
    tick === 0
      ? "Someone asks AI for recommendations…"
      : tick < 7
        ? "The answer streams in…"
        : "There you are. Cited.";
  return { idle: false, revealedCount, cited, caption, badge: cited ? "CITED ✓" : "ANSWERING…" };
}

// ---------------------------------------------------------------------------
// Section 3 demo — "3 pages" (document-flip cards), click-to-play.
// One page flips DRAFT -> LIVE roughly every 2 ticks.
// ---------------------------------------------------------------------------
export const KIT_PAGES = [
  { title: "FAQ page", slug: "faq" },
  { title: "Comparison page", slug: "compare" },
  { title: "Schema fix", slug: "schema" },
] as const;
export const KIT_TICK_COUNT = 12; // matches the interval's modulo range

export interface KitPageState {
  title: string;
  slug: string;
  live: boolean;
  flipping: boolean;
}

export interface KitSimState {
  idle: boolean;
  pages: KitPageState[];
  cites: number;
  kitStatus: string;
  kitHeader: string;
  kitCaption: string;
  kitResult: string;
}

/** `tick` is expected in [0, KIT_TICK_COUNT) — the caller owns the modulo. */
export function kitSim(playing: boolean, tick: number): KitSimState {
  const t = playing ? tick : 0;
  const liveCount = playing ? Math.max(0, Math.min(KIT_PAGES.length, Math.floor(t / 2))) : KIT_PAGES.length;
  const settled = !playing || t >= 7;
  const cites = !playing ? 6 : t < 7 ? 3 : Math.min(6, 3 + (t - 6));

  const pages: KitPageState[] = KIT_PAGES.map((p, i) => ({
    title: p.title,
    slug: p.slug,
    live: i < liveCount,
    flipping: playing && Math.floor(t / 2) === i && t < 6,
  }));

  return {
    idle: !playing,
    pages,
    cites,
    kitStatus: !playing
      ? "3 PAGES · READY TO PUBLISH"
      : t < 6
        ? "PUBLISHING YOUR PAGES…"
        : t < 7
          ? "AI RE-CRAWLS YOUR PAGES…"
          : "DONE — PAGES LIVE",
    kitHeader: !playing ? "what you actually get" : t < 6 ? "publishing…" : "AI re-crawling…",
    kitCaption: !playing
      ? ""
      : t < 6
        ? "Publish a page in ~10 minutes."
        : t < 7
          ? "Engines re-crawl your pages…"
          : "Publish, get re-crawled, become quotable.",
    kitResult: settled && playing ? "AI can now quote your FAQ." : "Pages written from your audit.",
  };
}

// ---------------------------------------------------------------------------
// Section 2 — bullet copy (verbatim from the design handoff).
// ---------------------------------------------------------------------------
export const SCORE_BULLETS = [
  "We ask all 5 AIs about your brand. Real questions, real answers.",
  "You see who the AI names instead of you.",
  "You get a simple to-do list. Fix this first. Then this.",
] as const;

// ---------------------------------------------------------------------------
// FAQ — copy + JSON-LD source (verbatim from the design handoff).
// ---------------------------------------------------------------------------
export const FAQS = [
  {
    q: "What is the Ozvor AI Visibility Score?",
    a: "It's a 0–100 score. It shows how often AI sees and quotes your brand across 5 engines. Three parts: Visibility, Citation Readiness, Execution.",
  },
  {
    q: "Does this replace my SEO?",
    a: "No. Your SEO keeps working. This covers the new channel — AI answers.",
  },
  {
    q: "Is the audit data real?",
    a: "Yes. Real questions to real engines. If we can't measure something, we say so. We never make up a result.",
  },
] as const;

// ---------------------------------------------------------------------------
// "Three steps" ladder — gold replaced with emerald on step 2 (the Kit).
// Step 2 uses a lighter tint + outlined number to stay visually distinct
// from step 3's filled emerald number (Amendment A).
// ---------------------------------------------------------------------------
export const STEPS = [
  {
    n: "1",
    title: "Check your brand",
    desc: "60 seconds. See your score and what's missing.",
    price: "FREE",
    priceColor: "#5fdfa8",
    border: "rgba(255,255,255,0.09)",
    bg: "linear-gradient(165deg, #0d1310, #0a0f0c)",
    lift: "24px",
    numBg: "rgba(255,255,255,0.05)",
    numColor: "#f4f7f5",
    numBorder: "rgba(255,255,255,0.15)",
  },
  {
    n: "2",
    title: "Get the Kit",
    desc: "We write 3 pages for you. Copy, paste, publish. Done in an afternoon.",
    price: "$29 ONE-TIME",
    priceColor: "#5fdfa8",
    border: "rgba(39,201,138,0.30)",
    bg: "linear-gradient(165deg, rgba(39,201,138,0.07), #0a0f0c)",
    lift: "12px",
    numBg: "rgba(39,201,138,0.10)",
    numColor: "#5fdfa8",
    numBorder: "rgba(39,201,138,0.45)",
  },
  {
    n: "3",
    title: "Put it on autopilot",
    desc: "We re-check every week and tell you what to fix next. Your 5-page site (Ozvor Pages) is included.",
    price: "$99 / MO",
    priceColor: "#5fdfa8",
    border: "rgba(39,201,138,0.45)",
    bg: "linear-gradient(165deg, rgba(39,201,138,0.09), #0a0f0c)",
    lift: "0px",
    numBg: "#27c98a",
    numColor: "#0a0f0d",
    numBorder: "#27c98a",
  },
] as const;

// ---------------------------------------------------------------------------
// Pricing tiers — link wiring per the founder-approved amendments.
// ---------------------------------------------------------------------------
export type TierCtaKind = "link" | "checkout-growth" | "checkout-agency";

export interface PricingTier {
  name: string;
  price: string;
  per: string;
  popular: boolean;
  features: readonly string[];
  cta: string;
  ctaKind: TierCtaKind;
  href: string | null;
}

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    name: "FREE TEST",
    price: "$0",
    per: "",
    popular: false,
    features: ["Ozvor AI Visibility Score", "3 sub-scores breakdown", "Top gaps preview"],
    cta: "Check my brand — free",
    ctaKind: "link",
    href: "/test",
  },
  {
    name: "KIT",
    price: "$29",
    per: "one-time",
    popular: false,
    features: ["Full audit report", "3 ready-to-publish content drafts", "Prioritized fix list"],
    cta: "Get the Kit — $29",
    ctaKind: "link",
    href: "/kit",
  },
  {
    name: "GROWTH",
    price: "$99",
    per: "/ month",
    popular: true,
    features: [
      "We check all 5 AIs every week",
      "Monthly content plan",
      "Ozvor Pages — 5-page AI-optimized site included",
      "Everything in Kit",
    ],
    cta: "Start Growth",
    ctaKind: "checkout-growth",
    href: null,
  },
  {
    name: "AGENCY",
    price: "$249",
    per: "/ month",
    popular: false,
    features: ["Multiple client brands", "White-label reports", "Priority support"],
    cta: "Start Agency",
    ctaKind: "checkout-agency",
    href: null,
  },
] as const;

export const CALENDLY_URL = "https://calendly.com/hello-ozvor/20-minute-ozvor";
