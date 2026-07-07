/**
 * Platform provider-key overrides — shared by apps/api and apps/worker.
 *
 * The founder can rotate platform LLM/API keys from the admin dashboard
 * without touching Railway. Rotated keys are stored AES-256-GCM encrypted in
 * `platform_provider_key` (see migration 20260707000001) and injected into
 * process.env at boot + on a refresh interval, so every existing read path
 * (`process.env.ANTHROPIC_API_KEY` etc.) keeps working unchanged.
 *
 * Hard rules:
 *  - Write-only: nothing in this module ever returns or logs a plaintext key.
 *  - Env is the fallback: the ORIGINAL env values are snapshotted before the
 *    first override, and a provider with no DB row reverts to its boot value
 *    on the next refresh (covers remove-override without a restart).
 *  - Fail open: if the table doesn't exist yet (deploy before migration) or a
 *    blob fails to decrypt, the env keys stay in effect.
 */

import { decryptToken } from "./crypto";

export const PLATFORM_KEY_PROVIDERS = [
  "anthropic",
  "openai",
  "gemini",
  "perplexity",
  "serp",
] as const;

export type PlatformKeyProvider = (typeof PLATFORM_KEY_PROVIDERS)[number];

export const PLATFORM_KEY_ENV_VAR: Record<PlatformKeyProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  serp: "SERP_API_KEY",
};

export function isPlatformKeyProvider(v: string): v is PlatformKeyProvider {
  return (PLATFORM_KEY_PROVIDERS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Boot env snapshot
// ---------------------------------------------------------------------------

let bootEnvSnapshot: Record<PlatformKeyProvider, string | undefined> | null = null;

function ensureSnapshot(): Record<PlatformKeyProvider, string | undefined> {
  if (!bootEnvSnapshot) {
    const snap = {} as Record<PlatformKeyProvider, string | undefined>;
    for (const p of PLATFORM_KEY_PROVIDERS) {
      snap[p] = process.env[PLATFORM_KEY_ENV_VAR[p]];
    }
    bootEnvSnapshot = snap;
  }
  return bootEnvSnapshot;
}

/** True if the DEPLOYMENT env (not a dashboard override) provided this key. */
export function bootEnvHasKey(provider: PlatformKeyProvider): boolean {
  const v = ensureSnapshot()[provider];
  return typeof v === "string" && v.trim().length > 0;
}

/** Test-only: reset the snapshot so each test starts from the current env. */
export function __resetPlatformKeySnapshotForTests(): void {
  bootEnvSnapshot = null;
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

export interface PlatformKeyRow {
  provider: string;
  key_encrypted: Buffer | Uint8Array;
}

// Overlap guard (Hermes review): if a refresh is already running, callers
// share its promise instead of starting a second concurrent pass.
let inFlight: Promise<number> | null = null;

/**
 * Fetches override rows (caller supplies the query — api and worker have
 * different pg clients), decrypts them, and applies them to process.env.
 * Providers without an override revert to their boot env value.
 * Returns the number of active overrides. Concurrent calls coalesce.
 */
export function applyPlatformKeyOverrides(
  fetchRows: () => Promise<PlatformKeyRow[]>,
  log?: (event: string, meta: Record<string, unknown>) => void
): Promise<number> {
  if (inFlight) return inFlight;
  inFlight = applyPlatformKeyOverridesInner(fetchRows, log).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function applyPlatformKeyOverridesInner(
  fetchRows: () => Promise<PlatformKeyRow[]>,
  log?: (event: string, meta: Record<string, unknown>) => void
): Promise<number> {
  const snap = ensureSnapshot();

  let rows: PlatformKeyRow[];
  try {
    rows = await fetchRows();
  } catch (err) {
    // Hermes review: only undefined-table (42P01 — deploy before migration)
    // degrades silently to env keys. Every other DB error (permissions,
    // connectivity, corruption) is logged at error level and PROPAGATED so
    // callers decide: boot paths fall back to env keys visibly, the admin
    // write path fails the request instead of claiming success.
    const code = (err as { code?: string }).code;
    if (code === "42P01") {
      log?.("platform_keys_refresh_skipped", { reason: "table_missing" });
      return 0;
    }
    log?.("platform_keys_refresh_failed", {
      code: code ?? "unknown",
      message: (err as Error).message?.slice(0, 120) ?? "unknown",
    });
    throw err;
  }

  const overridden = new Set<PlatformKeyProvider>();
  for (const row of rows) {
    if (!isPlatformKeyProvider(row.provider)) continue;
    try {
      const blob = Buffer.isBuffer(row.key_encrypted)
        ? row.key_encrypted
        : Buffer.from(row.key_encrypted);
      const plaintext = decryptToken(blob);
      if (plaintext.trim().length === 0) continue;
      process.env[PLATFORM_KEY_ENV_VAR[row.provider]] = plaintext;
      overridden.add(row.provider);
    } catch {
      log?.("platform_key_decrypt_failed", { provider: row.provider });
    }
  }

  for (const p of PLATFORM_KEY_PROVIDERS) {
    if (overridden.has(p)) continue;
    const orig = snap[p];
    if (typeof orig === "string") {
      process.env[PLATFORM_KEY_ENV_VAR[p]] = orig;
    } else {
      delete process.env[PLATFORM_KEY_ENV_VAR[p]];
    }
  }

  return overridden.size;
}

// ---------------------------------------------------------------------------
// Admin write-path validation
// ---------------------------------------------------------------------------

/**
 * Validates a key submitted from the admin panel. Returns an error message or
 * null when valid. Caller must trim before storing. The character blocklist
 * exists because pasted keys picking up stray characters is a real failure
 * mode (a trailing "|" broke the LinkedIn OAuth client id in production).
 */
export function validatePlatformKeyInput(provider: string, key: string): string | null {
  if (!isPlatformKeyProvider(provider)) return "unknown provider";
  const k = key.trim();
  if (k.length < 20) return "key looks too short";
  if (k.length > 500) return "key looks too long";
  if (/\s/.test(k)) return "key contains whitespace";
  if (/[|<>"'`]/.test(k)) return "key contains an invalid character";
  return null;
}
