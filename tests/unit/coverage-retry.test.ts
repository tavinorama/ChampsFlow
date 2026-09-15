/**
 * coverage-retry.test.ts — P1-07 defect 3, the 2026-09-07 hole.
 *
 * The weekly scheduled audit ran with 4 of 5 engines: the drift guard held
 * Gemini back. Every honesty mechanism did its job — "not comparable", the
 * coverage notice, the flagged trend point — and then nothing happened. Nobody
 * re-ran it when Gemini came back, so the week kept a point measured with a
 * different ruler.
 *
 * What these tests hold:
 *   1. an incomplete SCHEDULED panel queues exactly ONE repeat, 24h out;
 *   2. at most two repeats per week, then we stop and say why;
 *   3. the repeat spends nothing while the panel is still incomplete
 *      (~US$0.80 per audit — a repeat loop is a money leak);
 *   4. a manual run never repeats itself, and a daily brand does not pay for a
 *      repeat its next scheduled run already covers;
 *   5. when the panel never comes back, the reason is recorded and Delivery
 *      Health goes amber carrying it.
 *
 * The queue is a fake: these are policy tests, not BullMQ tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  planCoverageRetry,
  panelReadyForRetry,
  applyCoverageRetry,
  abandonUnrunAudit,
  coverageRetrySkippedMessage,
  monthlyCapReachedMessage,
  isUnrunAuditMessage,
  AUDIT_ROW_UNMARKABLE,
  UNRUN_AUDIT_PREFIXES,
  COVERAGE_RETRY_DELAY_MS,
  COVERAGE_RETRY_MAX_ATTEMPTS,
  type CoverageRetryState,
} from "../../packages/shared/src/coverage-retry";
import { isAuditFailurePermanent } from "../../packages/shared/src/audit-queue";
import { looksLikeRawError } from "../../packages/llm/src/delivery-health";
import {
  evaluateIndicator,
  DELIVERY_CONTRACTS,
  DELIVERY_INDICATOR_IDS,
  deliveryColor,
} from "../../packages/llm/src/delivery-health";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** The 07/09 run, exactly: weekly brand, Gemini held back for drift. */
const SEPT_7 = {
  scheduled: true,
  comparable: false,
  paused: ["gemini"],
  missing: [] as string[],
  attemptsUsed: 0,
  nextScheduledInMs: 7 * 24 * 60 * 60 * 1000,
};

/** A queue and a breakdown that record instead of doing. */
function fakes() {
  const queued: Array<{ attempt: number; delayMs: number; originAuditId: string }> = [];
  const recorded: CoverageRetryState[] = [];
  return {
    queued,
    recorded,
    ports: {
      enqueue: async (job: { attempt: number; delayMs: number; originAuditId: string }) => {
        queued.push(job);
      },
      record: async (state: CoverageRetryState) => {
        recorded.push(state);
      },
    },
  };
}

describe("an incomplete scheduled panel is repeated once", () => {
  it("queues one repeat, 24h out, naming the engine that was held back", async () => {
    const f = fakes();
    const decision = await applyCoverageRetry(SEPT_7, f.ports, { originAuditId: "audit-0907" });

    expect(decision.action).toBe("retry");
    expect(f.queued).toHaveLength(1);
    expect(f.queued[0]).toMatchObject({
      attempt: 1,
      delayMs: COVERAGE_RETRY_DELAY_MS,
      originAuditId: "audit-0907",
    });
    expect(COVERAGE_RETRY_DELAY_MS).toBe(24 * 60 * 60 * 1000);
    expect(f.recorded[0]?.status).toBe("scheduled");
    expect(f.recorded[0]?.reason).toContain("gemini");
    expect(f.recorded[0]?.engines).toEqual(["gemini"]);
  });

  it("stops after two repeats in the week and records why", async () => {
    const f = fakes();
    const decision = await applyCoverageRetry(
      { ...SEPT_7, attemptsUsed: COVERAGE_RETRY_MAX_ATTEMPTS },
      f.ports,
      { originAuditId: "audit-0907" }
    );

    expect(decision.action).toBe("give_up");
    // The money rule: no third audit is bought.
    expect(f.queued).toHaveLength(0);
    expect(f.recorded[0]?.status).toBe("exhausted");
    expect(f.recorded[0]?.reason).toContain("gemini");
    expect(COVERAGE_RETRY_MAX_ATTEMPTS).toBe(2);
  });

  it("does nothing when the panel was whole", async () => {
    const f = fakes();
    const decision = await applyCoverageRetry({ ...SEPT_7, comparable: true }, f.ports, {
      originAuditId: "audit-ok",
    });
    expect(decision.action).toBe("none");
    expect(f.queued).toHaveLength(0);
    expect(f.recorded).toHaveLength(0);
  });

  it("never repeats a manual run, and never one a daily cadence already covers", () => {
    expect(planCoverageRetry({ ...SEPT_7, scheduled: false }).action).toBe("none");
    const daily = planCoverageRetry({ ...SEPT_7, nextScheduledInMs: 24 * 60 * 60 * 1000 });
    expect(daily.action).toBe("none");
    expect(daily.reason).toContain("next scheduled audit");
  });

  it("counts a silent engine as an incomplete panel too, not just a paused one", () => {
    const d = planCoverageRetry({ ...SEPT_7, paused: [], missing: ["openai"] });
    expect(d.action).toBe("retry");
    expect(d.reason).toContain("openai");
  });
});

describe("the repeat spends only on a whole panel", () => {
  it("refuses to probe while the engine is still held back", () => {
    const r = panelReadyForRetry(["openai", "anthropic", "perplexity", "gemini", "serp"], [
      "gemini",
    ]);
    expect(r.ready).toBe(false);
    expect(r.blocking).toEqual(["gemini"]);
    expect(r.reason).toContain("gemini");
  });

  it("goes ahead once the drift guard releases it", () => {
    const r = panelReadyForRetry(["openai", "anthropic", "perplexity", "gemini", "serp"], []);
    expect(r.ready).toBe(true);
    expect(r.blocking).toEqual([]);
  });
});

describe("an unrecovered incomplete panel turns the panel amber", () => {
  it("is a first-class Delivery Health indicator with a complete contract", () => {
    expect(DELIVERY_INDICATOR_IDS).toContain("incomplete_panel_recovery");
    const c = DELIVERY_CONTRACTS["incomplete_panel_recovery"];
    expect(c.direction).toBe("lower_is_better");
    expect(c.failingAt).toBeGreaterThan(c.degradedAt);
  });

  it("one unrecovered run is amber, and carries the reason", () => {
    const ind = evaluateIndicator({
      id: "incomplete_panel_recovery",
      value: 1,
      sample: 12,
      detail: "held back for drift: gemini — 2 automatic repeats already used this week",
    });
    expect(ind.status).toBe("degraded");
    expect(deliveryColor(ind.status)).toBe("amber");
    // The founder must read WHY, not just "1 above the threshold of 0".
    expect(ind.reason).toContain("gemini");
  });

  it("zero unrecovered runs is green, not an unknown", () => {
    const ind = evaluateIndicator({ id: "incomplete_panel_recovery", value: 0, sample: 12 });
    expect(ind.status).toBe("healthy");
    expect(deliveryColor(ind.status)).toBe("green");
  });
});

describe("the worker uses the policy", () => {
  const src = read("apps/worker/src/jobs/audit-run.ts");

  it("decides a repeat when a scheduled run ends non-comparable", () => {
    expect(src).toContain("applyCoverageRetry");
    expect(src).toContain("audit_incomplete_panel");
    expect(src).toMatch(/coverage_retry\?: \{ attempt: number; origin_audit_id: string \}/);
  });

  it("checks the panel before spending, and MARKS the un-run audit if it is not ready — never deletes it", () => {
    expect(src).toContain("panelReadyForRetry(comparisonPanel, pausedProviders)");
    expect(src).toContain("audit_coverage_retry_panel_not_ready");
    // 15/09: `DELETE FROM geo_audit` threw "permission denied" (the worker's
    // role has no DELETE), the job died three times and left three `running`
    // zombies. The row is marked through abandonUnrunAudit, with the decision
    // recorded (applyCoverageRetry) inside its record() port.
    expect(src).not.toContain("DELETE FROM geo_audit");
    expect(src).toMatch(/abandonUnrunAudit\(\{[\s\S]{0,200}record: async \(\) => \{[\s\S]{0,120}applyCoverageRetry\(/);
    expect(src).toMatch(/mark: async \(\) => \{[\s\S]{0,80}UPDATE geo_audit SET status = 'failed', error_message = \$\{skipped\}/);
    expect(src).toContain("coverageRetrySkippedMessage(readiness.blocking)");
  });

  it("the monthly ceiling marks the un-run row the same way, outside the count's fail-open catch", () => {
    // The count may fail open (a count error must not block a legitimate
    // audit) — the MARK may not: a spend guard that cannot record its decision
    // stops the job instead of probing past the ceiling.
    expect(src).toContain("audit_monthly_cap_reached");
    expect(src).toMatch(/if \(capReached\) \{[\s\S]{0,900}abandonUnrunAudit\(\{[\s\S]{0,300}error_message = \$\{reason\}/);
    expect(src).toContain("monthlyCapReachedMessage({");
  });

  it("any throw after the row exists marks it failed before the queue sees the error", () => {
    expect(src).toContain("async function markAuditFailedOnThrow(");
    expect(src).toMatch(/track\.auditId = audit_id;/);
    expect(src).toMatch(/WHERE id = \$\{auditId\} AND status IN \('pending', 'running'\)/);
    expect(src).toContain("audit_failed_row_unmarked");
  });

  it("records the outcome on the ORIGINAL audit, and shouts when it cannot", () => {
    expect(src).toContain("recordCoverageRetry");
    expect(src).toContain("audit_coverage_retry_recovered");
    expect(src).toContain("audit_coverage_retry_failed");
  });

  it("the probe reads the recorded state back", () => {
    const reader = read("apps/api/src/lib/delivery-health-read.ts");
    expect(reader).toContain("probeIncompletePanelRecovery");
    expect(reader).toContain("'coverage_retry'->>'status'");
    // A repeat still inside its window is not a hole.
    expect(reader).toContain("INTERVAL '2 days'");
  });
});

describe("an un-run audit row is marked, never deleted (15/09)", () => {
  function ports() {
    const calls: string[] = [];
    return {
      calls,
      ok: {
        record: async () => {
          calls.push("record");
        },
        mark: async () => {
          calls.push("mark");
        },
      },
    };
  }

  it("records the decision BEFORE marking the row, and reports both done", async () => {
    const p = ports();
    const out = await abandonUnrunAudit(p.ok);
    expect(p.calls).toEqual(["record", "mark"]);
    expect(out).toEqual({ recorded: true, recordError: null });
  });

  it("a record() that throws is reported, and the row is still marked", async () => {
    const p = ports();
    const out = await abandonUnrunAudit({
      record: async () => {
        throw new Error("redis down");
      },
      mark: p.ok.mark,
    });
    expect(p.calls).toEqual(["mark"]);
    expect(out.recorded).toBe(false);
    expect(out.recordError).toBe("redis down");
  });

  it("a mark() that throws becomes audit_row_unmarkable, which the queue treats as permanent", async () => {
    const p = ports();
    const err = await abandonUnrunAudit({
      record: p.ok.record,
      mark: async () => {
        throw new Error("permission denied for table geo_audit");
      },
    }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(
      `${AUDIT_ROW_UNMARKABLE}: permission denied for table geo_audit`
    );
    // The record still happened first — the retry state is not lost.
    expect(p.calls).toEqual(["record"]);
    // No retry: another attempt would INSERT another zombie row.
    expect(isAuditFailurePermanent((err as Error).message)).toBe(true);
  });

  it("the reasons are prose the brand page can show, with a machine prefix Delivery Health can skip", () => {
    const skipped = coverageRetrySkippedMessage(["anthropic"]);
    const capped = monthlyCapReachedMessage({ completed: 40, cap: 40, plan: "growth" });
    expect(skipped).toBe(
      "coverage_retry_skipped: repeat not run — anthropic still held back for drift; nothing was probed or charged."
    );
    expect(capped).toContain("monthly_cap_reached: 40 of 40 audits already completed this month on the growth plan");
    for (const m of [skipped, capped]) {
      expect(isUnrunAuditMessage(m)).toBe(true);
      // The brand page shows error_message verbatim: no raw runtime string.
      expect(looksLikeRawError(m)).toBe(false);
    }
    expect(isUnrunAuditMessage("Only 2 of 5 AI engines answered")).toBe(false);
    expect(isUnrunAuditMessage(null)).toBe(false);
    expect(UNRUN_AUDIT_PREFIXES).toEqual(["coverage_retry_skipped", "monthly_cap_reached"]);
  });

  it("Delivery Health does not count a deliberately un-run row as a failed audit", () => {
    const reader = read("apps/api/src/lib/delivery-health-read.ts");
    expect(reader).toContain("UNRUN_AUDIT_PREFIXES");
    expect(reader).toMatch(/COUNT\(\*\) FILTER \(WHERE status = 'failed'[\s\S]{0,200}AND NOT \(\$\{UNRUN_AUDIT_SQL\}\)\)/);
  });
});
