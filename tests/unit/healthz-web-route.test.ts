/**
 * Fast smoke test for the public web /healthz probe (issue #145).
 *
 * The handler proxies ozvor.com/healthz → API /healthz. We stub global fetch to
 * exercise each branch without booting the API:
 *   - API ok        → 200, status "ok"
 *   - API degraded  → 503, status "degraded"
 *   - API unreachable (fetch throws / aborts) → 503, fails closed
 *   - never leaks secrets in the payload
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "../../apps/web/src/app/healthz/route";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GET /healthz (web probe)", () => {
  it("returns 200 when the API reports ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ status: "ok", checks: { postgres: "ok", redis: "ok" } }, 200)
      )
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.web).toBe("ok");
    expect(body.api).toBe("ok");
    expect(body.checks).toEqual({ postgres: "ok", redis: "ok" });
    // No cache — always current health.
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 when the API reports degraded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ status: "degraded", checks: { postgres: "ok", redis: "error" } }, 503)
      )
    );
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("degraded");
  });

  it("fails closed with 503 when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.api).toBe("unreachable");
  });

  it("never leaks secrets — only status + component checks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ status: "ok", checks: { postgres: "ok", redis: "ok" } }, 200)
      )
    );
    const res = await GET();
    const raw = JSON.stringify(await res.json());
    // No credentials, tokens, or connection strings in the public payload.
    expect(raw).not.toMatch(/key|secret|token|password|:\/\/[^"]*@/i);
  });
});
