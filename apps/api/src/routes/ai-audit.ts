/**
 * ai-audit.ts — the AI Audit Stack HTTP surface (new product, BR entry).
 *
 * Two public endpoints, both thin wrappers over the pure engine
 * (apps/api/src/lib/ai-audit/*): the intelligence and the honesty rules live
 * there and are unit-tested there; this file only validates input, loads the
 * catalog (DB-first, seed fallback), and shapes the response.
 *
 *  - GET  /api/ai-audit/meta    — the questionnaire vocabulary (pains,
 *      categories, niches) derived from the live catalog, so the front-end
 *      questionnaire is data-driven, not hardcoded.
 *  - POST /api/ai-audit/assess  — answers → the 9-section AuditReport.
 *
 * Honesty carried to the wire: the response always says whether the catalog
 * came from the DB or the seed, and whether its numbers are human-verified. A
 * report built on unverified estimates ships with `estimatesUnverified: true`
 * so the UI can label the ROI as indicative, never as a promise.
 */

import { Hono } from "hono";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { loadCatalog } from "../lib/ai-audit/catalog-repo";
import { buildAuditReport, buildEntryResult } from "../lib/ai-audit/engine";
import type { BusinessEngine, QuestionnaireAnswers } from "../lib/ai-audit/types";

const MAX_PAINS = 20;
const MAX_STR = 120;
const VALID_ENGINES: readonly BusinessEngine[] = ["attract", "convert", "deliver", "retain", "run"];

function cleanStr(v: unknown, max = MAX_STR): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function cleanStrArray(v: unknown, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.length <= MAX_STR)
    .slice(0, maxItems);
}

function cleanPosNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Keep only the five valid business engines the questionnaire offers. */
function cleanEngines(v: unknown): BusinessEngine[] {
  if (!Array.isArray(v)) return [];
  const set = new Set(v.map((x) => (typeof x === "string" ? x.trim().toLowerCase() : "")));
  return VALID_ENGINES.filter((e) => set.has(e));
}

export function registerAiAuditRoutes(app: Hono, db: PostgresClient): void {
  // GET /api/ai-audit/meta — vocabulary for the questionnaire, from the catalog.
  app.get("/api/ai-audit/meta", async (c) => {
    const { tools, source, allVerified } = await loadCatalog(db);
    const pains = [...new Set(tools.flatMap((t) => t.pains))].sort();
    const categories = [...new Set(tools.map((t) => t.category))].sort();
    const niches = [...new Set(tools.flatMap((t) => t.niches))].sort();
    return c.json({
      // The five business engines the questionnaire asks about, in order.
      engines: VALID_ENGINES,
      pains,
      categories,
      niches,
      toolCount: tools.length,
      catalog: { source, estimatesUnverified: !allVerified },
    });
  });

  // POST /api/ai-audit/assess — the low-ticket self-serve result. Public: it is
  // the market-entry lead magnet. Cheap and safe — the engine is pure, makes no
  // LLM call and spends nothing, so it needs no key.
  app.post("/api/ai-audit/assess", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ message: "Invalid JSON body." }, 400);

    const answers: QuestionnaireAnswers = {
      businessType: cleanStr(body["businessType"]),
      primaryFocus: cleanStr(body["primaryFocus"]),
      pains: cleanStrArray(body["pains"], MAX_PAINS),
      engines: cleanEngines(body["engines"]),
      hourlyRateUsd: cleanPosNumber(body["hourlyRateUsd"]),
      maxMonthlyBudgetUsd: cleanPosNumber(body["maxMonthlyBudgetUsd"]),
      toolsInUse: cleanStrArray(body["toolsInUse"], MAX_PAINS),
    };

    if (answers.pains.length === 0) {
      return c.json(
        { message: "Select at least one pain so the recommendation can be anchored in a real need.", code: "NO_PAINS" },
        400
      );
    }

    const { tools, source, allVerified } = await loadCatalog(db);
    const report = buildAuditReport(answers, tools);

    return c.json({
      report,
      catalog: {
        source,
        // The whole product's honesty rule at the API edge: never let the UI
        // present estimated cost/ROI as a promise.
        estimatesUnverified: !allVerified,
      },
    });
  });

  // POST /api/ai-audit/entry — the LOW-TICKET result: ONE niche-fit tool + the
  // honest count of what the full audit would surface. Same input as /assess.
  // The upsell is in the payload (withheldCount, fullAudit) so the front-end
  // can wire the ladder without guessing.
  app.post("/api/ai-audit/entry", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ message: "Invalid JSON body." }, 400);

    const answers: QuestionnaireAnswers = {
      businessType: cleanStr(body["businessType"]),
      primaryFocus: cleanStr(body["primaryFocus"]),
      pains: cleanStrArray(body["pains"], MAX_PAINS),
      engines: cleanEngines(body["engines"]),
      toolsInUse: cleanStrArray(body["toolsInUse"], MAX_PAINS),
    };
    if (answers.pains.length === 0) {
      return c.json({ message: "Select at least one pain.", code: "NO_PAINS" }, 400);
    }

    const { tools, source, allVerified } = await loadCatalog(db);
    const entry = buildEntryResult(answers, tools);

    return c.json({
      entry,
      // The whole ladder, spelled out for the client — every product connects.
      upsell: {
        limitation: "This entry check shows one niche tool. It skips the big-name AIs and holds back the rest.",
        fullAudit: {
          name: "The full AI Audit Stack",
          gets: `We matched ${entry.totalMatched} tools to your needs. The full audit ranks them all, maps quick wins, plans your first days, and shows your monthly ROI.`,
          bundledWith: "You get it inside OrganicPosts, together with your Ozvor GEO Search audit.",
        },
        alsoOffer: "Ozvor GEO Search. See how AI engines describe your brand, then fix it.",
      },
      catalog: { source, estimatesUnverified: !allVerified },
    });
  });
}
