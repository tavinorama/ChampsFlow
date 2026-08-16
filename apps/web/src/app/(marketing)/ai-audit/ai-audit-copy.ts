/**
 * ai-audit-copy.ts — pure copy + logic helpers for the /ai-audit screen.
 *
 * Framework-free on purpose (no JSX, no DOM) so the colocated vitest file can
 * run it in the node environment — the repo's "pure logic helpers" convention
 * (see WaitlistForm.test.ts / waitlist-helpers.ts).
 *
 * COPY RULES (founder, hard): English only. No em-dash anywhere. Short, simple
 * sentences a 15-year-old reads without effort. First-person CTAs. Sell the
 * honest dream: we do the work, the client does not. The colocated test pins
 * the no-em-dash rule on every string exported from here.
 */

export type BusinessEngine = "attract" | "convert" | "deliver" | "retain" | "run";

/** The five business engines, in questionnaire order, with card copy. */
export const ENGINE_CARDS: readonly {
  id: BusinessEngine;
  title: string;
  subtitle: string;
}[] = [
  { id: "attract", title: "Attract", subtitle: "Get found by new customers" },
  { id: "convert", title: "Convert", subtitle: "Win the customer" },
  { id: "deliver", title: "Deliver", subtitle: "Do the work" },
  { id: "retain", title: "Retain", subtitle: "Keep customers and grow them" },
  { id: "run", title: "Run", subtitle: "Back office and admin" },
];

/** Friendly labels for known pain slugs. Fallback: humanize the slug. */
const PAIN_LABEL: Record<string, string> = {
  "appointment-scheduling": "Booking appointments eats my time",
  "billing-admin": "Billing and admin pile up",
  "content-volume": "I cannot produce enough content",
  "customer-support-load": "Support requests never stop",
  "data-analysis": "Numbers take too long to read",
  "design-assets": "Design work is slow or costly",
  "email-overload": "My inbox runs my day",
  "lead-research": "Finding good leads is slow",
  "meeting-notes": "Meetings leave no usable notes",
  "no-shows": "Clients miss their appointments",
  "phone-answering": "Calls go unanswered",
  "repetitive-tasks": "Repetitive tasks eat my week",
  "reviews": "Too few reviews come in",
  "seo-visibility": "People cannot find us online",
  "social-scheduling": "Social posting is a chore",
  "video-editing": "Video editing takes forever",
};

/** Slug to friendly label. Unknown slugs get humanized, never shown raw. */
export function painLabel(slug: string): string {
  const known = PAIN_LABEL[slug];
  if (known) return known;
  const words = slug.split(/[-_]+/).filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Which group a pain slug belongs to, for a sensible chip layout. */
const PAIN_GROUP: Record<string, string> = {
  "seo-visibility": "Getting found",
  "content-volume": "Getting found",
  "social-scheduling": "Getting found",
  "video-editing": "Getting found",
  "design-assets": "Getting found",
  "lead-research": "Winning customers",
  "phone-answering": "Winning customers",
  "no-shows": "Winning customers",
  "appointment-scheduling": "Winning customers",
  "reviews": "Keeping customers",
  "customer-support-load": "Keeping customers",
  "meeting-notes": "Daily work",
  "repetitive-tasks": "Daily work",
  "email-overload": "Daily work",
  "billing-admin": "Back office",
  "data-analysis": "Back office",
};

const GROUP_ORDER = [
  "Getting found",
  "Winning customers",
  "Keeping customers",
  "Daily work",
  "Back office",
  "Other pains",
] as const;

export interface PainGroup {
  group: string;
  pains: string[];
}

/** Group pain slugs into stable, ordered buckets. Unknown slugs go to Other. */
export function groupPains(slugs: string[]): PainGroup[] {
  const buckets = new Map<string, string[]>();
  for (const slug of slugs) {
    const group = PAIN_GROUP[slug] ?? "Other pains";
    const list = buckets.get(group) ?? [];
    list.push(slug);
    buckets.set(group, list);
  }
  return GROUP_ORDER.filter((g) => buckets.has(g)).map((g) => ({
    group: g,
    pains: buckets.get(g) ?? [],
  }));
}

/** The payload /api/ai-audit/entry expects. Pure so the test can pin it. */
export interface EntryPayload {
  businessType: string;
  primaryFocus: string;
  pains: string[];
  engines: BusinessEngine[];
  toolsInUse: string[];
}

export function buildEntryPayload(input: {
  businessType: string;
  primaryFocus: string;
  pains: string[];
  engines: BusinessEngine[];
  toolsInUseRaw: string;
}): EntryPayload {
  return {
    businessType: input.businessType.trim().slice(0, 120),
    primaryFocus: input.primaryFocus.trim().slice(0, 120),
    pains: input.pains,
    engines: input.engines,
    toolsInUse: input.toolsInUseRaw
      .split(/[,\n]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 20),
  };
}

/** Can the questionnaire submit? Pains are the anchor; the API requires them. */
export function canSubmit(input: { businessType: string; pains: string[] }): boolean {
  return input.businessType.trim().length > 0 && input.pains.length > 0;
}

/** The withheld line. Honest numbers, no drama. */
export function withheldLine(totalMatched: number, withheldCount: number): string {
  if (totalMatched <= 1) return "This free check shows your one best niche match.";
  return `We matched ${totalMatched} tools to your answers. This free check shows 1. The other ${withheldCount} wait in the full audit.`;
}

/** Why this pick, anchored in the client's own business type. */
export function pickedForLine(businessType: string): string {
  const t = businessType.trim();
  if (!t) return "Picked for your kind of work.";
  return `Picked for your ${t} work.`;
}

// ---------------------------------------------------------------------------
// All fixed user-facing copy for the page, in one place so the test can walk
// every string and pin the founder's rules (English, no em-dash).
// ---------------------------------------------------------------------------

export const COPY = {
  metaTitle: "Free AI Stack Check. Find Your Right AI Tool.",
  metaDescription:
    "Too many AI tools. Hard to pick. Tell us where your business hurts. We match one niche tool to your real pains. Free.",
  hero: {
    kicker: "Free AI stack check",
    title: "Too many AI tools. We pick yours.",
    lead: "New AI tools land every day. Picking right is hard. Tell us where your business hurts. We match the right tool to your real pains. You do not do the work. We do.",
    kpiTitle: "The right stack saves three things",
    kpis: [
      { label: "Time", text: "Hours back, every week." },
      { label: "Effort", text: "Chores removed from your plate." },
      { label: "Money", text: "Real monthly return, minus tool cost." },
    ],
  },
  steps: {
    businessTitle: "What is your business?",
    businessHint: "Type it, or tap a suggestion.",
    businessPlaceholder: "dental clinic, agency, online store",
    focusTitle: "Where do you want help first?",
    focusHint: "Pick the area that matters most right now.",
    enginesTitle: "Where does it hurt?",
    enginesHint: "Every business runs five engines. Tap the ones that break.",
    painsTitle: "Pick your pains",
    painsHint: "Choose everything that sounds like your week.",
    toolsTitle: "Tools you already use",
    toolsHint: "Optional. Separate with commas. We will not suggest these.",
    toolsPlaceholder: "ChatGPT, Canva",
    back: "Back",
    next: "Next",
    submit: "Show me my tool",
    needBusiness: "Tell us your business first.",
    needPains: "Pick at least one pain first.",
  },
  loading: "Reading your answers. Matching your tool.",
  errorTitle: "Something went wrong",
  errorRetry: "Try again",
  networkError: "Network error. Check your connection and try again.",
  apiError: "We could not run your check right now. Please try again.",
  result: {
    kicker: "Your free result",
    pickTitle: "Your one niche tool",
    visitTool: "Visit the tool site",
    matchedPains: "It answers these pains you picked:",
    estimatesNote: "Numbers here are estimates. We verify them in the full audit.",
    emptyTitle: "No clear niche fit yet",
    emptyBody: "Your answers did not match a niche tool we trust. That is rare, and honest. A short call finds your fit faster.",
    emptyCta: "Book my free call",
    upsellTitle: "What the full audit adds",
    fullAuditCta: "Get the full audit",
    geoCta: "See Ozvor GEO Search",
    restart: "Start over",
  },
} as const;

/** Every user-facing string above, flattened, for the copy-rules test. */
export function allCopyStrings(): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(COPY);
  for (const card of ENGINE_CARDS) {
    out.push(card.title, card.subtitle);
  }
  out.push(...Object.values(PAIN_LABEL));
  out.push(...GROUP_ORDER);
  out.push(withheldLine(12, 11), withheldLine(1, 0), pickedForLine("clinic"), pickedForLine(""));
  return out;
}
