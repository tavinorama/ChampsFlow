# Legal Department State

> Owned by vp-legal. Read by ceo-agent (TL;DR only). Updated after every compliance agent dispatch.

## TL;DR

**Refreshed 2026-07-10 (issue #213).** Entity identity CONFIRMED: the operating entity is **Ozvor** — trade name of a Brazilian **MEI (Microempreendedor Individual)**, CNPJ **67.609.444/0001-08**, registered office Rua José Borges Abrantes, nº 1, Centro, Muriaé — MG, CEP 36.880-063, Brasil; regulator **ANPD**; home jurisdiction Brazil (LGPD). The holder's civil name (razão social) is on file under the CNPJ and is intentionally not reproduced in any doc — CNPJ is the public identifier. Governing law for ToS/DPA: **Brazilian law** (live ToS §12). Privacy/DSR contact: **dpo@ozvor.com**. All customer-facing legal pages are LIVE on ozvor.com (Terms, Privacy, Cookies, Sub-processors, DPA, DSR request, Do-Not-Sell, California). The prior "Organic Posts, Lda (Portugal) / Portuguese law / Tribunal Cível de Lisboa / privacy@organicposts.ai" state (2026-05-11) is SUPERSEDED — see ropa.md (2026-07-08) and regulatory-map.md/dpia.md (2026-07-09). Open items: (a) **GDPR Art. 27 EU representative** — RE-INSTATED and required before EU onboarding (non-EU controller), appointment pending; (b) **Encarregado (LGPD Art. 41)** — appointment pending (founder), Gate 7 hard stop; (c) sub-processor DPA execution status — founder-held, unconfirmed; (d) external counsel review before paid EU/BR launch; (e) DPIA open conditions GEO-D1/D2/D3.

## Department meta
- **Head**: vp-legal
- **External counsel**: Not yet retained — required before paid EU/BR launch (see live legal page source comments)
- **DPO / Encarregado**: GDPR DPO not mandatory at current scale (reassess at Series A). **LGPD Encarregado (Art. 41) IS required — appointment pending (founder); Gate 7 hard stop.** Public privacy contact: dpo@ozvor.com.

## Compliance posture
| Jurisdiction / Framework | Status | Last reviewed | Next review |
|---|---|---|---|
| LGPD (Brazil — home jurisdiction) | AMBER — entity confirmed (Ozvor MEI, CNPJ 67.609.444/0001-08, Muriaé — MG; regulator ANPD); Encarregado (Art. 41) appointment PENDING (Gate 7 hard stop); international-transfer basis BR→US (GEO-D3) open | 2026-07-10 | Before paid BR launch |
| GDPR (EU) | AMBER — **Art. 27 EU representative RE-INSTATED and REQUIRED** (non-EU controller since 2026-05-30 jurisdiction change); appointment pending before any EU user onboards; sub-processor DPA execution unconfirmed (founder-held) | 2026-07-10 | Before EU onboarding |
| ePrivacy / Cookie | GREEN — strictly necessary cookies + consent-gated GA4 (opt-in banner; ad_storage denied); live Cookie Policy at ozvor.com/legal/cookies | 2026-07-10 | On any new analytics/marketing tool |
| EU AI Act | GREEN — Limited risk (Art. 50) for the GEO platform; AI-generated labels in UX; see ai-risk-assessment.md GEO sections | 2026-06-09 | Before new LLM provider activation |
| CCPA/CPRA (CA) | GREEN-AMBER — "Do Not Sell or Share" + California pages live (/legal/do-not-sell, /legal/california-privacy); DSR intake live (/legal/dsr-request) | 2026-07-10 | Quarterly |
| US State Privacy (other) | GREEN — regulatory-map.md covers VA, CO, CT, TX equivalents; honored via Privacy Policy | 2026-05-04 | Quarterly |
| SOC 2 | NOT STARTED — deferred to post-launch | — | Q3 2026 |
| ISO 27001 | NOT STARTED — deferred to post-launch | — | Q4 2026 |

## DPA tracker

> The authoritative public list is the live Sub-Processors page (ozvor.com/legal/sub-processors, updated 24 June 2026) — **11 sub-processors**: Supabase, Anthropic, OpenAI, Google (Gemini), Perplexity (US users only; EU excluded pending safeguards), DataForSEO, SerpAPI, Stripe, Resend, Railway, Cloudflare. Execution status of each provider DPA is founder-held and UNCONFIRMED in this repo — do not claim signed status without founder confirmation.

| Sub-processor | Service | Region | DPA signed | Next review |
|---|---|---|---|---|
| Anthropic | AI inference (no-training API terms) | US-hosted API; EU-region inference on roadmap | UNCONFIRMED — founder to verify before EU launch | Pre-EU onboarding |
| OpenAI | AI inference | US-hosted; EU path where available | UNCONFIRMED — founder to verify | Pre-EU onboarding |
| Google (Gemini) | AI inference | EU paths preferred for EU users | UNCONFIRMED — founder to verify | Pre-EU onboarding |
| Perplexity | AI inference (US users only) | US-hosted | UNCONFIRMED — **EU users excluded until safeguards confirmed (GEO-A3)** | Before EU inclusion |
| Supabase | Database + auth | eu-central-1 (EU) / us-east-1 (US) | UNCONFIRMED — founder to verify | Pre-EU onboarding |
| Railway | App hosting | Region per deployment; EU preferred for EU users | UNCONFIRMED — founder to verify | Pre-EU onboarding |
| Resend | Transactional email | EU infra for EU users where available | UNCONFIRMED — founder to verify | Pre-EU onboarding |
| Stripe | Billing | US-hosted | UNCONFIRMED — Stripe standard DPA/SCCs; founder must confirm acceptance | Pre-launch |
| DataForSEO / SerpAPI | Public off-site & SERP signals | US/EU | No personal data transmitted by design — verify no DPA required | Quarterly |
| Cloudflare | CDN / DNS / network security | Global edge; EU PoPs for EU traffic | UNCONFIRMED — founder to verify | Pre-EU onboarding |

## Contract pipeline
| Contract | Type | Counterparty | Status | Risk level |
|---|---|---|---|---|
| Terms of Service | Customer-facing | All users | **LIVE** at ozvor.com/terms-of-service (updated 13 June 2026) — entity Ozvor (Brazilian MEI, CNPJ 67.609.444/0001-08), governing law Brazil. Internal mirror docs/legal/terms-of-service.md refreshed 2026-07-10 (#213). Counsel review required before paid EU/BR launch. | MEDIUM (pre-counsel) |
| Privacy Policy | Customer-facing | All users | **LIVE** at ozvor.com/privacy-policy — controller Ozvor (MEI, CNPJ, Muriaé office), contact dpo@ozvor.com; Art. 27 EU rep + Encarregado appointments still pending. Internal mirror refreshed 2026-07-10 (#213). | MEDIUM (Art. 27 / Encarregado pending) |
| Cookie Policy | Customer-facing | All users | **LIVE** at ozvor.com/legal/cookies (updated 24 June 2026) — strictly necessary + consent-gated GA4. Internal mirror refreshed 2026-07-10 (#213). | LOW |
| Sub-processors page | Disclosure | All users | **LIVE** at ozvor.com/legal/sub-processors (updated 24 June 2026) — 11 sub-processors. Internal mirror refreshed 2026-07-10 (#213). | LOW |
| DPA | Customer DPA | Business customers | **LIVE** at ozvor.com/legal/dpa — GDPR Art. 28 + LGPD; governed by Brazilian law; contact dpo@ozvor.com. Internal mirror refreshed 2026-07-10 (#213). Manual countersigned-DPA process still undefined. | MEDIUM |
| Waitlist Privacy Notice | Customer-facing | Waitlist signups | ARCHIVED — waitlist era ended at launch; no live waitlist page. docs/legal/waitlist-privacy.md marked historical (2026-07-10). | — |

## SAR / Erasure tracker
| Request type | Date received | Jurisdiction | Deadline | Status |
|---|---|---|---|---|
| None open | — | — | — | — |

## Regulatory calendar
| Regulation | Change | Effective date | Impact | Action required |
|---|---|---|---|---|
| GDPR Art. 27 | EU representative mandatory if non-EU entity serving EU residents | Already in force | **APPLICABLE — RE-INSTATED 2026-05-30** (controller is Brazil-established, non-EU) | Appoint EU representative BEFORE any EU user onboards (Gate 7 hard stop) |
| LGPD Art. 41 | Encarregado de Dados (data protection officer) required | In force | APPLICABLE — Brazil-domiciled controller (ANPD) | Founder to appoint Encarregado + publish contact in Privacy Policy (Gate 7 hard stop) |
| LGPD Art. 48 / ANPD Res. CD/ANPD 02/2022 | Breach notification to ANPD within 2 business days for significant incidents | In force | APPLICABLE | Encoded in docs/runbooks/breach-notification.md |
| EU AI Act Art. 50 | AI-generated content transparency disclosure | Enforcement 2025-08-02; full applicability Aug 2026 | In scope — limited risk system (GEO platform) | AI-generated labels live in UX; monitor Aug 2026 deadline |
| CCPA/CPRA | "Do Not Sell or Share" + Limit Sensitive PI | In force | CCPA compliance required | LIVE — /legal/do-not-sell + /legal/california-privacy + /legal/dsr-request |
| Colorado AI Act (SB 24-205) | AI developer/deployer obligations for high-risk AI | 2026-02-01 | NOT APPLICABLE — Ozvor classified limited risk, not high-risk under EU AI Act | Monitor; reassess if features expand |

## Founder decisions required (hard blockers)
1. ~~**Governing law**~~ — **RESOLVED (superseding 2026-05-11 Portuguese-law decision)**: Brazilian law, per the 2026-05-30 jurisdiction change; live in ToS §12 and DPA §10 on ozvor.com. The Portuguese law / Tribunal Cível de Lisboa decision is historical only.
2. ~~**Entity name**~~ — **RESOLVED / CONFIRMED 2026-07-08**: Ozvor — Brazilian MEI, CNPJ 67.609.444/0001-08, registered office Rua José Borges Abrantes, nº 1, Centro, Muriaé — MG, CEP 36.880-063, Brasil. Razão social (holder's civil name) on file under the CNPJ; intentionally NOT reproduced in docs. Supersedes "Organic Posts, Lda (Portugal)" (2026-05-11) and "TrustIndex AI Ltda" (2026-06-09).
3. **DSR email**: dpo@ozvor.com (referenced on all live legal pages) — Cloudflare Email Routing to founder mailbox per docs/runbooks/email-setup-cloudflare.md. Founder to confirm routing is active. Operational, not legal-doc blocker.
4. **EU representative (Art. 27 GDPR)** — **RE-OPENED 2026-05-30, still PENDING**: required before any EU user onboards (controller is non-EU). Gate 7 hard stop.
5. **Encarregado (LGPD Art. 41)** — **PENDING (founder)**: appoint and publish contact in Privacy Policy. Must be a natural person. Gate 7 hard stop.
6. **Sub-processor DPA execution**: Founder must confirm DPA/terms acceptance with the 11 live sub-processors (see DPA tracker). VP Legal to track; execution status currently unconfirmed.
7. **Manual DPA process**: Large customers may request a countersigned DPA. A manual review and signature process must be established — not automated. Contact dpo@ozvor.com flow needed.

## Operational risks flagged
- **R-L1 [HIGH — RE-OPENED 2026-05-30]**: EU representative (GDPR Art. 27) not appointed — required before EU onboarding since the entity moved to Brazil. (The 2026-05-11 closure assumed an EU-established entity and no longer applies.)
- **R-L2 [HIGH]**: Sub-processor DPA execution unconfirmed — GDPR Art. 28 / LGPD Art. 39 mandate processor contracts before any sub-processor touches personal data. Founder to confirm status for all 11 live sub-processors.
- **R-L3 [RESOLVED 2026-07-08]**: ~~Governing law and entity formation not confirmed~~ — Brazilian law; Ozvor MEI, CNPJ 67.609.444/0001-08, Muriaé — MG office confirmed (ropa.md 2026-07-08).
- **R-L4 [RE-OPENED 2026-05-30, tracked in DPIA]**: Stripe transfer mechanism — the intra-EU simplification (2026-05-11) assumed a Portugal entity; with a Brazil-established controller, BR→US transfer basis is tracked as DPIA GEO-D3.
- **R-L5 [LOW]**: Trademark search for "Ozvor" not completed (BR + EU + US). Note the live ToS already disambiguates from "Trustindex.io" (review-widget provider). Owner: vp-legal + qualified trademark counsel.
- **R-L6 [CLOSED 2026-07-08]**: ~~Registered office + registration number TBC~~ — CNPJ + Muriaé registered office populated in ROPA/DPIA and live legal pages. (The "Portuguese VAT" carry-forward is obsolete — no Portuguese registration exists; see regulatory-map.md 2026-07-09 correction.)
- **R-L7 [MEDIUM NEW 2026-07-10]**: Encarregado (LGPD Art. 41) not appointed — Gate 7 hard stop before BR launch. Owner: founder.

## Decisions log (append-only)
- **2026-05-04** | VP Legal activated for pre-launch copy | Dispatched legal-privacy-officer to produce all 6 legal documents (Terms, Privacy Policy, Cookie Policy, Sub-processors page, DPA template, Waitlist Privacy Notice). Hard deadline 2026-05-14 for founder review; publication deadline 2026-05-17 (landing page launch). All 6 docs drafted. Six founder decisions required before publication — see blockers above.
- **2026-05-11** | Two founder decisions propagated across all legal/compliance docs | Decision 1: Entity = Organic Posts, Lda (Portugal — Sociedade por Quotas). Decision 2: GDPR Art. 27 EU representative REMOVED (not applicable; entity is EU-established). Files updated: terms-of-service.md (entity + §13 governing law), privacy-policy.md (controller identity + Art. 27 section removed + contact), dpa-template.md (entity + Part 9 governing law + Art. 28 chain note), sub-processors.md (EU-establishment intro), regulatory-map.md (2026-05-11 update section), ropa.md (controller info), dpia.md (§1 controller role). gate-log.md: closure entry appended (Item 4 Art. 27, Item 3 Stripe SCC closed). No substantive disclosures changed — entity-identity + governing-law + EU-rep-removal only. **[Superseded — see current entity state in ropa.md (2026-07-08) and the 2026-07-10 entry below.]**
- **2026-07-10** | Legal STATE refreshed to confirmed Ozvor / Brazil-LGPD entity state (issue #213) | Living sections (TL;DR, meta, compliance posture, DPA tracker, contract pipeline, regulatory calendar, founder decisions, risks) updated from the stale 2026-05-11 "Organic Posts, Lda (Portugal) / Portuguese law / Tribunal Cível de Lisboa / privacy@organicposts.ai" state to the confirmed state: **Ozvor — Brazilian MEI, CNPJ 67.609.444/0001-08, registered office Rua José Borges Abrantes nº 1, Centro, Muriaé — MG, CEP 36.880-063, Brasil; regulator ANPD; governing law Brazil; contact dpo@ozvor.com** (sources: ropa.md 2026-07-08, dpia.md + regulatory-map.md 2026-07-09 corrections, live legal pages on ozvor.com). Razão social intentionally not reproduced (CNPJ is the public identifier). GDPR Art. 27 EU rep re-instated as REQUIRED/pending; Encarregado (LGPD Art. 41) appointment remains PENDING (founder). Internal docs/legal/*.md mirrors aligned to the live pages same day. Historical log entries above preserved unedited (append-only).
