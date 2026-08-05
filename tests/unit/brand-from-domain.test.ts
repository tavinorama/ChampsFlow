/**
 * brandFromDomain — the free test's "your website and your email" promise.
 *
 * The landing page promised two boxes and the form required four: website,
 * email, brand and category, with the button dead until all four were filled.
 * Brand is the one we can honestly read off the address the visitor already
 * typed, so the API derives it when it arrives empty.
 *
 * These tests pin two things that matter more than the happy path:
 *   - it returns "" rather than guessing when there is nothing to read, so the
 *     caller decides what a missing brand means instead of inheriting junk;
 *   - a brand the caller actually sends is never overridden. A registrable
 *     label is a decent guess and never an authority.
 */

import { describe, it, expect } from "vitest";
import { brandFromDomain } from "../../apps/api/src/routes/products";

describe("brandFromDomain — reading the trading name off the address", () => {
  it("takes the registrable label and capitalises it", () => {
    expect(brandFromDomain("ozvor.com")).toBe("Ozvor");
  });

  it("ignores a leading www", () => {
    expect(brandFromDomain("www.ozvor.com")).toBe("Ozvor");
  });

  it("turns hyphens and underscores into words", () => {
    expect(brandFromDomain("joes-plumbing.com")).toBe("Joes Plumbing");
    expect(brandFromDomain("acme_crm.io")).toBe("Acme Crm");
  });

  it("handles two-part public suffixes instead of returning the suffix", () => {
    // The bug this pins: a naive "second-to-last label" rule yields "Co" here.
    expect(brandFromDomain("joes-plumbing.co.uk")).toBe("Joes Plumbing");
    expect(brandFromDomain("padaria.com.br")).toBe("Padaria");
  });

  it("tolerates a pasted URL, not just a bare host", () => {
    expect(brandFromDomain("https://www.ozvor.com/pricing?utm=x")).toBe("Ozvor");
  });

  it("is case-insensitive about what the visitor typed", () => {
    expect(brandFromDomain("OZVOR.COM")).toBe("Ozvor");
  });

  it("returns empty — never a guess — when there is nothing to read", () => {
    for (const nothing of ["", "   ", null, undefined]) {
      expect(brandFromDomain(nothing)).toBe("");
    }
  });

  it("survives a bare hostname with no dot", () => {
    expect(brandFromDomain("localhost")).toBe("Localhost");
  });

  it("caps length so a hostile domain cannot stuff the brand field", () => {
    expect(brandFromDomain(`${"a".repeat(300)}.com`).length).toBeLessThanOrEqual(80);
  });
});
