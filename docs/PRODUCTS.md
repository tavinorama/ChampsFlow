# TrustIndex AI — Product Catalog (source of truth)

> Platform-agnostic spec. Use this to create the SKUs in **any** payment tool
> (Stripe, Lemon Squeezy, Polar). Currency: **USD**. Only the "Platform SKU /
> Price ID" column depends on the platform you pick — everything else is fixed.

## A. Acquisition (free → tripwire) — already built in the app

| Product | Price | Billing | What the buyer gets | Code |
|---|---|---|---|---|
| **The AI Invisibility Test** | $0 (free) | — | 1 buyer prompt across 4 AI engines → shows if the brand is cited. Lead magnet (~2¢/run on platform key). | `packages/llm/invisibility-test.ts`, `/test` |
| **The Get-Cited Kit** | **$29** | one-time | TrustIndex Score (3 vectors) + top fixes + content drafts + publish checklist. No subscription. | `packages/llm/kit-deliverable.ts`, `/kit` |

## B. Subscription tiers (the SaaS)

| Tier | Monthly | **Founder annual (30% off, annual-only)** | Limits / features |
|---|---|---|---|
| **Free** | $0 | — | 1 brand · 3 competitors · 50 prompts/audit · monthly audit · no weekly monitoring |
| **Growth** | **$99/mo** | **$831/yr (≈$69/mo)** | 1 brand · 10 competitors · 250 prompts · weekly monitoring · citation tracking · GEO content briefs |
| **Agency** | **$149/mo** | **$1,251/yr (≈$104/mo)** | up to 25 brands (multi-client) · 10 competitors/brand · white-label reports · client approval workflow · priority support |

- **Annual list price** (before founder discount): Growth $1,188/yr (12×99), Agency $1,788/yr (12×149). The 30% founder coupon brings them to $831 / $1,251.
- **Founder discount rule:** 30%, applied **only on annual** checkout, first-100 founders. Enforced in code (`createCheckoutSession`) + tested.
- **Annual bonus:** Growth → free 5-page website (week 1); Agency → website + 3 client landing pages.

## C. Consultancy (done-for-you)

| Product | Price | What it is |
|---|---|---|
| **OrganicPosts by TrustIndex AI** | custom / consultative (no public price) | DFY GEO execution: Audit → Map → Create → Publish → Monitor (website, LinkedIn, Google Business Profile, newsletter). CTA "Build my GEO content plan". | `/organicposts` |

## D. Free content lead magnets (bundled in Growth, drive signups)
- GEO Visibility Guide · LLM Citation Tracker · 5 High-Citation Post Templates (`/resources/*`).

---

## SKUs to create in the payment platform (fill the IDs once chosen)

Create these objects, then put each ID in the matching API env var:

| SKU to create | Type | Amount (USD) | Env var to set |
|---|---|---|---|
| Growth — monthly | recurring / month | $99 | `STRIPE_PRICE_ID_GROWTH` (or MoR variant id) |
| Growth — annual | recurring / year | $1,188 | `STRIPE_PRICE_ID_GROWTH_ANNUAL` |
| Agency — monthly | recurring / month | $149 | `STRIPE_PRICE_ID_AGENCY` |
| Agency — annual | recurring / year | $1,788 | `STRIPE_PRICE_ID_AGENCY_ANNUAL` |
| Get-Cited Kit | one-time | $29 | `STRIPE_PRICE_ID_KIT` |
| Founder coupon | 30% off, duration "forever" | — | `STRIPE_FOUNDER_COUPON_ID` |

> The founder coupon is applied by the code **only on annual** checkouts, so a
> plain 30%-off coupon is enough — the annual-only rule lives in the app.

---

## Open items (not products — wiring/decisions)
- **Payment platform** still undecided (Stripe needs a non-BR entity for USD live; Lemon Squeezy/Polar = MoR work with the BR CNPJ in USD; Wise = manual invoicing first).
- **Code cleanup to match this catalog:** (1) the phantom **`starter`** tier (in `PLAN_LIMITS` + `STRIPE_PRICE_ID_STARTER`, not marketed, limits == Free) → remove or define; (2) the in-app **`account/billing`** page still shows the stale Free/Starter/Pro $19/$49 model → reskin to Free/Growth/Agency + annual + founder.
