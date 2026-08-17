/**
 * D1 (2026-08-17): the visible credit state — pct, low/empty levels, the CTA
 * gate and its reason. One helper, so every screen says the same thing.
 * Plus the credits-out email copy (English, no em-dash, honest numbers).
 */

import { describe, it, expect } from "vitest";
import { creditsPct, creditsState, CREDITS_LOW_PCT } from "../../packages/shared/src/credits";
import { buildCreditsOutEmail } from "../../packages/shared/src/emails/credits-out";

describe("creditsPct", () => {
  it("balance ÷ allowance as a clamped whole percent", () => {
    expect(creditsPct(500, 1000)).toBe(50);
    expect(creditsPct(1500, 1000)).toBe(100);
    expect(creditsPct(-5, 1000)).toBe(0);
    expect(creditsPct(10, 0)).toBe(0);
    expect(creditsPct(Number.NaN, 1000)).toBe(0);
    expect(creditsPct(199, 1000)).toBe(20);
  });
});

describe("creditsState", () => {
  it("ok above the low line, CTA enabled", () => {
    const s = creditsState({ balance: 800, allowance: 1000, costPerAudit: 100 });
    expect(s.level).toBe("ok");
    expect(s.pct).toBe(80);
    expect(s.canRunAudit).toBe(true);
    expect(s.blockedReason).toBe("");
  });
  it(`low under ${CREDITS_LOW_PCT}% of the allowance, CTA still enabled when one audit fits`, () => {
    const s = creditsState({ balance: 150, allowance: 1000, costPerAudit: 100 });
    expect(s.level).toBe("low");
    expect(s.canRunAudit).toBe(true);
  });
  it("low but too little for one audit → CTA disabled with the honest reason", () => {
    const s = creditsState({ balance: 50, allowance: 1000, costPerAudit: 100 });
    expect(s.level).toBe("low");
    expect(s.canRunAudit).toBe(false);
    expect(s.blockedReason).toContain("100 credits");
    expect(s.blockedReason).toContain("You have 50");
  });
  it("empty at 0 (wins over low), CTA disabled", () => {
    const s = creditsState({ balance: 0, allowance: 50, costPerAudit: 10 });
    expect(s.level).toBe("empty");
    expect(s.canRunAudit).toBe(false);
    expect(s.blockedReason).toContain("0 credits");
  });
  it("no em-dash in any reason", () => {
    for (const balance of [0, 5, 500]) {
      expect(creditsState({ balance, allowance: 1000, costPerAudit: 100 }).blockedReason).not.toContain("—");
    }
  });
});

describe("credits-out email", () => {
  it("prints the real balance, the pack price and the refill date; no em-dash", () => {
    const m = buildCreditsOutEmail({ to: "a@b.co", brand: "Acme <Co>", balance: 0, packCredits: 1000, packUsd: 29, plan: "free" });
    expect(m.subject).toBe("You are out of audit credits");
    expect(m.text).toContain("Balance now: 0.");
    expect(m.text).toContain("Buy 1,000 credits for $29");
    expect(m.text).toContain("refills on the 1st");
    expect(m.text).not.toContain("—");
    expect(m.html).toContain("Acme &lt;Co&gt;");
    expect(m.topUpUrl).toContain("/dashboard-v3?tab=billing&topup=1");
  });
});
