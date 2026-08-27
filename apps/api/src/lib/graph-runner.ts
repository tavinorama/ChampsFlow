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
  SPHERE_LINKEDIN_GRAPH,
  SPHERE_BLOG_GRAPH,
  SPHERE_REDDIT_GRAPH,
  SPHERE_INSTAGRAM_GRAPH,
  SPHERE_TIKTOK_GRAPH,
  SPHERE_YOUTUBE_GRAPH,
  SPHERE_PPC_GRAPH,
  WEEKLY_REPORT_GRAPH,
  MEMORY_CONSOLIDATION_GRAPH,
} from "./agent-graphs";
import { buildPrompt, CONTENT_LESSONS } from "./graph-prompts";
import { dayBlock } from "./editorial-calendar";
import {
  X_POST_LIMIT,
  xPostWithinLimit,
  adaptXForPublish,
  splitXSegments,
} from "../../../../packages/shared/src/x-post-limit";

/** Artifact key holding the hypothesis a spawned run was seeded with. */
export const SEED_ARTIFACT = "__seed__";
/** Upstream key carrying the editorial calendar's day theme to content cells. */
export const DAY_ARTIFACT = "__day__";
/** Upstream key carrying REAL external signals (Signal Engine) to content cells. */
export const SIGNALS_ARTIFACT = "__signals__";
/**
 * Upstream key carrying the house CONTENT LESSONS (5.F.3) to the CRITICS.
 * Same pattern as [__day__] — a constant, no I/O — but narrower: only the
 * debate nodes of marketing graphs receive it. The critics already see
 * [memory] (outcomes) and the founder's rejections; this adds the
 * INSTITUTIONAL lessons (X limits, media-only channels, cadence valve, copy
 * rules) as a veto ruler, so a lesson learned once is enforced everywhere.
 */
export const LESSONS_ARTIFACT = "__lessons__";
/**
 * Upstream key carrying the CONSOLIDATED memory lessons (5.F.1) to the
 * CRITICS of marketing graphs — the durable sibling of [__lessons__]. Where
 * [__lessons__] is a static ruler in code, [__memory__] is the last batch of
 * lessons the memory-consolidation graph distilled from 30 days of REAL
 * outcomes AND the founder explicitly approved on Telegram. Read from
 * ops.memory_lesson at tick time via the optional activeMemoryLessons port;
 * empty store (or the migration not applied yet) → no artifact injected at
 * all — never a placeholder.
 */
export const MEMORY_ARTIFACT = "__memory__";

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
  // #156, cells two and three (14/08 sprint): LinkedIn (full loop) and the
  // blog (read-only thinker that feeds the CI autopublish pipeline).
  [SPHERE_LINKEDIN_GRAPH.slug]: SPHERE_LINKEDIN_GRAPH,
  [SPHERE_BLOG_GRAPH.slug]: SPHERE_BLOG_GRAPH,
  // #485 consumer (18/08): the Reddit sphere — first cell built to consume the
  // Signal Engine's "where to act" queue ([__signals__]). Report-only, never
  // publishes, fails open honestly when the SIGNAL_ENGINE envs are unset.
  [SPHERE_REDDIT_GRAPH.slug]: SPHERE_REDDIT_GRAPH,
  // Content alive on every platform (17/08): the three short-video spheres
  // (own memory, own approval, own harvest) + the zero-spend PPC thinker.
  [SPHERE_INSTAGRAM_GRAPH.slug]: SPHERE_INSTAGRAM_GRAPH,
  [SPHERE_TIKTOK_GRAPH.slug]: SPHERE_TIKTOK_GRAPH,
  [SPHERE_YOUTUBE_GRAPH.slug]: SPHERE_YOUTUBE_GRAPH,
  [SPHERE_PPC_GRAPH.slug]: SPHERE_PPC_GRAPH,
  // 5.E.5: o relatório de segunda ao founder — read-only, Monday 07:30 UTC.
  [WEEKLY_REPORT_GRAPH.slug]: WEEKLY_REPORT_GRAPH,
  // 5.F.1: consolidação mensal de memória — dia 1, 06:30 UTC. Fatos agregados
  // por SQL → lições escritas pelo LLM → gate do founder → só o aprovado vira
  // [__memory__] dos críticos. Nada se auto-ativa.
  [MEMORY_CONSOLIDATION_GRAPH.slug]: MEMORY_CONSOLIDATION_GRAPH,
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
   * Succeeded publishes to a channel since 00:00 UTC today — the cadence
   * valve's counter (24/08: LinkedIn got 3 producers — sphere, video adapt,
   * experiment — and the founder's feed showed it).
   */
  publishedToday(channel: string): Promise<number>;
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
  /**
   * External REAL signals for content cells (Signal Engine, docs/signal-engine-
   * integration.md): the "where to act" queue rendered as text. Optional on
   * purpose — a worker without SIGNAL_ENGINE_* env returns null and the cell
   * runs exactly as before. Must never throw; "SEM DADO" is a valid answer.
   */
  externalSignals?(): Promise<string | null>;
  /**
   * The ACTIVE approved memory lessons (5.F.1) — the newest row the founder
   * approved in ops.memory_lesson, or null when the store is empty OR the
   * migration has not been applied yet (feature OFF, fail-open: the cells run
   * exactly as before). Optional on purpose, must never throw.
   */
  activeMemoryLessons?(): Promise<string | null>;
  /**
   * Persist an APPROVED lessons batch as the new active memory (5.F.1) —
   * append-only into ops.memory_lesson (newest row wins on read). Returns
   * ok:false with a human-readable reason (naming the unlocking action) when
   * the table does not exist yet — "mergeado não é produção".
   */
  storeMemoryLessons?(input: { runId: string; lessons: string }): Promise<{ ok: boolean; reason?: string }>;
}

export interface HermesPort {
  task(prompt: string): Promise<{ ok: boolean; output: string; engineUsed: string | null; ms: number | null }>;
  publish(payload: { channel: string; post: string }): Promise<{ ok: boolean; detail: string }>;
}

export interface ArtifactsPort {
  get(runId: string, node: string): Promise<string | null>;
  set(runId: string, node: string, text: string): Promise<void>;
}

/**
 * One inline button under a Telegram message. `data` is what the bot receives
 * back in the callback_query — the api's telegram webhook (routes/telegram.ts)
 * turns `ap:<stepId>` / `rj:<stepId>` into the #445 finish call, so approving
 * is one tap, and rejecting asks "why?" and stores the reason as the sphere's
 * memory. Founder 17/08: "uma caixa com approve ou reject", like n8n.
 */
export interface TelegramButton {
  text: string;
  data: string;
}

export interface GraphRunnerPorts {
  substrate: SubstratePort;
  hermes: HermesPort;
  artifacts: ArtifactsPort;
  /** Send a message; `buttons` (optional) renders one row of inline buttons. */
  telegram(text: string, buttons?: TelegramButton[]): Promise<void>;
  now(): Date;
}

export interface AdvanceResult {
  status: "in-flight" | "completed" | "failed" | "not-running";
  started: string[];
  notes: string[];
}

/** A step stuck 'running' longer than this is treated as a crash. */
export const RUNNING_TIMEOUT_HOURS = 2;
/**
 * Default timeout for EVERY approval node that does not declare its own
 * config.timeoutHours. The 18-20/08 starvation was caused by four daily-video
 * runs parked forever on a founder-approval with NO timeout — immortal runs
 * that ate the tick's slots for three days. An approval the human never
 * answers now resolves itself: timeout = rejection-by-silence, NEVER
 * publication. Same mechanism daily-dream's launch-approval always used
 * (config.timeoutHours: 96) — this only makes 96h the floor for everyone.
 */
export const DEFAULT_APPROVAL_TIMEOUT_HOURS = 96;
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

/**
 * Daily publish cap per channel — the cadence valve. LinkedIn is the only
 * channel with THREE producers (sphere-linkedin, daily-video's adaptation,
 * content-experiment); 3 posts/day on a company page reads as spam and the
 * founder noticed (24/08). Default: linkedin 2/day; everything else
 * unlimited. Override per channel: CHANNEL_DAILY_CAP_LINKEDIN=1 etc.
 * A capped publish is DEFERRED (parked as waiting, released after 00:00 UTC),
 * never dropped — content survives, the feed breathes.
 */
export function channelDailyCap(channel: string): number | null {
  const envRaw = process.env[`CHANNEL_DAILY_CAP_${channel.toUpperCase()}`];
  if (envRaw !== undefined && envRaw.trim() !== "") {
    const n = Number(envRaw);
    if (Number.isFinite(n)) return n <= 0 ? null : Math.floor(n); // 0/neg = sem cap
  }
  return channel.toLowerCase() === "linkedin" ? 2 : null;
}

/** Is this publish node targeting X? (channel string is case-insensitive.) */
function isXPublish(node: GraphNode): boolean {
  return node.kind === "publish" && String(node.config?.["channel"] ?? "").toLowerCase() === "x";
}

/**
 * The content node whose artifact ultimately reaches an X publish. Mirrors the
 * publish handler's walk-back: publish → approval (dependsOn[0]) → content
 * (approval.dependsOn[0]). Returns the set of such content-node ids so the
 * adapt/finalize step can pre-trim to X's limit BEFORE the approval message is
 * sent, keeping what the founder sees identical to what would publish.
 */
function xAdaptNodeIds(def: GraphDefinition): Set<string> {
  const ids = new Set<string>();
  for (const pub of def.nodes) {
    if (!isXPublish(pub)) continue;
    const approvalId = pub.dependsOn[0];
    const approval = def.nodes.find((n) => n.id === approvalId);
    const contentId = approval?.dependsOn[0] ?? approvalId;
    if (contentId) ids.add(contentId);
  }
  return ids;
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
    } else if (node.kind === "publish") {
      // A cadence-deferred publish (24/08). Re-check the slot every tick;
      // after 00:00 UTC the counter resets and the content ships. Same X
      // handling as the fresh path: thread → tweet 1, hard limit guard.
      const channel = String(node.config?.["channel"] ?? "linkedin");
      const cap = channelDailyCap(channel);
      if (cap === null || (await substrate.publishedToday(channel)) < cap) {
        const approvalNode = def.nodes.find((n) => n.id === node.dependsOn[0]);
        const contentNodeId = approvalNode?.dependsOn[0] ?? node.dependsOn[0] ?? "";
        const post =
          ((await artifacts.get(runId, node.dependsOn.length ? node.dependsOn[0]! : "")) ?? "") ||
          ((await artifacts.get(runId, contentNodeId)) ?? "");
        if (!post) {
          await substrate.finishStep(step.id, { status: "failed", summary: "deferred publish lost its content artifact (TTL)" });
          step.status = "failed";
        } else {
          let toSend = post;
          let threadNote = "";
          if (isXPublish(node)) {
            const segments = splitXSegments(post);
            if (segments.length > 1) {
              toSend = segments[0]!;
              threadNote = ` (thread de ${segments.length} tweets publicada como tweet único — pipe atual é single-post)`;
            }
          }
          if (isXPublish(node) && !xPostWithinLimit(toSend)) {
            await substrate.finishStep(step.id, { status: "failed", summary: `x post over ${X_POST_LIMIT} chars, not sent — nothing published` });
            step.status = "failed";
          } else {
            const res = await hermes.publish({ channel, post: toSend });
            if (res.ok) {
              await artifacts.set(runId, nodeId, res.detail);
              await substrate.finishStep(step.id, {
                status: "succeeded",
                outputHash: sha(res.detail),
                summary: `published via ${String(node.config?.["via"] ?? "postiz")} channel=${channel}${threadNote} (apos adiamento de cadencia)`,
              });
              step.status = "succeeded";
              notes.push(`deferred publish ${nodeId} released`);
            }
            // res.ok=false → keep waiting; next tick retries (Postiz blip must
            // not kill an approved, cadence-deferred post).
          }
        }
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
      // NO approval parks forever (18-20/08 starvation: immortal approvals ate
      // the tick's slots for three days). An explicit config.timeoutHours wins;
      // without one, DEFAULT_APPROVAL_TIMEOUT_HOURS applies. optional → skipped
      // (benign, the tail just doesn't run); required → failed, out loud, with
      // the content that died un-decided. Timeout NEVER auto-approves: silence
      // is a rejection, and nothing reaches the public on a timeout.
      const configured = Number(node.config?.["timeoutHours"] ?? 0);
      const timeoutHours = configured > 0 ? configured : DEFAULT_APPROVAL_TIMEOUT_HOURS;
      if (hoursSince(step.started_at, now()) >= timeoutHours) {
        const optional = node.config?.["optional"] === true;
        await substrate.finishStep(step.id, {
          status: optional ? "skipped" : "failed",
          summary: `approval timed out after ${timeoutHours}h — no decision (${optional ? "optional → skipped" : "timeout = rejection-by-silence, nothing published"})`,
        });
        step.status = optional ? "skipped" : "failed";
        if (!optional) {
          // Name the content that died — the founder must know WHAT expired,
          // not just that something did (nada degrada calado).
          const content = (await artifacts.get(runId, node.dependsOn[0] ?? "")) ?? "";
          await telegram(
            [
              `⏳ APROVAÇÃO EXPIROU — graph ${def.slug} (run ${runId.slice(0, 8)}): sem decisão em ${timeoutHours}h.`,
              `NADA foi publicado — timeout é rejeição por silêncio, nunca publicação.`,
              `Conteúdo que morreu sem decisão:`,
              content.slice(0, 400) || "(sem artefato)",
            ].join("\n")
          );
        }
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
  // Content nodes whose artifact reaches an X publish — pre-trimmed to X's limit
  // at finalize time so approval == what publishes.
  const xAdaptNodes = xAdaptNodeIds(def);
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
      // The editorial calendar (founder 14/08: seven different days, not one
      // day seven times). Every reasoning node of a marketing cell sees the
      // day's theme/angle/CTA as [__day__]; the briefing prompts must honor
      // it. Brains (CEO-owned, read-only) do not get it — they are not content.
      if (def.vpOwner === "marketing") {
        // 5.F.3: institutional content lessons reach ONLY the critics (debate
        // nodes) — the creators stay free to draft; the vetoers carry the
        // memory. Constant, no I/O — the exact [__day__] pattern. Brains
        // (CEO/engineering-owned) never receive it: they are not content.
        if (node.kind === "debate") {
          upstream.unshift([LESSONS_ARTIFACT, CONTENT_LESSONS]);
          // 5.F.1: the CONSOLIDATED, founder-approved lessons — the durable
          // sibling of [__lessons__], read from ops.memory_lesson at tick
          // time. Fail-open by contract: empty store, missing migration or a
          // read error all mean NO artifact (never placeholder text), and the
          // critic reasons exactly as before.
          if (substrate.activeMemoryLessons) {
            try {
              const mem = await substrate.activeMemoryLessons();
              if (mem && mem.trim()) upstream.unshift([MEMORY_ARTIFACT, mem]);
            } catch {
              /* fail-open by contract; the port should not throw */
            }
          }
        }
        upstream.unshift([DAY_ARTIFACT, dayBlock(now())]);
        // Real conversations/opportunities from the Signal Engine, when wired.
        // Fail-open: no env / down / bad payload → the cell keeps working on
        // its own memory. Only signal/briefing/PPC-style nodes benefit, but
        // giving every reasoning node the same block keeps critics honest too.
        if (substrate.externalSignals) {
          try {
            const sig = await substrate.externalSignals();
            if (sig) upstream.unshift([SIGNALS_ARTIFACT, sig]);
          } catch {
            /* fail-open by contract; the port should not throw */
          }
        }
      }
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
        // Adapt/finalize step for X: if this node's artifact is what the X
        // publish will send, trim each tweet to X's limit HERE — so the founder
        // approves exactly what would post, and an over-limit draft never
        // reaches approval only to be rejected by Postiz (prod failure 17/08).
        const output = xAdaptNodes.has(node.id) ? adaptXForPublish(res.output) : res.output;
        await artifacts.set(runId, node.id, output);
        await substrate.finishStep(stepId, {
          status: "succeeded",
          outputHash: sha(output),
          summary:
            output === res.output
              ? `${node.kind} ok via ${res.engineUsed ?? "?"}`
              : `${node.kind} ok via ${res.engineUsed ?? "?"} (adapted to X ${X_POST_LIMIT}-char limit)`,
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
          (n.kind === "publish" || n.kind === "spawn" || n.kind === "store") &&
          n.dependsOn.some((d) => d === node.id)
      );
      const destinations = downstream.map((n) =>
        n.kind === "publish"
          ? `publicar como POST em ${String(n.config?.["channel"] ?? "linkedin")} (via ${String(n.config?.["via"] ?? "postiz")})`
          : n.kind === "store"
            ? `ativar como memória durável (${String(n.config?.["target"] ?? "?")}) — vira [__memory__] dos críticos de marketing`
            : `lançar experimento(s): ${(Array.isArray(n.config?.["spawns"]) ? (n.config["spawns"] as unknown[]) : []).map(String).join(", ")}`
      );
      const question = typeof node.config?.["question"] === "string" ? (node.config["question"] as string) : null;
      await substrate.finishStep(stepId, { status: "waiting", summary: "awaiting human decision" });
      // Founder 17/08: approval as a BOX with two buttons (like n8n), not a
      // route to curl. The buttons carry the step id; the api's telegram
      // webhook maps them to the #445 finish call. Reject asks "why?" and the
      // reason becomes the sphere's memory (routes/telegram.ts). The route
      // hint stays as a fallback for when the webhook is not wired.
      await telegram(
        [
          `🟡 APROVAÇÃO NECESSÁRIA — graph ${def.slug} (run ${runId.slice(0, 8)})`,
          destinations.length > 0 ? `Aprovar vai: ${destinations.join(" · ")}` : `Aprovar destrava o resto do graph (sem publicação direta neste passo).`,
          ...(question ? [question] : []),
          `Conteúdo proposto:`,
          context.slice(0, 900),
          ``,
          `Toque em um botão. Se rejeitar, eu pergunto o porquê e a esfera aprende.`,
          `(fallback: POST /api/v1/operator/agent-steps/${stepId}/finish status=succeeded|failed)`,
        ].join("\n"),
        [
          { text: "✅ Aprovar", data: `ap:${stepId}` },
          { text: "❌ Rejeitar", data: `rj:${stepId}` },
        ]
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
      // Cadence valve (24/08: three producers landed on LinkedIn the same
      // day). Over the cap → PARK, don't drop: section 2 re-checks every tick
      // and releases after 00:00 UTC when a slot frees up.
      const cap = channelDailyCap(channel);
      if (cap !== null && (await substrate.publishedToday(channel)) >= cap) {
        await substrate.finishStep(stepId, {
          status: "waiting",
          summary: `channel cadence: ${channel} ja publicou ${cap}/${cap} hoje — adiado (sai apos 00:00 UTC)`,
        });
        await telegram(
          `🟡 CADÊNCIA ${channel.toUpperCase()} — graph ${def.slug}: já saíram ${cap} publicações hoje nesse canal. Este conteúdo (aprovado) foi ADIADO e publica sozinho depois das 00:00 UTC. Cap por canal: env CHANNEL_DAILY_CAP_${channel.toUpperCase()}.`
        );
        continue;
      }
      // X thread reality check (prod failure 22/08): a mini-thread passes the
      // per-tweet limit, but the Postiz pipe publishes ONE post per call — the
      // joined text got rejected with "post is too long". Until real thread
      // support exists, publish tweet 1 (already compliant) and say so out
      // loud; losing tweets 2..N beats losing the whole run.
      let toSend = post;
      let threadNote = "";
      if (isXPublish(node)) {
        const segments = splitXSegments(post);
        if (segments.length > 1) {
          toSend = segments[0]!;
          threadNote = ` (thread de ${segments.length} tweets publicada como tweet único — pipe atual é single-post)`;
          await telegram(
            `🟡 X: o conteúdo aprovado era uma thread de ${segments.length} tweets; publicado só o tweet 1 (o pipe Postiz atual é single-post). Os demais não foram enviados. Suporte a thread está na fila.`
          );
        }
      }
      // Belt-and-suspenders (prod failure 17/08): even if the adapt step was
      // skipped or edited around, NEVER hand Postiz an over-limit X post. Fail
      // the step honestly with a reason instead of a silent, wasted send.
      if (isXPublish(node) && !xPostWithinLimit(toSend)) {
        await substrate.finishStep(stepId, {
          status: "failed",
          summary: `x post over ${X_POST_LIMIT} chars, not sent (adapt step missed it) — nothing published`,
        });
        await telegram(
          `🔴 X NÃO PUBLICADO — graph ${def.slug} (run ${runId.slice(0, 8)}): post acima de ${X_POST_LIMIT} caracteres. NADA foi enviado ao Postiz. O passo de adaptação deixou passar; corrigir o finalize.`
        );
        continue;
      }
      const res = await hermes.publish({ channel, post: toSend });
      if (res.ok) {
        await artifacts.set(runId, node.id, res.detail);
        await substrate.finishStep(stepId, {
          status: "succeeded",
          outputHash: sha(res.detail),
          summary: `published via ${String(config["via"] ?? "postiz")} channel=${channel}${threadNote}`,
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
    } else if (node.kind === "store") {
      // 5.F.1: persist the APPROVED lessons as the new active memory. Only
      // reachable after a human approval (validateGraph hard rule), so
      // whatever text arrives here carries the founder's explicit yes. The
      // content lives on the approval's own upstream (the compose) — same
      // one-edge-back walk as publish.
      const stepId = await substrate.startStep({ runId, node: node.id, parentStepId });
      const approvalNode = def.nodes.find((n) => n.id === node.dependsOn[0]);
      const contentNodeId = approvalNode?.dependsOn[0] ?? node.dependsOn[0] ?? "";
      const lessons = ((await artifacts.get(runId, contentNodeId)) ?? "").trim();
      if (!lessons) {
        await substrate.finishStep(stepId, { status: "failed", summary: "store had no approved content artifact (TTL?)" });
        continue; // next tick's fail-fast closes the run, out loud
      }
      if (!substrate.storeMemoryLessons) {
        // A runner wired without the port cannot persist — honest failure with
        // the exact gap named, never a silent success ("mergeado ≠ produção").
        await substrate.finishStep(stepId, {
          status: "failed",
          summary: "store port ausente neste worker — memoria NAO gravada (feature desligada)",
        });
        continue;
      }
      const res = await substrate.storeMemoryLessons({ runId, lessons });
      if (res.ok) {
        await artifacts.set(runId, node.id, lessons);
        await substrate.finishStep(stepId, {
          status: "succeeded",
          outputHash: sha(lessons),
          summary: `stored ${lessons.split("\n").length} linha(s) como memoria ativa (${String(config["target"] ?? "memory-lessons")})`,
        });
      } else {
        const reason = (res.reason ?? "motivo desconhecido").slice(0, 200);
        await substrate.finishStep(stepId, { status: "failed", summary: `store falhou: ${reason}` });
        await telegram(
          `🔴 MEMÓRIA NÃO GRAVADA — graph ${def.slug} (run ${runId.slice(0, 8)}): as lições foram APROVADAS mas o store falhou: ${reason}. Nada mudou nos críticos ([__memory__] segue como estava).`
        );
      }
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
