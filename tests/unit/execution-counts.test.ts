/**
 * execution-counts.test.ts — B3 (Codex D14, 23/09).
 * The production case: 11 proposed + 5 legacy self-reports + 1 manual pending
 * = 17 owed. The note printed "6 marked done by you" and "17 still open":
 * 23 lines for 17 fixes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { partitionExecutionCounts } from "../../apps/web/src/lib/execution-counts";

describe("partitionExecutionCounts", () => {
  it("21/09 plan: 11 + 5 + 1 = 17, and every fix sits on exactly one line", () => {
    // OPEN_STATES includes the self-reported states, so open = 17 here.
    const p = partitionExecutionCounts({ total: 17, denominator: 17, verified: 0, inFlight: 0, selfReported: 6, open: 17, notOwed: 0 });
    expect(p).toEqual({ verified: 0, inFlight: 0, selfReported: 6, openNotStarted: 11, owed: 17 });
    expect(p.verified + p.inFlight + p.selfReported + p.openNotStarted).toBe(p.owed);
  });

  it("verified and in-flight fixes are not open, and expired/rejected are not owed", () => {
    const p = partitionExecutionCounts({ total: 20, denominator: 17, verified: 2, inFlight: 3, selfReported: 4, open: 12, notOwed: 3 });
    expect(p).toEqual({ verified: 2, inFlight: 3, selfReported: 4, openNotStarted: 8, owed: 17 });
  });

  it("never goes negative on a malformed payload", () => {
    const p = partitionExecutionCounts({ total: 3, denominator: 3, verified: 0, inFlight: 0, selfReported: 3, open: 1, notOwed: 0 });
    expect(p.openNotStarted).toBe(0);
  });

  it("the note uses the partition and no longer prints the raw overlapping count", () => {
    const note = readFileSync(join(__dirname, "../../apps/web/src/components/VerifiedExecutionNote.tsx"), "utf8");
    expect(note).toContain("partitionExecutionCounts(counts)");
    expect(note).toContain("still open, not started");
    expect(note).not.toContain("{counts.open} still open");
    expect(note).toContain("owed in total. Each one is on exactly one line above.");
  });
});
