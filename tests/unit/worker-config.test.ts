/**
 * Worker boot env validation (10.B.5/10.B.13) — the contract that killed the
 * "dead worker looks alive" class: REDIS_URL/DATABASE_URL always required (no
 * localhost fallback), and in production the alarm/approval channel
 * (TELEGRAM_*) + HERMES_TASK_TOKEN are required too.
 *
 * Also pins the worker /healthz snapshot: ok only when Redis AND Postgres
 * answer; either failing → degraded (503 at the listener).
 */

import { describe, it, expect } from "vitest";
import { parseWorkerEnv } from "../../apps/worker/src/config";
import { healthSnapshot } from "../../apps/worker/src/health";

const BASE = {
  DATABASE_URL: "postgres://u:p@host:5432/db",
  REDIS_URL: "redis://host:6379",
};

describe("parseWorkerEnv", () => {
  it("accepts the minimal dev env (DATABASE_URL + REDIS_URL)", () => {
    const r = parseWorkerEnv({ ...BASE, NODE_ENV: "development" });
    expect(r.success).toBe(true);
  });

  it("rejects a missing REDIS_URL — no localhost fallback anywhere", () => {
    const r = parseWorkerEnv({ DATABASE_URL: BASE.DATABASE_URL });
    expect(r.success).toBe(false);
    const fields = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(fields).toContain("REDIS_URL");
  });

  it("rejects a missing DATABASE_URL", () => {
    const r = parseWorkerEnv({ REDIS_URL: BASE.REDIS_URL });
    expect(r.success).toBe(false);
  });

  it("production additionally requires HERMES_TASK_TOKEN + TELEGRAM_*", () => {
    const r = parseWorkerEnv({ ...BASE, NODE_ENV: "production" });
    expect(r.success).toBe(false);
    const fields = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(fields).toEqual(
      expect.arrayContaining(["HERMES_TASK_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"])
    );
  });

  it("production boots when the alarm channel is fully wired", () => {
    const r = parseWorkerEnv({
      ...BASE,
      NODE_ENV: "production",
      HERMES_TASK_TOKEN: "t",
      TELEGRAM_BOT_TOKEN: "b",
      TELEGRAM_CHAT_ID: "c",
      PORT: "8080",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.PORT).toBe(8080);
  });

  it("dev/test never require the production-only vars", () => {
    expect(parseWorkerEnv({ ...BASE, NODE_ENV: "test" }).success).toBe(true);
  });
});

describe("worker healthSnapshot", () => {
  const okSql = (() => {
    const sql = () => Promise.resolve([{ "?column?": 1 }]);
    return sql as unknown as import("postgres").Sql;
  })();
  const badSql = (() => {
    const sql = () => Promise.reject(new Error("db down"));
    return sql as unknown as import("postgres").Sql;
  })();

  it("ok when Redis and Postgres both answer", async () => {
    const snap = await healthSnapshot({
      redis: { ping: async () => "PONG" },
      getSql: () => okSql,
    });
    expect(snap).toEqual({ ok: true, checks: { redis: "ok", postgres: "ok" } });
  });

  it("degraded when Redis fails", async () => {
    const snap = await healthSnapshot({
      redis: { ping: async () => { throw new Error("redis down"); } },
      getSql: () => okSql,
    });
    expect(snap.ok).toBe(false);
    expect(snap.checks["redis"]).toBe("error");
  });

  it("degraded when Postgres fails", async () => {
    const snap = await healthSnapshot({
      redis: { ping: async () => "PONG" },
      getSql: () => badSql,
    });
    expect(snap.ok).toBe(false);
    expect(snap.checks["postgres"]).toBe("error");
  });
});
