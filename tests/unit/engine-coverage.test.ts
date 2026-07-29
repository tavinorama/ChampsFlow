/**
 * Engine coverage — the rule that decides whether an audit's score may be
 * compared to the ones before it.
 *
 * The first case below is a real regression, caught in review of #400 and not
 * by any test: coverage was computed from the routing list AFTER drift pause
 * had shrunk it, so an audit that probed one engine recorded "1 of 1, nothing
 * missing, comparable" and published a one-engine score onto the same trend
 * line as five-engine history. The founder's own 2026-07-29 run is what this
 * looks like from the outside: 48 → 10 with the brand unchanged.
 *
 * These tests exist so the panel can never silently become the yardstick again.
 */
import { describe, it, expect } from "vitest";
import { computeEngineCoverage } from "../../apps/worker/src/jobs/audit-run";

const FULL = ["anthropic", "openai", "gemini", "perplexity", "serp"] as const;

describe("computeEngineCoverage", () => {
  it("does not let a drift pause shrink the yardstick", () => {
    // Four engines held back for drift; the survivor answers.
    const cov = computeEngineCoverage(
      FULL,
      new Set(["serp"]),
      ["anthropic", "openai", "gemini", "perplexity"]
    );

    // The panel is still five. This is the whole point: had the caller passed
    // its post-pause routing list, every number here would read 1 of 1.
    expect(cov.requested).toBe(5);
    expect(cov.answered).toBe(1);
    expect(cov.comparable).toBe(false);
    expect(cov.ratio).toBe(0.2);
    // …and 0.2 is below the publish floor, so the run is refused rather than
    // scored.
    expect(cov.ratio).toBeLessThan(0.5);
  });

  it("keeps 'we held it back' apart from 'it did not answer'", () => {
    const cov = computeEngineCoverage(
      FULL,
      new Set(["anthropic", "openai", "gemini"]),
      ["perplexity"]
    );

    // serp went quiet on its own; perplexity was our decision. Folding them
    // together would hide our own call behind the engine's failure.
    expect(cov.missing).toEqual(["serp"]);
    expect(cov.paused).toEqual(["perplexity"]);
    expect(cov.answered).toBe(3);
    expect(cov.comparable).toBe(false);
    // Above the floor, so it runs — labelled non-comparable.
    expect(cov.ratio).toBeGreaterThanOrEqual(0.5);
  });

  it("is comparable only when the whole panel answered", () => {
    const cov = computeEngineCoverage(FULL, new Set(FULL), []);
    expect(cov.comparable).toBe(true);
    expect(cov.missing).toEqual([]);
    expect(cov.paused).toEqual([]);
    expect(cov.ratio).toBe(1);
  });

  it("counts a smaller panel the brand actually chose as complete", () => {
    // A brand tracking two engines gets a two-engine yardstick. Its own choice
    // is the panel; it is not a degraded five.
    const cov = computeEngineCoverage(["openai", "serp"], new Set(["openai", "serp"]), []);
    expect(cov.requested).toBe(2);
    expect(cov.comparable).toBe(true);
    expect(cov.ratio).toBe(1);
  });

  it("ignores answers from engines outside the panel", () => {
    // A stray response must never inflate the count past the panel size, or a
    // partial run could be reported as complete.
    const cov = computeEngineCoverage(["openai", "serp"], new Set(["openai", "gemini"]), []);
    expect(cov.requested).toBe(2);
    expect(cov.answered).toBe(1);
    expect(cov.missing).toEqual(["serp"]);
    expect(cov.comparable).toBe(false);
  });

  it("reports nothing rather than dividing by zero on an empty panel", () => {
    const cov = computeEngineCoverage([], new Set(), []);
    expect(cov.ratio).toBe(0);
    expect(cov.requested).toBe(0);
    // Below the floor, so an empty panel is refused instead of scored.
    expect(cov.ratio).toBeLessThan(0.5);
  });
});
