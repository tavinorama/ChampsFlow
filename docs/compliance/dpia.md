# Data Protection Impact Assessment (DPIA)

> Owner: `legal-privacy-officer` · Gate 3→4 — 2026-05-02 · GDPR Art. 35
> Mandatory: high-risk processing confirmed at Gate 0→1 (large-scale OAuth token storage, automated AI processing, cross-border transfers).
> Update on every material change in processing operations.

---

## TL;DR

**Updated 2026-06-09 — GEO Platform (TrustIndex AI, Brazil Ltda) supersedes prior social-scheduling DPIA below.**

TrustIndex AI (Brazil Ltda) is a GEO audit platform for SMBs. Jurisdictions: Brazil (LGPD RIPD, Section 10), EU (GDPR Art. 35), US (CCPA/CPRA, FTC §5). Data processed: customer account email, BYOK provider keys (AES-256-GCM), per-audit citation evidence (synthetic probe prompts, no personal data by design, purged 90 days), brand/domain data, Stripe billing identifiers. Data subjects: B2B customers and staff emails. High-risk processing confirmed on three GDPR Art. 35(3) triggers: (a) systematic large-scale processing of publicly available data; (b) innovative technology (multi-LLM audit mechanism); (c) cross-border transfers to multiple LLM providers. After mitigations — synthetic-only probe prompts (GEO-A2), EU/Perplexity routing gate (GEO-A3), AES-256-GCM BYOK key storage, forced RLS multi-tenant Postgres, append-only ai_generation_log (GEO-A6), GDPR Art. 27 EU representative required before EU user onboarding — residual risk is **LOW to MEDIUM**. Three open conditions remain: GEO-D1 (LLM provider EU routing confirmations), GEO-D2 (citation_check.sources incidental personal data review), GEO-D3 (LGPD international transfer basis). No GDPR Art. 36 or ANPD consultation required. Next mandatory review: before new LLM provider activation or EU/BR paid launch.

---

## SECTION A — ARCHIVED: Social-Scheduling Product (Organic Posts v1 — 2026-05-02)

> **SUPERSEDED for the GEO platform pivot.** The entries below (Sections 1–9) document the DPIA for the archived social-scheduling product (Organic Posts v1, Portugal Lda entity, 2026-05-02). They are preserved as a historical record. The live DPIA for TrustIndex AI (GEO platform, Brazil Ltda) begins at Section 1-GEO below.

---

## 1. Description of Processing

**Controller / Processor role split:**
- Controller identity: **Organic Posts, Lda (Portugal)** — Sociedade por Quotas established in the EU. As an EU-established controller, no GDPR Art. 27 representative is required (Art. 27 applies only to non-EU controllers/processors).
- Organic Posts acts as **data controller** for its own account, billing, and operational data (user registration, audit logs, payment records).
- Organic Posts acts as **data processor** on behalf of SMB/agency customers (data controllers) for their social account OAuth tokens and any content generated or published via the platform. GDPR Art. 28 DPA required with every EU-based customer.

**Purposes:**
1. Account registration and authentication (contract performance)
2. OAuth social account management — storing and using credentials to publish approved posts (contract performance)
3. AI-assisted post draft generation via LLM (contract performance)
4. Post scheduling and publication to LinkedIn and Instagram (contract performance)
5. GDPR Art. 28 DPA acknowledgment and CCPA opt-out recording (legal obligation)
6. Data subject rights (DSR) fulfillment — access, erasure, portability, correction (legal obligation)
7. Security monitoring and incident evidence (legal obligation / legitimate interests)
8. Billing and subscription management via Stripe (contract performance)

**Categories of data subjects:**
- SMB operators and agency account managers (platform users) — primary category
- Employees/team members added to a workspace under an SMB account (secondary)
- No end-audience personal data collected in v1 (analytics deferred to v1.1)

**Categories of personal data:**
- Name and email address (account identifiers)
- OAuth access and refresh tokens for LinkedIn and Instagram (sensitive PI — CPRA account credentials)
- IP address (audit log — legal evidence)
- Post content: topic input, AI-generated drafts, approved post text (service content)
- Generation log: prompt text, model version, output hash (AI accountability)
- DPA acknowledgment record: user ID, timestamp, version, IP (legal obligation evidence)
- CCPA opt-out record: user ID, timestamp, IP, flag (legal obligation evidence)
- Session tokens (security — short-lived, Redis TTL 7 days)
- Billing identifiers: Stripe customer ID, subscription ID (no raw card data in app DB)

**Recipients:**
- Supabase (database + auth infrastructure, EU project eu-central-1)
- Anthropic via AWS Bedrock eu-central-1 / direct API (LLM inference — topic text only; ZDR)
- Railway (hosting infrastructure — EU-west for EU users)
- Upstash Redis (job queue — draft IDs and session tokens, no content; EU endpoint)
- Stripe (billing — Stripe-hosted; only IDs stored in app DB)
- Resend (transactional email — email address + notification content; EU infrastructure)
- Axiom / Grafana Cloud (observability — hashed IDs only, no PII; EU endpoints)
- LinkedIn and Instagram APIs (post content and OAuth tokens transient, for publishing)

**Retention periods:**
- Account data (name, email): until account deletion + 30-day grace period, then hard delete
- OAuth tokens: until user revokes or account deletion; tokens revoked via platform API before deletion
- Post content and generation log: until user deletion or account deletion + 30-day grace
- Audit log (DPA ack, CCPA opt-out, DSR events): 3 years minimum (GDPR Art. 5(2) accountability; statute-of-limitations alignment)
- IP addresses in audit log: 3 years; IP pseudonymized on erasure request (hash-replace rather than delete — preserves log integrity per Art. 17(3)(e))
- Session tokens: 7-day inactivity TTL, Redis expiry enforced
- DSR request records: closed_at + 30-day window, then deleted (fulfillment packages delivered before deletion)
- Billing: Stripe retention policy governs; Stripe IDs in app DB deleted on account deletion

---

## 2. Necessity and Proportionality

**Lawful basis per processing purpose (GDPR Art. 6):**

| Purpose | Lawful basis | Justification |
|---|---|---|
| Account registration and authentication | Art. 6(1)(b) — contract | Direct contractual relationship with SMB user |
| OAuth token storage and use for publishing | Art. 6(1)(b) — contract | Core service delivery; no alternative without token storage |
| AI draft generation (topic text to LLM) | Art. 6(1)(b) — contract | Central product feature; topic input is user-supplied content |
| DPA acknowledgment and CCPA opt-out logging | Art. 6(1)(c) — legal obligation | GDPR Art. 5(2) accountability; CCPA § 1798.105 compliance |
| DSR intake and fulfillment | Art. 6(1)(c) — legal obligation | GDPR Art. 15–22; US state privacy laws |
| Security monitoring / audit log | Art. 6(1)(c) — legal obligation | GDPR Art. 32 security obligation; breach response evidence |
| Billing and subscription management | Art. 6(1)(b) — contract | Subscription SaaS model requires payment processing |

**Special-category basis (GDPR Art. 9):** Not applicable. No special-category data (health, political opinion, biometric, racial, religious) is processed. OAuth tokens are not Art. 9 data; CPRA "sensitive PI" is a US-law concept without a GDPR Art. 9 equivalent.

**Data minimization (Art. 5(1)(c)):**
- Name + email: minimum required for account creation and billing communications. No excess.
- OAuth tokens: minimum-scope OAuth permissions specified (LinkedIn: w_member_social + r_basicprofile; Instagram: instagram_basic + instagram_content_publish). Tokens stored encrypted; not logged; not returned in API responses. Minimized.
- IP address: collected only at legally significant events (signup, DPA ack, CCPA opt-out, DSR receipt). Not collected on routine API requests (hashed tenant/user IDs used in operational logs). Minimized.
- Post content and generation log: retained as the core work product and AI accountability record. Generation log serves Art. 50(4) machine-readable marking and incident investigation obligations. Both fields necessary; no excess.
- Session tokens: short-lived (7-day TTL); refresh rotation enforced. Minimized.

**Storage limitation (Art. 5(1)(e)):**
- 30-day post-cancellation grace for content data: proportionate; provides recovery window aligned with industry norm and user expectation.
- 3-year audit log retention: justified against GDPR Art. 5(2) accountability obligation and statute-of-limitations alignment. Reviewed annually.
- All other categories: deleted promptly on account deletion or DSR erasure fulfillment.

**Post content secondary use — no LLM fine-tuning:** Anthropic ZDR confirmed (no opt-in required; on by default in both Bedrock EU and direct API paths). Inference inputs are not retained by Anthropic after the API response is returned. Post content stored in Organic Posts' database is never sent to the LLM for batch fine-tuning; no such pipeline exists in v1.

---

## 3. Data Inventory and Lawful Basis per Category

Consolidated from PRD §7 + architecture §4. Full lawful basis map at Gate 2→3 gate-log entry (legal-privacy-officer, 2026-05-02) — carried forward here for DPIA completeness.

| Category | Lawful basis | Sensitive under CPRA | Art. 9 GDPR | Retention |
|---|---|---|---|---|
| Name + email | Art. 6(1)(b) | No | No | Account life + 30 days |
| OAuth tokens (LinkedIn, Instagram) | Art. 6(1)(b) | Yes — account credentials | No | Until revoked or account deletion |
| IP address | Art. 6(1)(c) | No | No | 3 years (audit log); pseudonymized on erasure |
| Post content (draft + approved) | Art. 6(1)(b) | No | No | Account life + 30 days |
| Generation log (prompt, output, model) | Art. 6(1)(b) + (c) | No | No | Account life + 30 days |
| DPA acknowledgment record | Art. 6(1)(c) | No | No | 3 years |
| CCPA opt-out record | Art. 6(1)(c) | No | No | 3 years |
| Session tokens | Art. 6(1)(b) | No | No | 7-day TTL |
| Billing identifiers (Stripe IDs) | Art. 6(1)(b) | No | No | Account life; Stripe governs card data |

---

## 4. Data Subject Rights Design (GDPR Art. 15–22)

Architecture §13 documents the full DSR workflow. Assessment below verifies GDPR and CCPA/CPRA compliance in design.

**Right to access (Art. 15 / CCPA § 1798.110):**
- Intake: public `/privacy/dsr` form + `POST /api/dsr` (no login required).
- Identity verification: email OTP (10-minute expiry) sent to requester-provided email. Proportionate — email OTP is the lowest-friction verification method appropriate for this service type and avoids over-collection (no government ID requested).
- Fulfillment: all tables queried by user_id; OAuth tokens exported as presence-only (token exists: yes/no, scope, connected_at) — decrypted token never included in export. IP addresses redacted in export (minimization on export). Generation log included (prompt inputs and outputs, as per Art. 15(1)(h) logic for automated processing). Delivered to verified email.
- SLA: 30 days from receipt (GDPR Art. 12(3)); 45 days (CCPA § 1798.130). Alert fires at day 25 (architecture §10 observability).
- **Verdict: GDPR Art. 15 and CCPA § 1798.110 — design compliant.**

**Right to erasure (Art. 17 / CCPA § 1798.105):**
- Cascade: drafts → generation_log rows → social_accounts → user record.
- Soft-delete (deleted_at) first; hard-delete job runs after 30-day grace.
- OAuth tokens revoked via platform API before deletion.
- Audit log rows NOT deleted — Art. 17(3)(e) legal accountability exception applies. IP and email in audit log pseudonymized (hash-replace) on erasure to remove direct identifiers while preserving legal integrity.
- Architecture §15 R6 flags DSR erasure cascade completeness as a QA condition (Gate 6).
- **Verdict: GDPR Art. 17 and CCPA § 1798.105 — design compliant. Cascade completeness must be tested at Gate 6 (qa-engineer condition).**

**Right to portability (Art. 20):**
- JSON export of all user-supplied data (topic inputs, approved draft text, account metadata). Machine-readable format. Same package as access response.
- **Verdict: Art. 20 — design compliant.**

**Right to rectification (Art. 16):**
- Users can edit draft text before approval (C3 review screen). Account email and profile data can be updated in account settings (standard SaaS pattern). Architecture does not explicitly document a correction workflow for the `users` table via the DSR pathway — the `dsr_requests` table includes `request_type ENUM(... correction ...)` which confirms the intake captures correction requests. Fulfillment for correction of account data (email, name) is via standard account settings update for authenticated users, or via manual admin action for unauthenticated DSR. **Gap: correction fulfillment for unauthenticated DSR (user who no longer has access) is not documented in architecture §13. Owner: ux-designer to add correction flow to DSR intake UI at Gate 4→5; database-agent/backend-coder to confirm admin-side correction API at Phase 5.**

**Right to restriction (Art. 18):**
- Not explicitly documented in architecture §13 DSR workflow. ENUM includes `restriction` as a request type, confirming intake is possible. Fulfillment procedure not specified. **Condition: fulfillment procedure for restriction requests (typically: mark record as restricted; suppress automated processing while restriction active) must be documented by backend-coder or system-architect before Phase 5 implementation. Owner: Phase 5 backend-coder. Due: Gate 5→6.**

**Right to object (Art. 21):**
- Not applicable in v1 (no processing on legitimate-interests basis that would trigger Art. 21(1) objection rights; no direct marketing processing). CCPA opt-out (CI-2) covers the analogous US right. No gap.

**Right against automated decision-making (Art. 22):**
- The draft-and-confirm posting model ensures no post is published without explicit human approval. AI generation is an assistive tool, not a decision-making system that produces legal or similarly significant effects on data subjects. Art. 22 is not triggered.
- **Verdict: Art. 22 — not applicable. Human oversight structurally embedded in posting model.**

**DSR identity verification quality:**
- Email OTP is appropriate for this service and data sensitivity level. It is not over-collection. The architecture confirms no government ID is requested, which is proportionate.
- Limitation: a data subject who has lost access to their email address cannot verify via OTP. Fallback not documented. This is an edge case; manual escalation path (internal admin via `POST /api/dsr/:id/verify`) can handle this. Owner: ux-designer to document escalation path in DSR intake UI at Gate 4→5.

---

## 5. Sub-Processors and Cross-Border Transfers

Source: architecture §11. Assessment against GDPR Art. 44–46.

| Vendor | Data transferred | EU transfer required | Mechanism | DPA executed? | Gap |
|---|---|---|---|---|---|
| Anthropic (EU tenants via Bedrock eu-central-1) | Topic/prompt text | No — inference stays in EU (eu-central-1) | No Art. 44 transfer | Must execute before first EU user onboards | None for EU path |
| Anthropic (US tenants via direct API) | Topic/prompt text | No — US data, US processing | No mechanism required | Must execute for US path | None |
| Supabase (EU project, eu-central-1) | All EU tenant data | No — data stays in EU | No Art. 44 transfer | Must execute before EU user onboards | None |
| Railway (EU-west) | All EU tenant application traffic | No — EU hosting | No Art. 44 transfer | DPA in ToS | None |
| Upstash (EU endpoint) | Session tokens, job payloads (draft IDs, no content) | No — EU endpoint | No Art. 44 transfer | DPA available | None |
| Stripe | Name, email, subscription data | Yes — US-hosted | SCCs + DPF certified | Must execute | Confirm SCC module (processor-to-subprocessor if Organic Posts is processor for EU customer billing data) |
| Resend | Email, notification content | No — EU infrastructure selected | No Art. 44 transfer (EU infra) | DPA available | Verify EU infrastructure is active at account level — Gate 7 devops item |
| Axiom / Grafana Cloud | Hashed IDs, metrics, traces (no PII) | No — EU endpoints | Not required (no PII after hashing) | DPA available | None |
| LinkedIn API | OAuth token (transient), post content | Yes — US | Not a GDPR transfer — directed by user action (performance of contract); user's LinkedIn content goes to LinkedIn at user's instruction | LinkedIn ToS/API agreement | None |
| Instagram Graph API | OAuth token (transient), post content | Yes — US | Same treatment as LinkedIn | Meta ToS/API agreement | None |

**Art. 44–46 assessment — CLOSED for EU inference path:**
The Anthropic Bedrock eu-central-1 routing for EU tenants eliminates the primary cross-border transfer risk identified at Gate 0. EU user prompt text never leaves EU infrastructure on the inference path. The Stripe SCCs condition is low-risk given Stripe's DPF certification and standard DPA coverage.

**Transfer Impact Assessment (TIA):**
A full TIA is recommended for Stripe (EU → US billing data). The risk is low given DPF certification and the limited data categories (name, email, subscription status — no sensitive PI). No TIA is required for Anthropic EU inference path (no transfer occurs). A TIA should be drafted and executed before Gate 7, with external counsel review for the Stripe transfer. Owner: legal team at Gate 7.

---

## 6. Security Measures

### Technical measures (architecture §9 + §12)

- **Encryption at rest:** PostgreSQL data encrypted at rest by Supabase (AES-256, managed). OAuth tokens additionally encrypted at field level (AES-256-GCM, application-managed key). Key stored in Railway environment secrets; rotated quarterly.
- **Encryption in transit:** All external traffic TLS 1.2 minimum (TLS 1.3 preferred). Internal Railway private-network service-to-service traffic also TLS-enforced. OAuth tokens passed via encrypted Redis queue, not plaintext job arguments.
- **OAuth token lifecycle:** Decrypted transiently in worker memory immediately before publish call; never written to logs; never returned in API responses. PKCE flow: frontend never sees authorization codes.
- **Audit log integrity:** Append-only at application layer (`generation_log`, `audit_log`). Database-level enforcement (DB role privilege revocation for DELETE/UPDATE on these tables) is documented as required but not yet confirmed as a DB-level control — this is carry-condition CC-1 (MEDIUM, due Gate 4→5 / Phase 5).
- **Multi-tenant isolation:** Shared DB with application-layer `tenant_id` enforcement in query helper + PostgreSQL RLS as defense-in-depth. Cross-tenant leak test in CI (qa-engineer, Gate 6).
- **Access controls (RBAC):** Owner/Editor/Viewer roles enforced in API middleware. Public access limited to DSR intake endpoint.
- **Observability (privacy-preserving):** Hashed tenant/user IDs in operational logs. No PII (email, post content, OAuth tokens) in logs. Grafana and Axiom receive no identifiable data.
- **Generation log (AI accountability):** Full prompt-to-output chain reconstructable per draft. `ai_generated` flag propagates to DB, API responses, exports, and scheduler payloads.

### Organizational measures

- **Access policy:** Internal admin panel has no access to tenant content data (architecture §4). Admin access requires separate credentials; trust boundary documented as carry-condition CC-2 pending.
- **Vendor due diligence (DPAs):** DPAs required with Supabase and Anthropic before first EU user onboards (Gate 7 hard stop). Stripe DPA plus SCCs required. Resend, Railway, Upstash, Axiom, Grafana DPAs available and to be executed before launch.
- **Breach response procedure:** 72-hour GDPR notification obligation (Art. 33) and US state breach notification (varies 30–72 hours by state) must be documented and tested before Gate 7. Owner: devops-engineer + legal at Gate 7.
- **Training:** Compliance documentation to be reviewed by any personnel with database access before launch. Owner: PM at Gate 7.

---

## 7. Risk Assessment

Likelihood and severity rated: L = Low, M = Medium, H = High. Score = L×S (HH=9, HM/MH=6, MM=4, LH/HL=3, LM/ML=2, LL=1).

| # | Risk | Likelihood | Severity | Score | Mitigation | Residual |
|---|---|---|---|---|---|---|
| R1 | OAuth token breach — encrypted tokens exfiltrated from DB; attacker gains posting rights to SMB social accounts | M | H | 6 | Field-level AES-256-GCM + quarterly key rotation + tokens never logged or returned in API + PKCE flow | Low (3) — decryption requires app key; no single exfiltration point |
| R2 | Cross-tenant data leak — query missing tenant_id filter returns another tenant's posts or tokens | M | H | 6 | Shared query helper enforces tenant_id; Postgres RLS defense-in-depth; cross-tenant CI test at Gate 6 | Low (3) — two independent enforcement layers |
| R3 | EU data crosses to US via Anthropic inference without Art. 44 coverage | L | H | 3 | EU tenants routed to Bedrock eu-central-1; no transfer occurs; DPA must be executed before EU launch (Gate 7 hard stop) | Low (1) — no transfer occurs on EU path |
| R4 | Supabase cross-region replication silently enabled — EU data copied to US project | L | H | 3 | Separate Supabase projects per region (not replicas); Gate 7 devops verification item; infrastructure-as-code review | Low (1) — configuration is explicit; verified at Gate 7 |
| R5 | Supabase SPF (auth + data on same platform) — extended outage disables both auth and data simultaneously | M | H | 6 | Logical backups to S3 every 6 hours (different region); 4-hour restoration target; fall-forward procedure documented | Medium (4) — availability risk accepted for v1; SLA reviewed at Series A |
| R6 | LLM inference inputs retained by Anthropic beyond ZDR window — secondary processing without lawful basis | L | H | 3 | ZDR on by default in both paths (confirmed in architecture §12); DPA must be executed before EU launch | Low (1) — ZDR eliminates retention at provider |
| R7 | DSR erasure cascade incomplete — generation_log rows survive deletion | M | H | 6 | Explicit `DELETE FROM generation_log WHERE draft_id IN (...)` in erasure job; post-deletion verification query; QA tested at Gate 6 (R6 condition in architecture §15) | Low (3) — QA gate closes the gap |
| R8 | Identity verification failure — DSR fulfilled to wrong person | L | M | 2 | Email OTP + cross-check against account email; manual admin escalation for edge cases | Low (1) |
| R9 | Audit log tampered — application-layer append-only enforcement bypassed by developer with DB access | L | H | 3 | DB role privilege revocation (DELETE/UPDATE) on audit_log and generation_log required (CC-1, open); manual DB access logged | Medium (2 after CC-1 closed) |
| R10 | Prompt injection via user-supplied topic text — malicious input extracts system prompt or produces harmful content | M | M | 4 | Hardcoded system prompt; output length enforced server-side; CC-3 (prompt injection assessment) open for architecture; provider content filter assumed | Medium (4) — CC-3 must close before Phase 5 |

**Overall residual risk: LOW** after full mitigation stack applied and open conditions (CC-1, CC-2, CC-3) closed by Gate 4→5/Phase 5.

---

## 8. AI-Specific Risks

**AI system:** Anthropic Claude Sonnet (v1 default, FD-3). Deployer role: Organic Posts. Provider role: Anthropic. GPAI tier: below systemic-risk threshold.

| # | AI risk | Assessment | Mitigation |
|---|---|---|---|
| AI-1 | Generated content used for publishing without human review | Not applicable — draft-and-confirm posting model. No post published without explicit user `Approve & Schedule` action. Art. 22 not triggered. | Structural: posting model enforces human oversight |
| AI-2 | Generation audit log incomplete — AI outputs not traceable to prompt and model version | Closed in architecture. `generation_log` table captures: prompt_system, prompt_user, regen_instructions[], provider, model_name, model_version, output_text, output_hash, created_at, user_id, tenant_id. Full prompt-to-output chain reconstructable per draft. | Architecture §12 (A1 + A2 closed) |
| AI-3 | AI-generated flag not preserved across surfaces — machine-readable marking fails Art. 50(4) | Closed in architecture. `ai_generated` propagates to DB column, API responses, exports, scheduler payload. LinkedIn/Instagram platform APIs do not accept third-party AI marking fields as of 2026-05 — exclusion documented in architecture §12 (A3). | Architecture §12 (A3 closed) |
| AI-4 | Drift in generation quality after Anthropic model update — undetected degradation in output quality | Instrumented. `regen_to_approval_ratio` gauge instrumented at API layer; Grafana alert at 2:1 threshold. Monitoring dashboard: Gate 7 (A5). | Architecture §10 + §12 (A5 closed) |
| AI-5 | Provider retains inference inputs — secondary processing for Anthropic training on customer content | Closed. Anthropic ZDR is on by default in both paths (Bedrock EU + direct API). No opt-in required. Inference inputs not retained after API response. Confirmed in architecture FD-3 + §12. | Architecture §12, FD-3 |
| AI-6 | Prompt injection via user-supplied topic text — malicious input extracts system prompt or bypass content controls | Open (CC-3). Architecture documents hardcoded system prompt and output length limits but does not document sanitization of `topic_input` and `regen_instructions` fields. Assessment due before Phase 5. | CC-3 condition — owner: system-architect, due Gate 4→5 |
| AI-7 | Generation audit log not append-only at DB level — records can be deleted or modified | Open (CC-1). Application-layer convention only. DB-level privilege revocation required. | CC-1 condition — owner: system-architect or database-agent, due Gate 4→5 / Phase 5 |

**Anthropic per-provider signoff (L4 condition — closed):**
- Provider: Anthropic Claude Sonnet (FD-3, confirmed 2026-05-02)
- ZDR: on by default in both paths (Bedrock eu-central-1 and direct API). No opt-in header required. Architecture §12 and FD-3 confirm this.
- DPF certification: Anthropic holds EU-US Data Privacy Framework certification (confirmed in architecture §11 and §12).
- GDPR DPA: Anthropic DPA available (Module 2 SCCs, controller-to-processor). DPA MUST be executed before the first EU user onboards. This is a Gate 7 hard stop.
- EU inference region: AWS Bedrock eu-central-1 for EU tenants. EU user prompt text does not leave EU infrastructure. No Art. 44 cross-border transfer occurs on the EU path. GDPR Art. 44–46 condition: CLOSED for EU inference.
- GPAI tier: Anthropic Claude Sonnet is below the systemic-risk threshold (training compute below 10^25 FLOPs per EU AI Act Annex XIII as documented in architecture §12). Standard deployer obligations apply (Art. 50 transparency). No provider-level GPAI systemic-risk obligations fall on Organic Posts.
- CA SB-942: Anthropic publishes training data provenance documentation satisfying CA SB-942 disclosure requirement (confirmed in architecture §12, A7 closed). Organic Posts must link to Anthropic's SB-942 disclosure in its AI transparency notice — owner: ux-designer at Gate 4→5.

**Conclusion on L4 (LLM provider inference retention):** ZDR claim verified. Architecture §12 confirms ZDR is on by default in both Anthropic paths. Anthropic's published API documentation (as referenced in architecture FD-3) and the DPA terms confirm ZDR eliminates provider-side retention of inference inputs. Bedrock eu-central-1 adds the geographic isolation layer. No residual concern on inference retention for v1 default provider. L4 — CLOSED.

---

## 9. Conclusion (Archived — Social-Scheduling v1)

**Proceed with conditions.**

High-risk processing confirmed under GDPR Art. 35(1) and WP29/EDPB DPIA guidelines. Mitigations are substantial and materially reduce risk to data subjects. Residual risk is LOW after the full mitigation stack is applied and the four open conditions below are closed.

**Required mitigations before launch (Gate 7 hard stops):**
1. Anthropic DPA executed (Module 2 SCCs or DPF reliance confirmed) before first EU user onboards.
2. Supabase DPA executed before first EU user onboards.
3. Stripe DPA + SCCs executed before launch.
4. Resend EU infrastructure configuration verified at account level (devops-engineer, Gate 7).
5. Supabase cross-region replication verified as disabled (devops-engineer, Gate 7).
6. Breach notification procedure documented and tested (devops-engineer + legal, Gate 7).
7. DSR erasure cascade tested in QA (qa-engineer, Gate 6).

**Open conditions for Phase 4/5 (not Gate 7 hard stops, but must close before Phase 5 code is written):**
- CC-1: DB-level append-only enforcement on audit_log and generation_log (system-architect or database-agent)
- CC-2: Admin panel trust boundary and C4 diagram (system-architect)
- CC-3: Prompt injection / sanitization assessment (system-architect)
- Art. 16/18 correction and restriction fulfillment procedures (backend-coder, Phase 5; ux-designer, Gate 4→5)

**DPIA review cadence:**
- Trigger review before: adding any new LLM provider, activating analytics (v1.1), adding demographic data collection, adding new geographic market, or any material change in sub-processor list.
- Annual review minimum per GDPR Art. 35(11) best practice.

**Art. 36 supervisory authority consultation:** Not required. Residual risk is LOW; no remaining high-risk processing after mitigations. Recommend DPA consultation only if a subsequent DPIA review produces a HIGH residual risk finding.

---

## Approval (Archived)

- DPIA author: legal-privacy-officer agent
- Gate: 3→4
- Date: 2026-05-02
- Reviewed by (human): _____ (required before EU launch)
- Next mandatory review trigger: new LLM provider activation, v1.1 analytics feature, or annual cycle (2027-05)

---

---

## SECTION B — LIVE DPIA: TrustIndex AI (GEO Platform, Brazil Ltda) — 2026-06-09

> This section supersedes Section A for all current processing operations. Produced at Gate 3→4 (DPIA gate) for the GEO platform as mandated by the Gate 0→1 pivot re-run verdict (2026-05-18, condition 4).

---

## 1-GEO. Description of Processing

### Controller / Processor Identity

- **Controller name**: Ozvor — Brazilian **MEI (Microempreendedor Individual)**, CNPJ **67.609.444/0001-08**, registered office Rua José Borges Abrantes, nº 1, Centro, Muriaé — MG, CEP 36.880-063, Brasil. Regulator: **ANPD**. Home jurisdiction: Brazil. LGPD Art. 5(VI) controller (controlador). *(Corrects the prior entry in this section, which read: "TrustIndex AI Ltda (Brazil — Sociedade Limitada, CNPJ pending incorporation; formerly referred to as 'TrustIndex AI')." That entry incorrectly stated the entity type as a Sociedade Limitada and left the CNPJ/registered office as pending. This correction — 2026-07-09 — aligns the DPIA with the confirmed entity identity already recorded in `docs/compliance/ropa.md` (updated 2026-07-08) and the live legal pages (`apps/web/src/app/privacy-policy/page.tsx`, `terms-of-service/page.tsx`, `legal/dpa/page.tsx`). The holder's civil name (razão social) is not reproduced in this document at the controller's instruction; the CNPJ is the unique public identifier of record and "Ozvor" is the trade name displayed to data subjects.)*
- **EU extraterritorial scope**: Ozvor processes personal data of EU data subjects by offering services to them (GDPR Art. 3(2)(a)). As a non-EU-established controller, **GDPR Art. 27 EU representative must be appointed before EU users are onboarded** (reversal of the 2026-05-11 Portugal Lda entry).
- **US scope**: FTC §5, CCPA/CPRA, TDPSA and other state laws apply based on customer jurisdiction and thresholds (see regulatory-map.md).
- **LGPD scope**: Controller is Brazil-established and processes data of Brazilian data subjects. LGPD applies in full.
- **Controller / operador split (LGPD Art. 5(VI)–(VII))**: Ozvor is controlador for its own account, billing, and audit data. It acts as operador for customer-directed audit processing where the subscribing SMB determines the brand(s) to audit. DPAs must reference both LGPD Art. 39 and GDPR Art. 28.

### Processing Purposes (GEO Platform)

1. Customer account creation and authentication — magic-link email via Supabase Auth (contract performance)
2. Brand profile management — storing brand name, domain, configured competitors per customer account (contract performance)
3. GEO Audit Engine — sending synthetic buyer-category probe prompts to LLM providers (Anthropic, OpenAI, Gemini; Perplexity EU-excluded per GEO-A3 routing gate) and parsing citation evidence (contract performance)
4. Site crawl — fetching customer's own public website (homepage, sitemap pages, robots.txt, llms.txt) to measure technical GEO signals (contract performance)
5. Off-site signal measurement — checking brand presence across public sources (Reddit, Wikipedia, LinkedIn, G2, Trustpilot, Crunchbase, YouTube) via SERP API (contract performance / legitimate interests)
6. Competitor detection — identifying competitor brand name mentions in LLM probe responses; competitor names never sent to LLM providers (GEO-A2) (contract performance / legitimate interests)
7. GEO Score computation — computing 3-vector score stored in multi-tenant Postgres with forced RLS (contract performance)
8. Citation evidence storage — per-prompt citation evidence (synthetic prompt text, cited yes/no, position, source URLs); no personal data in prompts by design; purged after 90 days (contract performance + accountability)
9. AI generation log — append-only ai_generation_log (GEO-A6); stores hashes only, not content (accountability / legal obligation)
10. Content draft generation — generates content drafts via LLM that are always human-approved before any use; labelled AI-generated (EU AI Act Art. 50) (contract performance)
11. Strategy plan generation — rule-based and LLM-assisted prioritised action plan; human accept/reject per task (contract performance)
12. BYOK provider key storage — AES-256-GCM encrypted storage of customer-supplied LLM API keys (contract performance / security)
13. Billing — Stripe for EU/US (cards); Brazil Pix/boleto planned (contract performance)
14. DSR handling — GDPR Art. 15–22, LGPD Art. 18, US state privacy law rights (legal obligation)
15. Breach notification preparation — GDPR Art. 33, LGPD Art. 48, US state notification laws (legal obligation)

### Data Subjects

- **Primary**: Business customers (B2B) — SMB operators, their staff who access the platform; email addresses are account identifiers
- **Secondary (incidental, minimised)**: Named individuals appearing in LLM probe response snippets, SERP results, or public source profiles (competitor executives, Reddit post authors, Wikidata persons) — not collected purposefully; stored only as aggregate citation metrics where possible

### Personal Data Categories

| Category | Description | Sensitivity |
|---|---|---|
| Account email | Magic-link auth via Supabase; no password stored | Low |
| Supabase Auth UID | Session / tenant identifier | Low |
| Brand name and domain | Customer-submitted; may include personal names if brand = person | Low |
| Billing identifiers | Stripe customer ID, subscription tier, region flag; no raw card data in app DB | Low |
| BYOK provider keys | AES-256-GCM encrypted blobs; presence-only API | Medium (encrypted at rest) |
| Synthetic probe text | Category-level buyer queries ("best CRM for small business" + client brand name); no personal data by design; 90-day purge | Low |
| Citation evidence | cited yes/no, position, source URLs per prompt; no personal data in fields | Low |
| ai_generation_log | SHA-256 hashes of generation inputs/outputs only; append-only | Low |
| Content drafts | AI-generated text awaiting human approval; ai_generated flag | Low |
| Third-party personal data (incidental) | Named individuals in SERP snippets or LLM citation passages (e.g. competitor CEO names); minimised — aggregate metrics preferred; not exported to clients in personal-data form | Medium (GDPR Art. 14 obligation) |

### Recipients and Sub-Processors

| Sub-processor | Data transferred | Region | Transfer mechanism |
|---|---|---|---|
| Supabase | All account + audit data | eu-central-1 (EU users) / us-east-1 (US/BR users) | EU: no Art. 44 transfer. US/BR: no mechanism required. DPA required. |
| Anthropic (Claude) | Synthetic probe prompts (no personal data by design) | Bedrock eu-central-1 (EU) / direct API (US/BR) | EU: no Art. 44 transfer (inference in EU). US/BR: US-to-US or Brazil-to-US, DPA + ZDR. LGPD: ANPD standard clauses or specific consent required for BR→US. DPF certified. |
| OpenAI (GPT-4o) | Synthetic probe prompts | Azure EU (EU users) / standard API (US/BR) | EU: Azure EU path — no Art. 44 transfer if confirmed. US/BR: DPA + ZDR (enterprise) or SCCs. DPF certified. |
| Google Gemini | Synthetic probe prompts | Vertex AI EU (EU users) / standard (US/BR) | EU: Vertex AI EU path — no Art. 44 transfer if confirmed. DPA required. DPF certified. |
| Perplexity | Synthetic probe prompts | US-hosted only | EU USERS EXCLUDED until DPA + SCC/DPF confirmed (GEO-A3 routing gate). US/BR: SCCs status unconfirmed — open condition GEO-D1. |
| DataForSEO / SerpAPI | Brand + domain queries for off-site signal | EU option (DataForSEO) / US (SerpAPI) | DataForSEO EU path: no Art. 44 transfer. SerpAPI: SCCs/DPF status to confirm. DPA required. |
| Stripe | Name, email, subscription data | US-hosted | SCCs + DPF certified. LGPD transfer basis: specific consent or ANPD standard clauses. |
| Railway | Application traffic | EU-west (EU) / varies (US/BR) | DPA in ToS. EU path: no Art. 44 transfer. |
| Upstash Redis | Job queue payloads (audit job IDs, no content) | EU endpoint | DPA available. No Art. 44 transfer on EU path. |
| Resend | Account email + notification content | EU infrastructure | DPA available. Verify EU infrastructure at account level (Gate 7). |

### Retention Periods

| Data category | Retention |
|---|---|
| Account data (email, auth UID) | Account life + 30-day grace, then hard delete |
| Brand and domain records | Account life + 30-day grace |
| Audit records (geo_audit, geo_score) | 12 months rolling (configurable), then aggregated summary only |
| Citation evidence (citation_check) | 90 days, then purged (GEO-A2 design intent) |
| ai_generation_log (hashes only) | 3 years (accountability obligation, GDPR Art. 5(2); LGPD Art. 37) |
| Content drafts (approved or discarded) | Account life + 30-day grace |
| Strategy plan tasks | Account life + 30-day grace |
| BYOK keys | Until key rotation or account deletion |
| Billing identifiers (Stripe IDs) | Account life; Stripe governs payment data |
| DSR records | Closed_at + 30 days, then deleted |
| Audit log (compliance events) | 3 years |

---

## 2-GEO. Necessity and Proportionality

### GDPR Lawful Basis (Art. 6)

| Processing purpose | Lawful basis | Justification |
|---|---|---|
| Account creation and authentication | Art. 6(1)(b) — contract | Direct contractual relationship with B2B customer |
| Brand profile and audit execution | Art. 6(1)(b) — contract | Core service delivery |
| Site crawl (customer's own site) | Art. 6(1)(b) — contract | Customer explicitly submits their domain for analysis |
| Off-site signal measurement (brand presence on public sources) | Art. 6(1)(f) — legitimate interests | Client has a legitimate commercial interest in measuring their brand visibility on public platforms; proportionate to the purpose; no material impact on data subjects (aggregated public data) |
| Competitor detection (name matching in LLM responses) | Art. 6(1)(f) — legitimate interests | Competitive benchmarking is a recognised legitimate interest; competitor names never sent to LLM providers (GEO-A2); no personal data of competitors' staff is stored except incidental named references minimised to aggregate counts |
| Citation evidence storage (synthetic probe results) | Art. 6(1)(b) — contract | Probe results are the core deliverable; evidence of citation performance |
| ai_generation_log (hashes) | Art. 6(1)(c) — legal obligation | GDPR Art. 5(2) accountability; EU AI Act Art. 50(4) machine-readable marking |
| Content draft generation and storage | Art. 6(1)(b) — contract | Content drafts are a contracted deliverable; ai_generated label required by Art. 50 |
| BYOK key storage | Art. 6(1)(b) — contract | Customer-directed; no processing without customer-provided keys |
| Billing | Art. 6(1)(b) — contract | Subscription SaaS billing |
| DSR handling | Art. 6(1)(c) — legal obligation | GDPR Art. 15–22; LGPD Art. 18; US state laws |
| Security monitoring / audit log | Art. 6(1)(c) — legal obligation | GDPR Art. 32; LGPD Art. 46 |

### LGPD Legal Bases (Art. 7)

| Processing purpose | LGPD basis | Notes |
|---|---|---|
| Account creation and authentication | Art. 7(V) — execution of contract | Equivalent to GDPR Art. 6(1)(b) |
| Brand audit and citation evidence | Art. 7(V) — execution of contract | |
| Off-site signal / competitive benchmarking | Art. 7(IX) — legitimate interests (legítimo interesse) | Subject to LGPD Art. 10 balancing test |
| ai_generation_log | Art. 7(II) — compliance with legal obligation | LGPD Art. 37 record-keeping; EU AI Act where applicable |
| DSR handling | Art. 7(II) — compliance with legal obligation | LGPD Art. 18 rights |
| Security / audit log | Art. 7(II) — compliance with legal obligation | LGPD Art. 46 security obligations |
| Billing (Stripe) | Art. 7(V) — execution of contract | |

No LGPD Art. 11 sensitive data (dados sensíveis) identified: no health, racial, religious, biometric, genetic, sexual orientation, or political data processed.

### CCPA/CPRA Basis

All processing is for service delivery (business purpose under CCPA § 1798.140(e)). No sale or sharing of personal information for targeted advertising. BYOK keys are not "personal information" under CCPA when encrypted and used solely for the customer's own service delivery. The "Do Not Sell or Share" opt-out obligation applies from launch for California residents accessing the platform.

### Special-Category Basis (GDPR Art. 9)

Not applicable. No special-category data is intentionally processed. If LLM probe responses incidentally contain health, political, or religious content about named individuals at competitor brands, the data minimisation obligation (Art. 5(1)(c)) requires that such content not be stored or exported — only aggregate citation metrics are retained.

### Data Minimization Assessment (GDPR Art. 5(1)(c); LGPD Art. 6(III))

- **Probe prompts**: Synthetic category-level buyer queries contain client brand name only. Competitor names are detected in returned LLM responses, never injected into prompts sent to providers (GEO-A2 hard constraint confirmed in implementation). No personal data of any individual is included in probe texts.
- **Citation evidence**: Source URLs and position/cited flags only. No storage of full LLM response text beyond 90-day window. This minimises incidental personal data retention in LLM outputs.
- **Third-party personal data**: Named individuals in SERP snippets and off-site source results are not individually stored in the database. Off-site signal measurement records per-source presence/absence and weighted score only. The off-site signal module (packages/llm/offsite-signal.ts) stores source chips (present/absent) and aggregate score — not individual post author names or profile data.
- **BYOK keys**: Only ciphertext stored; presence-only API response; no plaintext ever returned or logged.
- **Competitor benchmark**: competitor_citation table stores mention_count and displacement_count per competitor entity, not named individuals at those competitors. The competitor-detect module uses word-boundary-safe name matching on returned text, not stored text of the full LLM response.

**Overall data minimisation assessment: SUBSTANTIALLY COMPLIANT.** One open point: full LLM response text is stored in citation_check.sources (per implementation as of 2026-05-31 site-crawl slice); this field may contain incidental named-individual references. Condition GEO-D2 below requires that citation_check.sources content be reviewed and pseudonymised or truncated if it contains personal data.

---

## 3-GEO. Data Subject Rights Design (GDPR Art. 15–22; LGPD Art. 18; CCPA § 1798.100–135)

### GDPR Art. 15–22 Coverage

The GEO platform inherits the DSR workflow designed for the social-scheduling product (Section 4 above) with the following GEO-specific modifications:

- **Right to access**: Scope includes brand records, geo_audit rows, geo_score rows, citation_check rows (scoped to customer's own data), content drafts, strategy plan tasks, and billing identifiers. BYOK keys exported as presence-only (key exists: yes/no, provider, created_at).
- **Right to erasure**: Cascade must cover: brands → geo_audit → geo_score → citation_check → content_piece → plan_task → competitor → competitor_citation → provider_keys → users. ai_generation_log rows are NOT deleted (append-only by design, GEO-A6; Art. 17(3)(e) applies — accountability obligation). Hashes only in log; pseudonymisation not applicable to hashes.
- **Right to portability**: JSON export of brand profiles, audit scores (numerical), content drafts (approved text), strategy plan tasks. Source URLs from citation evidence included. No export of third-party personal data (off-site snippets, competitor citation text).
- **Right to rectification**: Account email via account settings. Brand name and domain editable by customer. No correction rights over audit results (these are computed metrics from public data, not stored personal data about the requesting data subject).
- **Right to restriction**: Processing restriction applies to active audit jobs. If a restriction request is received, no new audit jobs may be triggered for the restricted account; scheduled (cron) jobs must be paused. BullMQ job cancellation for scheduled repeatable jobs required.
- **Right to object (Art. 21)**: Applies to processing on legitimate-interests basis (off-site signal measurement, competitor detection). Object request must be assessed; if the objection is upheld, those processing activities cease for the customer's account. Given B2B context, Art. 21 objections are expected to be rare.
- **Right against automated decisions (Art. 22)**: The GEO Score is an automated computation about a brand's commercial visibility — not a decision about a natural person with legal or similarly significant effects. Art. 22 is NOT triggered. The score is presented with full explainability (provider_breakdown, per-vector breakdown, per-prompt evidence table) consistent with Art. 22(3) transparency even though Art. 22 does not technically apply.

### LGPD Art. 18 Rights

LGPD Art. 18 rights mirror GDPR substantially. Specific LGPD additions:
- **Art. 18(IV) — anonymisation, blocking, deletion**: Data subjects may request blocking (equivalent to GDPR restriction) or anonymisation of non-essential data. The 90-day citation evidence purge by design partially satisfies this.
- **Art. 18(V) — portability**: LGPD portability right confirmed in the export pathway above.
- **Art. 18(VIII) — information on consent or other basis**: Privacy Policy must disclose each lawful basis per processing activity for BR data subjects, citing LGPD Art. 7 bases.
- **ANPD as supervisory authority**: Privacy Policy must name ANPD and provide its contact details. DSR intake page must note the right to lodge a complaint with ANPD.

### CCPA § 1798.100–135

- **Right to know (§ 1798.110)**: Category and specific pieces of personal information collected, disclosed, or sold.
- **Right to delete (§ 1798.105)**: Same cascade as GDPR erasure.
- **Right to correct (§ 1798.106)**: Account data correctable via account settings.
- **Right to opt-out of sale/share (§ 1798.120)**: No sale or sharing for targeted advertising; "Do Not Sell or Share" link required on every page (homepage minimum + privacy policy page per § 1798.135(a)).
- **Right to limit use of sensitive PI (§ 1798.121)**: Not triggered in the GEO platform — no sensitive PI categories under CPRA (no account credentials stored outside of email address; BYOK keys are customer-owned, not consumer PI in the CCPA sense).
- **SLA**: 45 days from receipt; extendable once by 45 days with notice.

---

## 4-GEO. Sub-Processors and Cross-Border Transfers (GEO Platform)

### GDPR Art. 44–46 Assessment

**EU users (EU data residency enforced):**

| Provider | EU path | Transfer? | Mechanism | Status |
|---|---|---|---|---|
| Anthropic | Bedrock eu-central-1 | No | No Art. 44 transfer | CONFIRMED. DPA (Module 2 SCCs) must be executed before EU launch. |
| OpenAI | Azure EU regions (to be confirmed per account config) | No (if EU path confirmed) | No Art. 44 transfer | CONDITION GEO-D1(b): EU path must be explicitly confirmed in production environment config before EU launch. If standard API is used for EU users, SCCs (Module 2) required. |
| Google Gemini | Vertex AI EU (to be confirmed per account config) | No (if EU path confirmed) | No Art. 44 transfer | CONDITION GEO-D1(c): same as OpenAI — EU Vertex AI path must be confirmed. |
| Perplexity | No EU region available as of 2026-06 | Yes — US-hosted | **EU users EXCLUDED by GEO-A3 routing gate** | OPEN — no EU user data flows to Perplexity until DPA + SCC/DPF mechanism confirmed. GEO-A3 routing gate confirmed operational in code. |
| DataForSEO | EU-hosted option available | No (if EU path used) | No Art. 44 transfer | Confirm EU hosting configuration at Gate 7. |
| Stripe | US-hosted | Yes | SCCs + DPF certified | Must execute Stripe DPA before launch. |
| Supabase | eu-central-1 for EU users | No | No Art. 44 transfer | DPA must be executed. |

**BR users (Brazil → US/EU transfers under LGPD Arts. 33–36):**

LGPD international transfer requires one of: (a) transfer to country with adequate protection level recognised by ANPD; (b) ANPD-approved standard contractual clauses; (c) specific and highlighted consent; (d) binding corporate rules; (e) regulatory cooperation agreements. As of 2026-06, ANPD has not published a comprehensive adequacy list or approved standard contractual clauses that would provide a general LGPD SCC mechanism (the process was ongoing as of early 2025). This creates an open gap: in the absence of ANPD-approved clauses, the most practical LGPD basis for BR-to-US provider transfers is **Art. 33(IX) — specific consent from the data subject** or **Art. 33(II) — co-operation based on international instruments** where applicable.

**LGPD transfer condition (GEO-D3)**: Before Brazilian users' data is transferred to US-hosted sub-processors (Anthropic direct API, OpenAI standard API, Perplexity — if cleared, Stripe, SerpAPI), the LGPD transfer basis must be documented. Until ANPD publishes approved standard clauses, use: (a) specific highlighted consent disclosed in the Privacy Policy for each sub-processor transfer; or (b) verify whether current ANPD guidance recognises DPF or GDPR SCCs as an equivalent mechanism (this is an evolving area — external counsel review recommended). **This does not block the EU or US market launch, but must be resolved before Brazilian users who are natural persons (as opposed to the business entity itself) are onboarded onto the live SaaS platform.**

### Transfer Impact Assessment (TIA)

A TIA covering Anthropic, OpenAI, and Stripe (the three US-hosted providers most likely to process any account-level personal data) is recommended before Gate 7 go-live for EU users. The primary legal environment consideration is FISA 702 / CLOUD Act access risk. DPF certification provides a meaningful safeguard for EU-to-US transfers; however, TIA documentation is a best-practice requirement under EDPB guidance post-Schrems II even where DPF reliance is available.

---

## 5-GEO. Security Measures (GEO Platform)

### Technical Measures

- **Encryption at rest**: PostgreSQL AES-256 managed by Supabase. BYOK provider keys additionally encrypted at field level with AES-256-GCM (OAUTH_TOKEN_KEY, 32-byte key). Confirmed in migration `20260531000002_provider_keys` and `packages/llm/src/site-crawl.ts`.
- **Encryption in transit**: All external API calls TLS 1.2+; internal Railway private network TLS-enforced.
- **Multi-tenant isolation**: Forced RLS on all tenant-scoped tables (brands, geo_audit, geo_score, citation_check, ai_generation_log, content_piece, strategy_plan, plan_task, competitor, competitor_citation, provider_keys). Confirmed in migration `20260530000001_geo_audit_engine`.
- **Append-only ai_generation_log**: REVOKE UPDATE, DELETE from app_role confirmed for ai_generation_log (GEO-A6). Hashes only stored — no content retained in this log.
- **90-day citation evidence purge**: citation_check records purged after 90 days by design (GEO-A2). Scheduled job to be confirmed at Gate 7.
- **EU/Perplexity routing gate (GEO-A3)**: EU users excluded from Perplexity API at the LLM gateway layer. Confirmed in packages/llm/src/provider-gateway.ts logic. Verified in live test (EU brand = 2 providers only).
- **BYOK key lifecycle**: Encrypted at storage; presence-only API response; key never returned in plaintext; encryption verified end-to-end (saved key is ciphertext in DB, confirmed in /account/integrations implementation).
- **DEV_AUTH_BYPASS**: Gated to NODE_ENV !== production. Must be confirmed disabled in production at Gate 7.
- **Content draft human approval gate**: No auto-publish. content_piece.status transitions require explicit human approve action (PATCH /api/content/:id). approved_at and approved_by logged. EU AI Act Art. 50 label (ai_generated: true) non-removable.

### Organizational Measures

- **EU Art. 27 representative**: Required before EU users onboard. Not yet appointed. This is a Gate 7 hard stop.
- **Encarregado de Dados (LGPD Art. 41)**: Required. Must be appointed and contact published in Privacy Policy before BR launch. Can be same person as GDPR privacy contact.
- **Sub-processor DPAs**: All sub-processors in Section 1-GEO recipients table require executed DPAs before launch.
- **ANPD registration**: LGPD does not mandate controller registration with ANPD (unlike GDPR Art. 30 registration thresholds); ROPA-equivalent records required internally (see ropa.md update).
- **Breach notification**:
  - GDPR Art. 33: 72-hour notification to lead supervisory authority (DPA in EU — since controller is Brazilian, the "lead" DPA for EU operations is the authority of the data subjects' member states; all EU DPAs with jurisdiction may need notification until a lead is determined; Art. 27 representative appointment should include guidance on this).
  - LGPD Art. 48: notification to ANPD and affected data subjects within a "reasonable time period" (ANPD Resolution CD/ANPD 02/2022 — within 2 business days of becoming aware for significant incidents).
  - US state laws: 30–72 hours by state for expedited notification; general consumer notification 30–60 days.

---

## 6-GEO. Risk Assessment (GEO Platform)

| # | Risk | Likelihood | Severity | Score | Mitigation | Residual |
|---|---|---|---|---|---|---|
| GEO-R1 | BYOK key breach — encrypted provider key exfiltrated and decrypted | M | H | 6 | AES-256-GCM field-level encryption; presence-only API; key never returned in plaintext; OAUTH_TOKEN_KEY in Railway secrets | Low (3) — decryption requires app key; no single exfiltration vector |
| GEO-R2 | Personal data in probe prompts — customer accidentally includes PII in brand name or category field | L | M | 2 | Probe prompts are synthetic category questions built by the system, not user-typed text; brand name is a configured identifier, not a free-text search field; validation on brand name input | Low (1) |
| GEO-R3 | Citation evidence retention contains personal data (third-party named individuals in LLM response snippets stored in citation_check.sources) | M | M | 4 | 90-day purge policy; sources field stores URLs not full text; GEO-D2 condition: review citation_check.sources storage to confirm no personal data retained beyond URLs and citation metadata | Medium (4) — open condition GEO-D2 |
| GEO-R4 | EU user data routed to Perplexity before DPA/SCC confirmed | L | H | 3 | GEO-A3 routing gate confirmed operational; EU users excluded in code | Low (1) — routing gate closes the gap; verified in live test |
| GEO-R5 | Cross-tenant audit data leak via missing RLS on new table | M | H | 6 | Forced RLS on all tenant-scoped tables in existing migrations; CI check-rls.sql must be extended to GEO tables at Gate 7 | Low (3) — two enforcement layers (app-layer RLS context + DB-level forced RLS) |
| GEO-R6 | BR→US provider transfer without LGPD basis | M | M | 4 | GEO-D3 condition: LGPD transfer basis documentation before BR user onboarding | Medium (4) — open condition GEO-D3 |
| GEO-R7 | Content draft auto-published without human approval — EU AI Act Art. 50 and FTC violation | L | H | 3 | No auto-publish architecture; approved_at + approved_by required; append-only content_piece status audit trail | Low (1) — structural enforcement |
| GEO-R8 | Competitor names sent to LLM providers in probe prompts — GDPR Art. 6 violation for third-party personal data | L | H | 3 | GEO-A2 confirmed: competitor names detected in returned text only, never injected into prompts; word-boundary-safe detection (competitor-detect.ts) | Low (1) — design constraint confirmed in code |
| GEO-R9 | GDPR Art. 27 EU representative missing at EU user onboarding | M | H | 6 | Required before EU launch; Gate 7 hard stop | Medium (4) — blocked until appointed |
| GEO-R10 | LGPD Art. 41 Encarregado not appointed at BR launch | M | M | 4 | Required before BR launch; Gate 7 hard stop | Medium (4) — blocked until appointed |
| GEO-R11 | DEV_AUTH_BYPASS enabled in production | L | H | 3 | NODE_ENV gating confirmed in code; Gate 7 devops verification required | Low (1) — gating confirmed; devops verifies in prod |
| GEO-R12 | Off-site SERP queries identify individual Reddit/LinkedIn users — stored personal data without Art. 14 notice | M | M | 4 | Off-site signal stores per-source presence score only (not individual user profiles); offsiteScore is aggregated; minimisation confirmed in offsite-signal.ts | Low (2) — aggregation minimises personal data; residual risk in live SERP query result handling |

**Overall residual risk (GEO platform): LOW to MEDIUM.** Three open conditions (GEO-D1 through GEO-D3) reduce to LOW once closed. Gate 7 hard stops (EU Art. 27 representative, Encarregado) are deployment prerequisites.

---

## 7-GEO. AI-Specific Risks (GEO Platform)

| # | AI risk | Assessment | Mitigation |
|---|---|---|---|
| GEO-AI1 | GEO Score presented as objective truth — data subjects or clients believe score is definitive | Not a personal-data risk but an accuracy/transparency risk | Per-vector explainability in UI; measured/baseline distinction labelled; hedging language in UX (GEO-A4); statistical confidence from repeat probing (mentionRate vs. binary) |
| GEO-AI2 | Content draft published without AI disclosure — EU AI Act Art. 50 violation | Not triggered — no auto-publish path exists; ai_generated: true flag is non-removable | Structural enforcement in content_piece schema and API |
| GEO-AI3 | Competitor displacement data used for discriminatory commercial targeting | Low risk in B2B tool; clients use data for their own marketing optimisation | No personal data in competitor_citation table; counts only; no individual targeting |
| GEO-AI4 | Sentiment classifier misclassifies probe responses — inaccurate GEO Score communicated to clients | Risk to commercial accuracy, not to data subject rights | Deterministic lexicon-based sentiment (packages/llm/sentiment.ts); findings disclosed; subject to client dispute annotation |
| GEO-AI5 | ai_generation_log modified or deleted — accountability record lost | Closed: append-only enforced (GEO-A6); REVOKE UPDATE/DELETE in migration | Append-only enforcement confirmed in codebase |
| GEO-AI6 | Multi-provider LLM probing exceeds provider ToS benchmarking restrictions — platform liability | Medium risk: providers' ToS must be reviewed for competitive benchmarking clauses | Gate 7 condition: legal review of each provider's ToS for benchmarking restrictions (Anthropic, OpenAI, Gemini, Perplexity) |

---

## 8-GEO. GDPR Art. 14 Assessment — Third-Party Personal Data

The GEO platform processes publicly available personal data about third parties (named individuals at competitor brands appearing in LLM citations, SERP snippets, Reddit posts, and public directories). GDPR Art. 14 imposes transparency obligations when personal data is collected from sources other than the data subject.

**Art. 14(5)(b) exemption analysis**: The exemption from Art. 14 notification applies when "the provision of such information proves impossible or involves a disproportionate effort" because the personal data is obtained from a source that "must remain confidential subject to an obligation of professional secrecy" — this limb does not apply here — or where "the data was obtained from a publicly available source." The GDPR text at Art. 14(5)(b) covers the "publicly available" case for written notices, but EDPB guidance (Opinion 6/2018, para. 38) clarifies that the exemption does not excuse indefinite retention or use of public data beyond the original public purpose.

**Assessment for TrustIndex AI**:
1. Individual LLM probe query returns that mention a named executive or founder of a competitor brand: these are transient query results; citation_check stores source URLs and presence/position metadata, not the named individual's data. The name does not reach the persistent data layer except potentially in citation_check.sources. Condition GEO-D2 addresses this.
2. Off-site signal measurement (Reddit, Wikipedia, LinkedIn, G2, Trustpilot, Crunchbase, YouTube): stores per-source aggregate score only; no individual profiles or names stored. Art. 14 Art. 14(5)(b) exemption applies to this aggregate signal processing.
3. SERP query results for brand presence: individual author names or titles in SERP snippets may appear in raw query results but are not persisted in the data model; offsiteScore is computed and stored without underlying personal data. Minimisation is effective.

**Overall Art. 14 assessment**: SUBSTANTIALLY COMPLIANT with data minimisation design. GEO-D2 condition closes the residual gap in citation_check.sources.

---

## 9-GEO. Conclusion (GEO Platform)

**Proceed with conditions.**

High-risk processing confirmed under GDPR Art. 35(1), EDPB Guidelines 4/2019 triggers 3 (systematic evaluation of publicly available personal data at scale) and trigger 8 (innovative technology), and LGPD Art. 5(XVII) RIPD trigger (data processing at scale with technological innovation). Mitigations are substantial. Residual risk is LOW to MEDIUM pending three open conditions.

**Gate 7 hard stops (must complete before EU/BR user onboarding):**
1. GDPR Art. 27 EU representative appointed and named in Privacy Policy before any EU user onboards.
2. LGPD Art. 41 Encarregado de Dados appointed and contact published in Privacy Policy before BR launch.
3. DPAs executed with all sub-processors: Supabase, Anthropic, OpenAI, Google Gemini, DataForSEO/SerpAPI, Stripe, Resend, Railway, Upstash.
4. Perplexity DPA + SCC/DPF mechanism confirmed before EU user traffic is allowed to Perplexity; until then GEO-A3 routing gate must remain active.
5. LGPD transfer basis documented and Privacy Policy updated before BR natural-person users onboarded (GEO-D3).
6. DEV_AUTH_BYPASS verified disabled in production.
7. 90-day citation evidence purge job confirmed running in production.
8. check-rls.sql updated to include all GEO platform tables.
9. Breach notification procedure documented covering GDPR Art. 33 (72h), LGPD Art. 48 / ANPD Resolution CD/ANPD 02/2022 (2 business days for significant incidents), and US state-level requirements.
10. Provider ToS benchmarking clause review completed (all four LLM providers).

**Open conditions (address before or at Gate 7):**
- **GEO-D1** [HIGH]: Confirm EU routing configuration for OpenAI (Azure EU) and Google Gemini (Vertex AI EU) is active in production environment. If standard API endpoints are used for EU users, SCCs (Module 2) must be executed before EU launch. Owner: devops-engineer + legal. Due: Gate 7.
- **GEO-D2** [MEDIUM]: Review `citation_check.sources` field in production data. Confirm that stored values are limited to source URLs and citation metadata (no full LLM response text containing named individuals). If full response text is stored, implement a stripping/truncation step before persistence. Owner: backend-coder. Due: Gate 7.
- **GEO-D3** [MEDIUM]: Document LGPD international transfer basis for BR-to-US sub-processor data flows. Until ANPD publishes approved standard clauses, the preferred basis is specific highlighted consent in the Privacy Policy per Art. 33(IX), or confirm with external counsel whether ANPD guidance recognises an alternative mechanism. This does not block EU or US market launch. Owner: legal-privacy-officer + external counsel. Due: before BR user onboarding.

**Art. 36 supervisory authority consultation:** Not required under GDPR — residual risk is LOW to MEDIUM after mitigations; no irreducible high-risk finding remains. Art. 36 consultation would be required only if GEO-R9 (EU Art. 27 representative) or GEO-R4 (Perplexity routing gate) were to fail in production.

**ANPD RIPD equivalence:** This DPIA satisfies LGPD Art. 5(XVII) and ANPD Resolution CD/ANPD 02/2023 RIPD requirements. The RIPD mapping is embedded in this document: Section 1-GEO (processing description including LGPD bases), Section 2-GEO (necessity and proportionality including LGPD Art. 7 basis table), Section 5-GEO (security measures including LGPD Art. 46), and this section (risk assessment including LGPD Art. 48 breach notification). No separate RIPD document is required; this combined document is the RIPD. The ANPD may request it in the event of an incident or investigation.

---

## 10-GEO. LGPD RIPD Mapping Table

> LGPD Art. 5(XVII) defines "relatório de impacto à proteção de dados pessoais" (RIPD) as a "documentation by the controller on processing activities involving personal data potentially risky to data subjects." ANPD Resolution CD/ANPD 02/2023 specifies RIPD content requirements. This table maps RIPD requirements to the relevant sections of this combined DPIA/RIPD document.

| RIPD requirement (ANPD Resolution 02/2023) | Section in this document | Status |
|---|---|---|
| Description of data processing activities | Section 1-GEO | Covered |
| Legal basis for each processing activity | Section 2-GEO (LGPD Art. 7 table) | Covered |
| Categories of personal data processed | Section 1-GEO (data categories table) | Covered |
| Purposes of processing | Section 1-GEO (purposes list) | Covered |
| Sub-processors (operadores) and third parties | Section 1-GEO (sub-processors table) + Section 4-GEO | Covered |
| International transfer basis | Section 4-GEO (LGPD transfer analysis) | Covered — GEO-D3 open |
| Security measures (LGPD Art. 46) | Section 5-GEO | Covered |
| Data subject rights under LGPD Art. 18 | Section 3-GEO | Covered |
| Risk assessment and mitigation measures | Section 6-GEO | Covered |
| Encarregado de Dados contact | Gate 7 hard stop — to be inserted in Privacy Policy at appointment | Open |
| ANPD as supervisory authority | Gate 7 — Privacy Policy and DSR intake page | Open |

---

## Approval (GEO Platform)

- DPIA/RIPD author: legal-privacy-officer agent
- Gate: 3→4 (GEO platform DPIA)
- Date: 2026-06-09
- Jurisdictions covered: Brazil (LGPD RIPD), EU (GDPR Art. 35), US (CCPA/CPRA, FTC §5 — informing risk assessment)
- Reviewed by (human): _____ (required before EU/BR launch)
- Next mandatory review trigger: new LLM provider activation, new geographic market, >50% change in data volume/categories, or annual cycle (2027-06)
- **Update log**: 2026-07-09 — Controller / Processor Identity block (Section 1-GEO) corrected by legal-privacy-officer to align with the confirmed entity identity in `docs/compliance/ropa.md` (2026-07-08) and the live legal pages: Ozvor, Brazilian MEI, CNPJ 67.609.444/0001-08, registered office Rua José Borges Abrantes nº 1, Centro, Muriaé — MG, CEP 36.880-063, Brasil; regulator ANPD. This supersedes the prior "TrustIndex AI Ltda / CNPJ pending incorporation" statement in this section. No other DPIA content was changed. See gate-log.md 2026-07-09 entry for the ratifying verdict.
