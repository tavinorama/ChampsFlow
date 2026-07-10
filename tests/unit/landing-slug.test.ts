/**
 * apps/web/src/lib/landing-slug.ts — client-side mirror of the server's slug
 * rules (apps/api/src/routes/landing.ts), used for live "New site" wizard
 * feedback (issue #208, PR-5). Pinned to match the server 1:1.
 */

import { describe, it, expect } from "vitest";
import { slugify, validateSiteSlug, RESERVED_SITE_SLUGS } from "../../apps/web/src/lib/landing-slug";

describe("slugify (web mirror)", () => {
  it("lowercases, strips diacritics, hyphenates", () => {
    expect(slugify("Café São João Encanadores")).toBe("cafe-sao-joao-encanadores");
  });

  it("collapses repeats and trims hyphen edges", () => {
    expect(slugify("  Joe's --- Plumbing!  ")).toBe("joe-s-plumbing");
  });
});

describe("validateSiteSlug (web mirror)", () => {
  it("accepts a normal business slug", () => {
    expect(validateSiteSlug("joes-plumbing-austin")).toBeNull();
  });

  it("rejects reserved words", () => {
    for (const reserved of ["admin", "api", "login", "pricing", "l", "ozvor"]) {
      expect(RESERVED_SITE_SLUGS.has(reserved)).toBe(true);
      expect(validateSiteSlug(reserved)).toMatch(/reserved/i);
    }
  });

  it("rejects malformed slugs", () => {
    for (const bad of ["ab", "-leading", "trailing-", "UPPER", "with space", "a".repeat(65)]) {
      expect(validateSiteSlug(bad)).not.toBeNull();
    }
  });

  it("output of slugify always passes validateSiteSlug for realistic names", () => {
    for (const name of ["Acme CRM", "Müller & Söhne GmbH", "Pizzaria do Zé 24h"]) {
      expect(validateSiteSlug(slugify(name))).toBeNull();
    }
  });
});
