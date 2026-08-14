/**
 * Unit tests for the /ai-audit pure copy + logic helpers.
 * No snapshot tests. Only pure functions tested here (node env, no DOM) —
 * the repo's colocated "pure logic helpers" convention.
 */

import { describe, it, expect } from "vitest";
import {
  allCopyStrings,
  buildEntryPayload,
  canSubmit,
  groupPains,
  painLabel,
  pickedForLine,
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

describe("buildEntryPayload", () => {
  it("trims strings and splits toolsInUse on commas and newlines", () => {
    const p = buildEntryPayload({
      businessType: "  dental clinic  ",
      primaryFocus: " marketing ",
      pains: ["no-shows"],
      engines: ["convert"],
      toolsInUseRaw: "ChatGPT, Canva\n , ,Notion",
    });
    expect(p.businessType).toBe("dental clinic");
    expect(p.primaryFocus).toBe("marketing");
    expect(p.toolsInUse).toEqual(["ChatGPT", "Canva", "Notion"]);
  });

  it("caps toolsInUse at 20 entries (the API's MAX)", () => {
    const raw = Array.from({ length: 30 }, (_, i) => `tool${i}`).join(",");
    const p = buildEntryPayload({
      businessType: "x",
      primaryFocus: "",
      pains: ["reviews"],
      engines: [],
      toolsInUseRaw: raw,
    });
    expect(p.toolsInUse).toHaveLength(20);
  });
});

describe("canSubmit", () => {
  it("requires a business type and at least one pain", () => {
    expect(canSubmit({ businessType: "clinic", pains: ["no-shows"] })).toBe(true);
    expect(canSubmit({ businessType: "  ", pains: ["no-shows"] })).toBe(false);
    expect(canSubmit({ businessType: "clinic", pains: [] })).toBe(false);
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
});

describe("pickedForLine", () => {
  it("anchors the pick in the client's business type", () => {
    expect(pickedForLine("dental clinic")).toBe("Picked for your dental clinic work.");
  });

  it("degrades honestly when the business type is empty", () => {
    expect(pickedForLine("  ")).toBe("Picked for your kind of work.");
  });
});
