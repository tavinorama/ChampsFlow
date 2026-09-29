/**
 * ai-audit-catalog-sync.test.ts — D3 (Codex N08 + N09, 28/09).
 *
 * Production served 12 tools with August's prices and no engine dimension,
 * while the seed had 15 tools, verified prices and engines. The seed and the
 * database must be the same catalog. This test parses the migration that
 * writes the rows and compares it, field by field, with SEED_CATALOG; and it
 * proves that the same questionnaire ranks the same through both paths.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEED_CATALOG } from "../../apps/api/src/lib/ai-audit/seed-catalog";
import { loadCatalog, CATALOG_SELECT_FULL, CATALOG_SELECT_LEGACY } from "../../apps/api/src/lib/ai-audit/catalog-repo";
import { buildAuditReport } from "../../apps/api/src/lib/ai-audit/engine";
import type { PostgresClient } from "../../packages/shared/src/db-client";
import type { QuestionnaireAnswers } from "../../apps/api/src/lib/ai-audit/types";

const SQL = readFileSync(join(__dirname, "../../packages/db/migrations/20260929000001_ai_tool_engines_and_provenance.up.sql"), "utf8");

/** Parse one VALUES tuple: strings (with '' escapes), arrays, numbers, TRUE/FALSE/NULL. */
function parseTuple(line: string): unknown[] {
  const out: unknown[] = [];
  let i = line.indexOf("(") + 1;
  while (i < line.length) {
    while (line[i] === " " || line[i] === ",") i++;
    if (line[i] === ")" || i >= line.length) break;
    if (line[i] === "'") {
      let j = i + 1;
      let v = "";
      while (j < line.length) {
        if (line[j] === "'" && line[j + 1] === "'") { v += "'"; j += 2; continue; }
        if (line[j] === "'") break;
        v += line[j]; j++;
      }
      i = j + 1;
      if (line.startsWith("::date", i)) i += 6;
      out.push(v.startsWith("{") && v.endsWith("}") ? v.slice(1, -1).split(",").filter(Boolean) : v);
    } else {
      let j = i;
      while (j < line.length && line[j] !== "," && line[j] !== ")") j++;
      const raw = line.slice(i, j).trim();
      out.push(raw === "TRUE" ? true : raw === "FALSE" ? false : raw === "NULL" ? null : Number(raw));
      i = j;
    }
  }
  return out;
}

const rows = SQL.split("\n").filter((l) => l.startsWith("  ('")).map(parseTuple).map((t) => ({
  id: t[0] as string, name: t[1] as string, url: t[2] as string, category: t[3] as string,
  niches: t[4] as string[], pains: t[5] as string[], engines: t[6] as string[],
  monthly_cost_usd: String(t[7]), setup_effort: t[8] as string, impact: t[9] as string,
  hours_saved_weekly: String(t[10]), one_liner: t[11] as string, is_generic: t[12] as boolean,
  price_checked_at: t[13] as string | null, price_note: t[14] as string | null, verified: false,
}));

const db = (opts: { full?: unknown[]; legacy?: unknown[]; failFull?: boolean; failAll?: boolean }): PostgresClient =>
  ({
    setTenantId: async () => {},
    async query(sql: string) {
      if (opts.failAll) throw new Error("down");
      if (sql === CATALOG_SELECT_FULL) {
        if (opts.failFull) throw Object.assign(new Error('column "engines" does not exist'), { code: "42703" });
        return { rows: opts.full ?? [] };
      }
      if (sql === CATALOG_SELECT_LEGACY) return { rows: opts.legacy ?? [] };
      return { rows: [] };
    },
  }) as unknown as PostgresClient;

describe("the migration writes exactly the seed", () => {
  it("15 tools, the same ids as the seed, including the three clinic tools", () => {
    expect(rows.map((r) => r.id).sort()).toEqual(SEED_CATALOG.map((t) => t.id).sort());
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(["weave", "nexhealth", "podium"]));
  });
  it("every field of every row equals the seed", () => {
    for (const r of rows) {
      const t = SEED_CATALOG.find((x) => x.id === r.id)!;
      expect({ ...r, verified: undefined }, r.id).toMatchObject({
        name: t.name, url: t.url, category: t.category, niches: t.niches, pains: t.pains, engines: t.engines,
        monthly_cost_usd: String(t.monthlyCostUsd), setup_effort: t.setupEffort, impact: t.impact,
        hours_saved_weekly: String(t.hoursSavedWeekly), one_liner: t.oneLiner,
        is_generic: Boolean(t.isGeneric), price_checked_at: t.priceCheckedAt ?? null, price_note: t.priceNote ?? null,
      });
    }
  });
  it("never writes `verified`: hours saved are still estimates", () => {
    const upsert = SQL.slice(SQL.indexOf("INSERT INTO ai_tool"));
    expect(upsert.slice(0, upsert.indexOf("VALUES"))).not.toMatch(/\bverified\b/);
    expect(upsert.slice(upsert.indexOf("ON CONFLICT"))).not.toMatch(/\bverified\s*=/);
  });
});

describe("loadCatalog — the DB path is the same catalog as the seed", () => {
  const answers: QuestionnaireAnswers = { businessType: "clinic", primaryFocus: "clinic-ops", pains: ["no-shows", "phone-answering"], engines: ["convert", "retain"] };
  const topIds = (tools: Parameters<typeof buildAuditReport>[1]) => buildAuditReport(answers, tools).recommendedSolutions.slice(0, 3).map((s) => s.tool.id);

  it("after the migration: engines, provenance and the generalist flag arrive, and the ranking equals the seed's", async () => {
    const load = await loadCatalog(db({ full: rows }));
    expect(load).toMatchObject({ source: "db", enginesAvailable: true, allVerified: false });
    expect(load.tools).toHaveLength(15);
    expect(load.tools.find((t) => t.id === "weave")).toMatchObject({ engines: ["convert", "retain", "run"], monthlyCostUsd: 199, priceCheckedAt: "2026-09-25" });
    expect(load.tools.find((t) => t.id === "chatgpt")).toMatchObject({ isGeneric: true });
    expect(topIds(load.tools)).toEqual(topIds(SEED_CATALOG));
    expect(topIds(load.tools).length).toBeGreaterThan(0);
  });

  it("before the migration: the old table still serves, and the loader SAYS the engine dimension is missing", async () => {
    const legacy = rows.slice(0, 12).map(({ engines: _e, is_generic: _g, price_checked_at: _c, price_note: _n, ...r }) => r);
    const load = await loadCatalog(db({ failFull: true, legacy }));
    expect(load).toMatchObject({ source: "db", enginesAvailable: false });
    expect(load.tools.every((t) => t.engines.length === 0)).toBe(true);
  });

  it("a real outage falls back to the seed, which has engines", async () => {
    expect(await loadCatalog(db({ failAll: true }))).toMatchObject({ source: "seed", enginesAvailable: true });
    expect(await loadCatalog(db({ full: [] }))).toMatchObject({ source: "seed" });
  });

  it("a date column read as a Date object becomes YYYY-MM-DD", async () => {
    const load = await loadCatalog(db({ full: [{ ...rows.find((r) => r.id === "hex")!, price_checked_at: new Date("2026-09-25T00:00:00Z") }] }));
    expect(load.tools[0]!.priceCheckedAt).toBe("2026-09-25");
  });
});
