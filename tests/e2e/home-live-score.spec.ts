/**
 * home-live-score.spec.ts — regression for the false "0/100 LIVE score" bug
 * (Hermes full QA audit #261, P1).
 *
 * The homepage score card animated a ring from 0 → the real value, but the
 * VISIBLE number and the aria-label were bound to the animation state, so a
 * crawler / screenshot / screen reader at load saw "0 out of 100" next to a
 * "LIVE" chip and a measured date — a false live score. The number + aria +
 * sub-scores must now reflect the actual data at all times; only the ring/bars
 * animate. This test reads the DOM at load WITHOUT scrolling — the exact
 * condition that exposed the bug.
 *
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/home-live-score.spec.ts --project=chromium-desktop
 */
import { test, expect } from "@playwright/test";

test.describe("Homepage self-score card is honest at load", () => {
  test("shows a real score (never 0) in the number + aria, without scrolling", async ({ page }) => {
    await page.goto("/");

    const ring = page.locator('svg[aria-label^="Ozvor AI Visibility Score"]');
    await expect(ring).toBeVisible();

    // aria-label carries the real overall value, not the pre-animation 0.
    const label = (await ring.getAttribute("aria-label")) ?? "";
    const m = label.match(/Score:\s*(\d{1,3})\s*out of 100/);
    expect(m, `aria-label should carry a numeric score, got: "${label}"`).not.toBeNull();
    const overall = Number(m![1]);
    expect(overall).toBeGreaterThan(0);
    expect(overall).toBeLessThanOrEqual(100);

    // The visible big number (sibling of the "/ 100" caption) matches, not 0.
    const visible = await page
      .locator('section[aria-labelledby="lv2-score-heading"]')
      .getByText(/^\d{1,3}$/)
      .first()
      .innerText();
    expect(Number(visible)).toBe(overall);
    expect(visible).not.toBe("0");

    // The card must still declare its provenance (LIVE when fetched, or the
    // honest SNAPSHOT fallback) — never a bare "LIVE" over a 0.
    await expect(page.locator('section[aria-labelledby="lv2-score-heading"]'))
      .toContainText(/LIVE|SNAPSHOT/);
  });
});
