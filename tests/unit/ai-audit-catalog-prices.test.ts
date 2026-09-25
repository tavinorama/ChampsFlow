/**
 * ai-audit-catalog-prices.test.ts — B16 (Codex D18, 23/09).
 *
 * The AI Audit Stack report prints the catalog's monthly prices. On 25/09 the
 * list prices were read on the vendors' pricing pages and recorded in
 * docs/ai-audit/catalog-verification-2026-09-25.md. This test reads that
 * table and pins the seed to it: a price changed in one place and not the
 * other fails here, and a "verified" row must carry the date it was read.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEED_CATALOG } from "../../apps/api/src/lib/ai-audit/seed-catalog";

const DOC = resolve(__dirname, "../../docs/ai-audit/catalog-verification-2026-09-25.md");
const CHECKED_AT = "2026-09-25";

type Row = { id: string; before: number; price: number; status: "verified" | "estimate" };

function readTable(): Row[] {
  const rows: Row[] = [];
  for (const line of readFileSync(DOC, "utf8").split("\n")) {
    const m = /^\| ([a-z0-9-]+) \| [^|]+ \| ([0-9.]+) \| ([0-9.]+) \| (verified|estimate) \|/.exec(line);
    if (m) rows.push({ id: m[1]!, before: Number(m[2]), price: Number(m[3]), status: m[4] as Row["status"] });
  }
  return rows;
}

describe("AI Audit catalog — seed prices match the 25/09 verification record", () => {
  const table = readTable();

  it("the record lists every seed tool exactly once", () => {
    expect(table.map((r) => r.id).sort()).toEqual(SEED_CATALOG.map((t) => t.id).sort());
  });

  it("every seed price equals the recorded price, and verified rows carry the read date", () => {
    for (const row of table) {
      const tool = SEED_CATALOG.find((t) => t.id === row.id)!;
      expect(tool.monthlyCostUsd, row.id).toBe(row.price);
      expect(typeof tool.priceNote, `${row.id} priceNote`).toBe("string");
      if (row.status === "verified") expect(tool.priceCheckedAt, row.id).toBe(CHECKED_AT);
      else expect(tool.priceCheckedAt, `${row.id} must not claim a check`).toBeUndefined();
    }
  });

  it("nine prices are verified, six remain estimates, and the four real changes are the documented ones", () => {
    expect(table.filter((r) => r.status === "verified")).toHaveLength(9);
    expect(table.filter((r) => r.status === "estimate")).toHaveLength(6);
    const changed = table.filter((r) => r.before !== r.price).map((r) => r.id).sort();
    expect(changed).toEqual(["buffer", "intercom-fin", "jasper", "weave", "zapier"]);
  });
});
