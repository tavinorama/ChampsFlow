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

describe("credit_ledger — the worker may debit, and only debit", () => {
  it("grants app_user INSERT bounded to own-tenant negative deltas — never UPDATE/DELETE", () => {
    // 2026-08-10 06:03: first real post-#438 audit hit "permission denied for
    // table credit_ledger" — the ledger was deliberately read-only for
    // app_user ("cannot mint credits") while the #423 debit writes as
    // app_user. The reconciliation is a write permission opened exactly as
    // far as the debit needs: INSERT, own tenant, delta <= 0. This pin keeps
    // the boundary from widening quietly.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const migration = readFileSync(
      join(
        __dirname,
        "../../packages/db/migrations/20260810000001_credit_ledger_worker_debit.up.sql"
      ),
      "utf8"
    );
    expect(migration).toContain("GRANT INSERT ON credit_ledger TO app_user");
    expect(migration).toMatch(/FOR INSERT TO app_user/);
    expect(migration).toMatch(/delta <= 0/);
    expect(migration).toMatch(/tenant_id = current_setting\('app\.current_tenant_id', TRUE\)::uuid/);
    const sql = migration.replace(/--.*$/gm, "");
    for (const forbidden of ["GRANT UPDATE", "GRANT DELETE", "GRANT ALL"]) {
      expect(sql).not.toContain(forbidden);
    }
  });
});

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

describe("the pages advertise derived numbers, never literals", () => {
  it("no credit allowance is hardcoded in the plan surfaces", () => {
    // 2026-08-10: the founder asked when credits reach the pricing pages and
    // the honest answer was "the pages restate them by hand". PlanCard said
    // "6,000"/"36,000" — stale the day P6 changed the depths. These files must
    // compute from @organic-posts/shared or this pin fails the build.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    for (const rel of [
      "../../apps/web/src/components/PlanCard.tsx",
      "../../apps/web/src/app/(marketing)/pricing/PricingPlans.tsx",
      "../../apps/web/src/app/(marketing)/pricing/page.tsx",
    ]) {
      const src = readFileSync(join(__dirname, rel), "utf8");
      expect(src, rel).toMatch(/monthlyCreditsFor|creditsForAudit/);
      for (const literal of ["6,000 audit credits", "36,000 audit credits", "9,900", "57,000", "55,100"]) {
        expect(src, `${rel} hardcodes "${literal}"`).not.toContain(literal);
      }
    }
  });

  it("no brand count, per-brand price, annual price or SLA claim is hardcoded (10.A.2/3/6)", () => {
    // 2026-09-02 sweep: "up to 15 client brands / $36.60 per brand / 4h SLA"
    // lived on /agencies, /local-pages and the chatbot while production
    // enforced 10 brands and /support promised 1 business day. These surfaces
    // must derive every plan figure from @organic-posts/shared, and the
    // dead literals must never reappear.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    for (const rel of [
      "../../apps/web/src/app/(marketing)/agencies/page.tsx",
      "../../apps/web/src/app/(marketing)/local-pages/page.tsx",
      "../../apps/web/src/app/(marketing)/pricing/PricingPlans.tsx",
      "../../apps/web/src/app/(marketing)/pricing/page.tsx",
      "../../apps/web/src/app/(marketing)/pricing/FounderBand.tsx",
      "../../apps/web/src/app/(marketing)/faq/page.tsx",
      "../../apps/web/src/app/(marketing)/resources/llm-citation-tracker/page.tsx",
      "../../apps/web/src/app/(marketing)/resources/geo-visibility-guide/page.tsx",
      "../../apps/web/src/app/(marketing)/resources/what-is-geo-search/page.tsx",
    ]) {
      const src = readFileSync(join(__dirname, rel), "utf8");
      expect(src, rel).toMatch(/@organic-posts\/shared/);
      for (const literal of [
        "up to 15",
        "Up to 15",
        "15 brands",
        "$36.60",
        "$25.62",
        "$54.90",
        "$38.40",
        "250 prompt",
        "250-prompt",
        "4h SLA",
        "4-hour response",
        "$831",
        "$1,188",
        "$4,611",
        "$6,588",
        "$69/mo",
        "$384/mo",
        "client approval workflow",
        "Client approval workflow",
      ]) {
        expect(src, `${rel} hardcodes "${literal}"`).not.toContain(literal);
      }
    }
  });
});

describe("grants are PLATFORM writes — the proof of 2026-08-11", () => {
  it("billing wraps both positive-delta writes in runAsPlatform, and nothing else does", () => {
    // Reconciling the missed 2026-08-10 debit proved #439's policy works for
    // the worker AND exposed that the lazy monthly grant (+delta, written from
    // inside a tenant-scoped billing request) had been silently RLS-blocked
    // forever: zero grants ever landed. Grants are the platform's writes.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const billing = readFileSync(join(__dirname, "../../apps/api/src/routes/billing.ts"), "utf8");
    expect(billing).toContain("runAsPlatform(() => ensureMonthlyGrant");
    expect(billing).toContain("runAsPlatform(() => ensureFreeSignupResidual");
    // The escape hatch must not spread: these two grant writes are the only
    // allowed call sites in the API today. Widening this list is a review event.
    const uses = (billing.match(/runAsPlatform\(/g) ?? []).length;
    expect(uses).toBe(2);
    const others = ["audits.ts", "social-accounts.ts", "landing.ts", "dpa.ts", "nurture.ts"];
    for (const f of others) {
      const src = readFileSync(join(__dirname, `../../apps/api/src/routes/${f}`), "utf8");
      expect(src, `${f} must not use runAsPlatform`).not.toContain("runAsPlatform");
    }
  });
});

describe("effective tier — the 53,750/1,000 pill of 2026-08-27", () => {
  it("/api/billing/credits falls back to tenants.plan_tier when Stripe has no subscription", () => {
    // The founder's Agency is manually granted (tenants.plan_tier, no Stripe
    // row). Resolving the tier from billing_subscriptions alone showed the
    // header pill as balance/1,000 (free allowance) AND would have made the
    // next ensureMonthlyGrant grant free-level credits. The credits handler
    // must apply the same effective-tier rule as GET /api/billing: Stripe
    // subscription when present, else the tenant's denormalized plan_tier.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const billing = readFileSync(join(__dirname, "../../apps/api/src/routes/billing.ts"), "utf8");
    const start = billing.indexOf('"/api/billing/credits"');
    expect(start).toBeGreaterThan(-1);
    const handler = billing.slice(start, billing.indexOf("app.", start + 1000));
    expect(handler).toContain("subTier");
    expect(handler).toContain("SELECT plan_tier FROM tenants");
    // The grant must be fed the RESOLVED tier, not the sub-only one.
    expect(handler).toContain("ensureMonthlyGrant(db, auth.tenantId, tier)");
  });
});

describe("monthly reset — plan credits do not roll over (founder bug 2026-09-01: 107.900)", () => {
  it("expiringAmount: last month's remainder expires, purchased packs never do", async () => {
    const { expiringAmount } = await import("../../apps/api/src/lib/credits");
    expect(expiringAmount(52800, 0)).toBe(52800);      // the founder's August remainder
    expect(expiringAmount(52800, 1000)).toBe(51800);   // a 1000-credit pack survives
    expect(expiringAmount(500, 1000)).toBe(0);          // balance below purchases: nothing expires
    expect(expiringAmount(0, 0)).toBe(0);
    expect(expiringAmount(-50, 0)).toBe(0);             // never a positive adjustment
  });
  it("ensureMonthlyGrant expires BEFORE granting, only on the first call of the period, idempotently", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const src = readFileSync(join(__dirname, "../../apps/api/src/lib/credits.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function ensureMonthlyGrant"));
    const grantCheck = fn.indexOf("reason = 'monthly_grant'\n      LIMIT 1");
    const expiry = fn.indexOf("'period_expiry'");
    const grant = fn.indexOf("'monthly_grant', $3::date");
    expect(grantCheck).toBeGreaterThan(-1);
    expect(expiry).toBeGreaterThan(grantCheck);
    expect(grant).toBeGreaterThan(expiry);
    expect(fn).toContain("ON CONFLICT (tenant_id, ref_type, ref_id) WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL DO NOTHING");
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
