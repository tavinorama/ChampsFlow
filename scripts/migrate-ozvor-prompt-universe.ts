#!/usr/bin/env npx tsx
/**
 * migrate-ozvor-prompt-universe.ts — P0-06: swap the Ozvor workspace onto
 * Prompt Universe v2.
 *
 * WHY THIS IS A SCRIPT AND NOT A MIGRATION
 * ----------------------------------------
 * This changes what a brand's score MEANS. It must be run deliberately, on a
 * named brand, with the plan printed first, and it must be reversible. A DDL
 * migration that quietly rewrote a tenant's questions on deploy is exactly the
 * silent methodology change this whole capability exists to end.
 *
 * WHAT IT DOES
 *   1. ARCHIVES the generic prompts ("best SaaS for SMBs", "best solution for
 *      small businesses", "Top SaaS providers in 2026", …) by setting
 *      archived_at + archived_reason. It NEVER deletes: history is append-only
 *      in this house, and the citation_check evidence those prompts produced
 *      stays exactly as it was.
 *   2. INSERTS the v2 universe: GEO / AI visibility / brand monitoring /
 *      local service / agency questions, with full PromptDefinition metadata.
 *   3. WRITES an append-only prompt_universe_event row for every change, in
 *      the SAME transaction — so an archive can never exist without its trail.
 *
 * WHAT IT DOES NOT DO
 *   - It does not recompute, relabel or delete any historical score. The next
 *     audit simply starts a new baseline, and the trend badge says
 *     "Prompt set changed" at that point.
 *
 * USAGE
 *   npx tsx scripts/migrate-ozvor-prompt-universe.ts --brand <uuid>            # DRY RUN (default)
 *   npx tsx scripts/migrate-ozvor-prompt-universe.ts --brand <uuid> --apply
 *   npx tsx scripts/migrate-ozvor-prompt-universe.ts --brand <uuid> --restore  # undo
 *
 * Requires DATABASE_URL and migration 20260903000001_prompt_universe.
 * Idempotent: re-running --apply archives nothing new and inserts no duplicate.
 */

import postgres from "postgres";
import {
  buildOzvorUniverse,
  planOzvorArchive,
} from "../packages/llm/src/prompt-universe-ozvor";
import { PROMPT_UNIVERSE_VERSION } from "../packages/llm/src/prompt-universe";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const BRAND_ID = value("brand");
const APPLY = flag("apply");
const RESTORE = flag("restore");

if (!BRAND_ID) {
  console.error("ERROR: --brand <uuid> is required.");
  process.exit(2);
}
if (APPLY && RESTORE) {
  console.error("ERROR: --apply and --restore are mutually exclusive.");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(2);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const REASON_TAG = "prompt-universe-v2";

async function assertSchema() {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
     WHERE table_name = 'audit_prompt' AND column_name IN ('cohort', 'archived_at')
  `;
  if (cols.length < 2) {
    console.error(
      "ERROR: migration 20260903000001_prompt_universe is NOT applied.\n" +
        "       This feature is OFF until it is. Nothing was changed."
    );
    await sql.end();
    process.exit(3);
  }
  const t = await sql`SELECT to_regclass('public.prompt_universe_event') AS t`;
  if (!t[0]?.t) {
    console.error("ERROR: prompt_universe_event is missing. Nothing was changed.");
    await sql.end();
    process.exit(3);
  }
}

async function loadBrand() {
  const rows = await sql`SELECT id, tenant_id, name FROM brands WHERE id = ${BRAND_ID}`;
  if (!rows[0]) {
    console.error(`ERROR: brand ${BRAND_ID} not found.`);
    await sql.end();
    process.exit(4);
  }
  return rows[0];
}

async function restore(brand) {
  const rows = await sql`
    SELECT id, text FROM audit_prompt
     WHERE brand_id = ${brand.id}
       AND archived_at IS NOT NULL
       AND archived_reason LIKE ${"%" + REASON_TAG + "%"}
  `;
  console.log(`\nRESTORE — ${rows.length} prompt(s) would be un-archived:`);
  for (const r of rows) console.log(`  + ${r.text}`);
  if (!APPLY && !RESTORE) return;

  await sql.begin(async (tx) => {
    for (const r of rows) {
      await tx`
        UPDATE audit_prompt SET archived_at = NULL, archived_reason = NULL
         WHERE id = ${r.id}
      `;
      await tx`
        INSERT INTO prompt_universe_event
          (tenant_id, brand_id, prompt_id, event, prompt_text, reason, actor_kind)
        VALUES (${brand.tenant_id}, ${brand.id}, ${r.id}, 'restored', ${r.text},
                ${"Rolled back " + REASON_TAG + " via migrate-ozvor-prompt-universe.ts --restore"},
                'system')
      `;
    }
  });
  console.log(`\nRestored ${rows.length} prompt(s). The trail records every one.`);
}

async function apply(brand) {
  const now = new Date().toISOString();

  // --- 1. what leaves --------------------------------------------------------
  const live = await sql`
    SELECT id, text FROM audit_prompt
     WHERE brand_id = ${brand.id} AND archived_at IS NULL
  `;
  const plan = planOzvorArchive(live.map((r) => r.text));
  const idByText = new Map(live.map((r) => [r.text, r.id]));

  // --- 2. what arrives -------------------------------------------------------
  const universe = buildOzvorUniverse(now);
  const existing = new Set(live.map((r) => r.text.toLowerCase().trim()));
  const toInsert = universe.filter((p) => !existing.has(p.text.toLowerCase().trim()));

  console.log(`\nBrand: ${brand.name} (${brand.id})`);
  console.log(`Universe version: ${PROMPT_UNIVERSE_VERSION}`);
  console.log(`\nARCHIVE (${plan.archive.length}) — soft, never deleted:`);
  for (const a of plan.archive) console.log(`  - ${a.text}\n      why: ${a.reason}`);
  console.log(`\nKEEP (${plan.keep.length}):`);
  for (const k of plan.keep) console.log(`  = ${k}`);
  console.log(`\nINSERT (${toInsert.length}):`);
  for (const p of toInsert) console.log(`  + [${p.cohort}/${p.intent}/${p.market}] ${p.text}`);

  if (!APPLY) {
    console.log(
      "\nDRY RUN — nothing was changed. Re-run with --apply to execute.\n" +
        "Note: this is an approved, LABELLED methodology break. After it runs, the\n" +
        "next audit starts a new baseline and the trend badge reads 'Prompt set changed'."
    );
    return;
  }

  await sql.begin(async (tx) => {
    for (const a of plan.archive) {
      const id = idByText.get(a.text);
      if (!id) continue;
      await tx`
        UPDATE audit_prompt
           SET archived_at = NOW(),
               archived_reason = ${`[${REASON_TAG}] ${a.reason}`}
         WHERE id = ${id} AND archived_at IS NULL
      `;
      await tx`
        INSERT INTO prompt_universe_event
          (tenant_id, brand_id, prompt_id, event, prompt_text, reason, from_version, to_version, actor_kind)
        VALUES (${brand.tenant_id}, ${brand.id}, ${id}, 'archived', ${a.text}, ${a.reason},
                '1.0', ${PROMPT_UNIVERSE_VERSION}, 'system')
      `;
    }

    let order = 0;
    for (const p of toInsert) {
      const ins = await tx`
        INSERT INTO audit_prompt
          (tenant_id, brand_id, text, sort_order, is_custom,
           cohort, intent, vertical, market, locale, funnel_stage,
           business_value, relevance_score, branded, expected_competitors,
           valid_from, valid_until, version, owner_type)
        VALUES
          (${brand.tenant_id}, ${brand.id}, ${p.text}, ${order++}, TRUE,
           ${p.cohort}, ${p.intent}, ${p.vertical}, ${p.market}, ${p.locale}, ${p.funnelStage},
           ${p.businessValue}, ${p.relevanceScore}, ${p.branded}, ${p.expectedCompetitors},
           ${p.validFrom}, ${p.validUntil}, ${p.version}, ${p.ownerType})
        RETURNING id
      `;
      await tx`
        INSERT INTO prompt_universe_event
          (tenant_id, brand_id, prompt_id, event, prompt_text, reason, to_version, actor_kind, metadata)
        VALUES (${brand.tenant_id}, ${brand.id}, ${ins[0].id}, 'approved', ${p.text},
                ${"Added by " + REASON_TAG + " — represents the category Ozvor actually competes in."},
                ${PROMPT_UNIVERSE_VERSION}, 'system',
                ${sql.json({ cohort: p.cohort, intent: p.intent, market: p.market })})
      `;
    }

    // Only when something actually moved. A no-op re-run that still logged a
    // "version bumped" would put a change in the trail that never happened —
    // the trail has to be as honest as the score.
    if (plan.archive.length > 0 || toInsert.length > 0) {
    await tx`
      INSERT INTO prompt_universe_event
        (tenant_id, brand_id, event, reason, from_version, to_version, actor_kind, metadata)
      VALUES (${brand.tenant_id}, ${brand.id}, 'set_version_bumped',
              ${"Approved methodology break (founder, 2026-09-03): generic SaaS/SMB prompts retired for GEO / AI visibility / brand monitoring / local service / agency questions. No historical score is recomputed or relabelled."},
              '1.0', ${PROMPT_UNIVERSE_VERSION}, 'system',
              ${sql.json({ archived: plan.archive.length, inserted: toInsert.length })})
    `;
    }
  });

  console.log(
    `\nDONE. Archived ${plan.archive.length}, inserted ${toInsert.length}.\n` +
      "Every change has a prompt_universe_event row. No score was recomputed.\n" +
      "The next audit is a NEW BASELINE — the trend badge will read 'Prompt set changed'."
  );
}

// Wrapped rather than top-level await: this file is transformed to CJS by tsx.
async function main() {
  try {
    await assertSchema();
    const brand = await loadBrand();
    if (RESTORE) await restore(brand);
    else await apply(brand);
  } catch (err) {
    console.error("FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main();
