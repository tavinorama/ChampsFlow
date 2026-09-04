/**
 * gap-classifier.ts — Gap Classifier + Action Generator (audit P0-07,
 * RELATORIO-AUDITORIA-COMPLETA-OZVOR.md §5.1 steps 4/6/7, §5.2, §5.3).
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The audit photographed five Do Next cards that said, in full: "publish
 * content in answer format", "create presence on Wikipedia/LinkedIn/G2",
 * "audit profile consistency", "publish weekly", "activate weekly monitoring"
 * (RELATORIO §3.1). None of them named a lost prompt, an engine, the
 * competitor that won, the source it was cited from, a URL, a hypothesis, an
 * artifact, an owner, or a way to check it later. Those are horoscopes, not
 * work.
 *
 * This module turns ONE normalized observation per engine answer into a typed
 * gap and a `VisibilityAction` that carries its own evidence. It is the
 * generator; `visibility-loop.ts` stays the reconciler that decides which
 * cards live across audits (it now labels every card with the gap type this
 * module assigns). Nothing here duplicates that reconciliation.
 *
 * THREE RULES BAKED INTO THE TYPES
 * ---------------------------------------------------------------------------
 * 1. NO ACTION WITHOUT EVIDENCE. `validateActionSpecificity()` rejects an
 *    action whose recommendation does not quote the lost prompt, name the
 *    engine, and point at a stored answer. `assertActionsSpecific()` is the
 *    guard the loop runs, and `tests/unit/gap-classifier.test.ts` proves each
 *    of the five templates above is refused.
 *
 * 2. ABSENT DATA IS NEVER ZERO. A missing `entityConfidence` does not become
 *    0 (which would classify every observation as an entity gap); it becomes
 *    "not measured" and the classifier says so in `signalsUsed`. Confidence
 *    drops instead of the diagnosis being invented.
 *
 * 3. NO CATEGORY OUTSIDE THE TABLE. `GAP_TYPES` is exactly the seven of
 *    RELATORIO §5.2/§5.3 — technical, entity, content, proof, reputation,
 *    offsite, local. "Failed hypothesis" from that table is NOT an eighth
 *    type: it is the `priorAttempt` input, which changes the hypothesis and
 *    the recommendation so the same template is never re-served (§5.3, last
 *    row: "atualizar diagnóstico, não repetir template").
 *
 * Pure module: no I/O, no SQL, no LLM.
 */
import type { PlanTaskState } from "./plan-task-state";
import { sourceDomain, isActionableSource } from "./visibility-loop";

// ---------------------------------------------------------------------------
// 1. NormalizedObservation — RELATORIO §5.1 step 4
// ---------------------------------------------------------------------------

export type ObservationSentiment = "positive" | "neutral" | "negative" | "unknown";

/**
 * One engine answer, normalized. One row per (prompt × engine × run).
 *
 * Every field the audit lists is here. Nullable fields are nullable ON
 * PURPOSE: `null` means "this deployment does not measure it yet", and the
 * classifier degrades its confidence rather than reading the null as a zero.
 */
export interface NormalizedObservation {
  auditId: string;
  promptId: string;
  /** The buyer question exactly as it was probed — evidence.lostPrompt. */
  promptText: string;
  engine: string;
  /** Model id or search mode ("gpt-5", "web-search"). null = not recorded. */
  modelOrMode: string | null;
  market: string;
  locale: string;
  /** 0-based repetition index within this audit (repeat runs, §5.1 step 3). */
  runIndex: number;
  mentioned: boolean;
  /** 1-based position when mentioned. null = mentioned without a position. */
  mentionPosition: number | null;
  /** Cited = the answer attributed something to the brand, not just named it. */
  cited: boolean;
  citations: string[];
  competitors: string[];
  sentiment: ObservationSentiment;
  /** 0..1. null = the entity classifier did not run for this answer. */
  entityConfidence: number | null;
  /** True when the mention was another entity with our name. Never counts. */
  falsePositive: boolean;
  /** Why the entity was ambiguous, when it was. null = not ambiguous. */
  ambiguityReason: string | null;
  /** Pointer to the stored raw answer (row id / object key). */
  rawAnswerRef: string | null;
  latencyMs: number | null;
  cost: number | null;
  /** Scoring/probing methodology version — breaks comparability when it moves. */
  methodologyVersion: string;
}

// ---------------------------------------------------------------------------
// 2. The classification table — RELATORIO §5.3, verbatim in structure
// ---------------------------------------------------------------------------

export const GAP_TYPES = [
  "technical",
  "entity",
  "content",
  "proof",
  "reputation",
  "offsite",
  "local",
] as const;

export type GapType = (typeof GAP_TYPES)[number];

export interface GapDefinition {
  type: GapType;
  /** The observable that triggers it (left column of §5.3). */
  evidencePattern: string;
  /** The diagnosis (middle column). */
  diagnosis: string;
  /** The typical next action (right column). */
  typicalAction: string;
  /** What we produce, and where it goes. */
  artifactType: string;
  channel: string;
}

/**
 * The seven rows of RELATORIO §5.3. Adding an entry here is adding a category
 * to the product; `assertGapTableComplete()` is enforced by a unit test so a
 * type cannot exist without its evidence pattern, diagnosis and action.
 */
export const GAP_TABLE: Readonly<Record<GapType, GapDefinition>> = {
  technical: {
    type: "technical",
    evidencePattern: "the page that answers this question is not crawlable or not indexable",
    diagnosis: "AI cannot read the answer we already published",
    typicalAction: "fix robots/canonical/status, add schema and an internal link to the page",
    artifactType: "technical fix",
    channel: "website",
  },
  entity: {
    type: "entity",
    evidencePattern: "the engine confused the brand with another entity of the same name",
    diagnosis: "the entity is not resolvable — the answer is about someone else",
    typicalAction: "publish aliases, Organization/LocalBusiness schema, sameAs, and corroborating profiles",
    artifactType: "entity record",
    channel: "website + profiles",
  },
  content: {
    type: "content",
    evidencePattern: "a competitor is cited from its own content and we have no page on the question",
    diagnosis: "content gap — the answer exists on their site and not on ours",
    typicalAction: "publish the specific page that answers this question, with the comparison",
    artifactType: "page",
    channel: "website",
  },
  proof: {
    type: "proof",
    evidencePattern: "the brand is named but not recommended",
    diagnosis: "proof/trust gap — nothing backs the claim",
    typicalAction: "publish verifiable claims, reviews, credentials and cases",
    artifactType: "proof asset",
    channel: "website + review platforms",
  },
  reputation: {
    type: "reputation",
    evidencePattern: "the answer names the brand with negative sentiment",
    diagnosis: "reputation gap — what the engine reads about us is bad",
    typicalAction: "address the source of the complaint and publish the corrected record",
    artifactType: "response + record",
    channel: "review platforms + website",
  },
  offsite: {
    type: "offsite",
    evidencePattern: "the competitor is cited from Reddit/G2/YouTube-type sources",
    diagnosis: "off-site gap — the conversation happens where we are not",
    typicalAction: "genuine participation, a review programme, video or PR on that source",
    artifactType: "off-site presence",
    channel: "community/review/video platform",
  },
  local: {
    type: "local",
    evidencePattern: "a local-intent prompt is lost",
    diagnosis: "local gap — the local record is missing or inconsistent",
    typicalAction: "GBP, NAP, service area, a local page and local reviews",
    artifactType: "local listing",
    channel: "Google Business Profile + website",
  },
};

/** Enforced by a unit test. Returns human-readable problems, [] when sound. */
export function assertGapTableComplete(): string[] {
  const problems: string[] = [];
  for (const t of GAP_TYPES) {
    const d = GAP_TABLE[t];
    if (!d) {
      problems.push(`${t}: no row in GAP_TABLE`);
      continue;
    }
    if (d.type !== t) problems.push(`${t}: row type mismatch (${d.type})`);
    for (const k of ["evidencePattern", "diagnosis", "typicalAction"] as const) {
      if (typeof d[k] !== "string" || d[k].trim().length < 8) problems.push(`${t}: ${k} missing`);
    }
    // artifactType/channel are short by design ("page", "website"); they must
    // exist and name something, not fill a word count.
    for (const k of ["artifactType", "channel"] as const) {
      if (typeof d[k] !== "string" || d[k].trim().length < 3) problems.push(`${t}: ${k} missing`);
    }
  }
  return problems;
}

/**
 * Sources where presence is earned by participating, not by publishing a page.
 * Drives the content-vs-offsite split of §5.3 rows 3 and 4.
 */
export const OFFSITE_SOURCE_HOSTS: readonly string[] = [
  "reddit.com",
  "g2.com",
  "capterra.com",
  "getapp.com",
  "softwareadvice.com",
  "trustpilot.com",
  "trustradius.com",
  "youtube.com",
  "quora.com",
  "producthunt.com",
  "stackoverflow.com",
  "tripadvisor.com",
  "yelp.com",
];

export function isOffsiteSource(domain: string): boolean {
  if (!domain) return false;
  return OFFSITE_SOURCE_HOSTS.some((h) => domain === h || domain.endsWith(`.${h}`));
}

/**
 * Facts about the brand and this prompt that no single engine answer carries.
 * Every field is optional and `undefined` means NOT MEASURED — the classifier
 * must never read an absent signal as a negative one.
 */
export interface GapSignals {
  brandName: string;
  brandDomain?: string | null;
  /** The page we already have for this question, when we know of one. */
  targetUrl?: string | null;
  /** false = we verified it is blocked. undefined = we did not check. */
  pageCrawlable?: boolean;
  pageIndexable?: boolean;
  /** true = this prompt carries local intent ("near me", a city, a service area). */
  localIntent?: boolean;
  /** Below this, an entity confidence is treated as a confused entity. */
  entityConfidenceFloor?: number;
  /**
   * A previous action for this same prompt that reached Published/Indexed and
   * did not move the answer. RELATORIO §5.3 last row: update the diagnosis,
   * never re-serve the template.
   */
  priorAttempt?: {
    actionId: string;
    gapType: GapType;
    publishedUrl?: string | null;
    publishedAt?: string | null;
    state: PlanTaskState;
  } | null;
}

export const DEFAULT_ENTITY_CONFIDENCE_FLOOR = 0.6;

export interface GapClassification {
  gapType: GapType;
  /** Why this row of §5.3 and not another one — shown to the client. */
  reason: string;
  /** 0..1 — how much of the evidence the classifier actually had. */
  confidence: number;
  /** The signals that were readable. Absent ones are named in `missingSignals`. */
  signalsUsed: string[];
  /** Signals that would have sharpened the diagnosis and were not measured. */
  missingSignals: string[];
  /** True when a previous published action failed to move this prompt. */
  failedHypothesis: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Classify ONE observation. Returns null when the observation shows no gap
 * (the brand is cited, positively, in a good position, by the right entity).
 *
 * Order matters and is deliberate: a technical block makes every other
 * diagnosis wrong (we would tell the client to write a page they already
 * have), and an entity confusion makes the mention itself untrue.
 */
export function classifyGap(
  obs: NormalizedObservation,
  signals: GapSignals
): GapClassification | null {
  const used: string[] = [];
  const missing: string[] = [];
  const floor = signals.entityConfidenceFloor ?? DEFAULT_ENTITY_CONFIDENCE_FLOOR;
  const failedHypothesis =
    signals.priorAttempt != null &&
    ["published", "indexed"].includes(signals.priorAttempt.state) &&
    !obs.cited;

  const domains = obs.citations.map(sourceDomain).filter((d) => d && isActionableSource(d));
  const brandDomain = (signals.brandDomain ?? "").replace(/^www\./, "").toLowerCase();
  const competitorDomains = domains.filter((d) => d !== brandDomain);
  const offsiteDomains = competitorDomains.filter(isOffsiteSource);

  const finish = (
    gapType: GapType,
    reason: string,
    confidence: number
  ): GapClassification => ({
    gapType,
    reason,
    confidence: round2(Math.max(0.1, Math.min(1, confidence))),
    signalsUsed: used,
    missingSignals: missing,
    failedHypothesis,
  });

  // Row 1 — technical. Only ever from a POSITIVE measurement that the page is
  // blocked. `undefined` (never checked) is recorded as a missing signal.
  if (signals.pageCrawlable === false || signals.pageIndexable === false) {
    used.push("crawl/index check");
    const what = signals.pageCrawlable === false ? "not crawlable" : "not indexable";
    return finish(
      "technical",
      `the page that answers this question (${signals.targetUrl ?? "the target page"}) is ${what}, so ${obs.engine} cannot read it`,
      0.9
    );
  }
  if (signals.pageCrawlable === undefined && signals.pageIndexable === undefined) {
    missing.push("crawl/index check (not run for this prompt)");
  }

  // Row 2 — entity. A false positive or a stated ambiguity is hard evidence; a
  // low confidence score is softer. A null confidence is NOT a zero.
  if (obs.falsePositive || obs.ambiguityReason) {
    used.push("entity classifier");
    return finish(
      "entity",
      obs.ambiguityReason
        ? `${obs.engine} answered about another entity: ${obs.ambiguityReason}`
        : `the mention on ${obs.engine} was another entity with the same name, so it does not count as visibility`,
      0.9
    );
  }
  if (obs.entityConfidence === null) {
    missing.push("entity confidence (classifier did not run on this answer)");
  } else {
    used.push("entity confidence");
    if (obs.entityConfidence < floor) {
      return finish(
        "entity",
        `${obs.engine} resolved the brand with confidence ${obs.entityConfidence} (below ${floor}) — the answer may not be about ${signals.brandName}`,
        0.6 + (floor - obs.entityConfidence)
      );
    }
  }

  // The brand IS in the answer, as itself.
  if (obs.mentioned) {
    used.push("mention + sentiment");
    // Row 5 — reputation (negative sentiment beats every other diagnosis:
    // publishing more pages does not fix a bad record).
    if (obs.sentiment === "negative") {
      return finish(
        "reputation",
        `${obs.engine} names ${signals.brandName} negatively on this question`,
        0.8
      );
    }
    if (obs.sentiment === "unknown") missing.push("sentiment (not classified on this answer)");
    // Row 5 — proof/trust: named, not recommended. Either nothing was
    // attributed to us (cited=false) or we are far down the list.
    if (!obs.cited) {
      return finish(
        "proof",
        `${obs.engine} names ${signals.brandName} on this question but recommends someone else — nothing in the answer backs us`,
        0.75
      );
    }
    if (obs.mentionPosition !== null && obs.mentionPosition > 3) {
      return finish(
        "proof",
        `${obs.engine} cites ${signals.brandName} in position ${obs.mentionPosition} — present, but not the recommendation`,
        0.65
      );
    }
    if (obs.mentionPosition === null) missing.push("mention position (not recorded on this answer)");
    return null; // cited, positive, well placed — no material gap here.
  }

  // Not mentioned at all.
  used.push("citation sources");

  // Row 6 — local gap. Local intent is a property of the prompt, so it beats
  // the content/offsite split: the fix is the local record, not a blog post.
  if (signals.localIntent === true) {
    return finish(
      "local",
      `a local-intent question is lost on ${obs.engine} in ${obs.market}/${obs.locale}`,
      0.8
    );
  }
  if (signals.localIntent === undefined) missing.push("local intent (prompt not classified)");

  // Row 4 — off-site gap: the winner is cited from a place you join, not a
  // page you publish.
  if (offsiteDomains.length > 0) {
    return finish(
      "offsite",
      `${obs.engine} built this answer from ${offsiteDomains.slice(0, 3).join(", ")} — community and review sources where ${signals.brandName} is absent`,
      0.8
    );
  }

  // Row 3 — content gap: a competitor cited from its own content, or an answer
  // assembled from ordinary pages that are not ours.
  if (competitorDomains.length > 0 || obs.competitors.length > 0) {
    const winner = obs.competitors[0] ?? competitorDomains[0];
    return finish(
      "content",
      `${obs.engine} answers this with ${winner}${competitorDomains.length > 0 ? ` (cited from ${competitorDomains.slice(0, 2).join(", ")})` : ""} and has no page of ours to cite`,
      competitorDomains.length > 0 ? 0.8 : 0.6
    );
  }

  // Not mentioned, and the answer cited nothing we can read. Still a real gap —
  // it is simply the thinnest evidence we have, and the confidence says so.
  missing.push("cited sources (the answer exposed none)");
  return finish(
    "content",
    `${obs.engine} answers this question without ${signals.brandName}, and exposed no sources we could read`,
    0.4
  );
}

// ---------------------------------------------------------------------------
// 3. VisibilityAction — RELATORIO §5.2, field for field
// ---------------------------------------------------------------------------

/** The action lifecycle IS the plan_task lifecycle (P0-02). One vocabulary. */
export type ActionState = PlanTaskState;

export interface VisibilityAction {
  id: string;
  brandId: string;
  auditId: string;
  promptId: string;
  engine: string;
  market: string;
  language: string;
  gapType: GapType;
  evidence: {
    lostPrompt: string;
    observedAnswerId: string;
    winningBrands: string[];
    citedSources: string[];
    targetUrl?: string;
  };
  hypothesis: string;
  recommendation: string;
  artifactType: string;
  channel: string;
  ownerType: "ozvor" | "client" | "partner";
  effort: "S" | "M" | "L";
  impact: number;
  confidence: number;
  priority: number;
  state: ActionState;
  acceptanceCriteria: string[];
  verificationPlan: {
    earliestCheckAt: string;
    promptIds: string[];
    leadingSignals: string[];
    successCondition: string;
    maxAttemptsBeforeReplan: number;
  };
}

/** Days before a published artifact can honestly be re-probed, per gap type. */
export const RECHECK_DAYS: Readonly<Record<GapType, number>> = {
  technical: 7, // a crawl fix can land in the index within a week
  entity: 21, // corroboration across profiles is slow
  content: 14,
  proof: 14,
  reputation: 30,
  offsite: 21,
  local: 21,
};

const EFFORT_BY_TYPE: Readonly<Record<GapType, "S" | "M" | "L">> = {
  technical: "S",
  entity: "M",
  content: "M",
  proof: "M",
  reputation: "L",
  offsite: "L",
  local: "M",
};

const OWNER_BY_TYPE: Readonly<Record<GapType, VisibilityAction["ownerType"]>> = {
  technical: "client", // it is their server/CMS
  entity: "ozvor",
  content: "ozvor",
  proof: "client", // only they hold the real cases, credentials and reviews
  reputation: "client",
  offsite: "partner",
  local: "client",
};

export interface ActionGeneratorContext extends GapSignals {
  brandId: string;
  /** ISO instant the audit finished — the clock the recheck date starts from. */
  auditCompletedAt: string;
  /** Deterministic id maker so the same evidence yields the same action id. */
  makeId?: (parts: string[]) => string;
}

/** Deterministic, dependency-free id: stable for the same evidence. */
export function defaultActionId(parts: string[]): string {
  const s = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `va_${(h >>> 0).toString(36)}`;
}

const addDays = (iso: string, days: number): string => {
  const t = Date.parse(iso);
  const base = Number.isFinite(t) ? t : Date.now();
  return new Date(base + days * 86400000).toISOString();
};

const quote = (s: string): string => `"${s.replace(/"/g, "'")}"`;

/**
 * Build ONE action from one classified observation.
 *
 * Every sentence it writes names the prompt, the engine and the evidence. That
 * is not decoration: `validateActionSpecificity` refuses the action otherwise,
 * so a template can never reach a client.
 */
export function buildVisibilityAction(
  obs: NormalizedObservation,
  cls: GapClassification,
  ctx: ActionGeneratorContext
): VisibilityAction {
  const def = GAP_TABLE[cls.gapType];
  const makeId = ctx.makeId ?? defaultActionId;
  const citedSources = obs.citations.map(sourceDomain).filter(Boolean);
  const winners = obs.competitors.slice(0, 5);
  const winnerPhrase =
    winners.length > 0
      ? `${winners.join(", ")} ${winners.length === 1 ? "wins" : "win"} it today`
      : citedSources.length > 0
        ? `the answer is assembled from ${citedSources.slice(0, 2).join(" and ")}`
        : "the answer exposed no sources";

  // The hypothesis is a CAUSAL sentence, and when a previous attempt failed it
  // must say so instead of repeating the last one (§5.3 last row).
  const hypothesis = cls.failedHypothesis
    ? `The previous action for this prompt (${ctx.priorAttempt?.actionId ?? "unknown"}, ${ctx.priorAttempt?.gapType ?? "unknown"} gap${
        ctx.priorAttempt?.publishedUrl ? `, published at ${ctx.priorAttempt.publishedUrl}` : ""
      }) reached ${ctx.priorAttempt?.state ?? "published"} and ${obs.engine} still answers ${quote(obs.promptText)} without ${ctx.brandName}. The diagnosis was wrong or incomplete: re-classified as a ${cls.gapType} gap because ${cls.reason}.`
    : `${cls.reason}. Diagnosis: ${def.diagnosis}.`;

  const recommendation = buildRecommendation(obs, cls, ctx, winnerPhrase);

  const impact = round2(
    Math.min(
      1,
      0.4 +
        (winners.length > 0 ? 0.2 : 0) +
        (cls.gapType === "technical" || cls.gapType === "entity" ? 0.2 : 0.1) +
        (obs.runIndex === 0 ? 0.1 : 0)
    )
  );
  const priority = Math.round(100 * impact * cls.confidence);
  const recheckAt = addDays(ctx.auditCompletedAt, RECHECK_DAYS[cls.gapType]);

  return {
    id: makeId([ctx.brandId, obs.auditId, obs.promptId, obs.engine, cls.gapType]),
    brandId: ctx.brandId,
    auditId: obs.auditId,
    promptId: obs.promptId,
    engine: obs.engine,
    market: obs.market,
    language: obs.locale,
    gapType: cls.gapType,
    evidence: {
      lostPrompt: obs.promptText,
      observedAnswerId: obs.rawAnswerRef ?? `${obs.auditId}:${obs.promptId}:${obs.engine}:${obs.runIndex}`,
      winningBrands: winners,
      citedSources,
      ...(ctx.targetUrl ? { targetUrl: ctx.targetUrl } : {}),
    },
    hypothesis,
    recommendation,
    artifactType: def.artifactType,
    channel: def.channel,
    ownerType: OWNER_BY_TYPE[cls.gapType],
    effort: EFFORT_BY_TYPE[cls.gapType],
    impact,
    confidence: cls.confidence,
    priority,
    state: "proposed",
    acceptanceCriteria: buildAcceptanceCriteria(obs, cls, ctx),
    verificationPlan: {
      earliestCheckAt: recheckAt,
      promptIds: [obs.promptId],
      leadingSignals: buildLeadingSignals(cls.gapType),
      successCondition: `${obs.engine} cites ${ctx.brandName} for ${quote(obs.promptText)} in ${obs.market}/${obs.locale}, measured on methodology ${obs.methodologyVersion}`,
      maxAttemptsBeforeReplan: 2,
    },
  };
}

function buildRecommendation(
  obs: NormalizedObservation,
  cls: GapClassification,
  ctx: ActionGeneratorContext,
  winnerPhrase: string
): string {
  const q = quote(obs.promptText);
  const where = `${obs.engine} (${obs.market}/${obs.locale})`;
  const head = `On ${where} you are missing from ${q} — ${winnerPhrase}.`;
  const tail = cls.failedHypothesis
    ? ` The previous attempt did not move it, so do NOT repeat it: ${GAP_TABLE[cls.gapType].typicalAction}, aimed at this exact question.`
    : "";

  switch (cls.gapType) {
    case "technical":
      return `${head} The page ${ctx.targetUrl ?? "that answers it"} exists but the engine cannot read it. Fix robots/canonical/HTTP status for that URL, add the matching schema, and link it from a page already crawled.${tail}`;
    case "entity":
      return `${head} The engine is not sure ${ctx.brandName} is ${ctx.brandName}${obs.ambiguityReason ? ` (${obs.ambiguityReason})` : ""}. Publish Organization schema with sameAs pointing at your own profiles, state the aliases on the site, and get one corroborating third-party record to match.${tail}`;
    case "content":
      return `${head} Publish one page that answers ${q} directly in the first paragraph, with the comparison against ${obs.competitors[0] ?? "the cited source"}, and cite it from your own pages so the engine can find it.${tail}`;
    case "proof":
      return `${head} You are named and not recommended. Add verifiable proof to the page that answers ${q}: named cases with numbers, credentials, and reviews that can be checked off-site.${tail}`;
    case "reputation":
      return `${head} Address what is being said at the source, then publish the corrected record and point ${obs.citations[0] ?? "the source"} at it.${tail}`;
    case "offsite":
      return `${head} Earn a presence on ${obs.citations.map(sourceDomain).filter(isOffsiteSource)[0] ?? "the community source"} the way that source allows — genuine participation, a review programme, or a video — targeted at ${q}.${tail}`;
    case "local":
      return `${head} Fix the local record for ${obs.market}: Google Business Profile categories and service area, NAP consistent with the site, and a local page that answers ${q} for this location.${tail}`;
  }
}

function buildAcceptanceCriteria(
  obs: NormalizedObservation,
  cls: GapClassification,
  ctx: ActionGeneratorContext
): string[] {
  const q = quote(obs.promptText);
  const common = [
    `An artifact exists at a public URL and answers ${q} explicitly.`,
    `${obs.engine} is re-probed for ${q} in ${obs.market}/${obs.locale} after ${RECHECK_DAYS[cls.gapType]} days.`,
  ];
  switch (cls.gapType) {
    case "technical":
      return [
        `${ctx.targetUrl ?? "The target URL"} returns 200, is allowed in robots.txt and carries a self-referencing canonical.`,
        ...common,
      ];
    case "entity":
      return [
        `Organization/LocalBusiness schema is live with sameAs and the aliases used in ${q}.`,
        `At least one third-party record states the same name, address and category.`,
        ...common,
      ];
    case "proof":
      return [`At least two verifiable proofs (named case, credential or off-site review) are on the page.`, ...common];
    case "reputation":
      return [`The negative source has been answered on the record, and the corrected statement is public.`, ...common];
    case "offsite":
      return [`A presence exists on the cited community/review source, published under the brand.`, ...common];
    case "local":
      return [`GBP category, service area and NAP match the site, and a local page for ${obs.market} is live.`, ...common];
    case "content":
      return [`The new page answers ${q} in its first paragraph and is internally linked.`, ...common];
  }
}

function buildLeadingSignals(t: GapType): string[] {
  switch (t) {
    case "technical":
      return ["URL fetchable by AI crawlers", "page indexed", "internal links crawled"];
    case "entity":
      return ["schema validates", "sameAs profiles reachable", "third-party record matches"];
    case "offsite":
      return ["profile live on the source", "first genuine contribution published"];
    case "local":
      return ["GBP updated", "NAP consistent across citations"];
    case "reputation":
      return ["public response published", "source updated"];
    case "proof":
      return ["proof assets live", "off-site reviews reachable"];
    case "content":
      return ["page published", "page indexed", "page internally linked"];
  }
}

// ---------------------------------------------------------------------------
// 4. The specificity guard — "template genérico é proibido"
// ---------------------------------------------------------------------------

/**
 * The exact five recommendations the audit photographed (RELATORIO §3.1), plus
 * their nearest paraphrases. An action whose recommendation reduces to one of
 * these is refused — regardless of who or what generated it.
 */
export const GENERIC_RECOMMENDATION_PATTERNS: readonly RegExp[] = [
  /^\W*publish(?:ing)?\s+content\s+in\s+(?:an?\s+)?answer\s+format\W*$/i,
  /^\W*create\s+(?:a\s+)?presence\s+(?:on|in)\s+[\w,/\s&]+\W*$/i,
  /^\W*audit\s+(?:your\s+)?profile\s+consistency\W*$/i,
  /^\W*publish\s+(?:content\s+)?weekly\W*$/i,
  /^\W*(?:activate|enable|set\s+up)\s+weekly\s+monitoring\W*$/i,
  /^\W*(?:improve|increase|boost)\s+(?:your\s+)?(?:ai\s+)?visibility\W*$/i,
  /^\W*keep\s+publishing\W*$/i,
];

export interface SpecificityProblem {
  field: string;
  problem: string;
}

/**
 * Returns the reasons this action is not specific enough to ship. Empty array
 * means it may be shown to a client.
 *
 * The rules are the audit's own list of what every card must name (§3.1):
 * lost prompt, engine, stored answer, hypothesis, recommendation, artifact,
 * channel, owner, acceptance criteria and a verification plan.
 */
export function validateActionSpecificity(action: VisibilityAction): SpecificityProblem[] {
  const p: SpecificityProblem[] = [];
  const rec = (action.recommendation ?? "").trim();
  const prompt = (action.evidence?.lostPrompt ?? "").trim();

  if (prompt.length === 0) p.push({ field: "evidence.lostPrompt", problem: "no prompt — the card cannot say what was lost" });
  if ((action.evidence?.observedAnswerId ?? "").trim().length === 0) {
    p.push({ field: "evidence.observedAnswerId", problem: "no pointer to the stored answer, so the claim cannot be checked" });
  }
  if (rec.length < 40) p.push({ field: "recommendation", problem: "too short to be a piece of work" });
  for (const re of GENERIC_RECOMMENDATION_PATTERNS) {
    if (re.test(rec)) {
      p.push({ field: "recommendation", problem: `generic template refused (matches ${re})` });
      break;
    }
  }
  if (prompt.length > 0 && !rec.includes(prompt.slice(0, Math.min(24, prompt.length)))) {
    p.push({ field: "recommendation", problem: "does not quote the lost prompt it is supposed to fix" });
  }
  if (action.engine && !rec.includes(action.engine)) {
    p.push({ field: "recommendation", problem: `does not name the engine (${action.engine}) where the prompt was lost` });
  }
  if ((action.hypothesis ?? "").trim().length < 20) {
    p.push({ field: "hypothesis", problem: "no causal hypothesis — a recommendation without a why is a guess" });
  }
  if (!GAP_TYPES.includes(action.gapType)) {
    p.push({ field: "gapType", problem: `${action.gapType} is not one of the seven categories` });
  }
  if (!action.artifactType?.trim()) p.push({ field: "artifactType", problem: "no artifact type" });
  if (!action.channel?.trim()) p.push({ field: "channel", problem: "no channel" });
  if (!action.ownerType) p.push({ field: "ownerType", problem: "no owner" });
  if (!Array.isArray(action.acceptanceCriteria) || action.acceptanceCriteria.length === 0) {
    p.push({ field: "acceptanceCriteria", problem: "nothing to accept — the card can never be closed honestly" });
  }
  const vp = action.verificationPlan;
  if (!vp || !vp.earliestCheckAt || !Number.isFinite(Date.parse(vp.earliestCheckAt))) {
    p.push({ field: "verificationPlan.earliestCheckAt", problem: "no next recheck date" });
  }
  if (!vp || !Array.isArray(vp.promptIds) || vp.promptIds.length === 0) {
    p.push({ field: "verificationPlan.promptIds", problem: "no prompt to re-probe, so it can never be verified" });
  }
  if (!vp || (vp.successCondition ?? "").trim().length < 20) {
    p.push({ field: "verificationPlan.successCondition", problem: "no success condition" });
  }
  return p;
}

export function isSpecificAction(action: VisibilityAction): boolean {
  return validateActionSpecificity(action).length === 0;
}

/** Throws with every reason listed. Used at the generator's boundary. */
export function assertActionsSpecific(actions: VisibilityAction[]): void {
  const problems: string[] = [];
  for (const a of actions) {
    for (const p of validateActionSpecificity(a)) {
      problems.push(`${a.id} (${a.gapType}) ${p.field}: ${p.problem}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`generic or incomplete visibility action refused — ${problems.join("; ")}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Generator entry point
// ---------------------------------------------------------------------------

export interface GapClassificationSummary {
  /** Actions that passed the specificity guard, highest priority first. */
  actions: VisibilityAction[];
  /** Observations that showed a gap but could not produce a shippable action. */
  refused: { promptId: string; engine: string; gapType: GapType; problems: string[] }[];
  /** How many observations showed no material gap. */
  clean: number;
  byType: Record<GapType, number>;
}

/**
 * Classify every observation and generate one action per (prompt × gap type).
 *
 * De-duplication: the same prompt lost on three engines produces ONE action
 * per gap type, keeping the engine with the strongest evidence, because the
 * artifact that fixes it is the same artifact. The other engines are recorded
 * in the verification plan's prompt list so all of them are re-probed.
 *
 * A refused action is NEVER silently dropped: it lands in `refused` with the
 * reasons, and the caller (audit-run) logs it. Nothing degrades quietly.
 */
export function classifyAndGenerate(
  observations: NormalizedObservation[],
  ctx: ActionGeneratorContext,
  perPrompt?: (promptId: string) => GapSignals | undefined
): GapClassificationSummary {
  const byKey = new Map<string, { obs: NormalizedObservation; cls: GapClassification }>();
  const byType: Record<GapType, number> = {
    technical: 0,
    entity: 0,
    content: 0,
    proof: 0,
    reputation: 0,
    offsite: 0,
    local: 0,
  };
  let clean = 0;

  for (const obs of observations) {
    if (obs.falsePositive && !obs.mentioned) {
      // A false positive on an answer that never mentioned us is noise, not a
      // gap; the entity path above only applies to claimed mentions.
      continue;
    }
    const signals: GapSignals = { ...ctx, ...(perPrompt?.(obs.promptId) ?? {}) };
    const cls = classifyGap(obs, signals);
    if (!cls) {
      clean += 1;
      continue;
    }
    const key = `${obs.promptId}::${cls.gapType}`;
    const prev = byKey.get(key);
    if (!prev || cls.confidence > prev.cls.confidence) byKey.set(key, { obs, cls });
  }

  const actions: VisibilityAction[] = [];
  const refused: GapClassificationSummary["refused"] = [];
  for (const { obs, cls } of byKey.values()) {
    byType[cls.gapType] += 1;
    const signals: GapSignals = { ...ctx, ...(perPrompt?.(obs.promptId) ?? {}) };
    const action = buildVisibilityAction(obs, cls, { ...ctx, ...signals });
    const problems = validateActionSpecificity(action);
    if (problems.length > 0) {
      refused.push({
        promptId: obs.promptId,
        engine: obs.engine,
        gapType: cls.gapType,
        problems: problems.map((x) => `${x.field}: ${x.problem}`),
      });
      continue;
    }
    actions.push(action);
  }

  actions.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return { actions, refused, clean, byType };
}
