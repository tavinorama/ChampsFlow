# Company State

> Single source of truth for CEO agent. Read first every session. Updated by ceo-agent after every VP dispatch.

## TL;DR
Organic Posts is a pre-launch AI-native SaaS helping SMBs post consistently on social media without hiring a marketer. Mid-Phase 5 MVP build (Engineering active), zero public presence (Marketing activating 2026-05-03 for pre-launch demand), Legal operational for compliance gates. Sales/CX/Finance deferred until post-revenue. Two Q2 2026 OKRs: ship MVP in 60 days, build pre-launch demand (landing + 100 waitlist + 3 content pieces).

## Company meta
- **Name**: Organic Posts (working title — needs founder confirmation)
- **One-liner**: AI-powered draft-and-confirm social media posting for small businesses
- **Mission**: Help small businesses post consistently on social media without hiring a marketer
- **Stage**: pre-launch, mid-MVP build
- **Jurisdictions**: EU + US
- **Sector**: SMB SaaS / social media automation
- **Stack**: Next.js + Hono + Supabase + Railway; default LLM Anthropic Claude Sonnet
- **v1 platforms**: LinkedIn + Instagram
- **Founded**: 2026-05-01 (product), 2026-05-03 (company structure)

## Current quarter OKRs
_Updated by CEO on init and quarterly. PROPOSED — awaiting founder confirmation._

### Q2 2026

#### Objective 1: Ship MVP in 60 days (target 2026-07-02)
- KR1.1: 3 beta users actively posting via Organic Posts — Owner: vp-engineering — Target: 3 — Current: 0
- KR1.2: Capabilities C2, C3, C5, C6 shipped through Phase 7 — Owner: vp-engineering — Target: 4 caps — Current: 0
- KR1.3: Production deploy live with monitoring — Owner: vp-engineering — Target: 1 — Current: 0

#### Objective 2: Build pre-launch demand
- KR2.1: Landing page live — Owner: vp-marketing — Target: 1 by 2026-05-17 — Current: 0
- KR2.2: Waitlist signups — Owner: vp-marketing — Target: 100 — Current: 0
- KR2.3: Content pieces published — Owner: vp-marketing — Target: 3 — Current: 0

## Department status
| Department | VP Agent | Status | Top KR | Last updated |
|---|---|---|---|---|
| Engineering | vp-engineering | ACTIVE (mid-Phase 5; C4+C1 shipped) | KR1.2 (4 caps remaining) | 2026-05-03 |
| Marketing | vp-marketing | ACTIVATING (pre-launch brief dispatched) | KR2.1 (landing page in 14 days) | 2026-05-03 |
| Sales | vp-sales | DEFERRED (until post-revenue) | — | 2026-05-03 |
| CX | vp-cx | DEFERRED (until first beta user) | — | 2026-05-03 |
| Finance | vp-finance | DEFERRED (until post-revenue) | — | 2026-05-03 |
| Legal | vp-legal | OPERATIONAL (compliance gates passed; on-call for marketing legal copy) | — | 2026-05-03 |

## Cross-department dependencies
_Active dependencies that require CEO coordination._
- **Marketing → Legal**: Terms / Privacy Policy / Cookie copy needed for landing page footer. DPA copy already in `docs/04-ux.md` (reference, do not duplicate).
- **Marketing → Engineering**: Waitlist signup form needs a captured-email destination (Supabase table or third-party). Decision pending — flagged to founder.
- **Engineering → Marketing**: Brand voice + visual identity needed for in-product copy and any post-MVP UI polish. Non-blocking.

## Open risks (company level)
_Material risks affecting more than one department._
- **R1**: Brand name "Organic Posts" not validated for trademark/domain availability (EU + US). Owner: vp-legal once activated; founder decision needed first.
- **R2**: No public face / founder voice yet — affects content authenticity. Owner: founder.
- **R3**: Beta acquisition channel undefined. Owner: founder + vp-marketing.
- **R4**: 60-day MVP timeline aggressive given 4 capabilities + 2 phases remain. Owner: vp-engineering to validate next dispatch.

## Decisions log (append-only)
_Date | CEO decision | Affected departments | Rationale_
- **2026-05-03** | Integrate existing product "Organic Posts" into full company structure under CEO orchestration | All | Founder request; product is mid-Phase 5 with zero public presence and needs coordinated pre-launch motion.
- **2026-05-03** | Activate Marketing department for pre-launch demand generation | Marketing, Engineering, Legal | Landing page + waitlist + content needed before MVP launch in 60 days; Engineering and Legal stay coordinated via dependencies above.
- **2026-05-03** | Defer Sales, CX, Finance until post-revenue | Sales, CX, Finance | Pre-launch with no users and no revenue; activating these now would burn tokens with no signal.
- **2026-05-03** | Q2 2026 OKRs proposed (O1: MVP in 60 days, O2: pre-launch demand) | All active | Awaiting founder confirmation. Defaults set so VPs can begin operational planning.
- **2026-05-03** | Locked honesty constraint on all marketing output | Marketing, Legal | No fake testimonials, no fabricated metrics, transparent waitlist mode; aligns with FTC §5 substantiation and EU AI Act transparency principles.
- **2026-05-04** | Founder default-confirmed pending pre-launch decisions | Marketing, Legal, Engineering | Domain: organicposts.ai (founder to register; .com check pending). Brand colors: primary teal-green #2D8F7C + neutral grays. Founder public face: yes, LinkedIn-led. Q2 OKRs: confirmed as proposed. Founder may revise via CEO at any time.
- **2026-05-04** | Legal department activated for pre-launch copy production | Legal, Marketing | VP Legal dispatched legal-privacy-officer to produce 6 legal documents (Terms of Service, Privacy Policy, Cookie Policy, Sub-processors page, DPA template, Waitlist Privacy Notice). All 6 drafted. Founder decisions required before publication: (1) governing law — Delaware vs Ireland; (2) entity name confirmation; (3) DSR email confirmation; (4) EU representative appointment (GDPR Art. 27 — HIGH risk blocker). Hard deadline for founder review: 2026-05-14. Publication: 2026-05-17.
- **2026-05-11** | Domain confirmed: `organicposts.ai` | Marketing, Legal, Engineering | Founder confirmed (.com unavailable). `.ai` aligns with AI-focused positioning. Founder to register via Porkbun this week. R1 (brand/domain availability) now partially closed — trademark check still pending. |
- **2026-05-11** | Entity decision: **Portugal Lda** (Sociedade por Quotas) | Legal, Finance, Engineering | Founder lives in Portugal. PT Lda eliminates dual-jurisdiction tax complexity vs Delaware, costs ~€360 to form (vs $500 + ongoing US compliance), and removes GDPR Art. 27 EU representative requirement (entity is EU-resident). Governing law for ToS/Privacy: Portuguese law, Lisbon tribunal. Delaware flip path preserved for future US VC funding if needed. Replaces prior placeholder governing law decision (Delaware vs Ireland) from 2026-05-04 Legal entry. |
- **2026-05-11** | GDPR Art. 27 EU representative requirement: **REMOVED** | Legal, Finance | Direct consequence of Portugal Lda decision. Entity is EU-resident, Art. 27 only applies to non-EU controllers. Saves ~€100-500/month VeraSafe/DataRep contract. Privacy Policy must be updated to remove EU rep section and replace with PT registered office. |
- **2026-05-11** | Stripe SCC module determination: **SIMPLIFIED** | Legal | Portugal Lda is established in EU. Stripe (Ireland) → Organic Posts (Portugal) is intra-EU controller-to-processor under GDPR Art. 28 — no cross-border SCC module determination needed. Removes prior external counsel dependency. |
- **2026-05-11** | Propagate PT Lda + Art. 27 removal across legal/compliance docs | Legal, Marketing | vp-legal dispatched to update ToS, Privacy Policy, DPA template, Sub-processors page, regulatory-map, ROPA, DPIA, gate-log, legal STATE, and unblock marketing STATE landing-page dependency. Substantive disclosures unchanged — entity-identity + governing-law + EU-rep-removal only. Carry-forward: registered office + Portuguese VAT to be added post-Empresa-Online incorporation (this week). |
- **2026-05-11** | Lda governance: sole shareholder (founder, 100%), capital social €1.000 | Legal, Finance | Founder confirmed sole shareholder structure. Spouse not a sócia. Standard share split of 100/0 — €1.000 capital social. Path: Empresa na Hora presencial (in-person at Loja do Cidadão) since CMD not yet active — faster than activating CMD + Empresa Online. Empresa na Hora completes same-day with NIPC + Certidão Permanente. |
