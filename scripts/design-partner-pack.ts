#!/usr/bin/env npx tsx
/**
 * design-partner-pack.ts — one command, one real audit, one document the
 * founder can put in front of a company that is not a client yet.
 *
 * WHY A SCRIPT AND NOT AN ADMIN BUTTON
 * ---------------------------------------------------------------------------
 * This is the smallest change that ships. An admin route would need an
 * endpoint, auth, a queue job, a UI and a way to download the artifact — five
 * surfaces to build and five to keep honest. The founder runs ten of these in
 * total. One command with a printed cost and an explicit approval is the whole
 * requirement, and it is auditable by reading the terminal.
 *
 * THE TWO WAYS TO RUN IT
 * ---------------------------------------------------------------------------
 *   DRY (default)   prints the itemised cost and STOPS. Nothing is called.
 *   --confirm       calls the engines, books the spend, writes the HTML.
 *   --fixture       builds from a RECORDED audit. No engines, no cost, no
 *                   --confirm needed — this is how the tests and a rehearsal
 *                   run, and how the same evidence is re-rendered in pt-BR.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------------------------------------------------------------
 *   - Spend without --confirm.
 *   - Run live against an engine with no API key. A keyless adapter answers
 *     from a deterministic mock, and a pack built from mocks is a fabricated
 *     audit with a real company's name on it (audit-integrity rule, PR #90).
 *   - Render a pack with no probe evidence, or with the copy RELATORIO
 *     section 28 forbids. Both throw; see packages/llm/src/design-partner-pack.ts.
 *
 * USAGE
 *   npx tsx scripts/design-partner-pack.ts --domain acme.com --company "Acme" \
 *     --category "roofing contractor" [--competitors "A,B"] [--lang pt-BR] [--confirm]
 *   npx tsx scripts/design-partner-pack.ts --domain acme.com --company "Acme" \
 *     --fixture tests/fixtures/design-partner-audit.json
 *
 * The spend lands in api_spend as op='design_partner_pack' (DATABASE_URL
 * required for a live run — without it the run REFUSES, because an unrecorded
 * paid call is money we cannot see).
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import postgres from "postgres";

import {
  parsePackArgs,
  parseAuditFixture,
  assemblePack,
  forecastPackCost,
  costPreflightLines,
  packSummaryLines,
  enginesInMockMode,
  PACK_USAGE,
  type PackAuditRecord,
  type PackCliOptions,
} from "../packages/llm/src/design-partner-cli";
import type { PackAnswer } from "../packages/llm/src/design-partner-pack";
import {
  buildIntentPortfolio,
  runProbesSequential,
  parseCitation,
  detectCompetitors,
  estimateAuditCost,
  extractionRateCents,
  formatUsd,
  recordSpend,
  execForPostgresJs,
  mergeProbeUsage,
  type SamplingQuery,
  type ProbeUsage,
  type GeoLLMProvider,
  GEO_METHODOLOGY_VERSION,
} from "../packages/llm/src/index";

const say = (line = ""): void => console.log(line);
const die = (message: string, code = 2): never => {
  console.error(`\nERROR: ${message}\n`);
  process.exit(code);
};

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------------------
// The live run
// ---------------------------------------------------------------------------

interface LiveRun {
  record: PackAuditRecord;
  gensByEngine: Record<string, number>;
  usageByEngine: Record<string, ProbeUsage | undefined>;
  extractionCalls: number;
}

/**
 * Probe the engines and shape the answers into an audit record.
 *
 * This mirrors what apps/worker/src/jobs/audit-run.ts does for a customer, with
 * two deliberate differences: it writes nothing to the tenant tables (this
 * company is not a tenant), and it keeps no raw answer text beyond what
 * parseCitation needs in memory.
 */
async function runLiveAudit(options: PackCliOptions): Promise<LiveRun> {
  const auditId = `dpp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const portfolio = buildIntentPortfolio(options.company, options.category);

  const queries: SamplingQuery[] = portfolio.map((p) => ({
    queryHash: sha256(p.text),
    queryText: p.text,
    brandName: options.company,
    intentId: p.intentId,
    formulationIx: p.formulationIx,
  }));

  say(`Probing ${queries.length} questions across ${options.engines.join(", ")}...`);

  const result = await runProbesSequential(queries, {
    region: "us",
    requestedProviders: options.engines as GeoLLMProvider[],
    baseRuns: options.runsPerPrompt,
  });

  if (result.responses.length === 0) {
    die(
      "No engine returned an answer. Nothing was written and no pack was built.\n" +
        `       Failed: ${result.failedProviders.map((f) => `${f.provider} (${f.error})`).join("; ") || "none reported"}`
    );
  }

  const gensByEngine: Record<string, number> = {};
  const usageByEngine: Record<string, ProbeUsage | undefined> = {};
  const answers: PackAnswer[] = [];

  for (const resp of result.responses) {
    const engine = String(resp.provider);
    if (!resp.fromCache) {
      gensByEngine[engine] = (gensByEngine[engine] ?? 0) + (resp.runs ?? 1);
      usageByEngine[engine] = mergeProbeUsage(usageByEngine[engine], resp.usage);
    }
    const raw = resp.rawText ?? "";
    const parsed = parseCitation(raw, options.company);
    answers.push({
      question: resp.queryText ?? "",
      promptId: resp.queryHash ?? sha256(resp.queryText ?? ""),
      engine,
      runIndex: 0,
      mentioned: parsed.mentioned,
      // A single-run probe: cited === mentioned with a real position. The audit
      // applies a stricter two-pass rule; the pack says "named in the answer",
      // which is exactly what this measures, and never more.
      cited: parsed.mentioned,
      rank: parsed.position,
      competitors:
        options.competitors.length > 0 ? detectCompetitors(raw, options.competitors) : [],
      citations: parsed.sources,
      sentiment: "unknown",
      // Not measured for a prospect. null, never 0 — see the classifier's rule 2.
      entityConfidence: null,
      ...(resp.absent === true ? { absent: true } : {}),
    });
  }

  // Two-pass extraction is not run for a prospect pack, so no extraction calls
  // are booked. Stating zero is the honest number, not a rounding down.
  const extractionCalls = 0;

  const probed = [...new Set(result.responses.map((r) => String(r.provider)))];
  const record: PackAuditRecord = {
    company: options.company,
    domain: options.domain,
    market: options.market,
    locale: options.locale,
    auditId,
    brandId: `prospect_${options.domain}`,
    generatedAt: new Date().toISOString(),
    methodologyVersion: GEO_METHODOLOGY_VERSION,
    coverage: {
      probed,
      blocked: result.blockedProviders.map((p) => ({
        engine: String(p),
        reason: "region gate",
      })),
      failed: result.failedProviders.map((f) => ({
        engine: String(f.provider),
        reason: String(f.error).slice(0, 120),
      })),
    },
    answers,
  };

  return { record, gensByEngine, usageByEngine, extractionCalls };
}

/**
 * Book the spend. A paid call we cannot see is money we do not have, so this
 * runs before the HTML is written and its failure is reported loudly — but it
 * never discards a pack we already paid for.
 */
async function bookSpend(run: LiveRun, options: PackCliOptions): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    die(
      "DATABASE_URL is not set. A live run must be able to record its spend in api_spend.\n" +
        "       Nothing was called. Set DATABASE_URL, or rehearse with --fixture."
    );
  }
  const sql = postgres(url, { max: 1 });
  try {
    const exec = execForPostgresJs(sql);
    for (const [engine, gens] of Object.entries(run.gensByEngine)) {
      const u = run.usageByEngine[engine];
      const est = estimateAuditCost({ gensByEngine: { [engine]: gens }, extractionCalls: 0 });
      await recordSpend(exec, {
        op: "design_partner_pack",
        engine,
        model: u?.model ?? null,
        inputTokens: u?.inputTokens ?? null,
        outputTokens: u?.outputTokens ?? null,
        searchRequests: u?.searchRequests ?? null,
        requests: u?.requests ?? gens,
        estCents: est.totalCents,
        estSource: "rate",
        ref: run.record.auditId,
        // No tenant: this company is a prospect, not a customer.
        tenantId: null,
      });
    }
    if (run.extractionCalls > 0) {
      await recordSpend(exec, {
        op: "design_partner_pack",
        engine: "extraction",
        estCents: run.extractionCalls * extractionRateCents(),
        estSource: "rate",
        ref: run.record.auditId,
        tenantId: null,
      });
    }
    say(`Spend recorded in api_spend (op='design_partner_pack', ref=${run.record.auditId}).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    say(PACK_USAGE);
    process.exit(argv.length === 0 ? 2 : 0);
  }

  const parsed = parsePackArgs(argv);
  if (!parsed.ok) {
    console.error(`\nERROR: ${parsed.error}\n`);
    say(PACK_USAGE);
    process.exit(2);
  }
  const options = parsed.options;

  let record: PackAuditRecord;

  if (options.fixture) {
    // -------------------------------------------------------------------
    // Recorded path: no engines, no cost, no approval needed.
    // -------------------------------------------------------------------
    const path = resolve(options.fixture);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      die(`could not read the fixture at ${path}: ${(err as Error).message}`);
    }
    record = parseAuditFixture(raw);
    say(`Built from the recorded audit at ${path}. No engine was called. Cost: $0.00.`);
  } else {
    // -------------------------------------------------------------------
    // Live path: print the cost, demand approval, refuse mock mode.
    // -------------------------------------------------------------------
    const forecast = forecastPackCost(options);
    say();
    for (const line of costPreflightLines(options, forecast)) say(line);
    say();

    if (!options.confirm) process.exit(0);

    const mocked = enginesInMockMode(options.engines);
    if (mocked.length > 0) {
      die(
        `these engines have no API key and would answer from a MOCK: ${mocked.join(", ")}.\n` +
          "       A pack built from mock answers is a fabricated audit with a real\n" +
          "       company's name on it. Nothing was called. Set the keys, drop those\n" +
          "       engines with --engines, or rehearse with --fixture."
      );
    }

    const run = await runLiveAudit(options);
    await bookSpend(run, options);
    record = run.record;
  }

  const pack = assemblePack(record, options);

  const out = resolve(options.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, pack.html, "utf8");

  say();
  for (const line of packSummaryLines(pack, out)) say(line);
  say();
  say("Open it in a browser and print to PDF. It is self-contained — no network needed.");
}

main().catch((err) => {
  console.error(`\nFAILED: ${(err as Error).message}\n`);
  process.exit(1);
});
