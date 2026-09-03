/**
 * editorial-leak.test.ts — P0-04.
 *
 * The incident: a public LinkedIn post went out carrying its own drafting
 * scaffolding — a "Claim-basis (nota interna)" line, a research-file reference,
 * an owner field, and the instruction "link no 1º comentário".
 *
 * Two things are tested here: that every marker the report names is caught, and
 * — just as important — that ordinary marketing copy is NOT caught. A validator
 * with false positives gets bypassed, and a bypassed validator is worse than
 * none because it also carries the illusion of protection.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  checkEditorialLeaks,
  describeEditorialLeaks,
} from "../../packages/shared/src/editorial-leak";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("P0-04 — editorial leak guard", () => {
  it("catches the real post that leaked", () => {
    // Reconstructed from the shapes the report describes, not the live copy.
    const post = [
      "AI search is rewriting how buyers pick a supplier.",
      "",
      "Claim-basis (nota interna): research/geo-2026-sources.md",
      "Owner: growth",
      "",
      "Link no 1º comentário 👇",
    ].join("\n");

    const r = checkEditorialLeaks(post);
    expect(r.ok).toBe(false);
    const ids = r.matches.map((m) => m.id).sort();
    expect(ids).toEqual([
      "claim_basis",
      "first_comment_instruction",
      "internal_note_pt",
      "owner_field",
    ]);
  });

  it("catches every marker the report lists, individually", () => {
    const cases: Array<[string, string]> = [
      ["claim_basis", "Claim-basis: the Princeton GEO paper"],
      ["internal_note_pt", "nota interna: rever antes de publicar"],
      ["internal_only", "Internal only — do not ship"],
      ["owner_field", "Owner: marketing"],
      ["todo", "TODO add the stat here"],
      ["pr_reference", "shipped in PR #285"],
      ["first_comment_instruction", "Link in the first comment"],
    ];
    for (const [id, text] of cases) {
      const r = checkEditorialLeaks(text);
      expect(r.ok, `"${text}" should be blocked`).toBe(false);
      expect(r.matches.map((m) => m.id)).toContain(id);
    }
  });

  it("reports every marker at once, not just the first", () => {
    // So an approver fixes the draft in one pass instead of being rejected
    // repeatedly, one marker at a time.
    const r = checkEditorialLeaks("TODO\nOwner: x\nInternal only");
    expect(r.matches.length).toBe(3);
  });

  it("lets ordinary marketing copy through", () => {
    const clean = [
      "Most small businesses are invisible in AI search.",
      "We tested 5 engines. Here is what we found, and what to do about it.",
      "The owner of a bakery in Lisbon asked us: does any of this matter?",
      "Todo o mundo pergunta a mesma coisa.",
      "Read the full breakdown on our blog. #AISearch #GEO",
    ].join("\n");
    const r = checkEditorialLeaks(clean);
    expect(r.ok, describeEditorialLeaks(r)).toBe(true);
  });

  it("does not flag lower-case 'todo' or a mid-sentence 'owner:'", () => {
    // The two false positives most likely to make someone switch the guard off:
    // "todo" is an ordinary Portuguese/Spanish word, and "owner:" only means a
    // tracker field when it heads a line.
    expect(checkEditorialLeaks("isto serve para todo o mundo").ok).toBe(true);
    expect(checkEditorialLeaks("we asked the owner: what changed?").ok).toBe(true);
  });

  it("handles empty and missing input without throwing", () => {
    expect(checkEditorialLeaks("").ok).toBe(true);
    expect(checkEditorialLeaks(null).ok).toBe(true);
    expect(checkEditorialLeaks(undefined).ok).toBe(true);
  });

  it("keeps excerpts short enough to be safe in a log line", () => {
    const r = checkEditorialLeaks("x".repeat(500) + "\nOwner: someone\n" + "y".repeat(500));
    expect(r.ok).toBe(false);
    for (const m of r.matches) expect(m.excerpt.length).toBeLessThanOrEqual(121);
  });
});

describe("P0-04 — the guard is wired into both doors", () => {
  it("blocks approval, fail-closed, with a preview back to the approver", () => {
    const src = read("apps/api/src/routes/drafts.ts");
    expect(src).toContain("checkEditorialLeaks");
    expect(src).toContain('code: "EDITORIAL_LEAK"');
    // The approver must be shown what would have gone out.
    expect(src).toContain("preview: finalText");
    // …and the check must run BEFORE the row is written.
    const checkAt = src.indexOf("const leaks = checkEditorialLeaks(finalText)");
    const updateAt = src.indexOf("SET status = 'approved'");
    expect(checkAt).toBeGreaterThan(-1);
    expect(updateAt).toBeGreaterThan(checkAt);
  });

  it("explicit approval refuses text that moved after the preview", () => {
    const src = read("apps/api/src/routes/drafts.ts");
    expect(src).toContain('code: "APPROVAL_TEXT_STALE"');
  });

  it("blocks publish too, permanently, before the adapter is called", () => {
    // Approval is not the only door: a queued job survives a later edit, and a
    // draft can be written by another path.
    const src = read("apps/worker/src/jobs/publish.ts");
    const checkAt = src.indexOf("const leaks = checkEditorialLeaks(outboundText)");
    const dispatchAt = src.indexOf("await dispatchPublish(");
    expect(checkAt).toBeGreaterThan(-1);
    expect(dispatchAt).toBeGreaterThan(checkAt);
    // Permanent, not retryable — retrying leaked text only leaks it later.
    expect(src).toMatch(/false, \/\/ not retryable/);
  });
});
