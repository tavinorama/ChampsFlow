/**
 * recycle-scan.ts — the weekly 2-month non-responder recycling loop.
 *
 * Founder directive (01/09), "prática que se repetirá": every Monday 08:00 UTC
 * this job finds cold-outreach contacts who (a) are still 'new'/'contacted' —
 * NEVER 'lost' (unsubscribed = out forever) and never the founder's judgments
 * ('qualified'/'customer'); (b) have not been touched by any smartlead event
 * NOR proposed in a recycle batch for >= 60 days; and (c) never replied (no
 * EMAIL_REPLY event, ever). Pure decisions live in apps/api/src/lib/recycle.ts
 * (unit-tested); this file is the I/O.
 *
 * Delivery mechanism (deliberately the LEAST new surface): the job writes an
 * append-only "[recycle] proposto <date> campanha <slug>" note line on each
 * candidate's crm_contact row — the marker IS the artifact. It restarts the
 * 60-day clock, prevents double proposal, shows up in the client's dossier,
 * and /admin → Leads & CRM → Reciclagem rebuilds the batch from the markers
 * as a CSV. Telegram gets a SUMMARY only (counts + up to 3 masked samples —
 * no PII dump). A MÁQUINA NUNCA ENVIA: the founder downloads the CSV and
 * loads it into a NEW SmartLead campaign by hand; approval is physical — no
 * SmartLead load, no send. (The graph approve/reject buttons were rejected on
 * purpose: they gate machine actions, and there is no machine action here to
 * gate — see PR body.)
 *
 * Marker write survives the 4000-char note cap by trimming the OLD head to
 * 3900 first: if the marker itself could be truncated away, the clock would
 * never restart and the same lead would be re-proposed forever.
 */

import type postgres from "postgres";
import { logger } from "../../../../packages/shared/src/logger";
import {
  RECYCLE_BATCH_CAP,
  RECYCLE_WINDOW_DAYS,
  buildRecycleSlug,
  maskEmail,
  recycleMarkerLine,
  selectRecycleCandidates,
  type RecycleCandidateRow,
} from "../../../api/src/lib/recycle";

const TG_TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
const TG_CHAT = process.env["TELEGRAM_CHAT_ID"] ?? "";

async function sendTelegramDefault(text: string): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT) {
    logger.warn("recycle_scan_telegram_env_missing", { preview: text.slice(0, 120) });
    return;
  }
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15_000);
    try {
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TG_CHAT, text }),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    logger.error("recycle_scan_telegram_failed", {
      message: (err as Error).message?.slice(0, 160),
    });
  }
}

export interface RecycleScanResult {
  slug: string;
  scanned: number;
  proposed: number;
  marked: number;
}

export async function runRecycleScanWeekly(
  sql: postgres.Sql,
  opts: {
    telegram?: (text: string) => Promise<void>;
    now?: Date;
  } = {}
): Promise<RecycleScanResult> {
  const telegram = opts.telegram ?? sendTelegramDefault;
  const now = opts.now ?? new Date();
  const slug = buildRecycleSlug(now);

  // SQL prefilter (validated with PREPARE against the real schema): recyclable
  // stages only, zero EMAIL_REPLY ever, last provider touch >= 60 days ago.
  // The note-embedded recycle-marker clock is invisible to SQL, so we fetch
  // headroom above the cap and let the pure filter apply it.
  const rows = (await sql`
    SELECT c.email,
           c.stage,
           c.note,
           MAX(e.received_at) AS last_event_at,
           COUNT(*) FILTER (WHERE e.event_type = 'EMAIL_REPLY')::int AS reply_count
      FROM crm_contact c
      JOIN smartlead_event e ON e.lead_email = c.email
     WHERE c.stage IN ('new', 'contacted')
     GROUP BY c.email, c.stage, c.note
    HAVING COUNT(*) FILTER (WHERE e.event_type = 'EMAIL_REPLY') = 0
       AND MAX(e.received_at) < NOW() - INTERVAL '60 days'
     ORDER BY MAX(e.received_at) ASC
     LIMIT 600
  `) as unknown as RecycleCandidateRow[];

  const emails = selectRecycleCandidates(rows, now, RECYCLE_BATCH_CAP);

  if (emails.length === 0) {
    logger.info("recycle_scan_empty", { scanned: rows.length, slug });
    await telegram(
      `♻️ Reciclagem ${RECYCLE_WINDOW_DAYS}d (${slug}): 0 candidatos esta semana. Nada a carregar.`
    );
    return { slug, scanned: rows.length, proposed: 0, marked: 0 };
  }

  // Marker FIRST (artifact before notification): if Telegram fails afterwards
  // the batch is still reachable in /admin, and the clock has restarted.
  // Head-trim to 3900 so the marker always survives the 4000 cap.
  const line = recycleMarkerLine(now, slug);
  const updated = await sql`
    UPDATE crm_contact
       SET note = LEFT(COALESCE(note || E'\n', ''), 3900) || ${line},
           updated_at = NOW()
     WHERE email = ANY(${emails})
  `;
  const marked = updated.count ?? emails.length;

  // Telegram: counts + a few MASKED samples. Never the full list, never a
  // plain address (house rule: no PII in logs/Telegram beyond masked samples).
  const samples = emails.slice(0, 3).map(maskEmail).join(", ");
  const rest = emails.length > 3 ? ` +${emails.length - 3}` : "";
  await telegram(
    [
      `♻️ Reciclagem ${RECYCLE_WINDOW_DAYS}d — lote ${slug}`,
      `${emails.length} leads frios sem resposta há 60+ dias, marcados no CRM.`,
      `Amostra: ${samples}${rest}`,
      `Baixe o CSV em /admin → Leads & CRM → Reciclagem e carregue numa campanha NOVA no SmartLead (1º e-mail sem link).`,
      `A máquina não enviou nada — o envio é seu.`,
    ].join("\n")
  );

  logger.info("recycle_scan_done", {
    slug,
    scanned: rows.length,
    proposed: emails.length,
    marked,
  });
  return { slug, scanned: rows.length, proposed: emails.length, marked };
}
