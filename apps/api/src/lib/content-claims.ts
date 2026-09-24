/**
 * content-claims.ts — B5 (Codex D10, D11, D12 — 23/09). The gate a marketing
 * piece passes BEFORE it reaches the approval box.
 *
 * What happened. The facts library said "24 hours a week on paper, 8 once
 * the overlap was removed"; a piece called it 8 hours saved. A blog post
 * about another company's ad spend became "Our ChatGPT bill" in the X
 * announce. A spread we observed (15% vs 62%) was explained as "because of
 * the description", which nobody tested. Every one of those was forbidden
 * in a prompt. A prompt is a request; this file is the refusal.
 *
 * What it checks is decidable from data we hold, nothing more:
 *  1. a SCENARIO fact retold as a result (its numbers without a scenario word);
 *  2. a THIRD-PARTY fact, or any spend/bill/test, told as ours without an
 *     Ozvor-owned fact behind the number;
 *  3. a fact marked "no causal claim" retold with a cause;
 *  4. invented people: a client who texted, a neighbour, a friend, a named
 *     owner closing a shop — the phrases the 14–20/09 pieces used.
 *
 * It does not judge tone, truth of general knowledge or quality. Those stay
 * with the critic and the founder.
 */
import type { ContentFact } from "./content-facts";

export type ClaimProblemCode =
  | "scenario_as_result"
  | "third_party_as_ours"
  | "correlation_as_cause"
  | "invented_person";

export interface ClaimProblem {
  code: ClaimProblemCode;
  /** The fact it violates, when there is one. */
  factId?: string;
  /** The exact text that tripped it, short, for the step summary. */
  detail: string;
}

export interface ClaimCheck {
  ok: boolean;
  problems: ClaimProblem[];
}

const SCENARIO_WORDS =
  /\b(on paper|scenario|hypothetical|worked example|in our (own )?test|test case|before we fixed|used to add up|added up the hours|no papel|em cen[aá]rio|no nosso teste|hipot[eé]tic[oa])\b/i;

const RESULT_WORDS = /\b(saved|saves|saving|savings|freed up|cut (its|their|his|her) (hours|time)|got back|economizou|poupou|ganhou de volta)\b/i;

const CAUSE_WORDS = /\b(because|the reason|that's why|that is why|thanks to|due to|caused by|explains why|is why|porque|por causa|gra[cç]as a|explica por que)\b/i;

/** First-person ownership of a spend, bill, test or result. */
const OURS_WORDS =
  /\b(we|we've|we have|we'd)\s+(spent|paid|bought|burned|blew|ran|tested|tried)\b|\bour\s+(chatgpt|openai|ai|ad|ads|advertising)?\s*(bill|spend|budget|invoice|test|experiment|campaign)\b|\b(nós|a gente)\s+(gastamos|pagamos|compramos|testamos)\b|\bnoss[oa]\s+(conta|gasto|or[cç]amento|teste|campanha)\b/i;

/** The phrases the invented pieces of 14–20/09 used. A client of ours is a fact; these are not in any fact. */
const INVENTED_PEOPLE =
  /\b(a client (texted|called|emailed|messaged|told|asked) (me|us)|one of (my|our) clients (texted|called|emailed|said|told)|my (neighbou?r|neighbor)|a friend of mine|a friend (who|that) (owns|runs)|(she|he) was closing (her|his) (shop|bakery|store|salon)|(rosa|ana|hugo|sofia|elena|marisol) (was|had|runs|owns|closed)|um cliente (me|nos) (mandou|ligou|escreveu|disse)|minha vizinha|meu vizinho|um amigo meu)\b/i;

/** A number token as it appears in prose: 483, 2.08, 15%, $500, 1,250. */
function hasNumber(text: string, n: string): boolean {
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\d.,])${esc}(?=[^\\d]|$)`).test(text);
}

function hasAllNumbers(text: string, nums: readonly string[]): boolean {
  return nums.length > 0 && nums.every((n) => hasNumber(text, n));
}

function hasAnyNumber(text: string, nums: readonly string[]): boolean {
  return nums.some((n) => hasNumber(text, n));
}

function snippet(text: string, re: RegExp): string {
  const m = re.exec(text);
  if (!m) return "";
  const at = m.index;
  return text.slice(Math.max(0, at - 40), Math.min(text.length, at + m[0].length + 40)).replace(/\s+/g, " ").trim();
}

export function validateContentClaims(text: string, facts: readonly ContentFact[]): ClaimCheck {
  const problems: ClaimProblem[] = [];
  // Links are addresses, not assertions.
  const prose = text.replace(/https?:\/\/\S+/g, " ");

  // 4. Invented people — independent of any fact.
  if (INVENTED_PEOPLE.test(prose)) {
    problems.push({ code: "invented_person", detail: snippet(prose, INVENTED_PEOPLE) });
  }

  for (const f of facts) {
    // 1. Scenario told as a result.
    if (f.evidenceType === "scenario" && hasAllNumbers(prose, f.keyNumbers)) {
      if (!SCENARIO_WORDS.test(prose) || RESULT_WORDS.test(prose)) {
        problems.push({
          code: "scenario_as_result",
          factId: f.id,
          detail: RESULT_WORDS.test(prose) ? snippet(prose, RESULT_WORDS) : `${f.keyNumbers.join("/")} without a scenario word`,
        });
      }
    }
    // 2. Someone else's experience told as ours.
    if (f.owner === "third_party" && hasAnyNumber(prose, f.keyNumbers) && OURS_WORDS.test(prose)) {
      problems.push({ code: "third_party_as_ours", factId: f.id, detail: snippet(prose, OURS_WORDS) });
    }
    // 3. An observed difference sold as a cause.
    if (f.causalClaimAllowed === false && hasAllNumbers(prose, f.keyNumbers) && CAUSE_WORDS.test(prose)) {
      problems.push({ code: "correlation_as_cause", factId: f.id, detail: snippet(prose, CAUSE_WORDS) });
    }
  }

  // 2b. A first-person spend/bill/test with no Ozvor-owned fact behind ANY
  // number in the piece. "Our ChatGPT bill: $500" about someone else's story.
  if (OURS_WORDS.test(prose)) {
    const ours = facts.filter((f) => f.owner === "ozvor" && f.evidenceType !== "scenario");
    const licensed = ours.some((f) => hasAnyNumber(prose, f.keyNumbers));
    const alreadyFlagged = problems.some((p) => p.code === "third_party_as_ours");
    if (!licensed && !alreadyFlagged) {
      problems.push({ code: "third_party_as_ours", detail: snippet(prose, OURS_WORDS) });
    }
  }

  return { ok: problems.length === 0, problems };
}

/** One line for the failed step's summary. */
export function describeClaimProblems(check: ClaimCheck): string {
  return check.problems
    .slice(0, 3)
    .map((p) => `${p.code}${p.factId ? `[${p.factId}]` : ""}: «${p.detail.slice(0, 90)}»`)
    .join(" · ");
}
