/**
 * landing-stages.ts — Ozvor Pages two-stage copy pipeline (D5, 2026-08-17).
 *
 * Pure, DB-free, I/O only through injected LandingTextPort ports.
 *
 *   stage 1 "draft"  — Kimi (via the Hermes VPS /task, flat-fee) writes LONGER
 *                      section copy from the crawled facts: an About paragraph
 *                      (home), a short intro per service page, grounded FAQ
 *                      answers, and a proof intro. Strict JSON.
 *   stage 2 "refine" — Claude/OpenAI (the platform key path that already
 *                      existed) rewrites hero copy + fills FAQ placeholders AND
 *                      runs a compliance pass over the stage-1 draft
 *                      (`draft_edits`): remove ungrounded claims, ≤12-word
 *                      sentences.
 *
 * Fallbacks (all honest, all reported in `stages`):
 *   draft fails  → refine-only (today's behaviour).
 *   refine fails → stage-1 copy (deterministically compliance-trimmed) +
 *                  template hero.
 *   both fail    → mock skeleton, mode "mock" — the worker's
 *                  assertBundleModeHonest turns that into a job failure in prod.
 *
 * HARD RULE — never invent stats/reviews. Enforced twice: the prompts forbid
 * it, and validateDraftGrounding() rejects any numeric token in the draft
 * that does not appear in the input facts (business, reviews, crawl, skeleton).
 * The same validator runs over Claude's draft_edits. Prompts go through
 * prompt-sanitizer (business name is user-controlled).
 */

import { sanitizeUserPrompt } from "./prompt-sanitizer";
import {
  buildMockBundle,
  deriveLandingTheme,
  enrichWithLlmPort,
  type LandingBundle,
  type LandingBundlePage,
  type LandingFaqInput,
  type LandingGenerateInput,
  type LandingSection,
  type LandingTextPort,
} from "./landing-generate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LandingDraft {
  about?: string;
  serviceIntros?: Array<{ slug: string; body: string }>;
  faqAnswers?: Array<{ q: string; a: string }>;
  proofIntro?: string;
}

export type StageStatus = "ok" | "failed" | "skipped";

export interface LandingStages {
  draft: StageStatus;
  refine: StageStatus;
  /** Numeric tokens the grounding validator rejected (for logging). */
  rejectedNumbers: string[];
}

export interface StagedLandingBundle extends LandingBundle {
  stages: LandingStages;
}

export interface LandingStagePorts {
  /** Stage 1 (Kimi). null/undefined → stage skipped honestly. */
  draft?: LandingTextPort | null;
  /** Stage 2 (Claude/OpenAI platform key). null/undefined → skipped. */
  refine?: LandingTextPort | null;
}

// ---------------------------------------------------------------------------
// Grounding validator — no number may appear that the facts did not contain
// ---------------------------------------------------------------------------

const NUMBER_RE = /\d[\d.,:/-]*\d|\d/g;

function numberTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.match(NUMBER_RE) ?? []) {
    const digits = m.replace(/\D/g, "");
    if (digits) out.push(digits);
  }
  return out;
}

/** Every digit-run present anywhere in the input facts + skeleton pages. */
export function collectAllowedNumbers(input: LandingGenerateInput, pages: LandingBundlePage[]): Set<string> {
  const allowed = new Set<string>();
  const scan = (v: unknown): void => {
    if (v == null) return;
    if (typeof v === "string") {
      for (const t of numberTokens(v)) allowed.add(t);
      return;
    }
    if (typeof v === "number") {
      for (const t of numberTokens(String(v))) allowed.add(t);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) scan(x);
      return;
    }
    if (typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) scan(x);
    }
  };
  scan(input);
  scan(pages);
  return allowed;
}

/** Numeric tokens in `text` that are NOT grounded in `allowed`. */
export function findUngroundedNumbers(text: string, allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const t of numberTokens(text)) {
    if (!allowed.has(t) && !bad.includes(t)) bad.push(t);
  }
  return bad;
}

const HYPE_RE = /(?<!\w)(#\s?1|number one|best in|award[- ]winning|guarantee[ds]?|certified|top[- ]rated|5[- ]star|five[- ]star|cheapest|lowest price)\b/i;

/**
 * Deterministic compliance trim (used when stage 2 is unavailable, and as a
 * belt-and-braces pass over stage-2 edits): drops any sentence that carries an
 * ungrounded number or an unverifiable superlative. Returns "" when nothing
 * survives.
 */
export function complianceTrim(text: string, allowed: Set<string>): string {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const kept = sentences.filter((s) => findUngroundedNumbers(s, allowed).length === 0 && !HYPE_RE.test(s));
  return kept.join(" ").trim();
}

/**
 * Drops every draft field that contains a number absent from the facts.
 * FAQ answers and service intros are dropped individually; about/proofIntro
 * as a whole. Then applies complianceTrim to what survives.
 */
export function validateDraftGrounding(
  draft: LandingDraft,
  allowed: Set<string>
): { draft: LandingDraft; rejected: string[] } {
  const rejected: string[] = [];
  const check = (text: string | undefined): string | undefined => {
    if (!text) return undefined;
    const bad = findUngroundedNumbers(text, allowed);
    if (bad.length > 0) {
      for (const b of bad) if (!rejected.includes(b)) rejected.push(b);
      return undefined;
    }
    const trimmed = complianceTrim(text, allowed);
    return trimmed.length >= 20 ? trimmed : undefined;
  };
  const out: LandingDraft = {};
  const about = check(draft.about);
  if (about) out.about = about;
  const proofIntro = check(draft.proofIntro);
  if (proofIntro) out.proofIntro = proofIntro;
  const intros = (draft.serviceIntros ?? [])
    .map((s) => ({ slug: s.slug, body: check(s.body) }))
    .filter((s): s is { slug: string; body: string } => !!s.body);
  if (intros.length > 0) out.serviceIntros = intros;
  const faqs = (draft.faqAnswers ?? [])
    .map((f) => ({ q: f.q, a: check(f.a) }))
    .filter((f): f is { q: string; a: string } => !!f.a);
  if (faqs.length > 0) out.faqAnswers = faqs;
  return { draft: out, rejected };
}

// ---------------------------------------------------------------------------
// Stage 1 prompt + parser
// ---------------------------------------------------------------------------

export function buildDraftPrompt(
  input: LandingGenerateInput,
  pages: LandingBundlePage[]
): { system: string; user: string } | null {
  const business = input.business;
  const nameCheck = sanitizeUserPrompt(business.name);
  if (nameCheck.rejected) return null;
  const desc = business.description ? sanitizeUserPrompt(business.description) : null;
  if (desc?.rejected) return null;

  const reviews = (input.googleReviews ?? []).filter((r) => r.author && r.body).slice(0, 4);
  const testimonials = (input.testimonials ?? []).slice(0, 4);
  const crawlServices = (input.crawlSummary?.services ?? []).slice(0, 8);
  const crawlFaqs = (input.crawlSummary?.faqs ?? []).slice(0, 4);
  const servicePages = pages
    .filter((p) => p.page_type === "service_city")
    .map((p) => ({ slug: p.slug, title: p.title }));
  const faqQuestions: string[] = [];
  for (const p of pages) {
    for (const sec of p.sections) {
      if (sec.type === "faq" && Array.isArray((sec as { items?: unknown }).items)) {
        for (const it of (sec as unknown as { items: LandingFaqInput[] }).items) {
          if (!faqQuestions.includes(it.q)) faqQuestions.push(it.q);
        }
      }
    }
  }

  const facts = [
    `Business: ${nameCheck.sanitized}${business.category ? ` (${business.category})` : ""}.`,
    desc ? `Their own description: ${desc.sanitized}` : "",
    business.address ? `Address: ${business.address}.` : "",
    business.serviceAreas && business.serviceAreas.length > 0 ? `Service areas: ${business.serviceAreas.join(", ")}.` : "",
    business.phone ? `Phone: ${business.phone}.` : "",
    input.reviewThemes && input.reviewThemes.length > 0 ? `What customers consistently praise: ${input.reviewThemes.join(", ")}.` : "",
    reviews.length > 0
      ? "Google reviews (verbatim):\n" + reviews.map((r) => `- "${r.body.slice(0, 240)}" — ${r.author}`).join("\n")
      : "",
    testimonials.length > 0
      ? "Authorized testimonials (verbatim):\n" + testimonials.map((t) => `- "${t.body.slice(0, 240)}" — ${t.author}`).join("\n")
      : "",
    crawlServices.length > 0 ? `Services listed on their own website: ${crawlServices.join(", ")}.` : "",
    crawlFaqs.length > 0
      ? "FAQ found on their own website:\n" + crawlFaqs.map((f) => `- Q: ${f.q} A: ${f.a.slice(0, 240)}`).join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const system = [
    "You draft website copy for a local business. You may use ONLY the facts provided below.",
    "HARD RULE: never invent numbers, statistics, years in business, prices, ratings, review counts, awards, certifications, guarantees, or reviews. If a fact is missing, do not mention it.",
    "Voice: warm, concrete, plain English. Sentences of 12 words or fewer.",
    "Output STRICT JSON only, no commentary:",
    '{"about":string (2 short paragraphs separated by a blank line),"service_intros":[{"slug":string,"body":string (1 paragraph)}],"faq_answers":[{"q":string,"a":string (2-3 sentences)}],"proof_intro":string (1-2 sentences introducing customer feedback)}',
  ].join(" ");

  const user = [
    facts,
    "",
    `Service pages (write one intro each, echo the slug): ${JSON.stringify(servicePages)}.`,
    faqQuestions.length > 0 ? `FAQ questions (echo each verbatim in "q"): ${JSON.stringify(faqQuestions)}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

export function parseLandingDraft(text: string): LandingDraft | null {
  let raw: unknown;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    raw = JSON.parse(match ? match[0] : text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out: LandingDraft = {};
  if (typeof obj["about"] === "string" && obj["about"].trim()) out.about = obj["about"].trim();
  if (typeof obj["proof_intro"] === "string" && obj["proof_intro"].trim()) out.proofIntro = obj["proof_intro"].trim();
  if (Array.isArray(obj["service_intros"])) {
    const intros = (obj["service_intros"] as Array<Record<string, unknown>>)
      .filter((s) => s && typeof s["slug"] === "string" && typeof s["body"] === "string" && (s["body"] as string).trim())
      .map((s) => ({ slug: s["slug"] as string, body: (s["body"] as string).trim() }));
    if (intros.length > 0) out.serviceIntros = intros;
  }
  if (Array.isArray(obj["faq_answers"])) {
    const faqs = (obj["faq_answers"] as Array<Record<string, unknown>>)
      .filter((f) => f && typeof f["q"] === "string" && typeof f["a"] === "string" && (f["a"] as string).trim())
      .map((f) => ({ q: f["q"] as string, a: (f["a"] as string).trim() }));
    if (faqs.length > 0) out.faqAnswers = faqs;
  }
  if (!out.about && !out.proofIntro && !out.serviceIntros && !out.faqAnswers) return null;
  return out;
}

// ---------------------------------------------------------------------------
// Apply the (validated) draft to the skeleton
// ---------------------------------------------------------------------------

const normQ = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

function insertAfterHero(sections: LandingSection[], section: LandingSection): LandingSection[] {
  const idx = sections.findIndex((s) => s.type === "hero");
  if (idx < 0) return [section, ...sections];
  return [...sections.slice(0, idx + 1), section, ...sections.slice(idx + 1)];
}

function insertBeforeType(sections: LandingSection[], type: string, section: LandingSection): LandingSection[] {
  const idx = sections.findIndex((s) => s.type === type);
  if (idx < 0) return [...sections, section];
  return [...sections.slice(0, idx), section, ...sections.slice(idx)];
}

export function applyLandingDraft(pages: LandingBundlePage[], draft: LandingDraft): LandingBundlePage[] {
  const introBySlug = new Map((draft.serviceIntros ?? []).map((s) => [s.slug, s.body]));
  const answerByQ = new Map((draft.faqAnswers ?? []).map((f) => [normQ(f.q), f.a]));
  return pages.map((page) => {
    let sections = page.sections;
    // FAQ answers: only placeholders are ever replaced (additive, never overwrite real answers).
    sections = sections.map((sec) => {
      if (sec.type !== "faq" || !Array.isArray((sec as { items?: unknown }).items)) return sec;
      const items = (sec as unknown as { items: LandingFaqInput[] }).items;
      let changed = false;
      const next = items.map((it) => {
        if (it.a && it.a.includes("[PLACEHOLDER")) {
          const a = answerByQ.get(normQ(it.q));
          if (a) {
            changed = true;
            return { ...it, a };
          }
        }
        return it;
      });
      return changed ? { ...sec, items: next } : sec;
    });
    if (page.page_type === "home" && draft.about) {
      sections = insertAfterHero(sections, { type: "text", role: "about", heading: "About", body: draft.about });
    }
    if (page.page_type === "service_city") {
      const body = introBySlug.get(page.slug);
      if (body) sections = insertAfterHero(sections, { type: "text", role: "service_intro", body });
    }
    if (page.page_type === "proof" && draft.proofIntro) {
      sections = insertBeforeType(sections, "proof", { type: "text", role: "proof_intro", body: draft.proofIntro });
    }
    return sections === page.sections ? page : { ...page, sections };
  });
}

/** Flat key → text map of the draft, the shape stage 2 receives and returns. */
export function draftToCopyMap(draft: LandingDraft): Record<string, string> {
  const m: Record<string, string> = {};
  if (draft.about) m["about"] = draft.about;
  if (draft.proofIntro) m["proof_intro"] = draft.proofIntro;
  for (const s of draft.serviceIntros ?? []) m[`service:${s.slug}`] = s.body;
  return m;
}

/** Applies stage-2 draft_edits (already grounding-validated by caller) onto draft-inserted sections. */
export function applyDraftEdits(pages: LandingBundlePage[], edits: Record<string, string>): LandingBundlePage[] {
  return pages.map((page) => ({
    ...page,
    sections: page.sections.map((sec) => {
      if (sec.type !== "text") return sec;
      const role = sec["role"];
      let key: string | null = null;
      if (role === "about") key = "about";
      else if (role === "proof_intro") key = "proof_intro";
      else if (role === "service_intro") key = `service:${page.slug}`;
      if (!key) return sec;
      const edited = edits[key];
      return edited ? { ...sec, body: edited } : sec;
    }),
  }));
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function buildLandingBundleStaged(
  input: LandingGenerateInput,
  ports: LandingStagePorts
): Promise<StagedLandingBundle> {
  const theme = deriveLandingTheme(input.brandColor, input.business.category);
  const skeleton = buildMockBundle(input);
  const allowed = collectAllowedNumbers(input, skeleton);
  const stages: LandingStages = { draft: "skipped", refine: "skipped", rejectedNumbers: [] };

  // Stage 1 — draft (Kimi).
  let pages = skeleton;
  let draft: LandingDraft | null = null;
  if (ports.draft) {
    stages.draft = "failed";
    try {
      const prompt = buildDraftPrompt(input, skeleton);
      const text = prompt ? await ports.draft(prompt.system, prompt.user, 3000) : null;
      const parsed = text ? parseLandingDraft(text) : null;
      if (parsed) {
        const v = validateDraftGrounding(parsed, allowed);
        stages.rejectedNumbers.push(...v.rejected);
        if (Object.keys(v.draft).length > 0) {
          draft = v.draft;
          pages = applyLandingDraft(skeleton, draft);
          stages.draft = "ok";
        }
      }
    } catch {
      // stays "failed"
    }
  }

  // Stage 2 — refine (Claude/OpenAI).
  if (ports.refine) {
    stages.refine = "failed";
    try {
      const draftCopy = draft ? draftToCopyMap(draft) : undefined;
      const out = await enrichWithLlmPort(pages, input, ports.refine, draftCopy);
      if (out) {
        pages = out.pages;
        stages.refine = "ok";
        if (out.enrichment.draftEdits) {
          // Re-validate Claude's edits with the same grounding rule.
          const safe: Record<string, string> = {};
          for (const [k, v] of Object.entries(out.enrichment.draftEdits)) {
            const bad = findUngroundedNumbers(v, allowed);
            if (bad.length > 0) {
              for (const b of bad) if (!stages.rejectedNumbers.includes(b)) stages.rejectedNumbers.push(b);
              continue;
            }
            const trimmed = complianceTrim(v, allowed);
            if (trimmed.length >= 20) safe[k] = trimmed;
          }
          if (Object.keys(safe).length > 0) pages = applyDraftEdits(pages, safe);
        }
      }
    } catch {
      // stays "failed"
    }
  }

  const mode: "mock" | "llm" = stages.draft === "ok" || stages.refine === "ok" ? "llm" : "mock";
  return { mode, pages: mode === "mock" ? skeleton : pages, theme, stages };
}
