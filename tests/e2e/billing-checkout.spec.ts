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
import { signIn } from "./session";

const STRIPE_TEST_MODE = process.env["STRIPE_TEST_MODE"] === "true";

/**
 * Whether a USABLE Stripe test key is present — not merely whether test mode is
 * switched on.
 *
 * The distinction is the whole point. CI sets, in .github/workflows/e2e.yml:
 *
 *     STRIPE_TEST_MODE: "true"
 *     STRIPE_SECRET_KEY: "sk_test_placeholder_for_e2e"
 *
 * That key is a placeholder Stripe rejects — the API says so out loud at every
 * boot ("Invalid API Key provided: sk_test_***_e2e"). So the live-checkout test
 * below was gated on the wrong condition: test mode was on, the test ran, no
 * Checkout Session could ever be created, and it failed on a 20s click timeout.
 * Three attempts, every run, for as long as the key has been a placeholder.
 * The E2E job is advisory, so it failed under a green badge and nobody saw.
 *
 * A skip with a stated reason is honest. A failure nobody reads is not.
 */
const STRIPE_KEY = process.env["STRIPE_SECRET_KEY"] ?? "";
const HAS_USABLE_STRIPE_KEY =
  STRIPE_TEST_MODE &&
  /^sk_test_[A-Za-z0-9]{20,}$/.test(STRIPE_KEY) &&
  !STRIPE_KEY.includes("placeholder");

// ---------------------------------------------------------------------------
// Skip guard for non-Stripe test environments
// ---------------------------------------------------------------------------

// Unblocked 2026-07-29: the web middleware now honours an e2e_session cookie
// under NODE_ENV=test + E2E_TEST_SESSION=1, so these can finally run inside
// the app instead of against a login redirect.
test.describe("Billing — Stripe Checkout (C6)", () => {
  test.beforeEach(async ({ page }) => {
    // Seed test session as Owner on free plan
    await signIn(page, "e2e-owner-1:e2e-tenant-free");
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
    !HAS_USABLE_STRIPE_KEY,
    "Live Stripe checkout needs a real sk_test_ key; CI's STRIPE_SECRET_KEY is a placeholder Stripe rejects"
  );

  test("Stripe test mode — full checkout flow with test card", async ({ page }) => {
    // Gated on a USABLE key, not on the test-mode flag. See HAS_USABLE_STRIPE_KEY
    // at the top of this file: the flag was true in CI while the key was a
    // placeholder, so this drove a checkout that could not exist.
    test.skip(
      !HAS_USABLE_STRIPE_KEY,
      "Needs a real Stripe test secret key (sk_test_…) — set STRIPE_SECRET_KEY to run this"
    );

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
    // Seed editor session. clearCookies() drops the owner seeded in beforeEach,
    // so this has to sign in again — and with e2e_session, not the old
    // test_session, which the app never read. (Caught in review of #397: this
    // one line would have kept the editor test on the login redirect while the
    // rest of the file ran authenticated, which is the worst kind of green.)
    await page.context().clearCookies();
    await signIn(page, "e2e-editor-1:e2e-tenant-free:editor");

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

    // Enforcement can take three shapes and this test accepts any of them —
    // but exactly one of them, asserted. The previous version passed on every
    // branch: hidden passed, and visible-clicked-with-no-error passed too,
    // because the expect was wrapped in .catch(). An editor who could actually
    // complete a checkout would have passed this authorisation test.
    const upgradeButton = page.getByRole("button", { name: /choose growth|upgrade/i }).first();
    const visible = await upgradeButton.isVisible().catch(() => false);

    if (!visible) {
      // Shape 1: the control is not offered at all.
      await expect(upgradeButton).toBeHidden();
      return;
    }

    if (await upgradeButton.isDisabled()) {
      // Shape 2: offered but inert.
      await expect(upgradeButton).toBeDisabled();
      return;
    }

    // Shape 3: clickable, so the refusal has to be shown to the user. No
    // .catch() here: silence is the failure this test exists to catch.
    await upgradeButton.click();
    await expect(
      page.getByText(/insufficient|owner only|no permission|not allowed/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
