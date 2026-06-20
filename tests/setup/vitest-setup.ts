/**
 * Vitest global setup — runs before each test file
 *
 * Responsibilities:
 *  1. Set required environment variables for unit/integration tests
 *  2. Check POSTGRES_TEST_URL and REDIS_TEST_URL availability (skips DB tests if absent)
 *  3. Does NOT start real containers — CI uses GitHub Actions service containers
 *     For local dev: docker compose up -d postgres redis
 */

// Minimal test environment variables
// Real secrets are never committed — CI injects these via GitHub Actions secrets
process.env["NODE_ENV"] = "test";
process.env["OAUTH_TOKEN_KEY"] = "a".repeat(64); // 32-byte AES-256 key (hex) for tests
process.env["DPA_CURRENT_VERSION"] ??= "1.0";
process.env["DEFAULT_TENANT_REGION"] ??= "us";

// Allow integration tests to skip when no database is available
// Tests conditionally skip using: const skip = !process.env['POSTGRES_TEST_URL'];
// CI sets POSTGRES_TEST_URL via postgres service container

export {};
