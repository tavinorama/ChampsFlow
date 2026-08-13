/**
 * agent-graphs.ts — the BRAIN half of the orchestrator (#164): versioned
 * graph definitions, structural validation, and node-readiness logic.
 *
 * Deliberately pure — no I/O, no clock, no Hermes calls. The runner (the
 * BODY: HTTP to the Hermes Task Server, BullMQ delays for waits, substrate
 * writes per node) arrives with #161b, because it cannot be proven working
 * until Hermes can write. This half CAN be proven now, by unit test, and it
 * is where every rule that must never be violated lives:
 *
 *  - NOTHING PUBLISHES WITHOUT A HUMAN. validateGraph rejects any definition
 *    where a 'publish'-kind node is not strictly downstream of an 'approval'
 *    node. The hard rule is enforced at the DEFINITION level — a graph that
 *    would publish autonomously cannot exist, let alone run.
 *  - EVERY PUBLISH LEARNS. A publish node with no 'harvest' downstream is
 *    rejected: write-only publishing is the five-times disease (video,
 *    plan_task, w_member_social...), and here it is a validation error.
 *  - The definition is DATA, versioned, and diffable — each one is a
 *    showable artifact (the founder's "vendável no todo e em parte"), and
 *    changing a graph is a reviewed PR, not a redeploy.
 *
 * Vocabulary (task #164): task · debate (fan-out) · synthesis (join) ·
 * approval (human, Telegram) · publish · wait · harvest · verdict.
 *
 * Agent-org core (2026-08-13, founder's "sistema PICA"): two read-only kinds
 * let a graph reason over the company's OWN record instead of only the outside
 * world —
 *  - snapshot: the runner (which HAS the substrate) reads a bounded, PII-free
 *    digest of ops.* into an artifact the LLM lenses downstream reason over.
 *    The engines can't reach the DB; the runner injects the data.
 *  - report: deliver the synthesis to the founder (Telegram) and finish. No
 *    publish, no spend, no spawn — the Watchdog and the Chief Dreaming Officer
 *    PROPOSE, they do not act. The acting primitive (spawn, gated by approval)
 *    arrives with the experiment-cell it needs.
 */

import type { VpOwner } from "./agent-substrate";

export type NodeKind =
  | "task"
  | "debate"
  | "synthesis"
  | "approval"
  | "publish"
  | "wait"
  | "harvest"
  | "verdict"
  | "snapshot"
  | "report";

export interface GraphNode {
  /** Node slug, unique within the graph — becomes ops.agent_step.node. */
  id: string;
  kind: NodeKind;
  /** Node ids that must SUCCEED before this node may start. [] = root. */
  dependsOn: string[];
  /**
   * Kind-specific parameters, e.g. { hours: 72 } on a wait,
   * { metric: 'yt_views_72h' } on a harvest, { prompt: '...' } on a task.
   * Opaque to the brain; the runner interprets it.
   */
  config?: Record<string, unknown>;
}

export interface GraphDefinition {
  /** Stable slug — becomes ops.agent_run.graph. */
  slug: string;
  /** Bumped on ANY change; the run records which version it executed. */
  version: number;
  vpOwner: VpOwner;
  /** Short human description — what this graph produces. */
  description: string;
  nodes: GraphNode[];
}

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
}

/** All node ids reachable strictly DOWNSTREAM of `fromId` (children-of...). */
function downstreamOf(def: GraphDefinition, fromId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const n of def.nodes) {
    for (const dep of n.dependsOn) {
      childrenOf.set(dep, [...(childrenOf.get(dep) ?? []), n.id]);
    }
  }
  const out = new Set<string>();
  const stack = [...(childrenOf.get(fromId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return out;
}

/** All node ids strictly UPSTREAM of `fromId` (ancestors). */
function upstreamOf(def: GraphDefinition, fromId: string): Set<string> {
  const byId = new Map(def.nodes.map((n) => [n.id, n]));
  const out = new Set<string>();
  const stack = [...(byId.get(fromId)?.dependsOn ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(byId.get(id)?.dependsOn ?? []));
  }
  return out;
}

export function validateGraph(def: GraphDefinition): GraphValidationResult {
  const errors: string[] = [];
  const ids = def.nodes.map((n) => n.id);
  const idSet = new Set(ids);

  if (def.version < 1 || !Number.isInteger(def.version)) {
    errors.push(`version must be a positive integer, got ${def.version}`);
  }
  if (ids.length !== idSet.size) {
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    errors.push(`duplicate node id(s): ${[...new Set(dup)].join(", ")}`);
  }
  for (const n of def.nodes) {
    for (const dep of n.dependsOn) {
      if (!idSet.has(dep)) errors.push(`node '${n.id}' depends on unknown node '${dep}'`);
      if (dep === n.id) errors.push(`node '${n.id}' depends on itself`);
    }
  }
  if (def.nodes.length === 0) errors.push("graph has no nodes");
  if (!def.nodes.some((n) => n.dependsOn.length === 0) && def.nodes.length > 0) {
    errors.push("graph has no root node (every node has dependencies)");
  }

  // Cycle detection — Kahn's algorithm; leftover nodes are on a cycle.
  {
    const indeg = new Map(def.nodes.map((n) => [n.id, n.dependsOn.filter((d) => idSet.has(d)).length]));
    const queue = def.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
    let seen = 0;
    while (queue.length > 0) {
      const id = queue.shift()!;
      seen++;
      for (const n of def.nodes) {
        if (!n.dependsOn.includes(id)) continue;
        const d = (indeg.get(n.id) ?? 0) - 1;
        indeg.set(n.id, d);
        if (d === 0) queue.push(n.id);
      }
    }
    if (seen < def.nodes.length && errors.length === 0) {
      errors.push("graph contains a cycle");
    }
  }

  // HARD RULE (founder): nothing publishes without a human upstream.
  for (const n of def.nodes) {
    if (n.kind !== "publish") continue;
    const ancestors = upstreamOf(def, n.id);
    const hasApproval = [...ancestors].some(
      (id) => def.nodes.find((x) => x.id === id)?.kind === "approval"
    );
    if (!hasApproval) {
      errors.push(
        `publish node '${n.id}' has no approval node upstream — nothing publishes without a human (hard rule)`
      );
    }
    // EVERY PUBLISH LEARNS: a publish with no harvest downstream is
    // write-only — the five-times disease, rejected at definition time.
    const below = downstreamOf(def, n.id);
    const hasHarvest = [...below].some(
      (id) => def.nodes.find((x) => x.id === id)?.kind === "harvest"
    );
    if (!hasHarvest) {
      errors.push(
        `publish node '${n.id}' has no harvest node downstream — a publish that never reads back is the disease this system exists to cure`
      );
    }
  }

  // Wait nodes must declare their duration — an unbounded wait is a hang.
  for (const n of def.nodes) {
    if (n.kind === "wait" && typeof n.config?.["hours"] !== "number") {
      errors.push(`wait node '${n.id}' must declare config.hours`);
    }
    if (n.kind === "harvest" && typeof n.config?.["metric"] !== "string") {
      errors.push(`harvest node '${n.id}' must declare config.metric`);
    }
    // A snapshot must name WHAT it reads — the runner routes on it, and an
    // unnamed source is a snapshot that reads nothing (silent-empty lenses).
    if (n.kind === "snapshot" && typeof n.config?.["source"] !== "string") {
      errors.push(`snapshot node '${n.id}' must declare config.source`);
    }
    // A report delivers an upstream artifact to the founder — a root report
    // has nothing to deliver, which is always an authoring mistake.
    if (n.kind === "report" && n.dependsOn.length === 0) {
      errors.push(`report node '${n.id}' has no upstream to deliver — a root report reports nothing`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** What the runner has recorded so far, keyed by node id. */
export type NodeStates = Record<
  string,
  "succeeded" | "failed" | "skipped" | "running" | "waiting" | undefined
>;

/**
 * The scheduler's one question: which nodes may start NOW?
 * A node is ready when it has not started and every dependency SUCCEEDED.
 * A failed/skipped dependency blocks its whole downstream — the runner
 * decides whether that fails the run; the brain only refuses to start work
 * whose inputs don't exist. Parallelism needs no operator: the debate's
 * critics all depend on the same parent, so they all become ready together.
 */
export function readyNodes(def: GraphDefinition, states: NodeStates): GraphNode[] {
  return def.nodes.filter((n) => {
    if (states[n.id] !== undefined) return false;
    return n.dependsOn.every((dep) => states[dep] === "succeeded");
  });
}

/** True when no node can ever start again — the run is over. */
export function isRunComplete(def: GraphDefinition, states: NodeStates): boolean {
  if (readyNodes(def, states).length > 0) return false;
  return !def.nodes.some(
    (n) => states[n.id] === "running" || states[n.id] === "waiting"
  );
}

// ---------------------------------------------------------------------------
// The first graph: the daily video, rewritten as data (#164 Fase 1).
// This is the loop from the operating overview, verbatim — and the artifact
// a prospect can be shown: the company's own content pipeline, as a diagram
// that actually runs.
// ---------------------------------------------------------------------------

export const DAILY_VIDEO_GRAPH: GraphDefinition = {
  slug: "daily-video",
  version: 2,
  vpOwner: "marketing",
  description:
    "Daily social video with MEMORY: recall what was already published (themes, hooks, b-roll) → signal → briefing that must not repeat → 3 angles → 4 critics (hook/brand/compliance/freshness) → synthesis → human approval → publish → wait 72h → harvest reach → verdict.",
  nodes: [
    // v2 (founder, 12/08): the videos were repeating images and hooks because
    // nothing LOOKED at what was already made. Perception before creation:
    // this node reads the recent production log and lists what to avoid.
    { id: "memory", kind: "task", dependsOn: [], config: { prompt: "video-memory" } },
    { id: "signal", kind: "task", dependsOn: [], config: { prompt: "collect-signals" } },
    { id: "briefing", kind: "task", dependsOn: ["signal", "memory"], config: { prompt: "write-briefing" } },
    // Three angles from one briefing — same parent, so they run in parallel.
    { id: "angle-a", kind: "task", dependsOn: ["briefing"], config: { prompt: "draft-angle", angle: "story" } },
    { id: "angle-b", kind: "task", dependsOn: ["briefing"], config: { prompt: "draft-angle", angle: "contrarian" } },
    { id: "angle-c", kind: "task", dependsOn: ["briefing"], config: { prompt: "draft-angle", angle: "how-to" } },
    // Each critic sees ALL angles (joins the fan-out) through a distinct lens.
    { id: "critic-hook", kind: "debate", dependsOn: ["angle-a", "angle-b", "angle-c"], config: { lens: "hook" } },
    { id: "critic-brand", kind: "debate", dependsOn: ["angle-a", "angle-b", "angle-c"], config: { lens: "brand" } },
    { id: "critic-compliance", kind: "debate", dependsOn: ["angle-a", "angle-b", "angle-c"], config: { lens: "compliance" } },
    // v2: the freshness critic also reads the memory artifact — its whole job
    // is comparing the angles against what was already published.
    { id: "critic-freshness", kind: "debate", dependsOn: ["angle-a", "angle-b", "angle-c", "memory"], config: { lens: "freshness" } },
    { id: "synthesis", kind: "synthesis", dependsOn: ["critic-hook", "critic-brand", "critic-compliance", "critic-freshness"] },
    // Telegram, always. The validator will not accept this graph without it.
    { id: "founder-approval", kind: "approval", dependsOn: ["synthesis"], config: { channel: "telegram" } },
    { id: "publish", kind: "publish", dependsOn: ["founder-approval"], config: { via: "postiz" } },
    { id: "wait-72h", kind: "wait", dependsOn: ["publish"], config: { hours: 72 } },
    { id: "harvest", kind: "harvest", dependsOn: ["wait-72h"], config: { metric: "yt_views_72h" } },
    // The verdict writes agent_outcome + the sphere's lesson, re-weighting
    // the next run's signal — the loop's closing edge.
    { id: "verdict", kind: "verdict", dependsOn: ["harvest"] },
  ],
};

// ---------------------------------------------------------------------------
// The Watchdog (agent-org core): keep every process LEAN and clear.
//
// The opposite of a content graph — it produces no post, spends nothing, and
// touches no customer. It reads the company's OWN record (ops.*) and reasons
// through three kaizen lenses, then hands the founder a short list of what to
// cut or fix. It PROPOSES; it never edits. Read-only by construction: no
// publish node, no spawn, no approval — so it can run itself, daily, forever.
//
// This is the "auto-ajustável" half of the founder's vision: the system that
// watches the system. It subsumes the one-off #157 (red team) and #153
// (promise-vs-delivery audit) as CONTINUOUS lenses instead of annual events.
// ---------------------------------------------------------------------------

export const DAILY_WATCHDOG_GRAPH: GraphDefinition = {
  slug: "daily-watchdog",
  version: 1,
  vpOwner: "ceo",
  description:
    "LEAN watchdog: read the company's own operational record (runs, steps, cost, cycle time, redundancy) → analyze through 3 kaizen lenses (custo-por-resultado, tempo-de-ciclo, redundância) → synthesize the top cuts/fixes → report to the founder. Proposes, never edits. Read-only: no publish, no spend.",
  nodes: [
    // The runner reads a bounded, PII-free digest of ops.* into an artifact.
    { id: "ops-snapshot", kind: "snapshot", dependsOn: [], config: { source: "ops", days: 14 } },
    // Three lenses, same input, parallel — each names one kind of waste.
    { id: "lens-cost", kind: "debate", dependsOn: ["ops-snapshot"], config: { prompt: "watchdog-cost" } },
    { id: "lens-cycle", kind: "debate", dependsOn: ["ops-snapshot"], config: { prompt: "watchdog-cycle" } },
    { id: "lens-redundancy", kind: "debate", dependsOn: ["ops-snapshot"], config: { prompt: "watchdog-redundancy" } },
    { id: "synthesis", kind: "synthesis", dependsOn: ["lens-cost", "lens-cycle", "lens-redundancy"], config: { prompt: "watchdog-synthesis" } },
    // Deliver to the founder. No approval — nothing is being done, only said.
    { id: "report", kind: "report", dependsOn: ["synthesis"], config: { title: "🐕 WATCHDOG LEAN — cortes e correções propostas" } },
  ],
};

// ---------------------------------------------------------------------------
// The Chief Dreaming Officer (agent-org core): imagine the 10x, grounded.
//
// The "proativo" half. It reads what actually MOVED (ops.agent_outcome: the
// harvested lift per metric per graph) and asks, through three growth lenses,
// "how does this reach 10x more people / 100x the result?" — then ranks the
// hypotheses and hands the founder the bets, cheapest-first. Grounded, not
// vibes: a dream that ignores the harvest (10x on a dead channel) is ranked
// last by construction, because the lenses see the real numbers.
//
// v1 REPORTS the ranked bets — it does not yet spawn experiments. The acting
// primitive (a gated `spawn` into an experiment cell) is the next drop; until
// an experiment cell exists to spawn into, autonomous spawning would be a
// primitive with no honest consumer. Read-only, like the Watchdog.
// ---------------------------------------------------------------------------

export const DAILY_DREAM_GRAPH: GraphDefinition = {
  slug: "daily-dream",
  version: 1,
  vpOwner: "ceo",
  description:
    "Chief Dreaming Officer: read what actually moved (agent_outcome lift per metric/graph) → imagine the 10x through 3 growth lenses (alcance, conversão, fosso) → rank the hypotheses cheapest-first → report the bets to the founder. Grounded in the real harvest; read-only (proposes, does not spawn yet).",
  nodes: [
    { id: "outcome-snapshot", kind: "snapshot", dependsOn: [], config: { source: "outcomes", days: 30 } },
    { id: "lens-reach", kind: "debate", dependsOn: ["outcome-snapshot"], config: { prompt: "dream-reach" } },
    { id: "lens-conversion", kind: "debate", dependsOn: ["outcome-snapshot"], config: { prompt: "dream-conversion" } },
    { id: "lens-moat", kind: "debate", dependsOn: ["outcome-snapshot"], config: { prompt: "dream-moat" } },
    { id: "synthesis", kind: "synthesis", dependsOn: ["lens-reach", "lens-conversion", "lens-moat"], config: { prompt: "dream-synthesis" } },
    { id: "report", kind: "report", dependsOn: ["synthesis"], config: { title: "🌙 CHIEF DREAMING OFFICER — apostas 10x (mais barata primeiro)" } },
  ],
};
