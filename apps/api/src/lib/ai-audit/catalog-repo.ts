/**
 * catalog-repo.ts — load the AI Audit Stack tool catalog, DB-first with a
 * seed fallback.
 *
 * The engine (engine.ts) is pure and takes a Tool[]. In production the catalog
 * lives in the ai_tool table (migration 20260814000001, founder-gated). This
 * repository reads it — and FALLS BACK to the in-code SEED_CATALOG when the
 * table is empty or absent, so the product runs correctly BEFORE that migration
 * is applied and keeps running if the table is ever dropped. Degradation is
 * honest, never silent: the caller sees it via the returned `source`, and
 * `allVerified` tells the report layer whether the numbers may be shown as fact.
 */

import type { PostgresClient } from "../../../../../packages/shared/src/db-client";
import { SEED_CATALOG } from "./seed-catalog";
import type { BusinessEngine, Effort, Impact, Tool } from "./types";

interface AiToolRow {
  id: string;
  name: string;
  url: string;
  category: string;
  niches: string[] | null;
  pains: string[] | null;
  /** Added with the 5-engine model; absent on the pre-engines migration (defaults []). */
  engines?: string[] | null;
  monthly_cost_usd: string | number;
  setup_effort: string;
  impact: string;
  hours_saved_weekly: string | number;
  one_liner: string;
  verified: boolean;
}

const ENGINES: ReadonlySet<string> = new Set<BusinessEngine>([
  "attract", "convert", "deliver", "retain", "run",
]);

const EFFORTS: ReadonlySet<string> = new Set<Effort>(["low", "medium", "high"]);
const IMPACTS: ReadonlySet<string> = new Set<Impact>(["low", "medium", "high"]);

/** Map a DB row to a domain Tool, dropping rows that violate the enum shape. */
function rowToTool(r: AiToolRow): Tool | null {
  if (!EFFORTS.has(r.setup_effort) || !IMPACTS.has(r.impact)) return null;
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    category: r.category,
    niches: r.niches ?? [],
    pains: r.pains ?? [],
    // engines column arrives with a later migration; until then default to []
    // (the seed catalog carries the real values, and it is what serves today).
    engines: (r.engines ?? []).filter((e): e is BusinessEngine => ENGINES.has(e)),
    monthlyCostUsd: Number(r.monthly_cost_usd),
    setupEffort: r.setup_effort as Effort,
    impact: r.impact as Impact,
    hoursSavedWeekly: Number(r.hours_saved_weekly),
    oneLiner: r.one_liner,
  };
}

export interface CatalogLoad {
  tools: Tool[];
  /** 'db' when the ai_tool table served the rows, 'seed' on fallback. */
  source: "db" | "seed";
  /**
   * True only when EVERY served row is human-verified. The seed is estimates,
   * so the fallback is always false — the report must not present unverified
   * cost/ROI as fact.
   */
  allVerified: boolean;
}

/**
 * Load the catalog. Tries the ai_tool table; on any error (table missing on a
 * pre-migration deploy, connection issue) or an empty/all-malformed table,
 * returns the seed. Never throws — a catalog read failing must not take down
 * the audit; it degrades to the known-good starter set and SAYS so.
 */
export async function loadCatalog(db: PostgresClient): Promise<CatalogLoad> {
  try {
    const { rows } = await db.query<AiToolRow>(
      `SELECT id, name, url, category, niches, pains, monthly_cost_usd,
              setup_effort, impact, hours_saved_weekly, one_liner, verified
         FROM ai_tool`
    );
    if (rows.length === 0) return { tools: SEED_CATALOG, source: "seed", allVerified: false };
    const kept = rows.filter((r) => rowToTool(r) !== null);
    if (kept.length === 0) return { tools: SEED_CATALOG, source: "seed", allVerified: false };
    return {
      tools: kept.map((r) => rowToTool(r)!) as Tool[],
      source: "db",
      allVerified: kept.every((r) => r.verified === true),
    };
  } catch {
    return { tools: SEED_CATALOG, source: "seed", allVerified: false };
  }
}
