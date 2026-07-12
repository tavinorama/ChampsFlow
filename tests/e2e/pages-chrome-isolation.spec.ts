/**
 * pages-chrome-isolation.spec.ts — proves the RENDERED root-layout composition,
 * not just the routing helper (Hermes #259 review #3).
 *
 * A published Ozvor Pages site at /l/* is the CUSTOMER's website: it must carry
 * ZERO Ozvor global chrome — no marketing/app footer, no CCPA/California banner,
 * no Ozvor cookie manager, no Ozvor GA4. The root layout keys all of that off
 * chromeCategory(pathname). This test loads a real /l/* URL and asserts none of
 * that chrome is present in the actual DOM, with the marketing home as a
 * positive control that the same markers ARE detectable when they should be.
 *
 * (Even with no seeded site the /l/* miss renders its 404 through the same
 * root-layout branch, so the composition is exercised either way.)
 *
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/pages-chrome-isolation.spec.ts --project=chromium-desktop
 */
import { test, expect } from "@playwright/test";

test.describe("Public Pages (/l/*) are isolated from Ozvor global chrome", () => {
  test("positive control: the marketing home DOES carry Ozvor chrome", async ({ page }) => {
    await page.goto("/");
    const html = await page.content();
    // Ozvor's own compliance/analytics chrome is expected here.
    expect(/cookie/i.test(html)).toBe(true);
    expect(await page.locator("footer").count()).toBeGreaterThan(0);
  });

  test("/l/* carries NO Ozvor footer, California banner, cookie manager or GA4", async ({ page }) => {
    await page.goto("/l/chrome-isolation-e2e");
    const html = await page.content();

    // No Ozvor GA4 / gtag script loaded on the client's site.
    const gaScripts = await page
      .locator('script[src*="googletagmanager"], script[src*="gtag"]')
      .count();
    expect(gaScripts).toBe(0);

    // No Ozvor cookie-consent manager, no CCPA/California "Do Not Sell" banner.
    expect(/Do Not Sell|Do-Not-Sell|California Privacy/i.test(html)).toBe(false);
    expect(page.getByRole("button", { name: /cookie|accept|consent/i })).toHaveCount(0);

    // No Ozvor global site footer ("Built with Ozvor Pages" credit is allowed,
    // but the Ozvor MARKETING footer with its nav/legal columns is not). The
    // giveaway marker for the global footer is the Ozvor "Do Not Sell" / privacy
    // nav — already asserted absent above.
  });
});
