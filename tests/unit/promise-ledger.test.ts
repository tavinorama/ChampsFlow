/**
 * promise-ledger.test.ts — C01 / P19 (25/09).
 *
 * The SKU pages are scanned against the ledger: every dollar amount must be
 * derivable from pricing.ts (or be a listed story amount), every watched
 * claim must have a ledger entry with an evidence state, promised quantities
 * must equal their one source, and the set of UNSUPPORTED claims is pinned
 * so a new one cannot land silently.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allowedAmounts, WATCH_PATTERNS, claimFor, unsupportedClaims, PROMISED_QUANTITIES, PROMISE_LEDGER } from "../../packages/shared/src/promise-ledger";

const root = join(__dirname, "../..");
const SKU_PAGES = [
  "apps/web/src/app/(marketing)/page.tsx",
  "apps/web/src/app/(marketing)/HomeFilm.tsx",
  "apps/web/src/app/(marketing)/pricing/page.tsx",
  "apps/web/src/app/(marketing)/kit/page.tsx",
  "apps/web/src/app/(marketing)/local-pages/page.tsx",
  "apps/web/src/app/(marketing)/ai-audit/page.tsx",
  "apps/web/src/app/(marketing)/organicposts/page.tsx",
  "apps/web/src/app/(marketing)/faq/page.tsx",
  "apps/web/src/app/(marketing)/agencies/page.tsx",
  "apps/web/src/app/(marketing)/landing-v2-logic.ts",
];

/** Source lines without comment-only lines (the ledger governs what ships, not notes). */
function codeLines(file: string): Array<{ n: number; text: string }> {
  return readFileSync(join(root, file), "utf8")
    .split("\n")
    .map((text, i) => ({ n: i + 1, text }))
    .filter(({ text }) => !/^\s*(\/\/|\/\*|\*)/.test(text));
}

function parseAmount(tok: string): number {
  const k = /k$/i.test(tok);
  const n = Number(tok.replace(/[$,k]/gi, ""));
  return k ? n * 1000 : n;
}

describe("promise ledger — the SKU pages agree with one source", () => {
  it("every dollar amount on a SKU page is a list price, a derived figure, or a listed story amount", () => {
    const allowed = allowedAmounts();
    const offenders: string[] = [];
    for (const file of SKU_PAGES) {
      for (const { n, text } of codeLines(file)) {
        for (const m of text.matchAll(/\$\d[\d,]*(?:\.\d+)?k?\b/gi)) {
          const amount = parseAmount(m[0]);
          if (!allowed.has(amount)) offenders.push(`${file}:${n} ${m[0]}`);
        }
      }
    }
    expect(offenders, "amounts with no source in pricing.ts / ledger").toEqual([]);
  });

  it("every watched claim on a SKU page has a ledger entry with an evidence state", () => {
    const offenders: string[] = [];
    for (const file of SKU_PAGES) {
      for (const { n, text } of codeLines(file)) {
        if (!WATCH_PATTERNS.some((p) => p.test(text))) continue;
        if (!claimFor(text)) offenders.push(`${file}:${n} ${text.trim().slice(0, 100)}`);
      }
    }
    expect(offenders, "claims without a ledger entry").toEqual([]);
  });

  it("promised quantities equal their one source", () => {
    expect(PROMISED_QUANTITIES.engines).toBe(5);
    expect(PROMISED_QUANTITIES.agencyBrands).toBe(10);
    const all = SKU_PAGES.map((f) => codeLines(f).map((l) => l.text).join("\n")).join("\n");
    for (const m of all.matchAll(/up to (\d+) brands/gi)) expect(Number(m[1]), m[0]).toBe(PROMISED_QUANTITIES.agencyBrands);
    for (const m of all.matchAll(/all (\d+) engines|(\d+)-engine/gi)) expect(Number(m[1] ?? m[2]), m[0]).toBe(PROMISED_QUANTITIES.engines);
    for (const m of all.matchAll(/top (\d+) (?:highest-impact |citation )?fixes/gi)) expect(Number(m[1]), m[0]).toBe(PROMISED_QUANTITIES.kitFixes);
    for (const m of all.matchAll(/(\d+) ready-to-publish drafts/gi)) expect(Number(m[1]), m[0]).toBe(PROMISED_QUANTITIES.kitDrafts);
    for (const m of all.matchAll(/(\d+)-page (?:site|website)/gi)) expect(Number(m[1]), m[0]).toBe(PROMISED_QUANTITIES.pagesPerSite);
    for (const m of all.matchAll(/(\d+)[- ]day money[- ]back/gi)) expect(Number(m[1]), m[0]).toBe(PROMISED_QUANTITIES.refundDays);
  });

  it("the unsupported claims are exactly the ones the founder knows about", () => {
    expect(unsupportedClaims().map((c) => c.id)).toEqual([]); // 25/09: the pricing hero was reworded the same day
    for (const c of PROMISE_LEDGER) expect(c.note.length, c.id).toBeGreaterThan(20);
  });
});
