/**
 * Worker-boot dependency smoke (CI gap from #248 / #126).
 *
 * The worker runs as its OWN Railway service with its OWN production image, so a
 * dependency that resolves for the API can still be MISSING from the worker's
 * build. Nothing in CI imported the worker's code, so that class of break only
 * surfaced as a failed deploy — the 2026-06 audit-integrity incident, where the
 * worker image lacked stripe/upstash/resend and silently kept running a stale
 * build that fabricated audit scores.
 *
 * This smoke imports the worker's job processors + db client so their transitive
 * dependency graph MUST resolve at CI time. It imports the pure function modules
 * (not index.ts, which opens Redis/Postgres connections at load), so it neither
 * connects nor hangs — it only proves "the worker's code and its deps load".
 */
import { describe, it, expect } from "vitest";

describe("worker boot deps smoke", () => {
  it("imports the publish job processor (bullmq / ioredis / api integrations resolve)", async () => {
    const mod = await import("../../apps/worker/src/jobs/publish");
    expect(typeof mod.processPublishJob).toBe("function");
  });

  it("imports the GEO-audit job processors", async () => {
    const mod = await import("../../apps/worker/src/jobs/audit-run");
    expect(typeof mod.processAuditJob).toBe("function");
    expect(typeof mod.processDailyMonitoredBrands).toBe("function");
  });

  it("imports the landing-generate job processor", async () => {
    const mod = await import("../../apps/worker/src/jobs/landing-generate");
    expect(typeof mod.processLandingGenerateJob).toBe("function");
  });

  it("imports the nurture-send job processor", async () => {
    const mod = await import("../../apps/worker/src/jobs/nurture-send");
    expect(typeof mod.processNurtureJobs).toBe("function");
  });

  it("imports the worker RLS db-client helpers", async () => {
    const mod = await import("../../apps/worker/src/db/rls-client");
    expect(typeof mod.createWorkerDb).toBe("function");
    expect(typeof mod.withRlsContext).toBe("function");
    expect(typeof mod.assertWorkerAppDbRoleSafe).toBe("function");
  });
});
