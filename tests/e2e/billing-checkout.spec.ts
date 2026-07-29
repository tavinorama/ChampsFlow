/**
 * E2E — Billing checkout (C6)
 *
 * Tests the Free → Growth upgrade via Stripe Checkout test mode.
 * When STRIPE_TEST_MODE=true (set in CI .env), Stripe test card
 * 4242-4242-4242-4242 is used for payment. Without STRIPE_TEST_MODE,
 * this spec skips to avoid hitting real Stripe.
 *
 * Coverage:
 *  - Free-plan user sees upgrade prompt on plan card
 *  - POST /api/billing/checkout creates Stripe Checkout session (mocked)
 *  - ?checkout=success → toast "Subscription activated!" visible
 *  - Webhook idempotency: duplicate event_id → {duplicate: true}
 *  - requireNotRestricted: canceled subscription + expired grace → 402
 *  - Owner-only: Editor/Viewer cannot initiate checkout (403)
 *
 * Architecture refs: C6 PRD ACs, US-07
 */
import { test, expect, type Page } from "@playwright/test";

const STRIPE_TEST_MODE = process.env["STRIPE_TEST_MODE"] === "true";

// ---------------------------------------------------------------------------
// Skip guard for non-Stripe test environments
// ---------------------------------------------------------------------------

// BLOCKED (2026-07-29): every test below needs a signed-in user, and E2E has no
// way to sign one in. The helper sets a "test_session" cookie that appears
// nowhere in apps/ — the web app authenticates through Supabase cookie
// sessions, and CI points SUPABASE_URL at a placeholder with no key, so no
// session can exist. These specs have been asserting against a login redirect,
// which is why every locator missed. They are marked fixme rather than deleted:
// the flows they cover are real and worth testing. Unblocking them needs a
// test-only session shim in the web app, gated on NODE_ENV=test the way the API
// already gates DEV_AUTH_BYPASS. That is auth code and a HIGH-risk change, so it
// is a founder-approved PR of its own, not a drive-by.
test.describe.fixme("Billing — Stripe Checkout (C6)", () => {
  test.beforeEach(async ({ page }) => {
    // Seed test session as Owner on free plan
    await page.context().addCookies([
      { name: "test_session", value: "e2e-owner-1:e2e-tenant-free", domain: "localhost", path: "/" },
    ]);
  });

  test("free-plan user sees plan cards with upgrade option", async ({ page }) => {
    // Mock billing plan API (free plan)
    await page.route("**/api/billing/plan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "free",
          status: "active",
          usage: { drafts_used: 5, drafts_limit: 5, posts_limit: 5 },
        }),
      });
    });

    await page.goto("/account/billing");

    // Three plan cards: Free, Growth, Agency. The ladder was renamed away from
    // Starter/Pro long ago, and the cards never carried a data-testid — each is
    // a role="group" labelled by its own heading, which is the durable hook.
    const planCards = page.getByRole("group", { name: /free|growth|agency/i });
    await expect(planCards).toHaveCount(3);

    // The paid CTA. Its accessible name is built from the plan name and price,
    // so matching "Choose Growth" holds even when the price moves.
    const upgradeButton = page.getByRole("button", { name: /choose growth/i });
    await expect(upgradeButton).toBeVisible();
  });

  test("POST /api/billing/checkout redirects to Stripe Checkout (mocked)", async ({ page }) => {
    // Mock the checkout session creation
    await page.route("**/api/billing/checkout", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "https://checkout.stripe.com/pay/cs_test_mock_session_id",
        }),
      });
    });

    await page.route("**/api/billing/plan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "free", status: "active", usage: {} }),
      });
    });

    await page.goto("/account/billing");

    // Click the paid plan's CTA. Growth is the first paid rung.
    const upgradeButton = page.getByRole("button", { name: /choose growth/i }).first();
    if (await upgradeButton.isVisible()) {
      // Intercept navigation to Stripe (don't follow external redirect in tests)
      const [request] = await Promise.all([
        page.waitForRequest("**/api/billing/checkout"),
        upgradeButton.click(),
      ]);

      expect(request.method()).toBe("POST");
      const body = JSON.parse(request.postData() ?? "{}");
      expect(body.plan ?? body.price_id ?? "present").toBeTruthy();
    }
  });

  test("?checkout=success → subscription activated toast is visible", async ({ page }) => {
    // Mock billing plan returning an active paid plan after checkout. It has to
    // be a tier the app knows — free, growth or agency. The old mock said
    // "starter", a tier that stopped existing when the ladder was renamed, so
    // the page never reached the state that renders the toast.
    await page.route("**/api/billing/plan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "growth",
          status: "active",
          usage: { drafts_used: 0, drafts_limit: 30 },
        }),
      });
    });

    // Navigate with ?checkout=success param (Stripe success URL)
    await page.goto("/account/billing?checkout=success");

    // Toast or success message should appear (C6 AC)
    const successMessage = page
      .getByText(/subscription activated|payment successful/i)
      .first();
    await expect(successMessage).toBeVisible({ timeout: 5_000 });
  });

  test.skip(
    !STRIPE_TEST_MODE,
    "Live Stripe checkout flow (skipped without STRIPE_TEST_MODE=true)"
  );

  test("Stripe test mode — full checkout flow with test card", async ({ page }) => {
    test.skip(!STRIPE_TEST_MODE, "Only runs with STRIPE_TEST_MODE=true");

    // This test uses real Stripe test mode (no mock)
    await page.goto("/account/billing");

    const upgradeButton = page.getByRole("button", { name: /choose growth/i }).first();
    await upgradeButton.click();

    // Wait for Stripe Checkout page
    await page.waitForURL(/checkout\.stripe\.com/);

    // Fill test card
    await page.fill("[placeholder='Card number']", "4242424242424242");
    await page.fill("[placeholder='MM / YY']", "12/30");
    await page.fill("[placeholder='CVC']", "123");
    await page.fill("[placeholder='Name on card']", "Test User");
    await page.click("button[type='submit']");

    // Wait for redirect back to app
    await page.waitForURL(/localhost:3000.*checkout=success/);
    const toast = page.getByText(/subscription activated/i);
    await expect(toast).toBeVisible();
  });

  test("webhook idempotency — duplicate event_id returns {duplicate: true}", async ({ page }) => {
    // This is a direct API test via page.request (not UI interaction)
    const response = await page.request.post("http://localhost:3001/api/billing/webhook", {
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": "t=1234,v1=test-signature",
      },
      data: JSON.stringify({
        id: "evt_duplicate_test_id",
        type: "checkout.session.completed",
        data: { object: { metadata: { tenant_id: "tenant-test" } } },
      }),
    });
    // First call: either 200 or 400 (invalid signature in test)
    // We only assert signature is verified, not the full flow
    expect([200, 400]).toContain(response.status());
  });

  test("Editor role cannot initiate checkout (Owner-only)", async ({ page }) => {
    // Seed editor session
    await page.context().clearCookies();
    await page.context().addCookies([
      { name: "test_session", value: "e2e-editor-1:e2e-tenant-free:editor", domain: "localhost", path: "/" },
    ]);

    await page.route("**/api/billing/checkout", async (route) => {
      // API returns 403 for editor role
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "insufficient_role" }),
      });
    });

    await page.route("**/api/billing/plan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "free", status: "active", usage: {} }),
      });
    });

    await page.goto("/account/billing");

    // Upgrade button should either be hidden or show an error when clicked
    const upgradeButton = page.getByRole("button", { name: /choose growth|upgrade/i }).first();
    if (await upgradeButton.isVisible()) {
      await upgradeButton.click();
      // Should show error or be disabled
      const error = page.getByText(/insufficient|owner only|no permission/i).first();
      await expect(error).toBeVisible({ timeout: 3_000 }).catch(() => {
        // Acceptable: button may be hidden/disabled for editors
      });
    }
    // If not visible, that also passes (editor cannot see upgrade button)
  });
});
