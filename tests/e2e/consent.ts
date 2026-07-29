/**
 * consent.ts — get the cookie banner out of the way before a test clicks.
 *
 * The consent banner renders a full-page scrim (`.ti-cookie-scrim`) that
 * deliberately intercepts pointer events until the visitor chooses. That is
 * correct for an opt-in jurisdiction and wrong for a test: every click in the
 * suite was timing out with
 *
 *     <div aria-hidden="true" class="ti-cookie-scrim"> intercepts pointer events
 *
 * which reads like a broken selector and is not one. Rather than clicking the
 * banner away in each spec (slow, and it makes every test depend on the
 * banner's copy), we write the consent record before the page's own scripts
 * run, so the banner never mounts.
 *
 * A test that specifically covers the banner must NOT call this.
 */
import type { Page } from "@playwright/test";

/**
 * Mirrors apps/web/src/lib/cookieConsent.ts. Kept as literals on purpose: the
 * suite must not import app source. If the app bumps CONSENT_VERSION, the
 * banner comes back and `seedConsent` throws with that exact instruction,
 * instead of the suite quietly timing out again.
 */
const CONSENT_STORAGE_KEY = "ti_cookie_consent";
const CONSENT_VERSION = "2026-07-10-v2";

/** Accept-all, so nothing the page needs is gated. */
export async function seedConsent(page: Page): Promise<void> {
  const record = {
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
    jurisdiction: "opt-out",
    essential: true,
    analytics: true,
    marketing: true,
  };
  const json = JSON.stringify(record);

  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Storage can be unavailable before the first navigation; the cookie
        // below is enough for the server, and the next page load retries this.
      }
      document.cookie = `${key}=${encodeURIComponent(value)}; path=/; SameSite=Strict`;
    },
    { key: CONSENT_STORAGE_KEY, value: json }
  );
}

/**
 * Fails loudly if the scrim is still up. Call after the first navigation in a
 * spec that clicks, so a CONSENT_VERSION bump surfaces as one clear error
 * instead of twenty click timeouts.
 */
export async function assertNoConsentScrim(page: Page): Promise<void> {
  const scrim = page.locator(".ti-cookie-scrim");
  if ((await scrim.count()) > 0) {
    throw new Error(
      "The cookie scrim is still up, so every click in this test will time out. " +
        "CONSENT_VERSION in apps/web/src/lib/cookieConsent.ts has probably moved " +
        `past "${CONSENT_VERSION}" — update it in tests/e2e/consent.ts.`
    );
  }
}
