/**
 * Graph brain (#164, the pure half) — definitions, validation, readiness.
 *
 * The two rules that matter most are enforced at DEFINITION time and tested
 * here as impossibilities, not behaviours:
 *  - a graph that publishes without a human upstream cannot exist;
 *  - a graph that publishes without a harvest downstream cannot exist.
 * The five-times disease (act without reading back) is a validation error
 * before it can ever be a production incident.
 */
import { describe, it, expect } from "vitest";
import {
  validateGraph,
  readyNodes,
  isRunComplete,
  DAILY_VIDEO_GRAPH,
  DAILY_WATCHDOG_GRAPH,
  DAILY_DREAM_GRAPH,
  type GraphDefinition,
  type NodeStates,
} from "../../apps/api/src/lib/agent-graphs";

/** Minimal valid skeleton to mutate per test. */
function base(nodes: GraphDefinition["nodes"]): GraphDefinition {
  return { slug: "t", version: 1, vpOwner: "marketing", description: "t", nodes };
}

describe("validateGraph — structure", () => {
  it("accepts the real daily-video graph", () => {
    const r = validateGraph(DAILY_VIDEO_GRAPH);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("rejects duplicate ids, unknown deps, self-deps and empty graphs", () => {
    expect(validateGraph(base([])).valid).toBe(false);
    expect(
      validateGraph(base([
        { id: "a", kind: "task", dependsOn: [] },
        { id: "a", kind: "task", dependsOn: [] },
      ])).errors.join()
    ).toContain("duplicate");
    expect(
      validateGraph(base([{ id: "a", kind: "task", dependsOn: ["ghost"] }])).errors.join()
    ).toContain("unknown node");
    expect(
      validateGraph(base([{ id: "a", kind: "task", dependsOn: ["a"] }])).errors.join()
    ).toContain("itself");
  });

  it("rejects a cycle", () => {
    const r = validateGraph(base([
      { id: "a", kind: "task", dependsOn: ["b"] },
      { id: "b", kind: "task", dependsOn: ["a"] },
    ]));
    expect(r.valid).toBe(false);
  });
});

describe("validateGraph — the hard rules", () => {
  it("IMPOSSIBLE: publish with no approval upstream", () => {
    const r = validateGraph(base([
      { id: "draft", kind: "task", dependsOn: [] },
      { id: "publish", kind: "publish", dependsOn: ["draft"] },
      { id: "wait", kind: "wait", dependsOn: ["publish"], config: { hours: 72 } },
      { id: "harvest", kind: "harvest", dependsOn: ["wait"], config: { metric: "m" } },
    ]));
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain("nothing publishes without a human");
  });

  it("IMPOSSIBLE: publish with no harvest downstream — write-only publishing", () => {
    const r = validateGraph(base([
      { id: "draft", kind: "task", dependsOn: [] },
      { id: "ok", kind: "approval", dependsOn: ["draft"] },
      { id: "publish", kind: "publish", dependsOn: ["ok"] },
    ]));
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain("never reads back");
  });

  it("waits must be bounded and harvests must name their metric", () => {
    const r = validateGraph(base([
      { id: "w", kind: "wait", dependsOn: [] },
      { id: "h", kind: "harvest", dependsOn: ["w"] },
    ]));
    expect(r.errors.join()).toContain("config.hours");
    expect(r.errors.join()).toContain("config.metric");
  });

  it("a snapshot must name its source and a report must have upstream", () => {
    const r = validateGraph(base([
      { id: "snap", kind: "snapshot", dependsOn: [] }, // no config.source
      { id: "rep", kind: "report", dependsOn: [] }, // root report has nothing to deliver
    ]));
    expect(r.errors.join()).toContain("config.source");
    expect(r.errors.join()).toContain("reports nothing");
  });
});

describe("validateGraph — the read-only brains (agent-org core)", () => {
  it("accepts the Watchdog and the Chief Dreaming Officer graphs", () => {
    for (const def of [DAILY_WATCHDOG_GRAPH, DAILY_DREAM_GRAPH]) {
      const r = validateGraph(def);
      expect(r.errors, def.slug).toEqual([]);
      expect(r.valid).toBe(true);
    }
  });

  it("both brains are read-only by construction — no publish, no spend", () => {
    for (const def of [DAILY_WATCHDOG_GRAPH, DAILY_DREAM_GRAPH]) {
      const kinds = new Set(def.nodes.map((n) => n.kind));
      expect(kinds.has("publish"), `${def.slug} must not publish`).toBe(false);
      // They end in a report to the founder — a proposal, never an action.
      expect(def.nodes.some((n) => n.kind === "report"), `${def.slug} must report`).toBe(true);
    }
  });
});

describe("readyNodes — the scheduler's one question", () => {
  it("roots are ready at the start; nothing else is", () => {
    const ready = readyNodes(DAILY_VIDEO_GRAPH, {});
    // v2: memory (perception of what was already published) is a root too.
    expect(ready.map((n) => n.id).sort()).toEqual(["memory", "signal"]);
  });

  it("fan-out needs no operator: the three angles become ready together", () => {
    const states: NodeStates = { memory: "succeeded", signal: "succeeded", briefing: "succeeded" };
    expect(readyNodes(DAILY_VIDEO_GRAPH, states).map((n) => n.id).sort()).toEqual([
      "angle-a",
      "angle-b",
      "angle-c",
    ]);
  });

  it("the join waits for the WHOLE fan-out — two of three angles is not enough", () => {
    const states: NodeStates = {
      memory: "succeeded",
      signal: "succeeded",
      briefing: "succeeded",
      "angle-a": "succeeded",
      "angle-b": "succeeded",
      "angle-c": "running",
    };
    expect(readyNodes(DAILY_VIDEO_GRAPH, states)).toEqual([]);
  });

  it("a failed dependency blocks its downstream instead of starting broken work", () => {
    const states: NodeStates = { signal: "failed", memory: "succeeded" };
    expect(readyNodes(DAILY_VIDEO_GRAPH, states)).toEqual([]);
    expect(isRunComplete(DAILY_VIDEO_GRAPH, states)).toBe(true);
  });

  it("a run is not complete while anything runs or waits", () => {
    expect(isRunComplete(DAILY_VIDEO_GRAPH, { signal: "running" })).toBe(false);
    const allButVerdict: NodeStates = Object.fromEntries(
      DAILY_VIDEO_GRAPH.nodes.map((n) => [n.id, "succeeded" as const])
    );
    allButVerdict["verdict"] = undefined;
    expect(isRunComplete(DAILY_VIDEO_GRAPH, allButVerdict)).toBe(false);
    const all: NodeStates = Object.fromEntries(
      DAILY_VIDEO_GRAPH.nodes.map((n) => [n.id, "succeeded" as const])
    );
    expect(isRunComplete(DAILY_VIDEO_GRAPH, all)).toBe(true);
  });
});

describe("the first graph is the company's own loop", () => {
  it("publish sits strictly after founder approval and strictly before harvest", () => {
    const byId = new Map(DAILY_VIDEO_GRAPH.nodes.map((n) => [n.id, n]));
    expect(byId.get("publish")!.dependsOn).toEqual(["founder-approval"]);
    expect(byId.get("wait-72h")!.dependsOn).toEqual(["publish"]);
    expect(byId.get("harvest")!.dependsOn).toEqual(["wait-72h"]);
    expect(byId.get("verdict")!.dependsOn).toEqual(["harvest"]);
  });

  it("the debate is four DISTINCT lenses, not copies — freshness joined in v2", () => {
    const lenses = DAILY_VIDEO_GRAPH.nodes
      .filter((n) => n.kind === "debate")
      .map((n) => n.config?.["lens"]);
    // v2 (founder, 12/08): repeated images/hooks shipped because no critic was
    // LOOKING for repetition. The freshness lens exists to reject it, and it
    // must read the memory artifact to have something to compare against.
    expect(new Set(lenses).size).toBe(lenses.length);
    expect(lenses).toContain("freshness");
    const freshness = DAILY_VIDEO_GRAPH.nodes.find((n) => n.config?.["lens"] === "freshness");
    expect(freshness!.dependsOn).toContain("memory");
  });
});
