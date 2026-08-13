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
      ENGLISH_FIRST,
      "Formato de saida: 4 linhas rotuladas TESE/PUBLICO/PROVA/CTA (os rotulos em PT, o CONTEUDO em ingles), nada mais.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  "draft-angle": (ctx) =>
    [
      `Voce e um roteirista. Escreva UM roteiro de video social de 30-45s no angulo "${String(ctx.config["angle"] ?? "story")}" a partir do briefing abaixo.`,
      "Estrutura: HOOK (3s, para o dedo) -> desenvolvimento em 3 beats -> CTA em 1a pessoa.",
      "Regras: nivel 15-17 anos, frases <=12 palavras, sem travessao, honesto (nada de promessa que o produto nao cumpre).",
      ENGLISH_FIRST,
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
      "Voce e o diretor de conteudo. Abaixo estao 4 criticas (lentes hook/brand/compliance/freshness) sobre 3 roteiros.",
      "Escolha o roteiro vencedor no agregado e reescreva-o UMA vez incorporando as melhores sugestoes das 4 lentes.",
      "Duas lentes tem poder de VETO, nao so de nota: se compliance apontou risco, o risco SAI do texto; se freshness disse que repete tema/gancho/b-roll do que ja publicamos, o angulo MUDA — publicar requentado nao e opcao.",
      ENGLISH_FIRST,
      "Formato de saida: o roteiro final, com [HOOK]/[BEAT 1-3]/[CTA], e nada mais. (Este roteiro NAO vai direto ao publico — o node seguinte o adapta para o formato do canal.)",
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
      "Nao reescreva — aponte. Para cada problema: 1 linha do risco + 1 linha da correcao minima.",
      "Se nao houver risco, diga 'sem risco' em 1 linha.",
      "Formato de saida: no maximo 3 linhas de risco+correcao, ou 'sem risco'. Nada alem disso.",
      upstreamBlock(ctx.upstream),
    ].join("\n"),

  // --- sphere-x cell (#156, first specialist) -------------------------------
  // The [memory] block is this sphere's OWN harvested reach (x_* outcomes).
  // Born with a mission the harvest dictated: the channel is nearly dead
  // (30 impressions across 8 posts on 13/08) — every post must try something
  // measurably different from what already failed.

  "x-signal": () =>
    [
      "Voce e o agente de sinais da esfera X (Twitter) da Ozvor (visibilidade em IA / GEO).",
      "Liste 4 conversas ou angulos QUENTES no X agora onde a Ozvor tem algo real a dizer: SEO morrendo/mudando, marcas sumindo das respostas de IA, casos de citacao, dores de agencia/SMB.",
      "X premia opiniao com atrito: prefira angulos que geram resposta (concordo/discordo), nao anuncios.",
      "Para cada um: 1 linha do angulo + 1 linha de por que renderia engajamento HOJE.",
      "Sem inventar dado: numero so com certeza.",
      "Formato de saida: lista numerada 1-4, nada antes nem depois.",
    ].join("\n"),

  "x-briefing": (ctx) =>
    [
      "Voce e o editor da esfera X da Ozvor. O bloco [memory] abaixo e o alcance REAL dos nossos posts recentes no X — leia primeiro.",
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

  "experiment-finalize": (ctx) =>
    [
      "Voce e o editor-chefe da Ozvor. Abaixo estao o rascunho do post e a critica de compliance.",
      "Compliance tem VETO: se apontou risco, o risco SAI do texto — reescreva a linha, nao publique o risco.",
      "Entregue a versao FINAL do post, incorporando a correcao, pronta para publicar. Mesmo tom, mesmo tamanho.",
      ENGLISH_FIRST,
      "Formato de saida: o texto final do post puro, nada antes nem depois.",
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
