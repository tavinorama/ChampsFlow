/**
 * retention.ts (10.B.11) — the monthly data-retention purge.
 *
 * Runs on the 1st of every month, 04:00 UTC (queue 'retention', wired in
 * index.ts). Windows — mirrored in docs/compliance/ropa.md's retention rows:
 *
 *   smartlead_event  > 12 months (received_at)  — raw outbound webhook events
 *   ops.agent_step   >  6 months (started_at)   — step rows only; agent_run
 *                                                 rows STAY (auditable spine)
 *   landing_events   > 13 months (created_at)   — page_view/cta beacons
 *   api_spend        > 24 months (created_at)   — cost ledger (3y financial
 *                                                 window minus 12m margin —
 *                                                 conservative, founder can
 *                                                 widen before enabling)
 *
 * Safety posture:
 *   - GATED OFF by default: deletes only run with RETENTION_ENABLED=1 in the
 *     worker env. Until the founder flips it, every run is a DRY-RUN that
 *     logs the would-delete counts and tells Telegram — visible, harmless.
 *   - Dry-run counts are ALWAYS computed and logged first, enabled or not.
 *   - Telegram summary either way (todo job auditável — inclusive "0 linhas").
 *   - Uses the privileged worker client (these tables are cross-tenant ops
 *     data; ops.agent_step has no tenant rows).
 */

import type postgres from "postgres";
import { logger } from "../../../../packages/shared/src/logger";

export interface RetentionTarget {
  /** Human/loggable name — also the Telegram line label. */
  name: string;
  /** Fully qualified table. */
  table: string;
  /** Timestamp column the window applies to. */
  column: string;
  /** Postgres interval string, e.g. '12 months'. */
  keep: string;
}

/** The four windows of 10.B.11 — keep in sync with docs/compliance/ropa.md. */
export const RETENTION_TARGETS: RetentionTarget[] = [
  { name: "smartlead_event", table: "smartlead_event", column: "received_at", keep: "12 months" },
  { name: "ops.agent_step", table: "ops.agent_step", column: "started_at", keep: "6 months" },
  { name: "landing_events", table: "landing_events", column: "created_at", keep: "13 months" },
  { name: "api_spend", table: "api_spend", column: "created_at", keep: "24 months" },
];

export function retentionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env["RETENTION_ENABLED"] === "1";
}

export interface RetentionResult {
  enabled: boolean;
  rows: Array<{ name: string; candidates: number; deleted: number | null; error?: string }>;
}

async function sendTelegramSummary(text: string): Promise<void> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chat = process.env["TELEGRAM_CHAT_ID"];
  if (!token || !chat) {
    logger.warn("retention_telegram_not_configured", {});
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
    });
  } catch (err) {
    logger.warn("retention_telegram_send_failed", {
      message: (err as Error).message?.slice(0, 120),
    });
  }
}

/**
 * One monthly pass. Never throws — each target degrades independently (a
 * missing table logs an error line and moves on; a purge job must never crash
 * the worker).
 */
export async function runRetentionMonthly(
  sql: postgres.Sql,
  opts: { telegram?: (text: string) => Promise<void> } = {}
): Promise<RetentionResult> {
  const telegram = opts.telegram ?? sendTelegramSummary;
  const enabled = retentionEnabled();
  const rows: RetentionResult["rows"] = [];

  for (const t of RETENTION_TARGETS) {
    try {
      // Dry-run count FIRST, always — the auditable "what would go" line.
      const countRes = await sql.unsafe(
        `SELECT COUNT(*)::bigint AS n FROM ${t.table} WHERE ${t.column} < NOW() - INTERVAL '${t.keep}'`
      );
      const candidates = Number(countRes[0]?.["n"] ?? 0);
      logger.info("retention_dry_run_count", {
        target: t.name,
        keep: t.keep,
        candidates,
        enabled,
      });

      let deleted: number | null = null;
      if (enabled && candidates > 0) {
        const delRes = await sql.unsafe(
          `DELETE FROM ${t.table} WHERE ${t.column} < NOW() - INTERVAL '${t.keep}'`
        );
        deleted = delRes.count ?? 0;
        logger.info("retention_deleted", { target: t.name, deleted });
      }
      rows.push({ name: t.name, candidates, deleted });
    } catch (err) {
      const message = (err as Error).message?.slice(0, 160) ?? "unknown";
      logger.error("retention_target_failed", { target: t.name, message });
      rows.push({ name: t.name, candidates: -1, deleted: null, error: message });
    }
  }

  // Telegram summary — sempre, inclusive dry-run e zero linhas (todo job
  // auditável; "não rodou" e "rodou e apagou 0" precisam ser distinguíveis).
  const lines = rows.map((r) =>
    r.error
      ? `- ${r.name}: ERRO (${r.error})`
      : `- ${r.name}: ${r.candidates} candidatas${r.deleted != null ? `, ${r.deleted} apagadas` : ""}`
  );
  const header = enabled
    ? "RETENCAO mensal executada (RETENTION_ENABLED=1):"
    : "RETENCAO mensal em DRY-RUN (RETENTION_ENABLED desligado — nada apagado):";
  await telegram([header, ...lines].join("\n"));

  return { enabled, rows };
}
