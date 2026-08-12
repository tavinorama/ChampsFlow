/**
 * Agent ops analysis (#151) — one builder, two doors, zero chance of two truths.
 *
 * The #163 disease was the same fact told differently on two screens. The
 * CEO→VP→job analysis is born immune: the founder's /admin tab and the
 * operator route Hermes reads MUST both call the single query builder in
 * lib/agent-ops.ts. These pins fail the build if either surface grows its
 * own version of the numbers.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clampDays } from "../../apps/api/src/lib/agent-ops";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");

describe("one builder, two doors", () => {
  it("both the admin and the operator routes call agentOpsSummary", () => {
    for (const rel of ["../../apps/api/src/routes/admin.ts", "../../apps/api/src/routes/operator-agents.ts"]) {
      const src = read(rel);
      expect(src, rel).toContain("agentOpsSummary(db, days)");
      expect(src, rel).toContain('from "../lib/agent-ops"');
    }
  });

  it("neither surface hand-rolls its own ops.agent_run aggregation", () => {
    // The aggregation lives in the lib; a GROUP BY vp_owner appearing in a
    // route file means someone started a second truth.
    for (const rel of ["../../apps/api/src/routes/admin.ts", "../../apps/api/src/routes/operator-agents.ts"]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/GROUP BY vp_owner/);
    }
  });
});

describe("the lib stays PII-free — ops.* is slugs, statuses and numbers", () => {
  it("selects nothing that could carry a person", () => {
    const lib = read("../../apps/api/src/lib/agent-ops.ts");
    for (const forbidden of ["email", "first_name", "last_name", "tenant_id", "JOIN "]) {
      expect(lib, `lib must not touch '${forbidden}'`).not.toContain(forbidden);
    }
  });
});

describe("clampDays — bad input degrades to the default, never to a scan", () => {
  it("defaults to 7 on garbage", () => {
    expect(clampDays(undefined)).toBe(7);
    expect(clampDays("abc")).toBe(7);
    expect(clampDays(NaN)).toBe(7);
  });

  it("clamps to [1, 90]", () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(-5)).toBe(1);
    expect(clampDays(365)).toBe(90);
    expect(clampDays("30")).toBe(30);
  });
});
