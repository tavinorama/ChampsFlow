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

/**
 * Sign a test user in.
 *
 * webkit-mobile fix (#170): the cookie was set with no `sameSite`. Chromium
 * treats an omitted value as Lax and sends it on the top-level navigation that
 * every authed spec starts with; WebKit (mobile Safari) is stricter and did
 * NOT send it, so `getByRole('dialog')` for the login-gated modal never
 * appeared and 96 webkit-mobile assertions failed in cascade while chromium
 * stayed green. `sameSite: "Lax"` is chromium's existing default (so the green
 * required gate is unchanged) and is what WebKit needs to send the cookie on a
 * same-site GET navigation. No `secure` on purpose — the suite runs over
 * http://localhost. This is a test-environment cookie; production auth is
 * untouched. Proof: tomorrow's 06:00 nightly webkit-mobile run.
 */
export async function signIn(page: Page, value = "e2e-user-1:e2e-tenant-1"): Promise<void> {
  await page.context().addCookies([
    { name: "e2e_session", value, domain: DOMAIN, path: "/", sameSite: "Lax" },
  ]);
}
