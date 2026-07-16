# ICP Website Audit — ozvor.com (2026-07-02)

> **TL;DR (≤200 words).** Audited the live site (/, /pricing, /how-it-works, /organicposts) through
> the eyes of the two playbook personas. **For the SMB owner (Growth $99) the site is strong**:
> clear hero, sourced stats, visceral "search moved" narrative, low-friction free test, honest
> guarantees. **For the agency owner (Agency $549) the site is nearly silent**: "agency" appears
> once on the homepage and only inside the pricing card — yet agencies are Segment A of our ICP and
> the white-label Agency OS already exists in-product. Biggest conversion gaps, in order:
> **(P1)** no agency-facing page/section selling multi-client + white-label + pitch mode;
> **(P2)** price-framing inconsistency — navbar says "from $69/mo", hero says "from $99/mo", the
> featured annual card leads with the scary "$831/yr" while the friendly "≈$69/mo" is the small
> print (invert it), and the "$69" claims must follow the founder-offer status automatically;
> **(P3)** no proof assets — solvable without fabrication by publishing Ozvor's own real audit
> (score 50) as a living case study, which also dramatizes the honesty positioning;
> **(P4)** the "$30k/yr specialist" headline can read as hostile to agencies (they ARE the
> specialist) — needs an agency-framed counterpart. Methodology: goose-skills `icp-website-audit`
> (persona scorecard), personas from `first-week-playbook.md`.

---

## Method
- Personas: Segment A (agency owner) + Segment B (SMB owner) from [first-week-playbook.md](first-week-playbook.md).
- Pages reviewed (live HTML, 2026-07-02): `/`, `/pricing`, `/how-it-works`, `/organicposts`.
- Scorecard dimensions from goose-skills `icp-website-audit` (clarity, pricing transparency, proof, CTA path, differentiation, trust).

## Scorecard

| Dimension | SMB owner (B) | Agency owner (A) | Notes |
|---|---|---|---|
| Message clarity | 8/10 | **4/10** | Home speaks only to "your brand" (single-brand owner voice) |
| Pricing transparency | 7/10 | 7/10 | All tiers public ✓ — but three different "from $X/mo" framings coexist |
| Proof / credibility | 4/10 | 4/10 | Sourced stats ✓ (OpenAI, Seer); zero testimonials/logos (pre-launch — expected) |
| CTA path | 9/10 | 6/10 | Free test → Kit → Growth is seamless; no agency-specific entry |
| Differentiation | 8/10 | 7/10 | 5-engine coverage + honesty stance land well; white-label buried |
| Trust signals | 7/10 | 7/10 | 30-day guarantee, privacy-first, methodology page ✓ |

## Findings & prioritized fixes

### P1 — Agencies (ICP Segment A) have no landing surface
"Agency" appears **once** on the homepage and only inside the pricing card. The in-product
**Agency OS** (15 brands, white-label reports, client approval workflow, pitch mode) is not sold
anywhere on the marketing site. An agency owner landing from outreach has to infer the offer from
a pricing bullet list.
**Fix:** an `/agencies` page (or homepage block + nav link): multi-client dashboard screenshot,
white-label story ("Ozvor under your brand"), per-client economics ($549 ÷ 15 brands ≈ $36.60/brand),
pitch-mode angle ("win the GEO line item before your competitor agency does"). ~½ day of code.

### P2 — Price-framing inconsistency (also an integrity risk)
Observed simultaneously: navbar CTA **"Start Growth · from $69/mo"**, hero **"See plans — from
$99/mo"**, pricing headline **"under $100/mo"**, featured card **"$831/yr"** with "≈ $69/mo" as
small print.
**Fixes:** (a) On annual cards, lead with the per-month figure (**$69/mo** large) and demote
"billed $831/yr" to the helper line — standard SaaS framing, reduces sticker shock. (b) The navbar
"from $69/mo" must be driven by `/api/founder-status` like the pricing page is — if it is static
copy it will silently lie when the founder offer retires (violates the honesty mandate). Verify and
wire. ~2h of code.

### P3 — Proof gap, solvable without fabrication
No testimonials/logos exist and none may be invented. The honest play: **publish Ozvor's own real
audit as the case study** — "Our own AI Visibility Score is 50. Here is the plan the product gave
us, and here is the weekly score as we execute it in public." Converts the honesty stance into a
living proof asset and feeds LinkedIn content weekly. ~½ day (page + weekly update ritual).

### P4 — Hero headline vs Segment A
"Replace a $30k/yr specialist for under $100/mo" is compelling for SMB owners but reads as a
threat to agencies (they are the specialist). Keep it on the SMB path; the `/agencies` surface
(P1) should carry the inverse frame: "white-label the specialist — deliver GEO to every client
without hiring one."

### Positives to preserve
Sourced stat blocks (OpenAI/Seer with dates), the two-era "search moved" storytelling, the ladder
("You do it → We do it with you"), 30-day money-back + no-auto-publish + privacy-first trust row,
and public methodology — all strong and aligned with the honesty positioning. No copy exaggerates
capability; nothing claims data we don't measure. ✓

## Suggested sequencing
P2(b) navbar/founder-status wiring (integrity, 2h) → P1 /agencies page (unlocks Segment A
outreach, ½ day) → P3 living case study (feeds content engine, ½ day) → P2(a)+P4 framing polish.
