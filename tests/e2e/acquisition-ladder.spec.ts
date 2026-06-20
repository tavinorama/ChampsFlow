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

test.describe("Acquisition ladder — Invisibility Test → Get-Cited Kit", () => {
  test("free test runs and shows a scorecard with a Kit CTA", async ({ page }) => {
    await page.goto("/test");
    await expect(page.getByRole("heading", { name: /invisible to AI/i })).toBeVisible();
    await page.getByLabel(/your brand/i).fill("Demo CRM");
    await page.getByLabel(/a competitor/i).fill("HubSpot");
    await page.getByLabel(/your category/i).fill("CRM");
    await page.getByRole("button", { name: /run my free test/i }).click();

    // Scorecard: a verdict + the per-engine table + the Kit CTA.
    await expect(page.locator("body")).toContainText(/cited|invisible/i, { timeout: 30_000 });
    await expect(page.getByRole("link", { name: /get the kit/i })).toBeVisible();
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
    await expect(page.locator("body")).toContainText(/TrustIndex Score/i);
    await expect(page.locator("body")).toContainText(/top 3 fixes/i);
    await expect(page.locator("body")).toContainText(/ready-to-publish drafts/i);
    // Three drafts with the persistent AI label.
    await expect(page.getByText(/AI-generated draft/i).first()).toBeVisible();
    await expect(page.locator("body")).toContainText(/Where to publish/i);
  });
});
