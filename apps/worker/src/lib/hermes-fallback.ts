/**
 * hermes-fallback.ts — the engine fallback chain for Hermes /task calls,
 * on OUR side of the wire.
 *
 * Why (21–22/08): the worker pinned `engine: "claude"` and made ONE call. When
 * the Claude OAuth session on the VPS expired ("Failed to authenticate: OAuth
 * session expired and could not be refreshed"), every LLM step of every graph
 * failed for 26 hours with `fallbacks=0` — Hermes does not fall back when the
 * caller pins an engine, and we never asked for another. House rule
 * (feedback 12/08): "chamada única sem fallback = defeito de projeto" — kimi
 * replaces claude AND codex. This module is that rule, as code.
 *
 * Pure: takes the engine list and a `call(engine)` function, returns the first
 * success or the consolidated failure. Testable with a fake call. The caller
 * decides alarms (once per window, never per step).
 */

export interface EngineCallResult {
  ok: boolean;
  output: string;
  engineUsed: string | null;
  ms: number | null;
}

export interface FallbackResult extends EngineCallResult {
  /** How many engines failed before this result (0 = primary worked). */
  fallbacks: number;
  /** The engines that failed, with a short error each — for logs/alarms. */
  failures: Array<{ engine: string; error: string }>;
}

export const DEFAULT_HERMES_ENGINES = ["claude", "codex", "kimi"] as const;

/** Parse HERMES_ENGINES="claude,codex,kimi"; falls back to the default chain. */
export function parseEngineChain(raw: string | undefined): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : [...DEFAULT_HERMES_ENGINES];
}

/** Short, PII-free error head for summaries/alarms. */
export function errorHead(output: string, max = 120): string {
  return (output || "no output").replace(/\s+/g, " ").slice(0, max);
}

export async function callWithFallback(
  engines: readonly string[],
  call: (engine: string) => Promise<EngineCallResult>
): Promise<FallbackResult> {
  const failures: Array<{ engine: string; error: string }> = [];
  for (const engine of engines) {
    let res: EngineCallResult;
    try {
      res = await call(engine);
    } catch (err) {
      res = { ok: false, output: (err as Error)?.message ?? "throw", engineUsed: engine, ms: null };
    }
    if (res.ok) {
      return { ...res, engineUsed: res.engineUsed ?? engine, fallbacks: failures.length, failures };
    }
    failures.push({ engine, error: errorHead(res.output) });
  }
  const summary = failures.map((f) => `${f.engine}: ${f.error}`).join(" | ");
  return {
    ok: false,
    output: `all engines failed (${failures.length}) — ${summary}`,
    engineUsed: null,
    ms: null,
    fallbacks: failures.length,
    failures,
  };
}
