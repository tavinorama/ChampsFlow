/**
 * telegram.ts — the bot webhook that turns Telegram BUTTONS into graph
 * decisions (founder 17/08: "uma caixa com approve ou reject, e quando houver
 * reject a pergunta do porquê, para alimentar o grafo").
 *
 * Flow:
 *   1. The runner posts an approval with two inline buttons whose
 *      callback_data is `ap:<stepId>` / `rj:<stepId>` (graph-runner.ts).
 *   2. Telegram calls POST /api/telegram/webhook/:secret with a callback_query.
 *      - ap → finishStep(stepId, succeeded) — the #445 route, same effect.
 *      - rj → we ask "Por quê?" with force_reply and park the pending stepId
 *        in Redis keyed by (chat, prompt message id), TTL 24h.
 *   3. The founder replies to that prompt; Telegram sends a message whose
 *      reply_to_message.message_id matches → finishStep(stepId, failed,
 *      summary = "rejected: <reason>"). The reason lands in ops.agent_step
 *      (hashes-never-text is for MODEL output; a human's one-line reason is
 *      the sphere's memory and is exactly what the founder asked to store).
 *   4. The next run of that sphere sees recent rejections in its [memory]
 *      block (graph-tick buildSnapshot adds "REJEICOES RECENTES").
 *
 * Auth: the URL secret (TELEGRAM_WEBHOOK_SECRET) — Telegram's recommended
 * pattern — plus the chat must be TELEGRAM_CHAT_ID (the founder's chat). Any
 * other chat is ignored with 200 (never leak state to strangers). Without the
 * env vars the route is a 404 (not wired). Idempotent: a repeated callback on
 * an already-finished step is answered politely and changes nothing.
 */

import { Hono } from "hono";
import type { PostgresClient } from "../../../../packages/shared/src/db-client";
import { logger } from "../../../../packages/shared/src/logger";
import { finishStep } from "../lib/agent-substrate";
import { tryGetSharedRedis } from "../shared-redis";

// Read lazily (per call): env may be injected after import (tests, hot boots).
const env = () => ({
  token: process.env["TELEGRAM_BOT_TOKEN"] ?? "",
  chat: process.env["TELEGRAM_CHAT_ID"] ?? "",
  secret: process.env["TELEGRAM_WEBHOOK_SECRET"] ?? "",
});
const PENDING_TTL_S = 24 * 3600;

interface TgUpdate {
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number | string } };
  };
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number | string };
    reply_to_message?: { message_id: number };
  };
}

async function tg(method: string, body: Record<string, unknown>): Promise<void> {
  const { token } = env();
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.error("telegram_api_failed", { method, message: (err as Error).message?.slice(0, 160) });
  }
}

/** Parse `ap:<uuid>` / `rj:<uuid>`; null for anything else. */
export function parseDecision(data: string | undefined): { action: "approve" | "reject"; stepId: string } | null {
  if (!data) return null;
  const m = /^(ap|rj):([0-9a-f-]{36})$/i.exec(data.trim());
  if (!m) return null;
  return { action: m[1]!.toLowerCase() === "ap" ? "approve" : "reject", stepId: m[2]! };
}

/** Is this step still awaiting a decision? (idempotency guard) */
async function stepIsWaiting(db: PostgresClient, stepId: string): Promise<{ waiting: boolean; graph: string | null }> {
  const { rows } = await db.query<{ status: string; graph: string }>(
    `SELECT s.status, r.graph FROM ops.agent_step s JOIN ops.agent_run r ON r.id = s.run_id WHERE s.id = $1`,
    [stepId]
  );
  const row = rows[0];
  return { waiting: row?.status === "waiting", graph: row?.graph ?? null };
}

export function registerTelegramRoutes(app: Hono, db: PostgresClient): void {
  app.post("/api/telegram/webhook/:secret", async (c) => {
    // Not wired → 404 (no hint that the route exists).
    const { token: TG_TOKEN, chat: TG_CHAT, secret: TG_SECRET } = env();
    if (!TG_SECRET || !TG_CHAT) return c.notFound();
    if (c.req.param("secret") !== TG_SECRET) return c.notFound();

    const update = (await c.req.json().catch(() => null)) as TgUpdate | null;
    if (!update) return c.json({ ok: true });

    // ---- 1) a button was tapped --------------------------------------------
    const cq = update.callback_query;
    if (cq) {
      const chatId = String(cq.message?.chat.id ?? "");
      if (chatId !== TG_CHAT) return c.json({ ok: true }); // stranger: ignore
      const decision = parseDecision(cq.data);
      if (!decision) {
        await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Botão desconhecido." });
        return c.json({ ok: true });
      }
      const { waiting, graph } = await stepIsWaiting(db, decision.stepId);
      if (!waiting) {
        await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Esse passo já foi decidido." });
        return c.json({ ok: true });
      }
      if (decision.action === "approve") {
        await finishStep(db, decision.stepId, { status: "succeeded", summary: "founder approved via Telegram button" });
        await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "✅ Aprovado. O graph segue no próximo tick." });
        await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message?.message_id, reply_markup: { inline_keyboard: [] } });
        await tg("sendMessage", { chat_id: chatId, text: `✅ Aprovado (${graph ?? "graph"}). Publica no próximo tick (≤10 min).` });
        logger.info("telegram_approval_approved", { stepId: decision.stepId, graph });
        return c.json({ ok: true });
      }
      // reject → ask why, remember which step the answer belongs to
      const redis = tryGetSharedRedis();
      await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Ok. Me diz o porquê (responda esta mensagem)." });
      await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message?.message_id, reply_markup: { inline_keyboard: [] } });
      // We need the id of the prompt we are about to send, so send and read it back.
      let promptId: number | null = null;
      try {
        const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `❌ Rejeitado (${graph ?? "graph"}). Por quê? Responda ESTA mensagem em uma frase. A esfera lê isso no próximo run.`,
            reply_markup: { force_reply: true, selective: true },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const j = (await res.json()) as { ok?: boolean; result?: { message_id?: number } };
        promptId = j?.result?.message_id ?? null;
      } catch (err) {
        logger.error("telegram_reject_prompt_failed", { message: (err as Error).message?.slice(0, 160) });
      }
      if (redis && promptId != null) {
        await redis.set(`tg:pending_reason:${chatId}:${promptId}`, decision.stepId, { ex: PENDING_TTL_S });
      } else {
        // No Redis / no prompt id: still honor the reject, without a reason.
        await finishStep(db, decision.stepId, { status: "failed", summary: "founder rejected via Telegram button (no reason captured)" });
        logger.warn("telegram_reject_without_reason", { stepId: decision.stepId, redis: Boolean(redis), promptId });
      }
      return c.json({ ok: true });
    }

    // ---- 2) a reply to our "why?" prompt -----------------------------------
    const msg = update.message;
    if (msg && msg.reply_to_message && typeof msg.text === "string") {
      const chatId = String(msg.chat.id);
      if (chatId !== TG_CHAT) return c.json({ ok: true });
      const redis = tryGetSharedRedis();
      if (!redis) return c.json({ ok: true });
      const key = `tg:pending_reason:${chatId}:${msg.reply_to_message.message_id}`;
      const stepId = await redis.get(key);
      if (!stepId) return c.json({ ok: true }); // a reply to something else
      const reason = msg.text.trim().slice(0, 400);
      const { waiting, graph } = await stepIsWaiting(db, stepId);
      if (waiting) {
        await finishStep(db, stepId, { status: "failed", summary: `rejected: ${reason}` });
        await tg("sendMessage", { chat_id: chatId, text: `Anotado (${graph ?? "graph"}): "${reason}". O run falha agora e a esfera aprende no próximo.` });
        logger.info("telegram_approval_rejected", { stepId, graph, reasonLen: reason.length });
      } else {
        await tg("sendMessage", { chat_id: chatId, text: "Esse passo já tinha sido decidido; guardei o motivo só como nota." });
      }
      await redis.del(key);
      return c.json({ ok: true });
    }

    return c.json({ ok: true });
  });
}
