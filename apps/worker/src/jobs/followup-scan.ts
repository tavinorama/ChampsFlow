/**
 * followup-scan.ts — 5.A.2: resposta → intenção → rascunho → PORTÃO → envia.
 *
 * Every 30 minutes this job closes the loop the webhook leaves open: a cold
 * lead REPLIED (smartlead_event EMAIL_REPLY, already promoted to 'contacted')
 * and, until now, the founder answered by hand or not at all. The job:
 *
 *   1. Resolves PARKED gates first (scheduler lesson 18-20/08: parked items
 *      are re-checked cheaply before anything new starts): approved → send
 *      via the SmartLead reply API (or the honest manual fallback), rejected
 *      → nothing sent, 96h of silence → rejection, nothing sent.
 *   2. Scans recent EMAIL_REPLY events not yet handled. Handled-state is an
 *      append-only "[followup] <verbo> <event_id>" note line on crm_contact
 *      (the recycle-marker mechanism — NO new table).
 *   3. Intent via callWithFallback (never a pinned engine): unsubscribe is
 *      FINAL (stage per the existing webhook rules, no draft); noise is
 *      marked and silent; the four human intents get a SHORT English draft
 *      grounded ONLY in the reply + trilha + house facts, validated by CODE.
 *   4. PORTÃO: the draft parks as an ops.agent_run('followup-reply') with a
 *      'waiting' approval step — the SAME ap:/rj: Telegram buttons and the
 *      same webhook route (#445) every graph uses. The graph slug is NOT in
 *      GRAPH_REGISTRY on purpose: the tick ignores these runs; THIS job owns
 *      their whole lifecycle (least new surface: zero changes to the runner).
 *   5. Send on approval: POST /campaigns/{id}/reply-email-thread (SmartLead
 *      master-inbox reply API). SMARTLEAD_API_KEY is OPTIONAL worker env —
 *      absent, or payload without stats_id, or API error → the approved
 *      draft is delivered in Telegram for the founder to paste (loud, with
 *      the nominal unlocking action). An ambiguous API failure is NEVER
 *      retried by the machine (a duplicate reply is a send nobody approved).
 *
 * NOTHING is sent without the founder approving THAT message. The model only
 * classifies and writes; every marker, cap, timeout and validation is code.
 */

import type postgres from "postgres";
import type Redis from "ioredis";
import { logger } from "../../../../packages/shared/src/logger";
import {
  DRAFT_MAX_CHARS,
  FOLLOWUP_APPROVAL_TIMEOUT_HOURS,
  FOLLOWUP_BATCH_CAP,
  FOLLOWUP_GRAPH,
  FOLLOWUP_LOOKBACK_DAYS,
  buildDraftPrompt,
  buildIntentPrompt,
  draftToHtml,
  extractReplyRouting,
  extractTrilha,
  followupMarkerLine,
  hasFollowupMarker,
  hasOpenFollowupProposal,
  looksLikeAutoReplyNoise,
  parseIntent,
  validateFollowupDraft,
  type FollowupIntent,
} from "../../../api/src/lib/followup";
import { extractReplyText } from "../../../api/src/lib/dossier";
import { maskEmail } from "../../../api/src/lib/recycle";
import { nextStageFor, type Stage } from "../../../api/src/lib/smartlead-stage";
import { callWithFallback, errorHead, parseEngineChain } from "../lib/hermes-fallback";

const HERMES_URL = process.env["HERMES_TASK_URL"] ?? "https://hermes.ozvor.com";
const HERMES_TIMEOUT_MS = 240_000;
const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1";
// The SmartLead WAF blocks default library UAs (#556) — browser-shaped UA.
const SMARTLEAD_UA = "Mozilla/5.0 (Macintosh) OzvorOps/1.0";
const ARTIFACT_TTL_SECONDS = 7 * 24 * 3600;
const OFF_ALARM_WINDOW_S = 6 * 3600;

// ---------------------------------------------------------------------------
// Ports — injectable for tests; defaults are the real wires.
// ---------------------------------------------------------------------------

export interface FollowupPorts {
  /** LLM call, already fallback-chained (callWithFallback upstream). */
  hermes: (prompt: string) => Promise<{ ok: boolean; output: string; engineUsed: string | null }>;
  telegram: (text: string, buttons?: Array<{ text: string; data: string }>) => Promise<void>;
  /** The SmartLead reply-email-thread call. ok=false NEVER auto-retries. */
  smartleadReply: (input: {
    campaignId: number;
    statsId: string;
    bodyHtml: string;
    messageId: string | null;
  }) => Promise<{ ok: boolean; detail: string }>;
  artifacts: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };
  /** Redis SET NX for once-per-window alarms; null = always alarm (fail loud). */
  onceKey: (key: string) => Promise<boolean>;
  now: () => Date;
  hermesToken: string;
  smartleadApiKey: string;
}

function defaultTelegram(): FollowupPorts["telegram"] {
  const TG_TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
  const TG_CHAT = process.env["TELEGRAM_CHAT_ID"] ?? "";
  return async (text, buttons) => {
    if (!TG_TOKEN || !TG_CHAT) {
      logger.warn("followup_telegram_env_missing", { preview: text.slice(0, 120) });
      return;
    }
    try {
      const payload: Record<string, unknown> = { chat_id: TG_CHAT, text };
      if (buttons && buttons.length > 0) {
        payload["reply_markup"] = {
          inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.data.slice(0, 64) }))],
        };
      }
      await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      logger.error("followup_telegram_failed", { message: (err as Error).message?.slice(0, 160) });
    }
  };
}

function defaultHermes(token: string): FollowupPorts["hermes"] {
  const engines = parseEngineChain(process.env["HERMES_ENGINES"]);
  return async (prompt) => {
    const res = await callWithFallback(engines, async (engine) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), HERMES_TIMEOUT_MS);
      try {
        const r = await fetch(`${HERMES_URL}/task`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ engine, timeoutMs: HERMES_TIMEOUT_MS - 20_000, prompt }),
          signal: ctl.signal,
        });
        const raw = await r.text().catch(() => "");
        let b: { ok?: boolean; output?: string; engine_used?: string; error?: string } = {};
        try {
          b = JSON.parse(raw) as typeof b;
        } catch {
          b = { error: `non_json_body http_${r.status}` }; // surfaces via callWithFallback's failure log
        }
        const ok = r.status === 200 && b?.ok === true;
        return {
          ok,
          output: ok ? String(b?.output ?? "") : String(b?.error ?? b?.output ?? `http_${r.status}`),
          engineUsed: b?.engine_used ?? engine,
          ms: null,
        };
      } finally {
        clearTimeout(t);
      }
    });
    if (res.failures.length > 0) {
      logger.warn("followup_hermes_fallback", { ok: res.ok, fallbacks: res.fallbacks, failures: res.failures });
    }
    return { ok: res.ok, output: res.output, engineUsed: res.engineUsed };
  };
}

function defaultSmartleadReply(apiKey: string): FollowupPorts["smartleadReply"] {
  return async ({ campaignId, statsId, bodyHtml, messageId }) => {
    try {
      const url = `${SMARTLEAD_BASE}/campaigns/${campaignId}/reply-email-thread?api_key=${apiKey}`;
      const body: Record<string, unknown> = { email_stats_id: statsId, email_body: bodyHtml };
      if (messageId) body["reply_message_id"] = messageId;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": SMARTLEAD_UA, Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const text = (await r.text().catch(() => "")).slice(0, 300);
      return { ok: r.status >= 200 && r.status < 300, detail: `http_${r.status} ${text}` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message?.slice(0, 200) ?? "fetch_failed" };
    }
  };
}

function buildDefaultPorts(redis: Redis | null): FollowupPorts {
  const hermesToken = process.env["HERMES_TASK_TOKEN"] ?? "";
  const smartleadApiKey = process.env["SMARTLEAD_API_KEY"] ?? "";
  return {
    hermes: defaultHermes(hermesToken),
    telegram: defaultTelegram(),
    smartleadReply: defaultSmartleadReply(smartleadApiKey),
    artifacts: {
      async get(key) {
        return redis ? redis.get(key) : null;
      },
      async set(key, value) {
        if (redis) await redis.set(key, value, "EX", ARTIFACT_TTL_SECONDS);
      },
    },
    onceKey: async (key) => {
      if (!redis) return true; // no Redis → prefer a duplicate alarm over silence
      try {
        return (await redis.set(key, "1", "EX", OFF_ALARM_WINDOW_S, "NX")) === "OK";
      } catch {
        return true;
      }
    },
    now: () => new Date(),
    hermesToken,
    smartleadApiKey,
  };
}

// ---------------------------------------------------------------------------
// Row shapes.
// ---------------------------------------------------------------------------

interface ParkedRow {
  run_id: string;
  step_id: string;
  status: string;
  started_at: string;
}

interface ReplyRow {
  id: string;
  lead_email: string;
  campaign_id: number | string | null;
  payload: unknown;
  received_at: string;
  stage: string | null;
  note: string | null;
}

interface FollowupMeta {
  eventId: string;
  email: string;
  campaignId: number | null;
  statsId: string | null;
  messageId: string | null;
  intent: FollowupIntent;
  trilha: "geo" | "aistack" | null;
}

export interface FollowupScanResult {
  parked: number;
  sent: number;
  manual: number;
  rejected: number;
  expired: number;
  scanned: number;
  proposed: number;
  discarded: number;
  unsubscribed: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Shared writes (marker discipline: artifact BEFORE notification).
// ---------------------------------------------------------------------------

/** Append one "[followup] …" line; head-trims to 3900 so the marker survives
 *  the 4000 note cap (recycle-scan's lesson — a truncated marker re-proposes
 *  forever). Creates the contact when the webhook has not (defensive). */
async function writeMarker(
  sql: postgres.Sql,
  email: string,
  line: string,
  stage: Stage | null
): Promise<void> {
  await sql`
    /* fu:mark */
    INSERT INTO crm_contact (email, stage, note, updated_at)
    VALUES (${email}, ${stage ?? "contacted"}, ${line}, NOW())
    ON CONFLICT (email) DO UPDATE SET
      note = LEFT(COALESCE(crm_contact.note || E'\n', ''), 3900) || ${line},
      stage = COALESCE(${stage}, crm_contact.stage),
      updated_at = NOW()
  `;
}

async function finishFollowupStep(
  sql: postgres.Sql,
  stepId: string,
  status: "succeeded" | "failed",
  summary: string
): Promise<void> {
  await sql`
    /* fu:step-decide */
    UPDATE ops.agent_step
       SET status = ${status}, summary = ${summary.slice(0, 490)}
     WHERE id = ${stepId}::uuid`;
}

async function finishFollowupRun(
  sql: postgres.Sql,
  runId: string,
  status: "succeeded" | "failed"
): Promise<void> {
  await sql`
    /* fu:run-finish */
    UPDATE ops.agent_run SET status = ${status}, ended_at = NOW()
     WHERE id = ${runId}::uuid`;
}

// ---------------------------------------------------------------------------
// The job.
// ---------------------------------------------------------------------------

export async function runFollowupScan(
  sql: postgres.Sql,
  redis: Redis | null,
  overrides: Partial<FollowupPorts> = {}
): Promise<FollowupScanResult> {
  const ports: FollowupPorts = { ...buildDefaultPorts(redis), ...overrides };
  const result: FollowupScanResult = {
    parked: 0,
    sent: 0,
    manual: 0,
    rejected: 0,
    expired: 0,
    scanned: 0,
    proposed: 0,
    discarded: 0,
    unsubscribed: 0,
    skipped: 0,
  };

  await resolveParkedGates(sql, ports, result);
  await proposeNewFollowups(sql, ports, result);

  logger.info("followup_scan_done", { ...result });
  return result;
}

// ---- Phase A: decide the parked gates (approved / rejected / expired) ------

async function resolveParkedGates(
  sql: postgres.Sql,
  ports: FollowupPorts,
  result: FollowupScanResult
): Promise<void> {
  const parked = (await sql`
    /* fu:parked */
    SELECT r.id AS run_id, s.id AS step_id, s.status, s.started_at::text AS started_at
      FROM ops.agent_run r
      JOIN ops.agent_step s ON s.run_id = r.id AND s.node = 'approval'
     WHERE r.graph = ${FOLLOWUP_GRAPH} AND r.status = 'running'
     ORDER BY s.started_at ASC
     LIMIT 50
  `) as unknown as ParkedRow[];
  result.parked = parked.length;

  for (const row of parked) {
    const draftKey = `graphrun:${row.run_id}:draft`;
    const metaKey = `graphrun:${row.run_id}:meta`;
    let meta: FollowupMeta | null = null;
    try {
      meta = JSON.parse((await ports.artifacts.get(metaKey)) ?? "null") as FollowupMeta | null;
    } catch {
      meta = null;
    }
    const masked = meta ? maskEmail(meta.email) : "lead ?";

    if (row.status === "waiting") {
      const ageH = (ports.now().getTime() - new Date(row.started_at).getTime()) / 3_600_000;
      if (!Number.isFinite(ageH) || ageH < FOLLOWUP_APPROVAL_TIMEOUT_HOURS) continue;
      // 96h of silence = rejection-by-silence. NOTHING is sent.
      await finishFollowupStep(
        sql,
        row.step_id,
        "failed",
        `approval timed out after ${FOLLOWUP_APPROVAL_TIMEOUT_HOURS}h — silence = rejection, nothing sent`
      );
      await finishFollowupRun(sql, row.run_id, "failed");
      if (meta) {
        await writeMarker(sql, meta.email, followupMarkerLine("expirado", meta.eventId, ports.now()), null);
      }
      await ports.telegram(
        `⏳ FOLLOW-UP EXPIROU (${masked}): 96h sem decisão — nada foi enviado. O lead segue no CRM; responda à mão no SmartLead se ainda quiser.`
      );
      result.expired += 1;
      continue;
    }

    if (row.status === "failed" || row.status === "skipped") {
      // Founder pressed reject (or the step was closed elsewhere): nothing sent.
      await finishFollowupRun(sql, row.run_id, "failed");
      if (meta) {
        await writeMarker(sql, meta.email, followupMarkerLine("rejeitado", meta.eventId, ports.now()), null);
      }
      logger.info("followup_rejected", { runId: row.run_id });
      result.rejected += 1;
      continue;
    }

    if (row.status !== "succeeded") continue; // 'running' should not happen; leave it

    // Approved. The draft the founder saw is EXACTLY what may be sent.
    const draft = await ports.artifacts.get(draftKey);
    if (!draft || !meta) {
      await finishFollowupRun(sql, row.run_id, "failed");
      if (meta) {
        await writeMarker(
          sql,
          meta.email,
          followupMarkerLine("descartado", meta.eventId, ports.now(), "motivo=rascunho-perdido"),
          null
        );
      }
      await ports.telegram(
        `🔴 FOLLOW-UP APROVADO MAS PERDIDO (${masked}): o rascunho expirou do Redis antes do envio. NADA foi enviado — responda à mão no SmartLead.`
      );
      logger.error("followup_draft_lost", { runId: row.run_id, hasMeta: Boolean(meta) });
      result.manual += 1;
      continue;
    }

    const deliverManual = async (reason: string, unlock: string): Promise<void> => {
      await writeMarker(
        sql,
        meta!.email,
        followupMarkerLine("aprovado", meta!.eventId, ports.now(), "entrega=manual"),
        null
      );
      await finishFollowupRun(sql, row.run_id, "succeeded");
      await ports.telegram(
        [
          `🟠 FOLLOW-UP APROVADO — ENVIO MANUAL (${masked})`,
          `Motivo: ${reason}.`,
          unlock,
          ``,
          `Cole esta resposta no thread do lead no SmartLead (Master Inbox):`,
          `---`,
          draft,
        ].join("\n")
      );
      result.manual += 1;
    };

    if (!ports.smartleadApiKey) {
      await deliverManual(
        "SMARTLEAD_API_KEY ausente no worker",
        "Ação que destrava o envio automático: adicionar SMARTLEAD_API_KEY no serviço worker do Railway (a chave já existe como secret do GitHub)."
      );
      continue;
    }
    if (!meta.statsId || !meta.campaignId) {
      await deliverManual(
        `payload do webhook sem ${!meta.statsId ? "stats_id" : "campaign_id"} — a API de reply precisa dele`,
        "Sem ação de env: este evento específico não trouxe o id do thread."
      );
      continue;
    }

    const send = await ports.smartleadReply({
      campaignId: meta.campaignId,
      statsId: meta.statsId,
      bodyHtml: draftToHtml(draft),
      messageId: meta.messageId,
    });
    if (send.ok) {
      await writeMarker(sql, meta.email, followupMarkerLine("enviado", meta.eventId, ports.now(), "via=api"), null);
      await finishFollowupRun(sql, row.run_id, "succeeded");
      await ports.telegram(`✅ FOLLOW-UP ENVIADO (${masked}, intent=${meta.intent}) via SmartLead API.`);
      result.sent += 1;
    } else {
      // Ambiguous failure: the machine NEVER retries a send (a duplicate
      // reply is a send nobody approved). Honest fallback: founder pastes.
      logger.error("followup_send_failed", { runId: row.run_id, detail: errorHead(send.detail, 160) });
      await deliverManual(
        `API do SmartLead falhou (${errorHead(send.detail, 120)})`,
        "A máquina não re-tenta (risco de resposta duplicada)."
      );
    }
  }
}

// ---- Phase B: propose new follow-ups (reply → intent → draft → gate) -------

async function proposeNewFollowups(
  sql: postgres.Sql,
  ports: FollowupPorts,
  result: FollowupScanResult
): Promise<void> {
  const rows = (await sql`
    /* fu:replies */
    SELECT e.id, e.lead_email, e.campaign_id, e.payload, e.received_at::text AS received_at,
           c.stage, c.note
      FROM smartlead_event e
      LEFT JOIN crm_contact c ON c.email = e.lead_email
     WHERE e.event_type = 'EMAIL_REPLY'
       AND e.lead_email IS NOT NULL
       AND e.received_at > NOW() - make_interval(days => ${FOLLOWUP_LOOKBACK_DAYS})
     ORDER BY e.received_at ASC
     LIMIT 60
  `) as unknown as ReplyRow[];
  result.scanned = rows.length;

  const seenEmails = new Set<string>();
  const candidates: ReplyRow[] = [];
  for (const r of rows) {
    if (hasFollowupMarker(r.note, r.id)) continue; // idempotency: already handled
    if (seenEmails.has(r.lead_email)) continue; // one in flight per contact
    if (hasOpenFollowupProposal(r.note)) {
      result.skipped += 1;
      continue;
    }
    seenEmails.add(r.lead_email);
    candidates.push(r);
  }
  if (candidates.length === 0) return;

  if (!ports.hermesToken) {
    // Loud OFF, once per window: replies are waiting and the engine chain is
    // unreachable — nada degrada calado.
    if (await ports.onceKey("followup:hermes-off")) {
      await ports.telegram(
        `🔴 FOLLOW-UP DESLIGADO: ${candidates.length} resposta(s) de lead esperando, mas HERMES_TASK_TOKEN está ausente no worker — nenhuma intenção será classificada. Ação que destrava: setar HERMES_TASK_TOKEN no serviço worker.`
      );
    }
    logger.error("followup_no_executor", { waiting: candidates.length });
    result.skipped += candidates.length;
    return;
  }

  let budget = FOLLOWUP_BATCH_CAP;
  for (const row of candidates) {
    if (budget <= 0) {
      result.skipped += 1;
      continue;
    }
    const handled = await handleReply(sql, ports, row, result);
    if (handled === "proposed") budget -= 1;
    if (handled === "engines-down") {
      // All engines failed: stop the whole phase (the alarm already fired
      // via logs); the 30-min cadence retries naturally.
      result.skipped += 1;
      break;
    }
  }
}

async function handleReply(
  sql: postgres.Sql,
  ports: FollowupPorts,
  row: ReplyRow,
  result: FollowupScanResult
): Promise<"proposed" | "discarded" | "unsubscribed" | "engines-down"> {
  const now = ports.now();
  const replyText = extractReplyText(row.payload);
  const stage = (row.stage as Stage | null) ?? null;
  const trilha = extractTrilha(row.note);
  const masked = maskEmail(row.lead_email);

  const discard = async (motivo: string): Promise<"discarded"> => {
    await writeMarker(sql, row.lead_email, followupMarkerLine("descartado", row.id, now, `motivo=${motivo}`), null);
    logger.info("followup_discarded", { eventId: row.id, motivo });
    result.discarded += 1;
    return "discarded";
  };

  // A 'lost' contact said no already — a human no is final, whatever they sent.
  if (stage === "lost") return discard("lead-lost");
  if (!replyText) return discard("sem-texto");
  if (looksLikeAutoReplyNoise(replyText)) return discard("noise");

  // Intent — the model classifies, code decides.
  const intentRes = await ports.hermes(buildIntentPrompt(replyText));
  if (!intentRes.ok) {
    logger.error("followup_intent_engines_down", { eventId: row.id, error: errorHead(intentRes.output, 160) });
    return "engines-down";
  }
  const intent = parseIntent(intentRes.output);

  if (intent === "noise") return discard("noise");
  if (intent === "unsubscribe") {
    // FINAL. Stage moves by the SAME rule the webhook uses for
    // LEAD_UNSUBSCRIBED (human-set stages are never downgraded). No draft.
    const nextStage = nextStageFor(stage, "LEAD_UNSUBSCRIBED");
    await writeMarker(
      sql,
      row.lead_email,
      followupMarkerLine("descartado", row.id, now, "motivo=unsubscribe"),
      nextStage
    );
    logger.info("followup_unsubscribe", { eventId: row.id, stageWritten: nextStage });
    result.unsubscribed += 1;
    return "unsubscribed";
  }

  // Draftable human intent → draft (one redraft on validation failure).
  let draft = "";
  let validation = { ok: false, errors: ["no draft"] as string[] };
  for (let attempt = 0; attempt < 2 && !validation.ok; attempt += 1) {
    const prompt =
      attempt === 0
        ? buildDraftPrompt({ replyText, intent, trilha })
        : `${buildDraftPrompt({ replyText, intent, trilha })}\n\nYour previous draft broke these rules — fix ALL of them:\n${validation.errors.map((e) => `- ${e}`).join("\n")}\nPrevious draft:\n${draft}`;
    const res = await ports.hermes(prompt);
    if (!res.ok) {
      logger.error("followup_draft_engines_down", { eventId: row.id, error: errorHead(res.output, 160) });
      return "engines-down";
    }
    draft = res.output.trim().slice(0, DRAFT_MAX_CHARS + 200);
    validation = validateFollowupDraft(draft, trilha);
  }
  if (!validation.ok) {
    // Honest: the founder is TOLD (a silently dropped human reply is the
    // exact disease this job exists to cure), but nothing goes to the gate.
    await writeMarker(
      sql,
      row.lead_email,
      followupMarkerLine("descartado", row.id, now, "motivo=rascunho-invalido"),
      null
    );
    await ports.telegram(
      [
        `🟠 FOLLOW-UP SEM RASCUNHO VÁLIDO (${masked}, intent=${intent})`,
        `O validador de código reprovou 2 tentativas (${validation.errors.slice(0, 3).join("; ")}).`,
        `Responda à mão no SmartLead. O lead escreveu:`,
        `"${replyText.slice(0, 400)}"`,
      ].join("\n")
    );
    result.discarded += 1;
    return "discarded";
  }

  // PORTÃO — artifact first (run + step + Redis + marker), Telegram second.
  const runRows = (await sql`
    /* fu:run-start */
    INSERT INTO ops.agent_run (graph, trigger, vp_owner)
    VALUES (${FOLLOWUP_GRAPH}, 'cron:followup-scan', 'sales')
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  const runId = runRows[0]!.id;
  const stepRows = (await sql`
    /* fu:step-start */
    INSERT INTO ops.agent_step (run_id, node, status, summary)
    VALUES (${runId}::uuid, 'approval', 'waiting', 'awaiting human decision')
    RETURNING id
  `) as unknown as Array<{ id: string }>;
  const stepId = stepRows[0]!.id;

  const meta: FollowupMeta = {
    eventId: row.id,
    email: row.lead_email,
    campaignId: Number.isFinite(Number(row.campaign_id)) && row.campaign_id !== null ? Number(row.campaign_id) : null,
    ...extractReplyRouting(row.payload),
    intent,
    trilha,
  };
  await ports.artifacts.set(`graphrun:${runId}:draft`, draft);
  await ports.artifacts.set(`graphrun:${runId}:meta`, JSON.stringify(meta));
  await writeMarker(sql, row.lead_email, followupMarkerLine("proposto", row.id, now, `intent=${intent}`), null);

  await ports.telegram(
    [
      `🟡 APROVAÇÃO NECESSÁRIA — follow-up de resposta (${masked}, trilha=${trilha ?? "?"}, intent=${intent})`,
      `O lead respondeu ao cold e-mail:`,
      `"${replyText.slice(0, 400)}"`,
      ``,
      `Resposta proposta (aprovar = ENVIAR exatamente este texto no thread via SmartLead):`,
      `---`,
      draft,
      `---`,
      `Silêncio por ${FOLLOWUP_APPROVAL_TIMEOUT_HOURS}h = rejeição, nada é enviado.`,
      `(fallback: POST /api/v1/operator/agent-steps/${stepId}/finish status=succeeded|failed)`,
    ].join("\n"),
    [
      { text: "✅ Aprovar e enviar", data: `ap:${stepId}` },
      { text: "❌ Rejeitar", data: `rj:${stepId}` },
    ]
  );
  logger.info("followup_proposed", { eventId: row.id, runId, intent, trilha });
  result.proposed += 1;
  return "proposed";
}
