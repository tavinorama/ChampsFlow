# Regulatory Map

> Owner: `legal-privacy-officer` — Created at Gate 0→1 (2026-05-01) — Updated whenever scope changes.
> Living document: update sections only; never rewrite historical entries.

---

## TL;DR

**Updated 2026-06-09 (legal-privacy-officer ratification).** TrustIndex AI (GEO platform, Brazil Ltda) is a general SaaS product with adtech-adjacent and data-broker-adjacent classifications. It processes personal data of EU and US B2B customers and their staff. Home jurisdiction is Brazil; LGPD applies in full. GDPR applies extraterritorially (Art. 3(2)) because services are offered to EU data subjects. CCPA/CPRA applies proactively from launch; TDPSA applies from launch (no revenue threshold). EU AI Act Art. 50 transparency obligations apply to all AI-generated content and GEO audit outputs. FTC §5 creates parallel US disclosure obligations. The highest-risk items for the GEO platform are: (1) EU Art. 27 representative not yet appointed (Gate 7 hard stop); (2) LGPD international transfer basis for BR→US sub-processor flows not yet documented (GEO-D3); (3) Perplexity DPA/SCC unconfirmed — EU users excluded by GEO-A3 routing gate; (4) multi-provider DPA chain (OpenAI EU path, Gemini EU path) requires Gate 7 confirmation. No HIPAA, GLBA, COPPA exposure identified. Reddit commercial data license required before Reddit monitoring feature is built.

---

## Sectoral classification

- **Primary sector**: General SaaS (social media management)
- **Adjacent classification**: Adtech-adjacent (AI-generated marketing content distribution)
- **Triggers special regimes?**: No HIPAA, GLBA, COPPA, FERPA, or FCRA signals at this stage. Note: Persona C mentions regulated-vertical SMBs (fintech/health SMBs) as potential customers — if health or financial SMBs use the platform to publish regulated content, sectoral review may be needed at Phase 2. Flag for PRD author.

---

## EU regulations applicable

- [x] **GDPR (Regulation 2016/679)** — Applies in full. Platform processes personal data of EU data subjects (end-users of SMB customers, agency clients' end-audience data indirectly via OAuth tokens, and EU-resident SMB operators as data subjects in their own right). Controller/processor split is non-trivial: the SMB/agency customer is likely the data controller for their own social audience data; Organic Posts is a data processor. However, Organic Posts acts as an independent controller for its own account/billing/usage data. Data Processing Agreements (DPAs) required with every SMB/agency customer in the EU.
- [x] **ePrivacy Directive (2002/58/EC, as amended)** — Applies if the platform uses cookies or similar tracking technologies in the web application (analytics, session management, A/B testing). Prior consent required for non-essential cookies. Equal-weight accept/reject UI required. Assessment to be confirmed at Gate 4 UX review.
- [x] **EU AI Act (Regulation 2024/1689)** — Generative AI feature for drafting post copy is likely classified as **limited-risk** under Art. 52 (now renumbered as Art. 50 in the final text). Transparency obligation: users must be informed that content is AI-generated or AI-assisted when that content is output for public posting. If the underlying LLM is a General Purpose AI (GPAI) model (e.g., GPT-4, Claude, Gemini), the GPAI provider's compliance obligations (Title VIII) are separate from Organic Posts' own Art. 50 obligations — Organic Posts cannot rely on the GPAI provider's compliance to discharge its own disclosure duty. Full AI risk classification to be documented in `docs/compliance/ai-risk-assessment.md` at Gate 2→3.
- [ ] **Digital Services Act (DSA)** — Unlikely to apply directly. Organic Posts is not a hosting service or online platform within DSA scope (it does not host third-party public content). Reassess if a content library or community feature is introduced in Phase 2.
- [ ] **NIS2 Directive (Directive 2022/2555)** — Not applicable at this stage. Organic Posts does not qualify as an essential or important entity under Annex I/II. Reassess if the platform scales to critical infrastructure clients.
- [ ] **Cyber Resilience Act** — Not applicable; Organic Posts is a SaaS service, not a product with digital elements sold in the EU (CRA scope). Reassess if a self-hosted or on-premise deployment option is introduced.

---

## US federal regulations applicable

- [x] **FTC Act §5 (15 U.S.C. § 45)** — Applies. Two distinct vectors: (1) Deceptive practices: if AI-generated content is posted as the SMB's authentic voice without disclosure, this may constitute a deceptive practice depending on context — the FTC's AI guidance (2023 policy statement) indicates AI-generated content in commercial communications requires clarity. (2) FTC Endorsement Guides (16 CFR Part 255, revised 2023): if AI-generated posts include endorsements or testimonial-style language, disclosure obligations attach. Phase 2 PRD must specify the disclosure mechanism (carry-over condition from Gate 0).
- [x] **CAN-SPAM Act (15 U.S.C. § 7701 et seq.)** — Applies if the platform sends commercial email (transactional notifications, marketing emails to SMB subscribers). Standard compliance: opt-out mechanism, physical address, no deceptive subject lines. Scope to be confirmed by product-spec-writer.
- [ ] **COPPA (15 U.S.C. § 6501 et seq.)** — Not currently triggered. The platform targets SMBs and their marketing staff; no feature directed at children under 13. Risk: if an SMB uses the platform to manage a TikTok or Instagram account with a minor-skewing audience, Organic Posts is not the operator of that audience relationship — the SMB is. Document this liability boundary in the PRD and Terms of Service.
- [ ] **HIPAA** — Not triggered at this stage. No PHI processing identified.
- [ ] **GLBA** — Not triggered at this stage. No NPI or financial data processing identified.
- [ ] **TCPA** — Not triggered unless the platform introduces SMS notifications. Flag for Phase 2 if SMS is in scope.

---

## US state privacy laws applicable

Threshold note: Most state laws trigger at 100,000 consumers/year (or 25,000 for laws with a revenue-from-data-sales prong). A B2B SaaS targeting SMBs processes data of the SMB operators (employees, founders) and potentially their end-customers indirectly. The B2B exemption is narrow and unreliable — treat SMB operator accounts as consumer records for compliance planning.

- [x] **CA — CCPA/CPRA (Cal. Civ. Code § 1798.100 et seq.)** — **High priority.** Thresholds: 100,000 consumers OR 50,000+ consumers + 50% revenue from data sale, OR $25M gross revenue. Given SMB target scale, threshold likely met within year 1. Obligations: Privacy Policy disclosures, "Do Not Sell or Share My Personal Information" link, opt-out of targeted advertising, data subject rights (access, deletion, correction, portability, limit sensitive PI use). Sensitive PI under CPRA: precise geolocation, account login credentials (OAuth tokens may qualify) — triggers additional use-limitation and opt-out rights.
- [x] **VA — VCDPA (Va. Code § 59.1-575 et seq.)** — Threshold: 100,000 consumers/year or 25,000 + 50% revenue from data sales. Likely triggered within 12–18 months. Opt-out of targeted advertising required. Controller/processor contracts required.
- [x] **CO — CPA + Colorado AI Act (C.R.S. § 6-1-1301 et seq.)** — CPA threshold: 100,000 consumers or 25,000 + 50% revenue from data. **Colorado AI Act (SB 24-205, effective 2026-02-01)**: applies to "high-risk AI systems" used in consequential decisions. Content generation for social posts is not a consequential decision under the Act's definition (employment, credit, housing, education, healthcare). Document this determination. Opt-out rights under CPA apply.
- [x] **CT — CTDPA (Conn. Gen. Stat. § 42-515 et seq.)** — Threshold: 100,000 consumers or 25,000 + 50% revenue. Similar opt-out framework.
- [x] **TX — TDPSA (Tex. Bus. & Com. Code § 541.001 et seq.)** — No revenue threshold; applies to any controller that conducts business in TX and processes data of TX residents beyond personal/family use and is not a small business under SBA definitions. Given multi-tenant SaaS targeting US SMBs, assume applicable from launch.
- [x] **OR — OCPA (ORS § 646A.570 et seq., effective 2024-07-01)** — Threshold: 100,000 consumers or 25,000 + 25% revenue from data sales.
- [ ] **UT — UCPA (Utah Code § 13-61-101 et seq.)** — Threshold: $25M revenue AND 100,000 consumers. Likely not triggered at launch; reassess at Series A scale.
- [ ] **MT — MTCDPA (Mont. Code § 30-14-3101 et seq., effective 2024-10-01)** — Threshold: 50,000 consumers or 25,000 + 25% revenue from data sales. Monitor.
- [ ] **IA — ICDPA (Iowa Code § 715D, effective 2025-01-01)** — Threshold: 100,000 consumers or 25,000 + 50% revenue. Monitor.
- [ ] **DE — DPDPA (Del. Code tit. 6 § 12D-101 et seq., effective 2025-01-01)** — Threshold: 35,000 consumers or 10,000 + 20% revenue. Lower threshold — monitor from early growth.
- [ ] **NH, NJ, MD, MN, RI, IN, TN, KY** — All enacted or effective 2025–2026. Thresholds range from 35,000–100,000 consumers. Proactive compliance posture (opt-out mechanism, DSR handling, controller contracts) addresses all simultaneously. Flag for external counsel verification of effective dates and any 2026 amendments.

**Recommendation**: Build a unified US privacy compliance baseline from launch (Privacy Policy, DSR handling, opt-out of targeted advertising/sharing) that satisfies CCPA/CPRA and is extensible to all other state laws. Do not treat state laws as individually addressed items at this stage.

---

## Anticipated sensitive data categories

- [x] **PII (Tier 1)**: Name, email address, IP address, device identifiers, account identifiers for every user and SMB operator.
- [x] **OAuth tokens / social account credentials (Tier 2)**: Access tokens for Instagram, LinkedIn, X, Facebook, TikTok accounts. These grant broad permissions over third-party accounts and are functionally equivalent to account passwords. Must be encrypted at rest and in transit; access logged; revocable by user. Under CPRA, account log-in credentials are sensitive PI triggering additional rights.
- [x] **Business content data**: Post copy, brand voice profiles, content calendars, audience insights imported from connected platforms. Contains proprietary business information; contractual confidentiality obligations apply even if not "personal data" under GDPR.
- [ ] **End-audience personal data (indirect)**: Social platform APIs may return follower/engagement data. If this data identifies natural persons, it becomes personal data under GDPR. Scope must be defined in PRD — minimize collection to what is strictly necessary for scheduling and analytics features.
- [ ] **Children's data**: Not anticipated, but SMBs in youth-facing sectors could expose Organic Posts indirectly. Address in ToS and DPA.
- [ ] **Biometric / health / financial / location data**: No current signals. Reassess at Phase 2 if brand-voice profiling via URL scraping is in scope (could capture sensitive content from business websites).

---

## Cross-border transfer mechanism

- **EU → US (LLM API inference)**: If post copy is generated by a US-hosted LLM API (OpenAI, Anthropic, Google), EU user content (brand voice data, draft copy) is transferred to the US. **Standard Contractual Clauses (SCCs) — Module 2 (controller-to-processor)** are required under GDPR Art. 46(2)(c). The LLM provider must offer SCCs; verify this before finalizing AI vendor selection in Phase 3. If the selected LLM provider holds **EU-US Data Privacy Framework (DPF)** certification and Organic Posts can rely on DPF, SCCs are an alternative mechanism — verify provider certification status. A **Transfer Impact Assessment (TIA)** is recommended given post-Schrems II scrutiny, particularly for inference traffic involving EU user content.
- **EU → US (SaaS hosting)**: If the application is hosted on US cloud infrastructure (AWS, GCP, Azure US regions), EU user account and operational data is transferred. Same SCC/DPF mechanism applies; EU data residency option (hosting in EU AWS/GCP/Azure regions) is the lower-risk alternative and should be evaluated in Phase 3 architecture.
- **Intra-US**: No transfer restrictions under US law; state law obligations travel with the data subject's residency, not the data's location.

---

## Top 5 regulatory risks

1. **OAuth token exposure and data breach liability (GDPR Art. 32, Art. 33/34; CCPA/CPRA)**: OAuth tokens grant posting rights to third-party social accounts. A breach exposing tokens could cause reputational and financial harm to SMB customers far exceeding Organic Posts' direct liability. High likelihood of targeted attack; critical severity. DPIA trigger confirmed. Mitigation: encryption, token rotation, minimal-scope OAuth permissions, breach response procedure required before launch.

2. **EU AI Act Art. 50 non-compliance — AI transparency (EU AI Act Art. 50)**: AI-generated post copy must be disclosed as AI-generated or AI-assisted when output to users for publishing. Failure to implement this disclosure mechanism before EU users onboard creates a direct regulatory violation. Phase 2 must specify the disclosure UX as a PRD feature (carry-over condition from Gate 0).

3. **Cross-border LLM inference without SCC/DPF coverage (GDPR Art. 44–46)**: Sending EU user content to a US-hosted LLM API without an adequate transfer mechanism is a per-transfer GDPR violation. Fine exposure: up to €20M or 4% global turnover. Must be resolved before any EU user data touches the LLM inference pipeline.

4. **Platform ToS violation — autonomous posting (non-regulatory but existential)**: Meta, LinkedIn, X, and TikTok each have automation policies that vary in restrictiveness. Fully autonomous posting without user confirmation may violate platform ToS, resulting in API access revocation — which would disable the core product. This is not a privacy law risk but is a legal-adjacent existential risk. Phase 2 PRD must commit to a posting model (human-confirmed vs. autonomous) with platform ToS reviewed per platform before that decision is finalized. External counsel or API policy specialist review recommended.

5. **CCPA/CPRA sensitive PI obligations for OAuth credentials and targeted advertising opt-out (Cal. Civ. Code § 1798.121)**: OAuth tokens likely qualify as "account log-in" sensitive PI under CPRA, triggering the right to limit use and disclosure. Additionally, if Organic Posts uses any post-performance or audience data for product analytics or advertising purposes, CCPA "sale or share" restrictions apply. "Do Not Sell or Share" link must be present from launch on all web pages accessible to California residents.

---

## External counsel review needed?

- [x] **Platform ToS legal analysis**: Each platform's (Meta, X, LinkedIn, TikTok) API/automation ToS requires legal interpretation before the PRD commits to a posting model. Recommend external counsel or specialist API policy review at Phase 2. This is a novel question with platform-specific nuance — do not rely solely on in-house assessment.
- [x] **EU-US SCC / DPF transfer mechanism**: Verify LLM provider's DPF certification status and SCC availability before Phase 3 architecture is finalized. Transfer Impact Assessment drafting should involve legal counsel familiar with Schrems II jurisprudence.
- [x] **Colorado AI Act (SB 24-205) applicability determination**: Confirm in writing that content-generation AI does not qualify as a "high-risk AI system" under the Act's consequential-decision definition. Document as a legal opinion or formal compliance determination, not an informal assessment.

---

## Gate 2→3 status — 2026-05-02

**Scope change**: None. PRD confirmed platform scope as LinkedIn + Instagram only (v1). No new data categories or processing operations identified beyond those captured at Gate 0. Analytics deferred to v1.1, which eliminates the end-audience demographic data exposure flagged at Gate 0 for the immediate release.

**New exposure confirmed**: Post content used for LLM inference may be retained by the LLM provider beyond the single inference call. This is not a new category but surfaces a secondary-purpose risk that must be resolved at Gate 3→4 when the LLM provider is selected (see gate-log new condition 4).

**DSR gap identified**: PRD does not specify a data subject rights (DSR) portal, intake, identity verification, or fulfillment workflow. This is a material gap for GDPR Art. 15–22 and all applicable US state laws. Added as a new HIGH condition for Gate 3→4 (architecture) and Gate 4→5 (UX).

**CCPA link placement gap**: CI-2 names footer and account settings for the "Do Not Sell or Share" link but does not name the Privacy Policy page, which is required by Cal. Civ. Code § 1798.135(a). Added as a new MEDIUM condition for Gate 4→5 (UX).

**Lawful basis map complete**: All 8 PII categories from PRD §7 mapped to GDPR Art. 6 lawful bases. No Art. 9 special-category data identified. No consent-based processing present in v1 (all processing grounded in contract or legal obligation), which simplifies the GDPR consent management layer for v1.

**Overall scope assessment**: No regulatory scope expansion at Gate 2→3. Existing map remains accurate. Next material update expected at Gate 3→4 when LLM provider, hosting provider, and sub-processor list are confirmed.

---

## 2026-05-11 update — Entity confirmed as Portugal Lda

Entity confirmed as Portugal Lda. GDPR Art. 27 representative no longer required. EU-established controller status confirmed. All other regulatory scope (GDPR, CCPA/CPRA, EU AI Act, FTC §5) unchanged.

- **GDPR Art. 27 (EU representative)**: REMOVED from scope. Controller is established in Portugal (EU); Art. 27 only applies to non-EU controllers/processors.
- **Governing law (ToS/Privacy/DPA)**: Portuguese law; competent court Tribunal Cível de Lisboa.
- **Stripe transfer mechanism**: Intra-EU Stripe (Ireland) → Organic Posts (Portugal) processing falls under GDPR Art. 28; cross-border SCC module determination no longer required for the EU billing path. SCCs + DPF still apply where the Stripe US infrastructure is in the path.
- **All other obligations** (GDPR Arts. 5–34, EU AI Act Art. 50, CCPA/CPRA, US state laws, FTC §5, CAN-SPAM, Colorado AI Act determination): **unchanged**.

Carry-forward: registered office address and Portuguese VAT number to be added to ToS, Privacy Policy, DPA, and ROPA at incorporation completion (founder action via Empresa Online — expected this week).

---

## 2026-05-18 — Material Pivot Update — GEO / AI-Visibility Platform (Gate 0→1 re-run)

**Pivot scope**: Product repositioned from social media scheduling (Organic Posts v1) to a continuous GEO / AI-visibility subscription platform. This update reflects the Gate 0→1 regulatory review of the pivoted product. All prior sections above remain historically accurate for the archived social-scheduling product; this section documents incremental scope changes and new exposures introduced by the pivot.

### Sectoral classification update

- **Primary sector**: General SaaS (GEO / AI-search visibility management) — unchanged classification.
- **Adjacent classifications added**: (a) **Adtech-adjacent** — content generation and distribution for commercial brand positioning in AI-search results; (b) **Data-broker-adjacent** — the Citation Monitor and competitor share-of-voice features systematically aggregate publicly available data about third parties (competitor brands and, potentially, named individuals appearing in AI-search citations). This data-broker-adjacent classification does not trigger FCRA or DPPA at this stage but warrants ongoing monitoring.
- **New sectoral risk**: The Reddit monitoring module (reading and aggregating public posts, subreddit discussions, author-attributed content) creates a profile-building risk that could be classified as "data brokering" under California CPRA § 1798.99.80 et seq. (data broker registration). Assessment: the primary purpose is brand-mention monitoring for the client's own brand, not reselling data about Reddit users — exemption likely applies. Confirm at Gate 2→3 with external counsel if Reddit aggregation scope expands beyond mention tracking.

### New EU regulations triggered or elevated by the pivot

- [x] **GDPR Art. 6 — lawful basis for third-party / competitor data processing**: The Citation Monitor and Strategy Generator will collect, store, and analyse data about competitor brands' AI-answer visibility. Where that data includes named individuals (e.g., a competitor's CEO mentioned in a citation, a Reddit post author, a Wikidata/Crunchbase-sourced person record), it constitutes personal data under GDPR Art. 4(1). Legitimate interests (Art. 6(1)(f)) is the anticipated lawful basis — the client has a legitimate commercial interest in competitive benchmarking. A proportionality and necessity analysis is required at Gate 2→3 (PRD §7 data inventory must identify these third-party personal data categories explicitly).

- [x] **GDPR Art. 14 — transparency to data subjects not directly collected from**: Where personal data is collected from public sources (Wikidata, Crunchbase, SERP API results, Reddit) rather than directly from the data subject, GDPR Art. 14 imposes a duty to inform those data subjects. The "publicly available" source exemption (Art. 14(5)(b)) likely applies where the information was already public — but this exemption does not permit retention or further processing beyond the original public purpose. At Gate 3→4 (DPIA), assess whether storing competitor personal data for competitive-intelligence purposes exceeds the scope of the Art. 14(5)(b) exemption.

- [x] **EU AI Act — elevated risk classification flag**: The prior classification (limited-risk Art. 50, content generation) may be insufficient for the GEO platform. The platform uses AI to systematically influence which brands appear in AI-generated answers — a form of AI output manipulation. Whether this constitutes a use case that falls within a higher-risk category requires fresh assessment by `ai-ethics-reviewer` at Gate 2→3. The August 2026 full-applicability deadline for the EU AI Act's GPAI provisions is a live compliance deadline for a product launching in this period. Note: this document flags the re-classification requirement; ai-ethics-reviewer owns the formal determination.

- [x] **GDPR Art. 28 — DPA chain extended to four LLM providers**: The GEO Audit Engine queries OpenAI (ChatGPT / GPT-4o), Anthropic (Claude), Perplexity, and Google (Gemini) as sub-processors. Each provider must have a GDPR Art. 28-compliant DPA in place before any EU user's brand-probe query data flows through them. The probe queries themselves — containing client brand names and competitor brand names — may include names of natural persons (founders, executives) and constitute personal data. Each provider's data retention policy (OpenAI: up to 30 days default; Perplexity: commercial API — retention terms require verification; Google Gemini API: verify; Anthropic: ZDR available) must be reviewed and documented at Gate 2→3.

- [x] **GDPR Art. 35 — new DPIA trigger**: The pivot introduces processing that was not present in the prior DPIA: (1) multi-LLM querying about third parties; (2) SERP data storage including competitor citations and named-author snippets; (3) Reddit content aggregation (attributed posts); (4) entity/knowledge-graph enrichment from Wikidata and Crunchbase. The prior DPIA (Gate 3→4, 2026-05-02) is fully superseded for the GEO platform. A fresh DPIA is mandatory at Gate 3→4 of the re-run pipeline, covering all new processing operations. High-risk triggers confirmed: systematic evaluation of publicly available personal data at scale (EDPB Guidelines 4/2019 trigger 3); use of innovative technology (LLM querying as audit mechanism); cross-border transfers to multiple LLM API providers.

### New US federal regulations triggered or elevated

- [x] **FTC Act §5 — AI disclosure and deceptive endorsement (16 CFR Part 255 / FTC Endorsement Guides, revised 2023)**: The Reddit module drafts answers for client accounts to post in subreddits. Even with strict human-in-the-loop / draft-and-confirm architecture, posting AI-drafted content in Reddit communities creates a deceptive-endorsement risk under the FTC Endorsement Guides if: (a) the post does not disclose that it was drafted with AI assistance when AI played a material role; (b) the post creates a false impression of organic community participation. The FTC's Consumer Review Fairness Act (15 U.S.C. § 45b) further prohibits any mechanism that creates a false impression of authentic consumer activity. The penalty for a deceptive practice violation is $53,088 per violation (adjusted annually). The PRD must specify disclosure requirements for AI-drafted Reddit posts. External counsel review is recommended before the Reddit module feature specification is locked.

- [x] **FTC Act §5 — astroturfing prohibition**: Using the platform to systematically place AI-drafted content in subreddits without disclosure, even if human-approved, could be characterised as astroturfing — creating a false impression of organic grassroots activity. The FTC has prosecuted astroturfing cases under §5 unfair/deceptive practices authority. This risk persists even with draft-and-confirm if the post does not carry a disclosure. The PRD must address this explicitly. Note: Reddit's own Community Guidelines separately prohibit undisclosed commercial posting (see below), which creates a dual-compliance obligation.

- [x] **CAN-SPAM Act** — unchanged from prior assessment. Applies to transactional and marketing email. No new exposure from the pivot.

### New US state law considerations

- [x] **CA — CPRA data broker registration (Cal. Civ. Code § 1798.99.80)**: If the platform sells or licenses access to competitor citation data or brand-mention aggregations to third parties, data broker registration in California is required. Current product design does not contemplate selling aggregated data to third parties — clients access their own and competitor data within the platform. Confirm this scope boundary in the PRD and Terms of Service. If the scope remains client-only, no data broker registration is required.

- [x] **TX — TDPSA and competitor personal data**: Texas TDPSA applies from launch (no revenue threshold). Where competitor data stored by the platform includes personal data of Texas residents (e.g., a competitor's Texas-resident founder appearing in a citation), the TDPSA's controller obligations apply to that processing. Lawful basis under TDPSA is legitimate interest (competitive intelligence), but opt-out rights attach if the data is used for profiling. Scope to be confirmed at Gate 2→3.

- [x] **Colorado AI Act (SB 24-205)**: The prior determination (social post generation is not a consequential decision) was made for the social-scheduling product. The GEO platform's AI use cases must be re-assessed by `ai-ethics-reviewer` at Gate 2→3. In particular: the Strategy Generator produces a prioritised action plan for the client — this is an AI-assisted decision about commercial strategy, not a consequential decision about a natural person. The determination that SB 24-205 does not apply remains likely correct, but re-confirmation is required given the expanded AI role.

### Reddit ToS and content-licensing — distinct risk assessment

Reddit's Terms of Service and Data API terms create a discrete set of obligations separate from privacy law:

1. **Commercial data license requirement**: Reddit's Data API Terms of Service (revised post-IPO 2024) require a separate commercial data contract for any product that (a) monetises Reddit data, (b) aggregates Reddit data at scale, or (c) uses Reddit data to train AI models. The GEO platform's Citation Monitor feature reads Reddit posts to identify brand mentions and citation patterns. This likely falls within Reddit's commercial use definition. A commercial data agreement (estimated ~$0.24 per 1,000 API calls at commercial tier) must be executed before the Citation Monitor ingests Reddit data at scale. **This is a Gate 2→3 blocker for the Reddit monitoring feature.** External counsel review of the specific use case against Reddit's commercial API terms is recommended.

2. **Automated posting prohibition**: Reddit's ToS and the Reddit Responsible Builder Policy explicitly prohibit automated posting, cross-subreddit spam, and use of bots to post without human oversight. The product's draft-and-confirm / human-in-the-loop architecture is ToS-safe for the posting behaviour itself (human approves, human posts from own account). However, the PRD must specify: (a) one-account-per-client restriction (no posting to subreddits from platform-controlled accounts); (b) rate-limit compliance with Reddit API limits; (c) account-age requirements before a client's Reddit account is connected to the platform for posting assistance.

3. **Astroturfing and community disclosure**: Reddit community guidelines require disclosure of commercial or promotional intent in many subreddits. The platform's content-generation-for-Reddit feature must include a user-facing workflow that prompts clients to add disclosure language if required by the target subreddit's rules. Failure to do so creates reputational risk (Reddit bans), potential FTC liability (deceptive endorsement), and ToS liability. The PRD must address this.

4. **External counsel required**: The combination of Reddit ToS commercial data licensing, FTC astroturfing rules, and the EU AI Act transparency obligation for AI-drafted public content creates a novel multi-jurisdictional compliance question. This assessment does not constitute legal advice. External counsel specialising in platform content licensing and FTC endorsement law is recommended before the Reddit module is specification-locked at Gate 2→3.

### Free GEO Audit Engine — third-party data assessment

The free Audit Engine allows any user to query the four LLM APIs about any company — including companies that did not consent to being profiled. This creates several risks:

1. **GDPR Art. 14 — natural persons in audit results**: If the LLM returns information about named individuals at the audited company (founders, executives) as part of the citation analysis, that data is personal data under GDPR Art. 4(1). Storing those results constitutes processing of third-party personal data without collection directly from the data subject. The Art. 14(5)(b) exemption (publicly available data) likely covers individual audit queries. However, systematic storage and aggregation of competitor personal data at scale may exceed the exemption's scope. The audit engine must minimise retention of personal data in results — store aggregate metrics (citation rate, mention count) rather than named-individual snippets wherever possible.

2. **Lawful basis for auditing arbitrary companies**: Querying LLMs about a company the user does not own or represent is analogous to a competitive-intelligence search — generally lawful. The query itself does not process the target company's data; it queries the LLM's training data and output. However, storing the results (including personal data about named individuals at that company) triggers GDPR Art. 6 and Art. 14. The PRD must define: (a) retention period for free-tier audit results; (b) what personal data categories are stored vs. discarded after aggregation; (c) whether audit results about named individuals are exported to the client or retained only in anonymised aggregate form.

3. **Competitor-probing at scale**: If the platform allows clients to systematically probe competitors' AI visibility at high frequency, this could be characterised as a data-harvesting service about competitors. This does not trigger specific regulatory obligations at this stage (competitive intelligence is generally lawful), but it creates reputational and contractual risk if the LLM providers' ToS prohibit systematic competitive benchmarking. OpenAI, Anthropic, Perplexity, and Google Gemini APIs must each be reviewed for ToS clauses restricting benchmarking or competitive-intelligence use cases. This is a Gate 2→3 condition.

### Updated cross-border transfer mechanism

The pivot adds four new LLM API providers to the transfer chain, each requiring individual assessment:

| Provider | EU data residency option | DPF certified | SCCs available | Retention (default) | Gate condition |
|---|---|---|---|---|---|
| OpenAI (GPT-4o) | Azure EU regions (enterprise) — standard API is US-hosted | Yes (OpenAI Inc.) | Yes (Module 2) | 30 days (default); 0 days (Zero Data Retention via enterprise agreement) | Gate 2→3: confirm ZDR or SCCs before EU user data flows to standard OpenAI API |
| Anthropic (Claude) | Bedrock eu-central-1 (carry-over, confirmed) | Yes | Yes (Module 2) | ZDR by default on Bedrock | CONFIRMED — no new condition |
| Perplexity | US-hosted only (no EU region as of 2026-05) | Verify at Gate 2→3 | Verify at Gate 2→3 | Commercial API: verify | Gate 2→3: DPA and SCC status must be confirmed before EU user data flows to Perplexity API |
| Google Gemini | EU regions available via Vertex AI | Yes (Google LLC) | Yes (Module 2) | Default: 60 days standard; configurable via Google Cloud DPA | Gate 2→3: confirm EU region routing and DPA for Vertex AI path |
| DataForSEO / SerpAPI | DataForSEO: EU-hosted option available; SerpAPI: US-hosted | Verify | Verify | SERP query results: verify | Gate 2→3: confirm SERP API provider DPA and retention for EU user queries |

**Transfer Impact Assessment (TIA)**: A TIA is recommended for any provider without EU data residency (specifically: standard OpenAI API, Perplexity API) before EU user data is routed to those endpoints. The TIA should address the legal environment in the US (CLOUD Act, FISA 702) and the adequacy of DPF + SCCs as combined safeguards.

### New top 5 regulatory risks (GEO platform — supersedes prior risks for new product scope)

1. **Multi-LLM DPA chain gap — EU user data flowing to uncovered endpoints (GDPR Art. 44–46; Art. 28)**: The GEO Audit Engine routes EU user queries to up to four LLM APIs. Of these, Perplexity has no confirmed EU data residency, DPF certification status is unverified, and SCC availability is unconfirmed. Until GDPR Art. 46 transfer mechanisms are confirmed for every provider in the chain, no EU user brand-probe query data may be routed to those endpoints. Risk is HIGH; fine exposure up to €20M / 4% turnover per Art. 83(4). Must be resolved as a Gate 2→3 condition.

2. **Reddit ToS commercial data license — unlicensed commercial aggregation (contract / platform risk)**: The Citation Monitor's Reddit data ingestion at scale requires a Reddit commercial data license. Operating without it exposes the product to Reddit API access revocation (existential for the Reddit monitoring feature), potential breach-of-contract liability under Reddit's ToS, and reputational damage. Risk is HIGH. Must be resolved before the Reddit monitoring feature is specification-locked at Gate 2→3. External counsel required.

3. **FTC §5 deceptive endorsement / astroturfing — Reddit and LinkedIn content (16 CFR Part 255; FTC Consumer Review Fairness Act 15 U.S.C. § 45b)**: AI-drafted Reddit and LinkedIn content posted by clients without adequate disclosure of AI involvement or commercial purpose creates FTC enforcement exposure. Per-violation penalty: $53,088. A systematic, multi-client platform amplifies this risk. The PRD must specify disclosure requirements for AI-drafted community content. Risk is HIGH for the Reddit module specifically; MEDIUM for LinkedIn (where commercial posting is more expected and less deceptive in context). External counsel required before PRD is locked.

4. **Third-party / competitor personal data — GDPR Art. 14 compliance gap (GDPR Arts. 6, 14, 17)**: The Citation Monitor and competitive-benchmarking features store personal data about individuals at competitor brands (named executives, authors, spokespeople appearing in AI citations and SERP results) without having collected that data from the data subjects directly. Art. 14 requires transparency to those data subjects unless an exemption applies. At scale (hundreds of clients, each monitoring dozens of competitors), the volume of third-party personal data stored may exceed what the Art. 14(5)(b) "public source" exemption covers. Risk is MEDIUM-HIGH; must be assessed in the fresh DPIA at Gate 3→4.

5. **EU AI Act re-classification — citation-influence AI (EU AI Act Regulation 2024/1689, Arts. 50, 52, Title VIII)**: The GEO platform's core function is to systematically influence which brands appear in AI-generated answers — a form of AI output manipulation. If the ai-ethics-reviewer determines this triggers a higher risk classification than limited-risk Art. 50 at Gate 2→3, additional conformity obligations attach before any EU user can use the audit or optimisation features. The August 2026 EU AI Act full-applicability deadline makes this a live compliance deadline. Risk is MEDIUM; escalation to HIGH if re-classified above limited-risk.

### Updated external counsel review needed

- [x] **Reddit commercial data API licensing**: Reddit's commercial data contract terms and the applicability to the Citation Monitor use case must be reviewed by external counsel before the Reddit monitoring feature is specification-locked at Gate 2→3.
- [x] **FTC endorsement / astroturfing — AI-drafted community content**: The PRD's Reddit and LinkedIn content-generation features require external counsel review of FTC Endorsement Guides and the Consumer Review Fairness Act before Gate 2→3. This is a novel question (AI-assisted human-approved commercial community posting) without settled FTC guidance.
- [x] **Multi-LLM provider DPA / SCC chain**: Perplexity API DPA and SCC availability must be verified, ideally with counsel familiar with the provider's commercial terms. Perplexity is a newer provider with less standardised enterprise contracting than OpenAI, Google, or Anthropic.
- [x] **EU AI Act re-classification for citation-influence AI**: If the ai-ethics-reviewer flags this for higher-risk classification, external counsel with EU AI Act expertise should review the formal determination before Gate 3→4.
- [x] **Wikidata automated writes**: Automated or bulk writes to Wikidata to update entity records as part of the Entity/Knowledge-Graph Manager feature may violate Wikimedia's terms and community norms. The feature must be scoped as "detect + draft human-reviewed edits only." External counsel review is not required for this point but the constraint must be a non-negotiable PRD specification.

---

## 2026-05-30 — Rebrand + home-jurisdiction change (TrustIndex AI; Brazil entity / LGPD)

**Two material changes**: (1) product rebranded to **TrustIndex AI** (platform) with **OrganicPosts by TrustIndex AI** as a consultancy sub-brand; (2) the operating **entity will be registered in Brazil**, not Portugal. This supersedes the 2026-05-11 "Portugal Lda" entry for entity/home-jurisdiction purposes. All prior GDPR/CCPA/EU-AI-Act/FTC scope **remains in force** because it follows the *customers* (EU + US), not the company's HQ. **LGPD is added** as the home-jurisdiction regime. The rebrand does not change any data flow, so all data-processing analysis above remains accurate; only entity identity, governing law, and the LGPD layer change.

### Home jurisdiction — Brazil

- **Entity**: Brazilian **Sociedade Limitada (Ltda)** (or EI/MEI as an interim form), identified by **CNPJ**. Replaces the planned Portugal Lda. Registered office + CNPJ to be added to ToS, Privacy Policy, DPA, and ROPA at incorporation.
- **Governing law (ToS/Privacy/DPA)**: Brazilian law (Código Civil; Marco Civil da Internet, Lei 12.965/2014; LGPD). Competent forum to be set in ToS (typically the comarca of the company's seat) with consumer-law carve-outs (CDC) for BR consumers.
- **GDPR Art. 27 (EU representative)**: **RE-INSTATED and REQUIRED.** The controller is now established **outside** the EU. Because TrustIndex AI offers services to EU data subjects (GDPR Art. 3(2) extraterritorial scope), an **EU Article 27 representative must be appointed** before onboarding EU users. (This reverses the 2026-05-11 removal, which assumed an EU-established entity.)
- **CCPA/CPRA**: Unchanged — applies based on California consumers + thresholds, regardless of HQ. A US service-of-process / agent posture should be reviewed if US enterprise customers require it.

### LGPD (Lei Geral de Proteção de Dados — Lei 13.709/2018) — now applicable

- [x] **LGPD applies in full.** The controller is Brazil-established and will process personal data of Brazilian data subjects (BR SMB customers, BR users) and, under LGPD Art. 3, also where processing aims to offer services to individuals in Brazil. Regulator: **ANPD** (Autoridade Nacional de Proteção de Dados).
- **Controller/operator roles** (LGPD Arts. 5(VI)–(VII), 39): mirror GDPR controller/processor. TrustIndex AI is **controlador** for its own account/billing/usage data and **operador** for customer-directed processing — same split already documented for GDPR; DPAs must reference **both** LGPD Art. 39 and GDPR Art. 28.
- **Legal bases** (LGPD Art. 7): consent, legitimate interest (legítimo interesse), and contract execution map closely to GDPR Art. 6 bases already in the design. No new consent UX is required beyond what GDPR already mandates; the existing unchecked-opt-in waitlist consent satisfies LGPD too.
- **Data subject rights** (LGPD Art. 18): access, correction, anonymization, portability, deletion, information on sharing — already covered by the GDPR DSR workflow; extend DSR intake copy to name LGPD rights and the ANPD as supervisory authority.
- **DPO / Encarregado** (LGPD Art. 41): appointment of an **Encarregado de Dados** is required; the contact must be published in the Privacy Policy. Can be the same person/role as the GDPR/privacy contact.
- **International transfer** (LGPD Arts. 33–36): sending BR personal data abroad (e.g., to US-hosted LLM APIs or EU infra) requires an LGPD transfer basis — adequacy, standard contractual clauses (ANPD-approved model), or specific consent. The provider-DPA chain work already queued for GDPR (Perplexity/OpenAI/Gemini/DataForSEO/Anthropic) must be extended to cover the LGPD transfer basis as well.
- **Data residency note**: LGPD does **not** mandate in-country storage. EU users still require **eu-central-1** residency under GDPR; that architecture is unaffected. A BR/US region can be added as the customer base grows.

### Billing / tax (Brazil)

- BR-domestic billing: **Stripe Brazil** (BRL, **Pix**, boleto) or a Brazilian PSP; issuance of **nota fiscal de serviço (NFS-e)** and Brazilian service taxes (**ISS**, plus PIS/COFINS depending on tax regime — Simples Nacional vs Lucro Presumido). Founder + Brazilian contador action.
- Foreign customers (EU/US): multi-currency (EUR/USD) via Stripe; export-of-services treatment for Brazilian tax to be confirmed with the contador.
- This is a finance/tax workstream (VP Finance), flagged here only for completeness; not a privacy-gate blocker.

### Compliance-artifact propagation (to do — incremental updates)

- [x] `dpia.md` (Gate 3→4): the fresh DPIA now includes an **LGPD Art. 38 / RIPD (Relatório de Impacto à Proteção de Dados)** lens alongside the GDPR DPIA — both in Section B of dpia.md. **COMPLETED 2026-06-09.**
- [x] `ropa.md`: LGPD Art. 37 record-keeping framing added; entity identity changed to Brazil Ltda; Encarregado contact noted as Gate 7 hard stop. **COMPLETED 2026-06-09.**
- [ ] `ai-risk-assessment.md`: note that **Brazil has no AI-specific statute in force yet** (PL 2338/2023 pending). EU AI Act + NIST AI RMF remain the governing AI frameworks; LGPD Art. 20 (automated-decision review rights) should be checked against the GEO scoring/strategy features — likely not "decisions affecting a natural person" (commercial brand scoring), consistent with the EU AI Act limited-risk + Colorado SB 24-205 N/A determinations already logged.
- [ ] ToS / Privacy Policy / DPA: change entity to Brazil Ltda + CNPJ; add LGPD section, Encarregado contact, ANPD as authority; appoint + name the GDPR Art. 27 EU representative; retain CCPA/CPRA sections.

### Risk delta from the jurisdiction change

- **NEW (MEDIUM)**: Operating without a GDPR Art. 27 EU representative once EU users onboard is a standalone GDPR infringement (Art. 83(4), up to €10M / 2%). Must be appointed before EU launch.
- **NEW (MEDIUM)**: LGPD international-transfer basis must be in place before BR personal data flows to foreign LLM/infra endpoints — folds into the existing multi-provider DPA chain condition.
- **NEW (LOW-MEDIUM)**: Encarregado appointment + ANPD-facing Privacy Policy disclosures required before BR launch.
- **UNCHANGED**: every GDPR/CCPA/EU-AI-Act/FTC risk previously logged — those follow the customers and are not reduced by the Brazil HQ.

### Verdict on the change

Not a re-architecture. The Brazil/LGPD change is **additive and propagational**: LGPD overlaps GDPR by ~80%, so the GDPR-first design already substantially satisfies it. The only genuinely *new* obligations are (a) appoint an **EU Art. 27 representative**, (b) appoint an **Encarregado** + ANPD disclosures, (c) extend transfer bases to LGPD, and (d) Brazilian billing/tax. These are documentation + appointment tasks, gated before EU/BR launch — not blockers to continued build. The fresh DPIA at Gate 3→4 will formally absorb the LGPD lens. **This entry must be ratified by `legal-privacy-officer` at the next gate** (it is drafted by the orchestrator for continuity; a council sign-off is still required per the workers-cannot-self-approve rule).

---

## 2026-06-09 — LGPD Entry Ratification by legal-privacy-officer

**Ratification of the 2026-05-30 Brazil/LGPD entry.**

The 2026-05-30 entry was drafted by the orchestrator pending council sign-off. This entry constitutes the formal legal-privacy-officer ratification pursuant to the workers-cannot-self-approve rule.

### Correctness assessment

**Overall verdict: SUBSTANTIALLY CORRECT with three clarifications and one addition.**

| Item | Assessment | Clarification / Addition |
|---|---|---|
| LGPD applicability in full (Art. 3) | CORRECT | LGPD Art. 3(I) applies because the controller is Brazil-established. Art. 3(II) also applies because processing aims to offer services to individuals in Brazil regardless of establishment. Both limbs confirmed. |
| Controlador / operador split (Arts. 5(VI)–(VII), 39) | CORRECT | The split mirrors GDPR controller/processor. DPAs must reference LGPD Art. 39 (operador obligations) in addition to GDPR Art. 28. The draft entry correctly identifies this. |
| LGPD Art. 7 legal bases | CORRECT but incomplete | The entry lists consent (Art. 7(I)), legitimate interest (Art. 7(IX)), and contract execution (Art. 7(V)). It should also note: Art. 7(II) — compliance with legal or regulatory obligation — which governs the audit log, DSR handling, and breach notification processing. Added to dpia.md Section 2-GEO LGPD bases table. |
| LGPD Art. 18 data subject rights | CORRECT | All nine Art. 18 rights are covered by the existing GDPR DSR workflow. The entry correctly states that only copy extensions are required (naming LGPD rights and ANPD as authority). The ROPA update (ropa.md Activity G13) now maps all nine rights explicitly. |
| Encarregado de Dados (Art. 41) | CORRECT | Appointment required before BR launch. Contact must be published. This is a Gate 7 hard stop. Confirmed in dpia.md Section 9-GEO and ropa.md Controller/Processor Info. |
| International transfer (Arts. 33–36) | CORRECT but requires amplification | The entry correctly identifies that LGPD transfer bases are needed for BR→US flows and that ANPD-approved standard clauses are not yet published. **Addition**: As of 2026-06, ANPD has not finalised a comprehensive adequacy list or published standardised SCCs. The most practical interim transfer basis for BR-to-US sub-processor flows is LGPD Art. 33(IX) — specific consent — disclosed in the Privacy Policy per processing activity. An alternative is Art. 33(II) — international instrument — where applicable. Until ANPD publishes standard clauses, external counsel review of the specific BR→US transfer configuration is required. This amplification is captured as condition GEO-D3 in dpia.md Section 9-GEO. |
| GDPR Art. 27 EU representative re-instated | CORRECT — CRITICAL | Reversing the 2026-05-11 removal was necessary and correct. TrustIndex AI Ltda is not EU-established. GDPR Art. 3(2) extraterritorial scope applies. Art. 27 representative must be appointed before any EU user onboards. Fine exposure for operating without a representative: Art. 83(4), up to €10M or 2% global turnover. This remains the single highest-urgency appointment required before EU launch. |
| LGPD data residency note (no in-country mandate) | CORRECT | LGPD does not mandate storage in Brazil. The EU-central-1 Supabase architecture for EU users is unaffected. |
| Encarregado = GDPR privacy contact (same person) | CORRECT | Permissible and recommended for efficiency. The Encarregado must be a natural person (LGPD Art. 41 does not permit a legal entity in Brazil, unlike GDPR where a legal entity may serve). This nuance is flagged: ensure the appointee is an individual, not the company itself. |

### One substantive addition not in the 2026-05-30 entry

**ANPD Resolution CD/ANPD 02/2022 — breach notification timeline**: The 2026-05-30 entry does not specify the LGPD breach notification timeline. ANPD Resolution CD/ANPD 02/2022 specifies that significant incidents (those that may cause relevant harm) must be reported to ANPD within **2 business days** of the controller becoming aware (for the initial expedited notice; supplementary report within 30 days). This is shorter than the GDPR 72-hour window in business-days terms and must be reflected in the breach notification procedure at Gate 7. Added to dpia.md Section 5-GEO (organizational measures) and ropa.md breach notification register.

### Ratification verdict

The 2026-05-30 entry is **RATIFIED** as substantially correct. Clarifications and the ANPD breach notification timeline addition have been incorporated into dpia.md (Section B) and ropa.md as incremental updates. The three new conditions from the DPIA (GEO-D1, GEO-D2, GEO-D3) address the remaining open items. No re-architecture is required. The Brazil/LGPD entry is formally signed off by legal-privacy-officer as of 2026-06-09.

**Signed**: legal-privacy-officer — 2026-06-09
