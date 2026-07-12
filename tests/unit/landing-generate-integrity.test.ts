/**
 * Unit — Ozvor Pages generation integrity gate (task #122, QA audit 2026-07-12)
 *
 * A paid $99 Pages generation must NEVER silently deliver template ("mock")
 * content. buildLandingBundle has three silent fallbacks to mock (platform
 * ANTHROPIC_API_KEY absent, LLM call threw, unusable output); the worker's
 * assertBundleModeHonest() is the single post-build chokepoint that turns a
 * mock bundle into an HONEST JOB FAILURE in production — mirroring the audit
 * engine's mockAllowed() rule (PR #90): mock only in dev/test or via the
 * explicit GEO_ALLOW_MOCK=true opt-in used by seeded demos.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertBundleModeHonest } from "../../apps/worker/src/jobs/landing-generate";

const ENV_KEYS = ["NODE_ENV", "GEO_ALLOW_MOCK"] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("assertBundleModeHonest — no silent template delivery in production", () => {
  it("PRODUCTION + mock bundle → throws (honest job failure, nothing persisted)", () => {
    process.env.NODE_ENV = "production";
    delete process.env.GEO_ALLOW_MOCK;
    expect(() => assertBundleModeHonest("mock", "site-1")).toThrowError(
      /landing_generate_mock_forbidden_in_production/
    );
  });

  it("PRODUCTION + real llm bundle → passes", () => {
    process.env.NODE_ENV = "production";
    delete process.env.GEO_ALLOW_MOCK;
    expect(() => assertBundleModeHonest("llm", "site-1")).not.toThrow();
  });

  it("dev/test + mock bundle → allowed (local DX unchanged)", () => {
    process.env.NODE_ENV = "test";
    delete process.env.GEO_ALLOW_MOCK;
    expect(() => assertBundleModeHonest("mock", "site-1")).not.toThrow();
    process.env.NODE_ENV = "development";
    expect(() => assertBundleModeHonest("mock", "site-1")).not.toThrow();
  });

  it("explicit GEO_ALLOW_MOCK=true opt-in (seeded demos) → allowed even in production", () => {
    process.env.NODE_ENV = "production";
    process.env.GEO_ALLOW_MOCK = "true";
    expect(() => assertBundleModeHonest("mock", "site-1")).not.toThrow();
  });
});
