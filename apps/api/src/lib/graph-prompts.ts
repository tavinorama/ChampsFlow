/**
 * graph-prompts.ts — the prompt registry for graph task nodes (#164 body).
 *
 * A node's config carries { prompt: "slug" }; the runner resolves the slug
 * here and appends the upstream artifacts as context. Prompts are DATA next
 * to the graph definitions: changing what a node asks is a reviewed diff,
 * not a redeploy of the runner.
 *
 * Every prompt states the output contract in its last line — the Hermes
 * engines return raw text and the next node consumes it verbatim, so a
 * prompt that lets the engine ramble poisons the whole downstream.
 */

export interface PromptContext {
  /** Node config minus the prompt slug (angle, lens, ...). */
  config: Record<string, unknown>;
  /** Upstream artifacts, in dependency order: [nodeId, text]. */
  upstream: Array<[string, string]>;
}

function upstreamBlock(upstream: Array<[string, string]>): string {
  if (upstream.length === 0) return "";
  return (
    "\n\n--- CONTEXTO DOS PASSOS ANTERIORES ---\n" +
    upstream.map(([id, text]) => `[${id}]\n${text}`).join("\n\n")
  );
}

const PROMPTS: Record<string, (ctx: PromptContext) => string> = {
  "video-memory": () =>
    [
      "Voce e o Hermes, agente de operacoes da Ozvor, rodando no VPS da propria empresa. Tarefa de MEMORIA do video diario (v2 do grafo, regra do founder 12/08: os videos vinham repetindo imagens e ganchos porque nada olhava o que ja foi feito).",
      "Execute UM unico comando bash: tail -n 150 /root/vidjob.log",
      "A partir da saida, liste os videos dos ultimos 7 dias (linhas VIDEO_OK e as linhas SCRIPTGEN/FORMAT/pexels ao redor).",
      "Formato de saida, e NADA alem dele:",
      "JA USADO (ultimos 7 dias):",
      "- formato: <slides/broll/explainer/hottake/stats> | tema/hook: <resumo 1 linha> | b-roll: <queries pexels usadas>",
      "EVITAR REPETIR:",
      "- <lista curta dos temas, ganchos e queries de b-roll que apareceram 2+ vezes>",
    ].join("\n"),

  "collect-signals": () =>
    [
      "Voce e o agente de sinais da Ozvor (plataforma de visibilidade em IA / GEO).",
      "Liste 5 sinais atuais e concretos do universo GEO/AI search que valem conteudo hoje:",
      "mudancas em motores (ChatGPT, Perplexity, Gemini, AI Overviews), estudos novos, dores de SMB/agencia.",
      "Para cada sinal: 1 linha de fato + 1 linha de por que importa para quem quer ser citado por IA.",
      "Sem inventar dado: se nao tiver certeza de um numero, nao use numero.",
      "Formato de saida: lista numerada 1-5, nada antes nem depois.",
    ].join("\n"),

  "write-briefing": (ctx) =>
    [
      "Voce e o editor-chefe da Ozvor. Dos sinais abaixo, escolha O MELHOR para um video social curto de hoje.",
      "Produza um briefing com: TESE (1 frase forte) · PUBLICO (quem sente essa dor) · PROVA (o fato que sustenta) · CTA (1a pessoa, ex: 'Quero meu teste').",
      "REGRA DE FRESCOR: o bloco [memory] abaixo lista o que JA publicamos. O briefing NAO pode repetir tema, gancho nem estetica de b-roll listados la — escolha o sinal que abre caminho NOVO.",
      "Regras de copy da casa: nivel de leitura 15-17 anos, frases <=12 palavras, sonho honesto (historia + gente real), zero jargao vazio.",
      "Formato de saida: 4 linhas rotuladas TESE/PUBLICO/PROVA/CTA, nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "draft-angle": (ctx) =>
    [
      `Voce e um roteirista. Escreva UM roteiro de video social de 30-45s no angulo "${String(ctx.config["angle"] ?? "story")}" a partir do briefing abaixo.`,
      "Estrutura: HOOK (3s, para o dedo) -> desenvolvimento em 3 beats -> CTA em 1a pessoa.",
      "Regras: nivel 15-17 anos, frases <=12 palavras, sem travessao, honesto (nada de promessa que o produto nao cumpre).",
      "Formato de saida: o roteiro puro, com marcacoes [HOOK], [BEAT 1-3], [CTA].",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  critique: (ctx) =>
    [
      `Voce e um critico com a lente "${String(ctx.config["lens"] ?? "hook")}". Avalie os 3 roteiros abaixo SOMENTE por essa lente.`,
      "lens hook = o primeiro segundo segura o dedo? · lens brand = soa Ozvor (honesto, direto, sem hype)? · lens compliance = alguma promessa que nao cumprimos ou claim juridico arriscado? · lens freshness = compare com o bloco [memory]: isso repete tema, gancho ou b-roll do que JA publicamos? novidade real ou requentado?",
      "Para cada roteiro: nota 0-10 pela sua lente + 1 frase do maior problema + 1 sugestao concreta.",
      "Termine com: VENCEDOR: <id do melhor roteiro pela sua lente>.",
      "Formato de saida: 3 blocos (um por roteiro) + a linha VENCEDOR.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  synthesize: (ctx) =>
    [
      "Voce e o diretor de conteudo. Abaixo estao 3 criticas (lentes hook/brand/compliance) sobre 3 roteiros.",
      "Escolha o roteiro vencedor no agregado e reescreva-o UMA vez incorporando as melhores sugestoes das 3 lentes.",
      "Se a lente compliance apontou risco, o risco SAI do texto — sem excecao.",
      "Formato de saida: o roteiro final pronto para publicar, com [HOOK]/[BEAT 1-3]/[CTA], e nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),
};

/**
 * Resolve a node's prompt. Task nodes name their slug in config.prompt;
 * debate nodes default to 'critique' and synthesis nodes to 'synthesize',
 * so graph authors only override when they mean to.
 */
export function buildPrompt(
  kind: string,
  config: Record<string, unknown>,
  upstream: Array<[string, string]>
): string | null {
  const slug =
    typeof config["prompt"] === "string"
      ? (config["prompt"] as string)
      : kind === "debate"
        ? "critique"
        : kind === "synthesis"
          ? "synthesize"
          : null;
  if (!slug) return null;
  const fn = PROMPTS[slug];
  if (!fn) return null;
  return fn({ config, upstream });
}

/** Exposed for tests and for the graphs listing route. */
export const PROMPT_SLUGS = Object.keys(PROMPTS);
