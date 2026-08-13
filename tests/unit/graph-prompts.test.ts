/**
 * Graph prompts stay in sync with the graph shape (#164 v2).
 *
 * The v2 graph added a 4th critic (freshness) but the synthesis PROMPT still
 * said "3 criticas (hook/brand/compliance)" — a silent drift where the node
 * receives four critiques and the instruction describes three, so the
 * freshness veto could be quietly ignored by the synthesizer. These pins tie
 * the prompt text to the actual debate lenses in DAILY_VIDEO_GRAPH, so adding
 * or removing a critic fails the build until the synthesis prompt is updated.
 */

import { describe, it, expect } from "vitest";
import { buildPrompt, PROMPT_SLUGS } from "../../apps/api/src/lib/graph-prompts";
import {
  DAILY_VIDEO_GRAPH,
  DAILY_WATCHDOG_GRAPH,
  DAILY_DREAM_GRAPH,
} from "../../apps/api/src/lib/agent-graphs";

const debateLenses = DAILY_VIDEO_GRAPH.nodes
  .filter((n) => n.kind === "debate")
  .map((n) => String(n.config?.["lens"]));

describe("the synthesis prompt matches the debate it summarizes", () => {
  const synth = buildPrompt("synthesis", {}, []) ?? "";

  it("names the correct number of critiques", () => {
    // The synthesis node depends on every critic; the prompt must not
    // undercount them (the v2 drift: 4 critics, prompt said 3).
    expect(synth).toContain(`${debateLenses.length} criticas`);
  });

  it("every lens in the graph is named in the synthesis prompt", () => {
    for (const lens of debateLenses) {
      expect(synth, `synthesis prompt omits lens '${lens}'`).toContain(lens);
    }
  });

  it("freshness carries a veto, not just a score — repetition cannot ship", () => {
    // The whole point of v2: a rehash must be blocked, not averaged away.
    expect(synth.toLowerCase()).toContain("freshness");
    expect(synth.toLowerCase()).toMatch(/veto|requentado|muda/);
  });
});

describe("buildPrompt resolves the graph's task slugs", () => {
  it("every task/debate/synthesis node resolves to a real prompt", () => {
    for (const node of DAILY_VIDEO_GRAPH.nodes) {
      if (!["task", "debate", "synthesis"].includes(node.kind)) continue;
      const p = buildPrompt(node.kind, node.config ?? {}, []);
      expect(p, `node '${node.id}' (${node.kind}) has no resolvable prompt`).toBeTruthy();
    }
  });

  it("the memory prompt exists and reads the production log", () => {
    expect(PROMPT_SLUGS).toContain("video-memory");
    const mem = buildPrompt("task", { prompt: "video-memory" }, []) ?? "";
    expect(mem).toContain("vidjob.log");
    expect(mem).toContain("EVITAR REPETIR");
  });
});

describe("the read-only brains' prompts resolve and stay honest", () => {
  it("every Watchdog and CDO lens/synthesis node has a resolvable prompt", () => {
    for (const def of [DAILY_WATCHDOG_GRAPH, DAILY_DREAM_GRAPH]) {
      for (const node of def.nodes) {
        if (!["task", "debate", "synthesis"].includes(node.kind)) continue;
        const p = buildPrompt(node.kind, node.config ?? {}, []);
        expect(p, `${def.slug}/${node.id} has no resolvable prompt`).toBeTruthy();
      }
    }
  });

  it("both synthesis prompts say PROPOSE, not act — the read-only guarantee in words", () => {
    const watchdog = buildPrompt("synthesis", { prompt: "watchdog-synthesis" }, []) ?? "";
    const dream = buildPrompt("synthesis", { prompt: "dream-synthesis" }, []) ?? "";
    // The whole safety story is that these brains recommend; the prompt must
    // never let the engine write as if it executed something.
    expect(watchdog.toLowerCase()).toContain("propoe");
    expect(watchdog.toLowerCase()).toContain("nao executa");
    expect(dream.toLowerCase()).toContain("propoe");
  });

  it("the dreaming lenses demand an anchor in a real number — no vibes", () => {
    for (const slug of ["dream-reach", "dream-conversion", "dream-moat"]) {
      const p = buildPrompt("debate", { prompt: slug }, []) ?? "";
      expect(p.toLowerCase(), `${slug} must anchor in real data`).toContain("ancora");
    }
  });
});
