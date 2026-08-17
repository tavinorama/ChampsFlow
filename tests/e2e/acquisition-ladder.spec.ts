/**
 * acquisition-ladder.spec.ts — E2E for the lead magnet + $29 Kit funnel.
 *
 * Run against the local Docker stack:
 *   E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/acquisition-ladder.spec.ts --project=chromium-desktop
 *
 * Stack must be in dev mode (no Stripe keys) so the Kit checkout returns a
 * dev-unlock URL and the delivery page builds the kit without payment.
 */
import { test, expect } from "@playwright/test";
import { seedConsent } from "./consent";

// The film scenes animate on scroll, so a button can still be moving when
// Playwright tries to click it ("element is not stable"). Ask for reduced
// motion: the kit honours it (see useScrollFilm) and the layout settles.
test.use({ reducedMotion: "reduce" });

test.describe("Acquisition ladder — Invisibility Test → Get-Cited Kit", () => {
  // The consent scrim intercepts clicks until the visitor chooses. Seed an
  // accepted record so the form is reachable.
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test("free test runs and shows a scorecard with a Kit CTA", async ({ page }) => {
    await page.goto("/test");
    // The page opens on a film scene now. Its h1 is the scene headline; the
    // form below it asks for a website and an email, not a brand/competitor/
    // category triple — the free test was cut to two required fields to stop
    // losing people in the form.
    await expect(page.getByRole("heading", { name: /named someone else/i })).toBeVisible();
    // Step one: the two boxes the page opens with.
    await page.getByLabel(/your website/i).fill("demo-crm.com");
    await page.getByLabel(/your email/i).fill("e2e-ladder@example.com");

    // Step two reveals itself once both are valid, and it is where the last
    // two required fields live. Submit stays disabled until all four are in —
    // that is the form working, not a broken selector.
    const brand = page.getByLabel(/your brand/i);
    await expect(brand).toBeVisible({ timeout: 10_000 });
    await brand.fill("Demo CRM");
    await page.getByLabel(/your category/i).fill("CRM");

    const run = page.getByRole("button", { name: /run my test/i });
    await expect(run).toBeEnabled({ timeout: 10_000 });
    await run.click();

    // Scorecard: a verdict + the per-engine table + the Kit CTA.
    await expect(page.locator("body")).toContainText(/cited|invisible/i, { timeout: 30_000 });
    // The link's accessible name is "Get my Get-Cited Kit — $29, one-time".
    // The old locator asked for /get my kit/i, which does NOT match it: the
    // product name "Get-Cited" sits between "my" and "Kit". So this assertion
    // failed against a results page that was rendering the CTA correctly and
    // prominently — the test was describing copy the page has never had.
    await expect(page.getByRole("link", { name: /get my .*kit/i })).toBeVisible();
  });

  test("kit checkout (dev-unlock) delivers audit + 3 drafts", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/kit");
    await expect(page.getByRole("heading", { name: /Get-Cited Kit/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/ready-to-publish drafts/i);

    await page.getByLabel(/your brand/i).fill("Demo CRM");
    await page.getByLabel(/website/i).fill("demo-crm.com");
    await page.getByLabel(/category/i).first().fill("CRM");
    await page.getByLabel(/email/i).fill("e2e-buyer@example.com");
    await page.getByRole("button", { name: /get the kit/i }).click();

    // Dev-unlock redirects to /kit/:token?dev_unlock=1 → delivery page builds it.
    await expect(page).toHaveURL(/\/kit\/.+dev_unlock=1/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /first step to getting cited/i })).toBeVisible({ timeout: 90_000 });
    await expect(page.locator("body")).toContainText(/Ozvor AI Visibility Score/i);
    await expect(page.locator("body")).toContainText(/top 3 fixes/i);
    await expect(page.locator("body")).toContainText(/ready-to-publish drafts/i);
    // Three drafts with the persistent AI label.
    await expect(page.getByText(/AI-generated draft/i).first()).toBeVisible();
    await expect(page.locator("body")).toContainText(/Where to publish/i);
  });
});

test.describe("Acquisition ladder — AI Audit Stack ($49, email first, dev-unlock)", () => {
  test.beforeEach(async ({ page }) => {
    await seedConsent(page);
  });

  test("email → questionnaire → $49 checkout (dev-unlock) delivers ONE niche pick + the ladder", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/ai-audit");
    await expect(page.getByRole("heading", { name: /too many ai tools/i })).toBeVisible();
    // The offer is on the page before any form: price + what you get.
    await expect(page.locator("body")).toContainText(/\$49/);
    await expect(page.locator("body")).toContainText(/what you get for \$49/i);

    // Step 1 of 5 — email is mandatory. "Next" without it stays on the step.
    await expect(page.locator("body")).toContainText(/step 1 of 5/i);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.locator("body")).toContainText(/add your email first/i);
    await page.getByLabel(/your email/i).fill("e2e-ai-audit@example.com");
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 2 — business + focus.
    await expect(page.locator("body")).toContainText(/step 2 of 5/i);
    await page.getByLabel(/what is your business/i).fill("agency");
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 3 — engines (optional).
    await expect(page.locator("body")).toContainText(/step 3 of 5/i);
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 4 — pains (at least one).
    await expect(page.locator("body")).toContainText(/step 4 of 5/i);
    await page.getByRole("button", { name: /cannot produce enough content/i }).click();
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 5 — tools in use + the $49 button (first-person CTA).
    await expect(page.locator("body")).toContainText(/step 5 of 5/i);
    const buy = page.getByRole("button", { name: /get my ai stack for \$49/i });
    await expect(buy).toBeEnabled();
    await buy.click();

    // Dev-unlock (no Stripe keys) → /ai-audit/:token?dev_unlock=1 → delivery.
    await expect(page).toHaveURL(/\/ai-audit\/.+dev_unlock=1/, { timeout: 20_000 });
    await expect(page.locator("body")).toContainText(/your ai audit stack result|no clear niche fit yet/i, { timeout: 60_000 });
    // The honest limit + the ladder into OrganicPosts and the free GEO test.
    await expect(page.locator("body")).toContainText(/the size of the full picture/i);
    await expect(page.getByRole("link", { name: /full ai audit stack/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /free geo test/i })).toBeVisible();
  });
});
