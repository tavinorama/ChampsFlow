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
 *    publish, no spend — the Watchdog PROPOSES, it does not act.
 *
 * CDO acts (2026-08-13): the acting primitive that closes the dream→test loop —
 *  - spawn: start experiment runs of another registered graph, SEEDED with the
 *    approved hypothesis. Gated exactly like publish: validateGraph rejects a
 *    spawn that is not strictly downstream of an approval, so the machine can
 *    never launch an experiment without a human. The spawned run then hits its
 *    OWN approval before it publishes — two gates on any path to the public.
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
  | "report"
  | "spawn"
  | "store";

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
    // A store must name WHERE it persists — the runner routes on it, and an
    // unnamed target is a write that lands nowhere (silent-empty memory).
    if (n.kind === "store" && typeof n.config?.["target"] !== "string") {
      errors.push(`store node '${n.id}' must declare config.target`);
    }
    // A spawn must name what it launches; an empty spawn is a no-op that looks
    // like an action — the exact kind of silent nothing this system forbids.
    if (n.kind === "spawn") {
      const spawns = n.config?.["spawns"];
      if (!Array.isArray(spawns) || spawns.length === 0 || !spawns.every((s) => typeof s === "string")) {
        errors.push(`spawn node '${n.id}' must declare config.spawns as a non-empty string[] of graph slugs`);
      }
    }
  }

  // HARD RULE (CDO acts): nothing spawns an experiment without a human. A spawn
  // commits the company to work that will eventually publish; it is gated by an
  // approval upstream exactly like publish. Enforced at definition time — a
  // graph that would launch experiments autonomously cannot exist.
  for (const n of def.nodes) {
    if (n.kind !== "spawn") continue;
    const ancestors = upstreamOf(def, n.id);
    const hasApproval = [...ancestors].some(
      (id) => def.nodes.find((x) => x.id === id)?.kind === "approval"
    );
    if (!hasApproval) {
      errors.push(
        `spawn node '${n.id}' has no approval node upstream — nothing spawns an experiment without a human (hard rule)`
      );
    }
  }

  // HARD RULE (5.F.1): nothing self-activates as durable memory without a
  // human. A store node persists text that will steer every future critic —
  // it is gated by an approval upstream exactly like publish and spawn.
  // Enforced at definition time: a graph that would write its own memory
  // without the founder's yes cannot exist.
  for (const n of def.nodes) {
    if (n.kind !== "store") continue;
    const ancestors = upstreamOf(def, n.id);
    const hasApproval = [...ancestors].some(
      (id) => def.nodes.find((x) => x.id === id)?.kind === "approval"
    );
    if (!hasApproval) {
      errors.push(
        `store node '${n.id}' has no approval node upstream — nothing self-activates as durable memory without a human (hard rule)`
      );
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
  version: 4,
  vpOwner: "marketing",
  description:
    "Daily social video with MEMORY: recall what was already published (themes, hooks, b-roll) → signal → briefing that must not repeat → 3 angles (vertical 9:16, 25-40s, phone-shot feel, hook ≤1s, captions per beat) → 5 critics (hook/brand/compliance/freshness/VIRALITY — the last vetoes anything that reads like an ad or a slide deck) → synthesis (script + [RENDER BRIEF] + [CHANNEL VARIANTS]) → ADAPT to a native LinkedIn post (English) → human approval → publish → wait 72h → harvest reach → verdict.",
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
    // v4 (founder, 17/08 — "o vídeo tem que parecer VIVO"): the scripts were
    // clean, stiff, corporate. This lens judges what actually performs now:
    // hook strength, watch-time (does beat 2 hold them), share/comment
    // trigger, "would I stop scrolling". It VETOES anything that reads like an
    // ad or a slide deck. It also reads memory, so a hook already used loses.
    { id: "critic-virality", kind: "debate", dependsOn: ["angle-a", "angle-b", "angle-c", "memory"], config: { lens: "virality" } },
    { id: "synthesis", kind: "synthesis", dependsOn: ["critic-hook", "critic-brand", "critic-compliance", "critic-freshness", "critic-virality"] },
    // v3 (founder, 13/08 — "a publicação foi totalmente inadequada"): the raw
    // video script (PT, [HOOK]/[BEAT] markers) went to LinkedIn verbatim
    // because nothing adapted it to the destination. This node is the missing
    // step: script → native English LinkedIn post. THIS artifact is what the
    // approval gates and what the publish posts.
    { id: "linkedin-post", kind: "task", dependsOn: ["synthesis"], config: { prompt: "video-to-linkedin" } },
    // Telegram, always. The validator will not accept this graph without it.
    { id: "founder-approval", kind: "approval", dependsOn: ["linkedin-post"], config: { channel: "telegram" } },
    { id: "publish", kind: "publish", dependsOn: ["founder-approval"], config: { channel: "linkedin", via: "postiz" } },
    { id: "wait-72h", kind: "wait", dependsOn: ["publish"], config: { hours: 72 } },
    // v3: the metric prefix must match what the #162 harvest actually writes
    // (youtube_views_7d) — 'yt_views' matched NOTHING and Saturday's verdict
    // would have been a false zero with 478 real views on the books.
    { id: "harvest", kind: "harvest", dependsOn: ["wait-72h"], config: { metric: "youtube_views" } },
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
// v2 (CDO acts): the brief STILL lands every run (the report tail off the
// synthesis — read-only, always delivered). A SECOND tail lets the founder turn
// the top bet into a real experiment: approval → spawn(content-experiment),
// seeded with the ranked bets. The spawned run has its own approval before it
// publishes, so there are two human gates on any path to the public. If the
// founder ignores the launch approval, only the acting tail parks — the brief
// was already delivered.
// ---------------------------------------------------------------------------

export const DAILY_DREAM_GRAPH: GraphDefinition = {
  slug: "daily-dream",
  version: 2,
  vpOwner: "ceo",
  description:
    "Chief Dreaming Officer: read what actually moved (agent_outcome lift per metric/graph) → imagine the 10x through 3 growth lenses (alcance, conversão, fosso) → rank the hypotheses cheapest-first → (a) report the bets to the founder, always; (b) on the founder's approval, SPAWN a seeded content-experiment to test the top bet. Grounded in the real harvest; two human gates before anything publishes.",
  nodes: [
    { id: "outcome-snapshot", kind: "snapshot", dependsOn: [], config: { source: "outcomes", days: 30 } },
    { id: "lens-reach", kind: "debate", dependsOn: ["outcome-snapshot"], config: { prompt: "dream-reach" } },
    { id: "lens-conversion", kind: "debate", dependsOn: ["outcome-snapshot"], config: { prompt: "dream-conversion" } },
    { id: "lens-moat", kind: "debate", dependsOn: ["outcome-snapshot"], config: { prompt: "dream-moat" } },
    { id: "synthesis", kind: "synthesis", dependsOn: ["lens-reach", "lens-conversion", "lens-moat"], config: { prompt: "dream-synthesis" } },
    // Tail A — the brief, always delivered (read-only).
    { id: "report", kind: "report", dependsOn: ["synthesis"], config: { title: "🌙 CHIEF DREAMING OFFICER — apostas 10x (mais barata primeiro)" } },
    // Tail B — the founder may launch the top bet as a real experiment.
    // Optional + timed: declining (or ignoring for 96h) skips the acting tail,
    // it does NOT fail the run — the brief already landed. This is what keeps a
    // strategic brief from being marked FAILED just because no experiment ran.
    { id: "launch-approval", kind: "approval", dependsOn: ["synthesis"], config: { channel: "telegram", optional: true, timeoutHours: 96, question: "Aprovar = lançar a aposta #1 como experimento real (content-experiment). Rejeitar = só o brief hoje." } },
    { id: "spawn-experiment", kind: "spawn", dependsOn: ["launch-approval"], config: { spawns: ["content-experiment"] } },
    { id: "launch-report", kind: "report", dependsOn: ["spawn-experiment"], config: { title: "🚀 EXPERIMENTO LANÇADO — a aposta virou um run de verdade" } },
  ],
};

// ---------------------------------------------------------------------------
// The content-experiment cell (CDO's landing pad): a lean content run the CDO
// spawns to TEST a hypothesis. Seeded with the approved bet (the runner writes
// it into this run's __seed__ artifact; the brief node reads it). Smaller than
// the daily video — one draft, one compliance gate, one post — because an
// experiment is a probe, not the flagship. It carries its OWN approval and its
// OWN harvest, so it satisfies the same hard rules as any publishing graph:
// nothing publishes without a human, every publish reads its reach back.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The CPO (founder, 13/08: "na estrutura da empresa falta o responsável pelo
// produto"). The org's third brain — Watchdog owns operations, CDO owns
// growth, and until now NOBODY owned what customers actually receive. The CPO
// reads a PII-free aggregate snapshot of the product itself (audits run,
// failure rate, score averages, engine drift, funnel, credit consumption) and
// reasons through 3 product lenses:
//  - qualidade: are the audits reliable? (failure rate, engine drift, cycle)
//  - valor: are customers getting value? (usage, funnel conversion, credits)
//  - honestidade: promessa × entrega — the #153 audit as a CONTINUOUS lens.
// Read-only like the Watchdog: no publish, no spawn — it reports to the
// founder, who decides. vpOwner engineering (product lives under VP Eng).
// ---------------------------------------------------------------------------

export const WEEKLY_PRODUCT_GRAPH: GraphDefinition = {
  slug: "weekly-product",
  version: 1,
  vpOwner: "engineering",
  description:
    "CPO (Chief Product Officer): read the product's own PII-free aggregates (audits, failure rate, scores, engine drift, funnel, credit usage) → 3 product lenses (qualidade, valor, honestidade promessa×entrega) → synthesize the top product priorities → report to the founder. Proposes, never edits. Read-only: no publish, no spend.",
  nodes: [
    { id: "product-snapshot", kind: "snapshot", dependsOn: [], config: { source: "product", days: 14 } },
    { id: "lens-quality", kind: "debate", dependsOn: ["product-snapshot"], config: { prompt: "product-quality" } },
    { id: "lens-value", kind: "debate", dependsOn: ["product-snapshot"], config: { prompt: "product-value" } },
    { id: "lens-honesty", kind: "debate", dependsOn: ["product-snapshot"], config: { prompt: "product-honesty" } },
    { id: "synthesis", kind: "synthesis", dependsOn: ["lens-quality", "lens-value", "lens-honesty"], config: { prompt: "product-synthesis" } },
    { id: "report", kind: "report", dependsOn: ["synthesis"], config: { title: "📦 CPO — prioridades de produto da semana" } },
  ],
};

// ---------------------------------------------------------------------------
// weekly-discovery (founder, 13/08): "o CDO e o CPO também devem ser
// responsáveis pela busca de melhoria dos produtos e pela pesquisa de novos
// produtos de forma ativa, pelo menos uma vez por semana — e isso deve chegar
// em mim depois da ideia estar pronta para o primeiro MVP."
//
// The rule has two halves and the graph encodes both:
//  1. ACTIVE search, weekly — a research node that looks OUTWARD (market,
//     competitors, new pains in the GEO space), joined with what we already
//     know inward (product aggregates + real outcomes).
//  2. The founder only sees a MATURE idea — the pipeline ideates, DEVELOPS the
//     best idea into an MVP-ready spec, and passes it through a viability
//     critic WITH VETO before anything reaches Telegram. A vetoed week reports
//     "nenhuma ideia madura" honestly instead of forcing a weak one.
//
// Co-owned by the CDO (growth eye) and the CPO (product eye) — the substrate
// records one vpOwner, so it runs as 'ceo' (the layer both report to).
// Read-only: no publish, no spawn — turning the spec into an MVP is the
// founder's call.
// ---------------------------------------------------------------------------

export const WEEKLY_DISCOVERY_GRAPH: GraphDefinition = {
  slug: "weekly-discovery",
  version: 1,
  vpOwner: "ceo",
  description:
    "CDO+CPO discovery: active weekly research (market/competitors/new pains) + product aggregates + real outcomes → ideate improvements AND new products → develop the best idea into an MVP-ready spec → viability critic with VETO → report to the founder ONLY when the idea is mature (or say honestly that none matured). Read-only.",
  nodes: [
    // Outward: active research. Inward: what we have and what moved.
    { id: "research", kind: "task", dependsOn: [], config: { prompt: "discovery-research" } },
    { id: "product-snapshot", kind: "snapshot", dependsOn: [], config: { source: "product", days: 30 } },
    { id: "outcome-snapshot", kind: "snapshot", dependsOn: [], config: { source: "outcomes", days: 30 } },
    { id: "ideate", kind: "synthesis", dependsOn: ["research", "product-snapshot", "outcome-snapshot"], config: { prompt: "discovery-ideate" } },
    // Maturation: the best idea becomes an MVP-ready spec BEFORE any human sees it.
    { id: "develop", kind: "task", dependsOn: ["ideate"], config: { prompt: "discovery-develop" } },
    { id: "viability", kind: "debate", dependsOn: ["develop", "product-snapshot"], config: { prompt: "discovery-viability" } },
    { id: "final-spec", kind: "synthesis", dependsOn: ["develop", "viability"], config: { prompt: "discovery-final" } },
    { id: "report", kind: "report", dependsOn: ["final-spec"], config: { title: "💡 CDO+CPO — ideia pronta para o 1º MVP" } },
  ],
};

// ---------------------------------------------------------------------------
// The first SPECIALIST CELL (#156): the X sphere. The cell pattern the video
// proved — perception before creation, fan-out, critique, human gate, publish,
// READ THE REACH BACK — generalized to one channel with its OWN memory: the
// memory node reads only this sphere's harvested outcomes (metricPrefix 'x_'),
// so every post is written against the channel's real numbers.
//
// This cell is born with a mission the harvest dictated (13/08: 30 impressions
// across 8 posts — the channel is nearly dead): every briefing must confront
// that record and try something MEASURABLY different. The verdicts it writes
// accumulate the evidence; deciding to double down or quit the channel is the
// founder's call, fed by the Watchdog/CDO reading these very outcomes.
// ---------------------------------------------------------------------------

export const SPHERE_X_GRAPH: GraphDefinition = {
  slug: "sphere-x",
  version: 1,
  vpOwner: "marketing",
  description:
    "X (Twitter) specialist cell with its own memory: read this sphere's OWN harvested reach (x_* outcomes) → signal → briefing that must confront the channel's record → 2 drafts (punchy single vs mini-thread) → critic → finalize → human approval → publish to X → wait 72h → harvest x_impressions → verdict. The closed learning loop, one channel.",
  nodes: [
    // Perception before creation — the sphere's own numbers, not vibes.
    { id: "memory", kind: "snapshot", dependsOn: [], config: { source: "outcomes", days: 30, metricPrefix: "x_" } },
    { id: "signal", kind: "task", dependsOn: [], config: { prompt: "x-signal" } },
    { id: "briefing", kind: "task", dependsOn: ["signal", "memory"], config: { prompt: "x-briefing" } },
    { id: "draft-punchy", kind: "task", dependsOn: ["briefing"], config: { prompt: "x-draft", style: "punchy" } },
    { id: "draft-thread", kind: "task", dependsOn: ["briefing"], config: { prompt: "x-draft", style: "mini-thread" } },
    // The critic sees both drafts AND the memory — judged against the record.
    { id: "critic", kind: "debate", dependsOn: ["draft-punchy", "draft-thread", "memory"], config: { prompt: "x-critic" } },
    { id: "finalize", kind: "synthesis", dependsOn: ["draft-punchy", "draft-thread", "critic"], config: { prompt: "x-finalize" } },
    { id: "approval", kind: "approval", dependsOn: ["finalize"], config: { channel: "telegram" } },
    { id: "publish", kind: "publish", dependsOn: ["approval"], config: { channel: "x", via: "postiz" } },
    { id: "wait-72h", kind: "wait", dependsOn: ["publish"], config: { hours: 72 } },
    { id: "harvest", kind: "harvest", dependsOn: ["wait-72h"], config: { metric: "x_impressions" } },
    { id: "verdict", kind: "verdict", dependsOn: ["harvest"] },
  ],
};

/**
 * #156, second specialist cell: LinkedIn. Same closed loop as sphere-x, its
 * OWN memory (linkedin_* outcomes), and the channel's own grammar: LinkedIn
 * rewards a story with a lesson, not a punch. Two drafts — a first-person
 * story and a contrarian take — judged against what this sphere already
 * published. LinkedIn is where the org proved approval→publish (13/08), so
 * this cell inherits the adapt discipline: English, native to the feed,
 * never a raw script.
 */
export const SPHERE_LINKEDIN_GRAPH: GraphDefinition = {
  slug: "sphere-linkedin",
  version: 1,
  vpOwner: "marketing",
  description:
    "LinkedIn specialist cell with its own memory: read this sphere's OWN harvested reach (linkedin* outcomes) → signal → briefing that must confront the channel's record → 2 drafts (story vs contrarian) → critic → finalize → human approval → publish to LinkedIn → wait 72h → harvest linkedinpage_impressions → verdict.",
  nodes: [
    { id: "memory", kind: "snapshot", dependsOn: [], config: { source: "outcomes", days: 30, metricPrefix: "linkedin_" } },
    { id: "signal", kind: "task", dependsOn: [], config: { prompt: "linkedin-signal" } },
    { id: "briefing", kind: "task", dependsOn: ["signal", "memory"], config: { prompt: "linkedin-briefing" } },
    { id: "draft-story", kind: "task", dependsOn: ["briefing"], config: { prompt: "linkedin-draft", style: "story" } },
    { id: "draft-contrarian", kind: "task", dependsOn: ["briefing"], config: { prompt: "linkedin-draft", style: "contrarian" } },
    { id: "critic", kind: "debate", dependsOn: ["draft-story", "draft-contrarian", "memory"], config: { prompt: "linkedin-critic" } },
    { id: "finalize", kind: "synthesis", dependsOn: ["draft-story", "draft-contrarian", "critic"], config: { prompt: "linkedin-finalize" } },
    { id: "approval", kind: "approval", dependsOn: ["finalize"], config: { channel: "telegram" } },
    { id: "publish", kind: "publish", dependsOn: ["approval"], config: { channel: "linkedin", via: "postiz" } },
    { id: "wait-72h", kind: "wait", dependsOn: ["publish"], config: { hours: 72 } },
    // 22/08 sweep: the VPS 07:40 collector writes 'linkedinpage_*_7d' (never
    // 'linkedin_*') — the old 'linkedin_impressions' prefix-matched NOTHING and
    // this sphere closed blind. Same class as the 13/08 'yt_views' bug.
    { id: "harvest", kind: "harvest", dependsOn: ["wait-72h"], config: { metric: "linkedinpage_impressions" } },
    { id: "verdict", kind: "verdict", dependsOn: ["harvest"] },
  ],
};

/**
 * #156, third specialist cell: the blog. Different shape ON PURPOSE. The blog
 * has no Postiz channel — articles ship through the CI blog-autopublish
 * pipeline (Monday 12:00, PR + auto-merge). So this cell does the THINKING
 * the pipeline lacks (memory of what was published, a real angle, an
 * outline judged by a critic) and ends in a REPORT to the founder: the brief
 * + outline, ready to feed the pipeline. Read-only by construction (no
 * publish, no spawn), so it can run itself weekly and never violates the
 * "nothing publishes without approval" rule — it publishes nothing.
 */
export const SPHERE_BLOG_GRAPH: GraphDefinition = {
  slug: "sphere-blog",
  version: 1,
  vpOwner: "marketing",
  description:
    "Blog specialist cell (read-only): recall what the blog already covered (blog_* outcomes + memory) → signal (what people search/ask about GEO now) → editorial briefing that must not repeat → 2 outlines (how-to vs data-story) → critic (freshness + honesty) → finalize → REPORT the brief+outline to the founder for the blog-autopublish pipeline. Publishes nothing itself.",
  nodes: [
    { id: "memory", kind: "snapshot", dependsOn: [], config: { source: "outcomes", days: 60, metricPrefix: "blog_" } },
    { id: "signal", kind: "task", dependsOn: [], config: { prompt: "blog-signal" } },
    { id: "briefing", kind: "task", dependsOn: ["signal", "memory"], config: { prompt: "blog-briefing" } },
    { id: "outline-howto", kind: "task", dependsOn: ["briefing"], config: { prompt: "blog-outline", style: "how-to" } },
    { id: "outline-data", kind: "task", dependsOn: ["briefing"], config: { prompt: "blog-outline", style: "data-story" } },
    { id: "critic", kind: "debate", dependsOn: ["outline-howto", "outline-data", "memory"], config: { prompt: "blog-critic" } },
    { id: "finalize", kind: "synthesis", dependsOn: ["outline-howto", "outline-data", "critic"], config: { prompt: "blog-finalize" } },
    { id: "report", kind: "report", dependsOn: ["finalize"], config: { title: "📝 Blog da semana: briefing + outline (esfera blog)" } },
  ],
};

/**
 * sphere-reddit (2026-08-18): the first cell built specifically to CONSUME the
 * Signal Engine's "where to act" queue — the [__signals__] block the runner
 * injects into every marketing-owned graph (#485). Reddit has NO publish
 * adapter and we are not building one: this cell REPORTS ONLY. It turns the
 * real opportunities (subreddit, thread URL, evidence) into a weekly founder
 * brief — "here is where to show up on Reddit this week, with the exact move"
 * — and, when the Signal Engine envs are absent, the [__signals__] block says
 * SEM DADO, the prompts degrade honestly and the brief states plainly there is
 * no external signal yet. It never invents threads. Read-only by construction
 * (no publish, no approval, no harvest, no spawn), so the "nothing publishes
 * without a human" rule holds trivially: it publishes nothing.
 */
export const SPHERE_REDDIT_GRAPH: GraphDefinition = {
  slug: "sphere-reddit",
  version: 1,
  vpOwner: "marketing",
  description:
    "Reddit specialist cell (read-only, publishes NOTHING): consume the Signal Engine's 'where to act' queue ([__signals__], injected because marketing-owned) → recall what we already engaged (reddit_* outcomes + memory) → signal (read the REAL opportunities from [__signals__]; if SEM DADO, say so, never invent threads) → briefing → two moves (respond in a ranking thread vs start our own valuable thread) → critic (Reddit culture: no astroturf, disclose affiliation where the sub requires, add value not spam; freshness vs memory) → finalize (best 2-3 moves) → REPORT to the founder 'onde aparecer no Reddit'. Fail-open honest when the SIGNAL_ENGINE envs are unset.",
  nodes: [
    { id: "memory", kind: "snapshot", dependsOn: [], config: { source: "outcomes", days: 60, metricPrefix: "reddit_" } },
    { id: "signal", kind: "task", dependsOn: [], config: { prompt: "reddit-signal" } },
    { id: "briefing", kind: "task", dependsOn: ["signal", "memory"], config: { prompt: "reddit-briefing" } },
    // Two native Reddit moves: answer inside an existing ranking thread, or
    // start our own genuinely useful thread. Each is honest value, never spam.
    { id: "plan-comment", kind: "task", dependsOn: ["briefing"], config: { prompt: "reddit-plan", style: "comment" } },
    { id: "plan-post", kind: "task", dependsOn: ["briefing"], config: { prompt: "reddit-plan", style: "post" } },
    { id: "critic", kind: "debate", dependsOn: ["plan-comment", "plan-post", "memory"], config: { prompt: "reddit-critic", lens: "compliance-authenticity" } },
    { id: "finalize", kind: "synthesis", dependsOn: ["plan-comment", "plan-post", "critic"], config: { prompt: "reddit-finalize" } },
    { id: "report", kind: "report", dependsOn: ["finalize"], config: { title: "👽 Reddit desta semana: onde aparecer (esfera reddit)" } },
  ],
};

export const CONTENT_EXPERIMENT_GRAPH: GraphDefinition = {
  slug: "content-experiment",
  version: 1,
  vpOwner: "marketing",
  description:
    "Seeded content experiment: take an approved growth hypothesis (seed) → brief → draft a single test post → compliance critic → finalize → human approval → publish → wait 48h → harvest reach → verdict. The CDO's dream, turned into one real, measured shot.",
  nodes: [
    // Root reads the seeded hypothesis (__seed__) the spawning run wrote.
    { id: "brief", kind: "task", dependsOn: [], config: { prompt: "experiment-brief" } },
    { id: "draft", kind: "task", dependsOn: ["brief"], config: { prompt: "experiment-draft" } },
    { id: "critic", kind: "debate", dependsOn: ["draft"], config: { prompt: "experiment-critic", lens: "compliance" } },
    { id: "finalize", kind: "synthesis", dependsOn: ["draft", "critic"], config: { prompt: "experiment-finalize" } },
    { id: "approval", kind: "approval", dependsOn: ["finalize"], config: { channel: "telegram" } },
    { id: "publish", kind: "publish", dependsOn: ["approval"], config: { channel: "linkedin", via: "postiz" } },
    { id: "wait-48h", kind: "wait", dependsOn: ["publish"], config: { hours: 48 } },
    // 22/08 sweep: NO collector writes 'experiment_reach_48h' — the old name
    // matched nothing and every experiment verdict was blind. The experiment
    // publishes to LinkedIn (node above), so it reads the same collector rows
    // as the LinkedIn sphere: the VPS writes 'linkedinpage_*_7d'.
    { id: "harvest", kind: "harvest", dependsOn: ["wait-48h"], config: { metric: "linkedinpage_impressions" } },
    { id: "verdict", kind: "verdict", dependsOn: ["harvest"] },
  ],
};

// ---------------------------------------------------------------------------
// Content on EVERY platform (founder, 17/08): the cell pattern the X and
// LinkedIn spheres proved, extended to the short-video channels — Instagram
// Reels, TikTok, YouTube Shorts — each with its OWN memory (metricPrefix), its
// own native grammar (prompts), its own approval, its own harvest. The daily
// video graph already adapts to LinkedIn, so LinkedIn is NOT duplicated here.
// All three are marketing-owned, so the runner injects [__day__] into every
// reasoning node — the editorial calendar keeps the week diverse per channel.
// ---------------------------------------------------------------------------

/**
 * Builds a short-video sphere cell. One shape, three channels: the only things
 * that differ are the slug, the memory prefix, the publish channel, the
 * harvest metric and the prompt family — kept as data so a fourth channel is
 * one call, not one more hand-copied graph that can drift.
 *
 * REPORT-ONLY desde 22/08 (decisão B5). Estas três esferas produzem ROTEIRO +
 * [RENDER BRIEF] em texto, e Instagram/TikTok/YouTube exigem um arquivo de
 * mídia: o Postiz recusa com "You need one media" / "No video / images
 * selected". Resultado até aqui: 0 publicações na história dos três canais, e
 * — pior — o founder gastava cliques de aprovação em runs condenados (o
 * sphere-youtube de 22/08 rodou 7 nós em claude, foi APROVADO às 15:20 e
 * morreu às 15:40 no publish).
 *
 * Enquanto o nó de render não existir (Remotion vive na VPS; o payload do
 * publish é {channel, post}, sem mídia), a cauda approval→publish→wait→
 * harvest→verdict sai e a célula termina em REPORT — o roteiro chega pronto no
 * Telegram e o founder grava/publica quando quiser. Honesto: não finge que
 * publica. Reversível: devolver a cauda é este bloco de volta.
 */
function shortVideoSphere(input: {
  slug: string;
  channel: string;
  prefix: string;
  /** Kept for when the render node lands and the harvest tail returns. */
  metric: string;
  promptFamily: string;
  description: string;
  reportIcon: string;
  reportTitle: string;
}): GraphDefinition {
  const p = input.promptFamily;
  return {
    slug: input.slug,
    version: 1,
    vpOwner: "marketing",
    description: input.description,
    nodes: [
      // Perception before creation — this channel's own harvested numbers.
      { id: "memory", kind: "snapshot", dependsOn: [], config: { source: "outcomes", days: 30, metricPrefix: input.prefix } },
      { id: "signal", kind: "task", dependsOn: [], config: { prompt: `${p}-signal` } },
      { id: "briefing", kind: "task", dependsOn: ["signal", "memory"], config: { prompt: `${p}-briefing` } },
      // Two drafts, two native formats: face-to-camera vs caption-driven story.
      { id: "draft-talking-head", kind: "task", dependsOn: ["briefing"], config: { prompt: `${p}-draft`, style: "talking-head" } },
      { id: "draft-caption-story", kind: "task", dependsOn: ["briefing"], config: { prompt: `${p}-draft`, style: "caption-story" } },
      // The critic carries the virality lens INSIDE it (hook, watch-time,
      // share trigger) plus compliance + freshness against [memory].
      { id: "critic", kind: "debate", dependsOn: ["draft-talking-head", "draft-caption-story", "memory"], config: { prompt: `${p}-critic` } },
      { id: "finalize", kind: "synthesis", dependsOn: ["draft-talking-head", "draft-caption-story", "critic"], config: { prompt: `${p}-finalize` } },
      // B5 (22/08): sem nó de render, publicar aqui é falha garantida — o
      // roteiro vai para o founder e ele grava/publica. `input.channel` e
      // `input.metric` seguem no tipo para o dia em que a cauda voltar.
      {
        id: "report",
        kind: "report",
        dependsOn: ["finalize"],
        config: { title: `${input.reportIcon} ${input.reportTitle} — roteiro pronto para gravar (${input.channel})` },
      },
    ],
  };
}

export const SPHERE_INSTAGRAM_GRAPH: GraphDefinition = shortVideoSphere({
  slug: "sphere-instagram",
  reportIcon: "📷",
  reportTitle: "Instagram Reels",
  channel: "instagram",
  prefix: "instagram_",
  // 22/08 sweep: the VPS 07:40 collector writes 'instagramstandalone_*_7d'
  // (Postiz's channel name), never 'instagram_*' — the old 'instagram_reach'
  // prefix-matched NOTHING and this sphere closed blind after the 48h grace.
  metric: "instagramstandalone_reach",
  promptFamily: "instagram",
  description:
    "Instagram Reels specialist cell with its own memory: read this sphere's OWN harvested reach (instagram* outcomes) → signal → briefing → 2 drafts (talking-head vs caption-story, vertical, phone-shot feel) → critic (virality + compliance + freshness) → finalize (script + [RENDER BRIEF] + caption + hashtags policy) → REPORT the script to the founder (report-only até existir nó de render: Instagram exige mídia e o publish de texto é recusado — decisão B5, 22/08).",
});

export const SPHERE_TIKTOK_GRAPH: GraphDefinition = shortVideoSphere({
  slug: "sphere-tiktok",
  reportIcon: "🎵",
  reportTitle: "TikTok",
  channel: "tiktok",
  prefix: "tiktok_",
  // HONEST GAP (22/08 sweep): the VPS 07:40 collector does NOT write any
  // tiktok_* outcome yet — this harvest closes SEM DADO via the 48h grace
  // (no false zero, says so on Telegram) until a TikTok collector exists on
  // the VPS (founder's item, off-repo). The name stays as the contract that
  // collector must write to.
  metric: "tiktok_views",
  promptFamily: "tiktok",
  description:
    "TikTok specialist cell with its own memory: read this sphere's OWN harvested views (tiktok_* outcomes) → signal (hook culture, sounds, formats) → briefing → 2 drafts (talking-head vs caption-story) → critic (virality + compliance + freshness) → finalize (script + [RENDER BRIEF] + on-screen text) → REPORT the script to the founder (report-only até existir nó de render: TikTok exige mídia — decisão B5, 22/08).",
});

export const SPHERE_YOUTUBE_GRAPH: GraphDefinition = shortVideoSphere({
  slug: "sphere-youtube",
  reportIcon: "▶️",
  reportTitle: "YouTube Shorts",
  channel: "youtube",
  prefix: "youtube_",
  metric: "youtube_views",
  promptFamily: "youtube",
  description:
    "YouTube Shorts specialist cell with its own memory: read this sphere's OWN harvested views (youtube_* outcomes) → signal → briefing → 2 drafts (talking-head vs caption-story, Shorts pacing) → critic (virality + compliance + freshness) → finalize (script + [RENDER BRIEF] + title + description; on the weekly long-form day the finalize also carries a long-form outline) → REPORT the script to the founder (report-only até existir nó de render: YouTube exige mídia — decisão B5, 22/08). LinkedIn is NOT touched here — the daily-video graph already owns that adaptation.",
});

// ---------------------------------------------------------------------------
// The PPC cell (founder, 17/08): paid ads with ZERO SPEND. Ads are money, and
// money is a founder-gated live switch (AGENTS.md) — so this cell has NO
// publish node and NO spawn node by construction: it cannot spend, it cannot
// launch. It reads what content actually resonated (outcomes, 30d, all
// spheres), turns that into 3 ready-to-paste ad drafts (Google search, Meta,
// LinkedIn), runs them through a compliance+claims critic, and REPORTS them to
// the founder. Turning a draft into a live campaign is a human act, off-repo.
// Weekly (Tue 08:00 UTC): ads should follow the week's evidence, not the hour.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// weekly-report (5.E.5): o relatório de segunda ao founder, hoje montado à
// mão. O 15º grafo fecha esse buraco com o molde do Watchdog: read-only por
// construção (sem publish, sem approval, sem spawn — validateGraph nem
// aceitaria um publish aqui sem gate), dois snapshots paralelos da própria
// semana (ops 7d ‖ outcomes 7d) → um único nó de composição → report no
// Telegram. Segunda 07:30 UTC — depois dos brains das 06:30 (CDO/CPO), antes
// do dia útil começar: o founder abre a semana com o retrato dela pronta.
// Relatório INTERNO ao founder = PT (a regra English-first é sobre o que o
// PÚBLICO vê; o watchdog e o CPO já reportam em PT pelo mesmo motivo).
// ---------------------------------------------------------------------------

export const WEEKLY_REPORT_GRAPH: GraphDefinition = {
  slug: "weekly-report",
  // v2 (5.F.5): +nó 'cadence' — a válvula de cadência ganha a camada MEDIDA.
  version: 2,
  vpOwner: "ceo",
  description:
    "Relatório semanal ao founder (segunda 07:30 UTC), read-only: snapshot ops 7d ‖ snapshot outcomes 7d → compose (PT, denso, honesto — SÓ o que está nos snapshots, nunca inventa número: publicações por canal, falhas, custo total e por tenant se houver, aprovações, lift/vereditos, a semana que vem) → report no Telegram. v2 (5.F.5): + snapshot 'cadence' 30d — recomendação de cap por canal calculada 100% por código (posts/dia vs média por post), anexada VERBATIM ao report (o LLM nunca toca nesses números); o founder age via env CHANNEL_DAILY_CAP_<CANAL>, nada muda sozinho. Sem publish, sem spend, sem approval.",
  nodes: [
    // Duas leituras paralelas da MESMA semana: a operação (runs, falhas,
    // custo) e o resultado (lift por métrica/canal + rejeições do founder).
    { id: "ops-week", kind: "snapshot", dependsOn: [], config: { source: "ops", days: 7 } },
    { id: "outcomes-week", kind: "snapshot", dependsOn: [], config: { source: "outcomes", days: 7 } },
    // 5.F.5 — a válvula medida. 30d de janela (7d não dá amostra honesta para
    // estatística de cadência; a guarda de amostra mínima vive no código do
    // snapshot). O texto que sai daqui É a recomendação final, gerada por
    // SQL/código; por isso o nó alimenta o REPORT diretamente (verbatim),
    // nunca o compose — o modelo não pode reescrever número de cadência.
    { id: "cadence", kind: "snapshot", dependsOn: [], config: { source: "cadence", days: 30 } },
    { id: "compose", kind: "task", dependsOn: ["ops-week", "outcomes-week"], config: { prompt: "weekly-report-compose" } },
    // O report junta compose + cadence na ordem de dependsOn: o relatório do
    // LLM primeiro, a seção de cadência (código puro) colada embaixo.
    { id: "report", kind: "report", dependsOn: ["compose", "cadence"], config: { title: "🗞️ Semana da Ozvor — o relatório de segunda" } },
  ],
};

// ---------------------------------------------------------------------------
// memory-consolidation (5.F.1): a memória das esferas deixa de ser janela
// deslizante. Hoje o CONTENT_LESSONS é uma régua estática de 7 linhas no
// código e o contexto por-run esquece tudo a cada mês. Este grafo mensal
// (dia 1, 06:30 UTC) destila os últimos ~30 dias de RESULTADOS REAIS —
// publicações por canal, métricas colhidas, rejeições do founder (com o
// motivo literal), aprovações expiradas e vereditos — em lições duráveis por
// canal, no formato de régua de veto que os críticos já usam.
//
// A aggregação é SQL/código (snapshot source 'memory'); o LLM só ESCREVE as
// lições a partir dos fatos agregados — nunca adivinha schema nem inventa
// número (a regra do "vigia também mente"). As lições passam pelo gate padrão
// do Telegram (timeout 96h = rejeição) e SÓ as aprovadas viram memória ativa:
// o nó 'store' (validateGraph exige approval upstream, como publish/spawn)
// grava em ops.memory_lesson, e o runner injeta a última versão aprovada como
// [__memory__] nos críticos de marketing, ao lado de [__lessons__].
//
// CEO-owned de propósito: memória institucional é preocupação da organização,
// não de um canal — e assim o grafo nunca conta na válvula de aprovações de
// marketing nem recebe as injeções de conteúdo ([__day__] etc.) no próprio
// compose, que deve ver SÓ os fatos agregados.
// ---------------------------------------------------------------------------

export const MEMORY_CONSOLIDATION_GRAPH: GraphDefinition = {
  slug: "memory-consolidation",
  version: 1,
  vpOwner: "ceo",
  description:
    "Consolidação mensal de memória (5.F.1): snapshot dos fatos reais de 30d (publicações por canal, métricas colhidas, rejeições do founder com motivo, aprovações expiradas, vereditos) → compose (PT, máx 12 lições duráveis por canal, cada uma citando a evidência — SÓ fatos do snapshot, nunca inventa) → aprovação do founder no Telegram (96h; silêncio = rejeição, nada ativa) → store em ops.memory_lesson (só o aprovado vira [__memory__] dos críticos) → report. Nada se auto-ativa.",
  nodes: [
    // Aggregation is SQL/code — the runner reads the record, the LLM only writes.
    { id: "history", kind: "snapshot", dependsOn: [], config: { source: "memory", days: 30 } },
    { id: "compose", kind: "task", dependsOn: ["history"], config: { prompt: "memory-consolidation-compose" } },
    // Founder gate: only APPROVED lessons become active memory. Timeout 96h =
    // rejection-by-silence (the runner's default, declared here for clarity).
    {
      id: "approval",
      kind: "approval",
      dependsOn: ["compose"],
      config: {
        channel: "telegram",
        timeoutHours: 96,
        question:
          "Aprovar = estas lições viram a memória ATIVA ([__memory__]) dos críticos de marketing até a próxima consolidação. Rejeitar ou silêncio (96h) = nada muda.",
      },
    },
    // Durable write — gated by the approval above (validateGraph hard rule).
    { id: "store", kind: "store", dependsOn: ["approval"], config: { target: "memory-lessons" } },
    { id: "report", kind: "report", dependsOn: ["store"], config: { title: "🧠 MEMÓRIA DO MÊS — lições consolidadas e ATIVADAS" } },
  ],
};

// ---------------------------------------------------------------------------
// prompt-tuner (5.F.2): os prompts das esferas eram CÓDIGO ESTÁTICO — melhorar
// um prompt exigia PR humano, então os vereditos e as rejeições registrados
// toda semana não mudavam nada no que os grafos escrevem. Este grafo semanal
// (terça 06:30 UTC — fora da segunda dos brains/relatório e da quinta do
// discovery) fecha o loop, founder-gated:
//
//  - evidence (snapshot source 'tuning'): 21d de vereditos, rejeições do
//    founder (motivo literal) e timeouts de aprovação, agregados por SQL —
//    o modelo nunca conta ("vigia também mente");
//  - compose (via cadeia de fallback, nunca engine pinado): propõe NO MÁXIMO
//    UMA mudança de prompt, restrita à allowlist TUNABLE_PROMPT_KEYS
//    (drafts/críticos de marketing — nunca approval/publish/store, nunca os
//    prompts do próprio tuner: sem auto-modificação);
//  - approval (Telegram, 96h; silêncio = rejeição): nada muda um prompt sem o
//    sim explícito do founder;
//  - store (target 'prompt-override'): o MESMO kind do 5.F.1, roteado pelo
//    target — grava em ops.prompt_override (append-only, linha mais nova por
//    prompt_key vence; body vazio = reverter ao estático). A allowlist é
//    re-checada NO STORE: proposta fora dela falha ali, alto e claro;
//  - report: o founder vê o que ficou decidido.
//
// CEO-owned de propósito (como memory-consolidation): afinar prompts é
// preocupação da organização, não de um canal — fora da válvula de marketing
// e sem as injeções de conteúdo ([__day__]/[__signals__]/[__lessons__]) no
// próprio compose, que deve ver SÓ os fatos agregados.
// ---------------------------------------------------------------------------

export const PROMPT_TUNER_GRAPH: GraphDefinition = {
  slug: "prompt-tuner",
  version: 1,
  vpOwner: "ceo",
  description:
    "Afinador semanal de prompts (5.F.2): snapshot dos fatos de 21d (vereditos por graph, rejeições do founder com motivo literal, timeouts de aprovação, overrides já ativos) → compose (propõe NO MÁXIMO UMA mudança de prompt, só na allowlist de drafts/críticos de marketing — nunca approval/publish/store nem o próprio tuner) → aprovação do founder no Telegram (96h; silêncio = rejeição, nada muda) → store em ops.prompt_override (append-only; a mais nova por chave vence; body vazio = volta ao prompt estático; allowlist re-checada no store) → report. Nada se auto-ativa.",
  nodes: [
    // Aggregation is SQL/code — the runner reads the record, the LLM only writes.
    { id: "evidence", kind: "snapshot", dependsOn: [], config: { source: "tuning", days: 21 } },
    { id: "compose", kind: "task", dependsOn: ["evidence"], config: { prompt: "prompt-tuner-compose" } },
    // Founder gate: only an APPROVED proposal may become an active override.
    {
      id: "approval",
      kind: "approval",
      dependsOn: ["compose"],
      config: {
        channel: "telegram",
        timeoutHours: 96,
        question:
          "Aprovar = esta proposta vira o prompt ATIVO (override em ops.prompt_override) na próxima execução dos grafos. Rejeitar ou silêncio (96h) = nenhum prompt muda. Rollback: aprovar depois uma linha nova com o body anterior, ou body vazio para voltar ao prompt do código.",
      },
    },
    // Durable write — gated by the approval above (validateGraph hard rule);
    // the same 'store' kind as 5.F.1, routed by config.target.
    { id: "store", kind: "store", dependsOn: ["approval"], config: { target: "prompt-override" } },
    { id: "report", kind: "report", dependsOn: ["store"], config: { title: "🔧 PROMPT-TUNER — decisão da semana sobre prompts" } },
  ],
};

export const SPHERE_PPC_GRAPH: GraphDefinition = {
  slug: "sphere-ppc",
  version: 1,
  vpOwner: "marketing",
  description:
    "PPC cell, READ-ONLY and ZERO SPEND: snapshot of what content resonated (outcomes 30d, all spheres) → signal (which angles/hooks earned reach) → 3 ad drafts (Google search, Meta, LinkedIn — headline/primary/CTA) → critic (compliance + claims, VETO on any promise the product does not keep) → finalize → REPORT to the founder ('3 anúncios prontos, sem gasto'). No publish node, no spawn node: this cell cannot spend a cent — activating a campaign is a founder-gated live switch outside this repo.",
  nodes: [
    { id: "snapshot", kind: "snapshot", dependsOn: [], config: { source: "outcomes", days: 30 } },
    { id: "signal", kind: "task", dependsOn: ["snapshot"], config: { prompt: "ppc-signal" } },
    { id: "ad-google", kind: "task", dependsOn: ["signal"], config: { prompt: "ppc-draft", network: "google-search" } },
    { id: "ad-meta", kind: "task", dependsOn: ["signal"], config: { prompt: "ppc-draft", network: "meta" } },
    { id: "ad-linkedin", kind: "task", dependsOn: ["signal"], config: { prompt: "ppc-draft", network: "linkedin" } },
    { id: "critic", kind: "debate", dependsOn: ["ad-google", "ad-meta", "ad-linkedin"], config: { prompt: "ppc-critic" } },
    { id: "finalize", kind: "synthesis", dependsOn: ["ad-google", "ad-meta", "ad-linkedin", "critic"], config: { prompt: "ppc-finalize" } },
    { id: "report", kind: "report", dependsOn: ["finalize"], config: { title: "📣 PPC — 3 anúncios prontos, sem gasto (ativar é decisão do founder)" } },
  ],
};

// ---------------------------------------------------------------------------
// incident-postmortem (5.D.2): os 3 postmortems da semana de 18-22/08 foram
// escritos à mão, depois que o founder achou o buraco. Este grafo fecha a
// metade AUTOMATIZÁVEL do ritual: detectar → juntar evidência → redigir o
// RASCUNHO → gate do founder. O commit final em docs/learning/ segue humano —
// a máquina propõe o postmortem, nunca o registra sozinha.
//
// A DETECÇÃO NÃO ESTÁ NESTE GRAFO — e isso é a regra "o vigia também mente"
// aplicada duas vezes: (1) quem decide "houve incidente?" é SQL puro no cron
// diário (runIncidentPostmortemDaily, graph-tick.ts), nunca um LLM; (2) num
// dia quieto o cron NEM INICIA este run — grava um run 'succeeded' com um
// step '__quiet__' ("sem incidente nas últimas 24h") e zero Telegram. Um 🟢
// diário treinaria o founder a ignorar o canal (o daily-watchdog já reporta
// todo dia; este grafo só fala quando há sangue no registro).
//
// Quando o scan ACHA assinaturas (cluster de steps falhados >=3 no mesmo
// graph/24h, qualquer reconciliação starved/órfã, timeouts de aprovação em
// massa), o run nasce e:
//  - evidence (snapshot source 'incidents'): o runner re-agrega os FATOS por
//    SQL — contagens, primeiro/último timestamp, graphs afetados, resumos
//    literais de erro com tamanho capado. Todo número vem de query;
//  - compose (LLM via cadeia de fallback — nunca engine pinado): redige o
//    rascunho no formato exato de docs/learning/postmortems/*.md, em PT,
//    causa raiz marcada como HIPÓTESE, e declarando-se RASCUNHO DE MÁQUINA;
//  - approval (Telegram, 96h; silêncio = rejeição, padrão da casa): nada é
//    entregue como postmortem sem o sim do founder;
//  - report: o rascunho APROVADO chega inteiro ao founder com a instrução do
//    passo humano (colar em docs/learning/postmortems/ + anti-patterns.md).
//    v1 honesta: NÃO há store durável aqui — o ledger ops.memory_lesson do
//    5.F.1 (#530) ainda não está na main, e criar uma tabela paralela agora
//    seria acoplamento especulativo. O texto integral vive no report step +
//    Telegram; o commit nos docs é o passo manual listado no próprio report.
//
// CEO-owned: incidente é preocupação da organização, não de um canal — e
// assim nunca conta na válvula de aprovações de marketing nem recebe as
// injeções de conteúdo ([__day__]/[__signals__]/[__lessons__]).
// ---------------------------------------------------------------------------

export const INCIDENT_POSTMORTEM_GRAPH: GraphDefinition = {
  slug: "incident-postmortem",
  version: 1,
  vpOwner: "ceo",
  description:
    "Postmortem automático (5.D.2): SÓ roda quando o scan SQL diário (07:00 UTC) detecta assinatura de incidente nas últimas 24h (cluster >=3 steps falhados no mesmo graph, reconciliação starved/órfã, timeouts de aprovação em massa) — dia quieto não inicia run nem toca o Telegram. evidence (snapshot 'incidents': fatos re-agregados por SQL — contagens, timestamps, graphs, erros literais capados) → compose (rascunho PT no formato da casa, causa raiz como HIPÓTESE, declarado RASCUNHO DE MÁQUINA) → aprovação do founder (96h; silêncio = rejeição, nada vira postmortem) → report com o rascunho aprovado INTEIRO + o passo humano (commit manual em docs/learning/). Sem publish, sem spawn, sem store: a máquina propõe, o humano registra.",
  nodes: [
    // Every number the draft may use is aggregated HERE, by the runner's SQL —
    // the compose step downstream is forbidden to invent beyond this block.
    { id: "evidence", kind: "snapshot", dependsOn: [], config: { source: "incidents", days: 1 } },
    { id: "compose", kind: "task", dependsOn: ["evidence"], config: { prompt: "postmortem-compose" } },
    // Standard waiting gate: timeout = rejection-by-silence (runner default is
    // 96h; declared here so the contract is visible in the definition).
    {
      id: "approval",
      kind: "approval",
      dependsOn: ["compose"],
      config: {
        channel: "telegram",
        timeoutHours: 96,
        question:
          "Aprovar = aceito este RASCUNHO de postmortem; o commit em docs/learning/ (postmortem + anti-pattern) continua sendo meu, manual. Rejeitar ou silêncio (96h) = rascunho descartado, nada é registrado.",
      },
    },
    // The report also depends on compose: an approval step carries no
    // artifact, so the draft the founder approved is what gets delivered.
    {
      id: "report",
      kind: "report",
      dependsOn: ["approval", "compose"],
      config: { title: "📋 POSTMORTEM APROVADO (rascunho de máquina) — commit manual em docs/learning/postmortems/" },
    },
  ],
};

// ---------------------------------------------------------------------------
// ab-experiment (5.F.4): o aprendizado por tentativa deixa de ser pontual.
// O content-experiment do CDO é um tiro único (uma variante, quando o founder
// aprova a aposta da semana). Este grafo SEMANAL (sexta 06:30 UTC) roda um A/B
// DE VERDADE: duas variantes da MESMA ideia de conteúdo, diferindo em UM eixo
// declarado (angle | hook | format), publicadas no MESMO canal (LinkedIn — o
// único canal com métrica colhida e publish de texto funcionando).
//
// Decisões que carregam as regras da casa:
//  - UMA aprovação COMBINADA (o founder vê o eixo + as duas variantes íntegras
//    e decide o PAR): é o que a maquinaria existente suporta com menos
//    superfície nova, e elimina por construção o risco de "variante solitária"
//    — rejeitar qualquer variante rejeita o experimento inteiro. A aprovação é
//    optional + cancelNote: a rejeição degrada HONESTAMENTE para o aviso
//    "experimento cancelado — variante rejeitada" (nada publica, o run fecha
//    sem fingir A/B).
//  - Cada publish declara config.contentNode: o que publica é EXATAMENTE o
//    artefato do draft que o founder viu na caixa de aprovação ("o que se
//    valida é exatamente o que se envia").
//  - A VÁLVULA DE CADÊNCIA MANDA: se o cap do canal bloquear a 2ª variante no
//    dia, ela ESTACIONA (waiting) e sai depois das 00:00 UTC — nunca fura o
//    cap, nunca descarta; o veredito registra que a janela de comparação se
//    deslocou.
//  - O VEREDITO É CÓDIGO (compare:'ab'): lê os DOIS artefatos de harvest
//    (janela de cada variante via harvest config.sinceNode = seu publish),
//    compara a MESMA métrica, grava o vencedor em ops.agent_outcome
//    (valueBefore=perdedor, valueAfter=vencedor) e escreve no summary a linha
//    machine-findable `ab-winner: axis=<eixo> variant=<A|B> lift=+<n>%` — o
//    CONTRATO que a consolidação mensal (5.F.1, snapshot 'memory' lê summaries
//    de node='verdict') e o tuner (5.F.2, snapshot 'tuning' idem) consomem.
//    Vencedores acumulam como aprendizado durável SEM store novo.
//  - Empate numérico ou fonte muda = SEM vencedor, dito em voz alta — nada de
//    estatística inventada.
// ---------------------------------------------------------------------------

export const AB_EXPERIMENT_GRAPH: GraphDefinition = {
  slug: "ab-experiment",
  version: 1,
  vpOwner: "marketing",
  description:
    "A/B semanal (5.F.4): memória do canal → brief que declara UM eixo (angle|hook|format) e as duas variantes → draft A ‖ draft B (mesma ideia, só o eixo muda) → critic (um eixo só, compliance, freshness) → UMA aprovação combinada (o founder vê eixo + as duas variantes; rejeitar = cancela o experimento inteiro — nunca publica variante solitária) → publish A + publish B no MESMO canal (LinkedIn; a válvula de cadência pode adiar a 2ª para o dia seguinte — janela deslocada é registrada, o cap nunca é furado) → wait 48h por variante → harvest da MESMA métrica por janela de variante → veredito A/B por CÓDIGO: vencedor + lift em ops.agent_outcome e a linha `ab-winner: axis=... variant=... lift=...` no summary (contrato lido pela consolidação 5.F.1 e pelo tuner 5.F.2).",
  nodes: [
    // Perception before creation — o registro real do canal do experimento.
    { id: "memory", kind: "snapshot", dependsOn: [], config: { source: "outcomes", days: 30, metricPrefix: "linkedinpage_" } },
    // O brief declara o EIXO (linha 'EIXO: <angle|hook|format>') e as duas
    // variantes — o veredito extrai o eixo daqui por regex (código, não LLM).
    { id: "brief", kind: "task", dependsOn: ["memory"], config: { prompt: "ab-brief" } },
    { id: "draft-a", kind: "task", dependsOn: ["brief"], config: { prompt: "ab-draft", variant: "A" } },
    { id: "draft-b", kind: "task", dependsOn: ["brief"], config: { prompt: "ab-draft", variant: "B" } },
    // O crítico valida o DESENHO do experimento: um eixo só, mesmo canal,
    // compliance — com veto.
    { id: "critic", kind: "debate", dependsOn: ["brief", "draft-a", "draft-b", "memory"], config: { prompt: "ab-critic" } },
    // UMA aprovação combinada: a caixa mostra o brief (eixo), as DUAS
    // variantes na íntegra e o parecer do crítico (aprovação multi-dep junta
    // os artefatos rotulados). optional + cancelNote = rejeição/silêncio vira
    // cancelamento honesto, nunca run "FALHOU" nem variante solitária.
    {
      id: "approval",
      kind: "approval",
      dependsOn: ["brief", "draft-a", "draft-b", "critic"],
      config: {
        channel: "telegram",
        optional: true,
        timeoutHours: 96,
        question:
          "Aprovar = publicar AS DUAS variantes acima no LinkedIn como A/B (a válvula de cadência pode adiar a 2ª para amanhã). Rejeitar ou silêncio (96h) = experimento inteiro cancelado — nunca publicamos variante solitária.",
        cancelNote:
          "🧪 EXPERIMENTO CANCELADO — variante rejeitada (ou 96h sem decisão). NENHUMA variante foi publicada: um A/B com uma variante só não é A/B, e variante solitária nunca sai como se fosse experimento.",
      },
    },
    // Duas publicações, MESMO canal. contentNode aponta o draft exato que o
    // founder viu — a aprovação combinada gate as duas de uma vez.
    { id: "publish-a", kind: "publish", dependsOn: ["approval"], config: { channel: "linkedin", via: "postiz", contentNode: "draft-a" } },
    { id: "publish-b", kind: "publish", dependsOn: ["approval"], config: { channel: "linkedin", via: "postiz", contentNode: "draft-b" } },
    { id: "wait-a", kind: "wait", dependsOn: ["publish-a"], config: { hours: 48 } },
    { id: "wait-b", kind: "wait", dependsOn: ["publish-b"], config: { hours: 48 } },
    // A MESMA métrica para as duas variantes; a janela de cada harvest começa
    // no PUBLISH da própria variante (sinceNode) — se a válvula adiou a B, a
    // janela dela desloca junto e o veredito diz isso.
    { id: "harvest-a", kind: "harvest", dependsOn: ["wait-a"], config: { metric: "linkedinpage_impressions", sinceNode: "publish-a" } },
    { id: "harvest-b", kind: "harvest", dependsOn: ["wait-b"], config: { metric: "linkedinpage_impressions", sinceNode: "publish-b" } },
    // Veredito A/B — matemática em código, o contrato ab-winner no summary.
    { id: "verdict", kind: "verdict", dependsOn: ["harvest-a", "harvest-b"], config: { compare: "ab", axisFrom: "brief" } },
  ],
};
