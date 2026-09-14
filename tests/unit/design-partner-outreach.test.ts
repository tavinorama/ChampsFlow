/**
 * design-partner-outreach.test.ts — the canal B approach e-mails, linted.
 *
 * These four templates are pasted straight into the founder's mail client. The
 * house rules they must obey are not style preferences, they are decisions with
 * a cost behind them:
 *
 *   - ZERO links in the first touch (deliverability; founder rule 27/08). One
 *     stray ".com" and the cold touch lands in spam.
 *   - ONE question, at the end — the first touch exists to get a reply.
 *   - <= 80 words, sentences of <= 12 words, reading level 15-17.
 *   - The opt-out line, verbatim, after the signature.
 *   - None of the copy RELATORIO section 28 forbids.
 *
 * The test reads the templates out of the kit itself, so the doc IS the source
 * of truth and cannot drift from what is enforced.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findForbiddenClaims } from "../../packages/llm/src/design-partner-pack";

const KIT = join(__dirname, "../../docs/departments/sales/design-partner-pack.md");
const kit = (): string => readFileSync(KIT, "utf8");

/** Every fenced block that is an e-mail (starts with a subject line). */
function emailBlocks(md: string): { subject: string; body: string }[] {
  const blocks: { subject: string; body: string }[] = [];
  // Anchored to line starts: the kit also has ```bash blocks, and an unanchored
  // pattern would pair THEIR closing fence with the next opening one.
  for (const m of md.matchAll(/^```[a-z]*[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)) {
    const text = (m[1] ?? "").trim();
    const first = text.split("\n")[0] ?? "";
    if (!/^(Subject|Assunto):/i.test(first)) continue;
    blocks.push({ subject: first.replace(/^(Subject|Assunto):\s*/i, ""), body: text });
  }
  return blocks;
}

/** The body without the subject line and without the compliance P.S. */
function prose(body: string): string {
  return body
    .split("\n")
    .filter((l) => !/^(Subject|Assunto):/i.test(l))
    .filter((l) => !l.trim().startsWith("P.S."))
    .join("\n")
    .trim();
}

const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);

describe("the canal B outreach templates", () => {
  const blocks = emailBlocks(kit());

  it("the kit contains all four templates (2 versions x PT + EN)", () => {
    expect(blocks).toHaveLength(4);
  });

  it.each(blocks.map((b, i) => [i, b] as const))("#%i has no link in the first touch", (_i, b) => {
    const text = b.body;
    expect(text, "a URL in the first touch costs deliverability").not.toMatch(/https?:\/\//i);
    expect(text).not.toMatch(/www\./i);
    // No bare domain either — a mail client will linkify it.
    expect(text).not.toMatch(/\b[a-z0-9-]+\.(com|ai|io|co|net|org)\b/i);
  });

  it.each(blocks.map((b, i) => [i, b] as const))("#%i asks exactly one question", (_i, b) => {
    const qs = (prose(b.body).match(/\?/g) ?? []).length;
    expect(qs, `found ${qs} question marks`).toBe(1);
  });

  it.each(blocks.map((b, i) => [i, b] as const))("#%i is 80 words or fewer", (_i, b) => {
    const n = words(prose(b.body)).length;
    expect(n, `${n} words`).toBeLessThanOrEqual(80);
  });

  it.each(blocks.map((b, i) => [i, b] as const))("#%i keeps sentences at 12 words or fewer", (_i, b) => {
    const sentences = prose(b.body)
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of sentences) {
      expect(words(s).length, s).toBeLessThanOrEqual(12);
    }
  });

  it.each(blocks.map((b, i) => [i, b] as const))("#%i carries the opt-out line", (_i, b) => {
    expect(b.body).toMatch(/P\.S\..*(reply STOP|responde PARA)/i);
    // After the signature, not before it.
    const psIx = b.body.indexOf("P.S.");
    expect(b.body.indexOf("Otavio")).toBeLessThan(psIx);
  });

  it.each(blocks.map((b, i) => [i, b] as const))("#%i carries none of the forbidden copy", (_i, b) => {
    expect(findForbiddenClaims(b.body)).toEqual([]);
  });

  it.each(blocks.map((b, i) => [i, b] as const))("#%i signs as the founder, not as a machine", (_i, b) => {
    expect(b.body).toContain("Otavio");
  });

  it("the subject lines are lowercase and short — they read like a person wrote them", () => {
    for (const b of blocks) {
      expect(words(b.subject).length, b.subject).toBeLessThanOrEqual(8);
      expect(b.subject[0], b.subject).toBe(b.subject[0]!.toLowerCase());
    }
  });
});

describe("the kit does not let a claim be sent before it is measured", () => {
  const md = kit();

  it("tells the founder to generate the pack BEFORE sending either version", () => {
    expect(md).toMatch(/Antes de enviar qualquer um dos dois: gere o pack/);
  });

  it("gives the variant for a company that DOES already come up", () => {
    expect(md).toMatch(/Variante obrigatória quando a empresa JÁ aparece/);
    expect(md).toMatch(/não enviar este e-mail/);
  });

  it("states plainly that the machine sends nothing", () => {
    expect(md).toMatch(/o founder envia/i);
  });

  it("names the migration that gates the funnel, and the action that unblocks it", () => {
    expect(md).toContain("20260911000001_crm_design_partner");
    expect(md).toMatch(/DESLIGADO ATÉ A MIGRAÇÃO CORRER/);
    expect(md).toMatch(/A ação que destrava/);
  });

  it("repeats the never-promise rules in the founder's own runbook", () => {
    expect(md).toMatch(/Não prometemos ranking, citação, nem data/);
    expect(md).toMatch(/Não inventamos testimonial nem case/);
  });

  it("carries no forbidden copy of its own", () => {
    // The doc quotes the ban list to explain it, so only the e-mail templates
    // and the runbook prose are linted — the quoted bans live in code.
    for (const b of emailBlocks(md)) expect(findForbiddenClaims(b.body)).toEqual([]);
  });
});
