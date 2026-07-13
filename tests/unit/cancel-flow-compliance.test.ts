/**
 * Source guard — the cancellation flow must stay COMPLIANT (FTC click-to-cancel,
 * EU dark-pattern ban, BR CDC). The retention flow (survey + save-offer) is
 * allowed, but it must never obstruct the actual cancel.
 *
 * This walks the real component source and fails CI if a future edit introduces
 * an artificial delay/lag before the cancel action, or removes the always-present
 * "Keep my plan" / "Cancel anyway" escape at each step.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "../../apps/web/src/components/CancelRetentionFlow.tsx");

describe("cancellation flow stays compliant (no dark patterns)", () => {
  const src = readFileSync(SRC, "utf8");

  it("has NO artificial delay/lag gating the cancel (no setTimeout/setInterval/sleep)", () => {
    // A retention flow may present a survey and an offer, but it must not
    // *delay* the cancel. Any timer in this file would be a red flag.
    expect(src).not.toMatch(/setTimeout|setInterval|await\s+new\s+Promise|sleep\(/);
  });

  it("cancel is reachable: the confirm calls POST /api/billing/cancel directly", () => {
    expect(src).toMatch(/\/api\/billing\/cancel/);
    expect(src).toMatch(/method:\s*["']POST["']/);
  });

  it("every decision step offers an immediate 'Keep my plan' escape AND a forward cancel", () => {
    // Symmetry: keep + proceed always co-present (no forced one-way funnel).
    expect(src).toMatch(/Keep my plan/);
    expect(src).toMatch(/Cancel anyway/);
    expect(src).toMatch(/Confirm cancellation/);
  });

  it("the reason survey is optional (feedback sent only if chosen)", () => {
    // reason defaults to "" and is passed as `feedback: reason || undefined`.
    expect(src).toMatch(/feedback:\s*reason\s*\|\|\s*undefined/);
  });
});
