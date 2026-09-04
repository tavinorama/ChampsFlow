/**
 * feature-flags.ts — build-time product gates.
 *
 * Not env-driven on purpose. These flags exist because a surface is not
 * *allowed* to ship yet, not because a deployment happens to lack a variable.
 * An env-driven gate silently turns itself on the moment someone sets a key,
 * which is exactly the failure mode the audit found; a constant here forces the
 * decision to be made in a reviewed diff, with the reason next to it.
 */

/**
 * Opportunity Radar / "Where to show up".
 *
 * OFF because the feature had no gate at all and no source:
 *
 *  - No entitlement check existed anywhere. The route
 *    (apps/api/src/routes/signals.ts) carries only requireAuth + a rate limit,
 *    and the tab was rendered unconditionally for every plan including Free —
 *    so an empty promise sat in the navigation of every paying customer, not
 *    just Agency as the audit report assumed.
 *  - The data source is not connected: SIGNAL_ENGINE_URL / SIGNAL_ENGINE_API_KEY
 *    appear in no .env.example, no docker-compose.yml and no workflow, and the
 *    route returns `reason: "not_configured"` (HTTP 200) as a result. Every user
 *    saw "Your opportunity radar isn't switched on yet", always.
 *
 * Turning it on is NOT an engineering decision. The intended source is the
 * Signal Engine's Reddit module, which the audit (Part III) puts at
 * `compliance_state=blocked` for commercial use until there is a direct Reddit
 * contract or a licensed vendor reviewed by counsel. Until that contract exists,
 * the honest option is to remove the promise rather than dress up an empty
 * state, and Reddit coverage must not be sold as active monitoring.
 *
 * To re-enable: flip this to true AND restore the nav entry, the tab title and
 * the route's entitlement check together — the surface must not come back
 * ungated the way it went out.
 */
export const OPPORTUNITY_RADAR_ENABLED = false;
