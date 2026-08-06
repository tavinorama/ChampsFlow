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

  // -------------------------------------------------------------------------
  // Degraded — an engine kept in the panel despite a failing control battery
  // (GEO_DRIFT_PAUSE_EXEMPT). The founder's call; the disclosure is not
  // optional, and these pin that it cannot be dropped by accident.
  // -------------------------------------------------------------------------

  it("a full panel with a degraded member is NOT comparable", () => {
    // The failure this prevents: an exempt engine answers, the count reads 5 of
    // 5, and the run looks pristine while resting on an engine we measured as
    // unreliable. A complete-looking number that is quietly softer is a worse
    // claim than an honest incomplete one.
    const cov = computeEngineCoverage(
      ["openai", "serp"],
      new Set(["openai", "serp"]),
      [],
      ["serp"]
    );
    expect(cov.answered).toBe(2);
    expect(cov.requested).toBe(2);
    expect(cov.degraded).toEqual(["serp"]);
    expect(cov.comparable).toBe(false);
  });

  it("an engine that was exempted but then went silent is missing, not degraded", () => {
    // Otherwise the same engine appears in two categories and the UI says both
    // "it did not answer" and "its answers still count".
    const cov = computeEngineCoverage(["openai", "serp"], new Set(["openai"]), [], ["serp"]);
    expect(cov.missing).toEqual(["serp"]);
    expect(cov.degraded).toEqual([]);
  });

  it("stays comparable when nothing is degraded — no badge on a healthy run", () => {
    const cov = computeEngineCoverage(["openai", "serp"], new Set(["openai", "serp"]), []);
    expect(cov.degraded).toEqual([]);
    expect(cov.comparable).toBe(true);
  });

  it("paused and degraded are different claims and never merge", () => {
    // Paused = we removed it. Degraded = we kept it and it is shaky. Folding
    // them together would let "we held it back" stand in for "we used it
    // anyway", which are opposite messages to a customer.
    const cov = computeEngineCoverage(
      ["openai", "gemini", "serp"],
      new Set(["openai", "serp"]),
      ["gemini"],
      ["serp"]
    );
    expect(cov.paused).toEqual(["gemini"]);
    expect(cov.degraded).toEqual(["serp"]);
    expect(cov.missing).toEqual([]);
    expect(cov.comparable).toBe(false);
  });
});

/**
 * #163's second half was never a computation bug — it was ONE truth on ONE
 * screen. dashboard-v3 explained "4 of 5 engines, and why" while /brands/[id]
 * read the same audit and said only "4 engines". These assertions pin the
 * wiring: the breakdown API must surface coverage, and BOTH pages must render
 * the same shared component, so the two screens cannot drift apart again.
 */
describe("coverage reaches both screens (#163)", () => {
  const read = (p: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").readFileSync(require("node:path").join(__dirname, "../..", p), "utf8") as string;

  it("the breakdown API surfaces provider_breakdown.coverage", () => {
    const src = read("apps/api/src/routes/audits.ts");
    expect(src).toMatch(/coverage:\s*\(bd as \{ coverage\?: unknown \}\)\.coverage \?\? null/);
  });

  it("the brand page renders the SAME CoverageNote the dashboard renders", () => {
    const brand = read("apps/web/src/app/brands/[id]/page.tsx");
    const dash = read("apps/web/src/app/dashboard-v3/page.tsx");
    for (const src of [brand, dash]) {
      expect(src).toMatch(/from "[./]+components\/CoverageNote"/);
      expect(src).toMatch(/<CoverageNote coverage=/);
    }
    // The old local copy must be gone — two implementations is how one screen
    // got ahead of the other in the first place.
    expect(dash).not.toMatch(/function PanelCoverage\(/);
  });

  it("the shared component stays silent unless it has something to say", () => {
    const src = read("apps/web/src/components/CoverageNote.tsx");
    expect(src).toMatch(/comparable !== false\) return null/);
  });
});
