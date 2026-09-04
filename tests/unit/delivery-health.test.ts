/**
 * delivery-health.test.ts — audit P0-09.
 *
 * These tests pin the two properties the audit actually asked for:
 *   1. the loop breaking turns the panel amber/red (RELATORIO:142-153);
 *   2. missing data NEVER becomes a zero and NEVER becomes green.
 *
 * Every contract-quality-test name referenced from DELIVERY_CONTRACTS lives in
 * this file; `assertContractsComplete` is enforced below so a future indicator
 * cannot ship without its contract.
 */

import { describe, it, expect } from "vitest";
import {
  DELIVERY_CONTRACTS,
  DELIVERY_INDICATOR_IDS,
  assertContractsComplete,
  deliveryColor,
  evaluateIndicator,
  rollupDelivery,
  type DeliveryIndicator,
  type DeliveryObservation,
} from "../../packages/llm/src/delivery-health";

const READ_AT = "2026-09-04T10:00:00.000Z";

const ind = (o: DeliveryObservation): DeliveryIndicator => evaluateIndicator(o);

describe("metric contracts", () => {
  it("every indicator ships with a complete contract", () => {
    expect(assertContractsComplete()).toEqual([]);
  });

  it("every contract names an owner, a source of truth, a grain and a quality test", () => {
    for (const id of DELIVERY_INDICATOR_IDS) {
      const c = DELIVERY_CONTRACTS[id];
      expect(c.owner.length).toBeGreaterThan(3);
      expect(c.sourceOfTruth.length).toBeGreaterThan(3);
      expect(c.grain.length).toBeGreaterThan(3);
      expect(c.timezone).toBe("UTC");
      expect(c.lateData.length).toBeGreaterThan(8);
      expect(c.qualityTest).toContain("delivery-health.test.ts");
    }
  });
});

describe("absent data is a first-class state", () => {
  it("a null value is not_measured, not zero — and not green", () => {
    const i = ind({ id: "prompt_relevance_pass", value: null, sample: 0 });
    expect(i.status).toBe("not_measured");
    expect(i.value).toBeNull();
    expect(deliveryColor(i.status)).toBe("amber");
  });

  it("an unreachable source is not_connected and says so", () => {
    const i = ind({
      id: "entity_false_positive_rate",
      value: null,
      sample: 0,
      unknown: "not_connected",
      detail: "engine_drift_check table absent",
    });
    expect(i.status).toBe("not_connected");
    expect(i.reason).toContain("engine_drift_check");
  });

  it("too few observations is insufficient_evidence, never a percentage", () => {
    const i = ind({ id: "recommendation_coverage", value: 1, sample: 2 });
    expect(i.status).toBe("insufficient_evidence");
    expect(i.value).toBeNull();
    expect(i.reason).toContain("2 of the 5");
  });

  it("NaN from a bad division is reported, not rendered as 0%", () => {
    const i = ind({ id: "failed_jobs", value: Number.NaN, sample: 10 });
    expect(i.status).toBe("not_measured");
    expect(i.value).toBeNull();
  });
});

describe("thresholds — higher_is_better", () => {
  it("recommendation coverage falls when a gap has no action", () => {
    expect(ind({ id: "recommendation_coverage", value: 1, sample: 20 }).status).toBe("healthy");
    // 19/20 gaps covered → below the 0.95 degraded threshold.
    expect(ind({ id: "recommendation_coverage", value: 0.9, sample: 20 }).status).toBe("degraded");
    expect(ind({ id: "recommendation_coverage", value: 0.5, sample: 20 }).status).toBe("failing");
  });

  it("a card with no evidence is not a useful action", () => {
    const i = ind({ id: "useful_action_rate", value: 0.6, sample: 10 });
    expect(i.status).toBe("failing");
    expect(i.reason).toContain("below");
  });

  it("prompts with no intent do not pass relevance", () => {
    expect(ind({ id: "prompt_relevance_pass", value: 0.8, sample: 40 }).status).toBe("degraded");
  });

  it("failed drafts drive draft success down", () => {
    expect(ind({ id: "draft_generation_success", value: 0.7, sample: 10 }).status).toBe("failing");
  });

  it("self-reported completion does not count as verified", () => {
    // 1 verified out of 10 claims — the P0-02 failure mode, now visible.
    expect(ind({ id: "action_verification_rate", value: 0.1, sample: 10 }).status).toBe("failing");
  });

  it("a changed engine panel lowers comparable coverage", () => {
    expect(ind({ id: "comparable_trend_coverage", value: 0.7, sample: 10 }).status).toBe("degraded");
    expect(ind({ id: "comparable_trend_coverage", value: 0.4, sample: 10 }).status).toBe("failing");
  });
});

describe("thresholds — lower_is_better", () => {
  it("a hallucinating engine drives entity false positives red", () => {
    expect(ind({ id: "entity_false_positive_rate", value: 0, sample: 5 }).status).toBe("healthy");
    expect(ind({ id: "entity_false_positive_rate", value: 0.15, sample: 5 }).status).toBe("degraded");
    expect(ind({ id: "entity_false_positive_rate", value: 0.4, sample: 5 }).status).toBe("failing");
  });

  it("slow drafts are degraded, not healthy", () => {
    expect(ind({ id: "draft_generation_time", value: 900, sample: 10 }).status).toBe("degraded");
    expect(ind({ id: "draft_generation_time", value: 3600, sample: 10 }).status).toBe("failing");
  });

  it("an untouched regression ages into red", () => {
    expect(ind({ id: "regression_investigation_sla", value: 3, sample: 1 }).status).toBe("healthy");
    expect(ind({ id: "regression_investigation_sla", value: 30, sample: 1 }).status).toBe("degraded");
    expect(ind({ id: "regression_investigation_sla", value: 100, sample: 1 }).status).toBe("failing");
  });

  it("one leaked raw error is already degraded", () => {
    expect(ind({ id: "raw_error_leak", value: 0, sample: 0 }).status).toBe("healthy");
    expect(ind({ id: "raw_error_leak", value: 1, sample: 1 }).status).toBe("degraded");
    expect(ind({ id: "raw_error_leak", value: 5, sample: 5 }).status).toBe("failing");
  });

  it("a stuck queue is failing, not healthy", () => {
    expect(ind({ id: "queue_age", value: 15, sample: 3 }).status).toBe("healthy");
    expect(ind({ id: "queue_age", value: 300, sample: 3 }).status).toBe("failing");
  });

  it("a failing worker is not green", () => {
    expect(ind({ id: "failed_jobs", value: 0.02, sample: 50 }).status).toBe("healthy");
    expect(ind({ id: "failed_jobs", value: 0.3, sample: 50 }).status).toBe("failing");
  });
});

describe("rollup", () => {
  const healthyAll = (): DeliveryIndicator[] =>
    DELIVERY_INDICATOR_IDS.map((id) => {
      const c = DELIVERY_CONTRACTS[id];
      const good = c.direction === "higher_is_better" ? 1 : 0;
      return ind({ id, value: good, sample: Math.max(c.minSample, 1) });
    });

  it("is green only when every indicator is measured and inside threshold", () => {
    const r = rollupDelivery(healthyAll(), null, READ_AT);
    expect(r.status).toBe("healthy");
    expect(deliveryColor(r.status)).toBe("green");
    expect(r.reasons).toEqual([]);
  });

  it("one unmeasured indicator can never leave the rollup green", () => {
    const list = healthyAll();
    list[0] = ind({ id: "recommendation_coverage", value: null, sample: 0 });
    const r = rollupDelivery(list, null, READ_AT);
    expect(r.status).not.toBe("healthy");
    expect(deliveryColor(r.status)).toBe("amber");
  });

  it("a broken loop turns the rollup red even with everything else green", () => {
    const list = healthyAll();
    list[0] = ind({ id: "recommendation_coverage", value: 0.2, sample: 40 });
    const r = rollupDelivery(list, null, READ_AT);
    expect(r.status).toBe("failing");
    expect(deliveryColor(r.status)).toBe("red");
    expect(r.reasons.join(" ")).toContain("Recommendation coverage");
  });

  it("a failing canary alone turns the rollup red — the point of P0-09", () => {
    const r = rollupDelivery(healthyAll(), {
      status: "failing",
      version: "2026-09-04.1",
      reasons: ["Verify canary — the verification path is not running"],
    }, READ_AT);
    expect(r.status).toBe("failing");
    expect(r.reasons.join(" ")).toContain("Verify canary");
  });

  it("counts every state so the panel can show what it cannot see", () => {
    const list = healthyAll();
    list[1] = ind({ id: "useful_action_rate", value: null, sample: 0, unknown: "not_connected" });
    const r = rollupDelivery(list, null, READ_AT);
    expect(r.counts.not_connected).toBe(1);
    expect(r.counts.healthy).toBe(DELIVERY_INDICATOR_IDS.length - 1);
    expect(r.readAt).toBe(READ_AT);
  });
});
