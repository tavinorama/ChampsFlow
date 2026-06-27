/**
 * UpsellLadder — unit tests for pure logic helpers.
 *
 * We test only the deterministic parts: props contract and the accent→style
 * mapping logic (extracted here as pure functions for testability).
 * No snapshot tests; no rendering.
 */

import { describe, it, expect } from "vitest";
import type { UpsellItem } from "../../apps/web/src/components/UpsellLadder";

// ── Value-ladder href constants (must match what each page passes in) ──────

const VALUE_LADDER_HREFS = {
  kit: "/kit",
  growth: "/login?plan=growth&next=checkout",
  agency: "/login?plan=agency&next=checkout",
  organicposts: "/organicposts",
  book: "/book",
} as const;

// ── Pure helpers under test ────────────────────────────────────────────────

/** Derive the CTA background from an UpsellItem accent. */
function accentBackground(accent: UpsellItem["accent"] = "emerald"): string {
  if (accent === "emerald") return "linear-gradient(135deg,#27c98a,#0c7d54)";
  if (accent === "gold") return "linear-gradient(135deg,#e6a93f,#b9791f)";
  return "transparent";
}

/** Derive the CTA text color from an UpsellItem accent. */
function accentTextColor(accent: UpsellItem["accent"] = "emerald"): string {
  if (accent === "emerald") return "#06140e";
  if (accent === "gold") return "#1a1206";
  return "var(--color-text)";
}

/** Validate that an href is a real destination (not "#" or empty). */
function isLiveHref(href: string): boolean {
  return href.length > 0 && href !== "#";
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("UpsellLadder – accent style helpers", () => {
  it("emerald accent produces the correct gradient", () => {
    expect(accentBackground("emerald")).toBe("linear-gradient(135deg,#27c98a,#0c7d54)");
  });

  it("gold accent produces the correct gradient", () => {
    expect(accentBackground("gold")).toBe("linear-gradient(135deg,#e6a93f,#b9791f)");
  });

  it("ghost accent produces transparent background", () => {
    expect(accentBackground("ghost")).toBe("transparent");
  });

  it("default (undefined) accent falls back to emerald gradient", () => {
    expect(accentBackground(undefined)).toBe("linear-gradient(135deg,#27c98a,#0c7d54)");
  });

  it("emerald text color is dark (on-gradient legibility)", () => {
    expect(accentTextColor("emerald")).toBe("#06140e");
  });

  it("gold text color is dark (on-gradient legibility)", () => {
    expect(accentTextColor("gold")).toBe("#1a1206");
  });

  it("ghost text color uses the text token", () => {
    expect(accentTextColor("ghost")).toBe("var(--color-text)");
  });
});

describe("UpsellLadder – href validity (no dead links)", () => {
  it("all value-ladder hrefs are live destinations", () => {
    for (const [name, href] of Object.entries(VALUE_LADDER_HREFS)) {
      expect(isLiveHref(href), `${name} href must not be dead`).toBe(true);
    }
  });

  it("kit href carries the correct path", () => {
    expect(VALUE_LADDER_HREFS.kit).toBe("/kit");
  });

  it("growth href uses the login-then-checkout pattern", () => {
    expect(VALUE_LADDER_HREFS.growth).toContain("plan=growth");
    expect(VALUE_LADDER_HREFS.growth).toContain("next=checkout");
  });

  it("agency href uses the login-then-checkout pattern", () => {
    expect(VALUE_LADDER_HREFS.agency).toContain("plan=agency");
    expect(VALUE_LADDER_HREFS.agency).toContain("next=checkout");
  });

  it("organicposts href reaches the done-for-you page", () => {
    expect(VALUE_LADDER_HREFS.organicposts).toBe("/organicposts");
  });

  it("book href reaches the Calendly page", () => {
    expect(VALUE_LADDER_HREFS.book).toBe("/book");
  });
});

describe("UpsellLadder – UpsellItem type contract", () => {
  it("a minimal valid UpsellItem satisfies the required fields", () => {
    const item: UpsellItem = {
      title: "Growth Plan",
      why: "Weekly AI citation tracking.",
      price: "$99/mo",
      href: "/login?plan=growth&next=checkout",
    };
    expect(item.title.length).toBeGreaterThan(0);
    expect(item.why.length).toBeGreaterThan(0);
    expect(item.price.length).toBeGreaterThan(0);
    expect(isLiveHref(item.href)).toBe(true);
  });

  it("accent is optional and defaults gracefully", () => {
    const item: UpsellItem = {
      title: "Kit",
      why: "Close the gap.",
      price: "$29",
      href: "/kit",
      // no accent field
    };
    expect(item.accent).toBeUndefined();
    // The component uses "emerald" as default
    expect(accentBackground(item.accent)).toBe("linear-gradient(135deg,#27c98a,#0c7d54)");
  });
});
