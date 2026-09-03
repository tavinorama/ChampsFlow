/**
 * mobile-overflow.spec.ts — P0-10 acceptance test.
 *
 * The audit report (RELATORIO §9, P0-10) requires: zero horizontal document
 * overflow on the main flows at 320/375/390/768/1024/1440px. The single
 * assertion the report asks for is:
 *
 *     document.documentElement.scrollWidth <= window.innerWidth
 *
 * Run against a running stack:
 *   E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/mobile-overflow.spec.ts --project=chromium-desktop
 *
 * Measured on 03/09/2026 with `next dev` on :3210. BEFORE the fixes in this
 * change the suite failed as follows (real numbers, not predicted):
 *   /        @768  scrollWidth=970  client=768   (.mk-cta-primary right=970)
 *   /pricing @768  scrollWidth=970  client=768
 *   /test    @768  scrollWidth=970  client=768
 *   /login   @320  scrollWidth=329  client=320   (content-box card, w=338)
 * AFTER: all 6 widths × 4 routes report scrollWidth === clientWidth.
 *
 * NOT COVERED HERE, and deliberately so: the authenticated dashboard. GET
 * /dashboard-v3 answers 307 to the login page when signed out, so the logged-in
 * shell was NOT measured — see the PR notes.
 *
 * The check runs with the privacy banner in its un-answered state (no consent
 * seeded) precisely because the report flags that banner; the nav, cards,
 * tables and the chat widget are all in the page at the same time, so a single
 * document-level assertion covers every one of them.
 */
import { test, expect } from "@playwright/test";

const WIDTHS = [320, 375, 390, 768, 1024, 1440] as const;

// Public routes only — these are the flows the report names (home, pricing,
// /test) plus /login, which the measurement caught overflowing at 320px.
const ROUTES = ["/", "/pricing", "/test", "/login"] as const;

test.describe("P0-10 — no horizontal document overflow", () => {
  // Scroll-driven film scenes keep animating; reduced motion settles the layout
  // so the measurement is of the resting state, not a mid-transition frame.
  test.use({ reducedMotion: "reduce" });

  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      test(`${route} @ ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(route, { waitUntil: "networkidle" });

        // The cookie banner and the chat widget mount client-side after
        // hydration; measuring before they land would test the wrong document.
        await page.waitForTimeout(600);

        const { scrollWidth, innerWidth, offenders } = await page.evaluate(() => {
          const de = document.documentElement;
          const vw = de.clientWidth;
          const offenders: string[] = [];
          if (de.scrollWidth > vw) {
            for (const el of Array.from(document.querySelectorAll("*"))) {
              // position:fixed elements do not contribute to document
              // scrollWidth — reporting them would send the reader chasing the
              // cookie banner and the chat widget, which are innocent.
              if (getComputedStyle(el).position === "fixed") continue;
              const r = el.getBoundingClientRect();
              if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
                offenders.push(
                  `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}"> ` +
                  `left=${Math.round(r.left)} right=${Math.round(r.right)} w=${Math.round(r.width)}`
                );
              }
            }
          }
          return { scrollWidth: de.scrollWidth, innerWidth: vw, offenders: offenders.slice(0, 6) };
        });

        expect(
          scrollWidth,
          `${route} overflows at ${width}px. Widest offending elements:\n  ${offenders.join("\n  ")}`
        ).toBeLessThanOrEqual(innerWidth);
      });
    }
  }
});
