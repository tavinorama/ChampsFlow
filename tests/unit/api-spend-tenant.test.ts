/**
 * D8e — api_spend.tenant_id: "which customer is unprofitable" becomes
 * answerable. The column lands with migration 20260817000001 (founder-gated);
 * until then recordSpend must step down gracefully — exactly like the measured
 * columns' 42703 fallback — never dropping the row.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { recordSpend, _resetApiSpendStateForTests } from "../../packages/llm/src/api-spend";
import { logger } from "../../packages/shared/src/logger";

function pgError(code: string, message = `pg error ${code}`): Error & { code: string } {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

describe("recordSpend — tenant_id attribution, tolerant of the column being absent", () => {
  beforeEach(() => {
    _resetApiSpendStateForTests();
    vi.restoreAllMocks();
  });

  it("with the column present: one INSERT carrying tenant_id as $10, tenantRecorded=true", async () => {
    const calls: Array<{ q: string; p: unknown[] }> = [];
    const exec = async (q: string, p: unknown[]) => {
      calls.push({ q, p });
      return undefined;
    };
    const r = await recordSpend(exec, { op: "audit", engine: "openai", estCents: 3, ref: "a1", tenantId: "t-1" });
    expect(r.ok).toBe(true);
    expect(r.tenantRecorded).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.q).toContain("tenant_id");
    expect(calls[0]!.p[9]).toBe("t-1");
  });

  it("without tenantId (free_test) the tenant column is never touched", async () => {
    const calls: string[] = [];
    const exec = async (q: string) => {
      calls.push(q);
      return undefined;
    };
    const r = await recordSpend(exec, { op: "free_test", estCents: 18, estSource: "flat" });
    expect(r.tenantRecorded).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("tenant_id");
  });

  it("42703 naming tenant_id (migration not applied) → retries the measured INSERT without it, warns ONCE, row kept", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const calls: string[] = [];
    const exec = async (q: string) => {
      calls.push(q);
      if (q.includes("tenant_id")) throw pgError("42703", 'column "tenant_id" of relation "api_spend" does not exist');
      return undefined;
    };
    const r = await recordSpend(exec, { op: "pages_generate", engine: "kimi", estCents: 0, estSource: "flat", ref: "s", tenantId: "t-2" });
    expect(r.ok).toBe(true);
    expect(r.tenantRecorded).toBe(false);
    expect(r.legacy).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("measured_cost_cents");
    expect(calls[1]).not.toContain("tenant_id");

    await recordSpend(exec, { op: "audit", estCents: 1, tenantId: "t-2" });
    expect(warn.mock.calls.filter((c) => c[0] === "api_spend_tenant_column_absent")).toHaveLength(1);
  });

  it("both migrations absent → tenant INSERT 42703 → measured INSERT 42703 → legacy row", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    const calls: string[] = [];
    const exec = async (q: string) => {
      calls.push(q);
      if (q.includes("measured_cost_cents")) throw pgError("42703", 'column "measured_cost_cents" of relation "api_spend" does not exist');
      return undefined;
    };
    const r = await recordSpend(exec, { op: "audit", estCents: 2, tenantId: "t-3" });
    expect(r.ok).toBe(true);
    expect(r.legacy).toBe(true);
    expect(r.tenantRecorded).toBe(false);
    expect(calls).toHaveLength(3);
    expect(calls[2]).toBe("INSERT INTO api_spend (op, est_cost_cents) VALUES ($1, $2)");
  });

  it("a non-42703 error on the tenant INSERT is reported (ok=false), never thrown", async () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const exec = async () => {
      throw pgError("57P01");
    };
    const r = await recordSpend(exec, { op: "audit", estCents: 2, tenantId: "t-4" });
    expect(r.ok).toBe(false);
    expect(error).toHaveBeenCalledWith("api_spend_insert_failed", expect.objectContaining({ op: "audit" }));
  });
});
