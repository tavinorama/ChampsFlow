/**
 * system-capabilities.test.ts — the PUBLIC (no-auth) GET /api/system/capabilities
 * response must never disclose internal env var names (security-review-2026-06
 * Finding 3, Medium — attacker reconnaissance via env-name disclosure; fix due
 * at Gate 7). Every `key` field is a customer-facing label ("Supabase",
 * "SERP provider"), never the variable name ("STRIPE_SECRET_KEY").
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { registerSystemRoutes } from "../../apps/api/src/routes/system";
import type { PostgresClient } from "../../apps/api/src/routes/social-accounts";

// The capabilities route never touches the db (platform-level, no tenant data),
// so a stub client is enough to register the routes.
const stubDb = {} as PostgresClient;

async function fetchCapabilities() {
  const app = new Hono();
  registerSystemRoutes(app, stubDb);
  const res = await app.request("/api/system/capabilities");
  return { res, body: await res.json() };
}

describe("GET /api/system/capabilities (public)", () => {
  it("responds 200 with the transparency shape the web pages consume", async () => {
    const { res, body } = await fetchCapabilities();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.stages)).toBe(true);
    expect(body.platform.auth.connected).toBeTypeOf("boolean");
    expect(body.platform.billing.connected).toBeTypeOf("boolean");
    expect(["live", "demo"]).toContain(body.mode);
  });

  it("platform block uses friendly labels, not env var names", async () => {
    const { body } = await fetchCapabilities();
    expect(body.platform.auth.key).toBe("Supabase");
    expect(body.platform.billing.key).toBe("Stripe");
  });

  it("never discloses any internal env var name anywhere in the body", async () => {
    const { body } = await fetchCapabilities();
    const raw = JSON.stringify(body);
    // The exact names the route reads via present() — none may leak.
    const envNames = [
      "ANTHROPIC_API_KEY",
      "AWS_ACCESS_KEY_ID",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "PERPLEXITY_API_KEY",
      "SERP_API_KEY",
      "LINKEDIN_CLIENT_ID",
      "INSTAGRAM_CLIENT_ID",
      "REDDIT_CLIENT_ID",
      "SUPABASE_URL",
      "STRIPE_SECRET_KEY",
    ];
    for (const name of envNames) {
      expect(raw, `env var name "${name}" leaked in public response`).not.toContain(name);
    }
    // Regression guard for future additions: no UPPER_SNAKE_CASE token at all.
    expect(raw).not.toMatch(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/);
  });
});
