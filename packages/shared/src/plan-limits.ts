/**
 * plan-limits.ts — the plans as data: price, depth, and every ceiling.
 *
 * WHY THIS LIVES IN packages/shared
 * Born in apps/api/src/integrations/stripe.ts, moved here (2026-08-10, the
 * credits-on-pages change) for the same reason db-client.ts moved on the same
 * day: the marketing site must DERIVE the numbers it advertises — credits,
 * audit depth, monthly allowances — from the same source production enforces.
 * While the public pricing page hardcoded "6,000 credits", a plan change
 * quietly turned the page into a lie (the exact drift disease of 2026-08-05,
 * when prompts_per_audit said 250 and the generator produced 10). The web app
 * cannot import API code, so the single source moves to neutral ground and
 * stripe.ts re-exports it for every existing API import site.
 *
 * Price and limits stay in ONE file on purpose: the margin arithmetic that
 * produced these limits is meaningless without the revenue side.
 */

export type PlanTier = "free" | "growth" | "agency";

/** Paid tiers that can be purchased via checkout. */
export type PaidPlanTier = "growth" | "agency";

/**
 * List price per tier, USD per month, mirroring the pricing page.
 * Founder-annual (-30%) is a discount ON these, not a separate tier.
 */
export const PLAN_PRICE_USD: Record<PlanTier, number> = {
  free: 0,
  growth: 99,
  agency: 549,
};

export const PLAN_LIMITS: Record<
  PlanTier,
  {
    max_brands: number;
    max_competitors: number;
    prompts_per_audit: number;
    weekly_monitoring: boolean;
    /** Ozvor Pages (#208): base site allowance per tier. One-time $99 credits
     * (tenants.extra_landing_sites) ADD to this — a free tenant with a
     * purchased credit gets exactly the sites they paid for. */
    max_landing_sites: number;
    /** 5-page deliverable (home + 4) plus one spare slot for a campaign page. */
    max_pages_per_site: number;
    /** Cost-control (#217): how often a MANUAL (non-cron) audit may be
     * re-triggered per brand. 'week' = once every 7 days, 'day' = once every
     * 24h. Scheduled monitoring (triggered_by='cron') is NEVER subject to
     * this — it has its own weekly/daily cadence, unchanged. */
    manual_audit_interval: "week" | "day";
    /** Cost-control (#217): tenant-wide backstop on manual audits in a
     * rolling 24h window (across ALL brands) — bounds brand-delete-and-recreate
     * abuse of the per-brand window above. super_admin bypasses this. */
    audit_backstop_24h: number;
    /** Margin guard: max audits per tenant per calendar month, counting BOTH
     * scheduled monitoring AND manual re-runs.
     *
     * This replaced `monthly_audit_cap`, which counted only cron audits. That
     * was the hole: agency's manual_audit_interval is "day", so ten brands could
     * be re-audited manually 300 times a month on top of the scheduled 43 —
     * enough API spend to push the margin negative. Reducing max_brands does
     * not close it; only a ceiling over BOTH kinds does.
     *
     * Sizing: weekly monitoring needs 4.33 audits per brand per month; the
     * ceiling leaves each brand roughly one to two manual re-runs of slack —
     * enough that a normal customer never touches it, and an abusive one
     * cannot outrun the margin floor (>=80% at the ceiling, pinned in
     * tests/unit/cost-control.test.ts).
     *
     * Enforced in two places, because the two kinds fail differently:
     *   - scheduled: apps/worker/src/jobs/audit-run.ts skips the run
     *   - manual:    apps/api/src/routes/audits.ts rejects with 429 before any
     *                work, so the customer gets a real message instead of a
     *                silent no-op. */
    monthly_audits_total: number;
    /** Cost-control (#217): Ozvor Pages REgenerations per site per calendar
     * month (UTC). Free is 0 here — free tenants regenerate against a
     * LIFETIME quota (2 per $99-credit site) enforced separately in
     * routes/landing.ts, not this monthly figure. */
    pages_regens_per_site_month: number;
  }
> = {
  // Free is a deliberate TASTE, not a usable tier. Two audits a month: one to
  // see where you stand, one to check whether anything moved. At 10 prompts
  // that is ~$2.84/month of API per free tenant, which the funnel can carry.
  free: {
    max_brands: 1, max_competitors: 1, prompts_per_audit: 10, weekly_monitoring: false,
    max_landing_sites: 0, max_pages_per_site: 6,
    manual_audit_interval: "week", audit_backstop_24h: 3, monthly_audits_total: 2, pages_regens_per_site_month: 0,
  },
  // Growth goes DEEP on one brand (P6, founder-approved 2026-08-07): 33
  // prompts x 6 audits = 198 prompt-audits ≈ $19.44 of API against $99 →
  // 80.4% margin at the ceiling. Derived credits: 33 x 6 x 50 = 9,900/month.
  growth: {
    max_brands: 1, max_competitors: 10, prompts_per_audit: 33, weekly_monitoring: true,
    max_landing_sites: 1, max_pages_per_site: 6,
    manual_audit_interval: "week", audit_backstop_24h: 5, monthly_audits_total: 6, pages_regens_per_site_month: 5,
  },
  // Agency goes WIDE (P6): 19 prompts x 58 audits = 1,102 prompt-audits ≈
  // $108.20 against $549 → 80.3% margin at the ceiling. The ceiling is 58, not
  // the 60 the first sketch used, because 19 x 60 lands at 79.6% — under the
  // 80% floor the plans are held to. 58 still covers weekly monitoring on all
  // 10 brands (43.3) with ~15 manual re-runs of slack. Derived credits:
  // 19 x 58 x 50 = 55,100/month.
  agency: {
    max_brands: 10, max_competitors: 10, prompts_per_audit: 19, weekly_monitoring: true,
    max_landing_sites: 10, max_pages_per_site: 6,
    manual_audit_interval: "day", audit_backstop_24h: 30, monthly_audits_total: 58, pages_regens_per_site_month: 5,
  },
};
