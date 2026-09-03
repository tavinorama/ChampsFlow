# Finance Department State

> Owned by vp-finance. Read by ceo-agent (TL;DR only). Updated after every finance agent dispatch.

## TL;DR
> **Rewritten 2026-09-02** (sources: `api_spend` measured figures, `PLAN_LIMITS`, COST-MODEL.md §5; fiscal/tax matters are handled directly by the founder's accountant and are OUT of scope here).

**MRR = $0** (product live; one real $49 test purchase 27/08 proved the paid path). Catalog live in **USD** on Stripe: Free $0 · Growth $99/mo · Agency $549/mo (**10 brands** — the "15" was never shipped) · Kit $29 · AI Audit Stack $49 (30-day money-back, AIAUDIT15 = 15% off) · credit pack ~$13/1,000 (price DERIVED in code, never expires; plan credits reset on the 1st — #566) · Ozvor Pages $99 (**checkout OFF until `STRIPE_PRICE_ID_PAGES`**) · OrganicPosts consultative (~$1.5k entry) · FOUNDER30 (30% annual-only) · RETENTION30 (cancel-flow). Unit costs measured by `api_spend`: **audit ≈ $0.80 · free test ≈ $0.03 · pages ≈ $0.15**; content org runs on flat-fee VPS engines. **Margin corrected 02/09 (5.C.4)**: at the REAL plan caps, Agency reads ≈92% API-cost margin (58 audits/mo × $0.80 on $549) and Growth ≈95% — the old "Agency negative" reading used an impossible 25-brand premise; the `monthly_audits_total` ceiling pins ≥80% by construction. Daily cost/margin snapshot lives in the watchdog (#524); weekly report Mondays (#525). Top financial risk unchanged: zero revenue with paid API spend live — distribution, not cost, is the constraint. No accounting tool selected yet.

## Department meta
- **Head**: vp-finance
- **Reporting currency**: USD
- **Fiscal year**: Jan–Dec
- **Accounting tool**: _(QuickBooks / Xero / other — source of truth for actuals)_

## Financial dashboard
| Metric | This month | Last month | Target |
|---|---|---|---|
| MRR | | | |
| ARR | | | |
| Gross margin | | | > 70% |
| Total burn | | | |
| Cash on hand | | | |
| Runway (months) | | | > 12 |
| Largest expense category | | | |

## Vendor contract tracker
> First fill 2026-09-02 (was empty since init — 10.D.11 "vendor/cost tracker vazio"). Costs are the founder's figures where known; DPA status mirrors `ropa.md` Sub-Processor Register (authoritative).

| Vendor | Monthly cost | Contract end | DPA status | Renewal alert |
|---|---|---|---|---|
| Railway (hosting: web+api+worker+Redis) | usage-based (flat-ish) | month-to-month | ACCEPTED (SP-2) | — |
| Supabase (DB+Auth+Storage) | plan-based | month-to-month | ACCEPTED (SP-1) | verify backup/PITR posture (10.B.1) |
| VPS Hermes (engines flat-fee: Claude Max + ChatGPT) | flat subscriptions | month-to-month | n/a (internal) | — |
| Stripe | per-transaction | — | ACCEPTED (SP-3) | — |
| Resend | plan-based | — | ACCEPTED (SP-4) | — |
| LLM APIs (Anthropic/OpenAI/Gemini/Perplexity) | usage (`api_spend` metered) | — | ACCEPTED (SP-5..8) | spend caps per console |
| DataForSEO / SerpAPI | usage | — | ACCEPTED (SP-9) | own prod account pending |
| SmartLead | plan (incl. 2k lead-finder credits/mo) | — | **NOT ASSESSED (SP-19)** | terms review owed |
| Apify | not yet contracted | — | NOT ASSESSED (SP-20, planned) | blocked until terms + geofence |
| n8n cloud | plan (2.5k exec/mo ceiling) | — | NOT ASSESSED (SP-13) | migrating jobs to VPS cron |
| Postiz / Notion / Pexels / HeyGen / Telegram / GitHub | plan/free | — | NOT ASSESSED (SP-11/12/15/17/18/21) | second-wave DPA review |

## Budget vs actual (current quarter)
| Department | Budget | Actual | Variance % |
|---|---|---|---|
| Engineering | | | |
| Marketing | | | |
| Sales | | | |
| CX | | | |
| Finance | | | |
| Legal | | | |

## Financial alerts
_Items requiring CEO or founder attention._
- Pages $99 advertises "InStock" with checkout 503 (`STRIPE_PRICE_ID_PAGES` absent) — revenue leak + honesty risk (10.A.5).
- Zero revenue with live API spend — first campaign dispatch is the lever.
- Accounting tool unchosen; reconciliation Stripe↔ledger↔cost (5.C.3) not built.

## Decisions log (append-only)
- **2026-09-02** | TL;DR + vendor tracker first-filled (docs/legal sweep PR). Margin premise corrected: Agency is capped at 10 brands / 58 audits-month → ≈92% API-cost margin, not negative (the 25-brand premise was impossible). Measured costs recorded (audit $0.80 / test $0.03 / pages $0.15). Credit pack = ~$13 derived (`overagePackUsd()`), never $20. Sources: COST-MODEL.md §5, PLAN_LIMITS, sweep 10.D.11.
