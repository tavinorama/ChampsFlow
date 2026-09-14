import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type postgres from "postgres";
import type Redis from "ioredis";
import { advanceRun, type GraphRunnerPorts, type StepRow, type RunRow } from "../../apps/api/src/lib/graph-runner";
import type { GraphDefinition } from "../../apps/api/src/lib/agent-graphs";
import { buildPorts, buildSnapshot } from "../../apps/worker/src/jobs/graph-tick";

const INVALID = /business_state=invalid_g03/;
const PARTIAL = "business_state=partial_g03";
const NOW = "2026-09-14T10:00:00Z";
beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network forbidden in containment tests"); })));
afterEach(() => vi.unstubAllGlobals());

function world(nodes: GraphDefinition["nodes"]) {
  const def: GraphDefinition = { slug: "fixture", version: 1, vpOwner: "engineering", description: "isolated containment fixture", nodes };
  const run: RunRow = { id: "fixture-run", graph: def.slug, status: "running", started_at: NOW };
  const steps: StepRow[] = [];
  const values = new Map<string, string>();
  const ports: GraphRunnerPorts = {
    now: () => new Date(NOW),
    substrate: {
      getRun: async () => run,
      loadSteps: async () => steps.map((s) => ({ ...s })),
      startStep: async ({ node }) => { const id = `step-${steps.length}`; steps.push({ id, node, status: "running", started_at: NOW }); return id; },
      finishStep: async (id, result) => { Object.assign(steps.find((s) => s.id === id)!, result); },
      finishRun: async (_, status) => { run.status = status; },
      recordOutcome: vi.fn(async () => "outcome"),
      readHarvest: vi.fn(async () => ({ n: 4, total: 66923770 })),
      snapshot: vi.fn(async () => "LEGACY 66923770"),
      publishedToday: vi.fn(async () => 0),
      startRun: vi.fn(async () => "child"),
      storeMemoryLessons: vi.fn(async () => ({ ok: true })),
      storePromptOverride: vi.fn(async () => ({ ok: true })),
      activeMemoryLessons: vi.fn(async () => "LEGACY 66923770"),
      activePromptOverrides: vi.fn(async () => ({ critique: "LEGACY 66923770" })),
    },
    artifacts: { get: async (_, node) => values.get(node) ?? null, set: async (_, node, value) => { values.set(node, value); } },
    hermes: { task: vi.fn(async () => ({ ok: true, output: "fixture content", engineUsed: "fixture", ms: 1 })), publish: vi.fn(async () => ({ ok: true, detail: "fixture" })) },
    telegram: vi.fn(async () => {}),
  };
  const seed = (node: string, value: string | null, status: StepRow["status"] = "succeeded") => {
    steps.push({ id: `seed-${node}`, node, status, started_at: NOW });
    if (value !== null) values.set(node, value);
  };
  return { def, run, ports, steps, values, seed, tick: () => advanceRun(def, run.id, ports) };
}

describe("G03 containment: actual runner and worker ports", () => {
  it.each(["x_impressions", "linkedinpage_impressions", "youtube_views", "instagramstandalone_reach"])("blocks pending %s harvest without touching raw records", async (metric) => {
    const w = world([{ id: "harvest", kind: "harvest", dependsOn: [], config: { metric } }, { id: "verdict", kind: "verdict", dependsOn: ["harvest"] }]);
    w.seed("harvest", null, "waiting");
    await w.tick();
    await w.tick();
    expect(w.ports.substrate.readHarvest).not.toHaveBeenCalled();
    expect(w.ports.substrate.recordOutcome).not.toHaveBeenCalled();
    expect(w.values.get("harvest")).toMatch(INVALID);
    expect(w.steps.find((s) => s.node === "verdict")?.summary).toMatch(INVALID);
    expect(JSON.stringify(vi.mocked(w.ports.telegram).mock.calls)).not.toContain("66923770");
  });

  it.each(["outcomes", "tuning"])("suppresses %s evidence before SQL or substrate read", async (source) => {
    const sql = vi.fn(async () => { throw new Error("legacy evidence must not be queried"); });
    await expect(buildSnapshot(sql as unknown as postgres.Sql, source, 30)).resolves.toMatch(INVALID);
    expect(sql).not.toHaveBeenCalled();
    const w = world([{ id: "evidence", kind: "snapshot", dependsOn: [], config: { source } }]);
    await w.tick();
    expect(w.ports.substrate.snapshot).not.toHaveBeenCalled();
    expect(w.values.get("evidence")).toMatch(INVALID);
  });

  // Reconciliation F-D/§2.5d: memory and cadence keep their PUBLICATION facts
  // (counts of `published via` steps) and replace every metric-derived
  // section with the partial marker. ops.agent_outcome is never queried.
  it.each(["memory", "cadence"])("%s snapshot keeps publication facts, never touches ops.agent_outcome, and carries the partial marker", async (source) => {
    const queried: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const text = strings.join("$");
      queried.push(text);
      if (text.includes("ops.agent_outcome")) throw new Error("legacy evidence must not be queried");
      if (text.includes("published via")) {
        return [{ graph: "sphere-x", summary: "published via postiz channel=x", started_at: "2026-09-10T10:00:00Z" }];
      }
      return [];
    });
    const text = await buildSnapshot(sql as unknown as postgres.Sql, source, 30);
    expect(text.startsWith(PARTIAL)).toBe(true);
    expect(text).not.toContain("66923770");
    expect(queried.some((q) => q.includes("ops.agent_outcome"))).toBe(false);
    const w = world([{ id: "evidence", kind: "snapshot", dependsOn: [], config: { source } }]);
    await w.tick();
    expect(w.ports.substrate.snapshot).toHaveBeenCalled();
  });

  it("an EMPTY partial snapshot still carries the partial marker (the legacy guard must not mistake it for old evidence)", async () => {
    const w = world([{ id: "evidence", kind: "snapshot", dependsOn: [], config: { source: "memory" } }]);
    vi.mocked(w.ports.substrate.snapshot).mockResolvedValueOnce("");
    await w.tick();
    expect(w.values.get("evidence")?.startsWith(PARTIAL)).toBe(true);
    expect((await w.tick()).status).not.toBe("failed");
  });

  it("halts an already-started report before reading old inflated artifacts", async () => {
    const w = world([{ id: "evidence", kind: "snapshot", dependsOn: [], config: { source: "outcomes" } }, { id: "report", kind: "report", dependsOn: ["evidence"] }]);
    w.seed("evidence", "legacy 66923770");
    expect((await w.tick()).status).toBe("failed");
    expect(w.ports.telegram).not.toHaveBeenCalled();
    expect(w.values.get("evidence")).toBe("legacy 66923770"); // history preserved
  });

  it("blocks A/B derived verdicts even with legacy non-social artifact aliases", async () => {
    const w = world([{ id: "a", kind: "wait", dependsOn: [], config: { hours: 0 } }, { id: "b", kind: "wait", dependsOn: [], config: { hours: 0 } }, { id: "verdict", kind: "verdict", dependsOn: ["a", "b"], config: { compare: "ab" } }]);
    w.seed("a", JSON.stringify({ metric: "fixture_metric", n: 1, total: 200 }));
    w.seed("b", JSON.stringify({ metric: "fixture_metric", n: 1, total: 1 }));
    await w.tick();
    expect(w.ports.substrate.recordOutcome).not.toHaveBeenCalled();
    expect(w.steps.find((s) => s.node === "verdict")?.summary).toMatch(INVALID);
  });

  // Reconciliation F-D: learning graphs end SKIPPED (run succeeded, nothing
  // executed) — no failed run for the incident detector to cluster every
  // schedule, no LLM, no store, no Telegram. Old approvals grant nothing.
  it.each(["memory-lessons", "prompt-override"])("skips an old approved %s learning run before any effects — no failed run, no store, no LLM, no Telegram", async (target) => {
    const w = world([{ id: "approved", kind: "approval", dependsOn: [] }, { id: "store", kind: "store", dependsOn: ["approved"], config: { target } }]);
    w.seed("approved", "legacy approved draft");
    expect((await w.tick()).status).toBe("completed");
    expect(w.run.status).toBe("succeeded");
    const marker = w.steps.find((s) => s.node === "__invalid_g03__");
    expect(marker?.status).toBe("skipped");
    expect(marker?.summary).toMatch(INVALID);
    expect(w.ports.substrate.storeMemoryLessons).not.toHaveBeenCalled();
    expect(w.ports.substrate.storePromptOverride).not.toHaveBeenCalled();
    expect(w.ports.hermes.task).not.toHaveBeenCalled();
    expect(w.ports.telegram).not.toHaveBeenCalled();
  });

  it("defends worker ports without a DB query (including dynamic history)", async () => {
    const sql = vi.fn(async () => { throw new Error("DB forbidden"); });
    const ports = buildPorts(sql as unknown as postgres.Sql, {} as Redis);
    await expect(ports.substrate.readHarvest("x_impressions", NOW)).rejects.toThrow(INVALID);
    await expect(ports.substrate.recordOutcome({ stepId: "x", metric: "ab_hook", valueBefore: 1, valueAfter: 2 })).rejects.toThrow(INVALID);
    await expect(ports.substrate.activeMemoryLessons!()).resolves.toBeNull();
    await expect(ports.substrate.activePromptOverrides!()).resolves.toBeNull();
    await expect(ports.substrate.storeMemoryLessons!({ runId: "x", lessons: "legacy lesson" })).resolves.toMatchObject({ ok: false, reason: expect.stringMatching(INVALID) });
    await expect(ports.substrate.storePromptOverride!({ runId: "x", promptKey: "critique", body: "legacy" })).resolves.toMatchObject({ ok: false, reason: expect.stringMatching(INVALID) });
    expect(sql).not.toHaveBeenCalled();
  });

  it("preserves unrelated operational snapshot paths", async () => {
    const sql = vi.fn(async () => []);
    await buildSnapshot(sql as unknown as postgres.Sql, "ops", 7);
    expect(sql).toHaveBeenCalled();
    const w = world([{ id: "ops", kind: "snapshot", dependsOn: [], config: { source: "ops" } }]);
    await w.tick();
    expect(w.ports.substrate.snapshot).toHaveBeenCalledWith({ source: "ops", days: 14, metricPrefix: undefined });
  });

  // Reconciliation F-C: a legacy marketing run is NOT killed — it is marked,
  // the founder is warned ONCE, and its human gate decides. Nothing publishes
  // by itself; the warning names the risk (drafts may cite invalid metrics).
  it("warns ONCE about a legacy marketing run instead of killing it; the marker records the review", async () => {
    const w = world([{ id: "draft", kind: "task", dependsOn: [] }, { id: "report", kind: "report", dependsOn: ["draft"] }]);
    w.def.vpOwner = "marketing";
    w.seed("draft", "draft embedding old learned 66923770 impressions");
    const first = await w.tick();
    expect(first.status).not.toBe("failed");
    expect(w.values.get("__g03_evidence_v1__")?.startsWith(PARTIAL)).toBe(true);
    const warnings = vi.mocked(w.ports.telegram).mock.calls.filter((c) => String(c[0]).includes("G03"));
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0]![0])).toContain("Reveja o TEXTO antes de aprovar");
    expect(w.steps.find((s) => s.node === "__g03_review__")?.status).toBe("succeeded");
    await w.tick();
    expect(vi.mocked(w.ports.telegram).mock.calls.filter((c) => String(c[0]).includes("G03"))).toHaveLength(1);
    expect(w.ports.hermes.publish).not.toHaveBeenCalled();
  });

  it("a legacy marketing run at its HUMAN GATE continues past an old snapshot artifact (F-C); a report-only engineering run is halted", async () => {
    const gated = world([
      { id: "memory", kind: "snapshot", dependsOn: [], config: { source: "outcomes" } },
      { id: "approval", kind: "approval", dependsOn: ["memory"] },
    ]);
    gated.def.vpOwner = "marketing";
    gated.seed("memory", "RESULTADOS REAIS legacy 66923770");
    gated.seed("approval", null, "waiting");
    expect((await gated.tick()).status).not.toBe("failed");
    expect(gated.run.status).toBe("running");
    expect(gated.values.get("memory")).toBe("RESULTADOS REAIS legacy 66923770"); // history preserved
  });

  it("a fresh marketing draft retains static prompts but never loads legacy learning", async () => {
    const w = world([{ id: "critic", kind: "debate", dependsOn: [], config: { prompt: "critique" } }]);
    w.def.vpOwner = "marketing";
    await w.tick();
    expect(w.ports.hermes.task).toHaveBeenCalled();
    expect(w.ports.substrate.activeMemoryLessons).not.toHaveBeenCalled();
    expect(w.ports.substrate.activePromptOverrides).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(w.ports.hermes.task).mock.calls)).not.toContain("66923770");
    expect(w.values.get("__g03_evidence_v1__")).toMatch(INVALID);
  });
});

describe("G04 actual single-verdict path", () => {
  it.each([null, "{", "{}", "null", "[]", '{"metric":"fixture_metric","total":"4","n":1}', '{"metric":"fixture_metric","total":2,"n":0}', '{"metric":"fixture_metric","total":1e999,"n":1}', '{"metric":"fixture_metric","total":4,"n":1.5}'])("does not turn %s into a zero or measured outcome", async (raw) => {
    const w = world([{ id: "input", kind: "wait", dependsOn: [], config: { hours: 0 } }, { id: "verdict", kind: "verdict", dependsOn: ["input"] }]);
    w.seed("input", raw);
    await w.tick();
    expect(w.ports.substrate.recordOutcome).not.toHaveBeenCalled();
    expect(w.steps.find((s) => s.node === "verdict")?.summary).toContain("invalid_harvest");
  });

  it("preserves a real zero with a positive sample count — for an ALLOWLISTED metric only", async () => {
    const w = world([{ id: "input", kind: "wait", dependsOn: [], config: { hours: 0 } }, { id: "verdict", kind: "verdict", dependsOn: ["input"] }]);
    w.seed("input", JSON.stringify({ metric: "sales_reply_rate_fixture", total: 0, n: 1 }));
    await w.tick();
    expect(w.ports.substrate.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ metric: "sales_reply_rate_fixture", valueAfter: 0 }));
  });

  it("an UNKNOWN metric name is quarantined by default (allowlist, not denylist) — a well-formed measurement is still not recorded", async () => {
    const w = world([{ id: "input", kind: "wait", dependsOn: [], config: { hours: 0 } }, { id: "verdict", kind: "verdict", dependsOn: ["input"] }]);
    w.seed("input", JSON.stringify({ metric: "linkedin_impressions", total: 320, n: 1 }));
    await w.tick();
    expect(w.ports.substrate.recordOutcome).not.toHaveBeenCalled();
    expect(w.steps.find((s) => s.node === "verdict")?.summary).toMatch(INVALID);
  });
});
