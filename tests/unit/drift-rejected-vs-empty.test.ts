/**
 * drift-rejected-vs-empty.test.ts — "rejected by the provider" is not
 * "measured nothing today" (T0.2, 15/09).
 *
 * What happened: from 10/09 03:30Z the anthropic probe got HTTP 400 on every
 * control. The gateway swallowed it into failedProviders, the worker's caller
 * returned null, the battery counted seven EMPTY runs (error_runs: 0), the
 * verdict said the engine "measured nothing today", the engine was paused —
 * and nobody was told for six days, because the failing branch only logged.
 *
 * What these tests hold:
 *   1. a caller that throws leaves the provider's reason on the result and
 *      the verdict says `provider_errors`, naming it;
 *   2. an engine that genuinely answers nothing is `no_answers`; an engine
 *      whose answers fail the controls is `behaviour` — only that one is drift;
 *   3. the worker's caller THROWS when the gateway reports the engine failed,
 *      instead of returning null;
 *   4. failing engines and an all-engine outage reach Telegram through
 *      alertOps, cause first;
 *   5. the persisted detail carries `cause` and each control's `last_error`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  runDriftBattery,
  evaluateDrift,
  DRIFT_CONTROLS,
  type DriftLLMCaller,
  type DriftEvaluation,
} from "../../packages/llm/src/drift-control";
import { formatDriftFailingAlert, formatDriftOutageAlert } from "../../apps/worker/src/jobs/drift-control";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const REJECTED = "anthropic HTTP 400 — invalid_request_error: web search is not enabled for this organization";

/** Answers every control honestly for the healthy engines. */
const honest: DriftLLMCaller = async ({ control }) =>
  control.kind === "positive"
    ? `${control.entity} is the obvious choice here.`
    : `I could not find any company called ${control.entity}.`;

describe("a rejected call is a provider error with a reason, not an empty answer", () => {
  it("the caller's error text lands on the result and in the verdict", async () => {
    const caller: DriftLLMCaller = async (args) => {
      if (args.engine === "anthropic") throw new Error(REJECTED);
      return honest(args);
    };
    const outcome = await runDriftBattery(["anthropic", "openai"], caller, { twoPass: false });
    const rejected = outcome.results.filter((r) => r.engine === "anthropic");
    expect(rejected).toHaveLength(DRIFT_CONTROLS.length);
    for (const r of rejected) {
      expect(r.errorRuns).toBe(1);
      expect(r.emptyRuns).toBe(0);
      expect(r.lastError).toBe(REJECTED);
    }
    for (const r of outcome.results.filter((r) => r.engine === "openai")) expect(r.lastError).toBeNull();

    const verdicts = evaluateDrift(outcome);
    const a = verdicts.find((v) => v.engine === "anthropic")!;
    expect(a.status).toBe("failing");
    expect(a.cause).toBe("provider_errors");
    expect(a.counts.error_runs).toBe(DRIFT_CONTROLS.length);
    expect(a.counts.empty_runs).toBe(0);
    expect(a.reasons[0]).toContain("rejected or failed at the provider");
    expect(a.reasons[0]).toContain("invalid_request_error: web search is not enabled");
    expect(a.reasons[0]).toContain("not engine behaviour");
    expect(a.reasons[0]).not.toContain("measured nothing today");

    const o = verdicts.find((v) => v.engine === "openai")!;
    expect(o.status).toBe("healthy");
    expect(o.cause).toBeNull();
  });

  it("an engine that answers nothing is `no_answers`, and one that fails the controls is `behaviour`", async () => {
    const caller: DriftLLMCaller = async ({ engine, control }) => {
      if (engine === "gemini") return "";
      if (engine === "perplexity") return "There are many options; I would not single one out.";
      return honest({ engine, control, runIndex: 0 });
    };
    const verdicts = evaluateDrift(await runDriftBattery(["gemini", "perplexity", "openai"], caller, { twoPass: false }));
    const g = verdicts.find((v) => v.engine === "gemini")!;
    expect(g.status).toBe("failing");
    expect(g.cause).toBe("no_answers");
    expect(g.reasons[0]).toContain("measured nothing today");
    const p = verdicts.find((v) => v.engine === "perplexity")!;
    expect(p.status).toBe("failing");
    expect(p.cause).toBe("behaviour");
    expect(verdicts.find((v) => v.engine === "openai")!.cause).toBeNull();
  });

  it("a mixed engine (some rejected, some empty) is still a provider problem, and says both", async () => {
    let n = 0;
    const caller: DriftLLMCaller = async () => {
      n += 1;
      if (n % 2 === 0) throw new Error("anthropic HTTP 400 — invalid_request_error: spend limit");
      return "";
    };
    const [v] = evaluateDrift(await runDriftBattery(["anthropic"], caller, { twoPass: false }));
    expect(v!.cause).toBe("provider_errors");
    expect(v!.reasons[0]).toMatch(/rejected or failed at the provider \(.*spend limit\), and \d+ came back empty/);
  });
});

describe("the worker wires it up", () => {
  const src = read("apps/worker/src/jobs/drift-control.ts");

  it("the gateway caller throws the provider's reason instead of returning null", () => {
    expect(src).toMatch(/const failed = res\.failedProviders\.find\(\(f\) => f\.provider === engine\);\s*if \(failed\) throw new Error\(failed\.error\);/);
  });

  it("failing engines and total outages reach Telegram", () => {
    expect(src).toContain('import { alertOps } from "../../../../packages/shared/src/ops-alert";');
    expect(src).toMatch(/drift_engines_failing[\s\S]{0,600}alertOps\(formatDriftFailingAlert\(/);
    expect(src).toMatch(/drift_battery_no_usable_responses[\s\S]{0,600}alertOps\(formatDriftOutageAlert\(/);
  });

  it("the persisted detail carries the cause and each control's last error", () => {
    expect(src).toContain("cause: evaluation.cause,");
    expect(src).toContain("last_error: r.lastError,");
  });
});

describe("the alert text puts the cause first", () => {
  const base: Omit<DriftEvaluation, "engine" | "cause" | "reasons"> = {
    positive_rate: 0,
    negative_rate: 0,
    status: "failing",
    counts: {
      positive_runs: 4,
      positive_usable: 0,
      positive_hits: 0,
      negative_runs: 3,
      negative_usable: 0,
      negative_hits: 0,
      empty_runs: 0,
      error_runs: 7,
    },
  };

  it("names a rejected engine as OUR problem and quotes the reason", () => {
    const text = formatDriftFailingAlert(
      [{ ...base, engine: "anthropic", cause: "provider_errors", reasons: [`7 of 7 control runs were rejected or failed at the provider (${REJECTED})`] }],
      true
    );
    expect(text).toContain("1 engine(s) failing");
    expect(text).toContain("PAUSED for new audits");
    expect(text).toContain("anthropic: REJECTED BY THE PROVIDER");
    expect(text).toContain("web search is not enabled");
    expect(text).toContain("not comparable");
  });

  it("distinguishes drift from an engine that answered nothing", () => {
    const text = formatDriftFailingAlert(
      [
        { ...base, engine: "gemini", cause: "no_answers", reasons: ["no usable answers"] },
        { ...base, engine: "perplexity", cause: "behaviour", reasons: ["positive controls at 0.25"] },
      ],
      false
    );
    expect(text).toContain("NOT paused (GEO_DRIFT_PAUSE=0)");
    expect(text).toContain("gemini: answered nothing usable");
    expect(text).toContain("perplexity: failed the behaviour controls (drift)");
  });

  it("the outage alert says nothing was recorded or paused", () => {
    const text = formatDriftOutageAlert(
      { results: [], generations: 35, verificationCalls: 0, checkedAt: "2026-09-15T03:30:00.000Z", batteryVersion: "1.0" },
      [{ ...base, engine: "anthropic", cause: "provider_errors", reasons: ["rejected"] }]
    );
    expect(text).toContain("ZERO usable answers across all 5 engines (35 calls)");
    expect(text).toContain("nothing recorded, nothing paused");
    expect(text).toContain("• anthropic: rejected");
  });
});
