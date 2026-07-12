/**
 * chrome-routing.test.ts — locks the public-tenant-site chrome isolation
 * (Hermes audit, PR #259, finding #1 + #5).
 *
 * A published Ozvor Pages site at /l/[siteSlug] is the CUSTOMER's website. It
 * must render ZERO Ozvor chrome — no marketing/app footer, no CCPA/California
 * banner, no Ozvor cookie manager, no Ozvor GA4, no aurora background. The root
 * layout keys all of that off chromeCategory(pathname) === "public-landing", so
 * this test is the guard: if a future edit lets /l/* fall back into any other
 * category, the Ozvor chrome would leak onto the client's site and this fails.
 */
import { describe, it, expect } from "vitest";
import {
  chromeCategory,
  isPublicLandingPath,
  isMarketingPath,
  isAuthedAppPath,
} from "../../apps/web/src/lib/chrome-routing";

describe("chrome routing — public tenant sites are isolated", () => {
  const landingPaths = [
    "/l/marigold-cafe",
    "/l/marigold-cafe/services",
    "/l/some-slug/faq",
    "/l",
  ];

  it("classifies every /l/* path as public-landing", () => {
    for (const p of landingPaths) {
      expect(chromeCategory(p)).toBe("public-landing");
      expect(isPublicLandingPath(p)).toBe(true);
    }
  });

  it("public-landing paths never match marketing or authed-app chrome", () => {
    for (const p of landingPaths) {
      expect(isMarketingPath(p)).toBe(false);
      expect(isAuthedAppPath(p)).toBe(false);
    }
  });

  it("does NOT mistake the authed builder or lookalike routes for a tenant site", () => {
    // /landing-pages is the AUTHED builder — must stay authed-app, not /l/*.
    expect(isPublicLandingPath("/landing-pages")).toBe(false);
    expect(isPublicLandingPath("/landing-pages/abc")).toBe(false);
    expect(chromeCategory("/landing-pages")).toBe("authed-app");
    // Routes that merely start with "/l" but not "/l/".
    expect(isPublicLandingPath("/learn")).toBe(false);
    expect(isPublicLandingPath("/legal")).toBe(false);
    expect(isPublicLandingPath("/login")).toBe(false);
    expect(chromeCategory("/learn")).toBe("marketing");
  });

  it("keeps the other categories intact", () => {
    expect(chromeCategory("/")).toBe("marketing");
    expect(chromeCategory("/pricing")).toBe("marketing");
    expect(chromeCategory("/dashboard")).toBe("authed-app");
    expect(chromeCategory("/agency/portfolio")).toBe("authed-app");
    expect(chromeCategory("/legal/privacy")).toBe("other-public");
    expect(chromeCategory("/login")).toBe("other-public");
    expect(chromeCategory("/r/shared-report")).toBe("other-public");
  });
});
