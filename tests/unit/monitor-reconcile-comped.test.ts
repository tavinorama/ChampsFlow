/**
 * D8b — weekly monitoring reconcile includes founder-granted (comped) plans:
 * tenants.plan_tier on an eligible tier with NO active billing_subscriptions
 * row. The comped path is visible (`monitor_reconcile_comped` log line) and
 * never enables a free tenant.
 */
import { describe, it, expect, vi } from "vitest";
import { classifyMonitoringEligibility } from "../../apps/worker/src/jobs/monitor-reconcile";

const TIERS = ["growth", "agency"] as const;

describe("classifyMonitoringEligibility", () => {
  it("active paid subscription → 'subscription'", () => {
    expect(classifyMonitoringEligibility(true, "growth", TIERS)).toBe("subscription");
    expect(classifyMonitoringEligibility(true, null, TIERS)).toBe("subscription");
  });
  it("comped growth/agency (plan_tier set, no active row) → 'comped'", () => {
    expect(classifyMonitoringEligibility(false, "growth", TIERS)).toBe("comped");
    expect(classifyMonitoringEligibility(false, "agency", TIERS)).toBe("comped");
  });
  it("free / unknown / null tier with no subscription → not eligible", () => {
    expect(classifyMonitoringEligibility(false, "free", TIERS)).toBeNull();
    expect(classifyMonitoringEligibility(false, null, TIERS)).toBeNull();
    expect(classifyMonitoringEligibility(false, "starter", TIERS)).toBeNull();
  });
});

describe("reconcileWeeklyMonitoring — comped brands are scheduled AND logged", () => {
  it("logs monitor_reconcile_comped per comped brand and counts it in the summary", async () => {
    vi.resetModules();
    const added: unknown[] = [];
    vi.doMock("bullmq", () => ({
      Queue: class {
        async add(name: string, data: unknown, opts: unknown) {
          added.push({ name, data, opts });
        }
      },
    }));
    vi.doMock("ioredis", () => ({
      default: class {
        on() {}
      },
    }));
    const { logger } = await import("../../packages/shared/src/logger");
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const { reconcileWeeklyMonitoring } = await import("../../apps/worker/src/jobs/monitor-reconcile");

    const rows = [
      { id: "b-sub", tenant_id: "t-1", region: "US", monitoring_enabled: true, via: "subscription" },
      { id: "b-comp", tenant_id: "t-2", region: "EU", monitoring_enabled: false, via: "comped" },
    ];
    const updates: string[] = [];
    // Tagged-template fake: SELECT → rows; UPDATE → record.
    const sql = (async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (/SELECT b\.id/.test(text)) return rows;
      if (/UPDATE brands/.test(text)) {
        updates.push(text);
        return [];
      }
      return [];
    }) as unknown as import("postgres").Sql;

    await reconcileWeeklyMonitoring(sql);

    expect(added).toHaveLength(2);
    expect(updates).toHaveLength(1); // only the comped brand was still OFF
    const comped = info.mock.calls.filter((c) => c[0] === "monitor_reconcile_comped");
    expect(comped).toHaveLength(1);
    expect(comped[0]![1]).toMatchObject({ brand_id: "b-comp", tenant_id: "t-2" });
    const done = info.mock.calls.find((c) => c[0] === "monitor_reconcile_done");
    expect(done?.[1]).toMatchObject({ eligible: 2, comped: 1, newly_enabled: 1 });
    vi.doUnmock("bullmq");
    vi.doUnmock("ioredis");
  });
});
