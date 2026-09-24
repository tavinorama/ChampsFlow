/**
 * results-page-no-decorative-number.test.ts — B2 (Codex D07, 23/09).
 *
 * /results promises "raw audit data … No cherry-picking, no invented trends".
 * It then rendered ScorecardGlyph, an illustration with hard-coded fill
 * percentages, between that promise and the real numbers. On a page whose
 * whole point is that every figure is measured, no illustrated figure may
 * appear at all.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(__dirname, "../../apps/web/src/app/(marketing)/results/page.tsx"), "utf8");

describe("/results shows only measured numbers", () => {
  it("does not render the decorative ScorecardGlyph", () => {
    expect(page).not.toMatch(/<ScorecardGlyph/);
    expect(page).not.toMatch(/import\s*\{[^}]*ScorecardGlyph/);
  });

  it("keeps the promise it makes about the data, so the test guards the right page", () => {
    expect(page).toContain("No cherry-picking, no invented trends");
    expect(page).toContain("These are Ozvor&rsquo;s own numbers");
  });

  it("the glyph itself still declares it is decorative (anyone re-adding it must read this)", () => {
    const glyph = readFileSync(
      join(__dirname, "../../apps/web/src/components/marketing/illustrations/ScorecardGlyph.tsx"),
      "utf8"
    );
    expect(glyph).toContain("Purely decorative");
  });
});
