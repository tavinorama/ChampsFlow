/**
 * Unit tests for the /ai-audit pure copy + logic helpers.
 * No snapshot tests. Only pure functions tested here (node env, no DOM) —
 * the repo's colocated "pure logic helpers" convention.
 */

import { describe, it, expect } from "vitest";
import {
  AI_AUDIT_PRICE_USD,
  COPY,
  allCopyStrings,
  buildCheckoutPayload,
  canSubmit,
  groupPains,
  isValidEmail,
  painLabel,
  pickedForLine,
  teaserLine,
  withheldLine,
} from "./ai-audit-copy";

describe("copy rules (founder, hard)", () => {
  it("no user-facing string contains an em-dash", () => {
    for (const s of allCopyStrings()) {
      expect(s, `em-dash found in: "${s}"`).not.toContain("—");
    }
  });

  it("every string is non-empty", () => {
    for (const s of allCopyStrings()) {
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it("sells the $49 paid product, never 'free' (the free product is /test)", () => {
    expect(AI_AUDIT_PRICE_USD).toBe(49);
    expect(COPY.hero.kicker).toContain("$49");
    expect(COPY.steps.submit).toContain("$49");
    expect(COPY.metaTitle).toContain("$49");
    for (const s of [COPY.metaTitle, COPY.hero.kicker, COPY.hero.priceLine, COPY.steps.submit]) {
      expect(s.toLowerCase()).not.toContain("free");
    }
  });

  it("the CTA is first-person", () => {
    expect(COPY.steps.submit).toMatch(/^Get my /);
    expect(COPY.result.fullAuditCta).toMatch(/^Get my /);
    expect(COPY.result.geoCta).toMatch(/^Run my /);
  });
});

describe("painLabel", () => {
  it("maps a known slug to its friendly label", () => {
    expect(painLabel("email-overload")).toBe("My inbox runs my day");
  });

  it("humanizes an unknown slug instead of showing it raw", () => {
    expect(painLabel("some-new-pain")).toBe("Some new pain");
  });

  it("never contains an em-dash, known or unknown", () => {
    expect(painLabel("content-volume")).not.toContain("—");
    expect(painLabel("weird-slug-xyz")).not.toContain("—");
  });
});

describe("groupPains", () => {
  it("groups known slugs into stable ordered buckets", () => {
    const groups = groupPains(["billing-admin", "seo-visibility", "email-overload"]);
    expect(groups.map((g) => g.group)).toEqual(["Getting found", "Daily work", "Back office"]);
  });

  it("sends unknown slugs to Other pains, last", () => {
    const groups = groupPains(["seo-visibility", "brand-new-pain"]);
    expect(groups[groups.length - 1]?.group).toBe("Other pains");
    expect(groups[groups.length - 1]?.pains).toEqual(["brand-new-pain"]);
  });

  it("returns no empty groups", () => {
    for (const g of groupPains(["reviews"])) {
      expect(g.pains.length).toBeGreaterThan(0);
    }
  });
});

describe("buildCheckoutPayload", () => {
  it("trims strings, carries the email, and splits toolsInUse on commas and newlines", () => {
    const p = buildCheckoutPayload({
      email: "  buyer@example.com ",
      marketingConsent: false,
      businessType: "  dental clinic  ",
      primaryFocus: " marketing ",
      pains: ["no-shows"],
      engines: ["convert"],
      toolsInUseRaw: "ChatGPT, Canva\n , ,Notion",
    });
    expect(p.email).toBe("buyer@example.com");
    expect(p.businessType).toBe("dental clinic");
    expect(p.primaryFocus).toBe("marketing");
    expect(p.toolsInUse).toEqual(["ChatGPT", "Canva", "Notion"]);
    expect(p.testId).toBeUndefined();
  });

  it("never infers marketing consent (explicit true only)", () => {
    const base = { email: "a@b.co", businessType: "x", primaryFocus: "", pains: ["reviews"], engines: [], toolsInUseRaw: "" };
    expect(buildCheckoutPayload({ ...base, marketingConsent: false }).marketing_consent).toBe(false);
    expect(buildCheckoutPayload({ ...base, marketingConsent: true }).marketing_consent).toBe(true);
  });

  it("carries a testId only when one is present", () => {
    const base = { email: "a@b.co", marketingConsent: false, businessType: "x", primaryFocus: "", pains: ["reviews"], engines: [], toolsInUseRaw: "" };
    expect(buildCheckoutPayload({ ...base, testId: " abc " }).testId).toBe("abc");
    expect(buildCheckoutPayload({ ...base, testId: "  " }).testId).toBeUndefined();
  });

  it("caps toolsInUse at 20 entries (the API's MAX)", () => {
    const raw = Array.from({ length: 30 }, (_, i) => `tool${i}`).join(",");
    const p = buildCheckoutPayload({
      email: "a@b.co",
      marketingConsent: false,
      businessType: "x",
      primaryFocus: "",
      pains: ["reviews"],
      engines: [],
      toolsInUseRaw: raw,
    });
    expect(p.toolsInUse).toHaveLength(20);
  });
});

describe("canSubmit (email is mandatory)", () => {
  it("requires a valid email, a business type and at least one pain", () => {
    expect(canSubmit({ email: "a@b.co", businessType: "clinic", pains: ["no-shows"] })).toBe(true);
    expect(canSubmit({ email: "", businessType: "clinic", pains: ["no-shows"] })).toBe(false);
    expect(canSubmit({ email: "not-an-email", businessType: "clinic", pains: ["no-shows"] })).toBe(false);
    expect(canSubmit({ email: "a@b.co", businessType: "  ", pains: ["no-shows"] })).toBe(false);
    expect(canSubmit({ email: "a@b.co", businessType: "clinic", pains: [] })).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts a real-looking address and rejects the obvious junk", () => {
    expect(isValidEmail("buyer@example.com")).toBe(true);
    expect(isValidEmail("  buyer@example.com ")).toBe(true);
    expect(isValidEmail("buyer@")).toBe(false);
    expect(isValidEmail("buyer example.com")).toBe(false);
  });
});

describe("teaserLine", () => {
  it("states the count and the $49 promise", () => {
    expect(teaserLine(7)).toContain("7");
    expect(teaserLine(7)).toContain("$49");
    expect(teaserLine(1)).toContain("1 tool");
  });
  it("is honest when nothing matched", () => {
    expect(teaserLine(0).toLowerCase()).toContain("no niche tool");
  });
});

describe("withheldLine", () => {
  it("states the honest counts when more tools matched", () => {
    const line = withheldLine(12, 11);
    expect(line).toContain("12");
    expect(line).toContain("11");
    expect(line).toContain("shows 1");
  });

  it("does not invent withheld tools when only one matched", () => {
    const line = withheldLine(1, 0);
    expect(line).not.toContain("0");
    expect(line.toLowerCase()).toContain("one best niche match");
  });

  it("never calls the paid result 'free'", () => {
    expect(withheldLine(12, 11).toLowerCase()).not.toContain("free");
    expect(withheldLine(1, 0).toLowerCase()).not.toContain("free");
  });
});

describe("pickedForLine", () => {
  it("anchors the pick in the client's business type", () => {
    expect(pickedForLine("dental clinic")).toBe("Picked for your dental clinic work.");
  });

  it("degrades honestly when the business type is empty", () => {
    expect(pickedForLine("  ")).toBe("Picked for your kind of work.");
  });
});
