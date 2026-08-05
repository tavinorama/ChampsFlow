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

/**
 * Why this file needs a timeout at all.
 *
 * Each `it` pulls in the worker's ENTIRE transitive dependency graph — that is
 * the whole point of the smoke, and it is also why it is slow. Alone it takes
 * ~400ms. Inside a full 130-file run, competing with every other worker for the
 * same module resolution, it has been measured at 36s: a 90x spread on the same
 * code, driven purely by scheduling.
 *
 * Under the 30s default that made it a coin flip. It timed out on one full run
 * and passed in 356ms on the very next, unchanged — which is worse than a slow
 * test, because a test that reddens random PRs teaches people to re-run CI
 * instead of reading it. Raised well clear of the observed worst case rather
 * than just above it; the number is chosen so that a failure here means the
 * imports are genuinely broken, which is the only thing this file should ever
 * be able to say.
 */
const IMPORT_GRAPH_TIMEOUT_MS = 90_000;

describe("worker boot deps smoke", () => {
  it("imports the publish job processor (bullmq / ioredis / api integrations resolve)", async () => {
    const mod = await import("../../apps/worker/src/jobs/publish");
    expect(typeof mod.processPublishJob).toBe("function");
  }, IMPORT_GRAPH_TIMEOUT_MS);

  it("imports the GEO-audit job processors", async () => {
    const mod = await import("../../apps/worker/src/jobs/audit-run");
    expect(typeof mod.processAuditJob).toBe("function");
    expect(typeof mod.processDailyMonitoredBrands).toBe("function");
  }, IMPORT_GRAPH_TIMEOUT_MS);

  it("imports the B4 drift-control job processor", async () => {
    const mod = await import("../../apps/worker/src/jobs/drift-control");
    expect(typeof mod.processDriftControlJob).toBe("function");
    expect(typeof mod.pausedDriftEngines).toBe("function");
    expect(mod.DRIFT_ENGINES).toHaveLength(5);
  }, IMPORT_GRAPH_TIMEOUT_MS);

  it("imports the landing-generate job processor", async () => {
    const mod = await import("../../apps/worker/src/jobs/landing-generate");
    expect(typeof mod.processLandingGenerateJob).toBe("function");
  }, IMPORT_GRAPH_TIMEOUT_MS);

  it("imports the nurture-send job processor", async () => {
    const mod = await import("../../apps/worker/src/jobs/nurture-send");
    expect(typeof mod.processNurtureJobs).toBe("function");
  }, IMPORT_GRAPH_TIMEOUT_MS);

  it("imports the worker RLS db-client helpers", async () => {
    const mod = await import("../../apps/worker/src/db/rls-client");
    expect(typeof mod.createWorkerDb).toBe("function");
    expect(typeof mod.withRlsContext).toBe("function");
    expect(typeof mod.assertWorkerAppDbRoleSafe).toBe("function");
  }, IMPORT_GRAPH_TIMEOUT_MS);
});
