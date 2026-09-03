# Ozvor — Product Catalog (source of truth)

> *Updated 2026-07-10 (issue #213): brand TrustIndex AI → **Ozvor**; score name → **"Ozvor AI Visibility Score"**.*
> *Updated 2026-09-02 (10.D.11): Ozvor Pages $99 + credit pack added; Agency corrected to **10 brands** and real prompt/audit caps; coupons AIAUDIT15 / FOUNDER30 / RETENTION30 registered; measured costs cross-referenced to COST-MODEL.md.*

> Platform-agnostic spec. Use this to create the SKUs in **any** payment tool
> (Stripe, Lemon Squeezy, Polar). Currency: **USD**. Only the "Platform SKU /
> Price ID" column depends on the platform you pick — everything else is fixed.

## A. Acquisition (free → tripwire) — already built in the app

| Product | Price | Billing | What the buyer gets | Code |
|---|---|---|---|---|
| **The AI Invisibility Test** | $0 (free) | — | 1 buyer prompt across 4 AI engines → shows if the brand is cited. Lead magnet (~2¢/run on platform key). | `packages/llm/invisibility-test.ts`, `/test` |
| **The Get-Cited Kit** | **$29** | one-time | Ozvor AI Visibility Score (3 vectors) + top fixes + content drafts + publish checklist. No subscription. | `packages/llm/kit-deliverable.ts`, `/kit` |
| **AI Audit Stack** | **$49** | one-time | Email mandatory. Questionnaire (business, focus, engines, pains, tools in use) → ONE niche AI tool picked for the buyer's pains + why + the honest teaser of the full report (tools matched, matrix counts, hours/ROI estimates). Result on `/ai-audit/:token` AND inline in the delivery email. **30-day money-back** (ToS §4, `/refund` §4). Full 9-section report stays the OrganicPosts $1.5k deliverable. | `apps/api/src/routes/ai-audit.ts`, `apps/api/src/lib/ai-audit/*`, `/ai-audit` |
| **Ozvor Pages** | **$99** | one-time | 5-page AI-citable site (home, services, about, FAQ, contact) generated from the business's REAL data only (GBP, existing site, authorized testimonials); integrity gate fails honestly instead of shipping filler; published at a public URL with consented lead capture; 2 lifetime regens per purchased site. Deliverable guarantee (`/refund` §3). **Checkout OFF until `STRIPE_PRICE_ID_PAGES` is set (10.A.5, founder)** — until then report as unavailable. | `apps/api/src/routes/landing.ts`, `/local-pages` |
| **Credit pack** | **~$13** (derived) | one-time | 1,000 audit credits. Price is DERIVED in code, not hardcoded: `overagePackUsd()` = max(margin floor 80%, best plan rate × 1.3) — currently ≈ $13 (the "$20" once floated in docs was never the shipped price). Purchased credits **never expire**; plan credits reset on the 1st (see billing rules). | `packages/shared/src/credits.ts`, `POST /api/billing/credits/checkout` |

## B. Subscription tiers (the SaaS)

| Tier | Monthly | **Founder annual (30% off, annual-only)** | Limits / features |
|---|---|---|---|
| **Free** | $0 | — | 1 brand · 1 competitor · 10-prompt snapshot · monthly audit · no weekly monitoring |
| **Growth** | **$99/mo** | **$831/yr (≈$69/mo)** | 1 brand · 10 competitors · **33 prompts/audit** · manual re-audit 1×/week + weekly monitoring (cap 6 audits/mo total) · citation tracking · GEO content briefs · Pages builder included |
| **Agency** | **$549/mo** | **$4,611/yr (≈$384/mo)** | up to **10 brands** (multi-client; the earlier "15" was never shipped — `PLAN_LIMITS`) · 10 competitors/brand · **19 prompts/audit** · manual re-audit daily (cap 58 audits/mo total) · white-label reports · priority support. *"Client approval workflow" is advertised but has no code (10.A.4) — do not sell it until built or the claim is removed (decision pending).* |

- **Annual list price** (before founder discount): Growth $1,188/yr (12×99), Agency $6,588/yr (12×549). The 30% founder coupon brings them to $831 / $4,611.
- **Founder discount rule:** 30%, applied **only on annual** checkout, first-100 founders. Enforced in code (`createCheckoutSession`) + tested.
- **Annual bonus:** Growth → free 5-page website (week 1); Agency → one free website GEO audit.
- **Credits rule (fix #566, 2026-09-01):** plan credits **reset on the 1st of each month (UTC)** — the remainder of last month's plan allowance expires before the new grant; **purchased pack credits never expire** and are consumed last.

### Coupons (live catalog)

| Coupon | What | Where enforced |
|---|---|---|
| **FOUNDER30** | 30% off, annual-only, first-100 (`STRIPE_FOUNDER_COUPON_ID`) | `createCheckoutSession` (annual-only rule in code) |
| **AIAUDIT15** | 15% off the $49 AI Audit Stack (`STRIPE_COUPON_AIAUDIT15`) — confirmed live by the founder 2026-08-27 | checkout, campaign links |
| **RETENTION30** | retention coupon (name only per policy; default id `RETENTION30`, override `STRIPE_RETENTION_COUPON_ID`; auto-provisioned by code) | cancel-flow retention offer (`integrations/stripe.ts`) |

## C. Consultancy (done-for-you)

| Product | Price | What it is |
|---|---|---|
| **OrganicPosts by Ozvor** | custom / consultative (no public price) | DFY GEO execution: Audit → Map → Create → Publish → Monitor (website, LinkedIn, Google Business Profile, newsletter). CTA "Build my GEO content plan". | `/organicposts` |

## D. Free content lead magnets (bundled in Growth, drive signups)
- GEO Visibility Guide · LLM Citation Tracker · 5 High-Citation Post Templates (`/resources/*`).

---

## SKUs to create in the payment platform (fill the IDs once chosen)

Create these objects, then put each ID in the matching API env var:

| SKU to create | Type | Amount (USD) | Env var to set |
|---|---|---|---|
| Growth — monthly | recurring / month | $99 | `STRIPE_PRICE_ID_GROWTH` (or MoR variant id) |
| Growth — annual | recurring / year | $1,188 | `STRIPE_PRICE_ID_GROWTH_ANNUAL` |
| Agency — monthly | recurring / month | $549 | `STRIPE_PRICE_ID_AGENCY` |
| Agency — annual | recurring / year | $6,588 | `STRIPE_PRICE_ID_AGENCY_ANNUAL` |
| Get-Cited Kit | one-time | $29 | `STRIPE_PRICE_ID_KIT` |
| AI Audit Stack | one-time | $49 | `STRIPE_PRICE_ID_AI_AUDIT` — **Stripe live** (checkout + delivery by token, PR #479; unset → non-prod dev-unlock, prod 503) |
| Ozvor Pages | one-time | $99 | `STRIPE_PRICE_ID_PAGES` — **NOT SET in prod (10.A.5)**: checkout answers 503 while the page advertises "InStock"; founder sets the env or the page marks unavailable |
| Credit pack (1,000 credits) | one-time | ~$13 (derived by `overagePackUsd()`) | price created dynamically at checkout (no fixed price env) |
| Founder coupon | 30% off, duration "forever" | — | `STRIPE_FOUNDER_COUPON_ID` |
| AI Audit coupon | 15% off | — | `STRIPE_COUPON_AIAUDIT15` (live since 27/08) |
| Retention coupon | (name only) | — | `RETENTION30` / `STRIPE_RETENTION_COUPON_ID` (auto-provisioned) |

> The founder coupon is applied by the code **only on annual** checkouts, so a
> plain 30%-off coupon is enough — the annual-only rule lives in the app.

---

## Open items (not products — wiring/decisions)
- **Payment platform**: **Stripe LIVE** (USD; self-serve Growth/Agency checkout, Kit $29 and AI Audit Stack $49 one-time — status 2026-08-17). The earlier MoR/Wise options are no longer under consideration.
- **Code cleanup to match this catalog:** the phantom **`starter`** tier still lingers in `PLAN_LIMITS`, `STRIPE_PRICE_ID_STARTER`, the admin cockpit counters (`cockpit.ts`, `admin.ts`, `admin/page.tsx`, always 0), and the `billing` migration CHECK (`plan_tier IN ('free','starter','pro')`) → remove or define in a dedicated PR (touches a CHECK migration, so founder-merged). NOTE: the in-app **`account/billing`** page already renders the correct **Free / Growth / Agency** cards with the annual + founder toggle (`account/billing/page.tsx:962`) — the earlier "$19/$49 Starter/Pro" note referred to a stale docstring, now fixed.
