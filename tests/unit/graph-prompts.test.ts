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
  SPHERE_LINKEDIN_GRAPH,
  SPHERE_BLOG_GRAPH,
  SPHERE_REDDIT_GRAPH,
  SPHERE_INSTAGRAM_GRAPH,
  SPHERE_TIKTOK_GRAPH,
  SPHERE_YOUTUBE_GRAPH,
  SPHERE_PPC_GRAPH,
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
    for (const def of [DAILY_WATCHDOG_GRAPH, DAILY_DREAM_GRAPH, WEEKLY_PRODUCT_GRAPH, WEEKLY_DISCOVERY_GRAPH, CONTENT_EXPERIMENT_GRAPH, SPHERE_X_GRAPH, SPHERE_LINKEDIN_GRAPH, SPHERE_BLOG_GRAPH, SPHERE_REDDIT_GRAPH, SPHERE_INSTAGRAM_GRAPH, SPHERE_TIKTOK_GRAPH, SPHERE_YOUTUBE_GRAPH, SPHERE_PPC_GRAPH]) {
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
      // #156 cells two and three (14/08): LinkedIn publishes; the blog's
      // brief+outline feeds a public article, so it is English too.
      ["task", "linkedin-briefing"],
      ["task", "linkedin-draft"],
      ["synthesis", "linkedin-finalize"],
      ["task", "blog-briefing"],
      ["task", "blog-outline"],
      ["synthesis", "blog-finalize"],
      // #485 (18/08): the Reddit brief's content is drafted for a human to post
      // publicly, so briefing/plan/finalize are English-first too.
      ["task", "reddit-briefing"],
      ["task", "reddit-plan"],
      ["synthesis", "reddit-finalize"],
      // 17/08: the short-video spheres publish; PPC drafts are public ad copy.
      ["task", "instagram-briefing"],
      ["task", "instagram-draft"],
      ["synthesis", "instagram-finalize"],
      ["task", "tiktok-briefing"],
      ["task", "tiktok-draft"],
      ["synthesis", "tiktok-finalize"],
      ["task", "youtube-briefing"],
      ["task", "youtube-draft"],
      ["synthesis", "youtube-finalize"],
      ["task", "ppc-draft"],
      ["synthesis", "ppc-finalize"],
    ] as const;
    for (const [kind, slug] of publishable) {
      const p = buildPrompt(kind, { prompt: slug }, []) ?? "";
      expect(p, `${slug} must demand English output`).toContain("INGLES");
    }
  });

  it("v4 video ALIVE: draft-angle encodes the phone-shot format and the [STYLE] line the renderer reads", () => {
    const p = buildPrompt("task", { prompt: "draft-angle", angle: "story" }, []) ?? "";
    expect(p).toContain("9:16");
    expect(p).toContain("25-40");
    expect(p).toContain("[HOOK] <=1 segundo");
    expect(p).toContain("CAPTION:");
    expect(p).toContain("[PATTERN INTERRUPT]");
    expect(p).toContain("[STYLE] phone-shot, handheld feel, natural light, jump cuts, big captions, no stock-footage look, no corporate B-roll");
  });

  it("v4: the virality lens judges hook / watch-time / share and VETOES ad-or-slide-deck", () => {
    const p = buildPrompt("debate", { lens: "virality" }, []) ?? "";
    expect(p).toContain('lente "virality"');
    expect(p.toLowerCase()).toContain("watch-time");
    expect(p.toLowerCase()).toContain("beat 2");
    expect(p.toLowerCase()).toContain("share");
    expect(p).toContain("VETO: parece anuncio");
    expect(p).toContain("VETO: parece slide deck");
  });

  it("v4: the synthesis applies virality corrections and emits [RENDER BRIEF] + [CHANNEL VARIANTS]", () => {
    const p = buildPrompt("synthesis", {}, []) ?? "";
    expect(p).toContain("virality");
    expect(p).toContain("[RENDER BRIEF]");
    for (const field of ["format:", "style:", "captions:", "music:", "pace:"]) expect(p).toContain(field);
    expect(p).toContain("[CHANNEL VARIANTS]");
    for (const ch of ["IG Reels", "TikTok", "YT Shorts"]) expect(p).toContain(ch);
  });

  it("every short-video sphere family carries the alive format, the virality veto and the render brief", () => {
    for (const fam of ["instagram", "tiktok", "youtube"]) {
      const draft = buildPrompt("task", { prompt: `${fam}-draft`, style: "talking-head" }, []) ?? "";
      expect(draft, `${fam}-draft`).toContain("[STYLE] phone-shot");
      expect(draft).toContain("caption-story");
      const critic = buildPrompt("debate", { prompt: `${fam}-critic` }, []) ?? "";
      expect(critic, `${fam}-critic`).toContain("VIRALIDADE");
      expect(critic).toContain("VETO");
      expect(critic).toContain("[memory]");
      const fin = buildPrompt("synthesis", { prompt: `${fam}-finalize` }, []) ?? "";
      expect(fin, `${fam}-finalize`).toContain("[RENDER BRIEF]");
      const brief = buildPrompt("task", { prompt: `${fam}-briefing` }, []) ?? "";
      expect(brief).toContain("CALENDARIO EDITORIAL");
      expect(brief).toContain("[memory]");
    }
    // Platform-native grammar, one pin each.
    expect(buildPrompt("task", { prompt: "instagram-draft" }, [])).toContain("Hashtags: 3-5 de NICHO");
    expect(buildPrompt("task", { prompt: "tiktok-signal" }, [])).toContain("hook culture");
    expect(buildPrompt("synthesis", { prompt: "youtube-finalize" }, [])).toContain("[TITLE] <=60 chars");
  });

  it("PPC prompts: claim rules, compliance VETO, and 'zero spend / founder decides' in words", () => {
    const draft = buildPrompt("task", { prompt: "ppc-draft", network: "google-search" }, []) ?? "";
    expect(draft).toContain("REGRAS DE CLAIM");
    expect(draft).toContain("HEADLINES");
    expect(buildPrompt("task", { prompt: "ppc-draft", network: "meta" }, [])).toContain("PRIMARY TEXT");
    expect(buildPrompt("task", { prompt: "ppc-draft", network: "linkedin" }, [])).toContain("Sponsored Content");
    const critic = buildPrompt("debate", { prompt: "ppc-critic" }, []) ?? "";
    expect(critic).toContain("VETO");
    const fin = buildPrompt("synthesis", { prompt: "ppc-finalize" }, []) ?? "";
    expect(fin).toContain("0 gasto");
    expect(fin.toLowerCase()).toContain("decisao do founder");
  });

  it("Reddit signal CONSUMES [__signals__]: renders the injected queue, and degrades honestly when it says SEM DADO", () => {
    // The runner injects the Signal Engine's queue as [__signals__] into every
    // marketing-owned graph. #485's whole point: this cell USES that block.
    const realSignals =
      "SINAIS EXTERNOS (Signal Engine): 1) r/SEO — 'Is SEO dead now that ChatGPT answers everything?' https://reddit.com/r/SEO/comments/abc123";
    const withSignals = buildPrompt("task", { prompt: "reddit-signal" }, [["__signals__", realSignals]]) ?? "";
    // The injected block is actually rendered into the prompt the engine sees.
    expect(withSignals).toContain("__signals__");
    expect(withSignals).toContain("reddit.com/r/SEO/comments/abc123");
    // And the prompt tells the engine to prefer the real queue over invention.
    expect(withSignals).toContain("FILA REAL");

    // Fail-open honesty: when the block says SEM DADO (envs unset / down), the
    // prompt must carry the "do not invent threads" instruction and surface it.
    const semDado =
      "SINAIS EXTERNOS: SEM DADO (Signal Engine indisponivel). Nao invente conversas; use so o que estiver em [memory].";
    const withoutSignals = buildPrompt("task", { prompt: "reddit-signal" }, [["__signals__", semDado]]) ?? "";
    expect(withoutSignals).toContain("SEM DADO");
    expect(withoutSignals).toContain("SEM SINAL EXTERNO DO SIGNAL ENGINE");
    expect(withoutSignals.toLowerCase()).toContain("nao invente");
  });

  it("Reddit plan is a concrete move: subreddit, thread/url, comment-vs-post, karma note, honest GEO value", () => {
    const plan = buildPrompt("task", { prompt: "reddit-plan", style: "comment" }, []) ?? "";
    expect(plan.toLowerCase()).toContain("subreddit");
    expect(plan).toContain("COMMENT-VS-POST");
    expect(plan.toLowerCase()).toContain("karma");
    expect(plan.toLowerCase()).toContain("disclosure");
    expect(plan.toUpperCase()).toContain("GEO");
    // The post style resolves to the same family and names starting a thread.
    const post = buildPrompt("task", { prompt: "reddit-plan", style: "post" }, []) ?? "";
    expect(post).toContain("[MOVE:");
  });

  it("Reddit critic enforces the culture: no astroturf, disclose affiliation, must help, freshness vs memory", () => {
    const critic = buildPrompt("debate", { prompt: "reddit-critic" }, []) ?? "";
    expect(critic.toUpperCase()).toContain("CULTURA REDDIT");
    expect(critic.toLowerCase()).toContain("astroturfing");
    expect(critic).toContain("VETO: sem disclosure");
    expect(critic).toContain("[memory]");
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
