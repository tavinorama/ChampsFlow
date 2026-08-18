/**
 * requireNotProcessingRestricted — GDPR Art. 18 guard, #306 hardening.
 *
 * Before: a DB error made the guard FAIL OPEN ("avoid blocking all users on
 * infra issues") — an infra blip could let a restricted user's data be
 * processed, the one outcome Art. 18 forbids. The guard is mounted ONLY on
 * the restricted-class writes (generate / publish / connect / checkout), so
 * failing CLOSED denies exactly those on error while everything else keeps
 * flowing. These tests drive the real middleware through Hono with a fake db.
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireNotProcessingRestricted } from "../../apps/api/src/auth/middleware";

type Db = Parameters<typeof requireNotProcessingRestricted>[0];

function appWith(db: Db): Hono {
  const app = new Hono();
  // Stand in for requireAuth: the guard reads ctx.get("auth").
  app.use("*", async (c, next) => {
    c.set("auth" as never, { userId: "u1", tenantId: "t1" } as never);
    await next();
  });
  app.post("/api/drafts/generate", requireNotProcessingRestricted(db), (c) => c.json({ ok: true }));
  return app;
}

const dbReturning = (restricted: boolean): Db => ({
  async setTenantId() {},
  async query<T>(sql: string) {
    if (sql.includes("SELECT restricted")) return { rows: [{ restricted } as unknown as T] };
    return { rows: [] };
  },
});

const dbThrowing: Db = {
  async setTenantId() {},
  async query() {
    throw new Error("connection reset");
  },
};

describe("Art. 18 guard (#306)", () => {
  it("passes a non-restricted user through", async () => {
    const res = await appWith(dbReturning(false)).request("/api/drafts/generate", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("blocks a restricted user with 403 processing_restricted", async () => {
    const res = await appWith(dbReturning(true)).request("/api/drafts/generate", { method: "POST" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("processing_restricted");
  });

  it("FAILS CLOSED on a DB error: 503 for this action, never a silent pass-through", async () => {
    const res = await appWith(dbThrowing).request("/api/drafts/generate", { method: "POST" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("restriction_check_unavailable");
  });
});
