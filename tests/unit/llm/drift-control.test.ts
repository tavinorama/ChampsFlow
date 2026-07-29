/**
 * drift-control.test.ts — B4 anti-drift control battery.
 *
 * The battery answers one question: did the ENGINE change, or did the CLIENT?
 * These tests pin the arithmetic and the thresholds that answer it:
 *
 *   degraded : positive_rate < 0.75  OR  negative_rate > 0.10
 *   failing  : positive_rate < 0.50  OR  negative_rate > 0.25
 *
 * Boundaries are inclusive-healthy: a rate exactly ON the line is not yet a
 * problem — only crossing it is. Every LLM call is mocked; no network.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  DRIFT_CONTROLS,
  DRIFT_THRESHOLDS,
  DRIFT_BATTERY_VERSION,
  driftControlEnabled,
  detectMention,
  runDriftBattery,
  evaluateDrift,
  estimateDriftCostCents,
} from "../../../packages/llm/src/drift-control";
import type {
  DriftControl,
  DriftEngine,
  DriftLLMCaller,
} from "../../../packages/llm/src/drift-control";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENGINES: DriftEngine[] = ["anthropic", "openai", "gemini", "perplexity", "serp"];

/** Answer that names the control's entity (a real citation). */
function citingAnswer(control: DriftControl): string {
  return `For that question the clear answer is ${control.entity}. It leads the category by a wide margin.`;
}

/** Answer that never names the entity (the engine went vague). */
function vagueAnswer(): string {
  return "There are several options in this space and the answer depends on your needs.";
}

/** Honest refusal on a fictional entity — the CORRECT negative-control answer. */
function refusalAnswer(control: DriftControl): string {
  return `I'm not familiar with ${control.entity}. I could not find any company by that name.`;
}

/** Build N synthetic controls of one kind, so a test can hit an exact rate. */
function syntheticControls(kind: "positive" | "negative", n: number): DriftControl[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${kind}_${i}`,
    kind,
    prompt: `synthetic control ${i}`,
    entity: `Entity${i}`,
    detectTerms: [`Entity${i}`],
    expected: kind === "positive" ? 1 : 0,
    rationale: "synthetic fixture",
  }));
}

/** Caller that cites the first `hits` controls and goes vague on the rest. */
function callerWithHits(hits: number): DriftLLMCaller {
  const seen = new Map<string, number>();
  return async ({ engine, control }) => {
    const ix = seen.get(engine) ?? 0;
    seen.set(engine, ix + 1);
    return ix < hits ? citingAnswer(control) : vagueAnswer();
  };
}

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

// ---------------------------------------------------------------------------
// Battery definition
// ---------------------------------------------------------------------------

describe("drift battery definition", () => {
  it("ships positive and negative controls with unique ids and honest expectations", () => {
    const positives = DRIFT_CONTROLS.filter((c) => c.kind === "positive");
    const negatives = DRIFT_CONTROLS.filter((c) => c.kind === "negative");
    expect(positives.length).toBeGreaterThanOrEqual(3);
    expect(negatives.length).toBeGreaterThanOrEqual(3);

    // Positive controls expect a mention; negative controls expect NONE.
    expect(positives.every((c) => c.expected === 1)).toBe(true);
    expect(negatives.every((c) => c.expected === 0)).toBe(true);

    const ids = DRIFT_CONTROLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DRIFT_BATTERY_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it("GEO_DRIFT_CONTROL defaults ON and only '0' turns it off", () => {
    delete process.env["GEO_DRIFT_CONTROL"];
    expect(driftControlEnabled()).toBe(true);
    process.env["GEO_DRIFT_CONTROL"] = "1";
    expect(driftControlEnabled()).toBe(true);
    process.env["GEO_DRIFT_CONTROL"] = "0";
    expect(driftControlEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 1) Healthy engine
// ---------------------------------------------------------------------------

describe("healthy engine", () => {
  it("cites every dominant brand and refuses every fictional one → healthy, no reasons", async () => {
    const caller: DriftLLMCaller = async ({ control }) =>
      control.kind === "positive" ? citingAnswer(control) : refusalAnswer(control);

    const outcome = await runDriftBattery(ENGINES, caller);
    const evals = evaluateDrift(outcome);

    expect(evals).toHaveLength(5);
    expect(outcome.generations).toBe(5 * DRIFT_CONTROLS.length);
    for (const e of evals) {
      expect(e.positive_rate).toBe(1);
      expect(e.negative_rate).toBe(0);
      expect(e.status).toBe("healthy");
      expect(e.reasons).toEqual([]);
    }
  });

  it("scores each engine independently — one bad engine does not taint the others", async () => {
    const caller: DriftLLMCaller = async ({ engine, control }) => {
      if (control.kind === "negative") {
        // openai invents the company; everyone else refuses honestly.
        return engine === "openai"
          ? `${control.entity} is a mid-sized firm serving retail and logistics clients.`
          : refusalAnswer(control);
      }
      return citingAnswer(control);
    };

    const evals = evaluateDrift(await runDriftBattery(ENGINES, caller));
    const byEngine = Object.fromEntries(evals.map((e) => [e.engine, e]));

    expect(byEngine["openai"]?.status).toBe("failing");
    expect(byEngine["openai"]?.negative_rate).toBe(1);
    for (const other of ["anthropic", "gemini", "perplexity", "serp"]) {
      expect(byEngine[other]?.status).toBe("healthy");
      expect(byEngine[other]?.negative_rate).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2) Degraded by a drop in positive controls
// ---------------------------------------------------------------------------

describe("degraded engine", () => {
  it("names dominant brands in only half the controls → degraded on the positive side", async () => {
    const positives = syntheticControls("positive", 4);
    const outcome = await runDriftBattery(["gemini"], callerWithHits(2), {
      controls: positives,
    });
    const [evaluation] = evaluateDrift(outcome);

    expect(evaluation?.positive_rate).toBe(0.5);
    expect(evaluation?.negative_rate).toBe(0);
    expect(evaluation?.status).toBe("degraded");
    expect(evaluation?.reasons.join(" ")).toContain("positive controls at 0.50");
  });

  it("two hallucinations in ten negative controls (0.20) → degraded, not failing", async () => {
    const negatives = syntheticControls("negative", 10);
    const outcome = await runDriftBattery(["perplexity"], callerWithHits(2), {
      controls: negatives,
    });
    const [evaluation] = evaluateDrift(outcome);

    expect(evaluation?.negative_rate).toBe(0.2);
    expect(evaluation?.status).toBe("degraded");
    expect(evaluation?.reasons.join(" ")).toContain("hallucinated a fictional entity");
  });
});

// ---------------------------------------------------------------------------
// 3) Failing by hallucination of a fictional entity
// ---------------------------------------------------------------------------

describe("failing engine", () => {
  it("describes invented companies as real → failing, citations that day are untrustworthy", async () => {
    const caller: DriftLLMCaller = async ({ control }) =>
      control.kind === "positive"
        ? citingAnswer(control)
        : `${control.entity} is a well-established provider headquartered in Chicago, serving enterprise clients since 2011.`;

    const [evaluation] = evaluateDrift(await runDriftBattery(["anthropic"], caller));

    expect(evaluation?.positive_rate).toBe(1);
    expect(evaluation?.negative_rate).toBe(1);
    expect(evaluation?.status).toBe("failing");
    expect(evaluation?.reasons.join(" ")).toContain("do not exist");
  });

  it("stops naming dominant brands almost entirely → failing on the positive side", async () => {
    const positives = syntheticControls("positive", 4);
    const outcome = await runDriftBattery(["serp"], callerWithHits(1), { controls: positives });
    const [evaluation] = evaluateDrift(outcome);

    expect(evaluation?.positive_rate).toBe(0.25);
    expect(evaluation?.status).toBe("failing");
    expect(evaluation?.reasons.join(" ")).toContain("stopped naming dominant brands");
  });
});

// ---------------------------------------------------------------------------
// 4) Threshold boundaries — exactly ON the line is still healthy
// ---------------------------------------------------------------------------

describe("threshold boundaries", () => {
  it("positive_rate exactly 0.75 is healthy; a hair below is degraded", async () => {
    const positives = syntheticControls("positive", 4);
    const onLine = evaluateDrift(
      await runDriftBattery(["openai"], callerWithHits(3), { controls: positives })
    )[0];
    expect(onLine?.positive_rate).toBe(DRIFT_THRESHOLDS.positiveDegradedBelow);
    expect(onLine?.status).toBe("healthy");
    expect(onLine?.reasons).toEqual([]);

    const below = evaluateDrift(
      await runDriftBattery(["openai"], callerWithHits(7), {
        controls: syntheticControls("positive", 10),
      })
    )[0];
    expect(below?.positive_rate).toBe(0.7);
    expect(below?.status).toBe("degraded");
  });

  it("negative_rate exactly 0.10 is healthy; exactly 0.25 is degraded, above it is failing", async () => {
    const onLine = evaluateDrift(
      await runDriftBattery(["gemini"], callerWithHits(1), {
        controls: syntheticControls("negative", 10),
      })
    )[0];
    expect(onLine?.negative_rate).toBe(DRIFT_THRESHOLDS.negativeDegradedAbove);
    expect(onLine?.status).toBe("healthy");

    const atFailingLine = evaluateDrift(
      await runDriftBattery(["gemini"], callerWithHits(1), {
        controls: syntheticControls("negative", 4),
      })
    )[0];
    expect(atFailingLine?.negative_rate).toBe(DRIFT_THRESHOLDS.negativeFailingAbove);
    expect(atFailingLine?.status).toBe("degraded");

    const aboveFailingLine = evaluateDrift(
      await runDriftBattery(["gemini"], callerWithHits(2), {
        controls: syntheticControls("negative", 5),
      })
    )[0];
    expect(aboveFailingLine?.negative_rate).toBe(0.4);
    expect(aboveFailingLine?.status).toBe("failing");
  });

  it("positive_rate exactly 0.50 is degraded, not failing", async () => {
    const evaluation = evaluateDrift(
      await runDriftBattery(["perplexity"], callerWithHits(5), {
        controls: syntheticControls("positive", 10),
      })
    )[0];
    expect(evaluation?.positive_rate).toBe(DRIFT_THRESHOLDS.positiveFailingBelow);
    expect(evaluation?.status).toBe("degraded");
  });
});

// ---------------------------------------------------------------------------
// 5) Empty responses and errors — we measured nothing, and we say so
// ---------------------------------------------------------------------------

describe("empty and errored responses", () => {
  it("an engine that returns empty text every time is failing, not silently perfect", async () => {
    const caller: DriftLLMCaller = async () => "";
    const outcome = await runDriftBattery(["serp"], caller);
    const [evaluation] = evaluateDrift(outcome);

    expect(evaluation?.counts.empty_runs).toBe(DRIFT_CONTROLS.length);
    expect(evaluation?.counts.positive_usable).toBe(0);
    expect(evaluation?.positive_rate).toBe(0);
    expect(evaluation?.negative_rate).toBe(0);
    expect(evaluation?.status).toBe("failing");
    expect(evaluation?.reasons.join(" ")).toContain("no usable answers");
  });

  it("null/whitespace answers count as empty and never as a mention", async () => {
    const caller: DriftLLMCaller = async ({ control }) =>
      control.kind === "positive" ? "   \n  " : null;
    const outcome = await runDriftBattery(["openai"], caller);

    expect(outcome.results.every((r) => r.usableRuns === 0)).toBe(true);
    expect(outcome.results.every((r) => r.mentions === 0)).toBe(true);
    expect(evaluateDrift(outcome)[0]?.status).toBe("failing");
  });

  it("a throwing caller is recorded as an errored run and never aborts the battery", async () => {
    const caller: DriftLLMCaller = async ({ engine, control }) => {
      if (engine === "perplexity") throw new Error("provider 503");
      return control.kind === "positive" ? citingAnswer(control) : refusalAnswer(control);
    };

    const outcome = await runDriftBattery(ENGINES, caller);
    const evals = evaluateDrift(outcome);
    const dead = evals.find((e) => e.engine === "perplexity");

    expect(dead?.counts.error_runs).toBe(DRIFT_CONTROLS.length);
    expect(dead?.status).toBe("failing");
    // The other four still produced a verdict.
    expect(evals.filter((e) => e.status === "healthy")).toHaveLength(4);
  });

  it("partial usable runs still produce a rate over the usable ones only", async () => {
    // 4 positive controls: 2 usable (both citing), 2 empty → rate 1.00 of what
    // we could actually measure, and the empty runs are reported separately.
    const positives = syntheticControls("positive", 4);
    let call = 0;
    const caller: DriftLLMCaller = async ({ control }) => (call++ < 2 ? citingAnswer(control) : "");
    const outcome = await runDriftBattery(["anthropic"], caller, { controls: positives });
    const [evaluation] = evaluateDrift(outcome);

    expect(evaluation?.counts.positive_usable).toBe(2);
    expect(evaluation?.counts.empty_runs).toBe(2);
    expect(evaluation?.positive_rate).toBe(1);
    expect(evaluation?.status).toBe("healthy");
  });
});

// ---------------------------------------------------------------------------
// 6) Detection honesty — a refusal is not a citation
// ---------------------------------------------------------------------------

describe("mention detection", () => {
  it("does not count a fictional entity the engine explicitly disclaims", () => {
    const negative = DRIFT_CONTROLS.find((c) => c.kind === "negative");
    expect(negative).toBeDefined();
    expect(detectMention(refusalAnswer(negative!), negative!)).toBe(false);
    expect(
      detectMention(`${negative!.entity} is a logistics provider based in Lisbon.`, negative!)
    ).toBe(true);
  });

  it("matches the distinctive token of a multi-word invented name", () => {
    const control: DriftControl = {
      id: "neg_test",
      kind: "negative",
      prompt: "p",
      entity: "Zylthorix Analytics",
      detectTerms: ["Zylthorix"],
      expected: 0,
      rationale: "fixture",
    };
    expect(detectMention("Zylthorix offers dashboards for retailers.", control)).toBe(true);
    expect(detectMention("There is no such company that I can verify.", control)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7) Repeats + cost
// ---------------------------------------------------------------------------

describe("repeats and cost", () => {
  it("runs each control the requested number of times (clamped 1-5)", async () => {
    let calls = 0;
    const caller: DriftLLMCaller = async ({ control }) => {
      calls++;
      return control.kind === "positive" ? citingAnswer(control) : refusalAnswer(control);
    };
    const outcome = await runDriftBattery(["anthropic"], caller, { runs: 3 });

    expect(calls).toBe(DRIFT_CONTROLS.length * 3);
    expect(outcome.generations).toBe(DRIFT_CONTROLS.length * 3);
    expect(outcome.results.every((r) => r.runs === 3)).toBe(true);

    const clamped = await runDriftBattery(["anthropic"], caller, { runs: 99 });
    expect(clamped.results.every((r) => r.runs === 5)).toBe(true);
  });

  it("estimates the battery cost in whole cents from the generation count", () => {
    delete process.env["DRIFT_COST_PER_GEN_CENTS"];
    // 5 engines x 7 controls x 1 run = 35 generations at ~1.2c = 42c/day.
    expect(estimateDriftCostCents(35)).toBe(42);
    expect(estimateDriftCostCents(0)).toBe(0);

    process.env["DRIFT_COST_PER_GEN_CENTS"] = "2";
    expect(estimateDriftCostCents(10)).toBe(20);

    process.env["DRIFT_COST_PER_GEN_CENTS"] = "not-a-number";
    expect(estimateDriftCostCents(10)).toBe(12);
  });
});
