/**
 * measurement-status.test.ts — D1 (Codex N04, 28/09).
 *
 * The rows below are the real shape of 28/09: one scheduled audit, tried three
 * times seventy seconds apart, refused for coverage; last valid run on 21/09.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeMeasurementStatus, parseCoverageRefusal } from "../../packages/shared/src/measurement-status";
import { isAuditFailurePermanent } from "../../packages/shared/src/audit-queue";

const REFUSAL =
  'Only 1 of 5 AI engines answered (no answer: none; held back for drift: anthropic, perplexity, gemini, serp). We did not score this run — a partial panel is not comparable to your history.';
const rows = [
  { id: "f3", status: "failed", created_at: "2026-09-28T06:02:22.695Z", score_ai: null, error_message: REFUSAL },
  { id: "f2", status: "failed", created_at: "2026-09-28T06:01:10.551Z", score_ai: null, error_message: REFUSAL },
  { id: "f1", status: "failed", created_at: "2026-09-28T06:00:00.128Z", score_ai: null, error_message: REFUSAL },
  { id: "ok", status: "complete", created_at: "2026-09-21T18:46:50.170Z", score_ai: 49, error_message: null },
  { id: "old", status: "failed", created_at: "2026-09-21T18:24:00.000Z", score_ai: null, error_message: "x" },
];

describe("summarizeMeasurementStatus", () => {
  it("28/09: one attempt tried three times, an incident, and the last valid run named", () => {
    const s = summarizeMeasurementStatus(rows);
    expect(s.incident).toBe(true);
    expect(s.lastValid).toEqual({ auditId: "ok", at: "2026-09-21T18:46:50.170Z", index: 49 });
    expect(s.lastAttempt).toMatchObject({ tries: 3, at: "2026-09-28T06:00:00.128Z", answered: 1, requested: 5 });
    expect(s.lastAttempt!.heldBack).toEqual(["anthropic", "perplexity", "gemini", "serp"]);
    expect(s.headline).toBe("We could not measure on Sep 28. Your last valid score is from Sep 21.");
    expect(s.detail).toContain("Only 1 of 5 AI engines could be measured.");
    expect(s.detail).toContain("Held back by our own checks: Claude, Perplexity, Gemini, Google AI Overviews.");
    expect(s.detail).toContain("We do not publish a score from a partial panel.");
  });
  it("a valid run newer than the failure is no incident, and says nothing", () => {
    const s = summarizeMeasurementStatus([{ id: "new", status: "complete", created_at: "2026-10-05T06:03:00Z", score_ai: 51, error_message: null }, ...rows]);
    expect(s).toMatchObject({ incident: false, headline: null, detail: null });
    expect(s.lastValid?.auditId).toBe("new");
  });
  it("failures far apart are different attempts", () => {
    const s = summarizeMeasurementStatus([rows[0]!, { ...rows[1]!, created_at: "2026-09-28T04:00:00Z" }]);
    expect(s.lastAttempt?.tries).toBe(1);
  });
  it("no valid run ever, and an unreadable reason, still speak plainly", () => {
    const s = summarizeMeasurementStatus([{ id: "f", status: "failed", created_at: "2026-09-28T06:00:00Z", score_ai: null, error_message: "This run stopped before a score could be published." }]);
    expect(s.headline).toBe("We could not measure on Sep 28. There is no valid score yet.");
    expect(s.lastAttempt).toMatchObject({ answered: null, heldBack: [], noAnswer: [] });
  });
  it("empty history is silent", () => {
    expect(summarizeMeasurementStatus([])).toEqual({ lastValid: null, lastAttempt: null, incident: false, headline: null, detail: null });
  });
  it("the refusal sentence is parsed, 'none' is not an engine", () => {
    expect(parseCoverageRefusal(REFUSAL)).toEqual({ answered: 1, requested: 5, heldBack: ["anthropic", "perplexity", "gemini", "serp"], noAnswer: [] });
  });
});

describe("the queue obeys the policy it already had", () => {
  const root = join(__dirname, "../..");
  it("a refusal is permanent, and the worker turns permanent into UnrecoverableError", () => {
    expect(isAuditFailurePermanent("insufficient_engine_coverage")).toBe(true);
    const src = readFileSync(join(root, "apps/worker/src/index.ts"), "utf8");
    expect(src).toMatch(/if \(isAuditFailurePermanent\(message\)\) throw new UnrecoverableError\(message\)/);
  });
  it("a retry reuses the row and drops the previous reason", () => {
    const src = readFileSync(join(root, "apps/worker/src/jobs/audit-run.ts"), "utf8");
    expect(src).toContain("await job.updateData({ ...job.data, audit_id })");
    expect(src).toContain("SET status = 'running', error_message = NULL");
  });
});

describe("'this run used none of your audits or credits' is true in the code", () => {
  const root = join(__dirname, "../..");
  it("both monthly caps count completed audits only", () => {
    const worker = readFileSync(join(root, "apps/worker/src/jobs/audit-run.ts"), "utf8");
    const api = readFileSync(join(root, "apps/api/src/routes/audits.ts"), "utf8");
    const capW = worker.slice(worker.indexOf("monthly_audits_total;"), worker.indexOf("monthly_audits_total;") + 600);
    const capA = api.slice(api.indexOf("const monthlyTotal = limits.monthly_audits_total;"), api.indexOf("const monthlyTotal = limits.monthly_audits_total;") + 500);
    expect(capW).toContain("status = 'complete'");
    expect(capA).toContain("status = 'complete'");
  });
  it("the credit debit comes after the coverage refusal in the job", () => {
    const worker = readFileSync(join(root, "apps/worker/src/jobs/audit-run.ts"), "utf8");
    expect(worker.indexOf('throw new Error("insufficient_engine_coverage")')).toBeGreaterThan(0);
    expect(worker.indexOf("INSERT INTO credit_ledger (tenant_id, delta, reason, ref_type, ref_id, balance_after)")).toBeGreaterThan(worker.indexOf('throw new Error("insufficient_engine_coverage")'));
  });
});

describe("wiring", () => {
  const root = join(__dirname, "../..");
  it("the brand page shows the banner BEFORE the scorecard, and the API serves it tenant-scoped", () => {
    const page = readFileSync(join(root, "apps/web/src/app/brands/[id]/page.tsx"), "utf8");
    expect(page.indexOf("<MeasurementStatusBanner")).toBeGreaterThan(0);
    expect(page.indexOf("<MeasurementStatusBanner")).toBeLessThan(page.indexOf("<OzvorScorecard"));
    const api = readFileSync(join(root, "apps/api/src/routes/audits.ts"), "utf8");
    const route = api.slice(api.indexOf('"/api/brands/:id/measurement-status"'));
    expect(route.slice(0, 400)).toContain("requireAuth");
    expect(route.slice(0, 400)).toContain("db.setTenantId(auth.tenantId)");
  });
});
