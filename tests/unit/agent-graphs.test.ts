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
  WEEKLY_PRODUCT_GRAPH,
  WEEKLY_DISCOVERY_GRAPH,
  CONTENT_EXPERIMENT_GRAPH,
  SPHERE_INSTAGRAM_GRAPH,
  SPHERE_TIKTOK_GRAPH,
  SPHERE_YOUTUBE_GRAPH,
  SPHERE_PPC_GRAPH,
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

  it("IMPOSSIBLE: spawn with no approval upstream — nothing launches without a human", () => {
    const r = validateGraph(base([
      { id: "plan", kind: "task", dependsOn: [] },
      { id: "go", kind: "spawn", dependsOn: ["plan"], config: { spawns: ["content-experiment"] } },
    ]));
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain("nothing spawns an experiment without a human");
  });

  it("a spawn must name a non-empty list of graph slugs to launch", () => {
    const r = validateGraph(base([
      { id: "plan", kind: "task", dependsOn: [] },
      { id: "ok", kind: "approval", dependsOn: ["plan"] },
      { id: "go", kind: "spawn", dependsOn: ["ok"], config: { spawns: [] } },
    ]));
    expect(r.errors.join()).toContain("non-empty string[]");
  });

  it("a spawn WITH an approval upstream and a real target is accepted", () => {
    const r = validateGraph(base([
      { id: "plan", kind: "task", dependsOn: [] },
      { id: "ok", kind: "approval", dependsOn: ["plan"] },
      { id: "go", kind: "spawn", dependsOn: ["ok"], config: { spawns: ["content-experiment"] } },
    ]));
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });
});

describe("validateGraph — the agent-org graphs", () => {
  it("accepts the Watchdog, the CDO, the CPO, the discovery, and the experiment cell", () => {
    for (const def of [DAILY_WATCHDOG_GRAPH, DAILY_DREAM_GRAPH, WEEKLY_PRODUCT_GRAPH, WEEKLY_DISCOVERY_GRAPH, CONTENT_EXPERIMENT_GRAPH]) {
      const r = validateGraph(def);
      expect(r.errors, def.slug).toEqual([]);
      expect(r.valid).toBe(true);
    }
  });

  it("the Watchdog, the CPO and the discovery are PURE read-only — no publish, no spawn", () => {
    // The CPO exists because the org had no product owner (founder, 13/08);
    // discovery matures ideas but turning them into MVPs is the founder's call.
    for (const def of [DAILY_WATCHDOG_GRAPH, WEEKLY_PRODUCT_GRAPH, WEEKLY_DISCOVERY_GRAPH]) {
      const kinds = new Set(def.nodes.map((n) => n.kind));
      expect(kinds.has("publish"), `${def.slug} must not publish`).toBe(false);
      expect(kinds.has("spawn"), `${def.slug} must not spawn`).toBe(false);
      expect(kinds.has("report"), `${def.slug} must report`).toBe(true);
    }
  });

  it("the CDO never publishes directly; any spawn it has is gated by a human", () => {
    const kinds = DAILY_DREAM_GRAPH.nodes.map((n) => n.kind);
    expect(kinds.includes("publish")).toBe(false); // it proposes + spawns, never posts
    expect(kinds.includes("report")).toBe(true); // the brief always lands
    // Its spawn (the experiment launch) validated — meaning an approval sits
    // upstream of it (the hard rule). The graph being valid IS the proof.
    expect(validateGraph(DAILY_DREAM_GRAPH).valid).toBe(true);
    expect(kinds.includes("spawn")).toBe(true);
  });

  it("the spawned cell publishes — but only behind its own approval and harvest", () => {
    // content-experiment IS a publishing graph; it passing validation proves it
    // has an approval upstream of publish and a harvest downstream (two gates).
    const kinds = new Set(CONTENT_EXPERIMENT_GRAPH.nodes.map((n) => n.kind));
    expect(kinds.has("publish")).toBe(true);
    expect(kinds.has("approval")).toBe(true);
    expect(kinds.has("harvest")).toBe(true);
    expect(validateGraph(CONTENT_EXPERIMENT_GRAPH).valid).toBe(true);
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

  it("v4: a VIRALITY critic sits in the debate, reads memory, and the synthesis waits for it", () => {
    // Founder 17/08: the scripts were stiff and corporate. The virality lens
    // judges hook / watch-time / share trigger and vetoes ad-or-slide-deck.
    const virality = DAILY_VIDEO_GRAPH.nodes.find((n) => n.config?.["lens"] === "virality");
    expect(virality, "daily-video must carry a virality critic").toBeTruthy();
    expect(virality!.kind).toBe("debate");
    expect(virality!.dependsOn).toEqual(expect.arrayContaining(["angle-a", "angle-b", "angle-c", "memory"]));
    const synthesis = DAILY_VIDEO_GRAPH.nodes.find((n) => n.id === "synthesis")!;
    expect(synthesis.dependsOn).toContain(virality!.id);
    expect(DAILY_VIDEO_GRAPH.version).toBeGreaterThanOrEqual(4);
  });
});

describe("content alive on every platform (17/08) — the new cells", () => {
  it("IG / TikTok / YouTube spheres validate, are marketing-owned, gated, and close their own loop", () => {
    const expected: Array<[GraphDefinition, string, string, string]> = [
      [SPHERE_INSTAGRAM_GRAPH, "instagram", "instagram_", "instagram_reach"],
      [SPHERE_TIKTOK_GRAPH, "tiktok", "tiktok_", "tiktok_views"],
      [SPHERE_YOUTUBE_GRAPH, "youtube", "youtube_", "youtube_views"],
    ];
    for (const [def, channel, prefix, metric] of expected) {
      const v = validateGraph(def);
      expect(v.errors, def.slug).toEqual([]);
      expect(def.vpOwner).toBe("marketing");
      const byId = new Map(def.nodes.map((n) => [n.id, n]));
      expect(byId.get("memory")!.config?.["metricPrefix"]).toBe(prefix);
      expect(byId.get("publish")!.config?.["channel"]).toBe(channel);
      expect(byId.get("publish")!.dependsOn).toEqual(["approval"]);
      expect(byId.get("harvest")!.config?.["metric"]).toBe(metric);
      // Two drafts, one critic that also reads memory (freshness against the record).
      expect(byId.get("draft-talking-head")).toBeTruthy();
      expect(byId.get("draft-caption-story")).toBeTruthy();
      expect(byId.get("critic")!.dependsOn).toContain("memory");
    }
  });

  it("no cell publishes to LinkedIn twice — the daily video already owns that adaptation", () => {
    for (const def of [SPHERE_INSTAGRAM_GRAPH, SPHERE_TIKTOK_GRAPH, SPHERE_YOUTUBE_GRAPH, SPHERE_PPC_GRAPH]) {
      const linkedinPublish = def.nodes.filter((n) => n.kind === "publish" && n.config?.["channel"] === "linkedin");
      expect(linkedinPublish, def.slug).toEqual([]);
    }
  });

  it("PPC is READ-ONLY and ZERO SPEND: no publish, no spawn, no approval — it can only report", () => {
    const v = validateGraph(SPHERE_PPC_GRAPH);
    expect(v.errors).toEqual([]);
    expect(SPHERE_PPC_GRAPH.vpOwner).toBe("marketing");
    expect(SPHERE_PPC_GRAPH.nodes.some((n) => n.kind === "publish" || n.kind === "spawn")).toBe(false);
    expect(SPHERE_PPC_GRAPH.nodes.some((n) => n.kind === "report")).toBe(true);
    // Three networks, one critic over all three, finalize joins drafts + critic.
    const ads = SPHERE_PPC_GRAPH.nodes.filter((n) => n.config?.["prompt"] === "ppc-draft").map((n) => n.config?.["network"]);
    expect(ads.sort()).toEqual(["google-search", "linkedin", "meta"]);
    expect(SPHERE_PPC_GRAPH.description.toLowerCase()).toContain("zero spend");
  });
});
