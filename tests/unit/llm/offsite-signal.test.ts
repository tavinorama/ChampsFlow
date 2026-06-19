/**
 * offsite-signal.test.ts — off-site authority (mock path; no SERP key).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { measureOffsiteSignal, OFFSITE_SOURCES } from "../../../packages/llm/src/offsite-signal";

beforeEach(() => { delete process.env["SERP_API_KEY"]; });

describe("measureOffsiteSignal (mock)", () => {
  it("returns 7 weighted sources summing to weight 1.0", () => {
    const total = OFFSITE_SOURCES.reduce((a, s) => a + s.weight, 0);
    expect(OFFSITE_SOURCES.length).toBe(7);
    expect(Math.round(total * 100) / 100).toBe(1);
  });

  it("returns live=false + a 0–1 score + per-source presence without a key", async () => {
    const r = await measureOffsiteSignal("Demo CRM");
    expect(r.live).toBe(false);
    expect(r.offsiteScore).toBeGreaterThanOrEqual(0);
    expect(r.offsiteScore).toBeLessThanOrEqual(1);
    expect(r.sources.length).toBe(7);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it("is deterministic per brand", async () => {
    expect(await measureOffsiteSignal("Acme CRM")).toEqual(await measureOffsiteSignal("Acme CRM"));
  });
});
