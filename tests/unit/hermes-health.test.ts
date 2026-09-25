/**
 * hermes-health.test.ts — B10 (Codex D02, 23/09).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyEngineError,
  recordEngineHealth,
  readEngineHealth,
  summarizeEngineHealth,
  alarmOnFallback,
  fallbackAlarmText,
  engineHealthKey,
  HERMES_PRIMARY_DOWN_KEY,
  HERMES_ALL_DOWN_KEY,
  type HealthStore,
} from "../../packages/shared/src/hermes-health";

class FakeStore implements HealthStore {
  m = new Map<string, string>();
  async get(k: string) { return this.m.get(k) ?? null; }
  async set(k: string, v: string) { this.m.set(k, v); return "OK"; }
}

const CLAUDE_OAUTH = { engine: "claude", error: "Failed to authenticate: OAuth session expired and could not be refreshed" };
const CODEX_TIMEOUT = { engine: "codex", error: "timeout after 220000ms" };

describe("classifyEngineError — the cause, from the words Hermes gave back", () => {
  it("the two real ones from 21–24/09", () => {
    expect(classifyEngineError(CLAUDE_OAUTH.error)).toBe("auth");
    expect(classifyEngineError(CODEX_TIMEOUT.error)).toBe("timeout");
  });
  it("quota, unreachable, unknown", () => {
    expect(classifyEngineError("Your credit balance is too low")).toBe("quota");
    expect(classifyEngineError("http_503")).toBe("unreachable");
    expect(classifyEngineError("ECONNREFUSED 10.0.0.1:8080")).toBe("unreachable");
    expect(classifyEngineError("something odd")).toBe("unknown");
  });
});

describe("recordEngineHealth / readEngineHealth", () => {
  it("failures get a fail stamp with cause; the engine that answered gets an ok stamp", async () => {
    const store = new FakeStore();
    await recordEngineHealth(store, { ok: true, engineUsed: "kimi", failures: [CLAUDE_OAUTH, CODEX_TIMEOUT] }, new Date("2026-09-23T09:44:00Z"));
    const h = await readEngineHealth(store, ["claude", "codex", "kimi"]);
    expect(h.map((e) => [e.engine, e.status, e.cause])).toEqual([
      ["claude", "failing", "auth"],
      ["codex", "failing", "timeout"],
      ["kimi", "healthy", null],
    ]);
    expect(h[0]!.fix).toContain("re-autentique na VPS");
    expect(h[1]!.fix).toContain("fila do Hermes");
    expect(h[2]!.lastOkAt).toBe("2026-09-23T09:44:00.000Z");
  });
  it("a later success flips an engine back to healthy; the failure stays on record", async () => {
    const store = new FakeStore();
    await recordEngineHealth(store, { ok: true, engineUsed: "kimi", failures: [CLAUDE_OAUTH] }, new Date("2026-09-23T09:00:00Z"));
    await recordEngineHealth(store, { ok: true, engineUsed: "claude", failures: [] }, new Date("2026-09-24T09:00:00Z"));
    const [claude] = await readEngineHealth(store, ["claude"]);
    expect(claude!.status).toBe("healthy");
    expect(claude!.lastFailAt).toBe("2026-09-23T09:00:00.000Z");
    expect(claude!.cause).toBeNull();
  });
  it("nothing recorded → unknown, never healthy", () => {
    expect(summarizeEngineHealth("claude", null).status).toBe("unknown");
  });
  it("keys are per engine and the error head is short", async () => {
    const store = new FakeStore();
    await recordEngineHealth(store, { ok: false, engineUsed: null, failures: [{ engine: "codex", error: "x".repeat(500) }] });
    const raw = JSON.parse(store.m.get(engineHealthKey("codex"))!) as { lastError: string };
    expect(raw.lastError.length).toBe(120);
  });
});

describe("alarmOnFallback — once per window, never silent", () => {
  it("first fallback in the window alarms with cause and fix; the second does not", async () => {
    const sent: string[] = [];
    const seen = new Set<string>();
    const onceKey = async (k: string) => (seen.has(k) ? false : (seen.add(k), true));
    const res = { ok: true, engineUsed: "kimi", failures: [CLAUDE_OAUTH, CODEX_TIMEOUT] };
    expect(await alarmOnFallback({ res, source: "follow-up", onceKey, telegram: async (t) => { sent.push(t); } })).toEqual({ alarmed: true });
    expect(await alarmOnFallback({ res, source: "graphs", onceKey, telegram: async (t) => { sent.push(t); } })).toEqual({ alarmed: false });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("🟡 HERMES (follow-up)");
    expect(sent[0]).toContain("causa: auth");
    expect(sent[0]).toContain("claude login");
    expect(seen.has(HERMES_PRIMARY_DOWN_KEY)).toBe(true);
  });
  it("all engines down is a different key and a red line naming every cause", async () => {
    const sent: string[] = [];
    const res = { ok: false, engineUsed: null, failures: [CLAUDE_OAUTH, CODEX_TIMEOUT, { engine: "kimi", error: "http_503" }] };
    await alarmOnFallback({ res, source: "graphs", onceKey: async (k) => k === HERMES_ALL_DOWN_KEY, telegram: async (t) => { sent.push(t); } });
    expect(sent[0]).toContain("🔴 HERMES (graphs): TODOS os engines falharam (claude: auth, codex: timeout, kimi: unreachable)");
  });
  it("no failures → no alarm; a throwing onceKey still alarms (duplicate beats silence)", async () => {
    const sent: string[] = [];
    expect(await alarmOnFallback({ res: { ok: true, engineUsed: "claude", failures: [] }, source: "graphs", onceKey: async () => true, telegram: async (t) => { sent.push(t); } })).toEqual({ alarmed: false });
    await alarmOnFallback({ res: { ok: true, engineUsed: "kimi", failures: [CLAUDE_OAUTH] }, source: "graphs", onceKey: async () => { throw new Error("redis down"); }, telegram: async (t) => { sent.push(t); } });
    expect(sent).toHaveLength(1);
  });
  it("the text never carries a secret-shaped token", () => {
    const t = fallbackAlarmText({ ok: true, engineUsed: "kimi", failures: [{ engine: "claude", error: "Bearer abc123 rejected sk-ant-xyz" }] }, "graphs");
    expect(t).not.toContain("sk-ant-xyz");
  });
});

describe("the callers use it", () => {
  const root = join(__dirname, "../..");
  it("graph-tick and follow-up scan record health and share one alarm helper", () => {
    const tick = readFileSync(join(root, "apps/worker/src/jobs/graph-tick.ts"), "utf8");
    const scan = readFileSync(join(root, "apps/worker/src/jobs/followup-scan.ts"), "utf8");
    for (const src of [tick, scan]) {
      expect(src).toContain("recordEngineHealth(");
      expect(src).toContain("alarmOnFallback({");
    }
    expect(tick).toContain('source: "graphs"');
    expect(scan).toContain('source: "follow-up"');
    expect(tick).not.toContain("hermes:primary_down_alarm"); // moved to the shared module
  });
  it("the operator health endpoint reports functional health, and says what 'live' means", () => {
    const api = readFileSync(join(root, "apps/api/src/routes/api-keys.ts"), "utf8");
    expect(api).toContain("readEngineHealth(");
    expect(api).toContain("live means the API key is present, not that the engine answers");
  });
});
