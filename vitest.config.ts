/**
 * Vitest root configuration — Organic Posts
 *
 * Covers: tests/unit, tests/security, tests/integration
 * E2E (Playwright) is configured separately in playwright.config.ts
 *
 * Coverage thresholds (v8 provider) enforced on:
 *   - packages/llm      (LLM Gateway / AnthropicAdapter)
 *   - packages/shared   (crypto, logger)
 *   - apps/api/src/auth (middleware, oauth-state)
 *   - apps/api/src/integrations (LinkedIn, Instagram, Facebook adapters)
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",

    include: [
      "tests/unit/**/*.test.ts",
      "tests/security/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/ai/**/*.spec.ts",
    ],

    exclude: [
      "tests/e2e/**",
      "**/node_modules/**",
    ],

    // Per-test setup: environment variables + container readiness checks
    setupFiles: ["tests/setup/vitest-setup.ts"],

    // Reporters: human-readable in dev, JSON for CI artefact upload
    reporters: process.env["CI"]
      ? ["default", "json"]
      : ["default"],

    outputFile: process.env["CI"]
      ? { json: "coverage/vitest-report.json" }
      : undefined,

    // Timeouts
    testTimeout: 30_000,
    hookTimeout: 30_000,

    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      // The coverage gate enforces high coverage on the DETERMINISTIC core
      // (scoring math, classifiers, rules engines, the SSRF blocklist, routing,
      // crypto). Network/IO adapters (LLM providers, SERP/Wikidata fetchers,
      // site crawlers, email templates) are validated by integration/e2e tests
      // and manual Docker verification, not this unit-coverage gate — their live
      // branches can't run without a live network. Listing the gated files
      // explicitly keeps the threshold meaningful instead of diluted to ~30%.
      include: [
        "packages/llm/src/scoring.ts",
        "packages/llm/src/sentiment.ts",
        "packages/llm/src/citation-parser.ts",
        "packages/llm/src/competitor-detect.ts",
        "packages/llm/src/strategy-generator.ts",
        "packages/llm/src/ssrf-guard.ts",
        "packages/llm/src/providers/routing.ts",
        "packages/shared/src/crypto.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "**/node_modules/**",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
    },
  },

  resolve: {
    alias: {
      "@organic-posts/shared": path.resolve("packages/shared/src/index.ts"),
      "@organic-posts/llm": path.resolve("packages/llm/src/index.ts"),
      "@organic-posts/db": path.resolve("packages/db"),
    },
  },
});
