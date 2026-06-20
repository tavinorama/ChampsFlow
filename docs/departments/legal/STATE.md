# Legal Department State

> Owned by vp-legal. Read by ceo-agent (TL;DR only). Updated after every compliance agent dispatch.

## TL;DR

Legal activated 2026-05-04 for pre-launch copy deadline (2026-05-14 hard). All 6 legal documents drafted and ready for founder review. **2026-05-11 update**: Entity decided as **Organic Posts, Lda (Portugal)** — governing law (Portuguese law / Tribunal Cível de Lisboa) and entity identity resolved across all 6 docs; **GDPR Art. 27 EU representative requirement CLOSED** (not applicable for EU-established controller). Remaining items: (a) registered office + Portuguese VAT to be added post-Empresa-Online incorporation this week, (b) DSR email forwarding via Cloudflare (founder operational task), (c) five sub-processor DPAs pending signature. GDPR posture upgraded from AMBER to AMBER-GREEN (Art. 27 closed; DPAs are now the main residual item).

## Department meta
- **Head**: vp-legal
- **External counsel**: Not yet retained — flagged as required before launch
- **DPO**: Not mandatory at current scale. Reassess at Series A.

## Compliance posture
| Jurisdiction / Framework | Status | Last reviewed | Next review |
|---|---|---|---|
| GDPR (EU) | AMBER-GREEN — Art. 27 EU representative CLOSED (entity established in PT/EU); sub-processor DPAs still unsigned | 2026-05-11 | 2026-05-14 (pre-launch checkpoint) |
| ePrivacy / Cookie | GREEN — Plausible Analytics (cookieless) selected; no banner required at launch | 2026-05-04 | On any new analytics tool addition |
| EU AI Act | GREEN — Limited risk classification confirmed; Art. 50 transparency labels in UX; Anthropic ZDR confirmed | 2026-05-04 | Gate 6 |
| CCPA/CPRA (CA) | AMBER — "Do Not Sell or Share" link and CCPA section in Privacy Policy drafted; implementation pending Engineering | 2026-05-04 | 2026-05-17 (launch) |
| US State Privacy (other) | GREEN — regulatory-map.md covers VA, CO, CT, TX equivalents; honored via Privacy Policy | 2026-05-04 | Quarterly |
| SOC 2 | NOT STARTED — deferred to post-launch | — | Q3 2026 |
| ISO 27001 | NOT STARTED — deferred to post-launch | — | Q4 2026 |

## DPA tracker
| Sub-processor | Service | Region | DPA signed | Next review |
|---|---|---|---|---|
| Anthropic | AI inference (ZDR) | Bedrock eu-central-1 / direct API us-east-1 | PENDING — must sign before EU launch | 2026-05-14 |
| Supabase | Database + auth | eu-central-1 (EU) / us-east-1 (US) | PENDING — must sign before EU users onboard | 2026-05-14 |
| Railway | App hosting | [Region TBC by founder] | PENDING — must confirm EU region + sign DPA | 2026-05-14 |
| Resend | Transactional email | EU infra for EU users | PENDING — must sign before EU launch | 2026-05-14 |
| Stripe | Billing | US-hosted | PENDING — SCCs in place via Stripe standard DPA; founder must accept Stripe DPA | 2026-05-14 |
| Plausible Analytics | Analytics (no PII) | EU-hosted | NOT REQUIRED — no personal data processing | — |

## Contract pipeline
| Contract | Type | Counterparty | Status | Risk level |
|---|---|---|---|---|
| Terms of Service | Customer-facing | All users | DRAFTED — governing law RESOLVED (Portuguese law / Tribunal Cível de Lisboa); entity = Organic Posts, Lda. Awaiting founder review + registered office/VAT at incorporation. | LOW (governing law resolved) |
| Privacy Policy | Customer-facing | All users | DRAFTED — Art. 27 EU rep section REMOVED (entity is EU-established); controller identity updated to Organic Posts, Lda. Awaiting founder review + DSR mailbox forwarding. | LOW (EU rep blocker closed) |
| Cookie Policy | Customer-facing | All users | DRAFTED — complete, no blockers | LOW |
| Sub-processors page | Disclosure | All users | DRAFTED — Railway region TBC | LOW |
| DPA template | Customer DPA | EU customers | DRAFTED — awaiting founder review | MEDIUM |
| Waitlist Privacy Notice | Customer-facing | Waitlist signups | DRAFTED — complete, no blockers | LOW |

## SAR / Erasure tracker
| Request type | Date received | Jurisdiction | Deadline | Status |
|---|---|---|---|---|
| None open | — | — | — | — |

## Regulatory calendar
| Regulation | Change | Effective date | Impact | Action required |
|---|---|---|---|---|
| GDPR Art. 27 | EU representative mandatory if non-EU entity serving EU residents | Already in force | NOT APPLICABLE — Organic Posts, Lda is established in Portugal (EU) | CLOSED 2026-05-11 — no representative required |
| EU AI Act Art. 50 | AI-generated content transparency disclosure | Enforcement 2025-08-02 | In scope — limited risk system | Implemented in UX (AI badge on every draft) |
| CCPA/CPRA | "Do Not Sell or Share" + Limit Sensitive PI | In force | CCPA compliance required | Drafted in Privacy Policy; Engineering to implement /account/data-privacy page |
| Colorado AI Act (SB 24-205) | AI developer/deployer obligations for high-risk AI | 2026-02-01 | NOT APPLICABLE — Organic Posts classified limited risk, not high-risk under EU AI Act | Monitor; reassess if features expand |

## Founder decisions required (hard blockers)
1. ~~**Governing law**: Delaware vs Ireland~~ — **RESOLVED 2026-05-11**: Portuguese law, Tribunal Cível de Lisboa. Propagated to ToS §13, DPA Part 9.
2. ~~**Entity name**~~ — **RESOLVED 2026-05-11**: Organic Posts, Lda (Sociedade por Quotas, Portugal). Registered office + Portuguese VAT to be confirmed at incorporation completion (Empresa Online, this week).
3. **DSR email**: privacy@organicposts.ai — Cloudflare email forwarding to be set up by founder this week. Operational, not legal-doc blocker.
4. ~~**EU representative (Art. 27 GDPR)**~~ — **CLOSED 2026-05-11**: Not applicable. Organic Posts, Lda is established in Portugal (EU). Saves ~EUR 100–500/month VeraSafe/DataRep contract.
5. **Sub-processor DPA execution**: Founder must sign DPAs with Anthropic, Supabase, Railway, Resend, and Stripe before launch. VP Legal to track; founder signature required.
6. **Manual DPA process**: Large customers may request a countersigned DPA. A manual review and signature process must be established — not automated. Contact privacy@organicposts.ai flow needed.

**Pending: post-incorporation propagation (founder action this week)** — registered office address + Portuguese VAT number to be added to ToS, Privacy Policy §12 contact, DPA template, ROPA, and Sub-processors page once Empresa Online output is available.

## Operational risks flagged
- **R-L1 [CLOSED 2026-05-11]**: ~~EU representative not appointed~~ — Not applicable; entity established in Portugal (EU).
- **R-L2 [HIGH]**: Sub-processor DPAs unsigned — DPA rule (GDPR Art. 28) mandates DPAs before any sub-processor touches personal data. All 5 pending DPAs must be signed before 2026-05-17.
- **R-L3 [RESOLVED 2026-05-11]**: ~~Governing law and entity formation not confirmed~~ — Portuguese law / Tribunal Cível de Lisboa; Organic Posts, Lda. Residual carry-forward: registered office + VAT at incorporation completion.
- **R-L4 [CLOSED 2026-05-11]**: ~~Stripe SCC module determination~~ — Intra-EU processing path (Stripe Ireland → Organic Posts Portugal) is Art. 28 controller-to-processor; no cross-border SCC module determination required for that path.
- **R-L5 [LOW]**: Trademark search for "Organic Posts" not completed (EU + US). Company STATE R1. Owner: vp-legal + qualified trademark counsel.
- **R-L6 [LOW NEW 2026-05-11]**: Registered office + Portuguese VAT number TBC at incorporation — placeholder text in ToS, Privacy Policy, DPA, ROPA, Sub-processors. Not a launch blocker for landing/waitlist; required before first EU customer onboards into live SaaS product.

## Decisions log (append-only)
- **2026-05-04** | VP Legal activated for pre-launch copy | Dispatched legal-privacy-officer to produce all 6 legal documents (Terms, Privacy Policy, Cookie Policy, Sub-processors page, DPA template, Waitlist Privacy Notice). Hard deadline 2026-05-14 for founder review; publication deadline 2026-05-17 (landing page launch). All 6 docs drafted. Six founder decisions required before publication — see blockers above.
- **2026-05-11** | Two founder decisions propagated across all legal/compliance docs | Decision 1: Entity = Organic Posts, Lda (Portugal — Sociedade por Quotas). Decision 2: GDPR Art. 27 EU representative REMOVED (not applicable; entity is EU-established). Files updated: terms-of-service.md (entity + §13 governing law), privacy-policy.md (controller identity + Art. 27 section removed + contact), dpa-template.md (entity + Part 9 governing law + Art. 28 chain note), sub-processors.md (EU-establishment intro), regulatory-map.md (2026-05-11 update section), ropa.md (controller info), dpia.md (§1 controller role). gate-log.md: closure entry appended (Item 4 Art. 27, Item 3 Stripe SCC closed). No substantive disclosures changed — entity-identity + governing-law + EU-rep-removal only.
