/**
 * landing-chrome-source.test.ts — structural guards for the public Pages chrome
 * (Hermes #259). vitest here is node-only (no JSX render), and /l/* needs a
 * seeded published site to render live, so this asserts the SOURCE keeps the
 * accessible + injection-safe construction: the mobile nav is a native
 * <details>/<summary> disclosure (open/closed + keyboard + focus come free from
 * the platform) with an accessible name and a responsive swap, and the tenant
 * brand colour only ever reaches the <style> block via safeHexColor().
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "../../apps/web/src/components/landing-public/PublicLandingChrome.tsx"),
  "utf8"
);

describe("PublicLandingChrome source — accessible mobile menu", () => {
  it("uses a native <details>/<summary> disclosure with an accessible name", () => {
    expect(src).toMatch(/<details className="ozpc-mobile-nav">/);
    expect(src).toMatch(/<summary aria-label=\{t\.menu\}>/);
  });

  it("swaps desktop nav for the menu below the mobile breakpoint", () => {
    expect(src).toContain("@media (max-width: 719px)");
    expect(src).toContain(".ozpc-desktop-nav { display: none; }");
    expect(src).toContain(".ozpc-mobile-nav { display: block; }");
  });

  it("summary meets the 44px touch-target minimum", () => {
    expect(src).toMatch(/summary \{[^}]*min-height: 44px/);
  });
});

describe("PublicLandingChrome source — CSS-injection defense", () => {
  it("sanitizes the tenant brand colour before any style sink", () => {
    // The prop is aliased and shadowed by a safeHexColor() const, so every
    // downstream ${accentColor} (including the <style> block) is validated.
    expect(src).toMatch(/accentColor:\s*accentColorInput/);
    expect(src).toMatch(/const accentColor = safeHexColor\(accentColorInput\)/);
    // Never interpolate the raw prop into the stylesheet.
    expect(src).not.toContain("${accentColorInput}");
  });
});
