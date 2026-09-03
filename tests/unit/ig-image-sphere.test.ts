/**
 * 1.6 — "IG com IMAGEM já" (01/09). sphere-instagram leaves the report-only
 * palliative (#516) by pairing a branded CARD (PNG rendered by code from the
 * approved [CARD HOOK]) with the caption. What these tests pin:
 *
 *  - OFF by default ("mergeado ≠ produção"): without IG_IMAGE_PUBLISH=1 the
 *    registry graph is report-only, the title names the unlocking action, and
 *    no approval is ever asked for a publish that would die at Postiz;
 *  - ON: draft → critic → finalize (code-checked contract) → approval that
 *    SHOWS the hook and the caption → publish whose payload carries the image
 *    → wait → harvest → verdict, through the SAME machinery (cadence valve,
 *    circuit breaker, retry budget with the publish-ambiguity guard);
 *  - render fails / no media port / broken contract → the publish step fails
 *    with a PROVEN-not-sent summary and NOTHING is published — never text
 *    alone to a media channel (the original bug);
 *  - TikTok / YouTube: untouched, still report-only.
 *
 * Marker-routed fakes: the hermes.task fake answers the finalize prompt (the
 * one carrying the [CARD HOOK] contract) with a well-formed card post, and
 * every other prompt with an OUT[...] echo.
 */

import { describe, it, expect } from "vitest";
import {
  advanceRun,
  parseCardPost,
  CARD_HOOK_MAX_CHARS,
  PUBLISH_NOT_SENT_PREFIX,
  CIRCUIT_BREAKER_THRESHOLD,
  nodeRetryBudget,
  GRAPH_REGISTRY,
  type GraphRunnerPorts,
  type PublishPayload,
  type StepRow,
  type RunRow,
} from "../../apps/api/src/lib/graph-runner";
import {
  buildSphereInstagramGraph,
  igImagePublishEnabled,
  IG_IMAGE_UNLOCK_ACTION,
  SPHERE_INSTAGRAM_GRAPH,
  SPHERE_TIKTOK_GRAPH,
  SPHERE_YOUTUBE_GRAPH,
  validateGraph,
  type GraphDefinition,
} from "../../apps/api/src/lib/agent-graphs";
import { buildPrompt, TUNABLE_PROMPT_KEYS } from "../../apps/api/src/lib/graph-prompts";
import { cardSvg, layoutHookLines, hookTypography, CARD_BG } from "../../apps/worker/src/lib/card-render";

const IG_ON = buildSphereInstagramGraph(true);
const IG_OFF = buildSphereInstagramGraph(false);

const GOOD_FINALIZE = [
  "[CARD HOOK] Your brand is invisible to ChatGPT.",
  "[CAPTION]",
  "I asked ChatGPT for the best GEO tools last week.",
  "It named three brands. None of them was the market leader.",
  "Visibility in AI answers is earned, not bought.",
  "I check mine every Monday. Want yours?",
  "[HASHTAGS] #geo #aisearch #smallbusiness #chatgptseo",
].join("\n");

interface World {
  ports: GraphRunnerPorts;
  run: RunRow;
  steps: Array<StepRow & { summary?: string | null }>;
  telegrams: string[];
  published: PublishPayload[];
  clock: { now: Date };
  publishedTodayCount: number;
  circuitFailures: number;
  finalizeOutput: string;
  mediaMode: "ok" | "fail" | "throw";
  mediaCalls: Array<{ hook: string; runId: string; node: string }>;
  stepByNode(node: string): (StepRow & { summary?: string | null }) | undefined;
  stepsOf(node: string): Array<StepRow & { summary?: string | null }>;
}

function makeWorld(def: GraphDefinition, opts: { media?: boolean; circuit?: boolean } = {}): World {
  const clock = { now: new Date("2026-09-01T11:00:00Z") };
  const run: RunRow = { id: "run-ig-1", graph: def.slug, status: "running", started_at: clock.now.toISOString() };
  const steps: World["steps"] = [];
  const telegrams: string[] = [];
  const published: PublishPayload[] = [];
  const artifacts = new Map<string, string>();
  let seq = 0;
  const world: World = {
    run,
    steps,
    telegrams,
    published,
    clock,
    publishedTodayCount: 0,
    circuitFailures: 0,
    finalizeOutput: GOOD_FINALIZE,
    mediaMode: "ok",
    mediaCalls: [],
    stepByNode: (node) => [...steps].reverse().find((s) => s.node === node),
    stepsOf: (node) => steps.filter((s) => s.node === node),
    ports: {
      substrate: {
        async getRun() {
          return { ...run };
        },
        async loadSteps() {
          return steps.map((s) => ({ ...s }));
        },
        async startStep(input) {
          const id = `step-${++seq}`;
          steps.push({ id, node: input.node, status: "running", started_at: clock.now.toISOString() });
          return id;
        },
        async finishStep(stepId, input) {
          const s = steps.find((x) => x.id === stepId);
          if (s) {
            s.status = input.status;
            s.summary = input.summary ?? null;
          }
        },
        async finishRun(_runId, status) {
          run.status = status;
        },
        async recordOutcome() {
          return "outcome-1";
        },
        publishedToday: async () => world.publishedTodayCount,
        async readHarvest() {
          return { n: 2, total: 1200 };
        },
        async snapshot() {
          return "(sem dado)";
        },
        async startRun() {
          return "child-1";
        },
      },
      hermes: {
        async task(prompt) {
          // Marker routing: the finalize prompt is the one that states the
          // card output contract; everything else gets the echo.
          if (prompt.includes("Voce e o editor-chefe da esfera Instagram")) {
            return { ok: true, output: world.finalizeOutput, engineUsed: "claude", ms: 100 };
          }
          return { ok: true, output: `OUT[${prompt.slice(0, 40)}]`, engineUsed: "claude", ms: 50 };
        },
        async publish(payload) {
          published.push(payload);
          return { ok: true, detail: JSON.stringify({ postiz: { id: "pz-ig-1" } }) };
        },
      },
      artifacts: {
        async get(runId, node) {
          return artifacts.get(`${runId}:${node}`) ?? null;
        },
        async set(runId, node, text) {
          artifacts.set(`${runId}:${node}`, text);
        },
      },
      telegram: async (text) => {
        telegrams.push(text);
      },
      now: () => clock.now,
      ...(opts.media === false
        ? {}
        : {
            media: {
              async cardPng(input) {
                world.mediaCalls.push(input);
                if (world.mediaMode === "throw") throw new Error("sharp exploded");
                if (world.mediaMode === "fail") return { ok: false as const, reason: "librsvg: fontconfig missing" };
                const png = Buffer.from(`PNG-FAKE-${input.hook}`);
                return { ok: true as const, base64: png.toString("base64"), bytes: png.length };
              },
            },
          }),
      ...(opts.circuit
        ? {
            circuit: {
              async status() {
                return { open: world.circuitFailures >= CIRCUIT_BREAKER_THRESHOLD, failures: world.circuitFailures };
              },
              async record(_ch, ok) {
                world.circuitFailures = ok ? 0 : world.circuitFailures + 1;
                return { open: world.circuitFailures >= CIRCUIT_BREAKER_THRESHOLD, failures: world.circuitFailures };
              },
              async alarmOnce() {
                return true;
              },
            },
          }
        : {}),
    },
  };
  return world;
}

async function tickUntil(world: World, def: GraphDefinition, done: () => boolean, max = 30): Promise<void> {
  for (let i = 0; i < max && !done(); i++) await advanceRun(def, world.run.id, world.ports);
}

async function approve(world: World): Promise<void> {
  const ap = world.stepByNode("approval")!;
  await world.ports.substrate.finishStep(ap.id, { status: "succeeded", summary: "founder: yes" });
}

describe("1.6 — the switch: OFF by default, ON only by IG_IMAGE_PUBLISH=1", () => {
  it("igImagePublishEnabled reads exactly '1'", () => {
    expect(igImagePublishEnabled({})).toBe(false);
    expect(igImagePublishEnabled({ IG_IMAGE_PUBLISH: "" })).toBe(false);
    expect(igImagePublishEnabled({ IG_IMAGE_PUBLISH: "true" })).toBe(false);
    expect(igImagePublishEnabled({ IG_IMAGE_PUBLISH: "1" })).toBe(true);
    expect(igImagePublishEnabled({ IG_IMAGE_PUBLISH: " 1 " })).toBe(true);
  });

  it("the registry graph follows the env of THIS process (unset here → report-only), same slug either way", () => {
    expect(igImagePublishEnabled(process.env)).toBe(false);
    expect(SPHERE_INSTAGRAM_GRAPH).toEqual(IG_OFF);
    expect(GRAPH_REGISTRY["sphere-instagram"]).toEqual(IG_OFF);
    expect(IG_ON.slug).toBe("sphere-instagram");
    expect(IG_OFF.slug).toBe("sphere-instagram");
    expect(IG_ON.version).toBe(2);
    expect(IG_OFF.version).toBe(2);
  });

  it("OFF: report-only — no approval, no publish, no harvest; the title names the unlocking action", () => {
    expect(validateGraph(IG_OFF).errors).toEqual([]);
    const kinds = new Set(IG_OFF.nodes.map((n) => n.kind));
    expect(kinds.has("approval")).toBe(false);
    expect(kinds.has("publish")).toBe(false);
    expect(kinds.has("harvest")).toBe(false);
    const report = IG_OFF.nodes.find((n) => n.id === "report")!;
    expect(report.dependsOn).toEqual(["finalize"]);
    const title = String(report.config?.["title"]);
    expect(title).toContain("DESLIGADA");
    expect(title).toContain(IG_IMAGE_UNLOCK_ACTION);
    expect(title).toContain("ig-image-fase1.md");
    expect(title).toContain("IG_IMAGE_PUBLISH=1");
  });

  it("ON: the real pipeline — finalize → approval → publish(media card) → wait 48h → harvest → verdict, validated", () => {
    expect(validateGraph(IG_ON).errors).toEqual([]);
    const byId = new Map(IG_ON.nodes.map((n) => [n.id, n]));
    // 10.C.3 (sweep 02/09): o prefixo segue a FAMÍLIA da métrica colhida —
    // o coletor escreve instagramstandalone_*, então instagram_ era cego.
    expect(byId.get("memory")!.config?.["metricPrefix"]).toBe("instagramstandalone_");
    expect(byId.get("draft-one-liner")!.config?.["prompt"]).toBe("instagram-draft");
    expect(byId.get("draft-story")!.config?.["prompt"]).toBe("instagram-draft");
    expect(byId.get("critic")!.dependsOn).toContain("memory");
    expect(byId.get("approval")!.dependsOn).toEqual(["finalize"]);
    const pub = byId.get("publish")!;
    expect(pub.dependsOn).toEqual(["approval"]);
    expect(pub.config).toEqual({ channel: "instagram", via: "postiz", media: "card" });
    expect(byId.get("wait-48h")!.config?.["hours"]).toBe(48);
    // 22/08 sweep: the collector writes instagramstandalone_*; 'instagram_' matched nothing.
    expect(byId.get("harvest")!.config?.["metric"]).toBe("instagramstandalone_reach");
    expect(byId.get("verdict")!.dependsOn).toEqual(["harvest"]);
    expect(byId.get("report")).toBeUndefined();
  });

  it("the head (memory → signal → briefing → 2 drafts → critic → finalize) is IDENTICAL in both shapes", () => {
    const head = (d: GraphDefinition) => d.nodes.filter((n) => !["approval", "publish", "wait-48h", "harvest", "verdict", "report"].includes(n.id));
    expect(head(IG_ON)).toEqual(head(IG_OFF));
  });

  it("TikTok / YouTube are untouched: still the B5 report-only shape, no media, no approval", () => {
    for (const def of [SPHERE_TIKTOK_GRAPH, SPHERE_YOUTUBE_GRAPH]) {
      const ids = def.nodes.map((n) => n.id);
      expect(ids, def.slug).toEqual(["memory", "signal", "briefing", "draft-talking-head", "draft-caption-story", "critic", "finalize", "report"]);
      expect(def.nodes.some((n) => n.kind === "publish" || n.kind === "approval"), def.slug).toBe(false);
      expect(def.nodes.some((n) => n.config?.["media"] !== undefined), def.slug).toBe(false);
      expect(String(def.nodes.at(-1)!.config?.["title"])).toContain("roteiro pronto para gravar");
    }
  });
});

describe("1.6 — the card contract (parseCardPost) is code, not a prompt wish", () => {
  it("parses hook + caption + hashtags; the caption sent = caption block + hashtags line", () => {
    const p = parseCardPost(GOOD_FINALIZE);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.hook).toBe("Your brand is invisible to ChatGPT.");
    expect(p.caption.startsWith("I asked ChatGPT")).toBe(true);
    expect(p.caption.endsWith("#geo #aisearch #smallbusiness #chatgptseo")).toBe(true);
    expect(p.caption).not.toContain("[CARD HOOK]");
    expect(p.caption).not.toContain("[CAPTION]");
    expect(p.caption).not.toContain("[HASHTAGS]");
  });

  it("strips wrapping quotes from the hook, tolerates CRLF and a missing hashtags line", () => {
    const p = parseCardPost('[CARD HOOK] "Stop paying for clicks."\r\n[CAPTION]\r\nLine one.\r\nLine two.');
    expect(p).toEqual({ ok: true, hook: "Stop paying for clicks.", caption: "Line one.\nLine two." });
  });

  it("refuses: no hook line, empty hook, over-long hook, hashtag/link in the hook, empty caption", () => {
    expect(parseCardPost("[CAPTION]\nhello")).toMatchObject({ ok: false, reason: expect.stringContaining("[CARD HOOK]") });
    expect(parseCardPost("[CARD HOOK]\n[CAPTION]\nhello")).toMatchObject({ ok: false, reason: expect.stringContaining("vazio") });
    const long = "x".repeat(CARD_HOOK_MAX_CHARS + 1);
    expect(parseCardPost(`[CARD HOOK] ${long}\n[CAPTION]\nhello`)).toMatchObject({ ok: false, reason: expect.stringContaining("caracteres") });
    expect(parseCardPost("[CARD HOOK] hi #geo\n[CAPTION]\nhello")).toMatchObject({ ok: false });
    expect(parseCardPost("[CARD HOOK] see https://x.y\n[CAPTION]\nhello")).toMatchObject({ ok: false });
    expect(parseCardPost("[CARD HOOK] fine\n[CAPTION]\n\n[HASHTAGS] #a")).toMatchObject({ ok: false, reason: expect.stringContaining("[CAPTION]") });
    expect(parseCardPost("OUT[some echo]")).toMatchObject({ ok: false });
  });
});

describe("1.6 — prompts: the card family inherits the anti-generic machinery and states the contract", () => {
  it("instagram-draft / -critic are still tunable keys (the [__recent__] injection surface) and carry the rules", () => {
    expect(TUNABLE_PROMPT_KEYS).toContain("instagram-draft");
    expect(TUNABLE_PROMPT_KEYS).toContain("instagram-critic");
    const draft = buildPrompt("task", { prompt: "instagram-draft", style: "story" }, []) ?? "";
    expect(draft).toContain("ANTI-GENERICO");
    expect(draft).toContain("[__recent__]");
    expect(draft).toContain("[CARD HOOK]");
    expect(draft).toContain("Hashtags: 3-5 de NICHO");
    expect(draft).toContain("INGLES");
    expect(draft).not.toContain("[RENDER BRIEF]");
    const critic = buildPrompt("debate", { prompt: "instagram-critic" }, []) ?? "";
    expect(critic).toContain("[__lessons__]");
    expect(critic).toContain("VETO");
    expect(critic).toContain("[memory]");
    expect(critic).toContain("nao cabe no card");
    const fin = buildPrompt("synthesis", { prompt: "instagram-finalize" }, []) ?? "";
    expect(fin).toContain("[CARD HOOK]");
    expect(fin).toContain("[CAPTION]");
    expect(fin).toContain("[HASHTAGS]");
    expect(fin).toContain("aprovacao do founder");
    for (const slug of ["instagram-signal", "instagram-briefing"]) {
      const p = buildPrompt("task", { prompt: slug }, []) ?? "";
      expect(p, slug).toContain("card");
    }
    expect(buildPrompt("task", { prompt: "instagram-briefing" }, [])).toContain("CALENDARIO EDITORIAL");
  });
});

describe("1.6 — the ON pipeline through the runner (fakes, marker-routed)", () => {
  it("runs to the approval gate; the box names the IMAGE destination and shows the hook AND the caption", async () => {
    const world = makeWorld(IG_ON);
    await tickUntil(world, IG_ON, () => world.stepByNode("approval")?.status === "waiting");
    expect(world.stepByNode("finalize")?.status).toBe("succeeded");
    expect(world.stepByNode("publish")).toBeUndefined();
    expect(world.published).toEqual([]);
    const ask = world.telegrams.find((t) => t.includes("APROVAÇÃO"))!;
    expect(ask).toBeTruthy();
    expect(ask).toContain("POST COM IMAGEM em instagram");
    expect(ask).toContain("Card (hook impresso na imagem): «Your brand is invisible to ChatGPT.»");
    expect(ask).toContain("I asked ChatGPT for the best GEO tools");
    expect(ask).toContain("#geo #aisearch");
  });

  it("approve → the publish payload carries the caption + the card image; the record says media=card", async () => {
    const world = makeWorld(IG_ON);
    await tickUntil(world, IG_ON, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await tickUntil(world, IG_ON, () => world.stepByNode("wait-48h")?.status === "waiting");
    expect(world.published).toHaveLength(1);
    const p = world.published[0]!;
    expect(p.channel).toBe("instagram");
    expect(p.post.startsWith("I asked ChatGPT")).toBe(true);
    expect(p.post).not.toContain("[CARD HOOK]");
    expect(p.image).toHaveLength(1);
    expect(p.image![0]!.mime).toBe("image/png");
    expect(p.image![0]!.filename).toMatch(/^ozvor-card-run-ig-1?\.png$|^ozvor-card-.{8}\.png$/);
    expect(Buffer.from(p.image![0]!.base64, "base64").toString()).toBe("PNG-FAKE-Your brand is invisible to ChatGPT.");
    // The card was rendered from EXACTLY the approved hook, after the yes.
    expect(world.mediaCalls).toEqual([{ hook: "Your brand is invisible to ChatGPT.", runId: "run-ig-1", node: "publish" }]);
    expect(world.stepByNode("publish")?.summary).toBe("published via postiz channel=instagram media=card(1)");
    // ...and the loop closes like every other sphere.
    world.clock.now = new Date(world.clock.now.getTime() + 49 * 3_600_000);
    await tickUntil(world, IG_ON, () => world.run.status !== "running");
    expect(world.stepByNode("harvest")?.status).toBe("succeeded");
    expect(world.stepByNode("verdict")?.status).toBe("succeeded");
    expect(world.run.status).toBe("succeeded");
  });

  it("render FAILS → the publish step fails as proven-not-sent, NOTHING published (never text-only); retry budget re-tries, then the run fails", async () => {
    const world = makeWorld(IG_ON);
    world.mediaMode = "fail";
    await tickUntil(world, IG_ON, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await tickUntil(world, IG_ON, () => world.run.status !== "running");
    expect(world.published).toEqual([]);
    const attempts = world.stepsOf("publish");
    // budget + 1 attempts, every one refused BEFORE the Postiz call
    expect(attempts).toHaveLength(nodeRetryBudget() + 1);
    for (const a of attempts) {
      expect(a.status).toBe("failed");
      expect(a.summary).toContain(`${PUBLISH_NOT_SENT_PREFIX} render do card falhou`);
      expect(a.summary).toContain("nada enviado");
    }
    expect(world.run.status).toBe("failed");
    expect(world.telegrams.some((t) => t.includes("NÃO PUBLICADO") && t.includes("nunca texto puro"))).toBe(true);
    // No retry GATE was asked: a render failure is proven-not-sent, not ambiguous.
    expect(world.telegrams.some((t) => t.includes("PUBLISH FALHOU APÓS APROVAÇÃO"))).toBe(false);
  });

  it("media port THROWS → same honest refusal (the port contract says never throw, the runner still catches)", async () => {
    const world = makeWorld(IG_ON);
    world.mediaMode = "throw";
    await tickUntil(world, IG_ON, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await tickUntil(world, IG_ON, () => world.run.status !== "running");
    expect(world.published).toEqual([]);
    expect(world.stepByNode("publish")?.summary).toContain("sharp exploded");
  });

  it("no media port wired → refused with the nominal action; nothing published", async () => {
    const world = makeWorld(IG_ON, { media: false });
    await tickUntil(world, IG_ON, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await tickUntil(world, IG_ON, () => world.run.status !== "running");
    expect(world.published).toEqual([]);
    expect(world.stepByNode("publish")?.summary).toContain("worker sem porta de mídia");
    expect(world.telegrams.some((t) => t.includes("card-render.ts"))).toBe(true);
  });

  it("a finalize that breaks the contract fails the STEP before approval (retry, then run fails) — the founder never sees it", async () => {
    const world = makeWorld(IG_ON);
    world.finalizeOutput = "Here is a lovely caption without any markers.";
    await tickUntil(world, IG_ON, () => world.run.status !== "running");
    expect(world.stepByNode("approval")).toBeUndefined();
    expect(world.telegrams.some((t) => t.includes("APROVAÇÃO"))).toBe(false);
    expect(world.published).toEqual([]);
    const fins = world.stepsOf("finalize");
    expect(fins).toHaveLength(nodeRetryBudget() + 1);
    expect(fins[0]!.summary).toContain("finalize sem contrato do card");
    expect(world.run.status).toBe("failed");
  });

  it("cadence valve still applies: CHANNEL_DAILY_CAP_INSTAGRAM reached → PARKS; released later WITH the image", async () => {
    process.env["CHANNEL_DAILY_CAP_INSTAGRAM"] = "1";
    try {
      const world = makeWorld(IG_ON);
      world.publishedTodayCount = 1;
      await tickUntil(world, IG_ON, () => world.stepByNode("approval")?.status === "waiting");
      await approve(world);
      await tickUntil(world, IG_ON, () => world.stepByNode("publish")?.status === "waiting");
      expect(world.published).toEqual([]);
      expect(world.mediaCalls).toEqual([]); // nothing rendered for a parked post
      expect(world.stepByNode("publish")?.summary).toContain("channel cadence: instagram");
      // Midnight rolls the counter → the deferred publish ships, card and all.
      world.publishedTodayCount = 0;
      await tickUntil(world, IG_ON, () => world.stepByNode("publish")?.status === "succeeded");
      expect(world.published).toHaveLength(1);
      expect(world.published[0]!.image).toHaveLength(1);
      expect(world.published[0]!.post.startsWith("I asked ChatGPT")).toBe(true);
      expect(world.stepByNode("publish")?.summary).toContain("(apos adiamento de cadencia)");
    } finally {
      delete process.env["CHANNEL_DAILY_CAP_INSTAGRAM"];
    }
  });

  it("a deferred card publish whose render fails at release time also refuses — never text-only", async () => {
    process.env["CHANNEL_DAILY_CAP_INSTAGRAM"] = "1";
    try {
      const world = makeWorld(IG_ON);
      world.publishedTodayCount = 1;
      await tickUntil(world, IG_ON, () => world.stepByNode("approval")?.status === "waiting");
      await approve(world);
      await tickUntil(world, IG_ON, () => world.stepByNode("publish")?.status === "waiting");
      world.publishedTodayCount = 0;
      world.mediaMode = "fail";
      await tickUntil(world, IG_ON, () => world.run.status !== "running");
      expect(world.published).toEqual([]);
      expect(world.stepsOf("publish").every((s) => (s.summary ?? "").includes("nada enviado") || (s.summary ?? "").includes("channel cadence"))).toBe(true);
    } finally {
      delete process.env["CHANNEL_DAILY_CAP_INSTAGRAM"];
    }
  });

  it("circuit breaker still applies: an OPEN instagram circuit parks the approved card publish; nothing rendered, nothing sent", async () => {
    const world = makeWorld(IG_ON, { circuit: true });
    world.circuitFailures = CIRCUIT_BREAKER_THRESHOLD;
    await tickUntil(world, IG_ON, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    await tickUntil(world, IG_ON, () => world.stepByNode("publish")?.status === "waiting");
    expect(world.published).toEqual([]);
    expect(world.mediaCalls).toEqual([]);
    expect(world.stepByNode("publish")?.summary).toContain("circuito aberto");
    // Channel heals → the parked card publish ships with its image.
    world.circuitFailures = 0;
    await tickUntil(world, IG_ON, () => world.stepByNode("publish")?.status === "succeeded");
    expect(world.published).toHaveLength(1);
    expect(world.published[0]!.image).toHaveLength(1);
  });

  it("an AMBIGUOUS failure after approval (worker crash) is still gated on the founder — the #540 guard is untouched", async () => {
    const world = makeWorld(IG_ON);
    await tickUntil(world, IG_ON, () => world.stepByNode("approval")?.status === "waiting");
    await approve(world);
    // Simulate the crash shape: a publish step stuck 'running' past the timeout.
    const stepId = await world.ports.substrate.startStep({ runId: world.run.id, node: "publish", parentStepId: null });
    void stepId;
    world.clock.now = new Date(world.clock.now.getTime() + 3 * 3_600_000);
    await advanceRun(IG_ON, world.run.id, world.ports);
    expect(world.published).toEqual([]);
    expect(world.telegrams.some((t) => t.includes("PUBLISH FALHOU APÓS APROVAÇÃO") && t.includes("instagram"))).toBe(true);
    expect(world.stepByNode("publish")?.status).toBe("waiting");
  });

  it("OFF shape through the runner: ends in REPORT carrying the hook + caption, no approval, nothing published", async () => {
    const world = makeWorld(IG_OFF);
    await tickUntil(world, IG_OFF, () => world.run.status !== "running");
    expect(world.run.status).toBe("succeeded");
    expect(world.published).toEqual([]);
    expect(world.mediaCalls).toEqual([]);
    expect(world.stepByNode("approval")).toBeUndefined();
    expect(world.telegrams.some((t) => t.includes("APROVAÇÃO"))).toBe(false);
    const report = world.telegrams.find((t) => t.includes("DESLIGADA"))!;
    expect(report).toContain(IG_IMAGE_UNLOCK_ACTION);
    expect(report).toContain("[CARD HOOK] Your brand is invisible to ChatGPT.");
  });
});

describe("1.6 — the card renderer's pure half (layout + SVG), no sharp needed", () => {
  it("wraps greedily by words, never splits or drops a word", () => {
    expect(layoutHookLines("Your brand is invisible to ChatGPT.", 18)).toEqual(["Your brand is", "invisible to", "ChatGPT."]);
    expect(layoutHookLines("Supercalifragilisticexpialidocious yes", 10)).toEqual(["Supercalifragilisticexpialidocious", "yes"]);
    expect(layoutHookLines("   ", 10)).toEqual([]);
  });

  it("short hooks get bigger type; long hooks get more room", () => {
    expect(hookTypography("Short.").fontSize).toBeGreaterThan(hookTypography("x".repeat(70)).fontSize);
    expect(hookTypography("x".repeat(70)).maxCharsPerLine).toBeGreaterThan(hookTypography("Short.").maxCharsPerLine);
  });

  it("the SVG is brand-accurate, deterministic, and XML-escapes the hook", () => {
    const svg = cardSvg("Stop <paying> & \"pray\".");
    expect(svg).toContain(`fill="${CARD_BG}"`);
    expect(CARD_BG).toBe("#0a0f0d");
    expect(svg).toContain("#27c98a");
    expect(svg).toContain("Schibsted Grotesk");
    expect(svg).toContain("stroke-dasharray=\"56.55 9.39\""); // the O-ring geometry (Logo.tsx ×3)
    expect(svg).toContain("ozvor.com");
    // The hook wraps into tspans, so check each escaped fragment.
    expect(svg).toContain("&lt;paying&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;pray&quot;.");
    expect(svg).not.toContain("<paying>");
    expect(cardSvg("Same hook")).toBe(cardSvg("Same hook"));
  });
});
