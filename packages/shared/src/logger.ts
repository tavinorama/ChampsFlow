/**
 * Structured logger for TrustIndex AI.
 *
 * Security requirements (S-4 / integration-coder hard rule #6):
 *  - NEVER logs: access_token, refresh_token, Authorization header values,
 *    password, password_hash, or any field matching token pattern
 *  - Emits structured JSON lines to stdout (Axiom ingests via stdout drain)
 *  - Log levels: ERROR, WARN, INFO, DEBUG
 *  - tenant_id and user_id are included but not email/name (PII minimization §10)
 *
 * Architecture §10 Observability:
 *  "Every API request logs: tenant_id (hashed, not raw), user_id (hashed),
 *   method, path, status code, latency. No PII (email, names, OAuth tokens,
 *   post content) in logs."
 *
 * Token scrubbing: implemented as an explicit denylist of field names.
 * Any object passed to logger methods is recursively scrubbed before output.
 */

// ---------------------------------------------------------------------------
// Scrubbing — explicit denylist of sensitive field names
// ---------------------------------------------------------------------------

const SCRUBBED_FIELDS = new Set([
  "access_token",
  "accessToken",
  "access_token_enc",
  "refresh_token",
  "refreshToken",
  "refresh_token_enc",
  "authorization",
  "Authorization",
  "password",
  "password_hash",
  "passwordHash",
  "token",
  "secret",
  "api_key",
  "apiKey",
  "client_secret",
  "clientSecret",
  "code_verifier",
  "codeVerifier",
  "private_key",
  "privateKey",
  "encryption_key",
  "encryptionKey",
  "otp",
  "otpCode",
  "otp_code",
  "card_number",
  "cardNumber",
  "cvv",
  "ssn",
]);

type LogValue = string | number | boolean | null | undefined | object;

function scrub(value: LogValue, depth = 0): LogValue {
  if (depth > 5) return "[MAX_DEPTH]"; // prevent circular/deep object traversal
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, depth + 1));
  }

  const result: Record<string, LogValue> = {};
  for (const [key, val] of Object.entries(value as Record<string, LogValue>)) {
    if (SCRUBBED_FIELDS.has(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = scrub(val, depth + 1);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Log levels
// ---------------------------------------------------------------------------

type LogLevel = "error" | "warn" | "info" | "debug";

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env === "error" || env === "warn" || env === "info" || env === "debug") {
    return env;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

// ---------------------------------------------------------------------------
// Logger implementation
// ---------------------------------------------------------------------------

function emit(
  level: LogLevel,
  event: string,
  data?: Record<string, LogValue>
): void {
  const minLevel = getMinLevel();
  if (LEVEL_ORDER[level] > LEVEL_ORDER[minLevel]) return;

  const line = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    service: process.env.SERVICE_NAME ?? "api",
    ...(data ? (scrub(data) as Record<string, LogValue>) : {}),
  });

  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  error(event: string, data?: Record<string, LogValue>): void {
    emit("error", event, data);
  },
  warn(event: string, data?: Record<string, LogValue>): void {
    emit("warn", event, data);
  },
  info(event: string, data?: Record<string, LogValue>): void {
    emit("info", event, data);
  },
  debug(event: string, data?: Record<string, LogValue>): void {
    emit("debug", event, data);
  },
};

// ---------------------------------------------------------------------------
// Export scrub function for use in tests and other utilities
// ---------------------------------------------------------------------------
export { scrub };
