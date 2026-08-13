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
  WEEKLY_PRODUCT_GRAPH,
  WEEKLY_DISCOVERY_GRAPH,
  CONTENT_EXPERIMENT_GRAPH,
  SPHERE_X_GRAPH,
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
  it("every Watchdog, CDO, experiment-cell and sphere-cell reasoning node has a resolvable prompt", () => {
    for (const def of [DAILY_WATCHDOG_GRAPH, DAILY_DREAM_GRAPH, WEEKLY_PRODUCT_GRAPH, WEEKLY_DISCOVERY_GRAPH, CONTENT_EXPERIMENT_GRAPH, SPHERE_X_GRAPH]) {
      for (const node of def.nodes) {
        if (!["task", "debate", "synthesis"].includes(node.kind)) continue;
        const p = buildPrompt(node.kind, node.config ?? {}, []);
        expect(p, `${def.slug}/${node.id} has no resolvable prompt`).toBeTruthy();
      }
    }
  });

  it("the experiment brief reads the seeded hypothesis", () => {
    const brief = buildPrompt("task", { prompt: "experiment-brief" }, []) ?? "";
    expect(brief).toContain("__seed__");
    expect(brief.toLowerCase()).toContain("aposta #1");
  });

  it("EVERY publishable prompt demands English output — the founder's 13/08 rule as a build gate", () => {
    // The first orchestrated LinkedIn post went out in Portuguese. Any prompt
    // whose output becomes (or feeds verbatim into) a public post must carry
    // the English-first clause; internal analysis and founder reports stay PT.
    const publishable = [
      ["task", "write-briefing"],
      ["task", "draft-angle"],
      ["synthesis", "synthesize"],
      ["task", "video-to-linkedin"],
      ["task", "x-briefing"],
      ["task", "x-draft"],
      ["synthesis", "x-finalize"],
      ["task", "experiment-brief"],
      ["task", "experiment-draft"],
      ["synthesis", "experiment-finalize"],
    ] as const;
    for (const [kind, slug] of publishable) {
      const p = buildPrompt(kind, { prompt: slug }, []) ?? "";
      expect(p, `${slug} must demand English output`).toContain("INGLES");
    }
  });

  it("the LinkedIn adapt step forbids script residue — a post, never a screenplay", () => {
    const p = buildPrompt("task", { prompt: "video-to-linkedin" }, []) ?? "";
    expect(p).toContain("PROIBIDO");
    expect(p).toContain("[HOOK]");
    expect(p).toContain("POST DE LINKEDIN");
  });

  it("discovery carries the founder's standing initiatives (AI Audit Stack) into research AND ideation", () => {
    // Founder (13/08) flagged the AI Audit Stack as the BR-market entry product
    // the agents must analyze every week; both prompts must surface it, and
    // ideation must require at least one idea to advance a standing initiative.
    const research = buildPrompt("task", { prompt: "discovery-research" }, []) ?? "";
    const ideate = buildPrompt("synthesis", { prompt: "discovery-ideate" }, []) ?? "";
    for (const p of [research, ideate]) {
      expect(p).toContain("INICIATIVAS PERMANENTES");
      expect(p).toContain("AI Audit Stack");
    }
    // The capilaridade requirement (niches + full AI coverage) rides along.
    expect(ideate).toContain("CAPILARIDADE");
    expect(ideate.toLowerCase()).toContain("nicho");
    // Ideation is bound to advance at least one standing initiative.
    expect(ideate).toContain("pelo menos UMA");
  });

  it("the discovery pipeline matures ideas and can VETO — the founder never sees a raw fragment", () => {
    const viability = buildPrompt("debate", { prompt: "discovery-viability" }, []) ?? "";
    expect(viability).toContain("VETO");
    expect(viability).toContain("VEREDITO");
    const final = buildPrompt("synthesis", { prompt: "discovery-final" }, []) ?? "";
    expect(final).toContain("NENHUMA IDEIA MADURA");
    expect(final).toContain("PRONTA PARA MVP");
    const develop = buildPrompt("task", { prompt: "discovery-develop" }, []) ?? "";
    for (const block of ["PROBLEMA", "PUBLICO", "PROPOSTA", "MVP", "ESFORCO", "RISCO"]) {
      expect(develop, `spec must carry ${block}`).toContain(block);
    }
  });

  it("the X briefing confronts the channel's own record — repeating the dead pattern is not an option", () => {
    const brief = buildPrompt("task", { prompt: "x-briefing" }, []) ?? "";
    expect(brief).toContain("[memory]");
    expect(brief).toContain("DIFERENTE-DE");
    expect(brief.toLowerCase()).toContain("diferente do que ja falhou");
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
