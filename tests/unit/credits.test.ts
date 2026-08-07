/**
 * Credit ledger — the derivations (#144).
 *
 * The point of these tests is not that 6,000 equals 6,000. It is that no
 * balance in this system is ever WRITTEN DOWN. On 2026-08-05 the plans said
 * prompts_per_audit: 250 while the generator produced 10, and the two numbers
 * drifted apart for weeks because nothing forced them to agree. Credits are the
 * same shape of risk with money attached, so every figure is derived from
 * PLAN_LIMITS and these tests pin the RELATIONSHIPS rather than the outputs.
 *
 * A test that asserts `monthlyCreditsFor("growth") === 6000` passes happily
 * while the plan underneath changes. A test that asserts it equals
 * depth × ceiling × unit cannot.
 */

import { describe, it, expect } from "vitest";
import {
  CREDITS_PER_PROMPT_AUDIT,
  USD_PER_PROMPT_AUDIT,
  usdPerCredit,
  overagePackUsd,
  creditsForAudit,
  monthlyCreditsFor,
  currentPeriod,
  OVERAGE_MARGIN_FLOOR,
  FREE_SIGNUP_RESIDUAL_CREDITS,
} from "../../apps/api/src/lib/credits";
import { PLAN_LIMITS, type PlanTier } from "../../apps/api/src/integrations/stripe";

const TIERS: PlanTier[] = ["free", "growth", "agency"];

describe("credits — importable by the worker", () => {
  it("never imports from a route file — that edge held the worker on a stale build for 2 days", () => {
    // #423 typed a parameter via `import type { PostgresClient } from
    // "../routes/social-accounts"`. The worker imports credits.ts, the route
    // file imports hono, the worker container installs no hono — and every
    // worker deploy from 2026-08-05 21:10 onward FAILED while web/api shipped.
    // The debit code this file prices never ran; credit_ledger sat at 0 rows.
    // Types the worker needs live in packages/shared, and this pin is the
    // tripwire for the next convenient-looking route import.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const lib = readFileSync(
      join(__dirname, "../../apps/api/src/lib/credits.ts"),
      "utf8"
    );
    expect(lib).not.toMatch(/from "\.\.\/routes\//);
    expect(lib).not.toMatch(/from "\.\.\/auth\//);
  });
});

describe("credits — derived from PLAN_LIMITS, never restated", () => {
  it("an audit costs depth × the unit price, on every tier", () => {
    for (const t of TIERS) {
      expect(creditsForAudit(t)).toBe(
        PLAN_LIMITS[t].prompts_per_audit * CREDITS_PER_PROMPT_AUDIT
      );
    }
  });

  it("the monthly grant is exactly what the plan permits: depth × ceiling", () => {
    for (const t of TIERS) {
      expect(monthlyCreditsFor(t)).toBe(
        PLAN_LIMITS[t].prompts_per_audit *
          PLAN_LIMITS[t].monthly_audits_total *
          CREDITS_PER_PROMPT_AUDIT
      );
    }
  });

  it("the grant buys exactly the audits the plan allows — no more, no less", () => {
    // The invariant that makes credits and limits one system instead of two.
    // If these ever disagree, a customer either hits a wall with credits in
    // hand, or runs out of credits while the limit says they may continue.
    for (const t of TIERS) {
      expect(monthlyCreditsFor(t) / creditsForAudit(t)).toBe(
        PLAN_LIMITS[t].monthly_audits_total
      );
    }
  });

  it("balances land in the thousands, which is the whole reason for the 50", () => {
    expect(monthlyCreditsFor("growth")).toBeGreaterThanOrEqual(1000);
    expect(monthlyCreditsFor("agency")).toBeGreaterThanOrEqual(1000);
  });

  it("a paid tier always grants more than free — or there is nothing to buy", () => {
    expect(monthlyCreditsFor("growth")).toBeGreaterThan(monthlyCreditsFor("free"));
    expect(monthlyCreditsFor("agency")).toBeGreaterThan(monthlyCreditsFor("growth"));
  });
});

describe("credits — the money side", () => {
  it("one credit is the prompt-audit cost split by the unit", () => {
    expect(usdPerCredit()).toBeCloseTo(USD_PER_PROMPT_AUDIT / CREDITS_PER_PROMPT_AUDIT, 10);
  });

  it("an overage pack clears the same 80% floor the plans are held to", () => {
    const price = overagePackUsd(1000);
    const cost = usdPerCredit() * 1000;
    expect((price - cost) / price).toBeGreaterThanOrEqual(OVERAGE_MARGIN_FLOOR);
  });

  it("overage is never cheaper per credit than the plan it tops up", () => {
    // Selling top-ups below the subscription rate would make the cheapest way
    // to buy Ozvor a free account plus packs.
    const perCreditOverage = overagePackUsd(1000) / 1000;
    const perCreditGrowth = 99 / monthlyCreditsFor("growth");
    expect(perCreditOverage).toBeGreaterThan(perCreditGrowth);
  });

  it("scales linearly with pack size", () => {
    expect(overagePackUsd(2000)).toBeGreaterThan(overagePackUsd(1000));
  });
});

describe("signup residual — visible, and visibly not enough", () => {
  it("exists: the free wallet is never handed over at zero", () => {
    expect(FREE_SIGNUP_RESIDUAL_CREDITS).toBeGreaterThan(0);
  });

  it("never funds a free audit on its own — the gap IS the upsell", () => {
    // If the residual ever reaches one audit's cost, "not enough to run one"
    // silently becomes "a third free audit a month" and the ladder breaks.
    expect(FREE_SIGNUP_RESIDUAL_CREDITS).toBeLessThan(creditsForAudit("free"));
  });

  it("stays under half an audit, so the shortfall reads as a price, not a rounding error", () => {
    expect(FREE_SIGNUP_RESIDUAL_CREDITS).toBeLessThanOrEqual(creditsForAudit("free") / 2);
  });
});

describe("currentPeriod — the grant bucket", () => {
  it("buckets to the first of the UTC month", () => {
    expect(currentPeriod(new Date("2026-08-05T23:59:59Z"))).toBe("2026-08-01");
  });

  it("zero-pads single-digit months", () => {
    expect(currentPeriod(new Date("2026-01-15T00:00:00Z"))).toBe("2026-01-01");
  });

  it("uses UTC, not local time, so a grant never lands in two months", () => {
    // 2026-08-31T23:30Z is already September in UTC+2. The bucket must not move
    // with the server's timezone, or a tenant gets two grants at a boundary.
    expect(currentPeriod(new Date("2026-08-31T23:30:00Z"))).toBe("2026-08-01");
  });
});
