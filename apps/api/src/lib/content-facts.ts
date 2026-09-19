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
  /** ISO date after which the fact leaves the block. */
  until: string;
}

export const CONTENT_FACTS: readonly ContentFact[] = [
  {
    id: "impressions-2bn-was-27",
    fact:
      "Our own dashboard once said our LinkedIn page had 2.08 billion impressions. We had summed a running total 15 times. The real reach of a post was at most 27 impressions in 7 days.",
    source: "ops.agent_outcome, families linkedinpage_impressions vs linkedinpage_impressions_7d, read 2026-09-19",
    lesson: "A big number on a dashboard is a claim until someone checks how it was added up. We quarantined ours.",
    until: "2026-11-30",
  },
  {
    id: "score-52-was-15-of-102",
    fact:
      "Our own AI visibility index read 52. People read that as 'named in half the answers'. The measured share was 15 of 102 checks, about 15 percent. We changed the screen to show the share first.",
    source: "Ozvor audit of 2026-09-14; packages/llm/src/scoring.ts weights; dashboard change of 2026-09-19",
    lesson: "Ask any AI-visibility tool for the numerator and the denominator, not the score.",
    until: "2026-11-30",
  },
  {
    id: "cold-483-three-replies-all-no",
    fact:
      "We sent 483 cold emails in three days. Three people replied. All three said no. Of 15 bounces, only 2 were dead addresses; 7 were spam or policy filters at the recipient.",
    source: "smartlead_event, campaigns 3975169 and 3975170, 2026-09-17 to 2026-09-19",
    lesson: "When cold email fails, read the bounce reasons before you blame the list or buy more leads.",
    until: "2026-10-31",
  },
  {
    id: "ten-local-businesses-four-engines",
    fact:
      "We asked four AI engines ten buyer questions about each of ten local businesses, about 40 answers each. The share of answers naming the business ran from 15 percent to 62 percent. Businesses are anonymised.",
    source: "design-partner packs generated 2026-09-17 (39–40 answers each; one Perplexity rate-limit gap is stated in the pack)",
    lesson: "Two businesses in the same trade and city can sit 4x apart in what AI says. It is measurable per question.",
    until: "2026-10-31",
  },
  {
    id: "two-tools-one-chore",
    fact:
      "Our own AI tool audit used to add up the hours saved by every tool it recommended. Two tools for the same chore counted that chore twice: 24 hours a week on paper, 8 once the overlap was removed.",
    source: "apps/api/src/lib/ai-audit/engine.ts, change of 2026-09-19 (deOverlappedHours)",
    lesson: "Before buying another AI tool, check it does not save the same hour your last tool already saved.",
    until: "2026-11-30",
  },
  {
    id: "a-citation-is-not-our-work",
    fact:
      "Our product used to mark a recommendation 'verified, worked' when a later audit found the citation, even if nobody had done the work. We changed it: no execution, no credit.",
    source: "packages/llm/src/visibility-loop.ts, change of 2026-09-19",
    lesson: "AI answers move on their own. A vendor who takes credit for every good week will blame you for every bad one.",
    until: "2026-11-30",
  },
];

/** The block injected as [__facts__]. Null when every fact has expired: absent, never a placeholder. */
export function factsBlock(now: Date, facts: readonly ContentFact[] = CONTENT_FACTS): string | null {
  const today = now.toISOString().slice(0, 10);
  const live = facts.filter((f) => f.until >= today);
  if (live.length === 0) return null;
  return [
    "FATOS VERDADEIROS DA OZVOR (medidos ou feitos por nos; cada um diz onde conferir). Sao a UNICA fonte permitida de cena, caso e numero em 1a pessoa.",
    "Escolha UM por peca e nao repita um fato que ja aparece no bloco [__recent__]. Conte o fato como ele e: nao aumente, nao troque numero, nao invente cliente, vizinho, amigo, conversa, loja nem hora.",
    ...live.map((f) => `- [${f.id}] ${f.fact} LICAO: ${f.lesson} (fonte: ${f.source})`),
  ].join("\n");
}
