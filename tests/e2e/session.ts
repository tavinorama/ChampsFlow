/**
 * session.ts — sign a test user in.
 *
 * The suite used to set a cookie called "test_session" that appeared nowhere
 * in apps/, so every authenticated spec was really asserting against a login
 * redirect. The web middleware now honours "e2e_session", but only when
 * NODE_ENV=test and E2E_TEST_SESSION=1 — both set by the E2E workflow and
 * neither reachable in production.
 *
 * Pair it with the API's DEV_AUTH_BYPASS, which the same workflow sets. One
 * without the other gets you a page that renders and then 401s on its data.
 */
import type { Page } from "@playwright/test";

/** Domain the tests run against. Playwright's baseURL is localhost in CI. */
const DOMAIN = "localhost";

export async function signIn(page: Page, value = "e2e-user-1:e2e-tenant-1"): Promise<void> {
  await page.context().addCookies([
    { name: "e2e_session", value, domain: DOMAIN, path: "/" },
  ]);
}
