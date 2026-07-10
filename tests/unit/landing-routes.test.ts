/**
 * Ozvor Pages API unit tests (#208 PR-3) — the entitlement matrix + slug rules.
 *
 * The founder's isolation requirement ("comprador avulso não pode mexer nos
 * recursos pagos") is enforced server-side: allowance = plan base + purchased
 * credits, re-checked on every create. These tests pin that math for every
 * plan/credit combination, plus the slug validation that guards the public
 * /l/[slug] namespace (reserved words, shape) and the deterministic slugify.
 */

import { describe, it, expect } from "vitest";
import {
  computeLandingAllowance,
  validateSiteSlug,
  slugify,
  RESERVED_SITE_SLUGS,
  PAGE_TYPES,
} from "../../apps/api/src/routes/landing";

describe("computeLandingAllowance — the plan/credit access matrix", () => {
  it("free WITHOUT credit: 0 sites (builder locked — the founder's guarantee)", () => {
    expect(computeLandingAllowance("free", 0)).toEqual({ maxSites: 0, maxPagesPerSite: 6 });
  });

  it("free WITH one $99 credit: exactly 1 site (the standalone buyer)", () => {
    expect(computeLandingAllowance("free", 1).maxSites).toBe(1);
  });

  it("growth: 1 site included", () => {
    expect(computeLandingAllowance("growth", 0).maxSites).toBe(1);
  });

  it("growth + purchased credit stacks: 2 sites", () => {
    expect(computeLandingAllowance("growth", 1).maxSites).toBe(2);
  });

  it("agency: 25 sites (1 per brand)", () => {
    expect(computeLandingAllowance("agency", 0).maxSites).toBe(25);
  });

  it("negative credit values never subtract from the plan base", () => {
    expect(computeLandingAllowance("growth", -5).maxSites).toBe(1);
  });

  it("every tier caps pages per site at 6 (5-page deliverable + campaign slot)", () => {
    for (const tier of ["free", "growth", "agency"] as const) {
      expect(computeLandingAllowance(tier, 0).maxPagesPerSite).toBe(6);
    }
  });
});

describe("validateSiteSlug — guards the public /l/[slug] namespace", () => {
  it("accepts a normal business slug", () => {
    expect(validateSiteSlug("joes-plumbing-austin")).toBeNull();
  });

  it("rejects reserved words that would shadow real routes", () => {
    for (const reserved of ["admin", "api", "login", "pricing", "l", "ozvor"]) {
      expect(RESERVED_SITE_SLUGS.has(reserved)).toBe(true);
      expect(validateSiteSlug(reserved)).toMatch(/reserved/i);
    }
  });

  it("rejects malformed slugs (shape, length, hyphen edges, case)", () => {
    for (const bad of ["ab", "-leading", "trailing-", "UPPER", "with space", "a".repeat(65)]) {
      expect(validateSiteSlug(bad)).not.toBeNull();
    }
  });
});

describe("slugify — deterministic, matches the DB CHECK constraint", () => {
  it("lowercases, strips diacritics, hyphenates", () => {
    expect(slugify("Café São João Encanadores")).toBe("cafe-sao-joao-encanadores");
  });

  it("collapses repeats and trims hyphen edges", () => {
    expect(slugify("  Joe's --- Plumbing!  ")).toBe("joe-s-plumbing");
  });

  it("output passes validateSiteSlug for realistic names", () => {
    for (const name of ["Acme CRM", "Müller & Söhne GmbH", "Pizzaria do Zé 24h"]) {
      const s = slugify(name);
      expect(validateSiteSlug(s)).toBeNull();
    }
  });
});

describe("PAGE_TYPES — the 5-page bundle vocabulary", () => {
  it("contains the bundle types + campaign", () => {
    for (const t of ["home", "service_city", "service", "area", "faq", "proof", "campaign"]) {
      expect(PAGE_TYPES.has(t)).toBe(true);
    }
    expect(PAGE_TYPES.has("anything_else")).toBe(false);
  });
});
