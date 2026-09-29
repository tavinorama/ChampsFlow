/**
 * drift-confirm.test.ts — D11 (28/09). Four controls and one run each: one
 * answer decides whether an engine is held back from the weekly audit. The
 * thresholds stay; the sample grows, and only where it can change something.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  runDriftBattery, evaluateDrift, enginesToConfirm, mergeDriftOutcomes, DRIFT_CONTROLS,
  type DriftLLMCaller, type DriftEvaluation,
} from "../../../packages/llm/src/drift-control";

const ev = (engine: string, status: string, cause: string | null): DriftEvaluation =>
  ({ engine, status, cause, positive_rate: 0, negative_rate: 0, reasons: [], counts: {} }) as unknown as DriftEvaluation;

describe("enginesToConfirm — only a behaviour verdict is worth a second look", () => {
  it("failing or degraded by behaviour is confirmed; a provider error or silence is not; healthy is not", () => {
    const list = [
      ev("openai", "degraded", null),
      ev("gemini", "failing", "behaviour"),
      ev("anthropic", "failing", "provider_errors"),
      ev("perplexity", "failing", "no_answers"),
      ev("serp", "healthy", null),
    ];
    expect(enginesToConfirm(list)).toEqual(["openai", "gemini"]);
  });
});

describe("a confirmation pass changes the verdict only with evidence", () => {
  const positives = DRIFT_CONTROLS.filter((c) => c.kind === "positive");
  /** First run names the brand in 1 of 4 positives (a bad day); later runs name it in all. */
  const flaky: DriftLLMCaller = async ({ control, runIndex }) => {
    if (control.kind === "negative") return "I could not find any information about that.";
    const named = `The best known one is ${control.expect?.[0] ?? control.entity ?? "it"}.`;
    if (runIndex === 0 && (globalThis as { __firstPass?: boolean }).__firstPass) {
      return control.id === positives[0]!.id ? named : "There are several options to consider.";
    }
    return named;
  };

  it("one run reads failing; three more runs of the same engine read healthy", async () => {
    (globalThis as { __firstPass?: boolean }).__firstPass = true;
    const first = await runDriftBattery(["openai"], flaky, { runs: 1, twoPass: false });
    const before = evaluateDrift(first)[0]!;
    expect(before.status).not.toBe("healthy");
    expect(enginesToConfirm([before])).toEqual(["openai"]);

    (globalThis as { __firstPass?: boolean }).__firstPass = false;
    const extra = await runDriftBattery(["openai"], flaky, { runs: 3, twoPass: false });
    const merged = mergeDriftOutcomes(first, extra);
    const after = evaluateDrift(merged)[0]!;
    const positive = merged.results.filter((r) => r.kind === "positive");
    expect(positive.every((r) => r.runs === 4)).toBe(true);
    expect(merged.generations).toBe(first.generations + extra.generations);
    expect(after.positive_rate).toBeGreaterThan(before.positive_rate);
    expect(after.status).toBe("healthy");
  });

  it("an engine that keeps failing keeps its verdict: more sample is not a way out", async () => {
    const mute: DriftLLMCaller = async ({ control }) =>
      control.kind === "negative" ? "No information found." : "There are several options to consider.";
    const first = await runDriftBattery(["gemini"], mute, { runs: 1, twoPass: false });
    const merged = mergeDriftOutcomes(first, await runDriftBattery(["gemini"], mute, { runs: 3, twoPass: false }));
    expect(evaluateDrift(merged)[0]).toMatchObject({ status: "failing", cause: "behaviour", positive_rate: 0 });
  });

  it("merging leaves engines that were not re-run exactly as they were", async () => {
    const ok: DriftLLMCaller = async ({ control }) =>
      control.kind === "negative" ? "No information found." : `It is ${control.expect?.[0] ?? control.entity ?? "x"}.`;
    const first = await runDriftBattery(["openai", "perplexity"], ok, { runs: 1, twoPass: false });
    const extra = await runDriftBattery(["openai"], ok, { runs: 2, twoPass: false });
    const merged = mergeDriftOutcomes(first, extra);
    expect(merged.results.filter((r) => r.engine === "perplexity")).toEqual(first.results.filter((r) => r.engine === "perplexity"));
    expect(merged.results.filter((r) => r.engine === "openai").every((r) => r.runs === 3)).toBe(true);
  });
});

describe("it costs nothing until the founder turns it on", () => {
  it("the default is 0 and the thresholds are untouched", () => {
    const job = readFileSync(join(__dirname, "../../../apps/worker/src/jobs/drift-control.ts"), "utf8");
    expect(job).toContain('process.env["GEO_DRIFT_CONFIRM_RUNS"] ?? 0');
    expect(job).toContain("const toConfirm = confirmRuns > 0 ? enginesToConfirm(evaluations) : [];");
  });
});
