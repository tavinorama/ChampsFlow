/**
 * SERP adapter — "no AI Overview" is an ABSENT surface, not a missed mention.
 *
 * THE BUG THESE PIN, which was live for three days:
 * When Google shows no AI Overview for a query, the adapter returns a readable
 * sentinel ("no AI Overview block returned in this snapshot") rather than an
 * empty string. Every emptiness check downstream is `trim().length === 0`, so
 * that sentinel counted as a USABLE run in which the engine failed to name a
 * brand it should have named.
 *
 * The control battery — whose entire job is catching engines that stop naming
 * dominant brands — read Google's editorial choice about which queries deserve
 * an overview as our engine degrading. Positive controls fell to 0.33 against a
 * 0.50 floor and the engine was paused. Nothing was wrong with the engine; the
 * measurement was wrong, and it removed a working engine from customers' panels.
 *
 * The distinction is deliberately NOT applied everywhere. In an audit, "Google
 * showed no AI Overview" is the customer's true answer — they really are not
 * cited in an overview that does not exist — so `mentioned` stays false there.
 * It is only the battery, asking "is this engine still behaving", for which an
 * absent surface is evidence of nothing at all.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SERP_SRC = readFileSync(
  join(__dirname, "../../../packages/llm/src/providers/serp.ts"),
  "utf-8"
);
const DRIFT_SRC = readFileSync(
  join(__dirname, "../../../apps/worker/src/jobs/drift-control.ts"),
  "utf-8"
);

describe("serp adapter — absent vs not-mentioned", () => {
  it("derives absent from extractable TEXT, not from the block's mere existence", () => {
    // Layer 2 of the same bug: Google serves most overviews asynchronously, so
    // the block arrives as an empty shell unless load_async_ai_overview is
    // sent. A block-existence check calls that shell "present" and scores
    // "(no extractable text)" as an answer — which production did for weeks.
    expect(SERP_SRC).toMatch(/const hasText = !!aio && parts\.some/);
    expect(SERP_SRC).toMatch(/const absent = !hasText/);
    expect(SERP_SRC).toMatch(/load_async_ai_overview:\s*true/);
  });

  it("never runs the citation parser on a sentinel — the query echo was a live false positive", () => {
    // The "no block" sentinel echoes the customer's own question. On 20/07 the
    // parser found the brand IN THE ECHOED QUESTION and recorded the only serp
    // cited=true in history. Gating the parse on !absent kills that class.
    expect(SERP_SRC).toMatch(/absent \? null : parseCitation/);
    expect(SERP_SRC).toMatch(/parsed\?\.mentioned \?\? false/);
  });

  it("keeps returning the human-readable sentinel, so evidence stays explainable", () => {
    // The string is what a support conversation quotes back. Replacing it with
    // "" would make absent runs indistinguishable from a broken adapter.
    expect(SERP_SRC).toMatch(/no AI Overview block returned in this snapshot/);
  });
});

describe("drift battery — an absent surface is not evidence", () => {
  it("the gateway caller converts absent into null before the battery sees it", () => {
    // null lands in the battery's own vocabulary: an empty run, excluded from
    // usableRuns, counted in neither numerator nor denominator.
    expect(DRIFT_SRC).toMatch(/if\s*\(probe\?\.absent\)\s*return null;/);
  });

  it("reads the flag rather than sniffing the sentinel text", () => {
    // A battery that string-matched the message would silently start counting
    // absent runs as failures again the first time the wording changed.
    //
    // The assertion is on STRING LITERALS, not on the words appearing at all —
    // the comment above the fix necessarily quotes the sentinel to explain what
    // went wrong, and a test that banned the phrase outright would forbid its
    // own explanation. Written the naive way first, and it failed on that.
    // Comments are stripped FIRST. Prose about the bug quotes the sentinel — as
    // the comment beside the fix does — and a literal-scan over raw source
    // reads those quotation marks as code. Written without the strip first, and
    // it flagged its own explanation.
    const code = DRIFT_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const literals = code.match(/(["'`])(?:\\.|(?!\1).)*\1/g) ?? [];
    const sniffing = literals.filter((l) => /AI Overview/i.test(l));
    expect(sniffing).toEqual([]);
  });
});
