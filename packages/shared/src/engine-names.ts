/**
 * engine-names.ts — one identity per engine (B4, Codex D23, 23/09).
 *
 * The product speaks two dialects for the same five engines. The audit
 * stores providers by the database's names (`google`, `dataforseo`); the
 * drift battery stores them by the LLM layer's names (`gemini`, `serp`).
 * The engine-confidence route joined the two literally, so Gemini and Google
 * AI Overviews came back with no status and the dashboard, which drops
 * null statuses, told the client "All 3 engines passed" on a five-engine
 * audit. Two engines vanished from the certification.
 *
 * Everything that compares engines across those two stores goes through
 * `toDriftEngine`. The drift names are canonical because the control
 * battery, the proof feed and the gateway already use them.
 */

/** Canonical ids, as the drift battery and the gateway name them. */
export const DRIFT_ENGINES = ["openai", "anthropic", "gemini", "perplexity", "serp"] as const;
export type DriftEngine = (typeof DRIFT_ENGINES)[number];

const AUDIT_TO_DRIFT: Record<string, DriftEngine> = {
  google: "gemini",
  dataforseo: "serp",
  openai: "openai",
  anthropic: "anthropic",
  gemini: "gemini",
  perplexity: "perplexity",
  serp: "serp",
};

/** Audit/DB provider name → canonical drift id. Unknown names pass through unchanged. */
export function toDriftEngine(provider: string): string {
  return AUDIT_TO_DRIFT[provider.trim().toLowerCase()] ?? provider;
}

/** Canonical ids for a list of audit providers: mapped, de-duplicated, order kept. */
export function toDriftEngines(providers: readonly string[]): string[] {
  const out: string[] = [];
  for (const p of providers) {
    const e = toDriftEngine(p);
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

/** What the client sees. Accepts either dialect. */
export const ENGINE_DISPLAY_LABEL: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
  google: "Gemini",
  perplexity: "Perplexity",
  serp: "Google AI Overviews",
  dataforseo: "Google AI Overviews",
};

export function engineLabel(engine: string): string {
  return ENGINE_DISPLAY_LABEL[engine.trim().toLowerCase()] ?? engine;
}
