/**
 * dpa-gate-fail-closed.test.ts — the DPA acknowledgment gate must FAIL CLOSED
 * in production when DPA_CURRENT_VERSION is unset (Hermes full QA audit #261,
 * P2). It used to silently allow every user through (fail-open compliance
 * bypass). Boot now refuses to start in prod without the var (config.ts), and
 * this middleware is the defense-in-depth backstop.
 */
import { describe, it, expect, afterEach } from "vitest";
import { requireDpaAcknowledged } from "../../apps/api/src/routes/dpa";

interface JsonCall {
  body: { code?: string };
  status: number;
}

function fakeCtx() {
  const calls: { json: JsonCall | null } = { json: null };
  const ctx = {
    get: (k: string) => (k === "auth" ? { tenantId: "t1", userId: "u1" } : undefined),
    req: { path: "/api/drafts/generate" },
    json: (body: JsonCall["body"], status: number) => {
      calls.json = { body, status };
      return { body, status };
    },
  };
  return { ctx, calls };
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_DPA = process.env.DPA_CURRENT_VERSION;

describe("requireDpaAcknowledged — fail-closed on missing env in production", () => {
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_DPA === undefined) delete process.env.DPA_CURRENT_VERSION;
    else process.env.DPA_CURRENT_VERSION = ORIGINAL_DPA;
  });

  it("production + no DPA_CURRENT_VERSION → 503 and does NOT call next", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.DPA_CURRENT_VERSION;

    const db = {} as unknown as Parameters<typeof requireDpaAcknowledged>[0];
    const { ctx, calls } = fakeCtx();
    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requireDpaAcknowledged(db)(ctx as any, next as any);

    expect(nextCalled).toBe(false); // never silently bypass the DPA gate in prod
    expect(calls.json?.status).toBe(503);
    expect(calls.json?.body.code).toBe("DPA_GATE_UNAVAILABLE");
  });

  it("dev + no DPA_CURRENT_VERSION → allows through (local flows keep working)", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.DPA_CURRENT_VERSION;

    const db = {} as unknown as Parameters<typeof requireDpaAcknowledged>[0];
    const { ctx } = fakeCtx();
    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requireDpaAcknowledged(db)(ctx as any, next as any);
    expect(nextCalled).toBe(true);
  });
});
