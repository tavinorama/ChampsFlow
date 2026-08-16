/**
 * graph-runner.ts — the BODY half of the orchestrator (#164): the engine
 * that advances a graph run, one tick at a time.
 *
 * The BRAIN (agent-graphs.ts) answers "which nodes may start now?" and is
 * pure. This file answers "then start them" — and everything with a side
 * effect goes through an injected port, so the whole lifecycle is provable
 * in a unit test with fake ports before it ever touches Hermes:
 *
 *   - substrate port  → ops.agent_run/agent_step/agent_outcome (the record)
 *   - hermes port     → the VPS task server (task exec + postiz publish)
 *   - artifacts port  → node outputs in transit (Redis, TTL) — the substrate
 *                       keeps HASHES, working memory keeps the text, and the
 *                       two never swap roles
 *   - telegram port   → approvals + verdicts + failures (nada degrada calado)
 *
 * Design decisions that carry the house rules:
 *  - THE SUBSTRATE IS THE STATE. NodeStates are derived from agent_step rows
 *    every tick — there is no second state store to drift from the record.
 *  - APPROVAL IS THE #445 ROUTE. An approval node parks as status 'waiting';
 *    approving IS calling POST /agent-steps/:id/finish {status:'succeeded'}
 *    (rejecting: 'failed'). No new mechanism, no new auth surface.
 *  - FAIL-FAST, OUT LOUD. One failed node skips every waiting sibling,
 *    fails the run, and says so on Telegram. A half-dead run that lingers
 *    quietly is the five-times disease wearing a new coat.
 *  - CRASH RECOVERY BY TIMEOUT. A step stuck 'running' past the timeout is
 *    failed by the next tick — a crashed worker must not hang a run forever.
 */

import { createHash } from "node:crypto";
import {
  type GraphDefinition,
  type GraphNode,
  type NodeStates,
  readyNodes,
  isRunComplete,
  DAILY_VIDEO_GRAPH,
  DAILY_WATCHDOG_GRAPH,
  DAILY_DREAM_GRAPH,
  WEEKLY_PRODUCT_GRAPH,
  WEEKLY_DISCOVERY_GRAPH,
  CONTENT_EXPERIMENT_GRAPH,
  SPHERE_X_GRAPH,
} from "./agent-graphs";
import { buildPrompt } from "./graph-prompts";

/** Artifact key holding the hypothesis a spawned run was seeded with. */
export const SEED_ARTIFACT = "__seed__";

/**
 * Every runnable graph, by slug. Adding a graph here is the ONLY way to make
 * it startable — the operator route and the worker tick both read this map,
 * so an unregistered definition cannot run by accident.
 */
export const GRAPH_REGISTRY: Record<string, GraphDefinition> = {
  [DAILY_VIDEO_GRAPH.slug]: DAILY_VIDEO_GRAPH,
  // Agent-org core: the two autonomous brains + the CDO's experiment cell.
  [DAILY_WATCHDOG_GRAPH.slug]: DAILY_WATCHDOG_GRAPH,
  [DAILY_DREAM_GRAPH.slug]: DAILY_DREAM_GRAPH,
  // The org's third brain: the product finally has an owner (founder, 13/08).
  [WEEKLY_PRODUCT_GRAPH.slug]: WEEKLY_PRODUCT_GRAPH,
  // CDO+CPO active discovery — ideas reach the founder MVP-ready (13/08 rule).
  [WEEKLY_DISCOVERY_GRAPH.slug]: WEEKLY_DISCOVERY_GRAPH,
  [CONTENT_EXPERIMENT_GRAPH.slug]: CONTENT_EXPERIMENT_GRAPH,
  // #156, first specialist cell: the X sphere with its own memory.
  [SPHERE_X_GRAPH.slug]: SPHERE_X_GRAPH,
};

// ---------------------------------------------------------------------------
// Ports — everything the runner touches, injectable.
// ---------------------------------------------------------------------------

export interface StepRow {
  id: string;
  node: string;
  status: "running" | "succeeded" | "failed" | "skipped" | "waiting";
  started_at: string; // ISO
}

export interface RunRow {
  id: string;
  graph: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  started_at: string; // ISO
}

export interface SubstratePort {
  getRun(runId: string): Promise<RunRow | null>;
  loadSteps(runId: string): Promise<StepRow[]>;
  startStep(input: {
    runId: string;
    node: string;
    parentStepId?: string | null;
    inputHash?: string | null;
  }): Promise<string>;
  finishStep(
    stepId: string,
    input: {
      status: "succeeded" | "failed" | "skipped" | "waiting";
      outputHash?: string | null;
      summary?: string | null;
      ms?: number | null;
      engine?: string | null;
    }
  ): Promise<void>;
  finishRun(runId: string, status: "succeeded" | "failed"): Promise<void>;
  recordOutcome(input: {
    stepId: string;
    metric: string;
    valueBefore: number | null;
    valueAfter: number | null;
  }): Promise<string>;
  /** Aggregate harvested outcomes for a metric since a moment (from #162's cron). */
  readHarvest(metric: string, sinceIso: string): Promise<{ n: number; total: number }>;
  /**
   * A bounded, PII-free digest of the company's own record, for the read-only
   * brains (Watchdog, CDO). The engines cannot reach the DB — the runner, which
   * can, reads here and injects the text so the LLM lenses reason over facts.
   * source 'ops' → run/step health, cost, cycle, redundancy; source 'outcomes'
   * → agent_outcome lift per metric/graph. Empty string means "no data" (the
   * lenses must say so, not invent). metricPrefix narrows an 'outcomes'
   * snapshot to one sphere's own record (e.g. 'x_' → only X reach) — the piece
   * that gives each specialist cell (#156) a memory of ITS channel.
   */
  snapshot(input: { source: string; days: number; metricPrefix?: string }): Promise<string>;
  /**
   * Start a fresh run of another graph (the spawn primitive). Returns the new
   * run id. The runner seeds the new run's __seed__ artifact separately, via
   * the artifacts port — the substrate only records the run.
   */
  startRun(input: { graph: string; trigger: string; vpOwner: string }): Promise<string>;
}

export interface HermesPort {
  task(prompt: string): Promise<{ ok: boolean; output: string; engineUsed: string | null; ms: number | null }>;
  publish(payload: { channel: string; post: string }): Promise<{ ok: boolean; detail: string }>;
}

export interface ArtifactsPort {
  get(runId: string, node: string): Promise<string | null>;
  set(runId: string, node: string, text: string): Promise<void>;
}

export interface GraphRunnerPorts {
  substrate: SubstratePort;
  hermes: HermesPort;
  artifacts: ArtifactsPort;
  telegram(text: string): Promise<void>;
  now(): Date;
}

export interface AdvanceResult {
  status: "in-flight" | "completed" | "failed" | "not-running";
  started: string[];
  notes: string[];
}

/** A step stuck 'running' longer than this is treated as a crash. */
export const RUNNING_TIMEOUT_HOURS = 2;
/** A harvest that finds nothing keeps waiting this long, then finishes as noData — loud, never a fake zero. */
export const HARVEST_GRACE_HOURS = 48;

const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const hoursSince = (iso: string, now: Date): number =>
  (now.getTime() - new Date(iso).getTime()) / 3_600_000;

/** Latest step per node wins — a re-attempted node is a new step row. */
function latestByNode(steps: StepRow[]): Map<string, StepRow> {
  const byNode = new Map<string, StepRow>();
  for (const s of [...steps].sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    byNode.set(s.node, s);
  }
  return byNode;
}

function statesFrom(byNode: Map<string, StepRow>): NodeStates {
  const states: NodeStates = {};
  for (const [node, step] of byNode) states[node] = step.status;
  return states;
}

async function upstreamArtifacts(
  def: GraphDefinition,
  node: GraphNode,
  runId: string,
  artifacts: ArtifactsPort
): Promise<Array<[string, string]>> {
  const out: Array<[string, string]> = [];
  for (const dep of node.dependsOn) {
    const text = await artifacts.get(runId, dep);
    if (text) out.push([dep, text]);
  }
  return out;
}

/**
 * Advance one run by one tick. Idempotent per tick: derives state from the
 * substrate, does what is due, returns. Callers loop it (cron every 10 min).
 */
export async function advanceRun(
  def: GraphDefinition,
  runId: string,
  ports: GraphRunnerPorts
): Promise<AdvanceResult> {
  const { substrate, hermes, artifacts, telegram, now } = ports;
  const notes: string[] = [];
  const started: string[] = [];

  const run = await substrate.getRun(runId);
  if (!run || run.status !== "running") {
    return { status: "not-running", started, notes: [`run ${runId} not running`] };
  }

  const byNode = latestByNode(await substrate.loadSteps(runId));

  // 1) Crash recovery: 'running' past the timeout = failed, out loud.
  for (const [node, step] of byNode) {
    if (step.status === "running" && hoursSince(step.started_at, now()) > RUNNING_TIMEOUT_HOURS) {
      await substrate.finishStep(step.id, {
        status: "failed",
        summary: `stale running step (>${RUNNING_TIMEOUT_HOURS}h) — worker crash presumed`,
      });
      step.status = "failed";
      notes.push(`crash-recovered ${node} as failed`);
    }
  }

  // 2) Waiting maintenance — waits elapse, harvests retry.
  for (const [nodeId, step] of byNode) {
    if (step.status !== "waiting") continue;
    const node = def.nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    if (node.kind === "wait") {
      const hours = Number(node.config?.["hours"] ?? 0);
      if (hoursSince(step.started_at, now()) >= hours) {
        await substrate.finishStep(step.id, { status: "succeeded", summary: `waited ${hours}h` });
        step.status = "succeeded";
        notes.push(`wait ${nodeId} elapsed`);
      }
    } else if (node.kind === "harvest") {
      const metric = String(node.config?.["metric"] ?? "");
      const got = await substrate.readHarvest(metric, run.started_at);
      if (got.n > 0) {
        await artifacts.set(runId, nodeId, JSON.stringify({ metric, ...got }));
        await substrate.finishStep(step.id, {
          status: "succeeded",
          summary: `harvest ${metric}: n=${got.n} total=${got.total}`,
        });
        step.status = "succeeded";
        notes.push(`harvest ${nodeId} found n=${got.n}`);
      } else if (hoursSince(step.started_at, now()) >= HARVEST_GRACE_HOURS) {
        // ZERO ROWS is not a zero RESULT. n=0 after the grace window means the
        // outcome SOURCE went mute (the VPS 07:40 writer lives outside this
        // repo and can die without anyone here noticing) — recording it as
        // total=0 fabricated a "did not perform" verdict once already (the
        // 13/08 false-zero bug). Nada degrada calado: mark the artifact
        // noData, finish out loud, and scream on Telegram. A REAL zero
        // (n>0, total=0) still flows through the branch above untouched.
        await artifacts.set(runId, nodeId, JSON.stringify({ metric, n: 0, total: 0, noData: true }));
        await substrate.finishStep(step.id, {
          status: "succeeded",
          summary: `SEM DADO: fonte de outcomes muda (0 linhas para ${metric}) após ${HARVEST_GRACE_HOURS}h`,
        });
        step.status = "succeeded";
        await telegram(
          `🔴 HARVEST SEM DADO — graph ${def.slug} (run ${runId.slice(0, 8)}): 0 linhas para '${metric}' após ${HARVEST_GRACE_HOURS}h de graça. O escritor de outcomes da VPS (cron 07:40) parece morto — verificar a fonte, não o graph.`
        );
        notes.push(`harvest ${nodeId} no data — source mute`);
      }
    } else if (node.kind === "approval") {
      // Approvals stay 'waiting' until the #445 finish route decides them — but
      // an approval with config.timeoutHours does not park forever: a stale
      // decision resolves itself, so a launch nobody answered cannot leave a
      // run 'running' indefinitely. optional → skipped (benign, the tail just
      // doesn't run); required → failed (a stale publish approval must not ship).
      const timeoutHours = Number(node.config?.["timeoutHours"] ?? 0);
      if (timeoutHours > 0 && hoursSince(step.started_at, now()) >= timeoutHours) {
        const optional = node.config?.["optional"] === true;
        await substrate.finishStep(step.id, {
          status: optional ? "skipped" : "failed",
          summary: `approval timed out after ${timeoutHours}h (${optional ? "optional → skipped" : "required → failed"})`,
        });
        step.status = optional ? "skipped" : "failed";
        notes.push(`approval ${nodeId} timed out`);
      }
    }
  }

  // 2b) An OPTIONAL approval declined by the founder skips its tail — it does
  // NOT fail the run. Rejecting "launch this experiment" is a valid no; only a
  // required approval (a publish gate) turns a rejection into a run failure.
  for (const [nodeId, step] of byNode) {
    if (step.status !== "failed") continue;
    const node = def.nodes.find((n) => n.id === nodeId);
    if (node?.kind === "approval" && node.config?.["optional"] === true) {
      await substrate.finishStep(step.id, { status: "skipped", summary: "founder declined optional approval — tail skipped" });
      step.status = "skipped";
      notes.push(`optional approval ${nodeId} declined → skipped (run continues)`);
    }
  }

  // 3) Fail-fast: any failed node fails the run and skips the stragglers.
  const failed = [...byNode.entries()].filter(([, s]) => s.status === "failed");
  if (failed.length > 0) {
    for (const [, step] of byNode) {
      if (step.status === "waiting") {
        await substrate.finishStep(step.id, { status: "skipped", summary: "run failed elsewhere" });
      }
    }
    await substrate.finishRun(runId, "failed");
    await telegram(
      `🔴 GRAPH ${def.slug} FALHOU (run ${runId.slice(0, 8)}): node '${failed[0]![0]}' falhou. Steps: ${byNode.size}/${def.nodes.length}.`
    );
    return { status: "failed", started, notes: [...notes, `failed at ${failed[0]![0]}`] };
  }

  // 4) Start whatever became ready.
  const states = statesFrom(byNode);
  for (const node of readyNodes(def, states)) {
    started.push(node.id);
    const parentStepId = node.dependsOn.length > 0 ? (byNode.get(node.dependsOn[0]!)?.id ?? null) : null;
    const config = node.config ?? {};

    if (node.kind === "task" || node.kind === "debate" || node.kind === "synthesis") {
      const upstream = await upstreamArtifacts(def, node, runId, artifacts);
      // A spawned (seeded) run carries its hypothesis in __seed__; surface it to
      // every reasoning node so the experiment stays steered by the bet it was
      // launched to test. Non-seeded runs have no __seed__ — nothing changes.
      const seed = await artifacts.get(runId, SEED_ARTIFACT);
      if (seed) upstream.unshift([SEED_ARTIFACT, seed]);
      const prompt = buildPrompt(node.kind, config, upstream);
      if (!prompt) {
        const stepId = await substrate.startStep({ runId, node: node.id, parentStepId });
        await substrate.finishStep(stepId, {
          status: "failed",
          summary: `no prompt resolvable for kind=${node.kind} config.prompt=${String(config["prompt"])}`,
        });
        continue; // next tick's fail-fast closes the run
      }
      const stepId = await substrate.startStep({ runId, node: node.id, parentStepId, inputHash: sha(prompt) });
      const res = await hermes.task(prompt);
      if (res.ok && res.output) {
        await artifacts.set(runId, node.id, res.output);
        await substrate.finishStep(stepId, {
          status: "succeeded",
          outputHash: sha(res.output),
          summary: `${node.kind} ok via ${res.engineUsed ?? "?"}`,
          ms: res.ms,
          engine: res.engineUsed,
        });
      } else {
        await substrate.finishStep(stepId, {
          status: "failed",
          summary: `hermes task failed: ${res.output.slice(0, 120) || "no output"}`,
          ms: res.ms,
          engine: res.engineUsed,
        });
      }
    } else if (node.kind === "approval") {
      const stepId = await substrate.startStep({ runId, node: node.id, parentStepId });
      const context = (await artifacts.get(runId, node.dependsOn[0] ?? "")) ?? "(sem artefato)";
      // v3 (founder, 13/08): the first approval never said WHERE the content
      // would land, so a raw script was approved thinking of the video. The
      // ask now names every publish/spawn destination downstream of this gate
      // — the human must know exactly what a "yes" sets in motion.
      const downstream = def.nodes.filter(
        (n) =>
          (n.kind === "publish" || n.kind === "spawn") &&
          n.dependsOn.some((d) => d === node.id)
      );
      const destinations = downstream.map((n) =>
        n.kind === "publish"
          ? `publicar como POST em ${String(n.config?.["channel"] ?? "linkedin")} (via ${String(n.config?.["via"] ?? "postiz")})`
          : `lançar experimento(s): ${(Array.isArray(n.config?.["spawns"]) ? (n.config["spawns"] as unknown[]) : []).map(String).join(", ")}`
      );
      const question = typeof node.config?.["question"] === "string" ? (node.config["question"] as string) : null;
      await substrate.finishStep(stepId, { status: "waiting", summary: "awaiting human decision" });
      await telegram(
        [
          `🟡 APROVAÇÃO NECESSÁRIA — graph ${def.slug} (run ${runId.slice(0, 8)})`,
          destinations.length > 0 ? `Aprovar vai: ${destinations.join(" · ")}` : `Aprovar destrava o resto do graph (sem publicação direta neste passo).`,
          ...(question ? [question] : []),
          `Conteúdo proposto:`,
          context.slice(0, 900),
          ``,
          `Aprovar:  finish step ${stepId} com status=succeeded`,
          `Rejeitar: finish step ${stepId} com status=failed`,
          `(rota #445: POST /api/v1/operator/agent-steps/${stepId}/finish)`,
        ].join("\n")
      );
    } else if (node.kind === "publish") {
      const content = (await artifacts.get(runId, node.dependsOn.length ? node.dependsOn[0]! : "")) ?? "";
      // dependsOn[0] of publish is the approval node; the CONTENT lives on
      // the approval's own upstream (the synthesis). Walk one edge back.
      const approvalNode = def.nodes.find((n) => n.id === node.dependsOn[0]);
      const contentNodeId = approvalNode?.dependsOn[0] ?? node.dependsOn[0] ?? "";
      const post = content || ((await artifacts.get(runId, contentNodeId)) ?? "");
      const stepId = await substrate.startStep({ runId, node: node.id, parentStepId, inputHash: post ? sha(post) : null });
      if (!post) {
        await substrate.finishStep(stepId, { status: "failed", summary: "publish had no content artifact" });
        continue;
      }
      const channel = String(config["channel"] ?? "linkedin");
      const res = await hermes.publish({ channel, post });
      if (res.ok) {
        await artifacts.set(runId, node.id, res.detail);
        await substrate.finishStep(stepId, {
          status: "succeeded",
          outputHash: sha(res.detail),
          summary: `published via ${String(config["via"] ?? "postiz")} channel=${channel}`,
        });
      } else {
        await substrate.finishStep(stepId, { status: "failed", summary: `publish failed: ${res.detail.slice(0, 120)}` });
      }
    } else if (node.kind === "wait") {
      const stepId = await substrate.startStep({ runId, node: node.id, parentStepId });
      await substrate.finishStep(stepId, {
        status: "waiting",
        summary: `waiting ${Number(config["hours"] ?? 0)}h`,
      });
    } else if (node.kind === "harvest") {
      // Park as waiting; section 2 retries it every tick until data or grace.
      const stepId = await substrate.startStep({ runId, node: node.id, parentStepId });
      await substrate.finishStep(stepId, { status: "waiting", summary: `awaiting metric ${String(config["metric"])}` });
    } else if (node.kind === "verdict") {
      const stepId = await substrate.startStep({ runId, node: node.id, parentStepId });
      const harvestNodeId = node.dependsOn[0] ?? "";
      const raw = await artifacts.get(runId, harvestNodeId);
      let metric = "unknown";
      let total = 0;
      let n = 0;
      let noData = false;
      try {
        const parsed = JSON.parse(raw ?? "{}") as { metric?: string; total?: number; n?: number; noData?: boolean };
        metric = parsed.metric ?? "unknown";
        total = Number(parsed.total ?? 0);
        n = Number(parsed.n ?? 0);
        noData = parsed.noData === true;
      } catch {
        // verdict on a malformed harvest is still a verdict: zero, said out loud
      }
      if (noData) {
        // A mute source produced no measurement — recording total=0 here would
        // put a FALSE ZERO in ops.agent_outcome and teach the learning loop
        // that the content "did not perform" (the 13/08 bug, exactly). No
        // outcome row: "sem dado, sem veredito", said out loud.
        await substrate.finishStep(stepId, {
          status: "succeeded",
          summary: `verdict ${metric}: SEM DADO — sem veredito, nada gravado em ops.agent_outcome`,
        });
        await telegram(
          `🟠 SEM VEREDITO — graph ${def.slug} (run ${runId.slice(0, 8)}): '${metric}' sem dado (fonte de outcomes muda). NADA gravado em ops.agent_outcome — sem zero falso.`
        );
      } else {
        await substrate.recordOutcome({ stepId, metric, valueBefore: null, valueAfter: total });
        await substrate.finishStep(stepId, {
          status: "succeeded",
          summary: `verdict ${metric}: total=${total} n=${n}`,
        });
        await telegram(
          `🟢 VEREDITO — graph ${def.slug} (run ${runId.slice(0, 8)}): ${metric} = ${total} (n=${n}). Registrado em ops.agent_outcome.`
        );
      }
    } else if (node.kind === "snapshot") {
      // The runner reads the company's own record into an artifact. Honest
      // empty: if there is no data, the node still SUCCEEDS with a said-so
      // marker, so the downstream lenses reason over "no data" instead of
      // hanging or inventing.
      const source = String(config["source"] ?? "");
      const days = Number(config["days"] ?? 14);
      const metricPrefix =
        typeof config["metricPrefix"] === "string" ? (config["metricPrefix"] as string) : undefined;
      const stepId = await substrate.startStep({ runId, node: node.id });
      let text = "";
      try {
        text = await substrate.snapshot({ source, days, metricPrefix });
      } catch (err) {
        await substrate.finishStep(stepId, {
          status: "failed",
          summary: `snapshot ${source} failed: ${(err as Error).message?.slice(0, 120)}`,
        });
        continue; // next tick's fail-fast closes the run, out loud
      }
      const body = text.trim() || `SEM DADOS em ops.* (source=${source}, ${days}d).`;
      await artifacts.set(runId, node.id, body);
      await substrate.finishStep(stepId, {
        status: "succeeded",
        outputHash: sha(body),
        summary: `snapshot ${source}/${days}d: ${text.trim() ? `${body.length} chars` : "empty (honest)"}`,
      });
    } else if (node.kind === "report") {
      // The read-only brains PROPOSE: deliver the synthesis to the founder and
      // finish. No publish, no spend, no spawn — the whole safety of the
      // Watchdog and the CDO is that a report is the only thing they can do.
      const stepId = await substrate.startStep({ runId, node: node.id, parentStepId });
      const upstream = await upstreamArtifacts(def, node, runId, artifacts);
      const bodyText = upstream.map(([, text]) => text).join("\n\n").trim();
      const title = String(config["title"] ?? `📋 ${def.slug}`);
      if (!bodyText) {
        await substrate.finishStep(stepId, { status: "failed", summary: "report had no upstream artifact to deliver" });
        continue;
      }
      // Telegram caps a message near 4096 chars; keep headroom for the header.
      const TELEGRAM_BODY_CAP = 3500;
      const clipped = bodyText.length > TELEGRAM_BODY_CAP
        ? `${bodyText.slice(0, TELEGRAM_BODY_CAP)}\n…[+${bodyText.length - TELEGRAM_BODY_CAP} chars — veja ops.agent_step]`
        : bodyText;
      await artifacts.set(runId, node.id, bodyText);
      await telegram(
        [
          `${title} — graph ${def.slug} (run ${runId.slice(0, 8)})`,
          ``,
          clipped,
          ``,
          `— proposta, nada foi executado. (${def.slug})`,
        ].join("\n")
      );
      await substrate.finishStep(stepId, {
        status: "succeeded",
        outputHash: sha(bodyText),
        summary: `reported ${bodyText.length} chars to founder`,
      });
    } else if (node.kind === "spawn") {
      // The acting primitive: launch experiment runs of other graphs, seeded
      // with the approved hypothesis. Guarded upstream by an approval (the
      // brain validated it); each spawned run carries its OWN approval before
      // it publishes — two human gates on any path to the public.
      const stepId = await substrate.startStep({ runId, node: node.id, parentStepId });
      // The seed is the content the approval gated — walk approval → its
      // upstream (the synthesis / ranked bets), same one-edge-back as publish.
      const approvalNode = def.nodes.find((n) => n.id === node.dependsOn[0]);
      const seedNodeId = approvalNode?.dependsOn[0] ?? node.dependsOn[0] ?? "";
      const seedText = (await artifacts.get(runId, seedNodeId)) ?? "";
      const targets = Array.isArray(config["spawns"]) ? (config["spawns"] as unknown[]).map(String) : [];
      const unknown = targets.filter((t) => !GRAPH_REGISTRY[t]);
      if (unknown.length > 0) {
        await substrate.finishStep(stepId, {
          status: "failed",
          summary: `spawn target(s) not registered: ${unknown.join(", ")}`,
        });
        continue; // next tick's fail-fast closes the run, out loud
      }
      const launched: string[] = [];
      for (const target of targets) {
        const childId = await substrate.startRun({
          graph: target,
          trigger: `spawn:${runId.slice(0, 8)}`,
          vpOwner: GRAPH_REGISTRY[target]!.vpOwner,
        });
        if (seedText) await artifacts.set(childId, SEED_ARTIFACT, seedText);
        launched.push(`${target}:${childId.slice(0, 8)}`);
      }
      await artifacts.set(runId, node.id, JSON.stringify({ launched }));
      await substrate.finishStep(stepId, {
        status: "succeeded",
        summary: `spawned ${launched.length} experiment(s): ${launched.join(", ")}`,
      });
      await telegram(
        `🚀 EXPERIMENTO(S) LANÇADO(S) — graph ${def.slug} (run ${runId.slice(0, 8)}): ${launched.join(", ")}. Cada um pede a SUA aprovação antes de publicar.`
      );
    }
  }

  // 5) Done? Recompute from the substrate — the record decides, not memory.
  const finalStates = statesFrom(latestByNode(await substrate.loadSteps(runId)));
  if (isRunComplete(def, finalStates)) {
    const anyFailed = Object.values(finalStates).some((s) => s === "failed");
    await substrate.finishRun(runId, anyFailed ? "failed" : "succeeded");
    if (anyFailed) {
      const firstFailed =
        Object.entries(finalStates).find(([, s]) => s === "failed")?.[0] ?? "?";
      await telegram(
        `🔴 GRAPH ${def.slug} FALHOU (run ${runId.slice(0, 8)}): node '${firstFailed}' falhou e bloqueou o resto.`
      );
    } else {
      await telegram(`✅ GRAPH ${def.slug} COMPLETO (run ${runId.slice(0, 8)}): ${def.nodes.length} nodes.`);
    }
    return { status: anyFailed ? "failed" : "completed", started, notes };
  }

  return { status: "in-flight", started, notes };
}
