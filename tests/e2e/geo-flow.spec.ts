/**
 * geo-flow.spec.ts — E2E for the GEO product (Ozvor)
 *
 * The canonical customer journey, end to end, against a running stack:
 *   landing → how-it-works → create brand → run audit → score + breakdown
 *   (vectors, evidence, competitors, Reddit, entity) → generate plan →
 *   accept a task → draft content → approve it.
 *
 * Run against the local Docker stack:
 *   E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/geo-flow.spec.ts --project=chromium-desktop
 *
 * Requirements: stack running with DEV_AUTH_BYPASS=1 on the api (local/dev
 * only) and mock providers (no keys) — the flow is identical in live mode.
 * The older specs in this directory cover the archived social-scheduling
 * product; this file is the active product's journey.
 */
import { test, expect } from "@playwright/test";

const BRAND = `E2E Brand ${Date.now()}`;

test.describe("GEO journey — audit to approved draft", () => {
  test("landing page presents the GEO offer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    // Core positioning must be present (Google-aligned, AI-search wording).
    await expect(page.locator("body")).toContainText(/AI/);
    await expect(page.locator("body")).toContainText(/Ozvor/i);
  });

  test("how-it-works explains the system and the Google alignment", async ({ page }) => {
    await page.goto("/how-it-works");
    await expect(page.getByRole("heading", { name: /From invisible to cited/i })).toBeVisible();
    // The four moves, named. These are server rendered on purpose, so they hold
    // with JavaScript off and for a crawler — the film above them does not.
    for (const move of [/Audit/i, /Benchmark/i, /Plan & publish/i, /Monitor/i]) {
      await expect(page.locator("body")).toContainText(move);
    }
    // What the score is made of. The old assertions here named a "Authority &
    // Perception" vector and a Google-guidance section that the page dropped
    // when the score was split into three; they could not pass again.
    await expect(page.locator("body")).toContainText(/Visibility/i);
    await expect(page.locator("body")).toContainText(/Citation Readiness/i);
    await expect(page.locator("body")).toContainText(/Execution/i);
  });

  // BLOCKED (2026-07-29): needs a signed-in user. E2E cannot sign one in — see
  // the note in draft-generate-approve-schedule.spec.ts. Un-fixme together with
  // the rest of the authed cluster once the web app has a test session shim.
  test.fixme("full flow: create brand → audit → breakdown → plan → draft → approve", async ({ page }) => {
    test.setTimeout(180_000); // audit + plan + draft round-trips

    // 1. Create the brand (form uses accessible labels, not placeholders).
    await page.goto("/brands");
    await page.getByLabel(/brand name/i).fill(BRAND);
    await page.getByLabel(/website domain/i).fill("example.com");
    await page.getByLabel(/^category/i).fill("CRM");
    await page.getByRole("button", { name: /add brand/i }).click();
    await expect(page.locator("body")).toContainText(BRAND, { timeout: 15_000 });

    // 2. Run the audit from the brand row (POSTs + navigates to the brand page).
    const row = page.locator("li").filter({ hasText: BRAND });
    await row.getByRole("button", { name: /run audit/i }).click();
    await expect(page).toHaveURL(/\/brands\//, { timeout: 15_000 });

    // 3. Wait for the score ring (audit completes in mock mode in seconds).
    await expect(page.locator("body")).toContainText(/Overall Ozvor AI Visibility Score/i, { timeout: 120_000 });

    // 4. Breakdown — expand vectors via their unique hints.
    // Brand vector → Reddit deep-dive + knowledge-graph panels (C5/C7).
    await page.getByText(/Entity authority & presence/i).click();
    await expect(page.locator("body")).toContainText(/the #1 source AI cites/i, { timeout: 10_000 });
    await expect(page.locator("body")).toContainText(/Knowledge-graph entity/i);
    // AI vector → sentiment + per-prompt evidence.
    await page.getByText(/Are you cited in AI answers/i).click();
    await expect(page.locator("body")).toContainText(/Brand perception/i);
    await expect(page.locator("body")).toContainText(/Evidence — every prompt/i);

    // 5. Generate the GEO plan and accept the first recommendation.
    await page.getByRole("button", { name: /generate plan|regenerate plan/i }).click();
    await expect(page.locator("body")).toContainText(/Week \d/i, { timeout: 60_000 });
    // DELIBERATELY guarded (#140 triage): plan recommendations can arrive
    // already accepted from a prior run of this flow, in which case no Accept
    // button renders — its absence is a valid state, not a failure. The plan
    // itself was asserted above (Week N), which is what this step depends on.
    const accept = page.getByRole("button", { name: /^accept$/i }).first();
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
    }

    // 6. Content Studio — draft a FAQ and approve it (AI label must persist).
    const studio = page.locator("section").filter({ hasText: "Content Studio" });
    await studio.getByRole("combobox").selectOption("faq");
    await studio.getByPlaceholder(/topic/i).fill("How does the audit work?");
    await studio.getByRole("button", { name: /generate draft/i }).click();
    await expect(studio.getByText(/AI-generated/i).first()).toBeVisible({ timeout: 60_000 });
    await studio.getByRole("button", { name: /^approve$/i }).first().click();
    await expect(studio.getByText(/APPROVED/i).first()).toBeVisible({ timeout: 15_000 });
  });

  // BLOCKED (2026-07-29): needs a signed-in user. E2E cannot sign one in — see
  // the note in draft-generate-approve-schedule.spec.ts.
  test.fixme("dashboard shows the brand with monitoring toggle (flywheel)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText(BRAND, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/monitor/i);
  });
});
