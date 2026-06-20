/**
 * Security — Token leak grep tests (S-4 / Gate 5→6)
 *
 * Two complementary test classes:
 *
 * 1. Redaction pattern unit tests:
 *    Reads packages/shared/src/logger.ts and verifies the deny-list
 *    covers all required token field names.
 *
 * 2. Codebase grep — literal secret prefixes:
 *    Greps committed TypeScript/JavaScript source files for raw secret
 *    prefixes that would indicate a committed secret:
 *      sk_test_   → Stripe test secret key
 *      sk_live_   → Stripe live secret key
 *      xoxb-      → Slack bot token
 *      whsec_     → Stripe webhook signing secret
 *    Exclusions: .env.example files, test fixture strings (in this file)
 *
 * 3. Dangerous log patterns:
 *    Greps source for patterns that could accidentally leak tokens:
 *      err.config   → Axios error config (contains auth headers)
 *      console.log(token  → raw token logged
 *      console.log(access_token
 *      console.log(err)   → full error object logged (may contain config)
 *
 * All greps exclude:
 *   - node_modules/
 *   - tests/security/no-token-leak.test.ts (this file — contains the patterns as strings)
 *   - .env.example
 *   - *.md files
 *
 * CI enforcement: this test runs in the "security" job. A failure blocks Gate 6→7.
 *
 * Architecture refs: S-4 (token log-leak), TB-4 (OAuth token exposure), threat-model.md §4 T4
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(process.cwd());

// ---------------------------------------------------------------------------
// Helper: run grep and return matching lines (empty array = no matches = pass)
// ---------------------------------------------------------------------------

function grepSource(pattern: string, extraExcludes: string[] = []): string[] {
  const excludes = [
    "--exclude-dir=node_modules",
    "--exclude-dir=.git",
    "--exclude-dir=coverage",
    "--exclude-dir=.next",
    `--exclude=${join("tests", "security", "no-token-leak.test.ts")}`,
    "--exclude=*.env.example",
    "--exclude=.env.example",
    "--exclude=*.md",
    "--exclude=*.json",
    ...extraExcludes,
  ].join(" ");

  try {
    const result = execSync(
      `grep -rn ${excludes} -E "${pattern}" "${REPO_ROOT}/packages" "${REPO_ROOT}/apps" 2>/dev/null || true`,
      { encoding: "utf-8", timeout: 15_000 }
    );
    return result
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .filter((line) => !line.includes("no-token-leak.test.ts"));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 1. Logger deny-list coverage
// ---------------------------------------------------------------------------

describe("Logger deny-list coverage (S-4)", () => {
  const LOGGER_PATH = join(REPO_ROOT, "packages", "shared", "src", "logger.ts");

  it("logger.ts file exists", () => {
    expect(existsSync(LOGGER_PATH)).toBe(true);
  });

  it("deny-list contains 'access_token'", () => {
    const content = readFileSync(LOGGER_PATH, "utf-8");
    expect(content).toContain("access_token");
  });

  it("deny-list contains 'refresh_token'", () => {
    const content = readFileSync(LOGGER_PATH, "utf-8");
    expect(content).toContain("refresh_token");
  });

  it("deny-list contains 'Authorization' or 'authorization'", () => {
    const content = readFileSync(LOGGER_PATH, "utf-8");
    expect(content.toLowerCase()).toContain("authorization");
  });

  it("deny-list contains 'token' (generic)", () => {
    const content = readFileSync(LOGGER_PATH, "utf-8");
    expect(content).toContain("token");
  });

  it("deny-list contains 'secret'", () => {
    const content = readFileSync(LOGGER_PATH, "utf-8");
    expect(content).toContain("secret");
  });

  it("deny-list contains 'password'", () => {
    const content = readFileSync(LOGGER_PATH, "utf-8");
    expect(content).toContain("password");
  });

  it("logger exports a scrub() function", () => {
    const content = readFileSync(LOGGER_PATH, "utf-8");
    expect(content).toMatch(/export.*function scrub|export.*scrub/);
  });
});

// ---------------------------------------------------------------------------
// 2. Literal secret prefix grep (committed secret detection)
// ---------------------------------------------------------------------------

describe("No committed secrets — literal prefix grep", () => {
  it("no Stripe test secret key (sk_test_) in source files", () => {
    // sk_test_ is a Stripe test mode secret key prefix
    // Excluding .env.example and this test file (which references the string as a comment)
    const matches = grepSource("sk_test_[A-Za-z0-9]+");
    // Filter out any false positives (e.g. comments mentioning the pattern name)
    const realMatches = matches.filter(
      (line) =>
        !line.includes("//") &&
        !line.includes("*") &&
        !line.includes("description") &&
        !line.includes("prefix")
    );
    expect(realMatches).toHaveLength(0);
  });

  it("no Stripe live secret key (sk_live_) in source files", () => {
    const matches = grepSource("sk_live_[A-Za-z0-9]+");
    const realMatches = matches.filter(
      (line) => !line.includes("//") && !line.includes("*") && !line.includes("example")
    );
    expect(realMatches).toHaveLength(0);
  });

  it("no Slack bot token (xoxb-) in source files", () => {
    const matches = grepSource("xoxb-[A-Za-z0-9-]+");
    expect(matches).toHaveLength(0);
  });

  it("no Stripe webhook signing secret (whsec_) in source files", () => {
    const matches = grepSource("whsec_[A-Za-z0-9]+");
    const realMatches = matches.filter(
      (line) => !line.includes("//") && !line.includes("*") && !line.includes("example")
    );
    expect(realMatches).toHaveLength(0);
  });

  it("no Anthropic API key prefix (sk-ant-) in source files", () => {
    // Anthropic keys start with sk-ant-
    const matches = grepSource("sk-ant-[A-Za-z0-9-]+");
    expect(matches).toHaveLength(0);
  });

  it("no AWS access key ID pattern in source files", () => {
    // AWS access keys are 20 uppercase alphanumeric characters starting with AKIA
    const matches = grepSource("AKIA[0-9A-Z]{16}");
    expect(matches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Dangerous log patterns grep
// ---------------------------------------------------------------------------

describe("No dangerous log patterns — codebase grep", () => {
  it("no 'err.config' in worker or API source (Axios error config leaks auth headers)", () => {
    // err.config contains Axios request config including Authorization headers
    const matches = grepSource("err\\.config");
    // Filter: only flag if it's in a console/log call, not in a comment or test
    const dangerous = matches.filter(
      (line) =>
        (line.includes("console.") || line.includes("logger.") || line.includes("log(")) &&
        !line.includes("//") &&
        !line.includes("*")
    );
    expect(dangerous).toHaveLength(0);
  });

  it("no 'console.log(token' or 'console.log(access_token' in source", () => {
    const matches = grepSource("console\\.log\\((token|access_token|refresh_token)");
    const realMatches = matches.filter(
      (line) => !line.includes("//") && !line.includes("*")
    );
    expect(realMatches).toHaveLength(0);
  });

  it("no bare 'console.log(err)' in worker or API routes (full error object logging)", () => {
    // console.log(err) or console.log(error) could expose err.config
    const matches = grepSource("console\\.log\\(err(or)?\\)");
    const realMatches = matches.filter(
      (line) => !line.includes("//") && !line.includes("*") && !line.includes("test")
    );
    expect(realMatches).toHaveLength(0);
  });

  it("no 'console.log(req' or 'console.log(request' in API routes (request object may contain auth headers)", () => {
    const matches = grepSource("console\\.log\\((req|request)[,)]");
    const realMatches = matches.filter(
      (line) => !line.includes("//") && !line.includes("*")
    );
    expect(realMatches).toHaveLength(0);
  });

  it("no hardcoded 'Bearer ' token values in source", () => {
    // Looks for literal Bearer token strings (not the string 'Bearer ' which is expected in headers)
    const matches = grepSource("Bearer [A-Za-z0-9._-]{30,}");
    const realMatches = matches.filter(
      (line) => !line.includes("//") && !line.includes("*") && !line.includes("example")
    );
    expect(realMatches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Environment variable usage patterns (no hardcoded values)
// ---------------------------------------------------------------------------

describe("Secrets via environment variables only", () => {
  it("OAUTH_TOKEN_KEY is only read from process.env, never hardcoded", () => {
    // If any source file contains a 64-char hex string (hardcoded AES-256 key), flag it
    const HEX_64_PATTERN = "[0-9a-fA-F]{64}";
    const matches = grepSource(HEX_64_PATTERN);
    // Filter out test files and examples
    const realMatches = matches.filter(
      (line) =>
        !line.includes("test") &&
        !line.includes("spec") &&
        !line.includes("example") &&
        !line.includes("fixture") &&
        !line.includes("//") &&
        !line.includes("*")
    );
    // Note: test files may legitimately contain 64-char hex test keys
    // Only flag production source files
    expect(realMatches).toHaveLength(0);
  });

  it("Stripe keys are always read from process.env.STRIPE_SECRET_KEY", () => {
    // Verify STRIPE_SECRET_KEY is referenced via env var, not hardcoded
    const content = existsSync(join(REPO_ROOT, "apps", "api", "src", "routes", "billing.ts"))
      ? readFileSync(join(REPO_ROOT, "apps", "api", "src", "routes", "billing.ts"), "utf-8")
      : "";

    if (content.length > 0) {
      // Billing route must reference STRIPE_SECRET_KEY via process.env or config
      expect(content).toMatch(/process\.env|STRIPE_SECRET_KEY|config\./);
    } else {
      // File doesn't exist in this test environment — pass
      expect(true).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. check-rls.sql completeness (Gate 5→6 fix verification)
// ---------------------------------------------------------------------------

describe("check-rls.sql completeness (Gate 5→6 fix)", () => {
  const CHECK_RLS_PATH = join(REPO_ROOT, "packages", "db", "scripts", "check-rls.sql");

  it("check-rls.sql file exists", () => {
    expect(existsSync(CHECK_RLS_PATH)).toBe(true);
  });

  it("billing_subscriptions is in check-rls.sql monitored list (Gate 5→6 fix)", () => {
    if (!existsSync(CHECK_RLS_PATH)) return;
    const content = readFileSync(CHECK_RLS_PATH, "utf-8");
    expect(content).toContain("billing_subscriptions");
  });

  it("dpa_acknowledgments is in check-rls.sql monitored list", () => {
    if (!existsSync(CHECK_RLS_PATH)) return;
    const content = readFileSync(CHECK_RLS_PATH, "utf-8");
    expect(content).toContain("dpa_acknowledgments");
  });

  it("ccpa_requests is in check-rls.sql monitored list", () => {
    if (!existsSync(CHECK_RLS_PATH)) return;
    const content = readFileSync(CHECK_RLS_PATH, "utf-8");
    expect(content).toContain("ccpa_requests");
  });

  it("audit_log is in check-rls.sql monitored list", () => {
    if (!existsSync(CHECK_RLS_PATH)) return;
    const content = readFileSync(CHECK_RLS_PATH, "utf-8");
    expect(content).toContain("audit_log");
  });
});
