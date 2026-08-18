/**
 * ai-audit-copy.ts — pure copy + logic helpers for the /ai-audit screens
 * (the $49 questionnaire + checkout page, and the /ai-audit/[token] delivery
 * page).
 *
 * Framework-free on purpose (no JSX, no DOM) so the colocated vitest file can
 * run it in the node environment — the repo's "pure logic helpers" convention
 * (see WaitlistForm.test.ts / waitlist-helpers.ts).
 *
 * COPY RULES (founder, hard): English only. No em-dash anywhere. Short, simple
 * sentences a 15-year-old reads without effort. First-person CTAs. Sell the
 * honest dream: we do the work, the client does not. Numbers are estimates
 * when the catalog says so. The colocated test pins the no-em-dash rule on
 * every string exported from here.
 *
 * PRODUCT (founder, 2026-08-15): the AI Audit Stack is PAID, $49 one-time, and
 * email is MANDATORY before anything (same structure as the free test's email
 * capture and the $29 Kit's checkout). The free product is the GEO test at /test.
 */

export type BusinessEngine = "attract" | "convert" | "deliver" | "retain" | "run";

/** The price the page sells. The API's /meta echoes the same number. */
export const AI_AUDIT_PRICE_USD = 49;

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same rule as the API: a real-looking email, nothing more. */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** The payload POST /api/ai-audit/checkout expects. Pure so the test can pin it. */
export interface CheckoutPayload {
  email: string;
  marketing_consent: boolean;
  businessType: string;
  primaryFocus: string;
  pains: string[];
  engines: BusinessEngine[];
  toolsInUse: string[];
  testId?: string;
}

export function buildCheckoutPayload(input: {
  email: string;
  marketingConsent: boolean;
  businessType: string;
  primaryFocus: string;
  pains: string[];
  engines: BusinessEngine[];
  toolsInUseRaw: string;
  testId?: string;
}): CheckoutPayload {
  const payload: CheckoutPayload = {
    email: input.email.trim(),
    // Explicit opt-in only, never inferred from the purchase.
    marketing_consent: input.marketingConsent === true,
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
  if (input.testId && input.testId.trim()) payload.testId = input.testId.trim();
  return payload;
}

/**
 * Can the questionnaire go to checkout? Email is MANDATORY (founder rule, same
 * as the free test); pains are the anchor the API requires; business type too.
 */
export function canSubmit(input: { email: string; businessType: string; pains: string[] }): boolean {
  return isValidEmail(input.email) && input.businessType.trim().length > 0 && input.pains.length > 0;
}

/** The withheld line. Honest numbers, no drama. */
export function withheldLine(totalMatched: number, withheldCount: number): string {
  if (totalMatched <= 1) return "This result shows your one best niche match.";
  return `We matched ${totalMatched} tools to your answers. This result shows 1. The other ${withheldCount} wait in the full audit.`;
}

/** The pre-checkout teaser line, from the counts the API returns before payment. */
export function teaserLine(totalMatched: number): string {
  if (totalMatched <= 0) return "No niche tool clearly fits yet. If nothing fits after payment, we say so and offer a call.";
  if (totalMatched === 1) return "We matched 1 tool to your answers. Your $49 result shows it.";
  return `We matched ${totalMatched} tools to your answers. Your $49 result shows the one that fits your business best.`;
}

/** Why this pick, anchored in the client's own business type. */
export function pickedForLine(businessType: string): string {
  const t = businessType.trim();
  if (!t) return "Picked for your kind of work.";
  return `Picked for your ${t} work.`;
}

// ---------------------------------------------------------------------------
// All fixed user-facing copy for the pages, in one place so the test can walk
// every string and pin the founder's rules (English, no em-dash).
// ---------------------------------------------------------------------------

export const COPY = {
  metaTitle: "AI Audit Stack ($49). Find Your Right AI Tool.",
  metaDescription:
    "Too many AI tools. Hard to pick. Tell us where your business hurts. We match one niche tool to your real pains, plus the size of the full picture. $49, one time.",
  hero: {
    kicker: "AI Audit Stack. $49, one time.",
    title: "Too many AI tools. We pick yours.",
    lead: "New AI tools land every day. Picking right is hard. Tell us where your business hurts. We match the right tool to your real pains. You do not do the work. We do.",
    priceLine: "$49, one payment. No subscription.",
    getTitle: "What you get for $49",
    gets: [
      "One niche AI tool picked for your business, not a big-name AI everyone knows.",
      "Why we picked it, and which of your pains it answers.",
      "The size of the full picture: how many tools matched, and what the full audit adds.",
      "Your result on the site and in your inbox.",
    ],
    limitTitle: "The honest limit",
    limit: "You get one tool and the counts. The ranked stack, the plan and the ROI live in the full audit inside OrganicPosts. Numbers are estimates when our catalog says so.",
    kpiTitle: "The right stack saves three things",
    kpis: [
      { label: "Time", text: "Hours back, every week." },
      { label: "Effort", text: "Chores removed from your plate." },
      { label: "Money", text: "Real monthly return, minus tool cost." },
    ],
  },
  steps: {
    emailTitle: "Where do we send your result?",
    emailHint: "We email you the tool and keep your result at a private link.",
    emailLabel: "Your email",
    emailPlaceholder: "you@company.com",
    emailInvalid: "Please enter a valid email address.",
    emailSocialCaption: "Fill your email with one click. Or type it below:",
    consentLabel: "Email me a few tips on AI tools and getting found by AI. No spam, unsubscribe anytime.",
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
    submit: "Get my AI stack for $49",
    submitting: "Starting checkout.",
    secure: "Secure checkout. One-time payment.",
    needEmail: "Add your email first.",
    needBusiness: "Tell us your business first.",
    needPains: "Pick at least one pain first.",
  },
  loading: "Reading your answers. Matching your tool.",
  delivering: "Building your result.",
  errorTitle: "Something went wrong",
  errorRetry: "Try again",
  networkError: "Network error. Check your connection and try again.",
  apiError: "We could not run your check right now. Please try again.",
  notReady: "The AI Audit Stack checkout is not open yet. Please try again soon.",
  unpaidTitle: "Payment not verified yet",
  unpaidBody: "If you just paid, refresh in a moment. Otherwise, start again from the AI Audit page.",
  unpaidCta: "Back to the AI Audit Stack",
  deliveryErrorBody: "We could not build your result. Please contact support. Your purchase is safe.",
  result: {
    kicker: "Your AI Audit Stack result",
    pickTitle: "Your one niche tool",
    visitTool: "Visit the tool site",
    matchedPains: "It answers these pains you picked:",
    estimatesNote: "Numbers here are estimates. We verify them in the full audit.",
    emptyTitle: "No clear niche fit yet",
    emptyBody: "Your answers did not match a niche tool we trust. That is rare, and honest. A short call finds your fit faster.",
    emptyCta: "Book my free call",
    pictureTitle: "The size of the full picture",
    pictureMatched: "tools matched your answers",
    pictureQuickWins: "quick wins in the full audit",
    pictureHours: "hours a week the quick wins could return",
    upsellTitle: "What the full audit adds",
    fullAuditCta: "Get my full audit",
    geoCta: "Run my free GEO test",
    emailedNote: "We also sent this to your inbox.",
    restart: "Start a new check",
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
  out.push(teaserLine(0), teaserLine(1), teaserLine(7));
  return out;
}
