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
 *  - Hero demo cut from 4 scenes to 3 (the score-reveal scene duplicated the
 *    live score card in section 2 — 2026-07-11 founder feedback).
 *  - Section 2 + 3 simulations redesigned to three distinct "visual
 *    grammars" (2026-07-11 founder feedback: the original checklist-style
 *    sims for hero/weekly/Kit all looked the same): hero = product story,
 *    section 2 = streaming AI-answer chat, section 3 = document-flip cards.
 *  - All three sims are simulated product animations, not real screen
 *    recordings — every surface says so ("EXAMPLE DATA"), per the house rule
 *    against rendering fabricated metrics as if real.
 *
 * PR #231 review fix (Hermes, blocker): the score card's "LIVE" chip and
 * "updated weekly" claim require an actual live value — a hardcoded const is
 * not live. `page.tsx` now server-fetches GET /api/showcase/geo (10-min ISR,
 * same pattern the pre-v2 homepage used for its "building in public" band)
 * and passes the result into `scoreCardState()` below. When the fetch fails
 * or the latest audit is incomplete, the card falls back to the last-known
 * SNAPSHOT_SCORE, honestly labeled "SNAPSHOT" — never "LIVE", never "updated
 * weekly".
 */

const RING_CIRCUMFERENCE = 339; // matches the r=54 circle in the score-card SVG

/** SVG stroke-dashoffset for the score ring at a given (animating) score. */
export function ringOffset(score: number): number {
  const clamped = Math.min(100, Math.max(0, score));
  return RING_CIRCUMFERENCE * (1 - clamped / 100);
}

/**
 * Sub-score bar width (%) at a given point in the ring's 0 -> overallTarget
 * count-up animation. Bars fill in lockstep with the ring so they finish
 * together. `overallTarget` is the score card's overall value for this page
 * load (live or snapshot) — no longer a fixed module constant, since the
 * live value now varies week to week.
 */
export function subScoreWidthPct(targetVal: number, score: number, overallTarget: number): number {
  if (overallTarget === 0) return 0;
  const clamped = Math.min(overallTarget, Math.max(0, score));
  return Math.round(targetVal * (clamped / overallTarget));
}

// ---------------------------------------------------------------------------
// Score card — live (server-fetched) or honest snapshot fallback.
// ---------------------------------------------------------------------------

/** Shape `page.tsx` passes to `<LandingV2 selfScore={...} />` after fetching
 * GET /api/showcase/geo. null = fetch failed, 404'd, or the latest audit was
 * incomplete (never fabricated — see fetchSelfScore in page.tsx). */
export interface SelfScoreApiData {
  overall: number;
  visibility: number;
  citationReadiness: number;
  executionProgress: number | null;
  measuredAt: string; // ISO timestamp — the latest audit's created_at
}

/**
 * Last-known snapshot — used ONLY when the live fetch fails. This is real
 * data (a real geo_score row), just not fetched live for this page load, so
 * the UI must say "SNAPSHOT", not "LIVE" — see scoreCardState().
 * SOURCE: geo_score row dated 2026-07-10.
 */
export const SNAPSHOT_SCORE = {
  overall: 73,
  visibility: 54,
  citationReadiness: 82,
  executionProgress: 0,
  measuredAt: "2026-07-10",
} as const;

export interface ScoreCardSubScore {
  key: string;
  label: string;
  /** null renders as "—" — genuinely unknown (e.g. no plan/tasks yet), not zero. */
  val: number | null;
}

export interface ScoreCardState {
  isLive: boolean;
  chipLabel: string;
  /** Longer note next to the avatar. Fallback branch never contains "LIVE" or "updated weekly". */
  noteLine: string;
  /** Small mono provenance line, e.g. "Measured July 10, 2026" / "Snapshot · measured July 10, 2026". */
  provenanceLine: string;
  overall: number;
  subScores: ScoreCardSubScore[];
}

/** Formats an ISO date/timestamp as "July 10, 2026", pinned to UTC so it's
 * deterministic regardless of server/test-runner timezone. Returns the raw
 * input unchanged if it doesn't parse (never throws on bad data). */
export function formatMeasuredDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const SCORE_SUB_LABELS = [
  { key: "visibility", label: "Visibility" },
  { key: "citationReadiness", label: "Citation Readiness" },
  { key: "execution", label: "Execution" },
] as const;

export function scoreCardState(apiData: SelfScoreApiData | null): ScoreCardState {
  if (apiData) {
    const values = [apiData.visibility, apiData.citationReadiness, apiData.executionProgress];
    return {
      isLive: true,
      chipLabel: "● LIVE — we run Ozvor on Ozvor",
      noteLine: "Our own score, updated weekly. Yes — we test ourselves too.",
      provenanceLine: `Measured ${formatMeasuredDate(apiData.measuredAt)}`,
      overall: apiData.overall,
      subScores: SCORE_SUB_LABELS.map((s, i) => ({ ...s, val: values[i] ?? null })),
    };
  }
  const values = [SNAPSHOT_SCORE.visibility, SNAPSHOT_SCORE.citationReadiness, SNAPSHOT_SCORE.executionProgress];
  return {
    isLive: false,
    chipLabel: "SNAPSHOT — we run Ozvor on Ozvor",
    noteLine: "Snapshot from our own audit. Yes — we test ourselves too.",
    provenanceLine: `Snapshot · measured ${formatMeasuredDate(SNAPSHOT_SCORE.measuredAt)}`,
    overall: SNAPSHOT_SCORE.overall,
    subScores: SCORE_SUB_LABELS.map((s, i) => ({ ...s, val: values[i] ?? null })),
  };
}

/** Neutral note under the Execution bar — replaces the old "Execution just
 * reset — 5 fixes queued" copy, which implied a live event with no source. */
export const EXECUTION_NOTE = "Execution tracks fixes you publish.";

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

/**
 * Theming note (feat/landing-v2-theming): the colors below (and on
 * HeroCompetitor) render exclusively INSIDE the hero product-demo frame,
 * which depicts the (dark-only) product UI like a screenshot — see
 * LandingV2.tsx's theming comments. They are intentionally left as fixed
 * hex/rgba literals, NOT converted to the light/dark CSS custom properties
 * in tokens.css, unlike STEPS and ECOSYSTEM_CARDS below (real page content).
 */

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
    a: "Yes. Real questions to real engines, live. AI answers vary by day and engine, so we label every input measured or baseline. We never make up a result.",
  },
] as const;

// ---------------------------------------------------------------------------
// "Three steps" ladder — gold replaced with emerald on step 2 (the Kit).
// Step 2 uses a lighter tint + outlined number to stay visually distinct
// from step 3's filled emerald number (Amendment A).
//
// Theming note (feat/landing-v2-theming): these are real page cards (not
// product-demo internals), so every color below is a CSS custom-property
// reference into tokens.css — resolved by the browser per data-theme, not a
// fixed hex. Step 3's number badge sources the same fixed --landing-cta-*
// tokens as the primary CTA (bright emerald + near-black text — already
// contrasts on any page background, see tokens.css note).
// ---------------------------------------------------------------------------
export const STEPS = [
  {
    n: "1",
    title: "Check your brand",
    desc: "60 seconds. See your score and what's missing.",
    price: "FREE",
    priceColor: "var(--color-accent-ink)",
    border: "var(--color-border)",
    bg: "var(--color-surface)",
    lift: "24px",
    numBg: "var(--color-surface-muted)",
    numColor: "var(--color-text)",
    numBorder: "var(--color-border)",
  },
  {
    n: "2",
    title: "Get the Kit",
    desc: "We write 3 pages for you. Copy, paste, publish. Done in an afternoon.",
    price: "$29 ONE-TIME",
    priceColor: "var(--color-accent-ink)",
    border: "var(--landing-border-accent)",
    bg: "linear-gradient(165deg, var(--landing-tint-soft), var(--color-surface))",
    lift: "12px",
    numBg: "var(--color-badge-ai-bg)",
    numColor: "var(--color-accent-ink)",
    numBorder: "var(--landing-border-accent-strong)",
  },
  {
    n: "3",
    title: "Put it on autopilot",
    desc: "We re-check every week and tell you what to fix next. Your 5-page site (Ozvor Pages) is included.",
    price: "$99 / MO",
    priceColor: "var(--color-accent-ink)",
    border: "var(--landing-border-accent-strong)",
    bg: "linear-gradient(165deg, var(--landing-tint-strong), var(--color-surface))",
    lift: "0px",
    numBg: "var(--landing-cta-bg)",
    numColor: "var(--landing-cta-text)",
    numBorder: "var(--landing-cta-bg)",
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

// ---------------------------------------------------------------------------
// "Two more ways we help" — Ozvor Pages + OrganicPosts teasers (2026-07-11
// founder request: the landing never presented these as products, only a
// feature line in Growth). Copy: teen-copy standard, sentences <=12 words,
// no invented numbers/outcomes — prices are facts, results are never
// promised (see EcosystemSection in LandingV2.tsx).
//
// OrganicPosts is the ONE legitimate place for the gold accent on this page
// (BRAND-GUIDE.md: gold is reserved for OrganicPosts only) — sourced from
// --landing-gold-border / --landing-gold-bg / --color-gold-ink so it still
// behaves correctly in light mode.
// ---------------------------------------------------------------------------
export interface EcosystemCard {
  slug: string;
  chip: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  /** GA4 event name — fired via the same optional-chained window.gtag?.()
   * pattern as every other tracked click on this page (#117 consent-gated). */
  gtagEvent: string;
  /** true = OrganicPosts card, gets the brand's one legitimate gold accent. */
  gold: boolean;
}

export const ECOSYSTEM_CARDS: readonly EcosystemCard[] = [
  {
    slug: "pages",
    chip: "OZVOR PAGES",
    title: "Your website, built to be quoted.",
    body: "We build you a 5-page site from your Google Maps listing. AI-ready from day one. $99 one-time — or included with Growth.",
    cta: "See Ozvor Pages →",
    href: "/local-pages",
    gtagEvent: "pages_teaser_click",
    gold: false,
  },
  {
    slug: "organicposts",
    chip: "ORGANICPOSTS BY OZVOR",
    title: "Don't want to do it yourself?",
    body: "Our team writes and publishes everything for you. You approve, we ship.",
    cta: "Meet OrganicPosts →",
    href: "/organicposts",
    gtagEvent: "organicposts_teaser_click",
    gold: true,
  },
] as const;
