/**
 * context-readiness.ts — B13 (Codex D05, 23/09). Is the content machine
 * wired to its two sources of REAL context, or is it writing from memory?
 *
 * What happened. The worker reads SIGNAL_ENGINE_URL / SIGNAL_ENGINE_API_KEY
 * (the Signal Engine's "where to act" queue) and OZVOR_OWN_BRAND_ID (our own
 * Do Next cards). Both are optional and fail-open by design: absent, the
 * cells run on their own memory. On 23/09 none of the three was set on the
 * production worker, so no graph had ever received [__signals__] or
 * [__gaps__] — and the only place that said so was a null return value.
 * P16 (#653) made the absence visible per piece, in the approval box. This
 * makes it visible per DEPLOY: computed once at worker boot, logged loud,
 * stored in Redis for the operator health endpoint.
 *
 * Pure: env in, readiness out. No I/O here.
 */

export type WiringState = "wired" | "not_wired";

export interface ContextReadiness {
  signalEngine: { state: WiringState; missing: string[] };
  ownBrand: { state: WiringState; missing: string[]; idPrefix: string | null };
  /** True when at least one source is missing: the machine writes from memory. */
  degraded: boolean;
  checkedAt: string;
}

export const CONTEXT_READINESS_KEY = "ctx:readiness";
export const CONTEXT_READINESS_TTL_S = 3 * 24 * 3600;

const present = (v: string | undefined): boolean => typeof v === "string" && v.trim().length > 0;

export function computeContextReadiness(env: Record<string, string | undefined>, now: Date = new Date()): ContextReadiness {
  const seMissing = ["SIGNAL_ENGINE_URL", "SIGNAL_ENGINE_API_KEY"].filter((k) => !present(env[k]));
  const brandMissing = ["OZVOR_OWN_BRAND_ID"].filter((k) => !present(env[k]));
  const brandId = present(env["OZVOR_OWN_BRAND_ID"]) ? (env["OZVOR_OWN_BRAND_ID"] as string).trim() : null;
  const signalEngine = { state: (seMissing.length === 0 ? "wired" : "not_wired") as WiringState, missing: seMissing };
  const ownBrand = {
    state: (brandMissing.length === 0 ? "wired" : "not_wired") as WiringState,
    missing: brandMissing,
    idPrefix: brandId ? brandId.slice(0, 8) : null,
  };
  return { signalEngine, ownBrand, degraded: seMissing.length > 0 || brandMissing.length > 0, checkedAt: now.toISOString() };
}

/** One line for the boot log and the health endpoint. */
export function describeContextReadiness(r: ContextReadiness): string {
  const parts: string[] = [];
  parts.push(r.signalEngine.state === "wired" ? "Signal Engine: wired" : `Signal Engine: NOT wired (missing ${r.signalEngine.missing.join(", ")})`);
  parts.push(r.ownBrand.state === "wired" ? `own gaps: wired (brand ${r.ownBrand.idPrefix})` : `own gaps: NOT wired (missing ${r.ownBrand.missing.join(", ")})`);
  return parts.join(" · ") + (r.degraded ? " — content cells run from memory only" : "");
}

export function parseContextReadiness(raw: string | null | undefined): ContextReadiness | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<ContextReadiness>;
    if (!p.signalEngine || !p.ownBrand || typeof p.checkedAt !== "string") return null;
    return p as ContextReadiness;
  } catch {
    return null;
  }
}
