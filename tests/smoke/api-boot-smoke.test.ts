/**
 * Fast API boot / route-wiring smoke (issue #143).
 *
 * The required-on-every-PR fast gate that replaces long Playwright E2E as the
 * merge-latency signal. It boots the real Hono route layer IN PROCESS (via
 * `app.request`, no server listen, no build, no browser, no DB) and proves the
 * three things a "does it boot" check should:
 *
 *   1. The app assembles and routes resolve (unknown path → 404, not a crash).
 *   2. Auth middleware is wired on a protected route (no token → 401), and it
 *      short-circuits BEFORE any DB access (the mock db throws if touched).
 *   3. Requests flow through the Hono stack end to end without throwing.
 *
 * Runs in well under a second; the CI "Smoke" job finishes in ~1 min including
 * npm ci. Full browser E2E is now advisory (manual / nightly / path-filtered) —
 * see .github/workflows/e2e.yml and AGENTS.md.
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { registerEngagementRoutes } from "../../apps/api/src/routes/engagements";

// A db that fails loudly if any smoke path actually queries it: the routes we
// probe here (401 unauthenticated, 404 unknown) must never reach the database.
const noDbAllowed = {
  query: async () => {
    throw new Error("smoke: no DB access expected on 401/404 paths");
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

function buildApp(): Hono {
  const app = new Hono();
  registerEngagementRoutes(app, noDbAllowed);
  return app;
}

describe("API boot smoke", () => {
  it("resolves an unknown route to 404 (router is wired, no crash)", async () => {
    const res = await buildApp().request("/definitely-not-a-route");
    expect(res.status).toBe(404);
  });

  it("guards a protected route with 401 when unauthenticated (auth middleware wired)", async () => {
    const res = await buildApp().request("/api/engagements");
    // 401 Unauthorized — requireAuth short-circuits before the handler/DB.
    expect(res.status).toBe(401);
  });

  it("never leaks a stack trace or secret in the auth-failure body", async () => {
    const res = await buildApp().request("/api/engagements");
    const text = await res.text();
    expect(text).not.toMatch(/at \/|node_modules|secret|sk_live|whsec_/i);
  });
});
