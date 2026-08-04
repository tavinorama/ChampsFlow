# 144: Pricing reconciliation, the margin cliff, and the B5 ledger

**Status**: proposal (read-only investigation, no code or Stripe object was changed)
**Author**: VP Finance analyst
**Date**: 2026-08-04

---

## TL;DR

Agency is displayed as **$549/mo everywhere in the product**. `$249` survives in exactly one place: a stale history comment in `scripts/stripe-bootstrap.ts:30`. That same file contradicts itself twice, warning about "the old **$149** amount" on lines 40 and 72, and `apps/web/src/components/PlanCard.tsx:51` warns that checkout will charge "the old **$549** amount", which is the current price. No price is hardcoded into any charge path: the live amount comes only from `STRIPE_PRICE_ID_AGENCY` and `STRIPE_PRICE_ID_AGENCY_ANNUAL`, which must be verified in the Stripe dashboard.

The margin risk is not brand count. Scheduled monitoring is capped at 70 audits/month and stays roughly 61% gross margin even at the high current cost. The hole is **manual audits, which are excluded from `monthly_audit_cap`**. Under the daily manual allowance, Agency turns negative at about **6 brands** (high cost) to **11 brands** (low cost), both below the 15 brands sold.

B5 fixes this structurally. A single append-only `audit_ledger` records what B3 verified, what B4 said about engine sanity, methodology version and cost, per audit. It is the record of account a credit needs and the evidence a disputed score needs.

---

## 1. The $249 vs $549 divergence

### 1.1 Where each number actually appears

`$249` appears **once in the entire repository**, and only as history:

| File:line | Text | Kind |
|---|---|---|
| `scripts/stripe-bootstrap.ts:30` | `Agency pricing updated 2026-07-16: $249/mo → $549/mo; annual $6,588 list.` | comment, historical note |

There is no `$249` in any UI surface, any API route, any plan config, or any Stripe amount. The catalog amount written by the bootstrap script is `54900` cents, that is $549.00 (`scripts/stripe-bootstrap.ts:44`).

`$549` is the number the customer sees, in all of these places:

| Surface | File:line | Value |
|---|---|---|
| Pricing page plan card | `apps/web/src/app/(marketing)/pricing/PricingPlans.tsx:109` | `monthly: "$549"` (annual `$4,611`, list `$6,588`, lines 110 to 111) |
| Pricing page metadata and comparison | `apps/web/src/app/(marketing)/pricing/page.tsx:22`, `:26`, `:43` | `$549/mo` |
| Landing v2 plan ladder | `apps/web/src/app/(marketing)/landing-v2-logic.ts:510` | `price: "$549"` |
| In-app plan card (billing tab source) | `apps/web/src/components/PlanCard.tsx:90` | `priceMonthly: "$549"`, `priceAnnual: "$4,611"` (line 91) |
| Agencies landing page | `apps/web/src/app/(marketing)/agencies/page.tsx:28`, `:84` | `$549/mo` |
| Kit upsell page | `apps/web/src/app/(marketing)/kit/page.tsx:158`, `:161` | `$549/mo` |
| Kit token page | `apps/web/src/app/(marketing)/kit/[token]/page.tsx:247`, `:250` | `$549/mo` |
| Ozvor Pages pricing strip | `apps/web/src/app/(marketing)/local-pages/page.tsx:231` | `$549/mo` |
| FAQ | `apps/web/src/app/(marketing)/faq/page.tsx:109` | `$549/mo` |
| Comparison pages data | `apps/web/src/app/(marketing)/vs/_data.ts:42`, `:70`, `:105`, `:169` | `$549/mo, 15 brands` |
| Login page plan echo | `apps/web/src/app/login/page.tsx:283` | `$549` when plan is not growth |
| Resource pages | `apps/web/src/app/(marketing)/resources/llm-citation-tracker/page.tsx:284`, `:882`; `.../what-is-geo-search/page.tsx:310`, `:317`, `:360` | `$549/mo` |
| Founder annual note | `apps/web/src/components/marketing/FounderAnnualNote.tsx:42` | `Agency $6,588/yr (~$549/mo)` |
| Kit delivery email | `packages/shared/src/emails/kit-delivery.ts:71`, `:145` | `Agency ($549/mo)` |
| Sales chat system prompt | `apps/api/src/routes/chat.ts:81` | `$549/mo, or $4,611/yr founder annual (list $6,588/yr)` |
| API plan tier docblock | `apps/api/src/integrations/stripe.ts:30` | `agency: $549/mo or $4,611/yr` |
| Margin guard comment | `apps/api/src/integrations/stripe.ts:322` | `Agency $549/mo, ~$5/audit → 70 audits` |
| Catalog doc | `docs/PRODUCTS.md:47`, `:48` | `$549` monthly, `$6,588` annual |

### 1.2 The single most important finding: the file that governs the live price contradicts itself

`scripts/stripe-bootstrap.ts` is the only artifact that creates the real Stripe prices, and it carries three mutually inconsistent legacy numbers in its own header:

- Line 30 says the previous price was **$249/mo**.
- Line 40 says: `otherwise checkout will charge the old $149 amount.`
- Line 72 says: `Old keys (agency_monthly_usd / agency_annual_usd) pointed to the $149/$1,788 prices`.

$249 and $149 cannot both be the prior price. $1,788 is 12 x $149, so the line 72 pair is internally consistent, which makes **line 30 the most likely wrong line**. Either way, the file that a founder reads before running a live-mode Stripe mutation states two different "old" prices, and this is the only surviving mention of $249 in the codebase.

A second, sharper defect: `apps/web/src/components/PlanCard.tsx:51` says checkout "will charge the old **$549** amount regardless of what is displayed here." $549 is the *current* price. This warning is a copy of the bootstrap warning with the number not updated, so it now instructs the reader that the correct price is the stale one. Anyone reconciling display against charge using that comment reaches the wrong conclusion.

### 1.3 Which env var actually drives the live charge

No price is hardcoded on any charge path. `mapPriceIdToPlanTier` resolves tiers only from env (`apps/api/src/integrations/stripe.ts:1334` to `:1337`), and `getStripeConfig` reads every price id from env (`apps/api/src/integrations/stripe.ts:50` to `:57`).

| Product | Env var | Displayed amount | Where the display lives |
|---|---|---|---|
| Agency monthly | `STRIPE_PRICE_ID_AGENCY` | $549/mo | `PricingPlans.tsx:109`, `PlanCard.tsx:90` |
| Agency annual | `STRIPE_PRICE_ID_AGENCY_ANNUAL` | $6,588/yr list, $4,611/yr founder | `PricingPlans.tsx:110` to `:111`, `PlanCard.tsx:91` |
| Growth monthly | `STRIPE_PRICE_ID_GROWTH` | $99/mo | `PricingPlans.tsx:95` |
| Growth annual | `STRIPE_PRICE_ID_GROWTH_ANNUAL` | $1,188/yr list, $831/yr founder | `PricingPlans.tsx:96` to `:97` |
| Ozvor Pages one-time | `STRIPE_PRICE_ID_PAGES` | $99 one-time | `apps/web/src/app/(marketing)/local-pages/page.tsx:221` |
| Get-Cited Kit one-time | `STRIPE_PRICE_ID_KIT` | $29 one-time | `docs/PRODUCTS.md:49` |

The founder discount is a coupon, not a price: `STRIPE_FOUNDER_COUPON_ID`, annual only, 30 percent (`apps/api/src/integrations/stripe.ts:60`, `scripts/stripe-bootstrap.ts:83` to `:89`).

**Actions that require the Stripe dashboard (not done here, no Stripe API was called):**

1. Confirm `STRIPE_PRICE_ID_AGENCY` resolves to a $549.00/month USD recurring price and not a legacy $149 or $249 price. The bootstrap script versioned the lookup key to `agency_monthly_549_usd` precisely to force a new price object (`scripts/stripe-bootstrap.ts:74`), so a stale env var would silently keep charging the old amount while the site advertises $549.
2. Confirm `STRIPE_PRICE_ID_AGENCY_ANNUAL` resolves to $6,588.00/year (`agency_annual_6588_usd`, `scripts/stripe-bootstrap.ts:75`).
3. Confirm `STRIPE_PRICE_ID_PAGES` is set at all. `docs/GO-LIVE-RUNBOOK.md:128` records it as intentionally UNSET, and `apps/api/src/routes/products.ts:562` gates the Pages buy button on its presence, so Pages checkout returns 503 until it is set.

Price ids for the live catalog are recorded in `docs/runbooks/GO-LIVE-KEYS.md:47` to `:51`. They are identifiers, not secrets, but they are not reproduced here and they are not proof of the amount attached to them, which is why item 1 above is a dashboard check.

### 1.4 One stale tier still in the plan model

`docs/PRODUCTS.md:59` flags a phantom `starter` tier and a stale in-app billing page. The `starter` tier is gone from `PLAN_LIMITS` (`apps/api/src/integrations/stripe.ts:339` to `:355` defines only free, growth, agency), but `STRIPE_PRICE_ID_STARTER` still appears in `docs/STATE.md:26`, and the DB check constraint still permits it (`packages/db/migrations/20260613000001_plan_tier_widen.up.sql:15`, `:20`). No live price is attached, so this is documentation debt, not a billing risk.

---

## 2. Per-plan limits and the margin cliff

### 2.1 The limits as coded

All limits live in one object, `PLAN_LIMITS` (`apps/api/src/integrations/stripe.ts:331` to `:355`). This object is the single source of truth for enforcement (`planLimitsFor`, `apps/api/src/routes/audits.ts:261` to `:279`), for the storefront in the app (`apps/api/src/routes/billing.ts:408` to `:425`), and for the worker margin guard (`apps/worker/src/jobs/audit-run.ts:344`, `:370`).

| Limit | free | growth | agency | Defined at |
|---|---|---|---|---|
| `max_brands` | 1 | 1 | 15 | `stripe.ts:341`, `:346`, `:351` |
| `max_competitors` | 1 | 10 | 10 | same lines |
| `prompts_per_audit` | 10 | 250 | 250 | same lines |
| `weekly_monitoring` | false | true | true | same lines |
| `max_landing_sites` | 0 | 1 | 15 | `stripe.ts:342`, `:347`, `:352` |
| `manual_audit_interval` | week | week | **day** | `stripe.ts:343`, `:348`, `:353` |
| `audit_backstop_24h` | 3 | 5 | **30** | same lines |
| `monthly_audit_cap` | 4 | 8 | **70** | same lines |
| `pages_regens_per_site_month` | 0 | 5 | 5 | same lines |

Two enforcement facts matter for the arithmetic:

- `monthly_audit_cap` applies **only to scheduled (cron) audits**. The guard is inside `if (!job.data.audit_id)`, and the counting query filters `triggered_by = 'cron'` (`apps/worker/src/jobs/audit-run.ts:344` to `:353`). The comment at `:330` to `:336` states this explicitly: manual audits are unaffected.
- Manual audits are bounded instead by `manual_audit_interval` (per brand) and `audit_backstop_24h` (tenant wide), enforced in `apps/api/src/routes/audits.ts:1045` to `:1049` and `:1170`.

### 2.2 The current cost per audit (not $0.80)

`docs/methodology-changelog.md` records two cost-moving changes:

- **2.0 / B2** (`docs/methodology-changelog.md:42`): all five engines are now probed on the **search-enabled surface** (OpenAI web search tool, Anthropic web search tool, Gemini grounding, Perplexity native, Google AI Overview via SERP). Search-enabled calls are the expensive path. This moved the audit from about **$0.80** to roughly **$1.50 to $2.80**.
- **2.1 / B3** (`docs/methodology-changelog.md:71`): two-pass extraction adds an estimated **$0.10 to $0.25** per audit, booked to `api_spend` via `AUDIT_COST_PER_EXTRACTION_CENTS`.

**Current cost per audit: $1.60 (low) to $3.05 (high).**

The code agrees with the high end. The spend estimate is `generationsUsed x AUDIT_COST_PER_GEN_CENTS + extractionCalls x AUDIT_COST_PER_EXTRACTION_CENTS` (`apps/worker/src/jobs/audit-run.ts:1210` to `:1214`), with defaults of **1.2 cents per generation** (`:1198`) and **0.2 cents per extraction call** (`:1204`). The generation ceiling `GEO_MAX_GENS` defaults to **220** (`packages/llm/src/sampling.ts:185`). At the ceiling: 220 x 1.2c = **$2.64** of generation cost alone, before extraction. That lands inside the $1.50 to $2.80 B2 band and confirms the high end is real, not theoretical.

**The `~$5/audit` figure in `apps/api/src/integrations/stripe.ts:322` and `apps/worker/src/jobs/audit-run.ts:333` is stale in the other direction.** It predates B1 sequential sampling, which shrank the base protocol from 3 fixed runs to 2 runs per formulation (`docs/methodology-changelog.md:36`). Every cap in `PLAN_LIMITS` was sized against that $5 number, so the caps are conservative on the scheduled path and, as shown below, badly mis-sized on the manual path.

### 2.3 Arithmetic: the scheduled path is safe

Agency revenue: **$549.00/month**. Weekly monitoring for one brand is 52 / 12 = **4.33 audits per brand per month**.

Cost of monitoring all 15 brands weekly:

```
15 brands x 4.33 audits = 64.95, call it 65 scheduled audits/month

low  end: 65 x $1.60 = $104.00   gross margin $445.00  (81.1%)
high end: 65 x $3.05 = $198.25   gross margin $350.75  (63.9%)
```

At the hard scheduled ceiling of 70 audits (`stripe.ts:353`):

```
low  end: 70 x $1.60 = $112.00   gross margin $437.00  (79.6%)
high end: 70 x $3.05 = $213.50   gross margin $335.50  (61.1%)
```

Break-even on the scheduled path alone:

```
low  end: $549 / $1.60 = 343.1 audits/month  =  343.1 / 4.33 = 79.2 brands
high end: $549 / $3.05 = 180.0 audits/month  =  180.0 / 4.33 = 41.6 brands
```

**Scheduled monitoring never turns Agency negative.** Break-even sits at 42 to 79 brands, and the plan sells 15. The `monthly_audit_cap` of 70 does its job and guarantees a gross margin floor of about 61 percent on that path.

This also explains, and closes, the older internal alarm that Agency went negative at 25 brands. That alarm was computed against the pre-2026-07-16 configuration of $249/mo with 25 brands (`scripts/stripe-bootstrap.ts:30`, `:32`) and the stale ~$5/audit figure: 25 x 4.33 x $5 = $541 against $249 of revenue, deeply negative. Both inputs have since changed. At $549 with 15 brands and the measured cost, that specific alarm no longer holds.

### 2.4 Arithmetic: the manual path is the real cliff

Agency gets `manual_audit_interval: "day"` and `audit_backstop_24h: 30`. Neither is counted against `monthly_audit_cap`.

Ceiling on manual audits per tenant per month:

```
per-brand daily re-audit:  15 brands x 30.4 days      = 456 audits/month
tenant-wide backstop:      30 per rolling 24h x 30.4  = 912 audits/month
binding constraint = 456 (the per-brand daily interval)
```

Cost at the per-brand ceiling, before adding the 65 scheduled audits:

```
low  end: 456 x $1.60 = $729.60   vs $549 revenue  =  -$180.60/month
high end: 456 x $3.05 = $1,390.80 vs $549 revenue  =  -$841.80/month
```

**Negative at both ends of the cost range, inside the plan's own entitlements.**

Break-even brand count under full daily manual utilisation (30.4 audits per brand per month):

```
low  end: $549 / ($1.60 x 30.4) = $549 / $48.64 =  11.3 brands
high end: $549 / ($3.05 x 30.4) = $549 / $92.72 =   5.9 brands
```

**The Agency margin cliff is at roughly 6 brands at the high end of the current cost range, and roughly 11 brands at the low end. Both are below the 15 brands the plan sells.** A single Agency customer who uses the daily manual re-audit that was sold to them takes the plan negative before they reach half their brand allowance.

Expressed as raw audit volume, which is the form the ledger will meter:

| Cost per audit | Break-even audits/month | Break-even audits/day |
|---|---|---|
| $1.60 (low) | 343 | 11.3 |
| $3.05 (high) | 180 | 5.9 |

Six manual audits per day is well inside a 30-per-day backstop. The backstop is roughly 5x too loose at the high end of the cost curve.

### 2.5 Growth, for comparison

Growth is $99/mo, 1 brand, `monthly_audit_cap: 8`, `manual_audit_interval: "week"`, `audit_backstop_24h: 5` (`stripe.ts:346` to `:349`).

```
scheduled: 4.33 audits x $3.05 = $13.21   gross margin $85.79  (86.7%)
cap:       8 audits    x $3.05 = $24.40   gross margin $74.60  (75.4%)
manual ceiling: 1 brand weekly = 4.33/month, backstop 5/24h is not reachable
break-even: $99 / $3.05 = 32.5 audits/month, vs a realistic ceiling near 13
```

Growth has roughly 2.5x headroom to break-even. The structural problem is specific to Agency, and specifically to the combination of a daily manual interval with a 30-per-day backstop and no credit accounting.

### 2.6 What the current system cannot tell you

`api_spend` (`packages/db/migrations/20260627000001_api_spend.up.sql:10` to `:15`) has three columns: `op`, `est_cost_cents`, `created_at`. **There is no `tenant_id`.** Cost is a platform-global number. Today it is impossible to answer "which customer is unprofitable", "how much did this audit cost", or "did the price change pay for itself", because the spend ledger cannot be joined to a tenant. That gap is exactly what section 3 closes.

---

## 3. B5: the ledger

### 3.1 Why the ledger comes after B3 and B4, not before

The sequencing is deliberate and it is not about pricing.

- **B3 (`packages/llm/src/extraction.ts`)** decides what was actually **verified**. Two passes: an extractor that returns strict JSON with exact text and offsets, then a blind verifier that sees one candidate mention at a time without knowing the extractor's conclusion, and rejects homonyms, negations, hallucinated mentions and offsets that do not match (`docs/methodology-changelog.md:59` to `:60`). Only mentions surviving with `kind_confirmed` in `direct_recommendation` or `cited_source` count as a citation (`:61`). B3 answers: **what is true**.
- **B4 (`packages/llm/src/drift-control.ts`)** decides whether the **engine was sane that day**. A daily battery of positive controls (does the engine still name the dominant brand for an obvious question) and negative controls (does it describe a fictional entity as real), reduced to `healthy | degraded | failing` per engine (`packages/llm/src/drift-control.ts:272`, `:409` to `:514`; thresholds documented at `packages/db/migrations/20260729000001_engine_drift_check.up.sql:20` to `:24`). B4 answers: **was the instrument calibrated**.
- **B5 is the ledger.** It records both, immutably, at the moment of the audit. It answers: **what did we bill, what did we measure, and under what conditions**.

Without B3 and B4 the ledger would be recording an unverified number produced by an uncalibrated instrument. With them, a ledger row is a defensible statement. That is what makes per-credit billing possible (a credit needs a record of account, not a log line) and what makes a disputed score answerable (the state as of the run, not as of today).

### 3.2 What each ledger entry records

One row per **(audit, engine)**. Engine granularity is required because B4's verdict is per engine and cost differs per engine, and because a customer disputing a score disputes it engine by engine.

| Field | Source today | File:line |
|---|---|---|
| audit id | `geo_audit.id` | `packages/db/migrations/20260530000001_geo_audit_engine.up.sql:128` |
| tenant, brand | `geo_audit.tenant_id`, `geo_audit.brand_id` | same migration, `:129` to `:130` |
| trigger context | `geo_audit.triggered_by` (`free_tier` / `paid` / `cron`) | same migration, `:133` to `:134` |
| engine | `citation_check.provider` domain, or the B4 gateway id | `:231` to `:232`; drift migration `:34` to `:37` |
| generations consumed | `result.generationsUsed` | `apps/worker/src/jobs/audit-run.ts:1066`, `packages/llm/src/sampling.ts:321` |
| verified vs rejected mentions | `extraction.verified_count`, `rejected_count`, `by_kind`, `probes_adjusted` | `apps/worker/src/jobs/audit-run.ts:1085` to `:1093`; `packages/llm/src/extraction.ts:101` to `:118` |
| extraction mode and llm calls | `extraction.mode`, `extraction.llm_calls` | `apps/worker/src/jobs/audit-run.ts:1086`, `:1093` |
| B4 drift verdict at that moment | latest `engine_drift_check` row for the engine | `packages/db/migrations/20260729000001_engine_drift_check.up.sql:53` to `:66` |
| methodology version | `GEO_METHODOLOGY_VERSION`, already stamped on the audit | `apps/worker/src/jobs/audit-run.ts:1180` to `:1186` |
| cost | the value currently written to `api_spend` | `apps/worker/src/jobs/audit-run.ts:1210` to `:1216` |

Every one of these values already exists in memory at the point where `api_spend` is written. **The ledger is not new measurement. It is persistence of what is currently computed and thrown away.**

### 3.3 What it builds on and extends

- **`api_spend`** (`packages/db/migrations/20260627000001_api_spend.up.sql`): the ledger supersedes it for the `op='audit'` case. `api_spend` stays for `free_test`, `drift_control` and `pages_generate`, which have no tenant. The ledger adds the `tenant_id` that `api_spend` structurally lacks. Its RLS shape (RLS on, permissive policy, `GRANT SELECT, INSERT` only) is the pattern to copy, tightened with tenant isolation.
- **`usage_counters`** (`packages/db/migrations/20260710000004_usage_counters.up.sql`): a per-tenant counter keyed by `(tenant_id, feature, subject_id, period_start)` with atomic increment. This is the right shape for the credit **balance**, but its own header explains why it must not be the ledger: it is a counter, not a record, and where a countable row exists the counter would drift from the source of truth. Balance goes in `usage_counters`, evidence goes in `audit_ledger`.
- **`20260728000001_intent_sampling`**: gave `geo_audit.methodology_version` and `citation_check.methodology_version` with `NOT NULL DEFAULT '1.0'`. The ledger inherits that convention exactly, so a bump never silently compares across protocols (`docs/methodology-changelog.md:3`, permanent rule 1 at `:85`).
- **`20260729000001_engine_drift_check`**: gave a stable per-engine verdict with an index on `(engine, checked_at DESC)` (`:69` to `:70`). The ledger denormalises the verdict rather than joining at read time, because the join would return today's verdict, not the verdict in force when the audit ran. Denormalisation is the point.
- **`GET /audits/:id`** already exposes the extraction breakdown as `extraction`, additive and `null` on pre-B3 audits (`apps/api/src/routes/audits.ts:1407` to `:1410`). The ledger gives that block a durable home; the endpoint gains a sibling `ledger` block by the same additive rule.

### 3.4 Proposed schema

New migration pair: `packages/db/migrations/2026XXXXXXXXXX_audit_ledger.up.sql` and `.down.sql`.

```sql
CREATE TABLE IF NOT EXISTS audit_ledger (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recorded_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Subject. No FK to geo_audit: a ledger row must outlive a deleted audit.
  audit_id              UUID         NOT NULL,
  tenant_id             UUID         NOT NULL,
  brand_id              UUID         NOT NULL,
  engine                TEXT         NOT NULL
                          CHECK (engine IN ('anthropic','openai','gemini','perplexity','serp')),
  triggered_by          TEXT         NOT NULL
                          CHECK (triggered_by IN ('free_tier','paid','cron')),
  plan_tier             TEXT         NOT NULL,   -- tier in force at run time

  -- What was consumed
  generations_consumed  INTEGER      NOT NULL CHECK (generations_consumed >= 0),
  extraction_llm_calls  INTEGER      NOT NULL DEFAULT 0 CHECK (extraction_llm_calls >= 0),

  -- What B3 concluded
  extraction_mode       TEXT         NOT NULL
                          CHECK (extraction_mode IN
                            ('two_pass','fallback_single_pass','disabled','mixed')),
  verified_count        INTEGER      NOT NULL DEFAULT 0,
  rejected_count        INTEGER      NOT NULL DEFAULT 0,
  probes_adjusted       INTEGER      NOT NULL DEFAULT 0,
  by_kind               JSONB        NOT NULL DEFAULT '{}'::jsonb,

  -- What B4 said about this engine at this moment
  drift_check_id        BIGINT,                  -- engine_drift_check.id, NULL if none
  drift_status          TEXT         NOT NULL DEFAULT 'unknown'
                          CHECK (drift_status IN ('healthy','degraded','failing','unknown')),
  drift_positive_rate   NUMERIC(5,4),
  drift_negative_rate   NUMERIC(5,4),
  drift_checked_at      TIMESTAMPTZ,

  -- Comparability and money
  methodology_version   TEXT         NOT NULL DEFAULT '1.0',
  est_cost_cents        INTEGER      NOT NULL CHECK (est_cost_cents >= 0),
  credits_consumed      NUMERIC(6,3) NOT NULL DEFAULT 0,

  -- Tamper evidence: sha256 over the canonical row payload plus prev_hash.
  prev_hash             TEXT,
  entry_hash            TEXT         NOT NULL
);

-- Idempotent writes: a retried audit job can never double-bill an engine.
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_ledger_audit_engine
  ON audit_ledger (audit_id, engine);

-- Credit accounting and the billing tab: "this tenant, this month".
CREATE INDEX IF NOT EXISTS idx_audit_ledger_tenant_recorded
  ON audit_ledger (tenant_id, recorded_at DESC);

-- Dispute lookup: "show me everything behind this audit".
CREATE INDEX IF NOT EXISTS idx_audit_ledger_audit
  ON audit_ledger (audit_id);

-- Margin analysis by protocol: "what did 2.1 cost us versus 2.0".
CREATE INDEX IF NOT EXISTS idx_audit_ledger_method_recorded
  ON audit_ledger (methodology_version, recorded_at DESC);

ALTER TABLE audit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_ledger
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Append-only, enforced twice: by grant and by trigger.
GRANT SELECT, INSERT ON audit_ledger TO app_user;
REVOKE UPDATE, DELETE ON audit_ledger FROM app_user;

CREATE OR REPLACE FUNCTION audit_ledger_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_ledger is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_ledger_append_only
  BEFORE UPDATE OR DELETE ON audit_ledger
  FOR EACH ROW EXECUTE FUNCTION audit_ledger_append_only();
```

Note `credits_consumed NUMERIC(6,3)` rather than an integer: the ledger is written per engine, so an audit across five engines writes 0.2 credits per row and sums to exactly 1. This keeps "1 credit = 1 audit" true while allowing a partial audit (engines paused by the B4 drift check) to bill partially.

### 3.5 Why append-only matters

1. **A credit that can be un-consumed is not a credit.** Per-unit billing requires a record of account. If a row can be updated, the balance is an opinion.
2. **A dispute is about the past.** A customer asking "why did my score drop" needs the extraction result and the drift verdict **as they were on that date**. A mutable row, or a live join to `engine_drift_check`, returns today's answer to a question about last month.
3. **Methodology bumps break comparability by design** (`docs/methodology-changelog.md:85`, rule 1). Historical rows must remain readable and truthfully labelled with the version that produced them, never rewritten. Permanent rule 5 of that same file already forbids rewriting history in the changelog; the ledger applies the identical discipline to the data.
4. **Corrections are new rows, not edits.** A reversal is a compensating entry with negative `credits_consumed` and a reference to the original, which is standard double-entry practice and leaves the original visible.
5. **The hash chain makes tampering detectable** without any external system: recompute the chain and compare. This is what turns "we say your score is 41" into "here is the immutable record, verify it".
6. **It removes an entire class of silent degradation.** Today a failed cost write is caught and logged as a warning (`apps/worker/src/jobs/audit-run.ts:1217` to `:1219`), so an audit can complete while its cost vanishes. A ledger write that fails must be loud, because a billed unit with no record is exactly the "degrades and reports success" failure mode this company treats as its worst.

### 3.6 How credit pricing maps onto it

**1 credit = 1 completed audit**, summed as `SUM(credits_consumed)` over the tenant's rows for the calendar month. The month boundary uses `date_trunc('month', NOW())`, matching the convention already used by the scheduled cap and the `api_spend` budget (`apps/worker/src/jobs/audit-run.ts:339`, `:351`).

Proposed allotments, chosen so nothing changes for existing customers on day one:

| Tier | Included credits/month | Equals today's | Cost at $3.05/credit | Gross margin |
|---|---|---|---|---|
| free | 4 | `monthly_audit_cap: 4` | $12.20 | n/a, this is CAC |
| growth | 8 | `monthly_audit_cap: 8` | $24.40 | $74.60 on $99 (75.4%) |
| agency | 70 | `monthly_audit_cap: 70` | $213.50 | $335.50 on $549 (61.1%) |

The single behavioural change, and the whole point of the exercise: **manual audits consume credits too.** Today they are exempt (`apps/worker/src/jobs/audit-run.ts:344`, guard scoped to `!job.data.audit_id`), which is the hole quantified in section 2.4. Under credits there is one meter, so the 6-brand cliff cannot occur: an Agency tenant running 456 manual audits consumes 456 credits, 386 of them overage, and the overage is priced above cost.

Overage pricing, floored on the measured cost of $1.60 to $3.05: a metered Stripe price at **$8 per credit** holds a gross margin of 62 to 80 percent on the marginal unit, and sits below the $12.20 implied unit price of Growth ($99 / 8), so overage never undercuts an upgrade. Sold in packs (25 credits for $199, that is $7.96 each) it also reads as a discount rather than a penalty.

`monthly_audit_cap`, `manual_audit_interval` and `audit_backstop_24h` do not disappear. They stop being the margin control (credits take that job) and become pure abuse control, which is what a backstop should be.

### 3.7 Files this would touch

Nothing below is implemented. This is the surface a B5 implementation would need to open.

**New:**
- `packages/db/migrations/2026XXXXXXXXXX_audit_ledger.up.sql`, `.down.sql`: the table, indexes, RLS, append-only trigger.
- `packages/shared/src/ledger.ts` (proposed): canonical row serialisation plus `entry_hash` computation, so worker and API hash identically.

**Modified, worker:**
- `apps/worker/src/jobs/audit-run.ts`: write ledger rows where `api_spend` is written today (`:1210` to `:1216`); source values are already in scope at `:1066` (`generationsUsed`), `:1085` to `:1093` (extraction block), `:1180` to `:1186` (methodology version). Read the latest `engine_drift_check` per engine, which the file already does for its pause check. The ledger write must fail loudly, unlike the current warning-only catch at `:1217`.
- `apps/worker/src/jobs/monitor-reconcile.ts`: schedule against remaining credits rather than `monthly_audit_cap` (`:22` to `:38`).
- `apps/worker/src/jobs/drift-control.ts`: no change. The ledger reads `engine_drift_check`, which this job already writes (`:187`).

**Modified, API:**
- `apps/api/src/integrations/stripe.ts`: add `credits_per_month` to `PLAN_LIMITS` (`:331` to `:355`); add `STRIPE_PRICE_ID_CREDIT_OVERAGE` to `getStripeConfig` (`:50` to `:60`); add a metered-usage reporting helper.
- `apps/api/src/routes/audits.ts`: `planLimitsFor` (`:261`) becomes credit-aware; the manual guards at `:1045` to `:1049` and `:1170` check credit balance before interval; `GET /audits/:id` gains a `ledger` block alongside `extraction` (`:1407` to `:1410`).
- `apps/api/src/routes/billing.ts`: `GET /plan` returns `credits_included`, `credits_used`, `credits_remaining` in the `usage` object (`:408` to `:425`); webhook handling for the metered overage price.

**Modified, extraction and sampling:** none. `ExtractionResult` (`packages/llm/src/extraction.ts:101` to `:118`) and `DriftEvaluation` (`packages/llm/src/drift-control.ts:274` to `:281`) already carry every field the ledger needs. This is the clearest evidence that B5 is correctly sequenced after B3 and B4.

**Modified, web:**
- `apps/web/src/app/account/billing/page.tsx`: a credit meter next to the existing Plan Limits block (`:806` to `:836`).
- `apps/web/src/components/PlanCard.tsx`: credit language in `PLAN_META` (`:60` to `:99`), **and fix the stale $549 warning at `:51` while in the file**.
- `apps/web/src/app/(marketing)/pricing/PricingPlans.tsx`: credits per tier in the feature lists (`:95` to `:117`).

**Modified, scripts and docs:**
- `scripts/stripe-bootstrap.ts`: add the metered overage price, **and reconcile the contradictory $249 / $149 history at `:30`, `:40`, `:72`**.
- `docs/PRODUCTS.md`: add the credit SKU and its env var to the catalog table (`:45` to `:49`).
- `docs/COST-MODEL.md`: replace the pre-B2 per-audit figures with the measured $1.60 to $3.05 range.
- `docs/methodology-changelog.md`: append only, never rewrite (rule 5, `:89`). A ledger is not a methodology change and does not bump the version.

### 3.8 Open questions for the founder

1. **Do credits expire?** Rolling over is friendlier but turns the liability unbounded. Recommended: expire monthly, with the last 3 months visible in the billing tab so the customer sees what they left unused.
2. **Does a failed audit consume a credit?** Recommended no, and the ledger makes this enforceable: write the row with `credits_consumed = 0` and the failure reason, so the cost is still recorded against the tenant even when the credit is not.
3. **Does an audit against a `failing` engine consume a credit?** Recommended no for that engine's fraction, since a `failing` verdict means the measurement is not defensible. This is the clearest illustration of why B4 has to be written into the ledger rather than joined at read time.
4. **Is `$8` per overage credit acceptable?** It holds 62 to 80 percent gross margin on the marginal unit and stays below Growth's implied unit price. It is a proposal, not a decision.

---

## Appendix: every factual claim, with its source

| Claim | Source |
|---|---|
| `$249` appears once, as history | `scripts/stripe-bootstrap.ts:30` |
| The same file says the old price was `$149` | `scripts/stripe-bootstrap.ts:40`, `:72` |
| Agency catalog amount is 54900 cents | `scripts/stripe-bootstrap.ts:44` |
| `PlanCard` warns about "the old $549 amount", which is current | `apps/web/src/components/PlanCard.tsx:51` |
| Live charge resolves from env only | `apps/api/src/integrations/stripe.ts:50` to `:57`, `:1334` to `:1337` |
| `STRIPE_PRICE_ID_PAGES` is intentionally unset | `docs/GO-LIVE-RUNBOOK.md:128`, `apps/api/src/routes/products.ts:562` |
| Agency limits: 15 brands, 10 competitors, 250 prompts, weekly | `apps/api/src/integrations/stripe.ts:351` to `:354` |
| `monthly_audit_cap` counts cron audits only | `apps/worker/src/jobs/audit-run.ts:344` to `:353` |
| Agency manual allowance: daily, 30 per 24h | `apps/api/src/integrations/stripe.ts:353` |
| B2 moved every engine to the search-enabled surface | `docs/methodology-changelog.md:42` |
| B3 adds $0.10 to $0.25 per audit | `docs/methodology-changelog.md:71` |
| Cost model: 1.2c per generation, 0.2c per extraction call | `apps/worker/src/jobs/audit-run.ts:1198`, `:1204`, `:1210` to `:1214` |
| Generation ceiling is 220 | `packages/llm/src/sampling.ts:185` |
| The `~$5/audit` figure is stale | `apps/api/src/integrations/stripe.ts:322`, `apps/worker/src/jobs/audit-run.ts:333` |
| `api_spend` has no `tenant_id` | `packages/db/migrations/20260627000001_api_spend.up.sql:10` to `:15` |
| Extraction breakdown fields already exist | `packages/llm/src/extraction.ts:101` to `:118` |
| Drift verdict fields already exist | `packages/llm/src/drift-control.ts:272` to `:281` |
| Drift table shape and thresholds | `packages/db/migrations/20260729000001_engine_drift_check.up.sql:53` to `:70` |
| `methodology_version` convention | `packages/db/migrations/20260728000001_intent_sampling.up.sql:44` to `:52` |
| `usage_counters` is a counter, not a record | `packages/db/migrations/20260710000004_usage_counters.up.sql:8` to `:14` |
| `GET /audits/:id` exposes `extraction` additively | `apps/api/src/routes/audits.ts:1407` to `:1410` |
