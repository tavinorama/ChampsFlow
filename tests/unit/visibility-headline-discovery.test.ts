/**
 * visibility-headline-discovery.test.ts — P07 (Lote A, 21/09).
 *
 * The production case: audit 330753a2 read "named in 6 of 65". All 6 came from
 * the 2 questions that say "Ozvor"; the 11 that do not were 0 of 55. The hero
 * must say the second number first.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  splitByBrandMention,
  discoveryLines,
  type HeadlineIntentRow,
} from "../../apps/web/src/lib/visibility-headline";

const row = (label: string | null, n: number, named: number): HeadlineIntentRow => ({
  label,
  overall: { n, citationRate: n > 0 ? named / n : 0 },
});

const PANEL_21_09: HeadlineIntentRow[] = [
  row("What is Ozvor and what does it measure?", 5, 3),
  row("How does Ozvor compare with other AI visibility trackers?", 5, 3),
  ...[
    "Which tools track how a brand appears in AI search answers?",
    "How can an agency report AI search visibility to its clients?",
    "What is the best way to monitor brand mentions inside ChatGPT and Perplexity?",
    "Generative engine optimization compared with traditional SEO: which platforms cover both?",
    "How does a local service business get recommended by AI assistants?",
    "Which AI visibility platforms do marketers actually trust for reporting?",
    "Como medir se uma marca aparece nas respostas do ChatGPT e do Perplexity?",
    "Which GDPR-compliant tools measure brand visibility in AI assistants for EU companies?",
    "Why does Google AI Overview cite some sources and ignore others?",
    "Does an llms.txt file change whether AI assistants cite a website?",
    "How do small businesses choose which AI tools to actually adopt?",
  ].map((q) => row(q, 5, 0)),
];

describe("splitByBrandMention", () => {
  it("reproduces 21/09: 0 of 55 without the name, 6 of 10 with it", () => {
    const s = splitByBrandMention(PANEL_21_09, "Ozvor")!;
    expect(s.discovery).toEqual({ named: 0, answers: 55, questions: 11 });
    expect(s.branded).toEqual({ named: 6, answers: 10, questions: 2 });
    expect(s.unplaced).toBe(0);
  });

  it("matches the brand as a word, case-insensitive, and not inside another word", () => {
    const s = splitByBrandMention(
      [row("is OZVOR any good?", 4, 2), row("best ozvorian tools", 4, 1), row("Acme (ozvor) review", 4, 1)],
      "Ozvor"
    )!;
    expect(s.branded.questions).toBe(2);
    expect(s.discovery.questions).toBe(1);
  });

  it("a brand name with regex characters is matched literally", () => {
    const s = splitByBrandMention([row("is A+ Plumbing (NY) open?", 3, 1), row("best plumber in NY", 3, 0)], "A+ Plumbing (NY)")!;
    expect(s.branded.questions).toBe(1);
    expect(s.discovery.questions).toBe(1);
  });

  it("a row with no question text is never guessed onto a side — it is counted as unplaced", () => {
    const s = splitByBrandMention([row(null, 5, 2), row("  ", 5, 1), row("best crm", 5, 0)], "Ozvor")!;
    expect(s.unplaced).toBe(2);
    expect(s.discovery).toEqual({ named: 0, answers: 5, questions: 1 });
  });

  it("no brand name, no rows, or nothing measured → null: no sentence beats a sentence about nothing", () => {
    expect(splitByBrandMention(PANEL_21_09, "")).toBeNull();
    expect(splitByBrandMention(PANEL_21_09, undefined)).toBeNull();
    expect(splitByBrandMention([], "Ozvor")).toBeNull();
    expect(splitByBrandMention([row("best crm", 0, 0), { label: "x", overall: null }], "Ozvor")).toBeNull();
  });
});

describe("discoveryLines", () => {
  it("says discovery first, and labels the branded share as recognition", () => {
    const l = discoveryLines(splitByBrandMention(PANEL_21_09, "Ozvor"));
    expect(l.discovery).toBe("When the question does not say your name: named in 0 of 55 answers (11 questions, each asked more than once per engine).");
    expect(l.branded).toBe(
      "When the question already says your name: named in 6 of 10 answers (2 questions). That is recognition, not discovery."
    );
    expect(l.note).toBeNull();
  });

  it("a panel with no branded question prints only the discovery line; singular is singular", () => {
    const l = discoveryLines(splitByBrandMention([row("best crm", 5, 1)], "Ozvor"));
    expect(l.discovery).toBe("When the question does not say your name: named in 1 of 5 answers (1 question, each asked more than once per engine).");
    expect(l.branded).toBeNull();
  });

  it("unplaced rows are reported, not hidden", () => {
    const l = discoveryLines(splitByBrandMention([row(null, 5, 2), row("best crm", 5, 0)], "Ozvor"));
    expect(l.note).toBe("1 question with no stored text is left out of both lines.");
  });

  it("null split → nothing to print", () => {
    expect(discoveryLines(null)).toEqual({ discovery: null, branded: null, note: null });
  });
});

describe("the dashboard hero uses it, above the mixed share", () => {
  const page = readFileSync(join(__dirname, "../../apps/web/src/app/dashboard-v3/page.tsx"), "utf8");
  it("renders discoveryLines(splitByBrandMention(intents, brandName)) before citationRateLine", () => {
    const at = page.indexOf("discoveryLines(splitByBrandMention(intents, brandName))");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(page.indexOf("{citationRateLine(citationCI) && ("));
  });
  it("the footnote names its grain (pairs) and says 'named in', which is what is measured", () => {
    expect(page).toContain("pairsMeasuredLine(confidence.checks, confidence.citations)");
    expect(page).not.toContain("— cited in ${confidence.citations}.");
    expect(page).not.toMatch(/Measured over \$\{confidence\.checks\} checks/);
  });
});
