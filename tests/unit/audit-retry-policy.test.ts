/**
 * audit-retry-policy.test.ts — the 17/08 retry storm.
 *
 * Measured in the database: three audits failed at 06:00, 06:01 and 06:02 with
 * the identical message "Only 2 of 5 AI engines answered; held back for drift".
 * One problem, retried into three — and then reported to nobody.
 *
 * Two causes, both locked here:
 *   1. `geo-audit` had two producers with different retry policies (the API
 *      declared attempts:3 / 30s exponential; the worker's daily-monitor
 *      producer declared nothing and inherited attempts:1 / no backoff).
 *   2. A 30s base put all three attempts inside three minutes — far too fast
 *      for the provider outage it was retrying, and each attempt spends real
 *      money (~$0.21–0.80) to fail identically.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AUDIT_QUEUE_NAME,
  AUDIT_JOB_OPTIONS,
  AUDIT_ATTEMPTS,
  AUDIT_RETRY_BASE_DELAY_MS,
  auditRetryDelayMs,
  isAuditFailurePermanent,
} from "../../packages/shared/src/audit-queue";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const MIN = 60_000;

describe("17/08 storm — retries are spaced, not stacked", () => {
  it("three attempts span more than an hour, not three minutes", () => {
    // The defect, exactly: 30s base → 30s / 60s / 120s, i.e. everything inside
    // three minutes, which is what 06:00 / 06:01 / 06:02 looks like.
    expect(auditRetryDelayMs(1)).toBe(0);
    expect(auditRetryDelayMs(2)).toBe(10 * MIN);
    expect(auditRetryDelayMs(3)).toBe(20 * MIN);
    const total = auditRetryDelayMs(2) + auditRetryDelayMs(3);
    expect(total).toBeGreaterThan(25 * MIN);
  });

  it("no two attempts land within five minutes of each other", () => {
    // The property that matters more than any specific number: a down engine
    // or a rate-limit window does not clear in seconds, so a retry that fast is
    // guaranteed to fail the same way and bill us for it.
    let elapsed = 0;
    const times: number[] = [0];
    for (let a = 2; a <= AUDIT_ATTEMPTS; a++) {
      elapsed += auditRetryDelayMs(a);
      times.push(elapsed);
    }
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(5 * MIN);
    }
  });

  it("the shared policy is the one exported, with a sane base", () => {
    expect(AUDIT_JOB_OPTIONS.attempts).toBe(AUDIT_ATTEMPTS);
    expect(AUDIT_JOB_OPTIONS.backoff.type).toBe("exponential");
    expect(AUDIT_JOB_OPTIONS.backoff.delay).toBe(AUDIT_RETRY_BASE_DELAY_MS);
    expect(AUDIT_RETRY_BASE_DELAY_MS).toBeGreaterThanOrEqual(5 * MIN);
  });
});

describe("17/08 storm — one queue, one policy", () => {
  const producers = [
    "apps/api/src/routes/audits.ts",
    "apps/worker/src/jobs/audit-run.ts",
  ];

  it("every geo-audit producer passes the shared options", () => {
    for (const p of producers) {
      const src = read(p);
      expect(src, `${p} must import the shared policy`).toContain("AUDIT_JOB_OPTIONS");
      expect(src, `${p} must apply it`).toContain("defaultJobOptions: AUDIT_JOB_OPTIONS");
    }
  });

  it("no producer hard-codes the queue name or its own attempts/backoff", () => {
    for (const p of producers) {
      const src = read(p);
      // A second `new Queue("geo-audit")` anywhere is how the two policies
      // diverged in the first place.
      expect(src, `${p} must not hard-code the queue name`).not.toContain('new Queue("geo-audit"');
      expect(src).toContain(`new Queue(${"AUDIT_QUEUE_NAME"}`);
      expect(src, `${p} must not declare its own backoff`).not.toMatch(
        /backoff:\s*\{\s*type:\s*"exponential",\s*delay:\s*30_?000/
      );
    }
    expect(AUDIT_QUEUE_NAME).toBe("geo-audit");
  });
});

describe("17/08 storm — a refusal is not retried at all", () => {
  it("insufficient_engine_coverage is permanent", () => {
    // It is not a crash: the run completed, measured too few engines, and we
    // deliberately declined to publish a score that would not be comparable.
    // Asking the same down engines again just spends the money again. This is
    // the exact error the three 17/08 audits carried.
    expect(isAuditFailurePermanent("insufficient_engine_coverage")).toBe(true);
    expect(isAuditFailurePermanent("  insufficient_engine_coverage  ")).toBe(true);
  });

  it("a genuine transient failure still retries", () => {
    expect(isAuditFailurePermanent("ECONNRESET")).toBe(false);
    expect(isAuditFailurePermanent("timeout")).toBe(false);
    expect(isAuditFailurePermanent(null)).toBe(false);
    expect(isAuditFailurePermanent(undefined)).toBe(false);
  });
});

describe("17/08 storm — the failure is no longer mute", () => {
  it("the worker alerts on a terminal audit failure", () => {
    const src = read("apps/worker/src/index.ts");
    expect(src).toContain("alertOps(");
    expect(src).toContain("formatAuditFailureAlert");
    // Only on the terminal failure. Alerting per attempt would move the storm
    // into the notification channel, which is how a channel gets muted.
    expect(src).toMatch(/if \(permanent\) \{[\s\S]{0,200}alertOps\(/);
  });

  it("the alerter says so when it CANNOT alert", () => {
    // A silent alerter is the exact failure being fixed here:
    // "não consegui olhar" is not the same as "ok".
    // alertOps moved to packages/shared on 2026-09-04 (P0-08) so the API can
    // use the same alerter the worker does; apps/worker/src/alerts.ts re-exports
    // it. The guarantee is unchanged and is asserted at its new home — plus the
    // re-export, so a future "tidy-up" that deletes the bridge fails here rather
    // than in production.
    const shared = read("packages/shared/src/ops-alert.ts");
    expect(shared).toContain("ops_alert_undeliverable");
    expect(shared).toContain("ops_alert_send_failed");
    expect(read("apps/worker/src/alerts.ts")).toContain("ops-alert");
  });

  it("the reason reaches the customer instead of a generic retry prompt", () => {
    // The worker always wrote a specific error_message and the API never
    // returned it, so the only advice we gave was "run it again" — which
    // re-runs against the same unavailable engines and bills us again.
    const api = read("apps/api/src/routes/audits.ts");
    expect(api).toMatch(/providers_used, report_token, created_at, error_message/);
    const web = read("apps/web/src/app/brands/[id]/page.tsx");
    expect(web).toContain("a.error_message?.trim() ||");
  });
});
