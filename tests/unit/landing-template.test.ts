/**
 * Unit — visual template selection for Ozvor Pages (brila Fase 2, design).
 *
 * Different business categories map to different templates so generated sites
 * don't all look alike. Locks the mapping + that deriveLandingTheme carries it.
 */
import { describe, it, expect } from "vitest";
import { templateForCategory, deriveLandingTheme } from "../../packages/llm/src/landing-generate";

describe("templateForCategory", () => {
  it("maps food/hospitality to the classic (serif) template", () => {
    for (const c of ["Coffee shop", "Italian restaurant", "Artisan bakery", "Pizzeria"]) {
      expect(templateForCategory(c)).toBe("classic");
    }
  });

  it("maps beauty/fitness/events to the bold template", () => {
    for (const c of ["CrossFit gym", "Hair salon", "Day spa", "Tattoo studio", "Event photographer"]) {
      expect(templateForCategory(c)).toBe("bold");
    }
  });

  it("maps professional services to the minimal template", () => {
    for (const c of ["Law firm", "Accounting", "Financial advisor", "Dental clinic", "Physical therapy"]) {
      expect(templateForCategory(c)).toBe("minimal");
    }
  });

  it("defaults to modern for anything else / unknown", () => {
    for (const c of ["Marketing agency", "SaaS company", "Plumbing", "Retail store", "", undefined]) {
      expect(templateForCategory(c)).toBe("modern");
    }
  });
});

describe("deriveLandingTheme carries the template", () => {
  it("attaches the category-derived template", () => {
    expect(deriveLandingTheme("#c07d12", "Coffee shop").template).toBe("classic");
    expect(deriveLandingTheme(undefined, "Law firm").template).toBe("minimal");
    expect(deriveLandingTheme("#123456", "Marketing agency").template).toBe("modern");
  });

  it("still resolves the brand colour / default independently of the template", () => {
    expect(deriveLandingTheme("#c07d12", "Gym")).toMatchObject({ primary: "#c07d12", isDefault: false, template: "bold" });
    const dflt = deriveLandingTheme(undefined, "Gym");
    expect(dflt.isDefault).toBe(true);
    expect(dflt.template).toBe("bold");
  });
});
