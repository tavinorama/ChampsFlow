/**
 * content-facts.ts — the [__facts__] block: true, dated, sourced things Ozvor
 * can write about. The raw material the content cells never had.
 *
 * Why (19/09): every channel started every day from the same five hardcoded
 * themes plus a mandatory "$49 every day" angle, and the LinkedIn "story" draft
 * asked for "a real scene at the start" while no real scene existed anywhere in
 * the prompt. The model did the only thing it could: it invented one. In the
 * week of 14–20/09 about 14 of 58 scheduled pieces opened with a made-up owner,
 * a shop and a closing hour (Rosa, Ana, Hugo, Sofia, Elena, Marisol), and at
 * least 5 told first-person stories about clients, neighbours and friends that
 * no system of ours knows. A company that sells "what AI says about you, with
 * evidence" cannot publish invented evidence.
 *
 * Rules of this file:
 *  - a fact is something WE measured or did, with where to check it;
 *  - no customer is named; an anonymised business is labelled as such;
 *  - a fact expires (`until`): stale numbers leave the block by themselves;
 *  - a fact is a SNAPSHOT (`asOf`), and says so in its own words. `until` only
 *    decides when it leaves; it does not keep the number true in the meantime.
 *    On 21/09 the cold-email fact still read "three replied, all three said
 *    no" while the same campaigns had nine replies and one yes. A number with
 *    no date reads as today's, so every fact carries its date and the block
 *    forbids retelling it as the present (P17);
 *  - a number names what it counts (`counts`): people are not e-mails, answers
 *    are not questions;
 *  - adding a fact is a reviewed PR, like adding a claim to the site.
 */

export interface ContentFact {
  id: string;
  /** What happened, in plain words, ready to be retold. Numbers included. */
  fact: string;
  /** Where a sceptic can check it. Internal is fine; "trust me" is not. */
  source: string;
  /** The honest lesson: what it means for a small business owner. */
  lesson: string;
  /** ISO date the numbers were read. The fact text must carry this date in words. */
  asOf: string;
  /** What the numbers count — the unit and the denominator, in plain words. */
  counts: string;
  /** ISO date after which the fact leaves the block. */
  until: string;
  /**
   * B5 (Codex D10–D12, 23/09). What kind of thing this is, so CODE can refuse
   * a piece that turns it into something else:
   *  - measured: we read it off a system;
   *  - did: something we changed or shipped;
   *  - scenario: a worked example on paper — never "savings" or "results";
   *  - third_party: someone else's experience — never "we"/"our".
   */
  evidenceType: "measured" | "did" | "scenario" | "third_party";
  /** Whose experience it is. Only "ozvor" may be told in the first person. */
  owner: "ozvor" | "third_party";
  /**
   * The figures that identify this fact inside a piece of text. When a piece
   * carries them, the piece is retelling THIS fact and its rules apply.
   */
  keyNumbers: readonly string[];
  /**
   * false = the fact is an observed difference with no experiment behind it;
   * a piece may say "we saw", never "because". Default true.
   */
  causalClaimAllowed?: boolean;
}

export const CONTENT_FACTS: readonly ContentFact[] = [
  {
    id: "impressions-2bn-was-27",
    fact:
      "In September 2026 our own dashboard said our LinkedIn page had 2.08 billion impressions. We had summed a running total 15 times. The real reach of a post was at most 27 impressions in 7 days.",
    source: "ops.agent_outcome, families linkedinpage_impressions vs linkedinpage_impressions_7d, read 2026-09-19",
    asOf: "2026-09-19",
    counts: "impressions per post over 7 days, read from the platform; the 2.08 billion was a running total added 15 times",
    lesson: "A big number on a dashboard is a claim until someone checks how it was added up. We quarantined ours.",
    until: "2026-11-30",
    evidenceType: "measured",
    owner: "ozvor",
    keyNumbers: ["2.08", "27"],
  },
  {
    id: "score-52-was-15-of-102",
    fact:
      "On 14 September 2026 our own AI visibility index read 52. People read that as 'named in half the answers'. We were named in 15 of the 102 answers collected that day, about 15 percent. We changed the screen to show the share first.",
    source: "Ozvor audit of 2026-09-14; packages/llm/src/scoring.ts weights; dashboard change of 2026-09-19",
    asOf: "2026-09-14",
    counts: "answers collected in one audit (each question asked to each engine more than once), not questions and not buyers",
    lesson: "Ask any AI-visibility tool for the numerator and the denominator, not the score.",
    until: "2026-11-30",
    evidenceType: "measured",
    owner: "ozvor",
    keyNumbers: ["52", "102"],
  },
  {
    id: "cold-483-first-three-days",
    fact:
      "In the first three days of a cold campaign, 17 to 19 September 2026, we emailed 483 people. Three replied, and all three said no. Fifteen bounced: only 2 were dead addresses, 7 were spam or policy filters at the recipient. Two days later, by 21 September, 684 people had been emailed and 9 had replied. One of them said yes, check my business.",
    source: "smartlead_event, campaigns 3975169 and 3975170: read 2026-09-19 (483 sent, 3 replies, 15 bounces) and 2026-09-21 (684 people, 9 replies, 20 bounces)",
    asOf: "2026-09-21",
    counts: "people emailed (one person counts once, however many follow-ups they got); replies and bounces are people too",
    lesson: "When cold email fails, read the bounce reasons before you blame the list or buy more leads.",
    until: "2026-10-31",
    evidenceType: "measured",
    owner: "ozvor",
    keyNumbers: ["483", "684"],
  },
  {
    id: "ten-local-businesses-four-engines",
    fact:
      "On 17 September 2026 we asked four AI engines ten buyer questions about each of ten local businesses, about 40 answers each. The share of answers naming the business ran from 15 percent to 62 percent. Businesses are anonymised.",
    source: "design-partner packs generated 2026-09-17 (39–40 answers each; one Perplexity rate-limit gap is stated in the pack)",
    asOf: "2026-09-17",
    counts: "answers per business (10 questions x 4 engines), share of those answers that name the business",
    lesson: "Two businesses in the same trade and city can sit 4x apart in what AI says. It is measurable per question.",
    until: "2026-10-31",
    evidenceType: "measured",
    owner: "ozvor",
    keyNumbers: ["15", "62"],
    // We saw a spread. We did not test what causes it. "Because their
    // description is better" is a guess a piece may not sell as a finding.
    causalClaimAllowed: false,
  },
  {
    id: "two-tools-one-chore",
    fact:
      "Until 19 September 2026 our own AI tool audit added up the hours saved by every tool it recommended. Two tools for the same chore counted that chore twice: 24 hours a week on paper, 8 once the overlap was removed.",
    source: "apps/api/src/lib/ai-audit/engine.ts, change of 2026-09-19 (deOverlappedHours)",
    asOf: "2026-09-19",
    counts: "hours per week in our own test case, on paper; a scenario, not time a client saved",
    lesson: "Before buying another AI tool, check it does not save the same hour your last tool already saved.",
    until: "2026-11-30",
    // A worked example from our own engine, on paper. A piece that says
    // "saved 16 hours" is selling a scenario as a result (D11).
    evidenceType: "scenario",
    owner: "ozvor",
    keyNumbers: ["24", "8"],
  },
  {
    id: "a-citation-is-not-our-work",
    fact:
      "Until 19 September 2026 our product marked a recommendation 'verified, worked' when a later audit found the citation, even if nobody had done the work. We changed it: no execution, no credit.",
    source: "packages/llm/src/visibility-loop.ts, change of 2026-09-19",
    asOf: "2026-09-19",
    counts: "no number: a rule of our product, before and after the change",
    lesson: "AI answers move on their own. A vendor who takes credit for every good week will blame you for every bad one.",
    until: "2026-11-30",
    evidenceType: "did",
    owner: "ozvor",
    keyNumbers: [],
  },
];

/** The facts still in force on `now` — the same set the block renders. */
export function liveFacts(now: Date, facts: readonly ContentFact[] = CONTENT_FACTS): ContentFact[] {
  const today = now.toISOString().slice(0, 10);
  return facts.filter((f) => f.until >= today);
}

/** The block injected as [__facts__]. Null when every fact has expired: absent, never a placeholder. */
export function factsBlock(now: Date, facts: readonly ContentFact[] = CONTENT_FACTS): string | null {
  const today = now.toISOString().slice(0, 10);
  const live = facts.filter((f) => f.until >= today);
  if (live.length === 0) return null;
  return [
    "FATOS VERDADEIROS DA OZVOR (medidos ou feitos por nos; cada um diz onde conferir). Sao a UNICA fonte permitida de cena, caso e numero em 1a pessoa.",
    "Escolha UM por peca e nao repita um fato que ja aparece no bloco [__recent__]. Conte o fato como ele e: nao aumente, nao troque numero, nao invente cliente, vizinho, amigo, conversa, loja nem hora.",
    "Cada fato e uma FOTO com data. Se usar um numero, diga a data dele na peca (ou o mes). NUNCA conte um fato como o estado de hoje ('we have', 'right now', 'so far'): o numero pode ja ter mudado. Diga o que o numero conta, nas palavras de 'conta:'.",
    "Um fato marcado CENARIO e uma conta no papel: diga 'no papel', 'em cenario' ou 'no nosso teste'; nunca 'economizou', 'poupou' ou 'resultado'. Um fato marcado TERCEIRO e experiencia de outra empresa: nomeie-a; nunca 'nos', 'nosso', 'we', 'our'. Um fato marcado SEM-CAUSA e uma diferenca observada: 'vimos', nunca 'porque'. O finalize e RECUSADO por codigo se quebrar uma destas.",
    ...live.map((f) => `- [${f.id}] (lido em ${f.asOf}${f.evidenceType === "scenario" ? "; CENARIO, no papel" : ""}${f.owner === "third_party" ? "; TERCEIRO" : ""}${f.causalClaimAllowed === false ? "; SEM-CAUSA" : ""}) ${f.fact} LICAO: ${f.lesson} (conta: ${f.counts}) (fonte: ${f.source})`),
  ].join("\n");
}
