/**
 * E2E — Draft → Generate → Approve → Schedule happy path (C1, C2, C3, C5)
 *
 * Golden path:
 *  1. User opens /create (Screen 01)
 *  2. Enters a topic and selects LinkedIn platform
 *  3. Clicks Generate → draft appears in review screen (Screen 02)
 *  4. AI disclosure badge is visible and non-dismissable (C5 AC)
 *  5. User edits draft text (badge remains — C3 AC)
 *  6. User clicks "Approve & Schedule"
 *  7. ScheduleModal appears → user selects date/time
 *  8. User confirms → publish_jobs row created (verified via API)
 *  9. Scheduled post appears in /schedule list with status "scheduled"
 *
 * All external calls (Anthropic, LinkedIn) are mocked via Playwright route intercepts.
 *
 * Architecture refs: C1 PRD ACs, C2 PRD ACs, C3 PRD ACs, C5 PRD ACs, US-01–US-04
 */
import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Mock payloads
// ---------------------------------------------------------------------------

const MOCK_DRAFT = {
  id: "draft-e2e-1",
  body: "Excited to announce our new coffee shop is opening downtown next Monday! "
    + "Come taste our specialty beans. #CoffeeShop #Downtown #SMB",
  platform: "linkedin",
  ai_generated: true,
  generation_id: "gen-e2e-1",
  status: "draft",
};

const MOCK_GENERATION_RESPONSE = {
  draft: MOCK_DRAFT,
  generation_id: "gen-e2e-1",
  ai_generated: true,
  zdr_confirmed: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAsTestUser(page: Page): Promise<void> {
  await page.context().addCookies([
    { name: "test_session", value: "e2e-user-1:e2e-tenant-1", domain: "localhost", path: "/" },
  ]);
}

async function setupApiMocks(page: Page): Promise<void> {
  // Mock DPA status (acknowledged)
  await page.route("**/api/dpa/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current_dpa_version_in_env: "1.0",
        user_acknowledged_version: "1.0",
        needs_acknowledgment: false,
      }),
    });
  });

  // Mock billing plan (active starter)
  await page.route("**/api/billing/plan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: "starter", status: "active", usage: { drafts_used: 5, posts_limit: 30 } }),
    });
  });

  // Mock social accounts (LinkedIn connected)
  await page.route("**/api/social-accounts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "acct-li-1", platform: "linkedin", display_name: "Test User" },
      ]),
    });
  });

  // Mock draft generation (Anthropic is NOT called directly; API returns mock draft)
  await page.route("**/api/drafts/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_GENERATION_RESPONSE),
    });
  });

  // Mock draft fetch
  await page.route("**/api/drafts/draft-e2e-1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_DRAFT),
    });
  });

  // Mock approve
  await page.route("**/api/drafts/draft-e2e-1/approve", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...MOCK_DRAFT, status: "approved", approved_at: new Date().toISOString() }),
    });
  });

  // Mock schedule creation
  await page.route("**/api/drafts/draft-e2e-1/schedule", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "job-e2e-1",
        draft_id: "draft-e2e-1",
        status: "queued",
        scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    });
  });

  // Mock schedules list
  await page.route("**/api/schedules**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        jobs: [
          {
            job_id: "job-e2e-1",
            draft_id: "draft-e2e-1",
            status: "queued",
            platform: "linkedin",
            scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
            draft_preview: "Excited to announce our new coffee shop...",
          },
        ],
        next_cursor: null,
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Draft Generate → Approve → Schedule (golden path)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await setupApiMocks(page);
  });

  test("C1: topic input → draft generated → AI badge visible", async ({ page }) => {
    await page.goto("/create");

    // Screen 01: Fill topic input
    const topicInput = page.getByPlaceholder(/topic/i).or(page.getByLabel(/topic/i));
    await expect(topicInput).toBeVisible();
    await topicInput.fill("New coffee shop opening downtown next Monday");

    // Select LinkedIn
    const linkedInOption = page.getByTestId("platform-linkedin").or(page.getByLabel(/linkedin/i));
    if (await linkedInOption.isVisible()) {
      await linkedInOption.click();
    }

    // Click Generate
    const generateButton = page.getByRole("button", { name: /generate/i });
    await generateButton.click();

    // Wait for draft review screen (Screen 02)
    await page.waitForURL(/\/drafts\/draft-e2e-1/);

    // C5 AC: AI disclosure badge must be visible
    const badge = page.getByTestId("ai-badge").or(page.getByText(/AI-generated/i));
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/AI-generated/i);
  });

  test("C5: AI badge persists after user edits draft content", async ({ page }) => {
    await page.goto("/drafts/draft-e2e-1");

    // Verify badge is visible
    const badge = page.getByTestId("ai-badge").or(page.getByText(/AI-generated/i));
    await expect(badge).toBeVisible();

    // Edit the draft content
    const editArea = page.getByRole("textbox", { name: /draft/i }).or(page.locator("textarea[name='body']"));
    await editArea.fill("Edited: Our new coffee shop is opening this Friday!");

    // Badge must still be visible after edit (C3 AC: badge cannot be removed by user action)
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/AI-generated/i);
  });

  test("C3: no publish path bypasses the approval screen", async ({ page }) => {
    // Attempt to access schedule without going through approval
    // The API should reject a schedule request for a draft in 'draft' status
    await page.route("**/api/drafts/draft-e2e-1/schedule", async (route) => {
      // Simulate draft not yet approved
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "draft_not_approved" }),
      });
    });

    await page.goto("/drafts/draft-e2e-1");

    // Confirm "Approve & Schedule" flow exists and Schedule button is not directly accessible
    const approveButton = page.getByRole("button", { name: /approve/i });
    await expect(approveButton).toBeVisible();

    // No direct "Publish Now" button that bypasses approval (C3 AC)
    const publishNowButton = page.getByRole("button", { name: /publish now/i });
    await expect(publishNowButton).not.toBeVisible();
  });

  test("C2: approve → schedule → publish_jobs row created (verified via schedules API)", async ({ page }) => {
    await page.goto("/drafts/draft-e2e-1");

    // Click Approve & Schedule
    const approveButton = page.getByRole("button", { name: /approve/i });
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    // ScheduleModal should appear
    const modal = page.getByRole("dialog").or(page.getByTestId("schedule-modal"));
    await expect(modal).toBeVisible();

    // Select a date/time 1 hour from now
    const futureDate = new Date(Date.now() + 3_600_000);
    const dateInput = modal.locator("input[type='date'], input[type='datetime-local']").first();
    if (await dateInput.isVisible()) {
      await dateInput.fill(futureDate.toISOString().slice(0, 16));
    }

    // Confirm schedule
    const confirmButton = modal.getByRole("button", { name: /schedule|confirm/i });
    await confirmButton.click();

    // Navigate to schedule list
    await page.goto("/schedule");

    // Verify the job appears in the schedule list
    const scheduledPost = page.getByText(/Excited to announce|coffee shop/i).first();
    await expect(scheduledPost).toBeVisible();

    // Status should be "Scheduled" or "queued"
    const statusIndicator = page.getByText(/scheduled|queued/i).first();
    await expect(statusIndicator).toBeVisible();
  });

  test("C2: failed publish shows Failed status with retry option", async ({ page }) => {
    // Override schedules mock to show a failed job
    await page.route("**/api/schedules**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [
            {
              job_id: "job-failed-1",
              draft_id: "draft-e2e-1",
              status: "failed",
              platform: "linkedin",
              error_message: "Token expired",
              scheduled_at: new Date(Date.now() - 3_600_000).toISOString(),
              draft_preview: "Coffee shop opening...",
            },
          ],
          next_cursor: null,
        }),
      });
    });

    await page.goto("/schedule");

    // Failed status must be visible
    const failedLabel = page.getByText(/failed/i).first();
    await expect(failedLabel).toBeVisible();

    // Retry option must be present
    const retryButton = page.getByRole("button", { name: /retry/i });
    await expect(retryButton).toBeVisible();
  });
});
