/**
 * Worker environment configuration — validated at boot (10.B.5/10.B.13).
 *
 * Mirror of apps/api/src/config.ts: no scattered process.env reads for the
 * critical connection strings, and NO silent localhost fallback. Before this
 * file, the worker booted with `REDIS_URL ?? "redis://localhost:6379"` — in a
 * production container that means every BullMQ worker connects to a Redis
 * that does not exist, jobs never run, and the process stays "healthy".
 * Nada degrada calado: missing required vars → structured log + exit(1),
 * so Railway restarts loudly instead of serving a dead worker.
 *
 * Production additionally requires the alarm/approval channel to be wired
 * (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) and the Hermes task bearer
 * (HERMES_TASK_TOKEN): the graph tick's human gates and its failure alarms
 * both die silently without them — exactly the 18-20/08 failure mode.
 */

import { z } from "zod";
import { logger } from "../../../packages/shared/src/logger";

const envSchema = z
  .object({
    // Required always — the worker is useless without either.
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    REDIS_URL: z.string().min(1, "REDIS_URL is required (no localhost fallback)"),

    // Required in production (superRefine below) — optional in dev/test.
    HERMES_TASK_TOKEN: z.string().optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),

    // Health listener port (Railway injects PORT).
    PORT: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : 8080))
      .pipe(z.number().int().min(1).max(65535)),

    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV !== "production") return;
    for (const field of ["HERMES_TASK_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] as const) {
      if (!val[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required in production — without it approvals/alarms fail silently (10.B.5).`,
        });
      }
    }
  });

export type WorkerConfig = z.infer<typeof envSchema>;

/**
 * Pure parse (test seam): returns the zod result without exiting the process.
 * Boot uses validateEnv() below, which logs field NAMES (never values) and
 * exits 1 on failure.
 */
export function parseWorkerEnv(
  env: Record<string, string | undefined>
): ReturnType<typeof envSchema.safeParse> {
  return envSchema.safeParse(env);
}

let _config: WorkerConfig | null = null;

/**
 * Validate-once, lazily (so unit tests can import parseWorkerEnv without the
 * module exiting the process). index.ts calls this as its FIRST act, so the
 * behaviour at boot is identical to a module-load validation.
 */
export function getWorkerConfig(): WorkerConfig {
  if (_config) return _config;
  const result = parseWorkerEnv(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    // Names only — never values.
    logger.error("worker_env_validation_failed", { issues });
    process.exit(1);
  }
  _config = result.data;
  return _config;
}
