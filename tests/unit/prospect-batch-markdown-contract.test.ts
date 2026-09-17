/**
 * prospect-batch-markdown-contract.test.ts — the weekly batch of 16/09 died
 * three times on "nenhum bloco '=== PROSPECT: ... ===' encontrado no lote"
 * with a real verified block upstream (5,331 chars; 09/09 had 5,528 chars and
 * five verified prospects). Draft and critic succeeded; the finalize lost the
 * contract at column 0, and the failure summary kept nothing of what came
 * back — the artifact lives in Redis and was gone by the time anyone looked.
 *
 * What these tests hold:
 *   1. the line markers tolerate the markdown a model wraps around them
 *      (headings, bold, blockquote, code fences) — the batch is still read;
 *   2. the CONTENT rules are untouched: a link in EMAIL 1 still fails, decorated
 *      or not;
 *   3. prose with no contract still fails;
 *   4. the failure summary names what came back, with e-mails masked.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  splitProspectSequences,
  validateColdSequenceBatch,
  describeOutputShape,
  EMPTY_BATCH_SENTINEL,
} from "../../apps/api/src/lib/prospecting";

const PLAIN = [
  "=== PROSPECT: Acme Roofing ===",
  "[EMAIL 1]",
  "SUBJECT: quick question about your roofing site",
  "Hi. I checked your site this week. It tells ChatGPT's crawler to stay out. Was that on purpose?",
  "Otavio",
  "[EMAIL 2]",
  "SUBJECT: the fix takes one file",
  "That crawler block hides you from AI answers. I wrote up the fix. See it here: https://ozvor.com/?from=cold-2026-09-02",
  "Otavio",
  "[EMAIL 3]",
  "SUBJECT: last note from me",
  "Closing the loop. The free test stays open: https://ozvor.com/test?from=cold-2026-09-02. Door is open.",
  "Otavio",
].join("\n");

/** The same batch, the way a model decorates it. */
const DECORATED = [
  "Here is the final batch:",
  "",
  "```",
  "## === PROSPECT: Acme Roofing ===",
  "**[EMAIL 1]**",
  "**SUBJECT:** quick question about your roofing site",
  "Hi. I checked your site this week. It tells ChatGPT's crawler to stay out. Was that on purpose?",
  "Otavio",
  "**[EMAIL 2]**",
  "**SUBJECT:** the fix takes one file",
  "That crawler block hides you from AI answers. I wrote up the fix. See it here: https://ozvor.com/?from=cold-2026-09-02",
  "Otavio",
  "  [EMAIL 3]  ",
  "> SUBJECT: last note from me",
  "Closing the loop. The free test stays open: https://ozvor.com/test?from=cold-2026-09-02. Door is open.",
  "Otavio",
  "```",
].join("\n");

describe("the contract markers tolerate markdown decoration", () => {
  it("the plain contract parses exactly as before", () => {
    const seqs = splitProspectSequences(PLAIN);
    expect(seqs).toHaveLength(1);
    expect(seqs[0]!.prospect).toBe("Acme Roofing");
    expect(seqs[0]!.emails.map((e) => e.index)).toEqual([1, 2, 3]);
    expect(seqs[0]!.emails[0]!.subject).toBe("quick question about your roofing site");
    expect(validateColdSequenceBatch(PLAIN)).toEqual({ ok: true, errors: [] });
  });

  it("a decorated batch is the same batch: name, three e-mails, subjects, bodies", () => {
    const plain = splitProspectSequences(PLAIN);
    const decorated = splitProspectSequences(DECORATED);
    expect(decorated).toHaveLength(1);
    expect(decorated[0]!.prospect).toBe("Acme Roofing");
    expect(decorated[0]!.emails.map((e) => e.index)).toEqual([1, 2, 3]);
    expect(decorated[0]!.emails.map((e) => e.subject)).toEqual(plain[0]!.emails.map((e) => e.subject));
    expect(decorated[0]!.emails[0]!.body).toBe(plain[0]!.emails[0]!.body);
    expect(validateColdSequenceBatch(DECORATED)).toEqual({ ok: true, errors: [] });
  });

  it("the content rules did not move: a link in EMAIL 1 still fails, decorated or not", () => {
    const bad = DECORATED.replace("Was that on purpose?", "Was that on purpose? See https://ozvor.com for details.");
    expect(validateColdSequenceBatch(bad).ok).toBe(false);
  });

  it("prose with no contract still fails with the same error", () => {
    const v = validateColdSequenceBatch("I reviewed the critique and the batch looks good. No changes needed.");
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toContain("nenhum bloco '=== PROSPECT: ... ==='");
  });

  it("an honest empty batch stays valid, fenced or bold", () => {
    expect(validateColdSequenceBatch(`${EMPTY_BATCH_SENTINEL} — 0 de 5.`).ok).toBe(true);
    expect(validateColdSequenceBatch(`**${EMPTY_BATCH_SENTINEL}** — 0 de 5.`).ok).toBe(true);
    expect(validateColdSequenceBatch("```\n" + EMPTY_BATCH_SENTINEL + " — 0 de 5.\n```").ok).toBe(true);
  });
});

describe("a refusal names what came back", () => {
  it("size + first non-empty line, e-mails masked, capped", () => {
    const shape = describeOutputShape("\n\nSure — contact jane.doe@acme-roofing.com about this. " + "x".repeat(300));
    expect(shape).toMatch(/^saida \d+ chars, 1a linha: "/);
    expect(shape).toContain("<email>");
    expect(shape).not.toContain("jane.doe@");
    expect(shape.length).toBeLessThan(140);
  });

  it("the runner writes it into the failed step's summary", () => {
    const runner = readFileSync(join(__dirname, "../../apps/api/src/lib/graph-runner.ts"), "utf8");
    expect(runner).toContain("describeOutputShape(res.output)");
    expect(runner).toMatch(/validador cold-email reprovou: .*describeOutputShape/s);
  });
});
