/**
 * Worker HTTP health listener (10.B.5) — GET /healthz on PORT.
 *
 * The worker had NO health surface: Railway could not probe it, and with
 * restartPolicyMaxRetries exhausted a dead worker just stayed dead. This tiny
 * node:http server (no framework — the worker is not an API) answers:
 *
 *   GET /healthz → 200 {status:"ok"}       when Redis PING and Postgres
 *                                          SELECT 1 both succeed
 *                → 503 {status:"degraded"} otherwise (which check failed is
 *                                          in the body, never why — no
 *                                          connection strings, no errors)
 *
 * Wired as `healthcheckPath` in apps/worker/railway.json so Railway only
 * marks a deploy healthy when the worker can actually reach its stores,
 * and restarts it when it stops being able to.
 */

import { createServer, type Server } from "node:http";
import type Redis from "ioredis";
import type postgres from "postgres";
import { logger } from "../../../packages/shared/src/logger";

export interface HealthDeps {
  redis: Pick<Redis, "ping">;
  getSql: () => postgres.Sql;
}

export async function healthSnapshot(deps: HealthDeps): Promise<{
  ok: boolean;
  checks: Record<string, "ok" | "error">;
}> {
  const checks: Record<string, "ok" | "error"> = {};
  try {
    await deps.redis.ping();
    checks["redis"] = "ok";
  } catch {
    checks["redis"] = "error";
  }
  try {
    await deps.getSql()`SELECT 1`;
    checks["postgres"] = "ok";
  } catch {
    checks["postgres"] = "error";
  }
  return { ok: Object.values(checks).every((v) => v === "ok"), checks };
}

export function startHealthServer(port: number, deps: HealthDeps): Server {
  const server = createServer((req, res) => {
    if (req.method !== "GET" || (req.url ?? "").split("?")[0] !== "/healthz") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    void healthSnapshot(deps)
      .then(({ ok, checks }) => {
        res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            status: ok ? "ok" : "degraded",
            checks,
            // Deployed version, for the post-deploy smoke (10.B.3). Railway
            // injects RAILWAY_GIT_COMMIT_SHA; null locally.
            sha: process.env["RAILWAY_GIT_COMMIT_SHA"] ?? null,
          })
        );
      })
      .catch(() => {
        // healthSnapshot never throws, but the listener must never crash.
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "degraded", checks: {} }));
      });
  });
  server.listen(port, () => {
    logger.info("worker_health_listener_started", { port });
  });
  server.on("error", (err: Error) => {
    // A busy port must be loud — Railway's healthcheck would fail the deploy.
    logger.error("worker_health_listener_error", { message: err.message });
  });
  return server;
}
