/**
 * design-partner-pack.ts — the one-to-two page document the founder carries
 * into a design-partner conversation (canal B of the 19-day plan, approved
 * 2026-09-11).
 *
 * WHAT THIS IS
 * ---------------------------------------------------------------------------
 * The Do Next engine already produces, per audit, cards that name the lost
 * question, the engine, who won it, the source it was assembled from, the
 * hypothesis, the artifact, the acceptance criteria and the recheck date
 * (packages/llm/src/gap-classifier.ts, apps/worker/src/jobs/audit-run.ts).
 * That is a CLIENT surface. This module is the same evidence rendered for a
 * company that is not a client yet: what a stranger can read in two minutes
 * and recognise as their own business.
 *
 * THE FOUR RULES IT ENFORCES IN CODE
 * ---------------------------------------------------------------------------
 * 1. NO PACK WITHOUT EVIDENCE. `buildDesignPartnerPack` REFUSES to build when
 *    no question was actually probed. There is no "sample" mode, no filler,
 *    no illustrative competitor. A pack that cannot be built fails loudly so
 *    the founder walks in with nothing rather than with a fiction.
 *
 * 2. NOTHING WE DO NOT PROMISE IS LEFT OUT. The "What we do not promise"
 *    block is not optional and not editable per prospect: it is
 *    RELATORIO-AUDITORIA-COMPLETA-OZVOR.md section 28, rendered verbatim in
 *    the pack's language. `renderDesignPartnerPackHtml` always emits it.
 *
 * 3. THE FORBIDDEN COPY CANNOT SHIP. `findForbiddenClaims` is the section-28
 *    ban list ("guaranteed rankings", "we improve your score", "live signals",
 *    "all caught up", "full audit", a fixed deadline for a citation), in
 *    English and Portuguese. `assertPackCopyClean` runs it over the rendered
 *    HTML and throws. The generator calls it before it writes the file.
 *
 * 4. ABSENCE IS REPORTED, NOT HIDDEN. Engines that were blocked (region gate)
 *    or that failed are named in the pack itself. A prospect reading "we asked
 *    four engines" must be able to see which four.
 *
 * HOUSE COPY STANDARD
 * ---------------------------------------------------------------------------
 * Reading level 15-17, sentences of 12 words or fewer, first-person CTA,
 * English by default. The founder's own network often speaks Portuguese, so
 * `language: "pt-BR"` renders the same pack in PT. `longSentences()` is the
 * guard, exercised against this module's own copy in the test suite.
 *
 * Pure module: no I/O, no SQL, no LLM, no dates read from the clock (the
 * caller passes `generatedAt`). Everything here is testable from a fixture.
 */

import type {
  GapType,
  NormalizedObservation,
  ObservationSentiment,
  VisibilityAction,
} from "./gap-classifier";
import { sourceDomain } from "./visibility-loop";

// ---------------------------------------------------------------------------
// 1. Input — the real audit evidence, already normalized
// ---------------------------------------------------------------------------

export type PackLanguage = "en" | "pt-BR";

export const PACK_LANGUAGES: readonly PackLanguage[] = ["en", "pt-BR"];

/** One (question x engine) result, exactly as the probe measured it. */
export interface PackFinding {
  /** The buyer question as it was probed, verbatim. */
  question: string;
  /** Engine id: 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'serp'. */
  engine: string;
  /** True when the answer attributed something to this brand. */
  cited: boolean;
  /** 1-based position when cited. null = cited without a position, or absent. */
  rank: number | null;
  /** Brands the answer named instead. Empty is allowed and is itself a finding. */
  winners: string[];
  /** Domains the answer was assembled from. */
  sources: string[];
  /**
   * True when the surface produced no answer at all (e.g. Google showed no AI
   * Overview). Different from "answered and did not name you" — and the pack
   * says which, because conflating them is a lie about the measurement.
   */
  absent?: boolean;
}

/** Engines named in the pack so the reader can see the coverage. */
export interface PackCoverage {
  /** Engines that answered at least one question in this run. */
  probed: string[];
  /** Engines the region gate refused, with the reason. Never hidden. */
  blocked: { engine: string; reason: string }[];
  /** Engines that were asked and failed. Never hidden. */
  failed: { engine: string; reason: string }[];
}

export interface PackInput {
  /** The company as it should appear on the page. */
  company: string;
  /** Their domain, bare (no scheme). */
  domain: string;
  /** Market/locale label shown to the reader, e.g. "United States - English". */
  market: string;
  language: PackLanguage;
  /** ISO instant the audit finished. The pack is dated from this, never from now(). */
  generatedAt: string;
  coverage: PackCoverage;
  findings: PackFinding[];
  /** Do Next actions from the gap classifier, highest priority first. */
  actions: VisibilityAction[];
  /** Sampling/scoring methodology version, printed so the run is reproducible. */
  methodologyVersion: string;
  /** Where the reader books the conversation. */
  bookUrl: string;
  /** Reply-to address printed next to the booking link. */
  contactEmail: string;
}

// ---------------------------------------------------------------------------
// 2. The model the renderer draws
// ---------------------------------------------------------------------------

/** One line in the "where you are missing" table. */
export interface PackGapLine {
  question: string;
  engine: string;
  /** Names the answer gave instead. Empty when the answer named nobody. */
  winners: string[];
  /** Up to two domains the answer leaned on. */
  sources: string[];
  absent: boolean;
}

/** One line in the "where you already show up" table. */
export interface PackWinLine {
  question: string;
  engine: string;
  rank: number | null;
}

/** A Do Next card translated out of engineering language. */
export interface PackActionCard {
  /** One sentence a business owner recognises. 12 words or fewer. */
  headline: string;
  /** The evidence behind it: the question, the engine, who won. */
  because: string;
  /** What Ozvor produces. */
  artifact: string;
  /** How we will both know it worked. */
  acceptance: string;
  /** ISO date of the earliest honest recheck. */
  recheckOn: string;
  /** Who does the work. The pack never hands the client silent homework. */
  owner: VisibilityAction["ownerType"];
  gapType: GapType;
}

export interface PackWeek {
  label: string;
  lines: string[];
}

export interface PackModel {
  company: string;
  domain: string;
  market: string;
  language: PackLanguage;
  /** YYYY-MM-DD, derived from generatedAt. */
  date: string;
  methodologyVersion: string;
  coverage: PackCoverage;
  questionsAsked: number;
  answersRead: number;
  citedAnswers: number;
  gaps: PackGapLine[];
  wins: PackWinLine[];
  actions: PackActionCard[];
  /** True when the run found no gap worth acting on. Said out loud, not padded. */
  noGapFound: boolean;
  weeks: PackWeek[];
  notPromised: string[];
  offer: string[];
  bookUrl: string;
  contactEmail: string;
}

// ---------------------------------------------------------------------------
// 3. Copy tables (EN default, PT-BR for the founder's own network)
// ---------------------------------------------------------------------------

interface CopyTable {
  packTitle: (company: string) => string;
  subtitle: (domain: string, market: string) => string;
  runLine: (date: string, version: string) => string;
  coverageLine: (probed: string[]) => string;
  blockedLine: (items: { engine: string; reason: string }[]) => string;
  failedLine: (items: { engine: string; reason: string }[]) => string;
  summaryLine: (asked: number, read: number, cited: number) => string;
  gapsTitle: string;
  gapsIntro: (company: string) => string;
  gapsEmpty: string;
  winsTitle: string;
  winsEmpty: string;
  actionsTitle: string;
  actionsIntro: string;
  noGapLine: string;
  planTitle: string;
  planIntro: string;
  notPromisedTitle: string;
  notPromisedIntro: string;
  offerTitle: string;
  ctaTitle: string;
  ctaLine: string;
  ctaButton: string;
  contactLine: (email: string) => string;
  colQuestion: string;
  colEngine: string;
  colInstead: string;
  colSource: string;
  colRank: string;
  absentLabel: string;
  nobodyLabel: string;
  noSourceLabel: string;
  becauseLabel: string;
  artifactLabel: string;
  acceptanceLabel: string;
  recheckLabel: string;
  ownerLabel: string;
  ownerNames: Record<VisibilityAction["ownerType"], string>;
  weeks: PackWeek[];
  notPromised: string[];
  offer: string[];
  footer: string;
}

/**
 * The 30-day cadence is RELATORIO section 8 (Blueprint do servico), written for
 * a reader who has never seen the report. Onboarding in week 1, first shipped
 * action in week 2, breadth in week 3, re-measure and review in week 4, with
 * the daily health loop underneath all of it.
 */
const EN: CopyTable = {
  packTitle: (company) => `${company} in AI search`,
  subtitle: (domain, market) => `A real audit of ${domain}. Market: ${market}.`,
  runLine: (date, version) => `Run on ${date}. Method version ${version}.`,
  coverageLine: (probed) => `We asked these engines: ${probed.join(", ")}.`,
  blockedLine: (items) =>
    `Not asked: ${items.map((i) => `${i.engine} (${i.reason})`).join("; ")}.`,
  failedLine: (items) =>
    `Asked but no answer: ${items.map((i) => `${i.engine} (${i.reason})`).join("; ")}.`,
  summaryLine: (asked, read, cited) =>
    `We asked ${asked} buyer questions. We read ${read} answers. You were named in ${cited}.`,
  gapsTitle: "Where buyers look and you are not there",
  gapsIntro: (company) => `These are real questions. ${company} did not come up.`,
  gapsEmpty: "Every question we asked named you. Nothing to report here.",
  winsTitle: "Where you already show up",
  winsEmpty: "No answer named you in this run. That is the honest result.",
  actionsTitle: "The three strongest moves",
  actionsIntro: "Each one names the question it fixes. Each one has a check date.",
  noGapLine:
    "This run found no gap big enough to act on. We will not invent work for you.",
  planTitle: "What we do in the first 30 days",
  planIntro: "We do the work. You approve it. Nothing goes out without your yes.",
  notPromisedTitle: "What we do not promise",
  notPromisedIntro: "AI answers are probabilistic. Anyone promising more is guessing.",
  offerTitle: "The design partner offer",
  ctaTitle: "Want to see the rest?",
  ctaLine: "Book 20 minutes. I will walk you through every question we asked.",
  ctaButton: "Book the call",
  contactLine: (email) => `Or reply to this and write me at ${email}.`,
  colQuestion: "Buyer question",
  colEngine: "Engine",
  colInstead: "Named instead",
  colSource: "Built from",
  colRank: "Position",
  absentLabel: "no answer shown",
  nobodyLabel: "nobody named",
  noSourceLabel: "no source shown",
  becauseLabel: "Because",
  artifactLabel: "We produce",
  acceptanceLabel: "Done means",
  recheckLabel: "We re-ask on",
  ownerLabel: "Who does it",
  ownerNames: { ozvor: "Ozvor", client: "You, with our draft", partner: "Ozvor, with a partner" },
  weeks: [
    {
      label: "Week 1 — baseline",
      lines: [
        "We confirm you own the brand.",
        "We load your entity, market, language and products.",
        "We import your search data and your competitors.",
        "You approve the questions we will track.",
        "We run the baseline and show you the first gap.",
      ],
    },
    {
      label: "Week 2 — first action shipped",
      lines: [
        "We pick the strongest gap from week 1.",
        "We write the artifact. You read it.",
        "You approve. We publish where you allow it.",
        "We log what changed and why.",
      ],
    },
    {
      label: "Week 3 — breadth",
      lines: [
        "We ship the next two actions.",
        "We work on the places AI quotes about you.",
        "We fix the profiles that contradict each other.",
      ],
    },
    {
      label: "Week 4 — re-measure and review",
      lines: [
        "We ask the same questions again.",
        "We show you what moved and what did not.",
        "We tell you why, with the answers side by side.",
        "We agree the next month together.",
      ],
    },
    {
      label: "Every day, underneath",
      lines: [
        "Engine health, queues and freshness are watched.",
        "A drop is investigated within a day.",
        "If we cannot measure something, we say so.",
      ],
    },
  ],
  notPromised: [
    "We do not promise a ranking or a citation.",
    "We do not promise a date for either one.",
    "We do not promise to move a score.",
    "We do not report progress we cannot show you.",
    "We never say the queue is empty with a gap open.",
  ],
  offer: [
    "First month: $750. After that: $1,500 per month.",
    "No lock-in. Cancel at the end of any month.",
    "Everything we build is yours. Full export, any time.",
    "You see the method, the evidence and the failures.",
    "Five design partners only. You get our attention.",
  ],
  footer: "Ozvor · AI search visibility · ozvor.com",
};

const PT: CopyTable = {
  packTitle: (company) => `${company} na busca com IA`,
  subtitle: (domain, market) => `Uma auditoria real de ${domain}. Mercado: ${market}.`,
  runLine: (date, version) => `Rodada em ${date}. Versão do método ${version}.`,
  coverageLine: (probed) => `Perguntamos a estes motores: ${probed.join(", ")}.`,
  blockedLine: (items) =>
    `Não perguntamos: ${items.map((i) => `${i.engine} (${i.reason})`).join("; ")}.`,
  failedLine: (items) =>
    `Perguntamos e não houve resposta: ${items.map((i) => `${i.engine} (${i.reason})`).join("; ")}.`,
  summaryLine: (asked, read, cited) =>
    `Fizemos ${asked} perguntas de comprador. Lemos ${read} respostas. Você apareceu em ${cited}.`,
  gapsTitle: "Onde o comprador procura e você não está",
  gapsIntro: (company) => `Estas perguntas são reais. ${company} não apareceu.`,
  gapsEmpty: "Todas as perguntas citaram você. Nada a relatar aqui.",
  winsTitle: "Onde você já aparece",
  winsEmpty: "Nenhuma resposta citou você nesta rodada. Este é o resultado honesto.",
  actionsTitle: "Os três movimentos mais fortes",
  actionsIntro: "Cada um diz a pergunta que resolve. Cada um tem data de conferência.",
  noGapLine: "Esta rodada não achou lacuna que valha ação. Não vamos inventar trabalho.",
  planTitle: "O que fazemos nos primeiros 30 dias",
  planIntro: "Nós fazemos o trabalho. Você aprova. Nada sai sem o seu sim.",
  notPromisedTitle: "O que não prometemos",
  notPromisedIntro: "A resposta da IA é probabilística. Quem promete mais está chutando.",
  offerTitle: "A oferta de design partner",
  ctaTitle: "Quer ver o resto?",
  ctaLine: "Marque 20 minutos. Eu mostro cada pergunta que fizemos.",
  ctaButton: "Marcar a conversa",
  contactLine: (email) => `Ou responda aqui e me escreva em ${email}.`,
  colQuestion: "Pergunta do comprador",
  colEngine: "Motor",
  colInstead: "Citou no lugar",
  colSource: "Montou a partir de",
  colRank: "Posição",
  absentLabel: "sem resposta exibida",
  nobodyLabel: "ninguém citado",
  noSourceLabel: "sem fonte exibida",
  becauseLabel: "Porquê",
  artifactLabel: "Nós produzimos",
  acceptanceLabel: "Pronto significa",
  recheckLabel: "Perguntamos de novo em",
  ownerLabel: "Quem faz",
  ownerNames: {
    ozvor: "Ozvor",
    client: "Você, com o nosso rascunho",
    partner: "Ozvor, com um parceiro",
  },
  weeks: [
    {
      label: "Semana 1 — linha de base",
      lines: [
        "Confirmamos que a marca é sua.",
        "Carregamos entidade, mercado, idioma e produtos.",
        "Importamos seus dados de busca e seus concorrentes.",
        "Você aprova as perguntas que vamos acompanhar.",
        "Rodamos a linha de base e mostramos a primeira lacuna.",
      ],
    },
    {
      label: "Semana 2 — primeira ação no ar",
      lines: [
        "Escolhemos a lacuna mais forte da semana 1.",
        "Escrevemos o artefato. Você lê.",
        "Você aprova. Publicamos onde você permitir.",
        "Registramos o que mudou e por que.",
      ],
    },
    {
      label: "Semana 3 — alcance",
      lines: [
        "Entregamos as duas ações seguintes.",
        "Trabalhamos os lugares que a IA cita sobre você.",
        "Corrigimos os perfis que se contradizem.",
      ],
    },
    {
      label: "Semana 4 — medir de novo e revisar",
      lines: [
        "Fazemos as mesmas perguntas outra vez.",
        "Mostramos o que mudou e o que não mudou.",
        "Explicamos por quê, com as respostas lado a lado.",
        "Combinamos o mês seguinte junto com você.",
      ],
    },
    {
      label: "Todo dia, por baixo",
      lines: [
        "Saúde dos motores, filas e frescor são vigiados.",
        "Uma queda é investigada em até um dia.",
        "Se não conseguimos medir algo, nós dizemos.",
      ],
    },
  ],
  notPromised: [
    "Não prometemos ranking nem citação.",
    "Não prometemos data para nenhum dos dois.",
    "Não prometemos mexer em score.",
    "Não relatamos avanço que não possamos mostrar.",
    "Nunca dizemos fila vazia com lacuna aberta.",
  ],
  offer: [
    "Primeiro mês: US$ 750. Depois: US$ 1.500 por mês.",
    "Sem fidelidade. Cancele no fim de qualquer mês.",
    "Tudo o que construímos é seu. Exportação completa, quando quiser.",
    "Você vê o método, a evidência e as falhas.",
    "Apenas cinco design partners. Você tem a nossa atenção.",
  ],
  footer: "Ozvor · visibilidade na busca com IA · ozvor.com",
};

const COPY: Record<PackLanguage, CopyTable> = { en: EN, "pt-BR": PT };

/** The copy table for a language. Exported so tests can lint it directly. */
export function packCopy(language: PackLanguage): CopyTable {
  return COPY[language] ?? EN;
}

// ---------------------------------------------------------------------------
// 4. Forbidden copy — RELATORIO section 28, enforced
// ---------------------------------------------------------------------------

export interface ForbiddenClaimPattern {
  /** Stable id used in error messages and tests. */
  id: string;
  pattern: RegExp;
  /** Why it is banned, in one line. */
  why: string;
}

/**
 * The ban list. Section 28 names six forms; the deadline patterns below are the
 * same ban written as a regex, because "cited in 30 days" is exactly the fixed
 * deadline the section forbids.
 *
 * Patterns are case-insensitive and global-free (tested with .test / .exec on a
 * fresh regex each call, so no lastIndex state can leak between calls).
 */
export const FORBIDDEN_CLAIMS: readonly ForbiddenClaimPattern[] = Object.freeze([
  {
    id: "guaranteed-rankings",
    pattern: /\bguarantee(?:d|s)?\b[^.!?]{0,40}\b(?:ranking|rankings|citation|citations|position|spot|result|results)\b/i,
    why: "Section 28: never guarantee a ranking or a citation.",
  },
  {
    id: "guaranteed-rankings-reverse",
    pattern: /\b(?:ranking|rankings|citation|citations)\b[^.!?]{0,25}\bguarantee(?:d|s)?\b/i,
    why: "Section 28: never guarantee a ranking or a citation.",
  },
  {
    id: "improve-your-score",
    pattern: /\bwe\s+(?:will\s+)?(?:improve|raise|boost|increase|move|lift)\s+(?:your|the)\s+score\b/i,
    why: "Section 28: never promise to move the score.",
  },
  {
    id: "live-signals",
    pattern: /\blive\s+signals\b/i,
    why: "Section 28: 'live signals' is banned while the feature is off.",
  },
  {
    id: "all-caught-up",
    pattern: /\ball\s+caught\s+up\b/i,
    why: "Section 28: never say the queue is empty while a gap is open.",
  },
  {
    id: "full-audit",
    pattern: /\bfull\s+audit\b/i,
    why: "Section 28: 'full audit' overstates what one run covers.",
  },
  {
    id: "citation-deadline",
    pattern: /\b(?:cited|citation|ranked|ranking|recommended|visible)\b[^.!?]{0,30}\b(?:in|within)\s+\d+\s*(?:day|days|week|weeks|month|months)\b/i,
    why: "Section 28: never put a fixed deadline on a citation.",
  },
  {
    id: "number-one-promise",
    pattern: /\b(?:get|put|make)\s+you\s+(?:to\s+)?(?:#\s*1|number\s+one|first\s+place)\b/i,
    why: "Section 28: no absolute, unversioned comparative promise.",
  },
  // --- Portuguese, same bans -------------------------------------------------
  {
    id: "pt-garantia-ranking",
    pattern: /\bgarant(?:ia|ido|ida|imos|e|em)\b[^.!?]{0,40}\b(?:ranking|citacao|citação|posicao|posição|resultado)\b/i,
    why: "Secao 28: nunca garantir ranking ou citacao.",
  },
  {
    id: "pt-garantia-ranking-reverse",
    pattern: /\b(?:ranking|citacao|citação|posicao|posição|resultado)s?\b[^.!?]{0,25}\bgarant(?:ido|ida|idos|idas|ia)\b/i,
    why: "Secao 28: nunca garantir ranking ou citacao (nem na ordem inversa).",
  },
  {
    id: "pt-melhorar-score",
    pattern: /\b(?:melhoramos|vamos\s+melhorar|aumentamos|subimos|elevamos)\s+(?:o\s+)?seu\s+score\b/i,
    why: "Secao 28: nunca prometer mexer no score.",
  },
  {
    id: "pt-sinais-ao-vivo",
    pattern: /\bsinais\s+ao\s+vivo\b/i,
    why: "Secao 28: 'sinais ao vivo' proibido enquanto desligado.",
  },
  {
    id: "pt-tudo-em-dia",
    pattern: /\btudo\s+(?:em\s+dia|resolvido)\b/i,
    why: "Secao 28: nunca dizer que a fila esta vazia com lacuna aberta.",
  },
  {
    id: "pt-auditoria-completa",
    pattern: /\bauditoria\s+completa\b/i,
    why: "Secao 28: 'auditoria completa' exagera o que uma rodada cobre.",
  },
  {
    id: "pt-prazo-citacao",
    pattern: /\b(?:citado|citacao|citação|recomendado|visivel|visível)\b[^.!?]{0,30}\bem\s+\d+\s*(?:dia|dias|semana|semanas|mes|meses|mês)\b/i,
    why: "Secao 28: nunca dar prazo fixo para uma citacao.",
  },
]);

export interface ForbiddenClaimHit {
  id: string;
  why: string;
  /** The matched text, so the author can find it. */
  match: string;
}

/**
 * Find every banned claim in a piece of copy. Returns [] when the copy is
 * clean. Works on HTML as well as plain text: HTML tags are stripped first so
 * `<strong>guaranteed</strong> rankings` cannot slip through a tag boundary.
 */
export function findForbiddenClaims(text: string): ForbiddenClaimHit[] {
  const plain = String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
  const hits: ForbiddenClaimHit[] = [];
  for (const rule of FORBIDDEN_CLAIMS) {
    const m = new RegExp(rule.pattern.source, rule.pattern.flags.replace("g", "")).exec(plain);
    if (m) hits.push({ id: rule.id, why: rule.why, match: m[0] });
  }
  return hits;
}

/** Throw when banned copy is present. The generator calls this before writing. */
export function assertPackCopyClean(text: string): void {
  const hits = findForbiddenClaims(text);
  if (hits.length === 0) return;
  const detail = hits.map((h) => `${h.id}: "${h.match}" — ${h.why}`).join("\n  ");
  throw new Error(`Forbidden copy in the design partner pack:\n  ${detail}`);
}

/**
 * WHAT THE LINT IS ALLOWED TO SEE.
 *
 * The ban list governs OUR claims. A prospect may well sell "guaranteed
 * rankings" themselves, and a buyer question we probed verbatim may contain the
 * words — quoting their market back to them is evidence, not a promise, and
 * blocking the pack over it would be the tool lying about what it measured.
 *
 * So the lint runs over everything Ozvor wrote — the copy table for the
 * language, the headlines, the artifact and acceptance lines, the 30-day plan,
 * the section-28 block and the offer — with the verbatim prospect strings
 * (their questions, competitors, sources, company and domain) removed.
 */
export function lintablePackText(model: PackModel): string {
  const c = packCopy(model.language);
  const verbatim = new Set<string>();
  const keep = (s: string | undefined | null): void => {
    const v = String(s ?? "").trim();
    if (v.length >= 3) verbatim.add(v);
  };
  keep(model.company);
  keep(model.domain);
  keep(model.market);
  for (const g of model.gaps) {
    keep(g.question);
    g.winners.forEach(keep);
    g.sources.forEach(keep);
  }
  for (const w of model.wins) keep(w.question);

  const ours: string[] = [
    c.packTitle("BRAND"),
    c.subtitle("DOMAIN", "MARKET"),
    c.runLine(model.date, model.methodologyVersion),
    c.coverageLine(model.coverage.probed),
    c.summaryLine(model.questionsAsked, model.answersRead, model.citedAnswers),
    c.gapsTitle,
    c.gapsIntro("BRAND"),
    c.gapsEmpty,
    c.winsTitle,
    c.winsEmpty,
    c.actionsTitle,
    c.actionsIntro,
    c.noGapLine,
    c.planTitle,
    c.planIntro,
    c.notPromisedTitle,
    c.notPromisedIntro,
    c.offerTitle,
    c.ctaTitle,
    c.ctaLine,
    c.ctaButton,
    c.contactLine(model.contactEmail),
    c.footer,
    // From the MODEL, not the copy table: these are the strings that actually
    // render, and a caller can hand us a model whose offer or plan was edited.
    // Linting the template instead of the artifact is how banned copy ships.
    ...model.weeks.flatMap((w) => [w.label, ...w.lines]),
    ...model.notPromised,
    ...model.offer,
    ...model.actions.flatMap((a) => [a.headline, a.because, a.artifact, a.acceptance]),
  ];

  let text = ours.join("\n");
  // Longest first so "Acme Roofing Co" is removed before "Acme".
  for (const v of [...verbatim].sort((a, b) => b.length - a.length)) {
    text = text.split(v).join(" ");
  }
  return text;
}

/**
 * House copy standard: sentences of 12 words or fewer. Returns the offenders.
 * Used as a guard on this module's own copy, not on the prospect's own data
 * (a buyer question is quoted verbatim and is not ours to shorten).
 */
export function longSentences(text: string, maxWords = 12): string[] {
  return String(text ?? "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => s.split(/\s+/).filter(Boolean).length > maxWords);
}

// ---------------------------------------------------------------------------
// 5. Build the model from real evidence
// ---------------------------------------------------------------------------

/** Max rows shown per table so the pack stays one to two pages. */
export const MAX_GAP_ROWS = 6;
export const MAX_WIN_ROWS = 4;
export const MAX_ACTIONS = 3;

export class PackEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackEvidenceError";
  }
}

function isoDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new PackEvidenceError(`generatedAt is not a date: ${iso}`);
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Turn a VisibilityAction into a card a business owner reads without help.
 *
 * The engineering card already carries the evidence; this only changes the
 * voice. It never adds a claim the action did not make, and it never drops the
 * recheck date — an action without a check date is a horoscope.
 */
export function toActionCard(action: VisibilityAction, language: PackLanguage): PackActionCard {
  const c = packCopy(language);
  const winners = action.evidence.winningBrands.slice(0, 3);
  const sources = action.evidence.citedSources.slice(0, 2);
  const who =
    winners.length > 0
      ? language === "pt-BR"
        ? `${winners.join(", ")} aparece no lugar`
        : `${winners.join(", ")} shows up instead`
      : sources.length > 0
        ? language === "pt-BR"
          ? `a resposta vem de ${sources.join(" e ")}`
          : `the answer comes from ${sources.join(" and ")}`
        : language === "pt-BR"
          ? "a resposta não mostrou fonte"
          : "the answer showed no source";
  const because =
    language === "pt-BR"
      ? `Perguntamos "${action.evidence.lostPrompt}" no ${action.engine}. ${cap(who)}.`
      : `We asked "${action.evidence.lostPrompt}" on ${action.engine}. ${cap(who)}.`;
  return {
    headline: headlineFor(action, language),
    because,
    // Pack-owned when we know the gap type; the classifier's own English
    // strings are the fallback, so a new type degrades to English, not blank.
    artifact: ARTIFACT_LABEL[language][action.gapType] ?? action.artifactType,
    acceptance:
      ACCEPTANCE_LABEL[language][action.gapType] ??
      action.acceptanceCriteria[0] ??
      c.acceptanceLabel,
    recheckOn: action.verificationPlan.earliestCheckAt.slice(0, 10),
    owner: action.ownerType,
    gapType: action.gapType,
  };
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/**
 * One short headline per gap type, in the client's words. Twelve words or
 * fewer, by construction and by test.
 */
const HEADLINES: Record<PackLanguage, Record<GapType, string>> = {
  en: {
    technical: "Let the AI crawlers read your site",
    entity: "Make the AI sure which company you are",
    content: "Answer the question buyers actually ask",
    proof: "Put your real results where AI can read them",
    reputation: "Earn the reviews the AI quotes",
    offsite: "Get listed where AI goes for answers",
    local: "Fix your local listings so AI trusts them",
  },
  "pt-BR": {
    technical: "Deixe os robôs de IA lerem seu site",
    entity: "Faça a IA saber qual empresa é a sua",
    content: "Responda a pergunta que o comprador faz",
    proof: "Coloque seus resultados onde a IA lê",
    reputation: "Conquiste as avaliações que a IA cita",
    offsite: "Apareça nos lugares que a IA consulta",
    local: "Arrume seus cadastros locais para a IA confiar",
  },
};

function headlineFor(action: VisibilityAction, language: PackLanguage): string {
  return HEADLINES[language][action.gapType] ?? HEADLINES.en[action.gapType];
}

/**
 * What we produce, and what "done" means — in the pack's language.
 *
 * The gap classifier's `artifactType` and `acceptanceCriteria` are written for
 * the client dashboard and the worker: English, long, and quoting the prompt
 * again. Two things make them wrong HERE. A pt-BR pack would carry an English
 * line per card, which reads as a translation nobody finished. And the card
 * already names the exact question in `because`, so repeating it in the
 * acceptance line spends half the card saying the same thing twice.
 *
 * So the pack owns these two lines, per gap type, in both languages. They say
 * the same thing the classifier says — shorter, and to the person paying.
 * `toActionCard` falls back to the classifier's own strings for a gap type this
 * table does not know, so a new type degrades to English rather than to blank.
 */
const ARTIFACT_LABEL: Record<PackLanguage, Record<GapType, string>> = {
  en: {
    technical: "the crawl fix, on your pages",
    entity: "your identity markup and profiles",
    content: "one page that answers it",
    proof: "your proof, published",
    reputation: "the public answer, on the record",
    offsite: "a real presence on that source",
    local: "your local listings, corrected",
  },
  "pt-BR": {
    technical: "a correção de rastreio, nas suas páginas",
    entity: "a marcação de identidade e os seus perfis",
    content: "uma página que responde a pergunta",
    proof: "a sua prova, publicada",
    reputation: "a resposta pública, no registro",
    offsite: "presença real naquela fonte",
    local: "seus cadastros locais, corrigidos",
  },
};

const ACCEPTANCE_LABEL: Record<PackLanguage, Record<GapType, string>> = {
  en: {
    technical: "The page loads, and the AI crawlers are allowed in.",
    entity: "One outside record states the same name and category.",
    content: "The page answers it in the first paragraph.",
    proof: "Two proofs on the page that anyone can check.",
    reputation: "The public answer is live, where it was said.",
    offsite: "You are present on that source, under your name.",
    local: "Your listings match your site, everywhere.",
  },
  "pt-BR": {
    technical: "A página carrega, e os robôs de IA podem entrar.",
    entity: "Um registro de fora diz o mesmo nome e categoria.",
    content: "A página responde no primeiro parágrafo.",
    proof: "Duas provas na página que qualquer um confere.",
    reputation: "A resposta pública está no ar, onde foi dito.",
    offsite: "Você está naquela fonte, com o seu nome.",
    local: "Seus cadastros batem com o site, em todo lado.",
  },
};

/**
 * Pick the three actions the pack shows.
 *
 * Priority order alone tends to return the same move three times — three
 * content gaps read as one idea repeated, and a reader who sees the same
 * sentence three times concludes we have one sentence. So: the highest-priority
 * action of each DISTINCT gap type first (still in priority order), then fill
 * any remaining slot from what is left, again by priority.
 *
 * Nothing is invented and nothing is reordered by preference: every card that
 * ships is one the classifier produced and the specificity guard passed.
 */
export function selectPackActions(actions: readonly VisibilityAction[]): VisibilityAction[] {
  const byPriority = [...actions].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id)
  );
  const picked: VisibilityAction[] = [];
  const typesSeen = new Set<GapType>();
  for (const a of byPriority) {
    if (picked.length >= MAX_ACTIONS) break;
    if (typesSeen.has(a.gapType)) continue;
    typesSeen.add(a.gapType);
    picked.push(a);
  }
  for (const a of byPriority) {
    if (picked.length >= MAX_ACTIONS) break;
    if (!picked.includes(a)) picked.push(a);
  }
  return picked;
}

/**
 * Build the pack model from a finished audit.
 *
 * REFUSES (throws PackEvidenceError) when:
 *   - no question was probed, or
 *   - no engine answered anything.
 * There is no fallback and no sample content. A pack must be a measurement.
 */
export function buildDesignPartnerPack(input: PackInput): PackModel {
  const company = String(input.company ?? "").trim();
  const domain = String(input.domain ?? "").trim();
  if (!company) throw new PackEvidenceError("company is required.");
  if (!domain) throw new PackEvidenceError("domain is required.");
  const findings = Array.isArray(input.findings) ? input.findings : [];
  if (findings.length === 0) {
    throw new PackEvidenceError(
      "No probe evidence. A design partner pack is a measurement — refusing to render an empty one."
    );
  }
  if (input.coverage.probed.length === 0) {
    throw new PackEvidenceError(
      "No engine answered. Refusing to render a pack that would imply we asked."
    );
  }

  const questions = new Set(findings.map((f) => f.question));
  const citedAnswers = findings.filter((f) => f.cited).length;

  const gaps: PackGapLine[] = findings
    .filter((f) => !f.cited)
    // The most useful row first, and "useful" means carrying the most evidence:
    // a named competitor beats none, and a named source beats none. A reader
    // who sees two rows reads the one that shows who won and where from.
    // Ties break on the question text so the pack is deterministic.
    .sort(
      (a, b) =>
        b.winners.length - a.winners.length ||
        b.sources.length - a.sources.length ||
        a.question.localeCompare(b.question)
    )
    .slice(0, MAX_GAP_ROWS)
    .map((f) => ({
      question: f.question,
      engine: f.engine,
      winners: f.winners.slice(0, 3),
      sources: f.sources.slice(0, 2),
      absent: f.absent === true,
    }));

  const wins: PackWinLine[] = findings
    .filter((f) => f.cited)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.question.localeCompare(b.question))
    .slice(0, MAX_WIN_ROWS)
    .map((f) => ({ question: f.question, engine: f.engine, rank: f.rank }));

  const actions = selectPackActions(input.actions ?? []).map((a) => toActionCard(a, input.language));
  const c = packCopy(input.language);

  return {
    company,
    domain,
    market: String(input.market ?? "").trim(),
    language: input.language,
    date: isoDate(input.generatedAt),
    methodologyVersion: String(input.methodologyVersion ?? "").trim(),
    coverage: input.coverage,
    questionsAsked: questions.size,
    answersRead: findings.length,
    citedAnswers,
    gaps,
    wins,
    actions,
    // Honest, not padded: no action means no action, and the pack says it.
    noGapFound: actions.length === 0,
    weeks: c.weeks,
    notPromised: c.notPromised,
    offer: c.offer,
    bookUrl: String(input.bookUrl ?? "").trim(),
    contactEmail: String(input.contactEmail ?? "").trim(),
  };
}

// ---------------------------------------------------------------------------
// 6. Render
// ---------------------------------------------------------------------------

/** Minimal, dependency-free HTML escaping. Prospect data is never trusted. */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
  :root { --ink:#0a0f0d; --muted:#5b6b64; --line:#d9e2dd; --accent:#0a0f0d; --bg:#ffffff; --soft:#f4f7f5; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:14px/1.5 "Schibsted Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .page { max-width: 820px; margin: 0 auto; padding: 32px 28px 40px; }
  h1 { font-size: 26px; line-height:1.15; letter-spacing:-0.02em; margin: 0 0 6px; }
  h2 { font-size: 15px; letter-spacing:0.04em; text-transform:uppercase; color:var(--muted);
       margin: 26px 0 8px; border-top:1px solid var(--line); padding-top:14px; }
  p  { margin: 0 0 8px; }
  .sub { color:var(--muted); margin-bottom:2px; }
  .meta { color:var(--muted); font-size:12px; }
  .summary { background:var(--soft); border-radius:8px; padding:12px 14px; margin:14px 0 4px; font-weight:600; }
  table { width:100%; border-collapse:collapse; margin:8px 0 4px; font-size:13px; }
  th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.04em;
       color:var(--muted); border-bottom:1px solid var(--line); padding:6px 8px 6px 0; font-weight:600; }
  td { border-bottom:1px solid var(--line); padding:7px 8px 7px 0; vertical-align:top; }
  td.q { font-weight:600; }
  .card { border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:6px;
          padding:10px 12px; margin:8px 0; }
  .card h3 { font-size:15px; margin:0 0 4px; }
  .card dl { margin:0; display:grid; grid-template-columns: auto 1fr; gap:2px 10px; font-size:12.5px; }
  .card dt { color:var(--muted); white-space:nowrap; }
  .card dd { margin:0; }
  ul { margin:4px 0 8px; padding-left:18px; }
  li { margin:2px 0; }
  .week { margin:0 0 10px; }
  .week strong { display:block; margin-bottom:2px; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:0 26px; }
  .cta { border:1px solid var(--line); border-radius:8px; padding:14px 16px; margin-top:18px; background:var(--soft); }
  .cta a.btn { display:inline-block; background:var(--accent); color:#fff; text-decoration:none;
               padding:9px 16px; border-radius:6px; font-weight:700; margin-top:6px; }
  .foot { color:var(--muted); font-size:11px; margin-top:22px; border-top:1px solid var(--line); padding-top:10px; }
  @media print { .page { padding:0; } h2 { break-after: avoid; } .card, table { break-inside: avoid; } }
  @media (max-width: 620px) { .cols { grid-template-columns:1fr; } }
`;

function gapRow(g: PackGapLine, c: CopyTable): string {
  const instead = g.absent
    ? c.absentLabel
    : g.winners.length > 0
      ? g.winners.join(", ")
      : c.nobodyLabel;
  const src = g.sources.length > 0 ? g.sources.join(", ") : c.noSourceLabel;
  return `<tr><td class="q">${esc(g.question)}</td><td>${esc(g.engine)}</td><td>${esc(instead)}</td><td>${esc(src)}</td></tr>`;
}

function actionCard(a: PackActionCard, c: CopyTable): string {
  return `<div class="card">
      <h3>${esc(a.headline)}</h3>
      <dl>
        <dt>${esc(c.becauseLabel)}</dt><dd>${esc(a.because)}</dd>
        <dt>${esc(c.artifactLabel)}</dt><dd>${esc(a.artifact)}</dd>
        <dt>${esc(c.acceptanceLabel)}</dt><dd>${esc(a.acceptance)}</dd>
        <dt>${esc(c.recheckLabel)}</dt><dd>${esc(a.recheckOn)}</dd>
        <dt>${esc(c.ownerLabel)}</dt><dd>${esc(c.ownerNames[a.owner])}</dd>
      </dl>
    </div>`;
}

/**
 * Render the pack as standalone HTML (print to PDF from the browser, or with
 * scripts/md-to-pdf.mjs's headless Chrome). Self-contained: no external CSS,
 * no fonts fetched, no scripts — it must open from a file:// URL on a laptop
 * with no network, in a meeting.
 */
export function renderDesignPartnerPackHtml(model: PackModel): string {
  const c = packCopy(model.language);
  const lang = model.language === "pt-BR" ? "pt-BR" : "en";

  const coverage: string[] = [c.coverageLine(model.coverage.probed)];
  if (model.coverage.blocked.length > 0) coverage.push(c.blockedLine(model.coverage.blocked));
  if (model.coverage.failed.length > 0) coverage.push(c.failedLine(model.coverage.failed));

  const gapsBlock =
    model.gaps.length > 0
      ? `<p>${esc(c.gapsIntro(model.company))}</p>
      <table><thead><tr>
        <th>${esc(c.colQuestion)}</th><th>${esc(c.colEngine)}</th>
        <th>${esc(c.colInstead)}</th><th>${esc(c.colSource)}</th>
      </tr></thead><tbody>${model.gaps.map((g) => gapRow(g, c)).join("")}</tbody></table>`
      : `<p>${esc(c.gapsEmpty)}</p>`;

  const winsBlock =
    model.wins.length > 0
      ? `<table><thead><tr>
        <th>${esc(c.colQuestion)}</th><th>${esc(c.colEngine)}</th><th>${esc(c.colRank)}</th>
      </tr></thead><tbody>${model.wins
        .map(
          (w) =>
            `<tr><td class="q">${esc(w.question)}</td><td>${esc(w.engine)}</td><td>${esc(w.rank ?? "-")}</td></tr>`
        )
        .join("")}</tbody></table>`
      : `<p>${esc(c.winsEmpty)}</p>`;

  const actionsBlock = model.noGapFound
    ? `<p>${esc(c.noGapLine)}</p>`
    : `<p>${esc(c.actionsIntro)}</p>${model.actions.map((a) => actionCard(a, c)).join("")}`;

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(c.packTitle(model.company))}</title>
<style>${STYLE}</style>
</head>
<body>
<main class="page">
  <h1>${esc(c.packTitle(model.company))}</h1>
  <p class="sub">${esc(c.subtitle(model.domain, model.market))}</p>
  <p class="meta">${esc(c.runLine(model.date, model.methodologyVersion))} ${coverage.map(esc).join(" ")}</p>

  <p class="summary">${esc(c.summaryLine(model.questionsAsked, model.answersRead, model.citedAnswers))}</p>

  <h2>${esc(c.gapsTitle)}</h2>
  ${gapsBlock}

  <h2>${esc(c.winsTitle)}</h2>
  ${winsBlock}

  <h2>${esc(c.actionsTitle)}</h2>
  ${actionsBlock}

  <h2>${esc(c.planTitle)}</h2>
  <p>${esc(c.planIntro)}</p>
  <div class="cols">
    ${model.weeks
      .map(
        (w) =>
          `<div class="week"><strong>${esc(w.label)}</strong><ul>${w.lines
            .map((l) => `<li>${esc(l)}</li>`)
            .join("")}</ul></div>`
      )
      .join("")}
  </div>

  <h2>${esc(c.notPromisedTitle)}</h2>
  <p>${esc(c.notPromisedIntro)}</p>
  <ul>${model.notPromised.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>

  <h2>${esc(c.offerTitle)}</h2>
  <ul>${model.offer.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>

  <div class="cta">
    <strong>${esc(c.ctaTitle)}</strong>
    <p>${esc(c.ctaLine)}</p>
    <a class="btn" href="${esc(model.bookUrl)}">${esc(c.ctaButton)}</a>
    <p class="meta" style="margin-top:8px">${esc(c.contactLine(model.contactEmail))}</p>
  </div>

  <p class="foot">${esc(c.footer)}</p>
</main>
</body>
</html>`;

  // Rule 3: the forbidden copy cannot ship. The lint sees everything WE wrote,
  // with the prospect's verbatim words removed — see lintablePackText.
  assertPackCopyClean(lintablePackText(model));
  return html;
}

/** Build and render in one call. Throws on missing evidence or banned copy. */
export function generateDesignPartnerPack(input: PackInput): { model: PackModel; html: string } {
  const model = buildDesignPartnerPack(input);
  return { model, html: renderDesignPartnerPackHtml(model) };
}

// ---------------------------------------------------------------------------
// 7. The bridge: one probe answer -> the two shapes the pack needs
// ---------------------------------------------------------------------------

/**
 * One engine answer as the generator collected it. This is the shape a recorded
 * fixture stores, which is what lets the whole pipeline be tested end to end
 * without calling (or paying) a single engine.
 */
export interface PackAnswer {
  /** The buyer question as probed. */
  question: string;
  /** Stable prompt id. Defaults to the question text when the caller has none. */
  promptId?: string;
  engine: string;
  /** 0-based repetition index within the run. */
  runIndex?: number;
  mentioned: boolean;
  cited: boolean;
  rank: number | null;
  competitors: string[];
  /** Full URLs the answer cited. Domains are derived for display. */
  citations: string[];
  sentiment?: ObservationSentiment;
  /** 0..1, or null/absent when the entity classifier did not run. NEVER 0 by default. */
  entityConfidence?: number | null;
  /** True when the surface produced no answer at all. */
  absent?: boolean;
  /** Pointer to the stored raw answer, when one was kept. */
  rawAnswerRef?: string | null;
  modelOrMode?: string | null;
}

export interface PackEvidenceMeta {
  auditId: string;
  market: string;
  locale: string;
  methodologyVersion: string;
}

export interface PackEvidence {
  findings: PackFinding[];
  observations: NormalizedObservation[];
}

/**
 * Convert probe answers into (a) the findings the pack shows a human and
 * (b) the NormalizedObservations the gap classifier consumes.
 *
 * `entityConfidence` is passed through as null when absent — never coerced to
 * 0. Reading "not measured" as "confused entity" would make every observation
 * an entity gap, which is rule 2 of the classifier.
 */
export function packEvidenceFromAnswers(
  answers: readonly PackAnswer[],
  meta: PackEvidenceMeta
): PackEvidence {
  const findings: PackFinding[] = [];
  const observations: NormalizedObservation[] = [];

  answers.forEach((a, ix) => {
    const promptId = a.promptId ?? a.question;
    const runIndex = a.runIndex ?? 0;
    findings.push({
      question: a.question,
      engine: a.engine,
      cited: a.cited === true,
      rank: a.rank ?? null,
      winners: Array.isArray(a.competitors) ? a.competitors : [],
      sources: (Array.isArray(a.citations) ? a.citations : []).map(sourceDomain).filter(Boolean),
      ...(a.absent === true ? { absent: true } : {}),
    });
    observations.push({
      auditId: meta.auditId,
      promptId,
      promptText: a.question,
      engine: a.engine,
      modelOrMode: a.modelOrMode ?? null,
      market: meta.market,
      locale: meta.locale,
      runIndex,
      mentioned: a.mentioned === true,
      mentionPosition: a.rank ?? null,
      cited: a.cited === true,
      citations: Array.isArray(a.citations) ? a.citations : [],
      competitors: Array.isArray(a.competitors) ? a.competitors : [],
      sentiment: a.sentiment ?? "unknown",
      entityConfidence: a.entityConfidence === undefined ? null : a.entityConfidence,
      falsePositive: false,
      ambiguityReason: null,
      rawAnswerRef: a.rawAnswerRef ?? `${meta.auditId}:${promptId}:${a.engine}:${runIndex}:${ix}`,
      latencyMs: null,
      cost: null,
      methodologyVersion: meta.methodologyVersion,
    });
  });

  return { findings, observations };
}
