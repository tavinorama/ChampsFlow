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
 *
 * LANGUAGE RULE (founder, 13/08 — the first orchestrated LinkedIn post went
 * out in Portuguese): ALL PUBLISHED CONTENT IS ENGLISH-FIRST. The prompts
 * themselves stay in PT (the engines read either), but every prompt whose
 * output becomes a public post (briefing fields, drafts, final syntheses)
 * must explicitly demand US English. Internal analysis (critics, watchdog,
 * CDO) and founder-facing reports stay PT — the rule is about what the
 * PUBLIC sees.
 */

/** The output-language clause every publishable prompt must carry. */
const ENGLISH_FIRST =
  "IDIOMA OBRIGATORIO: escreva a saida em INGLES (US English). Todo conteudo publicado da Ozvor e English-first — regra do founder, sem excecao.";

/**
 * The short-video FORMAT every video draft/synthesis carries (founder, 17/08:
 * "o vídeo tem que parecer VIVO"). One source so daily-video, IG, TikTok and
 * YT Shorts all speak the same shape and the VPS renderer can rely on it.
 */
const VIDEO_ALIVE_FORMAT = [
  "FORMATO DO ROTEIRO (obrigatorio):",
  "- vertical 9:16, 25-40 segundos no total;",
  "- [HOOK] <=1 segundo: uma pergunta, uma afirmacao forte ou uma imagem — a primeira palavra ja tem que parar o dedo;",
  "- 4 a 6 [BEAT]s rapidos; cada beat traz 'CAPTION:' (o texto GRANDE na tela, <=6 palavras) e 'SAY:' (a fala, como quem conversa, nao como quem le);",
  "- 1 [PATTERN INTERRUPT] no meio (mudanca de enquadramento, som, silencio, zoom, objeto na mao) para segurar quem ia sair;",
  "- [CTA] falado de forma natural, em 1a pessoa, sem tom de anuncio;",
  "- feche com a linha exata: [STYLE] phone-shot, handheld feel, natural light, jump cuts, big captions, no stock-footage look, no corporate B-roll",
].join("\n");

/**
 * CONTENT_LESSONS (5.F.3): a memória institucional de conteúdo, destilada das
 * lições REAIS desta semana e das regras da casa. O runner injeta este bloco
 * como artefato [__lessons__] APENAS nos nós de crítica (debate) dos grafos de
 * marketing — mesmo padrão do [__day__]: constante, sem I/O. Os críticos a
 * usam como RÉGUA DE VETO, não como sugestão: jogada que viola uma lição é
 * vetada. Uma lição nova entra AQUI (uma fonte) e todos os críticos a herdam.
 */
export const CONTENT_LESSONS = [
  "LICOES DA CASA (memoria institucional de conteudo — regua de VETO, nao sugestao):",
  "- Nunca repetir tema, gancho ou b-roll recente: se [memory] ja mostra, muda ou veta.",
  "- X: cada tweet tem <=280 caracteres e o pipe publica UM post por vez — thread vira tweet unico; o tweet 1 tem que se sustentar sozinho.",
  "- Canal que exige midia (Instagram/TikTok/YouTube) NAO recebe texto puro: roteiro vai como report ao founder, nunca como publish.",
  "- LinkedIn: no maximo 2 posts/dia (valvula de cadencia) — excedente ADIA para o dia seguinte, nao empilha no feed.",
  "- Copy nivel 15-17 anos: frases <=12 palavras, CTA em 1a pessoa, sem travessao.",
  "- Sonho honesto: historia, personagem, gente real — e NUNCA inventar dado; numero so com fonte.",
  "- Conteudo publico e English-first, sem excecao (relatorio interno ao founder segue em PT).",
].join("\n");

/**
 * A linha que todo crítico de esfera carrega: cita [__lessons__] como régua de
 * veto. Uma fonte — se o contrato do bloco mudar, todos os críticos mudam.
 */
const LESSONS_VETO_RULE =
  "LICOES INSTITUCIONAIS (com VETO): o bloco [__lessons__] abaixo e a memoria de conteudo da casa. Jogada que viola uma licao de la e VETADA, nao anotada — escreva 'VETO: licao da casa — <qual>'.";

/** The virality lens, shared by every short-video critic (IG/TikTok/YT). */
const VIRALITY_LENS =
  "LENTE VIRALIDADE (com VETO): (a) forca do gancho: eu pararia de rolar no primeiro segundo? (b) watch-time: o BEAT 2 segura quem ficou pelo gancho? (c) gatilho de share/comentario: alguem marca um amigo ou discorda? (d) parece video de celular de gente real ou parece ANUNCIO / slide deck? Se parece anuncio ou slide deck: 'VETO: parece anuncio' / 'VETO: parece slide deck'.";

/** The [RENDER BRIEF] contract the VPS renderer reads. */
const RENDER_BRIEF_FORMAT =
  "[RENDER BRIEF] com as linhas: format: 9:16 vertical, 25-40s · style: <a linha [STYLE]> · captions: <a caption de cada beat, na ordem, separadas por ' | '> · music: <mood em 3-5 palavras> · pace: <ex: 'cut every 2-3s, jump cuts, no fades'> · voice: <ex: 'founder, natural, phone mic ok'>";

/**
 * Products the founder explicitly flagged for weekly-discovery to develop.
 * Discovery must analyze each of these EVERY week (not just when it stumbles on
 * them), maturing them toward an MVP-ready spec, while staying free to surface
 * new ideas too. Add the next founder-flagged product here — one source.
 */
const STANDING_INITIATIVES: string[] = [
  "AI Audit Stack — uma auditoria que, a partir das DORES do cliente, indica o STACK de ferramentas de IA certo para ele. Dois formatos: (a) low-ticket self-serve: questionario -> recomenda 1 tool/shortlist; (b) high-ticket $1.5k dentro do OrganicPosts, junto com o GEO audit (bundle GEO + AI stack). E a PORTA DE ENTRADA do mercado BRASILEIRO (PT-BR) — avaliar se a superficie de entrada BR e PT (provavel excecao a regra English-first, por ser porta de entrada nacional). REQUISITO DE PROFUNDIDADE (founder): o produto precisa de CAPILARIDADE — entender NICHOS/verticais a fundo (cada segmento tem dores e ferramentas diferentes) E cobrir o universo de IAs de forma COMPLETA e atualizada. Logo a analise tem que enderecar: como manter um catalogo de tools abrangente e fresco, como mapear dor->tool POR nicho, e como a recomendacao escala para muitos segmentos sem virar generica.",
];

function standingInitiativesBlock(): string {
  if (STANDING_INITIATIVES.length === 0) return "";
  return (
    "\n\n--- INICIATIVAS PERMANENTES (sinalizadas pelo founder — analisar TODA semana) ---\n" +
    STANDING_INITIATIVES.map((s, i) => `${i + 1}. ${s}`).join("\n")
  );
}

export interface PromptContext {
  /** Node config minus the prompt slug (angle, lens, ...). */
  config: Record<string, unknown>;
  /** Upstream artifacts, in dependency order: [nodeId, text]. */
  upstream: Array<[string, string]>;
}

// ---------------------------------------------------------------------------
// Prompt tuning (5.F.2) — a allowlist, o parser da proposta e a resolução de
// overrides. Os prompts eram só código: melhorar um exigia PR humano, então
// os vereditos/rejeições registrados toda semana não mudavam nada. O grafo
// prompt-tuner propõe UMA mudança por semana; o founder aprova no Telegram;
// o aprovado vira uma linha em ops.prompt_override; e buildPrompt resolve o
// slug primeiro no override (linha mais nova por chave vence; body vazio ou
// sem linha → o prompt estático abaixo).
// ---------------------------------------------------------------------------

/**
 * As ÚNICAS chaves de prompt que o tuner pode mudar — só criação (draft) e
 * crítica (debate) dos grafos de MARKETING. Fora daqui, por construção:
 * approval/publish/store não têm prompt e jamais teriam override; os prompts
 * dos brains (watchdog/dream/product/discovery/report/postmortem/memory) são
 * leitura do registro e não são conteúdo; e o compose do próprio prompt-tuner
 * NUNCA entra (sem auto-modificação). A allowlist vale nos DOIS lados: o nó
 * store recusa chave fora dela, e a resolução em buildPrompt ignora um
 * override de chave não-tunável mesmo que uma linha exista no banco.
 */
export const TUNABLE_PROMPT_KEYS: readonly string[] = [
  // Drafts (criação) das células de marketing.
  "draft-angle",
  "x-draft",
  "linkedin-draft",
  "blog-outline",
  "reddit-plan",
  "instagram-draft",
  "tiktok-draft",
  "youtube-draft",
  "experiment-draft",
  "ab-draft",
  "ppc-draft",
  // Críticos (debate) das células de marketing.
  "critique",
  "x-critic",
  "linkedin-critic",
  "blog-critic",
  "reddit-critic",
  "instagram-critic",
  "tiktok-critic",
  "youtube-critic",
  "experiment-critic",
  "ab-critic",
  "ppc-critic",
];

/** É uma chave que um override pode tocar? (allowlist em código, uma fonte.) */
export function isTunablePromptKey(key: string): boolean {
  return TUNABLE_PROMPT_KEYS.includes(key);
}

/** O que o parser extraiu da saída do compose do prompt-tuner. */
export type PromptProposal =
  | { kind: "none"; reason: string }
  | { kind: "proposal"; promptKey: string; body: string }
  | { kind: "invalid"; reason: string };

/**
 * Parse da proposta do tuner — o contrato de saída do prompt
 * 'prompt-tuner-compose'. Puro e estrito: mais de um PROMPT_KEY num run é
 * INVÁLIDO (o contrato é NO MÁXIMO UMA mudança por rodada — enforced aqui,
 * não só pedido no prompt); sem bloco [BODY]...[/BODY] é inválido; a saída
 * 'SEM MUDANCA...' é o "nada a propor" honesto. Body vazio é VÁLIDO: é a
 * proposta de reverter ao prompt estático (o contrato de rollback da
 * migração ops.prompt_override).
 */
export function parsePromptProposal(text: string): PromptProposal {
  const t = text.trim();
  if (t === "") return { kind: "invalid", reason: "proposta vazia" };
  if (/^SEM MUDANCA/i.test(t)) {
    return { kind: "none", reason: t.split("\n")[0]!.slice(0, 200) };
  }
  const keyMatches = [...t.matchAll(/^PROMPT_KEY:\s*(\S+)\s*$/gim)];
  if (keyMatches.length === 0) {
    return { kind: "invalid", reason: "sem linha PROMPT_KEY" };
  }
  if (keyMatches.length > 1) {
    return {
      kind: "invalid",
      reason: `${keyMatches.length} propostas num run — o contrato e NO MAXIMO UMA mudanca por rodada`,
    };
  }
  const bodyMatch = /\[BODY\]\n?([\s\S]*?)\n?\[\/BODY\]/.exec(t);
  if (!bodyMatch) {
    return { kind: "invalid", reason: "sem bloco [BODY]...[/BODY]" };
  }
  return { kind: "proposal", promptKey: keyMatches[0]![1]!, body: bodyMatch[1]!.trim() };
}

function upstreamBlock(upstream: Array<[string, string]>): string {
  if (upstream.length === 0) return "";
  return (
    "\n\n--- CONTEXTO DOS PASSOS ANTERIORES ---\n" +
    upstream.map(([id, text]) => `[${id}]\n${text}`).join("\n\n")
  );
}

/**
 * One prompt family per short-video sphere (IG Reels / TikTok / YT Shorts):
 * `<p>-signal`, `<p>-briefing`, `<p>-draft`, `<p>-critic`, `<p>-finalize`.
 * The loop is the same everywhere (the cell pattern); what changes is the
 * platform's native grammar — passed in as data so no family drifts from the
 * others on the shared rules (memory, [__day__], virality veto, English).
 */
function shortVideoFamily(
  p: string,
  spec: { name: string; signalHint: string; grammar: string; finalizeExtras: string }
): Record<string, (ctx: PromptContext) => string> {
  return {
    [`${p}-signal`]: (ctx) =>
      [
        `Voce e o agente de sinais da esfera ${spec.name} da Ozvor (visibilidade em IA / GEO).`,
        `Liste 4 angulos QUENTES para um video curto de ${spec.name} hoje onde a Ozvor tem algo real a dizer: marcas sumindo das respostas de IA, o fim do SEO como era, casos de citacao, dores de agencia/SMB, o custo de nao aparecer no ChatGPT.`,
        spec.signalHint,
        "ANGULO PERMANENTE (produto novo, founder 14/08): o AI Audit Stack — ha ferramentas de IA demais e ninguem sabe qual serve para o SEU negocio; a Ozvor le suas dores e indica o stack certo por $49 (ozvor.com/ai-audit). Inclua esse angulo como opcao TODO dia, e obrigatorio quando o [__day__] pedir tema ai-audit-stack.",
        "Para cada um: 1 linha do angulo + 1 linha do GANCHO de 1 segundo que ele rende (a frase exata).",
        "SINAIS EXTERNOS: se houver um bloco [__signals__] abaixo, ele traz conversas e oportunidades REAIS (com URL de evidencia) do Signal Engine. Prefira esses sinais aos imaginados; cite a URL. Se disser SEM DADO, siga so com o que e verificavel.",
        "Sem inventar dado: numero so com certeza.",
        "Formato de saida: lista numerada 1-4, nada antes nem depois.",
        upstreamBlock(ctx.upstream),
      ].join("\n"),

    [`${p}-briefing`]: (ctx) =>
      [
        `Voce e o editor da esfera ${spec.name} da Ozvor. O bloco [memory] abaixo e o alcance REAL dos nossos videos recentes neste canal — leia primeiro.`,
        "CALENDARIO EDITORIAL: o bloco [__day__] abaixo diz o TEMA DO DIA, o angulo e o CTA natural. O briefing TEM que honrar o tema do dia — a semana precisa ler como 7 coisas diferentes, nao 1 coisa 7 vezes.",
        "REGRA: o briefing de hoje tem que ser MENSURAVELMENTE diferente do que ja publicamos em [memory] — outro gancho, outra tese ou outro formato. Repetir o que ja rodou nao e opcao.",
        `Dos sinais em [signal], escolha O MELHOR angulo para UM video curto de ${spec.name} hoje e produza: TESE (1 frase) · GANCHO (a frase exata do 1o segundo) · PUBLICO (quem para de rolar) · PROVA (fato/numero real ou cena real) · CTA (1a pessoa, falado, natural) · DIFERENTE-DE (1 linha vs [memory]).`,
        "Regras da casa: nivel 15-17 anos, frases <=12 palavras, sonho honesto, zero jargao, sem travessao.",
        ENGLISH_FIRST,
        "Formato de saida: 6 linhas rotuladas TESE/GANCHO/PUBLICO/PROVA/CTA/DIFERENTE-DE (rotulos em PT, conteudo em ingles), nada mais.",
        upstreamBlock(ctx.upstream),
      ].join("\n"),

    [`${p}-draft`]: (ctx) =>
      [
        `Voce e um roteirista de ${spec.name} que fala como gente. A partir do briefing abaixo, escreva UM roteiro no estilo "${String(ctx.config["style"] ?? "talking-head")}":`,
        "talking-head = rosto na camera, celular na mao, fala direta como quem conta para um amigo, captions grandes reforcam a fala. · caption-story = a historia e contada nas LEGENDAS grandes na tela (a fala e minima ou so som), cada beat e um card de texto sobre cena real de celular.",
        VIDEO_ALIVE_FORMAT,
        spec.grammar,
        "Regras: nivel 15-17 anos, frases <=12 palavras, sem travessao, honesto (nada que o produto nao cumpre). Zero cara de anuncio, zero slide deck.",
        ENGLISH_FIRST,
        "Formato de saida: o roteiro puro, com [HOOK], [BEAT 1..n] (CAPTION:/SAY:), [PATTERN INTERRUPT], [CTA], [STYLE]. Nada alem disso.",
        upstreamBlock(ctx.upstream),
      ].join("\n"),

    [`${p}-critic`]: (ctx) =>
      [
        `Voce e o critico da esfera ${spec.name} da Ozvor. Abaixo: 2 roteiros (talking-head e caption-story), o briefing e o historico real do canal em [memory].`,
        VIRALITY_LENS,
        "LENTE COMPLIANCE (com VETO): promessa que nao cumprimos, claim sem base, dado inventado. LENTE FRESHNESS (com VETO): repete gancho/tema/formato de [memory]?",
        LESSONS_VETO_RULE,
        "Para cada roteiro: nota 0-10 por viralidade + 1 frase do maior problema + 1 correcao concreta + os vetos, se houver.",
        "Termine com: VENCEDOR: <talking-head|caption-story>.",
        "Formato de saida: 2 blocos + a linha VENCEDOR.",
        upstreamBlock(ctx.upstream),
      ].join("\n"),

    [`${p}-finalize`]: (ctx) =>
      [
        `Voce e o editor-chefe da esfera ${spec.name}. Abaixo: os 2 roteiros e a critica.`,
        "Pegue o VENCEDOR e reescreva UMA vez aplicando as correcoes. Vetos sao lei: risco sai, padrao repetido muda, 'parece anuncio/slide deck' vira conversa de celular.",
        VIDEO_ALIVE_FORMAT,
        ENGLISH_FIRST,
        "Formato de saida, nesta ordem e nada mais:",
        "1) o roteiro final com [HOOK]/[BEAT 1..n]/[PATTERN INTERRUPT]/[CTA]/[STYLE];",
        `2) ${RENDER_BRIEF_FORMAT};`,
        `3) os blocos do canal: ${spec.finalizeExtras}.`,
        upstreamBlock(ctx.upstream),
      ].join("\n"),
  };
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

  "collect-signals": (ctx) =>
    [
      "Voce e o agente de sinais da Ozvor (plataforma de visibilidade em IA / GEO).",
      "Liste 5 sinais atuais e concretos do universo GEO/AI search que valem conteudo hoje:",
      "mudancas em motores (ChatGPT, Perplexity, Gemini, AI Overviews), estudos novos, dores de SMB/agencia.",
      "Para cada sinal: 1 linha de fato + 1 linha de por que importa para quem quer ser citado por IA.",
      "ANGULO PERMANENTE (produto novo, founder 14/08): o AI Audit Stack — ha ferramentas de IA demais e ninguem sabe qual serve para o SEU negocio; a Ozvor le suas dores e indica o stack certo por $49 (ozvor.com/ai-audit). Inclua esse angulo como opcao TODO dia, e obrigatorio quando o [__day__] pedir tema ai-audit-stack.",
      "Sem inventar dado: se nao tiver certeza de um numero, nao use numero.",
      "Formato de saida: lista numerada 1-5, nada antes nem depois.",
      "SINAIS EXTERNOS: se houver um bloco [__signals__] abaixo, ele traz conversas e oportunidades REAIS (com URL de evidencia) do Signal Engine. Prefira esses sinais aos imaginados; cite a URL. Se disser SEM DADO, siga so com o que e verificavel.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "write-briefing": (ctx) =>
    [
      "Voce e o editor-chefe da Ozvor. Dos sinais abaixo, escolha O MELHOR para um video social curto de hoje.",
      "CALENDARIO EDITORIAL: o bloco [__day__] abaixo diz o TEMA DO DIA, o angulo e o CTA natural. O briefing TEM que honrar o tema do dia — a semana precisa ler como 7 coisas diferentes, nao 1 coisa 7 vezes.",
      "Produza um briefing com: TESE (1 frase forte) · PUBLICO (quem sente essa dor) · PROVA (o fato que sustenta) · CTA (1a pessoa, ex: 'Quero meu teste').",
      "REGRA DE FRESCOR: o bloco [memory] abaixo lista o que JA publicamos. O briefing NAO pode repetir tema, gancho nem estetica de b-roll listados la — escolha o sinal que abre caminho NOVO.",
      "Regras de copy da casa: nivel de leitura 15-17 anos, frases <=12 palavras, sonho honesto (historia + gente real), zero jargao vazio.",
      ENGLISH_FIRST,
      "Formato de saida: 4 linhas rotuladas TESE/PUBLICO/PROVA/CTA (os rotulos em PT, o CONTEUDO em ingles), nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // v4 (founder, 17/08 — "o vídeo tem que parecer VIVO"): the old 30-45s
  // three-beat script came out clean, stiff, corporate. What performs now is
  // vertical, phone-shot, hook in the first second, fast cuts, big captions,
  // a real voice, a bit raw. The script FORMAT encodes that so the renderer
  // (VPS, out of this repo) has direction it can honor.
  "draft-angle": (ctx) =>
    [
      `Voce e um roteirista de video curto que FALA como gente, nao como slide. Escreva UM roteiro no angulo "${String(ctx.config["angle"] ?? "story")}" a partir do briefing abaixo.`,
      VIDEO_ALIVE_FORMAT,
      "Regras: nivel 15-17 anos, frases <=12 palavras, sem travessao, honesto (nada de promessa que o produto nao cumpre). Fala de verdade: contracoes, pausa, uma imperfeicao proposital. Nada de 'in today's fast-paced world'.",
      ENGLISH_FIRST,
      "Formato de saida: o roteiro puro, com [HOOK], [BEAT 1..n] (cada um com a linha 'CAPTION:' e a linha 'SAY:'), [PATTERN INTERRUPT], [CTA] e a linha [STYLE] no final. Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  critique: (ctx) =>
    [
      `Voce e um critico com a lente "${String(ctx.config["lens"] ?? "hook")}". Avalie os 3 roteiros abaixo SOMENTE por essa lente.`,
      "lens hook = o primeiro SEGUNDO segura o dedo? · lens brand = soa Ozvor (honesto, direto, sem hype)? · lens compliance = alguma promessa que nao cumprimos ou claim juridico arriscado? · lens freshness = compare com o bloco [memory]: isso repete tema, gancho ou b-roll do que JA publicamos? novidade real ou requentado? · lens virality = (a) forca do gancho: eu pararia de rolar? (b) watch-time: o BEAT 2 segura quem ficou pelo gancho? (c) gatilho de share/comentario: alguem marca um amigo ou discorda? (d) parece video de celular de gente real ou parece ANUNCIO / slide deck? Se parece anuncio ou slide deck, VETO — diga 'VETO: parece anuncio' ou 'VETO: parece slide deck' no bloco do roteiro.",
      LESSONS_VETO_RULE,
      "Para cada roteiro: nota 0-10 pela sua lente + 1 frase do maior problema + 1 sugestao concreta.",
      "Termine com: VENCEDOR: <id do melhor roteiro pela sua lente>.",
      "Formato de saida: 3 blocos (um por roteiro) + a linha VENCEDOR.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  synthesize: (ctx) =>
    [
      "Voce e o diretor de conteudo. Abaixo estao 5 criticas (lentes hook/brand/compliance/freshness/virality) sobre 3 roteiros.",
      "Escolha o roteiro vencedor no agregado e reescreva-o UMA vez incorporando as melhores sugestoes das 5 lentes.",
      "Tres lentes tem poder de VETO, nao so de nota: se compliance apontou risco, o risco SAI do texto; se freshness disse que repete tema/gancho/b-roll do que ja publicamos, o angulo MUDA — publicar requentado nao e opcao; se virality disse 'parece anuncio' ou 'parece slide deck', o roteiro vira conversa de celular (gancho mais cru, beats mais rapidos, caption maior) — as correcoes de virality sao aplicadas, nao debatidas.",
      VIDEO_ALIVE_FORMAT,
      ENGLISH_FIRST,
      "Formato de saida, em 3 blocos e nada mais:",
      "1) o roteiro final, com [HOOK]/[BEAT 1..n]/[PATTERN INTERRUPT]/[CTA]/[STYLE];",
      "2) um bloco [RENDER BRIEF] com as linhas: format: 9:16 vertical, 25-40s · style: <a linha [STYLE]> · captions: <a caption de cada beat, na ordem, separadas por ' | '> · music: <mood em 3-5 palavras, ex: 'lo-fi upbeat, no vocals'> · pace: <ex: 'cut every 2-3s, jump cuts, no fades'> · voice: <ex: 'founder, natural, phone mic ok'>;",
      "3) um bloco [CHANNEL VARIANTS] com 3 linhas, uma por canal: 'IG Reels: <caption de abertura curta> · hashtags: 3-5 nicho' · 'TikTok: <caption de abertura estilo hook-culture> · hashtags: 2-3 + 1 tendencia se real' · 'YT Shorts: <titulo <=60 chars> · hashtags: #Shorts + 2 nicho'. Mesmo roteiro, so muda a abertura e a politica de hashtag.",
      "(Este pacote NAO vai direto ao publico — o node seguinte adapta para o formato do canal.)",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // v3 (founder, 13/08): the run's first LinkedIn post was the RAW video
  // script — [HOOK]/[BEAT] markers, in Portuguese — because no node ever
  // adapted the script to the destination format. This node is that missing
  // step: the winning script becomes a native LinkedIn post, and THIS is what
  // the approval gates and the publish posts.
  "video-to-linkedin": (ctx) =>
    [
      "Voce e o social editor da Ozvor. Abaixo esta o roteiro de video vencedor do dia. Transforme-o num POST DE LINKEDIN nativo — nao um roteiro, um post.",
      "PROIBIDO no resultado: marcacoes [HOOK]/[BEAT]/[CTA], rotulos de secao, indicacoes de cena ou qualquer vestigio de formato de roteiro.",
      "Estrutura do post: 1a linha que para o scroll (sem clickbait vazio) · 3-6 linhas curtas com a historia/dado · 1 CTA em 1a pessoa no final. 80-150 palavras. Zero hashtag ou no maximo 2 relevantes.",
      "Regras da casa: nivel 15-17 anos, frases <=12 palavras, sem travessao, sonho honesto, nada que o produto nao cumpre.",
      ENGLISH_FIRST,
      "Formato de saida: apenas o texto final do post, pronto para colar no LinkedIn, nada antes nem depois.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- Watchdog LEAN (agent-org core) ---------------------------------------
  // Each lens reads the SAME ops.* snapshot [ops-snapshot] and names ONE kind
  // of waste. They only see numbers the runner already fetched — no invention.

  "watchdog-cost": (ctx) =>
    [
      "Voce e o Watchdog LEAN da Ozvor, lente CUSTO-POR-RESULTADO. Abaixo esta o registro operacional real da empresa (ops.*): runs por graph, sucesso/falha, custo em centavos, tempo.",
      "Sua unica pergunta: onde a empresa GASTA sem RETORNO proporcional? Graphs que custam muito e falham/entregam pouco; custo que sobe sem outcome que suba junto.",
      "Se o registro trouxer o bloco 'CUSTO POR TENANT', aponte tambem tenant cujo custo na janela e desproporcional ao plano que paga (custo se aproximando ou passando do preco mensal); sem esse bloco, nao afirme nada sobre tenants.",
      "Regra de honestidade: so aponte o que os numeros abaixo mostram. Se um custo nao tem dado de resultado ao lado, diga 'sem outcome medido' — nao invente ROI.",
      "Formato de saida: 1-3 achados, cada um em 2 linhas — ACHADO (o desperdicio, com o numero) + CORTE (a acao concreta, barata). Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "watchdog-cycle": (ctx) =>
    [
      "Voce e o Watchdog LEAN da Ozvor, lente TEMPO-DE-CICLO. Abaixo esta o registro operacional real (ops.*): quando cada run comecou e terminou, quais nodes falham, onde trava.",
      "Sua unica pergunta: onde o trabalho DEMORA ou EMPACA sem necessidade? Runs que ficam presas, nodes que falham e re-tentam, esperas longas, gargalos repetidos.",
      "Regra de honestidade: so o que os numeros mostram. Sem dado de duracao = nao afirme lentidao.",
      "Formato de saida: 1-3 achados, cada um em 2 linhas — ACHADO (o gargalo, com o numero) + ACELERADOR (a acao concreta). Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "watchdog-redundancy": (ctx) =>
    [
      "Voce e o Watchdog LEAN da Ozvor, lente REDUNDANCIA. Abaixo esta o registro operacional real (ops.*), incluindo inputs repetidos (mesmo hash rodado varias vezes) e graphs que fazem trabalho parecido.",
      "Sua unica pergunta: o que e feito DUAS VEZES e podia ser feito uma? Trabalho duplicado, passos que repetem o mesmo input, dois graphs cobrindo a mesma coisa, jobs que sobrepoem.",
      "Regra de honestidade: so o que os numeros mostram. Repeticao legitima (cron diario) nao e desperdicio — foque no que da pra unificar sem perder valor.",
      "Formato de saida: 1-3 achados, cada um em 2 linhas — ACHADO (a duplicacao, com o numero) + UNIFICACAO (a acao concreta). Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "watchdog-synthesis": (ctx) =>
    [
      "Voce e o Watchdog-chefe da Ozvor. Abaixo estao 3 lentes (custo, tempo-de-ciclo, redundancia) sobre o registro operacional da empresa.",
      "Consolide numa lista CURTA e PRIORIZADA de cortes/correcoes. Ordene por (impacto / esforco): o que da mais folga com menos trabalho vem primeiro.",
      "Voce PROPOE, nao executa: cada item e uma recomendacao para o founder decidir — nunca escreva como se ja tivesse mudado algo.",
      "Se as 3 lentes disseram 'sem dados suficientes', diga isso em 1 linha e pare — nao fabrique problema.",
      "Formato de saida: no maximo 5 itens numerados, cada um: '<corte/correcao em 1 frase> — porque: <numero/fato> — esforco: baixo/medio/alto'. Um cabecalho de 1 linha com o veredito geral. Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- weekly-report (5.E.5): o relatório de segunda ao founder --------------
  // Um único nó de composição lê os DOIS snapshots da semana (ops 7d em
  // [ops-week], outcomes 7d em [outcomes-week]) e monta o relatório que o
  // founder hoje pede à mão. Relatório interno = PT (como o watchdog). A regra
  // inegociável é a honestidade: SÓ o que está nos snapshots — seção sem dado
  // diz "sem dado", nunca um número inventado.

  "weekly-report-compose": (ctx) =>
    [
      "Voce e o redator do relatorio semanal da Ozvor ao founder. Abaixo: o registro operacional da semana em [ops-week] (runs, falhas, custo, ciclo) e os resultados reais em [outcomes-week] (lift por metrica/canal, vereditos, rejeicoes do founder).",
      "Monte o relatorio de segunda-feira EM PORTUGUES: denso, honesto, skimmable — o founder le em 2 minutos e sabe como a empresa passou a semana.",
      "REGRA INEGOCIAVEL: use SOMENTE os numeros que estao nos blocos abaixo. Secao sem dado no snapshot escreve 'sem dado esta semana' — NUNCA invente numero, estimativa ou tendencia.",
      "Secoes, nesta ordem (cada uma com titulo em 1 linha + 2-5 bullets):",
      "1) PUBLICACOES DA SEMANA — o que saiu, por canal (conte pelos graphs/metricas de [ops-week] e [outcomes-week]; canal sem publicacao aparece como zero, dito com todas as letras).",
      "2) FALHAS E O QUE GRITOU — runs que falharam, nodes que mais quebraram, o que o sistema alarmou; sem falha registrada = diga isso.",
      "3) CUSTO — o total da semana em USD somando os graphs de [ops-week]; se o snapshot trouxer uma secao de custo POR TENANT, inclua os maiores; se nao trouxer, escreva 'custo por tenant: sem secao no snapshot'.",
      "4) APROVACOES DO FOUNDER — quantas decisoes apareceram na semana (aprovacoes/rejeicoes visiveis nos snapshots, incluindo o bloco de rejeicoes de [outcomes-week]); tempo medio de decisao SO se houver dado; rejeicoes citadas com o motivo registrado.",
      "5) LIFT E VEREDITOS — as metricas de [outcomes-week] que fecharam veredito: valor, lift quando houver baseline, e 'sem baseline' quando nao houver.",
      "6) A SEMANA QUE VEM — os compromissos de calendario ja conhecidos da casa: brains segunda de manha, PPC terca, Reddit quarta, blog+discovery quinta, e as esferas diarias (X, LinkedIn, video, IG, TikTok, YT). Apenas o que e cron fixo — nada de previsao de resultado.",
      "Tom: direto, sem cerimonia, sem adjetivo vazio. Numero ruim aparece igual a numero bom — o relatorio existe para contar a verdade da semana, nao para vender a semana.",
      "Formato de saida: as 6 secoes em markdown leve (titulo + bullets), nada antes nem depois.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- incident-postmortem (5.D.2): o rascunho de postmortem ----------------
  // O compose lê UM bloco [evidence] (snapshot source 'incidents': assinaturas
  // de incidente re-agregadas por SQL — contagens, primeiro/último timestamp,
  // graphs afetados, resumos literais de erro capados) e REDIGE o rascunho no
  // formato exato de docs/learning/postmortems/*.md. O modelo nunca detecta
  // nem agrega: detecção é SQL no cron, agregação é código, o LLM só escreve
  // ("vigia também mente"). Causa raiz é sempre HIPÓTESE; o texto declara-se
  // RASCUNHO DE MÁQUINA; o commit nos docs é do humano.

  "postmortem-compose": (ctx) =>
    [
      "Voce e o redator de postmortems da Ozvor (5.D.2). O bloco [evidence] abaixo traz as assinaturas de incidente das ultimas 24h, agregadas por SQL: clusters de steps falhados por graph, reconciliacoes starved/orfas, timeouts de aprovacao — com contagens, primeiro/ultimo timestamp e resumos LITERAIS de erro.",
      "Sua tarefa: redigir UM rascunho de postmortem EM PORTUGUES, no formato exato dos postmortems da casa (docs/learning/postmortems/).",
      "REGRA INEGOCIAVEL (vigia tambem mente): use SOMENTE os numeros, timestamps, graphs e mensagens de erro do bloco [evidence]. NUNCA invente numero, causa, sistema ou linha do tempo; o que a evidencia nao mostra escreve-se 'sem dado no scan'.",
      "Se [evidence] disser SEM DADOS ou nao trouxer nenhuma assinatura, sua saida inteira e: 'SEM INCIDENTE CONFIRMADO NA RE-CHECAGEM — nada a redigir.' e nada mais.",
      "Estrutura de saida, nesta ordem e nada alem dela:",
      "1) A linha exata: '> RASCUNHO DE MAQUINA (incident-postmortem) — pendente validacao humana. Todo numero abaixo veio do scan SQL; nada foi verificado por uma pessoa.'",
      "2) '# Postmortem — <titulo curto e concreto do incidente, a partir da assinatura dominante>'",
      "3) '**Periodo:** <primeiro timestamp> → <ultimo timestamp> (UTC) · **SEV-? (proposta)** · **Deteccao:** scan SQL automatico (incident-postmortem, 24h)' — a severidade e uma PROPOSTA sua em 3-6 palavras de justificativa, marcada como proposta.",
      "4) '## O que aconteceu' — 3-6 linhas contando o que o registro mostra: quais graphs, quantos steps/runs, em que janela, com 1-2 mensagens de erro literais entre aspas.",
      "5) '## Hipotese de causa raiz (HIPOTESE — nao confirmada por humano)' — 1-3 hipoteses numeradas, cada uma ancorada num fato de [evidence]; se a evidencia nao sustenta hipotese, diga 'evidencia insuficiente para hipotese honesta'.",
      "6) '## Impacto' — o que deixou de acontecer/quebrou, SO pelo que os numeros mostram; cliente afetado so se a evidencia disser.",
      "7) '## O que nos protegeu / o que nao' — que mecanismo da casa gritou ou reconciliou (se aparece na evidencia: reconciliacao, timeout, alarme) vs. o que ficou em silencio.",
      "8) '## Licoes propostas (→ anti-patterns)' — 1-3 entradas candidatas no formato do anti-patterns.md: 'NUNCA <padrao>. Em vez disso: <pratica>' — propostas, o humano decide se entram.",
      "9) A linha exata: 'PROXIMO PASSO (humano): colar este rascunho em docs/learning/postmortems/ e, se as licoes valerem, em docs/learning/anti-patterns.md — a maquina nao escreve nos docs.'",
      "Tom: seco, tecnico, honesto — numero ruim aparece igual a numero bom. Sem adjetivo vazio, sem drama.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- memory-consolidation (5.F.1): lições duráveis por canal ---------------
  // O compose lê UM bloco [history] (snapshot source 'memory': fatos agregados
  // por SQL — publicações, métricas, rejeições, timeouts, vereditos) e ESCREVE
  // as lições. O modelo nunca agrega nem adivinha: agregação é código, o LLM
  // só redige ("vigia também mente"). Saída em PT: memória interna, os
  // críticos leem PT como o [__lessons__].

  "memory-consolidation-compose": (ctx) =>
    [
      "Voce e o consolidador de memoria da Ozvor (5.F.1). O bloco [history] abaixo traz os FATOS agregados dos ultimos 30 dias: publicacoes concluidas por canal, metricas colhidas, rejeicoes do founder (com o motivo literal), aprovacoes expiradas por silencio e vereditos fechados.",
      "Sua tarefa: destilar LICOES DURAVEIS por canal — o que o registro mostra que funciona, o que falha e o que o founder rejeita — no formato de regua de veto que os criticos ja usam ([__lessons__]).",
      "REGRA INEGOCIAVEL (vigia tambem mente): use SOMENTE os fatos do bloco [history]. NUNCA invente numero, canal ou motivo; licao sem evidencia listada la nao entra.",
      "Cada licao: 1 linha, comecando com o canal, com a evidencia entre parenteses. Ex: '- linkedin: evitar tom vendedor no gancho (3 rejeicoes por tom vendedor em ago).'",
      "Maximo de 12 licoes. Menos e melhor: so o que o registro sustenta. Licao generica sem numero e lixo — corte.",
      "Se [history] disser SEM DADOS ou nao sustentar licao nenhuma, sua saida inteira e: 'SEM LICOES NOVAS ESTE MES — registro insuficiente.' e nada mais.",
      "Escreva EM PORTUGUES (memoria interna ao time de criticos; nada disto e publicado).",
      "Formato de saida: a linha de titulo 'LICOES CONSOLIDADAS (ultimos 30d — regua de VETO, nao sugestao):' seguida de ate 12 linhas '- <canal>: <licao> (<evidencia>)'. Nada antes nem depois.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- Chief Dreaming Officer (agent-org core) ------------------------------
  // Each lens reads the SAME outcome snapshot [outcome-snapshot] (real lift per
  // metric/graph) and imagines the 10x FROM those numbers — grounded, not vibes.

  "dream-reach": (ctx) =>
    [
      "Voce e o Chief Dreaming Officer da Ozvor, lente ALCANCE. Abaixo estao os resultados reais (ops.agent_outcome): que metrica mexeu, quanto, em qual graph/canal.",
      "Sua unica pergunta: como isso chega a 10x MAIS PESSOAS? Parta do que JA funcionou (a metrica com lift real) e imagine como multiplicar o alcance dela — nunca proponha 10x num canal que os numeros mostram morto.",
      "Ambicao com pes no chao: cada ideia nasce de um numero abaixo. Se nao ha lift medido em lugar nenhum, diga 'sem sinal para amplificar ainda' e sugira o menor teste que GERARIA sinal.",
      "Formato de saida: 1-3 hipoteses, cada uma em 2 linhas — HIPOTESE (o movimento de 10x) + ANCORA (o numero real que a sustenta). Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "dream-conversion": (ctx) =>
    [
      "Voce e o Chief Dreaming Officer da Ozvor, lente CONVERSAO. Abaixo estao os resultados reais (ops.agent_outcome): o que gerou movimento e onde ele parou.",
      "Sua unica pergunta: como o mesmo alcance vira 100x MAIS RESULTADO (lead, teste, assinatura)? Foque no vazamento entre 'viu' e 'agiu' — o que, mudado, converte melhor o trafego que JA existe.",
      "Ambicao ancorada: cada ideia parte de um numero abaixo. Sem dado de conversao = proponha a menor instrumentacao que o revelaria.",
      "Formato de saida: 1-3 hipoteses, cada uma em 2 linhas — HIPOTESE (o salto de conversao) + ANCORA (o numero real que a sustenta). Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "dream-moat": (ctx) =>
    [
      "Voce e o Chief Dreaming Officer da Ozvor, lente FOSSO (vantagem durável). Abaixo estao os resultados reais (ops.agent_outcome).",
      "Sua unica pergunta: o que, feito agora, fica CADA VEZ MELHOR sozinho e um concorrente nao copia num fim de semana? Efeito de dados, biblioteca que acumula, distribuicao propria, loop que se auto-reforca — a partir do que os numeros ja mostram tracionando.",
      "Ambicao ancorada: parta de um numero abaixo. Sem sinal = aponte qual ativo, se construido, comecaria a acumular vantagem.",
      "Formato de saida: 1-3 hipoteses, cada uma em 2 linhas — HIPOTESE (o fosso) + ANCORA (o numero/ativo real que a sustenta). Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "dream-synthesis": (ctx) =>
    [
      "Voce e o Chief Dreaming Officer da Ozvor. Abaixo estao 3 lentes (alcance, conversao, fosso) sobre os resultados reais da empresa.",
      "Consolide as apostas 10x numa lista PRIORIZADA. Ordene por (upside / custo): a aposta mais barata com maior potencial vem PRIMEIRO — o founder tem pouco tempo e caixa curto.",
      "Cada aposta precisa de uma ANCORA num numero real; descarte hipotese sem ancora (isso e sonho vazio, nao dreaming grounded).",
      "Voce PROPOE apostas para o founder decidir — nunca escreva como se tivesse iniciado um experimento. (Disparar experimentos vem depois, com aprovacao.)",
      "Se nao ha sinal real ainda, diga em 1 linha qual e o UNICO menor teste que geraria o primeiro sinal, e pare.",
      "A APOSTA #1 (a primeira da lista) pode virar um experimento real se o founder aprovar — entao deixe-a AUTOSSUFICIENTE: quem so ler a aposta #1 tem que entender a hipotese, o publico e o formato do teste.",
      "Formato de saida: no maximo 5 apostas numeradas, cada uma: '<aposta em 1 frase> — ancora: <numero real> — custo: baixo/medio/alto — primeiro passo: <o menor teste>'. Um cabecalho de 1 linha. Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- content-experiment cell (CDO's landing pad) --------------------------
  // The spawning run seeds this cell's __seed__ artifact with the ranked bets;
  // the runner surfaces it as [__seed__] in the upstream of every node here.

  "experiment-brief": (ctx) =>
    [
      "Voce e o editor de experimentos da Ozvor. O bloco [__seed__] abaixo traz as apostas de crescimento aprovadas pelo founder (a #1 e a que vamos testar).",
      "Pegue a APOSTA #1 e transforme-a no briefing de UM post social curto que TESTA essa hipotese na pratica — o menor teste real que gera sinal.",
      "Produza: TESE (1 frase) · PUBLICO (quem sente a dor) · PROVA (o fato/numero que sustenta) · CTA (1a pessoa) · METRICA (o que olhar em 48h para saber se a aposta tem pernas).",
      "Regras da casa: nivel 15-17 anos, frases <=12 palavras, sonho honesto, zero promessa que o produto nao cumpre.",
      "Se o [__seed__] nao trouxer aposta com ancora real, diga 'sem aposta testavel' em 1 linha e pare — nao invente experimento.",
      ENGLISH_FIRST,
      "Formato de saida: 5 linhas rotuladas TESE/PUBLICO/PROVA/CTA/METRICA, nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "experiment-draft": (ctx) =>
    [
      "Voce e roteirista da Ozvor. Do briefing abaixo, escreva UM post social curto (LinkedIn, 60-120 palavras) que testa a hipotese.",
      "Estrutura: gancho na 1a linha (para o dedo) -> 2-3 frases de desenvolvimento -> CTA em 1a pessoa.",
      "Regras: nivel 15-17 anos, frases <=12 palavras, sem travessao, honesto. Uma unica ideia — e um teste, nao um manifesto.",
      ENGLISH_FIRST,
      "Formato de saida: o texto do post puro, pronto para publicar, nada antes nem depois.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "experiment-critic": (ctx) =>
    [
      "Voce e o critico de compliance da Ozvor. Avalie o post abaixo SOMENTE pela lente de risco: alguma promessa que o produto nao cumpre? claim juridico/estatistico sem base? algo que exponha a marca?",
      LESSONS_VETO_RULE,
      "Nao reescreva — aponte. Para cada problema: 1 linha do risco + 1 linha da correcao minima.",
      "Se nao houver risco, diga 'sem risco' em 1 linha.",
      "Formato de saida: no maximo 3 linhas de risco+correcao, ou 'sem risco'. Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- ab-experiment (5.F.4): o A/B semanal, um eixo por vez ---------------
  // O brief DECLARA o eixo na linha 'EIXO:' — o veredito (codigo) extrai por
  // regex; os drafts variam SO nesse eixo; o critico veta experimento sujo
  // (mais de um eixo mudando = resultado ilegivel).

  "ab-brief": (ctx) =>
    [
      "Voce e o desenhista de experimentos A/B da Ozvor. O bloco [memory] abaixo e o alcance REAL do canal (LinkedIn) nos ultimos 30 dias — leia primeiro.",
      "Sua tarefa: desenhar UM experimento A/B honesto para HOJE — UMA ideia de conteudo, DUAS variantes que diferem em EXATAMENTE UM eixo.",
      "Escolha o eixo pelo que [memory] sugere que mais importa testar agora: angle (a tese/abordagem), hook (a 1a linha) ou format (a estrutura do post).",
      "REGRA DO EXPERIMENTO LIMPO: tudo que NAO e o eixo fica IGUAL nas duas variantes — mesma ideia, mesmo CTA, mesmo tamanho aproximado, mesmo canal. Duas coisas mudando = resultado ilegivel.",
      "Formato de saida, nesta ordem e nada mais (rotulos em PT, conteudo do experimento em ingles onde couber):",
      "EIXO: <angle|hook|format>",
      "IDEIA: <a ideia unica de conteudo, 1 frase>",
      "VARIANTE A: <o que a variante A faz no eixo escolhido, 1-2 frases>",
      "VARIANTE B: <o que a variante B faz no eixo escolhido, 1-2 frases>",
      "CONSTANTES: <o que fica igual nas duas, 1 linha>",
      "METRICA: linkedinpage_impressions (janela de 48h por variante)",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "ab-draft": (ctx) =>
    [
      `Voce e roteirista da Ozvor. Do desenho de experimento abaixo, escreva a VARIANTE ${String(ctx.config["variant"] ?? "A")} como um post curto de LinkedIn (40-90 palavras).`,
      "Siga o brief A LETRA: implemente exatamente o que a linha da SUA variante pede no eixo declarado, e mantenha as CONSTANTES identicas a outra variante.",
      "Estrutura: gancho na 1a linha (para o dedo) -> 2-3 frases de desenvolvimento -> CTA em 1a pessoa.",
      "Regras: nivel 15-17 anos, frases <=12 palavras, sem travessao, honesto (nada que o produto nao cumpre).",
      ENGLISH_FIRST,
      "Formato de saida: o texto do post puro, pronto para publicar, nada antes nem depois (sem rotulo de variante, sem comentario).",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "ab-critic": (ctx) =>
    [
      "Voce e o critico de experimentos da Ozvor. Abaixo: o brief do A/B (com a linha EIXO:), as duas variantes e o historico real do canal em [memory].",
      "LENTE EXPERIMENTO LIMPO (com VETO): as duas variantes diferem em EXATAMENTE o eixo declarado? Se mudou mais de uma coisa (eixo + CTA, eixo + tamanho muito diferente), escreva 'VETO: experimento sujo — <o que mais mudou>'.",
      "LENTE COMPLIANCE (com VETO): promessa que nao cumprimos, claim sem base, dado inventado — em QUALQUER variante.",
      "LENTE FRESHNESS: alguma variante repete gancho/tema recente de [memory]?",
      LESSONS_VETO_RULE,
      "Para cada variante: 1 frase de avaliacao + correcao minima se houver. NAO declare vencedor — quem decide o vencedor e a metrica colhida, nunca voce.",
      "Formato de saida: bloco A, bloco B, e a linha final 'EXPERIMENTO: <limpo|VETO: motivo>'. Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- CPO (the product finally has an owner — founder, 13/08) --------------
  // Each lens reads the SAME product snapshot [product-snapshot]: PII-free
  // aggregates of what customers actually receive. Internal analysis, PT.

  "product-quality": (ctx) =>
    [
      "Voce e o CPO da Ozvor, lente QUALIDADE. Abaixo estao os agregados reais do produto: auditorias rodadas, taxa de falha, scores medios, drift dos motores, tempo de ciclo.",
      "Sua unica pergunta: o que o cliente recebe e CONFIAVEL? Falhas de auditoria, motor em drift/degradado, ciclo lento, score que oscila sem explicacao.",
      "Regra de honestidade: so o que os numeros mostram. Sem dado = 'sem dado', nao adivinhe.",
      "Formato de saida: 1-3 achados, cada um em 2 linhas — ACHADO (o problema de qualidade, com o numero) + CORRECAO (a acao concreta). Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "product-value": (ctx) =>
    [
      "Voce e o CPO da Ozvor, lente VALOR. Abaixo estao os agregados reais: funil (free tests → claims → tenants → assinaturas), marcas cadastradas, monitoring ligado, creditos consumidos.",
      "Sua unica pergunta: o cliente esta EXTRAINDO valor? Onde o funil vaza, feature paga que ninguem liga (ex: monitoring), credito parado (assinou e nao usa = churn na porta).",
      "Regra de honestidade: so o que os numeros mostram.",
      "Formato de saida: 1-3 achados, cada um em 2 linhas — ACHADO (o vazamento de valor, com o numero) + ALAVANCA (a acao concreta). Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "product-honesty": (ctx) =>
    [
      "Voce e o CPO da Ozvor, lente HONESTIDADE (promessa x entrega — a lente continua da auditoria geral).",
      "O que a Ozvor VENDE: auditoria de visibilidade em 5 motores de IA, 3 scores (Visibility/Citation Readiness/Execution), monitoramento semanal nos planos pagos, plano de conteudo GEO.",
      "Contra os agregados abaixo, pergunte: alguma promessa esta sendo entregue PIOR do que vendida? Motor caido enquanto o site diz 5 motores; monitoring vendido e desligado; auditoria falhando em silencio para cliente pagante.",
      "Regra de honestidade: aponte so o que os numeros sustentam; marque suspeita como SUSPEITA (a verificar), nunca como fato.",
      "Formato de saida: 1-3 achados, cada um em 2 linhas — DIVERGENCIA (promessa x numero real) + FECHAMENTO (corrigir a entrega OU corrigir a promessa). Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "product-synthesis": (ctx) =>
    [
      "Voce e o CPO-chefe da Ozvor. Abaixo estao 3 lentes (qualidade, valor, honestidade) sobre os agregados reais do produto.",
      "Consolide numa lista CURTA e PRIORIZADA de prioridades de produto. Ordene por dano ao cliente: o que quebra confianca de quem PAGA vem primeiro; honestidade (promessa x entrega) tem VETO sobre conveniencia.",
      "Voce PROPOE, nao executa: cada item e uma recomendacao para o founder decidir — nunca escreva como se ja tivesse mudado algo.",
      "Se as 3 lentes disseram 'sem dados suficientes', diga isso em 1 linha e pare.",
      "Formato de saida: no maximo 5 itens numerados, cada um: '<prioridade em 1 frase> — porque: <numero/fato> — dano se ignorar: <1 linha>'. Um cabecalho de 1 linha com o estado geral do produto. Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- weekly-discovery (CDO+CPO, founder rule 13/08) -----------------------
  // Active weekly search for product improvements AND new products; the
  // founder only sees an idea AFTER it is MVP-ready. Internal analysis, PT.
  //
  // STANDING INITIATIVES: products the founder explicitly flagged for the
  // agents to develop. Discovery must ALWAYS carry these among its candidates
  // (analyze them every week) while staying free to surface new ones. When the
  // founder flags another product, it joins this list — one place, no drift.

  "discovery-research": () =>
    [
      "Voce e o pesquisador de descoberta da Ozvor (CDO+CPO), rodando na VPS da empresa. Missao semanal: olhar PARA FORA de forma ativa.",
      "Se voce tiver ferramenta de busca na web, USE-A para checar novidades reais da semana no espaco GEO/AI-search: movimentos de concorrentes (Profound, Peec, Otterly, ferramentas open-source como Elmo), mudancas nos motores (ChatGPT/Perplexity/Gemini/AI Overviews), dores novas de SMB/agencia em foruns e comunidades.",
      "ALEM DISSO, pesquise sinal para CADA iniciativa permanente listada abaixo (mercado, concorrentes, dores, disposicao a pagar) — elas sao prioridade do founder.",
      "Se NAO tiver busca disponivel, diga 'sem busca ao vivo' na primeira linha e liste apenas o que voce sabe com confianca — sem inventar lancamento nem citar data que nao pode confirmar.",
      "Formato de saida: 3-6 observacoes numeradas, cada uma: FATO (1 linha, com fonte se houver) + OPORTUNIDADE para a Ozvor (1 linha). Marque com [INICIATIVA] as que tocam uma iniciativa permanente. Nada alem disso.",
      standingInitiativesBlock(),
    ].join("\n"),

  "discovery-ideate": (ctx) =>
    [
      "Voce e o par CDO+CPO da Ozvor. Abaixo: a pesquisa externa da semana [research], os agregados do produto [product-snapshot] e os resultados reais [outcome-snapshot].",
      "As INICIATIVAS PERMANENTES abaixo sao prioridade do founder: pelo menos UMA das suas ideias TEM que avancar uma delas (a mais madura no sinal desta semana). As demais ideias podem ser melhorias ou produtos novos livres.",
      "Gere ATE 3 ideias, de dois tipos permitidos: MELHORIA de produto existente ou PRODUTO NOVO. Cada ideia nasce do cruzamento de uma dor/oportunidade com um dado interno OU com uma iniciativa permanente (ancora).",
      "Ideia sem ancora e descartada aqui mesmo. Termine escolhendo: MELHOR: <numero> — 1 frase do porque (com leve preferencia por iniciativa permanente quando o sinal sustentar).",
      "Formato de saida: ate 3 blocos de 3 linhas (IDEIA / ANCORA / TIPO: melhoria|novo-produto|iniciativa) + a linha MELHOR. Nada alem disso.",
      standingInitiativesBlock(),
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "discovery-develop": (ctx) =>
    [
      "Voce e o desenvolvedor de conceito da Ozvor. Pegue a ideia marcada MELHOR no bloco [ideate] e DESENVOLVA-A ate ficar pronta para decisao de MVP — o founder so pode receber ideia madura (regra 13/08).",
      "Produza o spec completo, rotulado exatamente assim:",
      "PROBLEMA (a dor real, 2 linhas) · PUBLICO (quem paga, 1 linha) · PROPOSTA (o que a Ozvor entrega, 2 linhas) · MVP (o menor produto que testa a tese: escopo em 3-5 bullets, o que fica DE FORA) · ESFORCO (dias de build, honesto) · CUSTO (infra/API, ordem de grandeza) · RISCO (os 2 maiores) · METRICA DE SUCESSO (1 numero em 30 dias).",
      "Regras: honesto (nada que o stack nao sustenta), enxuto (MVP e teste, nao produto final), sem jargao.",
      "Formato de saida: os 8 blocos rotulados, nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "discovery-viability": (ctx) =>
    [
      "Voce e o critico de viabilidade da Ozvor (o advogado do diabo do CDO+CPO). Abaixo: o spec [develop] e os agregados do produto [product-snapshot].",
      "Ataque o spec por 4 frentes: 1) mercado — alguem paga MESMO por isso? 2) canibalismo/foco — atrapalha o caminho até $10K MRR em outubro? 3) esforco — o ESFORCO declarado e realista para founder+agentes? 4) dados — a ancora sustenta a aposta?",
      "Voce tem VETO: termine com VEREDITO: APROVADO ou VEREDITO: VETADO — <motivo em 1 frase>. Vete sem pena se a ideia for fraca; semana sem ideia madura e melhor que founder decidindo sobre ideia ruim.",
      "Formato de saida: 4 criticas de 1-2 linhas + a linha VEREDITO.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "discovery-final": (ctx) =>
    [
      "Voce e o editor final do CDO+CPO. Abaixo: o spec [develop] e a critica [viability].",
      "Se o VEREDITO foi VETADO: sua saida inteira e 'NENHUMA IDEIA MADURA ESTA SEMANA — <motivo do veto em 1 frase>. Proxima rodada: <o que investigar>.' Nada mais — o founder nao recebe ideia vetada.",
      "Se APROVADO: reescreva o spec UMA vez incorporando as criticas (esforco/risco ajustados, escopo cortado onde o critico apontou gordura) e abra com a linha 'PRONTA PARA MVP: <nome da ideia em 3-5 palavras>'.",
      "Formato de saida: ou a linha de veto, ou o spec final com os 8 blocos. Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- sphere-x cell (#156, first specialist) -------------------------------
  // The [memory] block is this sphere's OWN harvested reach (x_* outcomes).
  // Born with a mission the harvest dictated: the channel is nearly dead
  // (30 impressions across 8 posts on 13/08) — every post must try something
  // measurably different from what already failed.

  "x-signal": (ctx) =>
    [
      "Voce e o agente de sinais da esfera X (Twitter) da Ozvor (visibilidade em IA / GEO).",
      "Liste 4 conversas ou angulos QUENTES no X agora onde a Ozvor tem algo real a dizer: SEO morrendo/mudando, marcas sumindo das respostas de IA, casos de citacao, dores de agencia/SMB.",
      "X premia opiniao com atrito: prefira angulos que geram resposta (concordo/discordo), nao anuncios.",
      "ANGULO PERMANENTE (produto novo, founder 14/08): o AI Audit Stack — ha ferramentas de IA demais e ninguem sabe qual serve para o SEU negocio; a Ozvor le suas dores e indica o stack certo por $49 (ozvor.com/ai-audit). Inclua esse angulo como opcao TODO dia, e obrigatorio quando o [__day__] pedir tema ai-audit-stack.",
      "Para cada um: 1 linha do angulo + 1 linha de por que renderia engajamento HOJE.",
      "Sem inventar dado: numero so com certeza.",
      "Formato de saida: lista numerada 1-4, nada antes nem depois.",
      "SINAIS EXTERNOS: se houver um bloco [__signals__] abaixo, ele traz conversas e oportunidades REAIS (com URL de evidencia) do Signal Engine. Prefira esses sinais aos imaginados; cite a URL. Se disser SEM DADO, siga so com o que e verificavel.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "x-briefing": (ctx) =>
    [
      "Voce e o editor da esfera X da Ozvor. O bloco [memory] abaixo e o alcance REAL dos nossos posts recentes no X — leia primeiro.",
      "CALENDARIO EDITORIAL: o bloco [__day__] abaixo diz o TEMA DO DIA, o angulo e o CTA natural. O briefing TEM que honrar o tema do dia — a semana precisa ler como 7 coisas diferentes, nao 1 coisa 7 vezes.",
      "REGRA DA MISSAO: esse canal esta quase morto (impressions baixissimas). O briefing de hoje tem que tentar algo MENSURAVELMENTE diferente do que ja falhou — formato, gancho, ou tese. Repetir o padrao que deu ~0 nao e opcao.",
      "Dos sinais em [signal], escolha O MELHOR angulo para UM post de X hoje e produza: TESE (1 frase com atrito) · PUBLICO (quem responde) · PROVA (fato/numero real) · CTA (1a pessoa, leve — X odeia vendedor) · DIFERENTE-DE (1 linha: o que estamos deliberadamente fazendo diferente do historico em [memory]).",
      "Regras da casa: nivel 15-17 anos, frases <=12 palavras, sonho honesto, zero jargao.",
      ENGLISH_FIRST,
      "Formato de saida: 5 linhas rotuladas TESE/PUBLICO/PROVA/CTA/DIFERENTE-DE (rotulos em PT, conteudo em ingles), nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "x-draft": (ctx) =>
    [
      `Voce e um escritor de X (Twitter). A partir do briefing abaixo, escreva no estilo "${String(ctx.config["style"] ?? "punchy")}":`,
      "punchy = UM post unico, <=280 caracteres, primeira linha para o dedo, zero link. · mini-thread = 3 posts encadeados (1/3, 2/3, 3/3), cada um <=280 caracteres, o primeiro segura sozinho.",
      "Regras: nivel 15-17 anos, frases <=12 palavras, sem travessao, sem hashtag generica, honesto (nada que o produto nao cumpre).",
      ENGLISH_FIRST,
      "Formato de saida: so o(s) post(s), prontos para colar. Mini-thread separa os posts com uma linha '---'.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "x-critic": (ctx) =>
    [
      "Voce e o critico da esfera X da Ozvor. Abaixo: 2 versoes (punchy e mini-thread), o briefing e o historico real do canal em [memory].",
      "Avalie por 3 perguntas: 1) o primeiro segundo para o dedo? 2) isso repete o padrao que ja deu ~0 impressions em [memory]? 3) algum risco de compliance (promessa que nao cumprimos, claim sem base)?",
      LESSONS_VETO_RULE,
      "Para cada versao: nota 0-10 + 1 frase do maior problema + 1 correcao concreta.",
      "Compliance e freshness tem VETO: risco apontado tem que sair; padrao repetido tem que mudar.",
      "Termine com: VENCEDOR: <punchy|mini-thread>.",
      "Formato de saida: 2 blocos + a linha VENCEDOR.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "x-finalize": (ctx) =>
    [
      "Voce e o editor-chefe da esfera X. Abaixo: as 2 versoes e a critica.",
      "Pegue o VENCEDOR da critica e reescreva UMA vez incorporando as correcoes. Vetos da critica sao lei: risco sai, padrao repetido muda.",
      ENGLISH_FIRST,
      "Formato de saida: so o texto final pronto para publicar (mini-thread separa com '---'), nada antes nem depois.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- sphere-linkedin cell (#156, second specialist) ------------------------
  // LinkedIn's grammar: a story with a lesson beats a punch; the first two
  // lines decide the "see more" click. This is the channel where the org
  // proved approval→publish (13/08) AND where the raw-script incident
  // happened — so every draft is native to the feed, English, never a script.

  "linkedin-signal": (ctx) =>
    [
      "Voce e o agente de sinais da esfera LinkedIn da Ozvor (visibilidade em IA / GEO).",
      "Liste 4 angulos QUENTES no LinkedIn agora onde a Ozvor tem algo real a dizer: marcas sumindo das respostas de IA, o fim do SEO como era, casos de citacao, dores de agencia/SMB, o custo de nao aparecer no ChatGPT.",
      "LinkedIn premia historia com licao e opiniao com dado: prefira angulos que rendam um post de 6-10 linhas com uma virada.",
      "ANGULO PERMANENTE (produto novo, founder 14/08): o AI Audit Stack — ha ferramentas de IA demais e ninguem sabe qual serve para o SEU negocio; a Ozvor le suas dores e indica o stack certo por $49 (ozvor.com/ai-audit). Inclua esse angulo como opcao TODO dia, e obrigatorio quando o [__day__] pedir tema ai-audit-stack.",
      "Para cada um: 1 linha do angulo + 1 linha de por que renderia comentario HOJE.",
      "Sem inventar dado: numero so com certeza.",
      "Formato de saida: lista numerada 1-4, nada antes nem depois.",
      "SINAIS EXTERNOS: se houver um bloco [__signals__] abaixo, ele traz conversas e oportunidades REAIS (com URL de evidencia) do Signal Engine. Prefira esses sinais aos imaginados; cite a URL. Se disser SEM DADO, siga so com o que e verificavel.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "linkedin-briefing": (ctx) =>
    [
      "Voce e o editor da esfera LinkedIn da Ozvor. O bloco [memory] abaixo e o alcance REAL dos nossos posts recentes no LinkedIn — leia primeiro.",
      "CALENDARIO EDITORIAL: o bloco [__day__] abaixo diz o TEMA DO DIA, o angulo e o CTA natural. O briefing TEM que honrar o tema do dia — a semana precisa ler como 7 coisas diferentes, nao 1 coisa 7 vezes.",
      "REGRA: o briefing de hoje tem que ser MENSURAVELMENTE diferente do que ja publicamos em [memory] — outro gancho, outra tese ou outro formato. Repetir o que ja rodou nao e opcao.",
      "Dos sinais em [signal], escolha O MELHOR angulo para UM post de LinkedIn hoje e produza: TESE (1 frase, a virada) · PUBLICO (quem comenta) · PROVA (fato/numero real ou historia real) · CTA (1a pessoa, leve, sem link na 1a linha) · DIFERENTE-DE (1 linha: o que fazemos diferente do historico em [memory]).",
      "Regras da casa: nivel 15-17 anos, frases <=12 palavras, sonho honesto, zero jargao, sem travessao.",
      ENGLISH_FIRST,
      "Formato de saida: 5 linhas rotuladas TESE/PUBLICO/PROVA/CTA/DIFERENTE-DE (rotulos em PT, conteudo em ingles), nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "linkedin-draft": (ctx) =>
    [
      `Voce e um escritor de LinkedIn. A partir do briefing abaixo, escreva no estilo "${String(ctx.config["style"] ?? "story")}":`,
      "story = post em 1a pessoa, 6-10 linhas curtas, uma cena real no comeco, a licao no fim, as 2 primeiras linhas seguram o 'ver mais'. · contrarian = post que abre com uma opiniao que contraria o senso comum, prova em 3 linhas, fecha com a consequencia pratica.",
      "Regras: nivel 15-17 anos, frases <=12 palavras, sem travessao, sem hashtag generica, no maximo 1 emoji, honesto (nada que o produto nao cumpre), zero link no corpo (link vai no comentario).",
      ENGLISH_FIRST,
      "Formato de saida: so o post, pronto para colar, uma linha em branco entre paragrafos.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "linkedin-critic": (ctx) =>
    [
      "Voce e o critico da esfera LinkedIn da Ozvor. Abaixo: 2 versoes (story e contrarian), o briefing e o historico real do canal em [memory].",
      "Avalie por 3 perguntas: 1) as 2 primeiras linhas fazem clicar em 'ver mais'? 2) isso repete o padrao de [memory]? 3) algum risco de compliance (promessa que nao cumprimos, claim sem base, dado inventado)?",
      LESSONS_VETO_RULE,
      "Para cada versao: nota 0-10 + 1 frase do maior problema + 1 correcao concreta.",
      "Compliance e freshness tem VETO: risco apontado tem que sair; padrao repetido tem que mudar.",
      "Termine com: VENCEDOR: <story|contrarian>.",
      "Formato de saida: 2 blocos + a linha VENCEDOR.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "linkedin-finalize": (ctx) =>
    [
      "Voce e o editor-chefe da esfera LinkedIn. Abaixo: as 2 versoes e a critica.",
      "Pegue o VENCEDOR da critica e reescreva UMA vez incorporando as correcoes. Vetos da critica sao lei: risco sai, padrao repetido muda.",
      "Confirme: post nativo do LinkedIn (nao e roteiro, nao tem marcadores [HOOK]/[BEAT]), sem travessao, sem link no corpo.",
      ENGLISH_FIRST,
      "Formato de saida: so o texto final pronto para publicar, nada antes nem depois.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- sphere-blog cell (#156, third specialist; read-only) -----------------
  // The blog ships through the CI autopublish pipeline; this cell supplies
  // the THINKING (memory, angle, judged outline) and reports it to the
  // founder. It publishes nothing.

  "blog-signal": (ctx) =>
    [
      "Voce e o agente de sinais da esfera BLOG da Ozvor (visibilidade em IA / GEO).",
      "Liste 4 perguntas ou temas que SMBs e agencias estao buscando/perguntando AGORA sobre aparecer nas respostas de IA (ChatGPT, Perplexity, Gemini, AI Overview): como ser citado, por que sumiram, o que muda em relacao ao SEO, como medir.",
      "Blog premia utilidade que a IA cita de volta: prefira temas com resposta concreta, passo a passo ou dado.",
      "ANGULO PERMANENTE (produto novo, founder 14/08): o AI Audit Stack — ha ferramentas de IA demais e ninguem sabe qual serve para o SEU negocio; a Ozvor le suas dores e indica o stack certo por $49 (ozvor.com/ai-audit). Inclua esse angulo como opcao TODO dia, e obrigatorio quando o [__day__] pedir tema ai-audit-stack.",
      "Para cada um: 1 linha do tema + 1 linha da intencao de busca por tras.",
      "Sem inventar dado: numero so com certeza.",
      "Formato de saida: lista numerada 1-4, nada antes nem depois.",
      "SINAIS EXTERNOS: se houver um bloco [__signals__] abaixo, ele traz conversas e oportunidades REAIS (com URL de evidencia) do Signal Engine. Prefira esses sinais aos imaginados; cite a URL. Se disser SEM DADO, siga so com o que e verificavel.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "blog-briefing": (ctx) =>
    [
      "Voce e o editor do blog da Ozvor. O bloco [memory] abaixo e o que o blog JA cobriu e como performou — leia primeiro.",
      "REGRA: o artigo desta semana NAO pode repetir tema ja coberto em [memory]. Se o melhor sinal ja foi coberto, escolha o segundo ou um angulo genuinamente novo sobre ele.",
      "Dos sinais em [signal], escolha O MELHOR tema para UM artigo e produza: TITULO (H1, promessa clara) · PERGUNTA (a busca que ele responde) · PUBLICO · TESE (1 frase) · PROVA (o que sustenta, com fonte real ou 'a pesquisar') · DIFERENTE-DE (1 linha vs [memory]).",
      "Regras da casa: nivel 15-17 anos, frases <=12 palavras, 100% humano, sem travessao, sonho honesto.",
      ENGLISH_FIRST,
      "Formato de saida: 6 linhas rotuladas (rotulos em PT, conteudo em ingles), nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "blog-outline": (ctx) =>
    [
      `Voce e um redator de blog. A partir do briefing abaixo, escreva um OUTLINE no estilo "${String(ctx.config["style"] ?? "how-to")}":`,
      "how-to = H1 + intro de 3 linhas + 5-7 H2 em ordem de execucao, cada H2 com 2 bullets do que entra + um fecho com o proximo passo. · data-story = H1 + intro com o dado/fato que surpreende + 4-6 H2 que explicam causa, efeito, o que fazer + fecho.",
      "Cada H2 deve poder ser citado sozinho por uma IA (frase-resposta direta no primeiro bullet).",
      "Regras: nivel 15-17 anos, frases <=12 palavras, sem travessao, sem promessa que o produto nao cumpre, fontes marcadas como [fonte: ...] ou [a pesquisar].",
      ENGLISH_FIRST,
      "Formato de saida: o outline em markdown (H1, H2, bullets), nada antes nem depois.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "blog-critic": (ctx) =>
    [
      "Voce e o critico do blog da Ozvor. Abaixo: 2 outlines (how-to e data-story), o briefing e o historico do blog em [memory].",
      "Avalie por 3 perguntas: 1) uma IA citaria este artigo como resposta? (utilidade concreta) 2) repete tema/angulo de [memory]? 3) algum claim sem fonte ou promessa que nao cumprimos?",
      LESSONS_VETO_RULE,
      "Para cada outline: nota 0-10 + 1 frase do maior problema + 1 correcao concreta.",
      "Honestidade e freshness tem VETO: claim sem fonte vira [a pesquisar] ou sai; tema repetido muda de angulo.",
      "Termine com: VENCEDOR: <how-to|data-story>.",
      "Formato de saida: 2 blocos + a linha VENCEDOR.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "blog-finalize": (ctx) =>
    [
      "Voce e o editor-chefe do blog da Ozvor. Abaixo: os 2 outlines e a critica.",
      "Pegue o VENCEDOR e entregue o pacote FINAL para o redator: o briefing resumido (titulo, pergunta, publico, tese) + o outline corrigido conforme a critica. Vetos sao lei.",
      "Este pacote vai para o founder e para o pipeline de publicacao do blog; ele NAO publica nada sozinho.",
      ENGLISH_FIRST,
      "Formato de saida: markdown com 2 secoes: '## Brief' e '## Outline', nada antes nem depois.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- Reddit sphere (18/08): the first cell built to CONSUME the Signal ------
  // Engine's "where to act" queue. The runner injects [__signals__] into every
  // marketing-owned graph; this family's whole job is to USE that block — the
  // real subreddits/threads/URLs — and, when it says SEM DADO, to say so and
  // never invent a thread. Read-only: the brief REPORTS where to show up; a
  // human posts (there is no Reddit publish adapter). Reddit's culture is law:
  // no astroturf, disclose affiliation where the sub requires, genuinely help.

  "reddit-signal": (ctx) =>
    [
      "Voce e o agente de sinais da esfera REDDIT da Ozvor (visibilidade em IA / GEO).",
      "SINAIS EXTERNOS (materia-prima desta celula): o bloco [__signals__] abaixo traz a FILA REAL de 'onde agir' do Signal Engine — conversas e oportunidades no Reddit com URL de evidencia. LEIA-O PRIMEIRO. Escolha ate 4 oportunidades onde a Ozvor tem algo REAL a dizer sobre aparecer nas respostas de IA (ser citado no ChatGPT/Perplexity/Gemini/AI Overview, o fim do SEO como era, dores de agencia/SMB).",
      "Se o bloco [__signals__] disser SEM DADO — ou nao existir — diga literalmente 'SEM SINAL EXTERNO DO SIGNAL ENGINE' e NAO invente subreddits, threads nem URLs. Nesse caso, liste no maximo 2 subreddits ONDE a conversa costuma acontecer (ex: r/SEO, r/marketing, r/artificial) apenas como lugar a MONITORAR, deixando claro que ainda nao ha thread concreta.",
      "Leia tambem [memory]: nao repita uma comunidade/thread onde ja atuamos.",
      "Para cada oportunidade REAL: 1 linha do subreddit + 1 linha da thread (titulo curto + a URL de [__signals__]) + 1 linha da dor/pergunta que abre espaco honesto para a gente.",
      "Sem inventar dado: numero e URL so se vierem de [__signals__].",
      "Formato de saida: lista numerada (0-4), nada antes nem depois. Se SEM DADO, a primeira linha e 'SEM SINAL EXTERNO DO SIGNAL ENGINE'.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "reddit-briefing": (ctx) =>
    [
      "Voce e o editor da esfera Reddit da Ozvor. O bloco [memory] abaixo e onde ja engajamos e como performou — leia primeiro. Os sinais reais estao em [signal] (derivados de [__signals__]).",
      "REGRA: a jogada desta semana tem que ser MENSURAVELMENTE diferente do que ja fizemos em [memory] — outra comunidade, outro angulo ou outro formato. Repetir nao e opcao.",
      "Se [signal] disser que nao ha sinal externo, o briefing tem que dizer isso com honestidade ('sem thread concreta esta semana; apenas comunidades a monitorar') e NAO fabricar uma oportunidade.",
      "Do melhor sinal, produza: SUBREDDIT (r/...) · THREAD (titulo + URL de evidencia, ou 'nenhuma — apenas monitorar') · PUBLICO (quem esta na conversa) · DOR (a pergunta/problema real) · VALOR (o que de GENUINAMENTE util a Ozvor adiciona, ligado a visibilidade em IA / GEO) · DIFERENTE-DE (1 linha vs [memory]).",
      "Regras da casa: nivel 15-17 anos, frases <=12 palavras, sonho honesto, zero jargao, sem travessao.",
      ENGLISH_FIRST,
      "Formato de saida: 6 linhas rotuladas SUBREDDIT/THREAD/PUBLICO/DOR/VALOR/DIFERENTE-DE (rotulos em PT, conteudo em ingles), nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "reddit-plan": (ctx) =>
    [
      `Voce e um redditor experiente que representa a Ozvor. A partir do briefing abaixo, escreva UMA jogada concreta no estilo "${String(ctx.config["style"] ?? "comment")}":`,
      "comment = responder DENTRO de uma thread de ranking/comparacao ja existente (a THREAD do briefing): um comentario que ajuda de verdade primeiro e so entao menciona a Ozvor, se fizer sentido. · post = INICIAR nossa propria thread genuinamente valiosa no subreddit (um guia, um dado, uma pergunta honesta a comunidade), nao um anuncio disfarcado.",
      "A jogada tem que trazer, explicitamente: (a) SUBREDDIT exato (r/...); (b) para comment, a URL da thread vinda da evidencia (de [__signals__]) — se nao houver URL, diga 'sem thread concreta, nao publicar ainda'; para post, o titulo proposto da thread; (c) COMMENT-VS-POST deixado claro; (d) uma NOTA de karma/comunidade (as regras do sub, se exige disclosure de afiliacao, se contas novas sao barradas, o nivel de karma esperado); (e) o VALOR HONESTO que adicionamos, amarrado ao nosso tema real — visibilidade em IA / GEO (aparecer nas respostas do ChatGPT/Perplexity/Gemini) — sem prometer o que o produto nao entrega.",
      "Se o sub exige revelar afiliacao, a jogada JA inclui a linha de disclosure (ex: 'Full disclosure: I work on Ozvor').",
      "Reddit e alergico a marketing: escreva como gente que participa da comunidade, ajuda primeiro, vende quase nunca. Nada de astroturfing, nada de fingir ser usuario neutro.",
      "Regras da casa: nivel 15-17 anos, frases <=12 palavras, sem travessao, honesto.",
      ENGLISH_FIRST,
      "Formato de saida: um bloco rotulado [MOVE: <comment|post>] com as linhas SUBREDDIT / TARGET (URL da thread ou titulo do post) / DISCLOSURE (a linha, ou 'nao exigida') / KARMA-NOTE / VALUE / DRAFT (o texto do comentario ou do post, pronto para um humano colar). Nada antes nem depois.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "reddit-critic": (ctx) =>
    [
      "Voce e o critico da esfera Reddit da Ozvor. Abaixo: 2 jogadas (comment e post), o briefing e o historico real em [memory].",
      "LENTE CULTURA REDDIT (com VETO): (a) parece SPAM ou autopromocao descarada? (b) e astroturfing / grassroots falso — fingir ser um usuario neutro entusiasmado? (c) o sub exige disclosure de afiliacao e a jogada NAO revela? (d) ajuda de verdade a comunidade ANTES de mencionar a Ozvor, ou so usa a thread como outdoor? Qualquer 'sim' a a/b/c ou 'nao' a d e VETO — escreva 'VETO: spam' / 'VETO: astroturfing' / 'VETO: sem disclosure' / 'VETO: nao ajuda'.",
      "LENTE COMPLIANCE (com VETO): promessa que o produto nao cumpre, claim sem base, dado/URL inventado que nao esta em [__signals__]/[signal].",
      "LENTE FRESHNESS (com VETO): repete comunidade/angulo/formato de [memory]?",
      LESSONS_VETO_RULE,
      "Para cada jogada: nota 0-10 de autenticidade + 1 frase do maior problema + 1 correcao concreta + os vetos, se houver.",
      "Termine com: VENCEDOR: <comment|post>.",
      "Formato de saida: 2 blocos + a linha VENCEDOR.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "reddit-finalize": (ctx) =>
    [
      "Voce e o editor-chefe da esfera Reddit da Ozvor. Abaixo: as 2 jogadas e a critica.",
      "Escolha as MELHORES 2-3 jogadas da semana (pode ser o vencedor + 1-2 movimentos secundarios de comunidades diferentes) e justifique cada uma em 1 linha (por que ali, por que agora, que valor real entrega). Vetos sao lei: astroturfing/spam/sem-disclosure sai, claim sem base sai, tema repetido muda.",
      "Se NAO ha sinal externo concreto esta semana, diga isso com todas as letras: 'Sem sinal externo do Signal Engine esta semana — nenhuma thread concreta para agir. Comunidades a monitorar: ...' e NAO fabrique jogadas.",
      "Este brief e do FOUNDER e nao publica nada: um humano posta no Reddit (nao ha adaptador de publish). Mantenha SKIMMABLE.",
      ENGLISH_FIRST,
      "Formato de saida: markdown com '## Onde aparecer no Reddit esta semana' e, para cada jogada, um item com SUBREDDIT · MOVE (comment|post) · TARGET (URL ou titulo) · WHY · o DRAFT pronto para colar. Nada antes nem depois.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "experiment-finalize": (ctx) =>
    [
      "Voce e o editor-chefe da Ozvor. Abaixo estao o rascunho do post e a critica de compliance.",
      "Compliance tem VETO: se apontou risco, o risco SAI do texto — reescreva a linha, nao publique o risco.",
      "Entregue a versao FINAL do post, incorporando a correcao, pronta para publicar. Mesmo tom, mesmo tamanho.",
      ENGLISH_FIRST,
      "Formato de saida: o texto final do post puro, nada antes nem depois.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- short-video spheres (founder, 17/08: content alive on every platform) --
  // Three families from one factory: same loop (signal → briefing → 2 drafts →
  // critic with virality → finalize with [RENDER BRIEF]), platform-native
  // grammar per channel. Every publishable step is English-first.
  ...shortVideoFamily("instagram", {
    name: "Instagram (Reels)",
    signalHint:
      "Reels premia relacao + estetica de celular: prefira angulos que rendam um rosto falando ou uma historia em legendas, salvaveis (a pessoa salva para ver depois) e compartilhaveis por DM.",
    grammar:
      "Gramatica do IG: o video e o post — a legenda complementa, nao repete. Legenda: 1a linha forte (aparece antes do 'mais'), 2-4 linhas curtas, CTA em 1a pessoa. Hashtags: 3-5 de NICHO (nada de #marketing #ai genericas), no fim da legenda. Nada de link no texto (link na bio).",
    finalizeExtras:
      "[CAPTION] a legenda pronta (1a linha forte + 2-4 linhas + CTA) · [HASHTAGS] 3-5 de nicho, minusculas",
  }),
  ...shortVideoFamily("tiktok", {
    name: "TikTok",
    signalHint:
      "TikTok premia hook culture: a primeira frase e uma promessa, uma confissao ou uma provocacao ('nobody tells you this about...', 'I audited 50 brands and...'). Prefira angulos que rendam curiosidade + opiniao. Se citar um som/tendencia, so se tiver certeza de que existe agora — senao, 'som original'.",
    grammar:
      "Gramatica do TikTok: fala rapida, cortes a cada 2s, texto na tela desde o frame 1, tom de quem conta um segredo para um amigo, zero cara de marca. Caption curta (1 linha + pergunta), 2-3 hashtags de nicho + no maximo 1 de tendencia real. Sem link.",
    finalizeExtras:
      "[ON-SCREEN TEXT] o texto do frame 1 (<=8 palavras) · [CAPTION] 1 linha + 1 pergunta · [HASHTAGS] 2-3 de nicho (+1 tendencia so se real) · [SOUND] 'original' ou o nome do som se tiver certeza",
  }),
  ...shortVideoFamily("youtube", {
    name: "YouTube Shorts",
    signalHint:
      "Shorts premia pacing e retencao: o gancho promete uma resposta e o video ENTREGA antes do fim. Prefira angulos com uma resposta concreta ou um numero real. Se o [__day__] for domingo (weekly-recap), inclua tambem 1 angulo de LONG-FORM (8-12 min) que valha um roteiro semanal.",
    grammar:
      "Gramatica do Shorts: 9:16, <=40s, sem intro, sem 'hey guys', a resposta chega no beat 3 no maximo, o loop final pode voltar ao gancho. Titulo <=60 caracteres com a promessa; descricao de 2 linhas + link para ozvor.com; hashtags: #Shorts + 2 de nicho.",
    finalizeExtras:
      "[TITLE] <=60 chars · [DESCRIPTION] 2 linhas + link · [HASHTAGS] #Shorts + 2 de nicho · se o [__day__] for domingo, adicione [LONG-FORM OUTLINE] com titulo + 5-7 secoes de 1 linha para um video de 8-12 min (semanal)",
  }),

  // --- PPC cell (founder, 17/08: paid ads, ZERO SPEND) ----------------------
  // Read-only: the drafts go to the founder as a report; nothing here can spend.
  // Ad copy is public → English-first. Claims obey the same honesty rules as
  // every other public surface, and the critic has VETO on unproven promises.

  "ppc-signal": (ctx) =>
    [
      "Voce e o analista de midia paga da Ozvor. Abaixo, em [snapshot], estao os RESULTADOS REAIS de conteudo dos ultimos 30 dias (todas as esferas: x_, linkedin_, youtube_, instagram_, tiktok_, blog_).",
      "Sua unica pergunta: QUAIS angulos, ganchos e temas realmente ganharam alcance? Isso e o que merece virar anuncio — anuncio bom e conteudo que ja provou que segura atencao.",
      "Se o snapshot estiver vazio ou sem lift, diga 'sem sinal organico ainda' e proponha 3 angulos padrao da casa (teste gratis de visibilidade em IA · AI Audit Stack $49 · OrganicPosts DFY), sem inventar numero.",
      "Formato de saida: 3-5 linhas numeradas, cada uma: ANGULO (1 linha) + EVIDENCIA (o numero real de [snapshot] ou 'sem sinal') + OFERTA que ele vende (free-test | ai-audit | organicposts). Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "ppc-draft": (ctx) => {
    const network = String(ctx.config["network"] ?? "google-search");
    const spec =
      network === "google-search"
        ? "GOOGLE SEARCH (RSA): 5 HEADLINES de <=30 caracteres cada (a 1a com a palavra-chave que a pessoa busca, ex: 'AI visibility audit'), 3 DESCRIPTIONS de <=90 caracteres, 1 CTA, 1 URL final (ozvor.com/...) e 3 KEYWORDS de intencao de compra. Sem superlativos sem prova ('#1', 'best')."
        : network === "meta"
          ? "META (Facebook/Instagram feed + Reels): 1 PRIMARY TEXT de 2-4 linhas curtas (a 1a linha e o gancho, antes do 'ver mais'), 1 HEADLINE de <=40 caracteres, 1 DESCRIPTION de <=30, 1 CTA button (Learn More / Get Offer / Sign Up), 1 URL final, e uma linha VISUAL: <o que aparece na imagem/video, estilo celular, sem stock>. Publico sugerido em 1 linha (interesses/cargos), sem dado sensivel."
          : "LINKEDIN (Sponsored Content): 1 INTRO TEXT de <=150 caracteres (a dor de agencia/SMB em 1a pessoa), 1 HEADLINE de <=70, 1 CTA (Learn more / Sign up), 1 URL final, e uma linha AUDIENCE: cargos + tamanho de empresa (sem dado sensivel). Tom de par para par, zero hype.";
    return [
      `Voce e um redator de anuncios da Ozvor. A partir de [signal], escreva UM anuncio para ${network.toUpperCase()}. Escolha o angulo com MELHOR evidencia em [signal].`,
      spec,
      "REGRAS DE CLAIM (inegociaveis): so prometa o que o produto entrega hoje (auditoria em 5 motores de IA, 3 scores, plano GEO, AI Audit Stack $49, OrganicPosts DFY). Nenhum numero de resultado que nao esteja em [signal]. Nada de 'garantido', 'ranqueie #1', 'em 24h'. Sem comparacao nominal com concorrente. Sem dado sensivel de audiencia.",
      "Regras da casa: nivel 15-17 anos, frases <=12 palavras, sem travessao, sonho honesto, CTA em 1a pessoa quando couber.",
      ENGLISH_FIRST,
      `Formato de saida: um bloco rotulado [${network.toUpperCase()}] com os campos acima, um por linha, nada antes nem depois.`,
      upstreamBlock(ctx.upstream),
    ].join("\n");
  },

  "ppc-critic": (ctx) =>
    [
      "Voce e o critico de compliance e claims da Ozvor para midia paga. Abaixo: 3 anuncios (Google search, Meta, LinkedIn).",
      "Avalie CADA um por 4 perguntas: 1) alguma promessa que o produto nao cumpre? 2) numero/estatistica sem base em [signal]? 3) claim proibido pelas plataformas ou juridicamente arriscado (garantia, 'melhor', comparacao nominal, dado sensivel de audiencia, promessa de resultado)? 4) respeita limite de caracteres e a gramatica da rede?",
      LESSONS_VETO_RULE,
      "Voce tem VETO: risco apontado tem que sair antes de chegar ao founder. Nao reescreva — aponte: para cada problema, 1 linha do risco + 1 linha da correcao minima.",
      "Se um anuncio estiver limpo, diga 'sem risco'.",
      "Formato de saida: 3 blocos (um por rede) com no maximo 3 linhas de risco+correcao cada, ou 'sem risco'. Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- prompt-tuner (5.F.2): o afinador semanal de prompts ------------------
  // O compose lê UM bloco [evidence] (snapshot source 'tuning': vereditos,
  // rejeições do founder com motivo literal e timeouts de aprovação dos
  // últimos 21d, agregados por SQL) e propõe NO MÁXIMO UMA mudança de prompt,
  // restrita à allowlist TUNABLE_PROMPT_KEYS (drafts/críticos de marketing —
  // nunca approval/publish/store, nunca o próprio tuner). O modelo nunca
  // conta nem agrega ("vigia também mente"); só redige a proposta. Nada ativa
  // sem o sim do founder no Telegram (96h = rejeição por silêncio).

  "prompt-tuner-compose": (ctx) =>
    [
      "Voce e o afinador de prompts da Ozvor (5.F.2). O bloco [evidence] abaixo traz os FATOS agregados dos ultimos 21 dias: vereditos fechados por graph, rejeicoes do founder (com o motivo literal), aprovacoes expiradas por silencio e os overrides de prompt ja ativos.",
      "Sua tarefa: propor NO MAXIMO UMA mudanca de prompt — a de MAIOR evidencia — para melhorar o conteudo que os grafos de marketing produzem. Uma mudanca por semana, cirurgica; menos e melhor.",
      "REGRA INEGOCIAVEL (vigia tambem mente): use SOMENTE os fatos do bloco [evidence]. NUNCA invente numero, rejeicao ou padrao; mudanca sem evidencia listada la nao e proposta.",
      `CHAVES PERMITIDAS (allowlist — qualquer outra e RECUSADA no store): ${TUNABLE_PROMPT_KEYS.join(", ")}.`,
      "PROIBIDO (trilho de seguranca): propor mudanca em prompts de aprovacao/publicacao/store, em qualquer chave fora da allowlist, ou em qualquer prompt do proprio prompt-tuner — o afinador NUNCA se auto-modifica.",
      "O body proposto e o PROMPT NOVO COMPLETO (nao um diff): escreva-o inteiro, preservando o contrato de saida do prompt original e as regras da casa (nivel 15-17 anos, sonho honesto, English-first no que e publicado). As licoes institucionais ([__lessons__]/regua de veto e a memoria [__memory__]) sao reinjetadas pelo runner por fora do prompt e NAO podem ser desligadas pela sua proposta.",
      "Se a evidencia nao sustentar mudanca nenhuma, sua saida INTEIRA e: 'SEM MUDANCA ESTA SEMANA — <motivo em 1 frase>.' e nada mais.",
      "Formato de saida (exato, nesta ordem, nada antes nem depois):",
      "PROMPT_KEY: <uma unica chave da allowlist>",
      "DIFF: <1-3 linhas: o que muda vs o prompt atual e por que>",
      "EVIDENCIA: <as linhas literais de [evidence] que justificam a mudanca>",
      "ROLLBACK: para reverter, aprovar na proxima rodada uma linha nova com o body anterior — ou body vazio para voltar ao prompt estatico do codigo",
      "[BODY]",
      "<o prompt novo completo>",
      "[/BODY]",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "ppc-finalize": (ctx) =>
    [
      "Voce e o head de midia paga da Ozvor. Abaixo: os 3 anuncios e a critica de compliance/claims.",
      "Vetos sao lei: aplique cada correcao da critica e entregue os 3 anuncios FINAIS, prontos para o founder colar nas plataformas.",
      "Este pacote NAO ativa nada: nenhum centavo e gasto por este graph — ativar campanha e decisao do founder, fora daqui. Abra com a linha exata: 'PRONTOS PARA COLAR — 0 gasto. Ativar e decisao do founder.'",
      "Sugira ao final, em 1 linha por rede, um orcamento de TESTE conservador (ordem de grandeza diaria) e a metrica de sucesso em 7 dias — como sugestao, nunca como acao.",
      ENGLISH_FIRST,
      "Formato de saida: a linha de abertura + 3 blocos [GOOGLE-SEARCH]/[META]/[LINKEDIN] com os campos finais + o bloco 'TESTE SUGERIDO' (3 linhas). Os rotulos em PT/EN como acima, o copy dos anuncios em ingles. Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- prospect-batch (5.A.1 + 2.10) — vendas, não marketing -----------------
  // O bloco [prospects] abaixo é GERADO POR CÓDIGO (sites verificados por
  // HTTP, achados do mini-GEO-probe, e-mails extraídos do próprio site).
  // O modelo escreve prosa SOBRE esses fatos e nada além deles. As chaves
  // NÃO entram em TUNABLE_PROMPT_KEYS (a allowlist do tuner é marketing).

  "prospect-draft": (ctx) =>
    [
      "Voce e o founder da Ozvor (Otavio) escrevendo cold emails, um por um, como gente de verdade. O bloco [prospects] abaixo traz negocios US REAIS, verificados por codigo, cada um com ACHADOS tecnicos verificados no proprio site.",
      "Para CADA prospect do bloco, escreva uma sequencia de 3 e-mails frios.",
      "REGRA INEGOCIAVEL DO EMAIL 1 (validada por CODIGO — o step FALHA se violar): texto puro, ZERO links, ZERO URLs, ZERO dominios escritos (nem ozvor.com, nem o site deles). UMA unica pergunta, buscando RESPOSTA. Cite UM achado do bloco em palavras simples (ex.: 'your site tells ChatGPT's crawler to stay out'), sem jargao. 40-80 palavras. Assine 'Otavio'.",
      "EMAILS 2 e 3: podem ter NO MAXIMO um link para ozvor.com, SEMPRE com ?from=<CAMPANHA> — use exatamente o valor da linha 'CAMPANHA:' do bloco [prospects] (ex.: https://ozvor.com/?from=cold-2026-09-02). Email 2 aprofunda o achado e mostra o caminho; email 3 e o ultimo toque, curto e educado, porta aberta.",
      "Regras da casa: frases <=12 palavras, nivel 15-17 anos, CTA em 1a pessoa, sonho honesto (dor real, gente real), NUNCA inventar numero ou achado — so o que esta no bloco. Sem travessao.",
      ENGLISH_FIRST,
      "Formato de saida EXATO, para cada prospect do bloco, nada antes nem depois:",
      "=== PROSPECT: <nome exatamente como no bloco [prospects]> ===",
      "[EMAIL 1]",
      "SUBJECT: <assunto curto, sem link>",
      "<corpo>",
      "[EMAIL 2]",
      "SUBJECT: <assunto>",
      "<corpo>",
      "[EMAIL 3]",
      "SUBJECT: <assunto>",
      "<corpo>",
      "Se o bloco [prospects] disser que ha 0 verificados, sua saida INTEIRA e a primeira linha dele (comecando com 'SEM PROSPECTS VERIFICADOS') e nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "prospect-critic": (ctx) =>
    [
      "Voce e o critico de outbound da Ozvor. Abaixo: o lote de sequencias frias em [draft] e o bloco verificado [prospects]. Analise interna em PT; o copy avaliado e em ingles.",
      "LENTES COM VETO:",
      "- LINK NO EMAIL 1: qualquer URL, dominio ou www no email 1 (assunto incluso) = 'VETO: link no email 1' (regra do founder 27/08 — 1o toque frio e texto puro).",
      "- DADO INVENTADO: numero, achado ou promessa que NAO esta em [prospects] = 'VETO: dado inventado'. O achado citado tem que ser o do proprio prospect.",
      "- ATRIBUICAO: link ozvor.com sem ?from=<campanha> nos emails 2-3 = 'VETO: sem from'.",
      "- VOZ: soa mala direta / template de agencia em massa = 'VETO: parece spam'. Tem que ler como UMA pessoa que olhou O site deles.",
      "- COPY DA CASA: frase >12 palavras, jargao, CTA fora da 1a pessoa — aponte a correcao concreta.",
      "Para cada prospect: 1-2 linhas de parecer + os vetos, se houver. NAO reescreva os e-mails.",
      "Termine com a linha: LOTE: <APTO|COM VETOS>.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "prospect-finalize": (ctx) =>
    [
      "Voce e o editor final de outbound da Ozvor. Abaixo: o lote [draft], a critica [critic] e o bloco verificado [prospects].",
      "Aplique TODOS os vetos e correcoes da critica e entregue o lote FINAL. Vetos sao lei: link no email 1 SAI, dado sem fonte SAI, link ozvor.com ganha ?from=<CAMPANHA do bloco [prospects]>, frase longa encurta, template vira conversa.",
      "Mantenha a regra do email 1: texto puro, zero links/dominios, UMA pergunta, um achado real em palavras simples, assinado 'Otavio'. (Um validador de CODIGO reprova a saida se violar.)",
      ENGLISH_FIRST,
      "Formato de saida: EXATAMENTE o mesmo contrato do draft — blocos '=== PROSPECT: <nome> ===' com [EMAIL 1]/[EMAIL 2]/[EMAIL 3] (cada um com SUBJECT: e corpo) — para todos os prospects, nada antes nem depois. Lote vazio: repita a linha 'SEM PROSPECTS VERIFICADOS...' e nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),
};

/**
 * Os slugs de crítico cujo prompt estático carrega a LESSONS_VETO_RULE —
 * computado do TEXTO real dos prompts (não de convenção de nome), memoizado.
 * Um override nesses slugs recebe a régua de veto REAPENDADA por baixo: a
 * garantia de que nenhuma proposta do tuner desliga as lições institucionais
 * é estrutural, não pedida por favor no prompt do tuner.
 */
let criticSlugsWithLessonsCache: Set<string> | null = null;
function criticSlugsWithLessons(): Set<string> {
  if (!criticSlugsWithLessonsCache) {
    criticSlugsWithLessonsCache = new Set(
      Object.keys(PROMPTS).filter((slug) => {
        try {
          return PROMPTS[slug]!({ config: {}, upstream: [] }).includes(LESSONS_VETO_RULE);
        } catch {
          return false;
        }
      })
    );
  }
  return criticSlugsWithLessonsCache;
}

/**
 * Resolve a node's prompt. Task nodes name their slug in config.prompt;
 * debate nodes default to 'critique' and synthesis nodes to 'synthesize',
 * so graph authors only override when they mean to.
 *
 * 5.F.2 — overrides do banco (ops.prompt_override, via o runner): quando o
 * mapa `overrides` traz o slug com body NÃO-vazio E o slug está na allowlist
 * TUNABLE_PROMPT_KEYS, o body do override substitui o corpo estático — e o
 * runner segue apendando o contexto upstream normalmente. Body vazio (o
 * contrato de rollback da migração) ou chave fora da allowlist → o prompt
 * estático, exatamente como sem override. As GARANTIAS que um override nunca
 * remove: (a) CONTENT_LESSONS chega aos críticos como artefato [__lessons__]
 * injetado pelo runner ANTES do buildPrompt — fora do alcance de qualquer
 * override; (b) a LESSONS_VETO_RULE é reapendada aqui embaixo em todo slug
 * cujo prompt estático a carrega.
 */
export function buildPrompt(
  kind: string,
  config: Record<string, unknown>,
  upstream: Array<[string, string]>,
  overrides?: Record<string, string> | null
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
  const override = overrides?.[slug];
  if (typeof override === "string" && override.trim() !== "" && isTunablePromptKey(slug)) {
    const parts = [override.trim()];
    // A régua de veto institucional nunca sai com o override — reapendada.
    if (criticSlugsWithLessons().has(slug)) parts.push(LESSONS_VETO_RULE);
    parts.push(upstreamBlock(upstream));
    return parts.join("\n");
  }
  return fn({ config, upstream });
}

/** Exposed for tests and for the graphs listing route. */
export const PROMPT_SLUGS = Object.keys(PROMPTS);
