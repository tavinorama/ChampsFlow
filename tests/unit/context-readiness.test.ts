/**
 * context-readiness.test.ts — B13 (Codex D05, 23/09).
 * On 23/09 the production worker had none of the three variables; no graph
 * had ever received [__signals__] or [__gaps__], and only a null said so.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeContextReadiness, describeContextReadiness, parseContextReadiness } from "../../packages/shared/src/context-readiness";

describe("computeContextReadiness", () => {
  it("the production case: nothing set → both NOT wired, degraded, every missing variable named", () => {
    const r = computeContextReadiness({}, new Date("2026-09-24T08:00:00Z"));
    expect(r.degraded).toBe(true);
    expect(r.signalEngine).toEqual({ state: "not_wired", missing: ["SIGNAL_ENGINE_URL", "SIGNAL_ENGINE_API_KEY"] });
    expect(r.ownBrand).toEqual({ state: "not_wired", missing: ["OZVOR_OWN_BRAND_ID"], idPrefix: null });
    expect(describeContextReadiness(r)).toBe(
      "Signal Engine: NOT wired (missing SIGNAL_ENGINE_URL, SIGNAL_ENGINE_API_KEY) · own gaps: NOT wired (missing OZVOR_OWN_BRAND_ID) — content cells run from memory only"
    );
  });
  it("all set → wired, and the brand id is shown as a prefix only", () => {
    const r = computeContextReadiness({ SIGNAL_ENGINE_URL: "https://se", SIGNAL_ENGINE_API_KEY: "k", OZVOR_OWN_BRAND_ID: "e74fcbc1-a988-4b5d-b054-87329dc881c0" });
    expect(r.degraded).toBe(false);
    expect(r.ownBrand.idPrefix).toBe("e74fcbc1");
    expect(describeContextReadiness(r)).toBe("Signal Engine: wired · own gaps: wired (brand e74fcbc1)");
  });
  it("half set is still degraded, and blank strings count as missing", () => {
    const r = computeContextReadiness({ SIGNAL_ENGINE_URL: "https://se", SIGNAL_ENGINE_API_KEY: " ", OZVOR_OWN_BRAND_ID: "abc" });
    expect(r.signalEngine).toEqual({ state: "not_wired", missing: ["SIGNAL_ENGINE_API_KEY"] });
    expect(r.ownBrand.state).toBe("wired");
    expect(r.degraded).toBe(true);
  });
  it("parseContextReadiness round-trips and rejects garbage", () => {
    const r = computeContextReadiness({});
    expect(parseContextReadiness(JSON.stringify(r))).toEqual(r);
    expect(parseContextReadiness("{}")).toBeNull();
    expect(parseContextReadiness("not json")).toBeNull();
    expect(parseContextReadiness(null)).toBeNull();
  });
});

describe("it is wired at worker boot and read by the operator health endpoint", () => {
  const root = join(__dirname, "../..");
  it("the worker logs it once per boot (warn when degraded) and stores it in Redis", () => {
    const src = readFileSync(join(root, "apps/worker/src/index.ts"), "utf8");
    expect(src).toContain("computeContextReadiness(process.env)");
    expect(src).toContain('logger.warn("graph_context_readiness", { degraded: true');
    expect(src).toContain("CONTEXT_READINESS_KEY, JSON.stringify(readiness)");
  });
  it("the health endpoint reports wired / degraded / unknown — and unknown is never wired", () => {
    const src = readFileSync(join(root, "apps/api/src/routes/api-keys.ts"), "utf8");
    expect(src).toContain("parseContextReadiness(await redis.get<string>(CONTEXT_READINESS_KEY))");
    expect(src).toContain('state: "unknown", summary: "no readiness record from the worker"');
    expect(src).toContain('context = { state: r.degraded ? "degraded" : "wired"');
  });
});
