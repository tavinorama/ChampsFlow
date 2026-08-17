/**
 * Telegram approval webhook (17/08) — the buttons the founder asked for.
 *
 * Pins the contract: wrong secret → 404 (route stays invisible); a tap from a
 * stranger's chat is ignored; ✅ finishes the step succeeded (the #445 door);
 * ❌ asks "why?" and parks the step id; the founder's reply finishes the step
 * failed with the reason as summary (the sphere's memory). Driven through the
 * real Hono route with a fake db + fake Redis + fetch stubbed (no Telegram
 * calls leave the test).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const redisStore = new Map<string, string>();
vi.mock("../../apps/api/src/shared-redis", () => ({
  tryGetSharedRedis: () => ({
    async set(k: string, v: string) { redisStore.set(k, v); return "OK"; },
    async get(k: string) { return redisStore.get(k) ?? null; },
    async del(k: string) { return redisStore.delete(k) ? 1 : 0; },
  }),
  getSharedRedis: () => { throw new Error("not used"); },
}));

const finished: Array<{ stepId: string; status: string; summary: string | null }> = [];
vi.mock("../../apps/api/src/lib/agent-substrate", () => ({
  finishStep: async (_db: unknown, stepId: string, input: { status: string; summary?: string | null }) => {
    finished.push({ stepId, status: input.status, summary: input.summary ?? null });
  },
}));

const SECRET = "s3cret";
const CHAT = "12345";
const STEP = "0f1e2d3c-4b5a-4c6d-8e7f-90a1b2c3d4e5";

process.env["TELEGRAM_BOT_TOKEN"] = "bot-token";
process.env["TELEGRAM_CHAT_ID"] = CHAT;
process.env["TELEGRAM_WEBHOOK_SECRET"] = SECRET;

import { Hono } from "hono";
import { registerTelegramRoutes, parseDecision } from "../../apps/api/src/routes/telegram";
import type { PostgresClient } from "../../packages/shared/src/db-client";

let stepStatus = "waiting";
const db = {
  async query(sql: string) {
    if (sql.includes("FROM ops.agent_step s JOIN ops.agent_run r")) {
      return { rows: [{ status: stepStatus, graph: "sphere-x" }] };
    }
    return { rows: [] };
  },
} as unknown as PostgresClient;

const tgCalls: Array<{ method: string; body: Record<string, unknown> }> = [];
let promptMessageId = 777;

beforeEach(() => {
  finished.length = 0;
  tgCalls.length = 0;
  redisStore.clear();
  stepStatus = "waiting";
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = String(url).split("/").pop() ?? "";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    tgCalls.push({ method, body });
    return new Response(JSON.stringify({ ok: true, result: { message_id: promptMessageId } }), { status: 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());

function app(): Hono {
  const a = new Hono();
  registerTelegramRoutes(a, db);
  return a;
}
const post = (secret: string, update: unknown) =>
  app().request(`/api/telegram/webhook/${secret}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });

describe("parseDecision", () => {
  it("maps ap:/rj: + uuid; rejects garbage", () => {
    expect(parseDecision(`ap:${STEP}`)).toEqual({ action: "approve", stepId: STEP });
    expect(parseDecision(`rj:${STEP}`)).toEqual({ action: "reject", stepId: STEP });
    expect(parseDecision("ap:not-a-uuid")).toBeNull();
    expect(parseDecision(undefined)).toBeNull();
  });
});

describe("POST /api/telegram/webhook/:secret", () => {
  it("wrong secret → 404, nothing happens", async () => {
    const res = await post("nope", { callback_query: { id: "1", data: `ap:${STEP}`, message: { message_id: 1, chat: { id: CHAT } } } });
    expect(res.status).toBe(404);
    expect(finished).toEqual([]);
  });

  it("a tap from a stranger's chat is ignored (200, no state change)", async () => {
    const res = await post(SECRET, { callback_query: { id: "1", data: `ap:${STEP}`, message: { message_id: 1, chat: { id: "999" } } } });
    expect(res.status).toBe(200);
    expect(finished).toEqual([]);
  });

  it("✅ Aprovar → step finished succeeded (the #445 door), buttons removed, ack sent", async () => {
    const res = await post(SECRET, { callback_query: { id: "cq1", data: `ap:${STEP}`, message: { message_id: 10, chat: { id: CHAT } } } });
    expect(res.status).toBe(200);
    expect(finished).toEqual([{ stepId: STEP, status: "succeeded", summary: "founder approved via Telegram button" }]);
    expect(tgCalls.map((c) => c.method)).toEqual(expect.arrayContaining(["answerCallbackQuery", "editMessageReplyMarkup", "sendMessage"]));
  });

  it("❌ Rejeitar → asks WHY (force_reply) and parks the step; the reply finishes it failed WITH the reason", async () => {
    // tap reject
    const r1 = await post(SECRET, { callback_query: { id: "cq2", data: `rj:${STEP}`, message: { message_id: 11, chat: { id: CHAT } } } });
    expect(r1.status).toBe(200);
    expect(finished).toEqual([]); // not decided yet — waiting for the why
    const prompt = tgCalls.find((c) => c.method === "sendMessage" && (c.body["reply_markup"] as { force_reply?: boolean } | undefined)?.force_reply);
    expect(prompt).toBeTruthy();
    expect(redisStore.get(`tg:pending_reason:${CHAT}:${promptMessageId}`)).toBe(STEP);

    // founder replies to the prompt
    const r2 = await post(SECRET, {
      message: { message_id: 12, text: "Too salesy. No numbers. Sounds like an ad.", chat: { id: CHAT }, reply_to_message: { message_id: promptMessageId } },
    });
    expect(r2.status).toBe(200);
    expect(finished).toEqual([{ stepId: STEP, status: "failed", summary: "rejected: Too salesy. No numbers. Sounds like an ad." }]);
    expect(redisStore.has(`tg:pending_reason:${CHAT}:${promptMessageId}`)).toBe(false);
  });

  it("a second tap on an already-decided step changes nothing", async () => {
    stepStatus = "succeeded";
    const res = await post(SECRET, { callback_query: { id: "cq3", data: `ap:${STEP}`, message: { message_id: 13, chat: { id: CHAT } } } });
    expect(res.status).toBe(200);
    expect(finished).toEqual([]);
    expect(tgCalls.some((c) => c.method === "answerCallbackQuery" && String(c.body["text"]).includes("já foi decidido"))).toBe(true);
  });
});
