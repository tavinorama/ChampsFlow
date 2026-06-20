/**
 * Environment configuration — validated at boot.
 *
 * Hard rule: no process.env.X reads scattered in code. All env access
 * goes through the validated `config` object exported from this file.
 *
 * Missing required vars → structured log + process.exit(1).
 */

import { z } from "zod";
import { logger } from "../../../packages/shared/src/logger";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Redis (ioredis — declared dep in package.json)
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // Supabase Auth
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),

  // LLM providers
  ANTHROPIC_API_KEY: z.string().optional(),
  AWS_BEDROCK_REGION: z.string().optional(),

  // Tenant routing
  DEFAULT_TENANT_REGION: z.enum(["eu", "us"]).default("us"),

  // OAuth platforms — optional (only needed when connect endpoints are tested)
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_REDIRECT_URI: z.string().optional(),
  INSTAGRAM_CLIENT_ID: z.string().optional(),
  INSTAGRAM_CLIENT_SECRET: z.string().optional(),
  INSTAGRAM_REDIRECT_URI: z.string().optional(),

  // Upstash Redis (used by existing route modules for rate limiting + OAuth state)
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // OAuth token encryption key (AES-256-GCM — field-level encryption for social tokens)
  OAUTH_TOKEN_KEY: z.string().min(32, "OAUTH_TOKEN_KEY must be at least 32 characters"),

  // Frontend origin (for CORS)
  WEB_ORIGIN: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),

  // Admin internal key (for admin panel network boundary enforcement)
  ADMIN_INTERNAL_KEY: z.string().optional(),

  // DPA version gate (CI-1): current DPA version string (e.g. "1.0").
  // Users with users.current_dpa_version !== this value are re-prompted on next login.
  // requireDpaAcknowledged middleware reads process.env.DPA_CURRENT_VERSION directly
  // (not config) to allow hot-reload without restart; config validation still checks it.
  DPA_CURRENT_VERSION: z.string().optional(),

  // Server
  PORT: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 3001))
    .pipe(z.number().int().min(1).max(65535)),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Observability
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).optional(),
  SERVICE_NAME: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

// ---------------------------------------------------------------------------
// Boot-time validation
// ---------------------------------------------------------------------------

function validateEnv(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    logger.error("env_validation_failed", { issues });
    process.exit(1);
  }

  return result.data;
}

// Singleton — validated once at module load time.
export const config: Config = validateEnv();
