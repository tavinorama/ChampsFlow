# Record of Processing Activities (ROPA)

> Owner: `legal-privacy-officer` · GDPR Art. 30 · LGPD Art. 37 · Living document
> Originally populated at Gate 3→4 (2026-05-02) from architecture §4 + §11 + PRD §7.
> Updated 2026-06-09: entity changed to TrustIndex AI Ltda (Brazil); LGPD Art. 37 framing added; GEO platform processing activities added; prior social-scheduling activities archived.
> Updated 2026-07-08: entity identity CORRECTED — controller trades as Ozvor, a Brazilian MEI (Microempreendedor Individual), CNPJ 67.609.444/0001-08 (the holder's civil name is not reproduced here at the controller's instruction; the CNPJ is the unique public identifier); registered office Rua José Borges Abrantes, nº 1, Centro, Muriaé — MG, CEP 36.880-063, Brasil; regulator ANPD. This corrects the 2026-06-09 entry, which incorrectly stated the entity type as Sociedade Limitada (Ltda) and left CNPJ/address as pending/TBC. See `docs/compliance/regulatory-map.md` (2026-05-30 Brazil home-jurisdiction section) for the jurisdiction/entity-change record; the P5 legal-gate verdict for this identity correction is pending and will be logged in `docs/compliance/gate-log.md`.
> Update on every material change in processing, sub-processor list, or retention policy.

---

## Controller / Processor Info

- **Legal entity name (Razão Social)**: on file with the Receita Federal under CNPJ **67.609.444/0001-08** — the holder's civil name is not reproduced in this document at the controller's instruction; the CNPJ is the unique public identifier of record. Operating as a Brazilian **MEI (Microempreendedor Individual)**. Trade name (nome fantasia): **Ozvor**. This corrects and supersedes the prior "TrustIndex AI Ltda (Sociedade Limitada; CNPJ pending incorporation)" entry (2026-06-09) — the confirmed registration is an MEI, not a Ltda. That entry was itself a correction of the still-earlier "Organic Posts, Lda (Portugal)" entry (superseded 2026-05-30 per regulatory-map.md rebrand/jurisdiction change entry, preserved there as history).
- **Registered office (sede)**: Rua José Borges Abrantes, nº 1, Centro, Muriaé — MG, CEP 36.880-063, Brasil. Replaces the prior "TBC" placeholder.
- **Entity-type note (MEI)**: As a Microempreendedor Individual, the controller is a natural person operating as an individual entrepreneur under CNPJ 67.609.444/0001-08, without a separate legal personality distinct from the founder (unlike a Ltda). This does not change any GDPR/LGPD/CCPA obligation already documented in this ROPA — a natural-person-operated business is still a "controller" / "controlador" / "business" under GDPR Art. 4(7), LGPD Art. 5(VI), and CCPA § 1798.140(d) respectively. Corporate-structure and liability implications of the MEI form are a tax/corporate matter for the founder and external (Brazilian) counsel, not a data-protection classification change.
- **LGPD establishment**: Ozvor (the MEI, CNPJ 67.609.444/0001-08) is established in Brazil. LGPD applies in full as the controller (controlador) is Brazil-domiciled. Regulator: **ANPD (Autoridade Nacional de Proteção de Dados)**.
- **EU extraterritorial scope (GDPR Art. 3(2))**: Ozvor offers services to EU data subjects. As a non-EU-established controller, **GDPR Art. 27 EU representative must be appointed** before EU users are onboarded. This appointment is a Gate 7 hard stop, unchanged by the entity-type correction. The appointed representative's name and contact details must be added to this ROPA and the Privacy Policy at appointment.
- **US scope**: CCPA/CPRA (CA), TDPSA (TX), VCDPA (VA), and other applicable state laws based on consumer residency and thresholds.
- **DPO contact**: Not mandatory at this scale under GDPR (no large-scale systematic monitoring, no Art. 9 processing; non-EU controller, so DPO is not mandated under Art. 37 at current scale). Reassess at Series A or if >250 employees.
- **Encarregado de Dados (LGPD Art. 41)**: Required before BR launch. Appointment pending. Contact to be published in Privacy Policy. Can be the same natural person as the GDPR/privacy contact — note LGPD Art. 41 requires the Encarregado to be a natural person in any case, which aligns naturally with the MEI structure. **This is a Gate 7 hard stop.**
- **EU representative (GDPR Art. 27)**: Required before EU launch. **Not yet appointed.** To be named here when appointed. **This is a Gate 7 hard stop.**
- **Joint controllers**: Not applicable in v1. Ozvor (the MEI) is sole controller for its own account/operations data. It acts as operador/processor for SMB customer-directed processing.

---

## Processing Activities — GEO Platform (Live, 2026-06-09)

> The table below reflects Ozvor's GEO platform processing activities. Prior social-scheduling product (Organic Posts v1) activities are archived in the section below.

| # | Activity | Purpose | Lawful basis GDPR (Art. 6) | Lawful basis LGPD (Art. 7) | Data subjects | Personal data | Sub-processors | Third-country transfer | Mechanism | Retention |
|---|---|---|---|---|---|---|---|---|---|---|
| G1 | Account registration and authentication | Contract performance — platform access via magic-link email | Art. 6(1)(b) — contract | Art. 7(V) — contract | B2B customers, their staff | Email address, Supabase Auth UID, account role, created_at | Supabase (Auth + DB, eu-central-1 for EU; us-east-1 for US/BR) | EU: none (EU project). US/BR: US infra, no mechanism required for US. BR→US: LGPD Art. 33 basis pending (GEO-D3). | DPA required before EU launch. | Account life + 30-day grace |
| G2 | Brand profile management | Contract performance — store brand identity, domain, monitoring config | Art. 6(1)(b) — contract | Art. 7(V) — contract | B2B customers | Brand name, domain, monitoring_enabled flag | Supabase (DB) | Same as G1 | Same as G1 | Account life + 30-day grace |
| G3 | GEO Audit Engine — LLM probe query execution | Contract performance — send synthetic category probe prompts to LLM providers; measure brand citation rate | Art. 6(1)(b) — contract | Art. 7(V) — contract | B2B customers (account level); no natural-person data in probe prompts by design (GEO-A2) | Synthetic probe texts (category queries + client brand name; no personal data); probe results (cited yes/no, position, source URLs); ai_generation_log (hashes only) | Anthropic (Bedrock eu-central-1 for EU; direct API for US/BR); OpenAI (Azure EU for EU; standard API for US/BR — pending confirmation GEO-D1); Google Gemini (Vertex AI EU for EU — pending confirmation GEO-D1); Perplexity (EU users EXCLUDED per GEO-A3 routing gate) | EU: no transfer (EU inference paths). US/BR: sub-processor DPAs + ZDR. LGPD: GEO-D3 open. | DPA + ZDR per provider; DPF certification verified (Anthropic, OpenAI, Google). | Citation evidence: 90 days then purge. ai_generation_log (hashes): 3 years. |
| G4 | Site crawl — customer's own public website | Contract performance — measure on-site GEO signals (schema.org, llms.txt, robots.txt, content citation-worthiness) | Art. 6(1)(b) — contract | Art. 7(V) — contract | B2B customers | Brand domain (customer-supplied); crawled content is public HTML/text (no personal data collected by design) | No sub-processor — native fetch from application server | None | N/A | Crawl results stored in geo_score.provider_breakdown for audit lifetime; raw HTML not stored |
| G5 | Off-site signal measurement | Contract performance / legitimate interests — measure brand presence on public sources (Reddit, Wikipedia, LinkedIn, G2, Trustpilot, Crunchbase, YouTube) | Art. 6(1)(f) — legitimate interests (client's commercial interest in brand visibility measurement) | Art. 7(IX) — legitimate interests | B2B customers; incidentally, named individuals appearing in public source profiles (minimised to aggregate score — no individual profiles stored) | Brand name and domain (query parameters); per-source presence/absence flag; weighted offsiteScore | DataForSEO (EU-hosted option) or SerpAPI (US-hosted); DPA required | EU: DataForSEO EU path — no Art. 44 transfer. SerpAPI: US-hosted, SCCs/DPF to confirm. | DPA required for both providers. | Per-source signal stored in geo_score.provider_breakdown for audit lifetime; no individual profile data retained |
| G6 | Competitor benchmark | Contract performance / legitimate interests — identify competitor brand mention frequency in LLM probe responses | Art. 6(1)(f) — legitimate interests | Art. 7(IX) — legitimate interests | B2B customers; competitor brand entities (not natural persons; competitor names never sent to LLM providers per GEO-A2) | Competitor brand names (configured by customer); mention_count, displacement_count per competitor in probe responses | Supabase (DB) | Same as G1 | Same as G1 | Competitor citation data: account life + 30-day grace |
| G7 | GEO Score computation | Contract performance — compute 3-vector Ozvor AI Visibility Score (BRAND, PERFORMANCE, AI) | Art. 6(1)(b) — contract | Art. 7(V) — contract | B2B customers | Computed scores (numerical); provider_breakdown JSON (measured/baseline labels) | Supabase (DB) | Same as G1 | Same as G1 | Score records: 12 months rolling |
| G8 | Content draft generation | Contract performance — generate content drafts via LLM from strategy plan topics; human-approved before any use | Art. 6(1)(b) — contract | Art. 7(V) — contract | B2B customers | Draft text (AI-generated); ai_generated flag; approved_at, approved_by (staff member email); EU AI Act Art. 50 label | Anthropic (same routing as G3) | Same as G3 | Same as G3 | Draft content: account life + 30-day grace |
| G9 | Strategy plan generation | Contract performance — AI-assisted prioritised GEO action plan | Art. 6(1)(b) — contract | Art. 7(V) — contract | B2B customers | Plan tasks (text recommendations; no personal data); customer accept/reject per task | Supabase (DB); Anthropic (rule engine + LLM assist) | Same as G1 + G3 | Same as G1 + G3 | Plan and tasks: account life + 30-day grace |
| G10 | BYOK provider key storage | Contract performance — store customer-supplied LLM API keys encrypted | Art. 6(1)(b) — contract | Art. 7(V) — contract | B2B customers (key owners) | Encrypted key blob (AES-256-GCM); provider name; presence-only API | Supabase (DB) | Same as G1 | Same as G1 | Until key rotation or account deletion |
| G11 | Billing and subscription management | Contract performance | Art. 6(1)(b) — contract | Art. 7(V) — contract | B2B customers | Name, email, Stripe customer ID, subscription tier, billing region (EU/US/BR); no raw card data in app DB | Stripe (US-hosted) | Yes — Stripe US | SCCs + Stripe DPF certified; LGPD: GEO-D3 (specific consent pending) | Account life; Stripe governs card data |
| G12 | Transactional email delivery | Contract performance + legal obligation | Art. 6(1)(b) + (c) | Art. 7(V) + (II) | All users | Email address, notification content | Resend (EU infrastructure) | EU: none (EU infra). US/BR: verify Resend infra at Gate 7. | DPA available | Per Resend retention policy; Ozvor does not store email content beyond trigger |
| G13 | Data subject rights (DSR) handling | Legal obligation — GDPR Art. 15–22; LGPD Art. 18; CCPA § 1798.100 et seq.; US state laws | Art. 6(1)(c) — legal obligation | Art. 7(II) — legal obligation | All users | DSR request record (email, request type, identity verification status); full personal data scope for access/portability fulfillment | Supabase (DB), Resend (acknowledgment and fulfillment delivery) | Same as G1 | Same as G1 | DSR record: closed_at + 30 days, then deleted. Fulfillment package delivered before deletion. |
| G14 | Security monitoring and audit logging | Legal obligation (GDPR Art. 32; LGPD Art. 46) + legitimate interests | Art. 6(1)(c) + (f) | Art. 7(II) + (IX) | All users | Hashed user/tenant IDs in operational logs; IP address and event type in audit log (account creation, audit run, content approval, DSR events, billing events, admin actions) | Supabase (DB) | Same as G1 | Same as G1 | Audit log: 3 years. Operational logs: 90 days hot, 1 year archive. |
| G15 | Scheduled/weekly audit monitoring | Contract performance — automated weekly GEO re-audit for monitoring-enabled brands | Art. 6(1)(b) — contract | Art. 7(V) — contract | B2B customers | Brand domain; audit results (same as G3/G7); triggered_by = 'cron' flag | Same as G3 + Upstash (Redis, BullMQ scheduled job) | Same as G3 | Same as G3 | Audit records: 12 months rolling; superseded by newer audit |

---

### Activity G3 — GEO Audit Engine: Probe Query Detail

- **Probe prompt construction (GEO-A2 compliance)**: Prompts are synthetic buyer-category questions (e.g., "best CRM for small business in [region]") generated by the probe engine. The client's brand name is appended as the entity to evaluate. Competitor names are NEVER injected into probe prompts sent to LLM providers. Competitor mention detection occurs on the returned LLM response text only, within the application.
- **No personal data in prompts by design**: Verified in packages/llm/src/provider-gateway.ts; probe text contains category query + brand name only. Customer email, staff names, and billing data are not included in any LLM request.
- **Perplexity routing gate (GEO-A3)**: EU users are excluded from the Perplexity provider slot in the LLM gateway. Confirmed in live test (EU brand produced results from Anthropic and OpenAI only). This gate must remain enforced until Perplexity DPA + SCC/DPF mechanism is confirmed (GEO-D1).
- **ZDR status per provider**: Anthropic — ZDR by default (both paths). OpenAI — ZDR available via enterprise/Azure; must confirm for the configured path. Google Gemini — configurable via Vertex AI DPA; confirm at Gate 7. Perplexity — unconfirmed (EU excluded; GEO-D1 open for US/BR).

---

### Activity G13 — Data Subject Rights: LGPD Art. 18 Mapping

| LGPD Art. 18 right | Handling |
|---|---|
| Art. 18(I) — Confirmation of processing | DSR access response confirms which activities process data subject's data |
| Art. 18(II) — Access | JSON export of all personal data per user_id; same package as GDPR Art. 15 response |
| Art. 18(III) — Correction | Account settings for authenticated users; admin API path for unauthenticated DSR |
| Art. 18(IV) — Anonymisation, blocking, deletion | Erasure cascade (same as GDPR Art. 17); ai_generation_log rows not deleted (hashes only; no personal data in log); 90-day citation evidence purge by design |
| Art. 18(V) — Portability | JSON export covering brand records, audit scores, content drafts, strategy plan tasks |
| Art. 18(VI) — Information on entities with which data was shared | Privacy Policy sub-processor list; DSR response includes applicable sub-processors |
| Art. 18(VII) — Information on non-consent or refusal of consent | Processing is not consent-based in the primary processing activities; lawful bases are contract (Art. 7(V)) and legal obligation (Art. 7(II)) |
| Art. 18(VIII) — Revocation of consent | Not applicable as primary basis; if consent is used for any activity (e.g., marketing communications), revocation mechanism required |
| Art. 18(IX) — Review of automated decisions | GEO Score is a brand visibility metric, not a decision about a natural person; automated decision review right not triggered |
| Right to lodge complaint with ANPD | Disclosed in Privacy Policy and DSR intake page |

---

## Data Subject Rights — Operational Handling

- **Intake portal**: `/privacy/dsr` (public, no login required)
- **SLA**: 30 days from receipt (GDPR Art. 12(3)); extendable to 60 days with notice. CCPA: 45 days. LGPD: ANPD has not specified a statutory deadline beyond "without undue delay" — align to GDPR 30-day standard.
- **Identity verification**: Email OTP (10-minute expiry). Proportionate for service type.
- **ANPD complaint right**: Disclosed in Privacy Policy and DSR intake page (Gate 7 action).
- **Workflow**: receive → identity-verify (OTP) → fulfill (cascade query/delete/export) → deliver (Resend email) → log (audit event) → close.
- **LGPD Art. 18 coverage**: All nine rights mapped in Activity G13 table above.

---

## Breach Notification Register

| Date | Description | Categories affected | Subjects affected | Authority notified | Subjects notified | Outcome |
|---|---|---|---|---|---|---|
| — | No incidents recorded | — | — | — | — | — |

**Breach notification procedure**: To be documented and tested at Gate 7.
- **GDPR Art. 33**: Notify lead supervisory authority within 72 hours of becoming aware. Lead DPA determination is pending Art. 27 EU representative appointment — the representative's member state DPA will typically be the point of contact.
- **LGPD Art. 48 / ANPD Resolution CD/ANPD 02/2022**: Notify ANPD within 2 business days of becoming aware for significant incidents (those that may cause relevant harm to data subjects).
- **US state laws**: 30–72 hours for expedited notification; 30–60 days for written consumer notice (varies by state — CCPA/CPRA: 72h for expedited; general: 30 days).
- **Owner**: devops-engineer + legal at Gate 7.

---

## Archived: Processing Activities — Social-Scheduling Product (Organic Posts v1 — superseded 2026-05-30)

> The activities below were documented at Gate 3→4 (2026-05-02) for the archived social-scheduling product under the Organic Posts, Lda (Portugal) entity. They are preserved as a historical record only. All active processing is under the GEO Platform activities (G1–G15) above.

| # | Activity | Purpose | Lawful basis (Art. 6) | Data subjects | Personal data | Sub-processors | Third-country transfer | Mechanism | Retention |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Account registration and authentication | Contract performance — user account setup and platform access | Art. 6(1)(b) | SMB operators, agency managers | Name, email, password hash, Supabase auth UID | Supabase (Auth + DB) | None — EU project eu-central-1 | N/A | Account life + 30-day grace |
| 2 | OAuth social account management | Contract performance — store credentials to publish approved posts on behalf of user | Art. 6(1)(b) | SMB operators | OAuth access/refresh tokens (AES-256-GCM encrypted), token scope, token_expires_at | Supabase (DB) | None — EU project eu-central-1 | N/A | Until revoked or account deletion |
| 3 | AI post draft generation | Contract performance — generate post drafts from user topic input via LLM | Art. 6(1)(b) | SMB operators | Topic/prompt text (user-supplied; no other PII sent to LLM) | Anthropic (via Bedrock eu-central-1 for EU users; direct API for US users) | EU path: none (inference in EU). US path: US-to-US, no mechanism required. | ZDR by default. Anthropic DPF certified. DPA (Module 2 SCCs) available. | Topic text retained in generation_log for account life + 30 days; ZDR = provider retains nothing |
| 4 | Post scheduling and publication | Contract performance — publish approved posts to LinkedIn/Instagram at scheduled time | Art. 6(1)(b) | SMB operators | Post content, OAuth token (transient — decrypted in worker memory, not stored decrypted) | Upstash (job queue), LinkedIn API, Instagram Graph API | US (LinkedIn, Instagram) | User-directed action (performance of contract); user instructs Organic Posts to publish to these platforms | Draft life; publish_jobs record retained for account life |
| 5 | GDPR DPA acknowledgment recording | Legal obligation — Art. 28 compliance evidence; Art. 5(2) accountability | Art. 6(1)(c) | EU-based SMB operators | User ID, timestamp, DPA version, IP address | Supabase (DB), Resend (email delivery of acknowledgment) | None — EU infrastructure | N/A | 3 years minimum |
| 6 | CCPA opt-out recording | Legal obligation — CCPA/CPRA § 1798.105 compliance evidence | Art. 6(1)(c) | US-resident users | User ID, timestamp, IP address, opt-out flag | Supabase (DB) | None — US project us-east-1 | N/A | 3 years minimum |
| 7 | Data subject rights (DSR) handling | Legal obligation — GDPR Art. 15–22; CCPA § 1798.105/110/130; US state privacy laws | Art. 6(1)(c) | All users | DSR request: requester email, request type, identity verification status, fulfillment notes; plus full personal data scope for access/portability fulfillment | Supabase (DB), Resend (email delivery of acknowledgment and fulfillment package) | None — EU/US infra by tenant region | N/A | DSR request record: closed_at + 30 days, then deleted. Fulfillment package delivered before deletion. |
| 8 | Security monitoring and audit logging | Legal obligation (GDPR Art. 32) + legitimate interests (incident investigation, legal defense) | Art. 6(1)(c) + 6(1)(f) | All users | Hashed user/tenant IDs in operational logs; IP address and event type in audit log (DPA ack, CCPA optout, post approval, token revocation, login failed, DSR events) | Supabase (DB), Axiom (log ingestion), Grafana Cloud (metrics/traces) | None — EU endpoints for EU users | N/A | Audit log: 3 years. Operational logs: 90 days hot, 1 year archive. Traces: 30 days. |
| 9 | Billing and subscription management | Contract performance — subscription SaaS billing | Art. 6(1)(b) | SMB operators | Name, email, Stripe customer ID, subscription status (stored in app DB); card data Stripe-hosted | Stripe | Yes — Stripe US-hosted | SCCs + Stripe DPF certified | Stripe IDs in app DB: account life. Card data: Stripe retention policy. |
| 10 | Transactional email delivery | Contract performance + legal obligation — service notifications, DSR acknowledgments, failed-publish alerts | Art. 6(1)(b) + (c) | All users | Email address, notification content | Resend | None — EU infrastructure selected for EU users | N/A | Per Resend retention policy; Organic Posts does not store email content beyond notification trigger |

---

## Approval

- Author: legal-privacy-officer agent
- Gate: 3→4 (original 2026-05-02); updated at Gate 3→4 DPIA + LGPD ratification (2026-06-09); entity-identity correction (2026-07-08)
- Jurisdictions: Brazil (LGPD Art. 37 records), EU (GDPR Art. 30), US (CCPA/CPRA informing data inventory)
- Reviewed by (human): _____ (required before EU/BR launch)
- Update log: 2026-07-10 — brand-name fix in live activity G7 ("TrustIndex Score" → "Ozvor AI Visibility Score"; founder rebrand rule 2026-06-27) as part of the issue #213 stale-docs sweep. No processing-activity change.
- Update log: 2026-07-08 — entity identity corrected (MEI confirmed in place of the prior Ltda reference; CNPJ 67.609.444/0001-08 and registered office populated; "TrustIndex AI" active references replaced with "Ozvor"). Razão social kept as the on-file civil name under CNPJ 67.609.444/0001-08 (not reproduced, at the controller's instruction); the public identity is the trade name Ozvor. P5 legal-gate verdict pending. Historical Archived section (Organic Posts, Lda) preserved unedited per append-only convention.
- Next review: annual (2027-06) or on material change in processing, sub-processor list, applicable law, or entity identity
