/**
 * landing-allowance.ts — pure Ozvor Pages entitlement math (#208).
 *
 * Extracted OUT of routes/landing.ts so the WORKER can import it without
 * dragging in the whole Hono route file. The worker's tsc followed
 * `import { computeLandingAllowance } from ".../routes/landing"` into
 * routes/landing.ts, which imports `hono` (absent from the worker's deps) →
 * the worker BUILD failed → the worker ran a stale build WITHOUT the
 * landing-generate consumer → every generation job sat in the queue forever
 * (0 sites ever generated). This module depends only on stripe's PLAN_LIMITS,
 * which is Hono-free, so both api and worker compile it cleanly.
 */

import { PLAN_LIMITS, type PlanTier } from "../integrations/stripe";

/**
 * Plan base (PLAN_LIMITS[tier].max_landing_sites) + purchased extra-site
 * credits. Pure — exported for unit testing and shared by api + worker.
 */
export function computeLandingAllowance(
  planTier: PlanTier,
  extraSites: number
): { maxSites: number; maxPagesPerSite: number } {
  const limits = PLAN_LIMITS[planTier] ?? PLAN_LIMITS.free;
  return {
    maxSites: limits.max_landing_sites + Math.max(0, extraSites),
    maxPagesPerSite: limits.max_pages_per_site,
  };
}
