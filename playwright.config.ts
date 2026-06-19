/**
 * Playwright configuration — Organic Posts E2E tests
 *
 * testDir: tests/e2e
 * Projects: Chromium (desktop) + WebKit (mobile viewport)
 * Base URL: http://localhost:3000 (Next.js web app)
 * API base: http://localhost:3001 (Hono API)
 *
 * CI behaviour:
 *  - retries: 2 (reduces flake-driven failures in CI)
 *  - webServer: spins up both apps if not already running
 *  - workers: 1 (serial execution avoids port conflicts in CI)
 *
 * Local dev:
 *  - retries: 0
 *  - Run `npm run dev` first OR let webServer auto-start
 *  - workers: default (parallel)
 */
import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env["CI"];

// E2E_BASE_URL lets the suite run against an already-running stack (e.g. the
// local Docker stack on :3100, or a staging URL) instead of auto-started dev
// servers. When set, webServer auto-start is skipped entirely.
const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:3000";
const externalStack = !!process.env["E2E_BASE_URL"];

export default defineConfig({
  testDir: "tests/e2e",

  // Global test timeout
  timeout: 45_000,

  // Action timeout (click, fill, etc.)
  expect: {
    timeout: 10_000,
  },

  // Retry flaky tests — more in CI
  retries: isCI ? 2 : 0,

  // Serial in CI to avoid resource contention; parallel locally
  workers: isCI ? 1 : undefined,

  // Reporters
  reporter: isCI
    ? [["list"], ["html", { open: "never" }], ["json", { outputFile: "coverage/playwright-report.json" }]]
    : [["list"], ["html"]],

  use: {
    baseURL,

    // All network calls are captured; failures show trace
    trace: isCI ? "on-first-retry" : "retain-on-failure",
    screenshot: "only-on-failure",
    video: isCI ? "retain-on-failure" : "off",

    // Default viewport (desktop)
    viewport: { width: 1280, height: 800 },

    // Do not follow OAuth redirects to real platforms — tests use mocked callbacks
    ignoreHTTPSErrors: false,
  },

  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit-mobile",
      use: {
        ...devices["iPhone 14"],
        // Mobile tests verify WCAG touch targets and responsive layout
      },
    },
  ],

  // Auto-start the dev servers if they are not already running
  // CI: services are started by the workflow before Playwright runs
  // E2E_BASE_URL set: an external stack is already serving — never auto-start
  webServer: (isCI || externalStack)
    ? undefined
    : [
        {
          command: "npm run dev --workspace=apps/web",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 60_000,
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          command: "npm run dev --workspace=apps/api",
          url: "http://localhost:3001/healthz",
          reuseExistingServer: true,
          timeout: 60_000,
          stdout: "pipe",
          stderr: "pipe",
        },
      ],
});
