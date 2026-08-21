/**
 * E2E — DPA Modal + CCPA banner (CI-1, CI-2, L-UX-1)
 *
 * Verifies the DPA acknowledgment gate and jurisdiction-specific copy.
 * L-UX-1 condition: EU IP → EU DPA copy shown; US IP → US DPA copy shown.
 *
 * Coverage:
 *  - EU user (cf-ipcountry=DE) → EU DPA modal shown on first login
 *  - US user (cf-ipcountry=US) → US Privacy Acknowledgment modal shown
 *  - DPA modal cannot be bypassed by navigating directly to /create
 *  - "Not now — exit" redirects to / (session cleared)
 *  - California banner shown to US users; not shown to EU users
 *  - DPA re-acknowledgment prompt for version mismatch
 *  - WCAG: modal has focus trap, Escape key behavior
 *
 * Architecture refs: CI-1, CI-2, L-UX-1, DPAModal.tsx, DpaGate.tsx
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { signIn } from "./session";
import { seedConsent } from "./consent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set up a test session with a specific DPA status */
async function setupSession(
  page: Page,
  options: {
    userId?: string;
    tenantId?: string;
    dpaAcknowledged?: boolean;
    countryCode?: string;
  } = {}
): Promise<void> {
  const {
    userId = "e2e-user-1",
    tenantId = "e2e-tenant-1",
    dpaAcknowledged = false,
    countryCode = "US",
  } = options;

  // "test_session" appears nowhere in apps/web/src — it was a cookie the app
  // never read, so every test here browsed as a signed-out visitor. Same dead
  // cookie #397 removed from the billing spec.
  await signIn(page, `${userId}:${tenantId}`);
  // Without this the cookie-consent banner mounts as a second role="dialog"
  // ("We value your privacy") next to the DPA modal, and every strict-mode
  // dialog locator in this file dies on the ambiguity. This spec is about the
  // DPA gate; the consent banner has its own spec.
  await seedConsent(page);

  // Override DPA status API based on options
  await page.route("**/api/dpa/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current_dpa_version_in_env: "1.0",
        user_acknowledged_version: dpaAcknowledged ? "1.0" : null,
        variant_required: countryCode === "DE" || countryCode === "GB" || countryCode === "FR" ? "EU" : "US",
        needs_acknowledgment: !dpaAcknowledged,
      }),
    });
  });

  // Mock DPA acknowledge
  await page.route("**/api/dpa/acknowledge", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ acknowledged: true }),
    });
  });
}

// ---------------------------------------------------------------------------
// EU user — EU DPA copy
// ---------------------------------------------------------------------------

test.describe("DPA Modal — EU user (L-UX-1 / CI-1)", () => {
  test("EU user (DE) sees EU DPA copy on first login", async ({ page }) => {
    // Set cf-ipcountry to DE for all requests
    await page.route("**/*", async (route) => {
      const headers = { ...route.request().headers(), "cf-ipcountry": "DE" };
      await route.continue({ headers });
    });

    await setupSession(page, { dpaAcknowledged: false, countryCode: "DE" });
    await page.goto("/dashboard");

    // DPA modal should appear
    const modal = page.getByRole("dialog").or(page.getByTestId("dpa-modal"));
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // EU-specific copy: must contain GDPR reference (L-UX-1). Scoped to the
    // modal: the page-wide locator's /EU/i alternative matched the sidebar's
    // "Fix qUEue" span first, which is hidden on the mobile viewport — so the
    // assertion failed on webkit-mobile while passing (for the wrong element)
    // on desktop. The modal's actual EU copy cites "GDPR Art. 28".
    const euCopy = modal.getByText(/GDPR|data processing agreement/i).first();
    await expect(euCopy).toBeVisible();

    // The gate itself is the assertion. The old line looked for a
    // "dashboard-content" test id that exists nowhere in apps/web/src and then
    // wrapped the expect in .catch(), so it could not fail for either reason.
    // What actually proves the gate is that the modal is modal: it traps the
    // page until the user acknowledges.
    await expect(modal).toHaveAttribute("aria-modal", "true");
  });

  test("EU user can acknowledge DPA and access the app", async ({ page }) => {
    await page.route("**/*", async (route) => {
      const headers = { ...route.request().headers(), "cf-ipcountry": "DE" };
      await route.continue({ headers });
    });

    await setupSession(page, { dpaAcknowledged: false, countryCode: "DE" });
    // The mocks must be STATEFUL, like the API they stand in for. The app
    // redirects /dashboard → /dashboard-v3, which remounts DpaGate and asks
    // /api/dpa/status again — correct behaviour. A static mock answered that
    // second ask with needs_acknowledgment:true forever, so the modal the user
    // had just dismissed came straight back and this test failed against its
    // own scaffolding, not the product. (The POST also 404s if unmocked.)
    let acknowledged = false;
    await page.route("**/api/dpa/acknowledge", async (route) => {
      acknowledged = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    // Registered AFTER setupSession's static status mock, so it wins.
    await page.route("**/api/dpa/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          current_dpa_version_in_env: "1.0",
          user_acknowledged_version: acknowledged ? "1.0" : null,
          variant_required: "EU",
          needs_acknowledgment: !acknowledged,
        }),
      })
    );
    await page.goto("/dashboard");

    // DPA modal should appear
    const modal = page.getByRole("dialog").or(page.getByTestId("dpa-modal"));
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Click acknowledge button
    const acknowledgeButton = modal
      .getByRole("button", { name: /i agree|acknowledge|accept/i })
      .first();
    await acknowledgeButton.click();

    // Modal should close
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });

  test("EU user: 'Not now — exit' redirects to root (session cleared)", async ({ page }) => {
    await page.route("**/*", async (route) => {
      const headers = { ...route.request().headers(), "cf-ipcountry": "DE" };
      await route.continue({ headers });
    });

    await setupSession(page, { dpaAcknowledged: false, countryCode: "DE" });
    await page.goto("/dashboard");

    const modal = page.getByRole("dialog").or(page.getByTestId("dpa-modal"));
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Click "Not now — exit"
    // #140: DPAModal always renders "Not now — exit"; guarded, this test could
    // "pass" with the exit path broken. And the .catch() on waitForURL made the
    // redirect assertion optional — the regex already accepts every legitimate
    // destination (auth, login, or root), so a miss IS a failure.
    const exitButton = modal.getByRole("button", { name: /not now|exit|decline/i }).first();
    await expect(exitButton).toBeVisible();
    await exitButton.click();
    await page.waitForURL(/localhost:3000\/(auth|login|$)/, { timeout: 5_000 });
  });

  test("EU user cannot bypass DPA by directly navigating to /create", async ({ page }) => {
    await page.route("**/*", async (route) => {
      const headers = { ...route.request().headers(), "cf-ipcountry": "DE" };
      await route.continue({ headers });
    });

    await setupSession(page, { dpaAcknowledged: false, countryCode: "DE" });

    // Attempt direct navigation to /create, bypassing the normal entry path.
    await page.goto("/create");

    // ONE outcome, asserted unconditionally. This test used to branch on
    // `modal.isVisible({timeout: 3_000})` and assert the OPPOSITE thing in each
    // branch: modal visible → expect the modal; modal not visible within 3s →
    // expect a redirect away from /create.
    //
    // Those two branches cannot both describe the app. /create is in
    // AUTHED_APP_PREFIXES, so the root layout wraps it in <DpaGate>, and
    // DpaGate's design is to STAY on the page and cover it with a blocking
    // modal — it never redirects. So the `!isModalVisible` branch asserted
    // behaviour the product has never had: reaching it meant certain failure.
    // The test therefore did not measure the gate, it measured how fast the
    // machine was. It passes locally in 4.5s and fails in CI, and both results
    // were the same code being lucky or unlucky against a 3-second timer.
    //
    // setupSession mocks /api/dpa/status with needs_acknowledgment: true, so
    // there is exactly one correct outcome and we wait properly for it.
    const modal = page.getByRole("dialog").or(page.getByTestId("dpa-modal"));
    await expect(modal).toBeVisible({ timeout: 10_000 });

    // Staying on /create is CORRECT, and is asserted so that nobody later
    // "fixes" this into a redirect. The URL is not the gate: the authoritative
    // gate is server-side — requireDpaAcknowledged(db) guards every write route
    // (drafts.ts, schedules.ts, social-accounts.ts, ccpa.ts, billing.ts), so an
    // EU user sitting on /create without an acknowledgment cannot persist
    // anything. DpaGate is the UI half, and it deliberately fails open when
    // /api/dpa/status errors precisely because the API is the real boundary.
    expect(page.url()).toContain("/create");
  });

  test("DPA modal has focus trap (WCAG — keyboard navigation)", async ({ page }) => {
    await page.route("**/*", async (route) => {
      const headers = { ...route.request().headers(), "cf-ipcountry": "DE" };
      await route.continue({ headers });
    });

    await setupSession(page, { dpaAcknowledged: false, countryCode: "DE" });
    await page.goto("/dashboard");

    const modal = page.getByRole("dialog").or(page.getByTestId("dpa-modal"));
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // A focus trap either holds or it does not. The old version computed
    // isFocusInModal, never used it, and then asserted that pressing Tab "does
    // not error out" — inside a .catch() that swallowed even that. Assert the
    // actual accessibility guarantee: after Tab, focus is still inside the
    // modal.
    await page.keyboard.press("Tab");
    await expect(modal.locator(":focus")).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------------
// US user — US DPA copy
// ---------------------------------------------------------------------------

test.describe("DPA Modal — US user (L-UX-1 / CI-1)", () => {
  test("US user sees US Privacy Acknowledgment (not EU GDPR copy)", async ({ page }) => {
    await page.route("**/*", async (route) => {
      const headers = { ...route.request().headers(), "cf-ipcountry": "US" };
      await route.continue({ headers });
    });

    await setupSession(page, { dpaAcknowledged: false, countryCode: "US" });
    await page.goto("/dashboard");

    const modal = page.getByRole("dialog").or(page.getByTestId("dpa-modal"));
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // US copy: should NOT contain GDPR-specific text; should contain US privacy references
    // (implementation uses different modal copy per variant)
    const modalText = await modal.textContent();
    if (modalText) {
      // US variant must not show EU-specific GDPR DPA language
      // (both may mention privacy, but EU variant explicitly mentions GDPR Art. 28)
      expect(modalText.toLowerCase()).not.toContain("article 28"); // EU-specific GDPR clause
    }
  });
});

// ---------------------------------------------------------------------------
// DPA version mismatch — re-acknowledgment
// ---------------------------------------------------------------------------

test.describe("DPA version mismatch — re-prompt (CI-1)", () => {
  test("existing user with old DPA version sees re-acknowledgment prompt on login", async ({ page }) => {
    await page.route("**/api/dpa/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          current_dpa_version_in_env: "2.0",
          user_acknowledged_version: "1.0",
          variant_required: "EU",
          needs_acknowledgment: true,
        }),
      });
    });

    await signIn(page, "e2e-existing-user:e2e-tenant");
    await seedConsent(page);

    await page.goto("/dashboard");

    // Re-acknowledgment modal should appear
    const modal = page.getByRole("dialog").or(page.getByTestId("dpa-modal"));
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Should mention update or new version
    // Asserted for real. The .catch() here meant a re-acknowledgment modal that
    // never explained WHY it reappeared would still pass — which is the one
    // thing this test exists to catch.
    const updateText = page.getByText(/updated|new version|please review/i).first();
    await expect(updateText).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// California banner visibility (CI-2 / L-UX-1)
// ---------------------------------------------------------------------------

test.describe("California banner — US user detection (CI-2)", () => {
  test("US user (cf-ipcountry=US) sees California privacy banner", async ({ page }) => {
    await page.route("**/*", async (route) => {
      const headers = { ...route.request().headers(), "cf-ipcountry": "US" };
      await route.continue({ headers });
    });

    await setupSession(page, { dpaAcknowledged: true, countryCode: "US" });
    await page.goto("/dashboard");

    // California banner should be visible
    // Same locator as the EU case, for the same reason: the fallback here
    // matched the permanent footer link, so this test passed for every
    // visitor — Californian or not — and proved nothing.
    await expect(
      page.getByRole("region", { name: /privacy rights notice/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("EU user (cf-ipcountry=DE) does NOT see California banner", async ({ page }) => {
    await page.route("**/*", async (route) => {
      const headers = { ...route.request().headers(), "cf-ipcountry": "DE" };
      await route.continue({ headers });
    });

    await setupSession(page, { dpaAcknowledged: true, countryCode: "DE" });
    await page.goto("/dashboard");

    // The banner is a labelled region (CaliforniaBanner: role="region"
    // aria-label="Privacy rights notice"), so assert on that and nothing else.
    //
    // Matching loose "do not sell" copy is wrong twice over: the old line used
    // a test id that does not exist, and my first fix matched the footer link
    // in AppLegalStrip — which CCPA requires on EVERY page, for every visitor,
    // and which the next test in this file asserts is always there.
    await expect(
      page.getByRole("region", { name: /privacy rights notice/i })
    ).toHaveCount(0);
  });

  test("'Do Not Sell' link is present in footer on all pages", async ({ page }) => {
    await setupSession(page, { dpaAcknowledged: true, countryCode: "US" });

    // "/dashboard" used to be checked here, and only ever passed by accident:
    // it now server-redirects to /dashboard-v3, and the assertion ran against
    // the TRANSIENT old app-shell chrome streamed before the client redirect
    // fired (on webkit-mobile the redirect raced the next goto() instead —
    // "Navigation ... interrupted by another navigation to /dashboard-v3").
    // /dashboard-v3 itself has NO legal strip — see the fixme test below.
    const pagesToCheck = ["/schedule", "/account/connections"];
    for (const path of pagesToCheck) {
      await page.goto(path);
      const footerLink = page
        .getByRole("link", { name: /do not sell/i })
        .or(page.getByText(/do not sell or share/i).first());
      await expect(footerLink).toBeVisible({ timeout: 5_000 });
    }
  });

  // REAL product gap, not test drift (#146 investigation, rides on #170's
  // webkit red): the LIVE dashboard (/dashboard-v3) renders neither the
  // AppLegalStrip nor the CaliforniaBanner. apps/web/src/app/layout.tsx
  // documents this as a deliberate fit-to-viewport decision ("NO CCPA banner
  // here ... the CCPA control stays reachable via /ccpa + account settings"),
  // while AppLegalStrip.tsx says the Do-Not-Sell link "must stay" on every
  // page. Those two statements cannot both be true on the page users spend
  // the most time on. Founder/legal call needed; enable this test when the
  // link ships on v3.
  test.fixme("'Do Not Sell' link on /dashboard-v3 (live dashboard) — absent by layout design, compliance decision pending", async ({ page }) => {
    await setupSession(page, { dpaAcknowledged: true, countryCode: "US" });
    await page.goto("/dashboard-v3");
    const footerLink = page
      .getByRole("link", { name: /do not sell/i })
      .or(page.getByText(/do not sell or share/i).first());
    await expect(footerLink).toBeVisible({ timeout: 5_000 });
  });
});
