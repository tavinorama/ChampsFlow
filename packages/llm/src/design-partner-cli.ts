/**
 * design-partner-cli.ts — the testable half of scripts/design-partner-pack.ts.
 *
 * WHY THE LOGIC IS HERE AND NOT IN THE SCRIPT
 * ---------------------------------------------------------------------------
 * `npm run lint` is `tsc --noEmit` per workspace, and scripts/ is in no
 * workspace. Anything that matters — argument parsing, the cost pre-flight the
 * founder reads before approving a paid run, fixture validation, the pipeline
 * from probe answers to finished HTML — therefore lives in packages/llm, where
 * the type checker and the test suite both see it. The script keeps only the
 * parts that are genuinely I/O: reading a file, calling engines, writing HTML.
 *
 * THE MONEY RULE, IN CODE
 * ---------------------------------------------------------------------------
 * House rule: no paid action without explicit approval. `parsePackArgs` defaults
 * `confirm` to FALSE, and the script must print `costPreflightLines()` and exit
 * before touching a provider unless `--confirm` was passed. The pre-flight is a
 * forecast from packages/llm/src/audit-cost.ts — the same rates the api_spend
 * ledger books the run with, so the number the founder approves is the number
 * that lands in the ledger (give or take measured-vs-rate).
 *
 * Pure module: no I/O, no SQL, no LLM.
 */

import {
  estimateAuditCost,
  forecastAuditCost,
  formatUsd,
  type AuditCostEstimate,
  type CostEnv,
} from "./audit-cost";
import {
  buildDesignPartnerPack,
  renderDesignPartnerPackHtml,
  packEvidenceFromAnswers,
  PACK_LANGUAGES,
  PackEvidenceError,
  type PackAnswer,
  type PackCoverage,
  type PackLanguage,
  type PackModel,
} from "./design-partner-pack";
import {
  classifyAndGenerate,
  type GapClassificationSummary,
} from "./gap-classifier";

// ---------------------------------------------------------------------------
// 1. Options
// ---------------------------------------------------------------------------

/** Engines we ask by default. Region routing can still refuse one — it is named. */
export const DEFAULT_PACK_ENGINES: readonly string[] = ["openai", "anthropic", "gemini", "perplexity"];

/** Base runs per (question x engine). Matches the audit's lean base (sampling.ts). */
export const DEFAULT_RUNS_PER_PROMPT = 2;

/** Questions the pack probes. The audit portfolio is 10 (prompt-portfolio.ts). */
export const DEFAULT_PROMPT_COUNT = 10;

export const DEFAULT_BOOK_URL = "https://ozvor.com/book?from=design-partner";
export const DEFAULT_CONTACT_EMAIL = "hello@ozvor.com";

export interface PackCliOptions {
  /** Bare domain, no scheme, no path. */
  domain: string;
  /** The company name as the prospect writes it. */
  company: string;
  /** Human label for the market, printed on the pack. */
  market: string;
  /** BCP-47 locale used for the probes and the classifier. */
  locale: string;
  language: PackLanguage;
  /** Where the HTML is written. */
  out: string;
  /** FALSE by default. Nothing paid runs without it. */
  confirm: boolean;
  /**
   * The category the buyer searches for ("roofing contractor", "CRM for
   * clinics"). It shapes the 10 buyer questions. Required for a LIVE run:
   * guessing it would make every question we probe a guess too.
   */
  category: string;
  /**
   * Competitor names we can look for in the answers. Optional and honest about
   * it: without them the pack shows WHICH SOURCES the answer was built from,
   * and never claims to know who won.
   */
  competitors: string[];
  /** Path to a recorded audit. When set, no engine is called and nothing is charged. */
  fixture: string | null;
  engines: string[];
  runsPerPrompt: number;
  bookUrl: string;
  contactEmail: string;
}

export const PACK_USAGE = `
Design Partner Pack generator — one real audit, one 1-2 page document.

  npx tsx scripts/design-partner-pack.ts --domain <domain> --company "<name>" [options]

Required
  --domain <domain>        bare domain, e.g. northgateroofing.com
  --company "<name>"       the company name as they write it
  --category "<what>"      what buyers search for, e.g. "roofing contractor"
                           (required for a live run; a fixture carries its own)

Options
  --competitors "A,B"      names to look for in the answers. Without them the
                           pack shows the SOURCES and claims no winner.
  --market "<label>"       market label on the pack   (default: "United States - English")
  --locale <bcp47>         probe locale              (default: en-US)
  --lang <en|pt-BR>        pack language             (default: en)
  --out <path>             output HTML path          (default: ./design-partner-<domain>.html)
  --engines <a,b,c>        engines to ask            (default: ${DEFAULT_PACK_ENGINES.join(",")})
  --runs <n>               base runs per question    (default: ${DEFAULT_RUNS_PER_PROMPT})
  --book-url <url>         booking link on the pack
  --contact <email>        reply-to address on the pack
  --fixture <path>         build from a RECORDED audit: no engine calls, no cost
  --confirm                approve the paid run. WITHOUT IT NOTHING IS CALLED.

The cost is printed BEFORE anything is called. Re-run with --confirm to approve.
`.trim();

export type ParseResult =
  | { ok: true; options: PackCliOptions }
  | { ok: false; error: string };

function flagValue(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v === undefined || v.startsWith("--") ? undefined : v;
}

const hasFlag = (argv: readonly string[], name: string): boolean => argv.includes(`--${name}`);

/** Strip scheme, www. and any path so `--domain https://www.x.com/a` still works. */
export function normalizeDomain(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]!
    .split("?")[0]!
    .toLowerCase();
}

export function parsePackArgs(argv: readonly string[]): ParseResult {
  const domain = normalizeDomain(flagValue(argv, "domain") ?? "");
  if (!domain) return { ok: false, error: "--domain is required." };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return { ok: false, error: `--domain does not look like a domain: ${domain}` };
  }

  const company = (flagValue(argv, "company") ?? "").trim();
  if (!company) return { ok: false, error: "--company is required." };

  const langRaw = (flagValue(argv, "lang") ?? "en").trim();
  const language = PACK_LANGUAGES.find((l) => l.toLowerCase() === langRaw.toLowerCase());
  if (!language) {
    return { ok: false, error: `--lang must be one of: ${PACK_LANGUAGES.join(", ")}` };
  }

  const runsRaw = flagValue(argv, "runs");
  const runs = runsRaw === undefined ? DEFAULT_RUNS_PER_PROMPT : Number(runsRaw);
  if (!Number.isFinite(runs) || runs < 1 || runs > 5) {
    return { ok: false, error: "--runs must be a whole number between 1 and 5." };
  }

  const engines = (flagValue(argv, "engines") ?? DEFAULT_PACK_ENGINES.join(","))
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (engines.length === 0) return { ok: false, error: "--engines cannot be empty." };

  const fixture = flagValue(argv, "fixture") ?? null;
  const category = (flagValue(argv, "category") ?? "").trim();
  // A live run without a category would probe questions we invented about a
  // market we guessed. Refuse rather than sell the guess as a measurement.
  if (!fixture && !category) {
    return { ok: false, error: '--category is required for a live run, e.g. --category "roofing contractor".' };
  }

  return {
    ok: true,
    options: {
      domain,
      company,
      market: (flagValue(argv, "market") ?? "United States - English").trim(),
      locale: (flagValue(argv, "locale") ?? "en-US").trim(),
      language,
      out: (flagValue(argv, "out") ?? `./design-partner-${domain}.html`).trim(),
      category,
      competitors: (flagValue(argv, "competitors") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      confirm: hasFlag(argv, "confirm"),
      fixture,
      engines,
      runsPerPrompt: Math.floor(runs),
      bookUrl: (flagValue(argv, "book-url") ?? DEFAULT_BOOK_URL).trim(),
      contactEmail: (flagValue(argv, "contact") ?? DEFAULT_CONTACT_EMAIL).trim(),
    },
  };
}

// ---------------------------------------------------------------------------
// 2. The cost pre-flight — printed before a cent is spent
// ---------------------------------------------------------------------------

export interface PackForecast {
  estimate: AuditCostEstimate;
  prompts: number;
  answers: number;
}

/**
 * Forecast the run from its shape. `prompts` defaults to the audit portfolio size.
 *
 * NOTE ON EXTRACTION. A customer audit runs the two-pass extractor/verifier on
 * every answer (B3) and books it. The prospect pack does NOT: its citation test
 * is "the answer named the brand", which is what the pack says on its face.
 * So the forecast books zero extraction calls — the same zero the ledger will
 * see. A forecast that padded the number would be a different lie from one that
 * shaved it, and both make the founder's approval meaningless.
 */
export function forecastPackCost(
  options: Pick<PackCliOptions, "engines" | "runsPerPrompt">,
  prompts: number = DEFAULT_PROMPT_COUNT,
  env: CostEnv = process.env
): PackForecast {
  const base = forecastAuditCost(
    { prompts, engines: options.engines, runsPerPrompt: options.runsPerPrompt },
    env
  );
  const gensByEngine: Record<string, number> = {};
  for (const l of base.lines) gensByEngine[l.engine] = l.generations;
  return {
    estimate: estimateAuditCost({ gensByEngine, extractionCalls: 0 }, env),
    prompts,
    answers: prompts * options.engines.length * options.runsPerPrompt,
  };
}

/**
 * The block the script prints before it calls anything. It is deliberately
 * itemised: an approval that hides its arithmetic is not an approval.
 *
 * The last line differs on purpose. Without --confirm it says nothing ran; with
 * --confirm it says money is about to be spent. Both are true statements about
 * what happens next, and neither is a "started: true".
 */
export function costPreflightLines(
  options: PackCliOptions,
  forecast: PackForecast
): string[] {
  const e = forecast.estimate;
  const lines: string[] = [
    "Design Partner Pack — cost before anything runs",
    "-----------------------------------------------",
    `Company        ${options.company}`,
    `Domain         ${options.domain}`,
    `Category       ${options.category || "(from the fixture)"}`,
    `Competitors    ${
      options.competitors.length > 0
        ? options.competitors.join(", ")
        : "none given — the pack will show sources, not winners"
    }`,
    `Market         ${options.market} (${options.locale})`,
    `Pack language  ${options.language}`,
    `Questions      ${forecast.prompts}`,
    `Engines        ${options.engines.join(", ")}`,
    `Runs each      ${options.runsPerPrompt} (escalation can add more)`,
    `Answers read   ${forecast.answers}`,
    "",
  ];
  if (e.flatOverride) {
    lines.push(`AUDIT_COST_CENTS is set: this run books a flat ${formatUsd(e.totalCents)}.`);
  } else {
    for (const l of e.lines) {
      lines.push(
        `  ${l.engine.padEnd(12)} ${String(l.generations).padStart(4)} gens x ${l.rateCents.toFixed(2)}c = ${formatUsd(l.cents)}`
      );
    }
    lines.push(
      `  ${"extraction".padEnd(12)} ${String(e.extractionCalls).padStart(4)} calls x ${e.extractionRateCents.toFixed(2)}c = ${formatUsd(e.extractionCents)}`
    );
  }
  lines.push("");
  lines.push(`ESTIMATED COST: ${formatUsd(e.totalCents)} (floor — escalation can add runs)`);
  lines.push("This is an estimate from measured per-engine rates, not a quote.");
  lines.push("It will be recorded in api_spend as op='design_partner_pack'.");
  lines.push(
    "The pack's test is 'the answer named the brand'. It does not run the"
  );
  lines.push(
    "two-pass verifier a paid audit runs, so no extraction calls are booked."
  );
  lines.push("");
  lines.push(
    options.confirm
      ? "--confirm given. Calling the engines now. This spends real money."
      : "NOTHING WAS CALLED AND NOTHING WAS CHARGED. Re-run with --confirm to approve."
  );
  return lines;
}

// ---------------------------------------------------------------------------
// 2b. The mock guard — a pack is never built from a fabricated answer
// ---------------------------------------------------------------------------

/** Env var each engine's adapter reads. Absent key = mock mode (dev only). */
export const ENGINE_KEY_ENV: Readonly<Record<string, string>> = Object.freeze({
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  serp: "SERP_API_KEY",
});

/**
 * Which requested engines have NO API key, and would therefore answer from the
 * deterministic mock.
 *
 * This is the audit-integrity rule (PR #90) applied to sales: a prospect pack
 * assembled from mock answers is a fabricated audit with a real company's name
 * on it. The generator refuses the live run when this is non-empty — it does
 * not "degrade" to a demo, because a degraded pack that still looks finished is
 * exactly how a fabricated number reaches a person.
 */
export function enginesInMockMode(
  engines: readonly string[],
  env: CostEnv = process.env
): string[] {
  return engines.filter((e) => {
    const key = ENGINE_KEY_ENV[e];
    // An engine we do not know how to key cannot be vouched for either.
    if (!key) return true;
    return !env[key];
  });
}

// ---------------------------------------------------------------------------
// 3. The recorded-audit fixture
// ---------------------------------------------------------------------------

export interface PackAuditRecord {
  company: string;
  domain: string;
  market: string;
  locale: string;
  auditId: string;
  brandId: string;
  generatedAt: string;
  methodologyVersion: string;
  coverage: PackCoverage;
  answers: PackAnswer[];
}

function str(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new PackEvidenceError(`fixture.${field} must be a non-empty string.`);
  }
  return v.trim();
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function engineNotes(v: unknown): { engine: string; reason: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ engine: String(x["engine"] ?? ""), reason: String(x["reason"] ?? "") }))
    .filter((x) => x.engine !== "");
}

/**
 * Validate a recorded audit. Throws PackEvidenceError with the offending field
 * — a fixture that is silently half-read would produce a pack that understates
 * the gap, which is the exact failure mode this house does not allow.
 */
export function parseAuditFixture(raw: unknown): PackAuditRecord {
  if (!raw || typeof raw !== "object") throw new PackEvidenceError("fixture must be a JSON object.");
  const o = raw as Record<string, unknown>;
  const cov = (o["coverage"] ?? {}) as Record<string, unknown>;
  const rawAnswers = o["answers"];
  if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
    throw new PackEvidenceError("fixture.answers must be a non-empty array.");
  }
  const answers: PackAnswer[] = rawAnswers.map((a, i) => {
    if (!a || typeof a !== "object") throw new PackEvidenceError(`fixture.answers[${i}] is not an object.`);
    const r = a as Record<string, unknown>;
    const rank = r["rank"];
    const ec = r["entityConfidence"];
    return {
      question: str(r["question"], `answers[${i}].question`),
      promptId: typeof r["promptId"] === "string" ? r["promptId"] : undefined,
      engine: str(r["engine"], `answers[${i}].engine`),
      runIndex: typeof r["runIndex"] === "number" ? r["runIndex"] : 0,
      mentioned: r["mentioned"] === true,
      cited: r["cited"] === true,
      rank: typeof rank === "number" ? rank : null,
      competitors: strList(r["competitors"]),
      citations: strList(r["citations"]),
      sentiment: (typeof r["sentiment"] === "string" ? r["sentiment"] : "unknown") as PackAnswer["sentiment"],
      // null and undefined both mean "not measured". Never coerced to 0.
      entityConfidence: typeof ec === "number" ? ec : null,
      ...(r["absent"] === true ? { absent: true } : {}),
    };
  });

  return {
    company: str(o["company"], "company"),
    domain: normalizeDomain(str(o["domain"], "domain")),
    market: str(o["market"], "market"),
    locale: str(o["locale"], "locale"),
    auditId: str(o["auditId"], "auditId"),
    brandId: str(o["brandId"], "brandId"),
    generatedAt: str(o["generatedAt"], "generatedAt"),
    methodologyVersion: str(o["methodologyVersion"], "methodologyVersion"),
    coverage: {
      probed: strList(cov["probed"]),
      blocked: engineNotes(cov["blocked"]),
      failed: engineNotes(cov["failed"]),
    },
    answers,
  };
}

// ---------------------------------------------------------------------------
// 4. The pipeline: recorded/live answers -> finished pack
// ---------------------------------------------------------------------------

export interface AssembledPack {
  model: PackModel;
  html: string;
  /** What the classifier did, including the actions it REFUSED and why. */
  classification: GapClassificationSummary;
}

/**
 * Run the whole pipeline over an audit record. Identical for a recorded fixture
 * and a live run — the only difference upstream is who produced `answers`.
 *
 * `options` overrides the record's own company/market/language labels, so the
 * founder can re-render the same evidence in PT for a Brazilian contact without
 * paying for a second audit.
 */
export function assemblePack(
  record: PackAuditRecord,
  options: Pick<PackCliOptions, "company" | "market" | "language" | "bookUrl" | "contactEmail">
): AssembledPack {
  const { findings, observations } = packEvidenceFromAnswers(record.answers, {
    auditId: record.auditId,
    market: record.market,
    locale: record.locale,
    methodologyVersion: record.methodologyVersion,
  });

  const classification = classifyAndGenerate(observations, {
    brandId: record.brandId,
    brandName: record.company,
    brandDomain: record.domain,
    auditCompletedAt: record.generatedAt,
  });

  const model = buildDesignPartnerPack({
    company: options.company || record.company,
    domain: record.domain,
    market: options.market || record.market,
    language: options.language,
    generatedAt: record.generatedAt,
    coverage: record.coverage,
    findings,
    actions: classification.actions,
    methodologyVersion: record.methodologyVersion,
    bookUrl: options.bookUrl,
    contactEmail: options.contactEmail,
  });

  return { model, html: renderDesignPartnerPackHtml(model), classification };
}

/**
 * The one-paragraph summary the script prints after writing the file. It names
 * the refused actions instead of hiding them: an action the generator could not
 * make specific is a gap in OUR evidence, and the founder needs to know before
 * the conversation, not during it.
 */
export function packSummaryLines(pack: AssembledPack, outPath: string): string[] {
  const m = pack.model;
  const lines = [
    `Wrote ${outPath}`,
    `${m.company} (${m.domain}) — ${m.questionsAsked} questions, ${m.answersRead} answers read, named in ${m.citedAnswers}.`,
    `Gaps shown: ${m.gaps.length}. Actions shown: ${m.actions.length}.`,
  ];
  if (m.noGapFound) {
    lines.push("NO ACTION SHOWN: this run found no gap specific enough to act on. The pack says so.");
  }
  if (pack.classification.refused.length > 0) {
    lines.push(
      `Refused by the specificity guard: ${pack.classification.refused.length} (they are NOT in the pack).`
    );
    for (const r of pack.classification.refused.slice(0, 5)) {
      lines.push(`  - ${r.gapType} on ${r.engine}: ${r.problems.join("; ")}`);
    }
  }
  if (m.coverage.blocked.length > 0 || m.coverage.failed.length > 0) {
    lines.push(
      `Coverage holes printed on the pack: ${[...m.coverage.blocked, ...m.coverage.failed]
        .map((x) => x.engine)
        .join(", ")}`
    );
  }
  return lines;
}
