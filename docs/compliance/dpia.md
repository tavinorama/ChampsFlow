# Data Protection Impact Assessment (DPIA)

> Owner: `legal-privacy-officer` · Gate 3→4 — 2026-05-02 · GDPR Art. 35
> Mandatory: high-risk processing confirmed at Gate 0→1 (large-scale OAuth token storage, automated AI processing, cross-border transfers).
> Update on every material change in processing operations.

---

## TL;DR

**Updated 2026-06-09 — GEO Platform (TrustIndex AI, Brazil Ltda) supersedes prior social-scheduling DPIA below.**

Ozvor (Brazilian MEI, CNPJ 67.609.444/0001-08; formerly referred to in this document as "TrustIndex AI (Brazil Ltda)" — see Section 1-GEO correction) is a GEO audit platform for SMBs. Jurisdictions: Brazil (LGPD RIPD, Section 10), EU (GDPR Art. 35), US (CCPA/CPRA, FTC §5). Data processed: customer account email, BYOK provider keys (AES-256-GCM), per-audit citation evidence (synthetic probe prompts, no personal data by design, purged 90 days), brand/domain data, Stripe billing identifiers. Data subjects: B2B customers and staff emails. High-risk processing confirmed on three GDPR Art. 35(3) triggers: (a) systematic large-scale processing of publicly available data; (b) innovative technology (multi-LLM audit mechanism); (c) cross-border transfers to multiple LLM providers. After mitigations — synthetic-only probe prompts (GEO-A2), EU/Perplexity routing gate (GEO-A3), AES-256-GCM BYOK key storage, forced RLS multi-tenant Postgres, append-only ai_generation_log (GEO-A6), GDPR Art. 27 EU representative required before EU user onboarding — residual risk is **LOW to MEDIUM**. Three open conditions remain: GEO-D1 (LLM provider EU routing confirmations), GEO-D2 (citation_check.sources incidental personal data review), GEO-D3 (LGPD international transfer basis). No GDPR Art. 36 or ANPD consultation required. Next mandatory review: before new LLM provider activation or EU/BR paid launch.

**2026-07-24 addendum**: Two new conditions (GEO-D4, GEO-D5) added via the ROPA update covering internal operations/marketing sub-processors (Postiz, HeyGen, n8n cloud, Google Workspace) — see new Section 12-GEO below. These do not change the residual risk finding.

**Update 2026-07-28**: A new Evidence Store category (raw engine responses linked to citation claims via signed URLs, 12-month retention, commercial-query-only) has been added under founder-approved Product Decision 4-A — see Section 11-GEO. This does NOT alter the existing 90-day purge for `citation_check` metadata (URLs/position/cited flag), which is a separate, already-closed data category (GEO-A2/GEO-D2) and remains unchanged.

**Update 2026-08-24**: Six production capabilities added to scope via new Section 13-GEO and the corresponding ROPA activities G21–G26: (1) AI Audit Stack $49 (buyer email + questionnaire answers, Stripe checkout, Resend delivery, explicit marketing opt-in, DSR-safe `ON DELETE SET NULL` lead linkage); (2) campaign attribution labels (six sanitized UTM/`from` keys, campaign identifiers not person identifiers); (3) Signal Engine consumption (public-source signals with per-source legal basis; NO tenant data outbound today — provisioning registered as planned processing, gated); (4) legacy video/social pipeline own-channel aggregate metrics; (5) Telegram approvals bot (founder's own decision text, internal-ops); (6) per-tenant API cost ledger (`api_spend.tenant_id`, no PII, erasure-safe by design). Two new risks (GEO-R14, GEO-R15) and four new conditions (GEO-D6 through GEO-D9, recorded in ropa.md). None of this changes the LOW-to-MEDIUM residual risk finding.

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
- Intake: public `/legal/dsr-request` form + `POST /api/dsr` (no login required). The historical `/privacy/dsr` path issues a permanent redirect to `/legal/dsr-request` (next.config.js) so previously-published portal links resolve.
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

> **Correção R5 — 2026-09-02 (append-only, 10.B.1):** a mitigação descrita em
> R5 ("Logical backups to S3 every 6 hours (different region); 4-hour
> restoration target") **NÃO existe e nunca existiu** — não há job de backup no
> repositório nem bucket S3 configurado (varredura 02/09). O estado real: a
> única proteção é o backup/PITR de plano da Supabase, cuja existência e
> retenção o founder ainda precisa VERIFICAR no dashboard (passos em
> `docs/runbooks/backup-restore.md`). Enquanto não verificado, a likelihood de
> R5 permanece M e o residual "Medium (4) — accepted" continua de pé, mas
> apoiado apenas na Supabase, não em backups próprios. A linha original da
> tabela acima fica intacta por convenção append-only; esta nota prevalece.

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

> **[Entity naming in this heading superseded]** — the confirmed controller is **Ozvor, Brazilian MEI, CNPJ 67.609.444/0001-08** (Section 1-GEO correction, 2026-07-09; ropa.md 2026-07-08). Heading preserved as dated history.

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
16. Evidence store — retaining full-text raw responses from AI search engines for commercial/buyer-category probe queries as an accountability record backing each citation claim in a delivered report, linked via short-lived signed URL (contract performance / legitimate interests). **Added 2026-07-28, Product Decision 4-A — see Section 11-GEO for the full assessment.**
17. AI Audit Stack $49 — one-time paid product: collect buyer email + business questionnaire answers, take payment via Stripe, deliver the recommendation by email (Resend) and tokenized URL; mint a `lead_capture` row with explicit marketing opt-in (contract performance; consent for marketing). **Added 2026-08-24 — see Section 13-GEO.**
18. Campaign attribution — record which campaign label (`?from=` / `utm_*`, sanitized) produced a lead or order (legitimate interests). **Added 2026-08-24 — see Section 13-GEO.**
19. Signal Engine consumption — read public-platform signals and an action queue from the founder-operated Signal Engine service; no tenant data sent today, tenant provisioning is planned future processing (legitimate interests). **Added 2026-08-24 — see Section 13-GEO.**
20. Per-tenant API cost attribution — `api_spend.tenant_id` for margin/billing analysis (legitimate interests). **Added 2026-08-24 — see Section 13-GEO.**

### Data Subjects

- **Primary**: Business customers (B2B) — SMB operators, their staff who access the platform; email addresses are account identifiers
- **Secondary (incidental, minimised)**: Named individuals appearing in LLM probe response snippets, SERP results, or public source profiles (competitor executives, Reddit post authors, Wikidata persons) — not collected purposefully; stored only as aggregate citation metrics where possible. **Also secondary (incidental, from 2026-07-28): named individuals appearing in the full-text raw commercial-query responses persisted to the Evidence Store (Section 11-GEO) — e.g., a professional or business owner recommended by an AI engine.**
- **Buyers/leads (from 2026-08-24)**: purchasers of the AI Audit Stack $49 and free-test leads — natural persons identified by email who are typically NOT platform account holders; their DSRs run against `lead_capture` / `ai_audit_order`, not the tenant erasure cascade (Section 13-GEO).

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
| Evidence store — raw engine response text (NEW 2026-07-28) | Full-text AI engine responses to commercial/buyer-category probe queries only; may incidentally name a real professional/business owner in a commercial-recommendation context; retained 12 months in a private Storage bucket, accessed only via short-lived signed URL | Medium (GDPR Art. 14 obligation; see Section 11-GEO) |
| AI Audit order + lead (NEW 2026-08-24) | Buyer email (CITEXT), questionnaire `answers` jsonb (business pains/niche/focus — business-level content keyed to the buyer's email, so the record is personal data of the buyer), order status/token, Stripe session ID, truncated IP, `marketing_consent` flag | Low |
| Campaign attribution labels (NEW 2026-08-24) | Six sanitized keys (`from` + five `utm_*`), ≤100 chars each, inside the lead/order jsonb; campaign identifiers chosen by the controller, not identifiers of the person; never logged | Low |
| Founder approval decisions (NEW 2026-08-24) | Founder's approve/reject decision + free-text rejection reason in `ops.agent_step.summary`; internal-ops content authored by the founder, no customer content | Low |
| Per-tenant cost attribution (NEW 2026-08-24) | Nullable `tenant_id` UUID on `api_spend` rows; account-level operational data linked to a business tenant; no PII, no FK (erasure-safe by design) | Low |

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
| Supabase Storage (evidence store, NEW 2026-07-28) | Full-text raw engine responses (commercial queries only), private bucket, signed-URL access | eu-central-1 (EU tenants, to be confirmed — EV-7) / us-east-1 (US/BR tenants) | Region-routing mirroring the existing Postgres split must be confirmed (EV-7, Section 11-GEO). DPA must be confirmed to cover Storage specifically, not only Postgres/Auth (EV-9). |
| Telegram Bot API (NEW 2026-08-24) | Internal approval content + founder decisions ONLY — no customer personal data permitted (GEO-D7 constraint) | Global (Telegram) | No standard DPA — terms review owed (GEO-D7, ropa.md). Internal-ops channel, not a product-data recipient. |
| Signal Engine — founder-operated service (NEW 2026-08-24) | TODAY: nothing outbound (read-only consumption of public-source signals). PLANNED: brand keywords + competitors + country at tenant provisioning — blocked until GEO-D8 closes | Railway-hosted, region TBC | Bearer-key API; written processing instruction owed before provisioning (GEO-D8, ropa.md). |

### Retention Periods

| Data category | Retention |
|---|---|
| Account data (email, auth UID) | Account life + 30-day grace, then hard delete |
| Brand and domain records | Account life + 30-day grace |
| Audit records (geo_audit, geo_score) | 12 months rolling (configurable), then aggregated summary only |
| Citation evidence (citation_check) | 90 days, then purged (GEO-A2 design intent) |
| Evidence store — raw engine response text (commercial queries only; Product Decision 4-A) | 12 months from generation, then hard delete (Storage lifecycle rule); targeted delete-by-evidence-id available before expiry on DSR request — see Section 11-GEO |
| ai_generation_log (hashes only) | 3 years (accountability obligation, GDPR Art. 5(2); LGPD Art. 37) |
| Content drafts (approved or discarded) | Account life + 30-day grace |
| Strategy plan tasks | Account life + 30-day grace |
| BYOK keys | Until key rotation or account deletion |
| Billing identifiers (Stripe IDs) | Account life; Stripe governs card data |
| DSR records | Closed_at + 30 days, then deleted |
| Audit log (compliance events) | 3 years |
| AI Audit order + lead_capture (NEW 2026-08-24) | Not yet set in code (no purge job; app role cannot DELETE orders) — retention policy owed under condition GEO-D6 (ropa.md); lead row erasable on DSR without breaking the paid order (`ON DELETE SET NULL`) |
| Campaign attribution labels (NEW 2026-08-24) | Same as host record (lead/order jsonb) — no separate store |
| Signal Engine signals (NEW 2026-08-24) | Redis cache ≤6h per endpoint/tenant; no persistent copy in Ozvor DB |
| api_spend ledger incl. tenant_id (NEW 2026-08-24) | Align to 3-year financial/accountability window; erased tenants leave an opaque orphaned UUID (no re-identification path) |

> **Note (2026-07-28)**: the Evidence Store row above is a NEW, separate data category (raw full-text model responses) added under founder-approved Product Decision 4-A. It does NOT alter the Citation evidence (`citation_check`) row's 90-day purge, which continues to cover only URLs/position/cited-flag metadata per GEO-A2/GEO-D2 and remains unchanged. See Section 11-GEO for the full assessment.

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
| Evidence store — raw engine response retention (NEW 2026-07-28) | Art. 6(1)(f) — legitimate interests | Controller's and customer's shared interest in auditable, tamper-evident evidence backing a paid report deliverable. Full LIA in Section 11-GEO. |
| AI Audit Stack $49 — order and delivery (NEW 2026-08-24) | Art. 6(1)(b) — contract | One-time purchase: email is necessary for checkout binding and delivery; answers are the input to the contracted deliverable |
| AI Audit Stack — marketing follow-up (NEW 2026-08-24) | Art. 6(1)(a) — consent | Explicit opt-in only (`marketing_consent === true`, never inferred from purchase) |
| Campaign attribution (NEW 2026-08-24) | Art. 6(1)(f) — legitimate interests | Marketing performance measurement with campaign-level labels; no person-level tracking identifiers; minimal impact on data subjects |
| Signal Engine consumption (NEW 2026-08-24) | Art. 6(1)(f) — legitimate interests | Market/visibility intelligence from public sources with per-source declared legal basis; no tenant data outbound today |
| Telegram approvals bot (NEW 2026-08-24) | Art. 6(1)(f) — legitimate interests | Internal operations; data subject is the founder (own decision text) |
| Per-tenant cost ledger (NEW 2026-08-24) | Art. 6(1)(f) — legitimate interests | Cost accounting/margin analysis for the controller's own service; tenant-level identifier only, no PII |

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
| Evidence store — raw engine response retention (NEW 2026-07-28) | Art. 7(IX) — legítimo interesse | Subject to LGPD Art. 10 balancing test; see Section 11-GEO |
| AI Audit Stack $49 — order and delivery (NEW 2026-08-24) | Art. 7(V) — execution of contract | |
| AI Audit Stack — marketing follow-up (NEW 2026-08-24) | Art. 7(I) — consentimento | Explicit opt-in, revocable (Art. 18(IX)) |
| Campaign attribution (NEW 2026-08-24) | Art. 7(IX) — legítimo interesse | Art. 10 balancing: campaign labels only, no person-level identifiers |
| Signal Engine consumption (NEW 2026-08-24) | Art. 7(IX) — legítimo interesse | Public-source data; Art. 7 §4 publicly-accessible-data treatment still requires purpose limitation and good faith |
| Telegram approvals bot (NEW 2026-08-24) | Art. 7(IX) — legítimo interesse | Internal operations; founder's own data |
| Per-tenant cost ledger (NEW 2026-08-24) | Art. 7(IX) — legítimo interesse | No PII; account-level cost accounting |

No LGPD Art. 11 sensitive data (dados sensíveis) identified: no health, racial, religious, biometric, genetic, sexual orientation, or political data processed.

### CCPA/CPRA Basis

All processing is for service delivery (business purpose under CCPA § 1798.140(e)). No sale or sharing of personal information for targeted advertising. BYOK keys are not "personal information" under CCPA when encrypted and used solely for the customer's own service delivery. The "Do Not Sell or Share" opt-out obligation applies from launch for California residents accessing the platform. The evidence store (Section 11-GEO) is likewise an internal business-purpose use (providing the contracted service; audit/security) and does not constitute a sale or share. **2026-08-24**: the AI Audit Stack, campaign attribution, Signal Engine consumption, Telegram bot, and per-tenant cost ledger are all business-purpose uses under § 1798.140(e); campaign attribution uses first-party campaign labels, not cross-context behavioral advertising identifiers, so no sale/share arises and no new opt-out obligation is created; marketing email to AI Audit buyers is a first-party communication sent only on explicit opt-in, with opt-out honored.

### Special-Category Basis (GDPR Art. 9)

Not applicable. No special-category data is intentionally processed. If LLM probe responses incidentally contain health, political, or religious content about named individuals at competitor brands, the data minimisation obligation (Art. 5(1)(c)) requires that such content not be stored or exported — only aggregate citation metrics are retained. The same principle applies to the evidence store (Section 11-GEO condition EV-3: pre-persistence content screen).

### Data Minimization Assessment (GDPR Art. 5(1)(c); LGPD Art. 6(III))

- **Probe prompts**: Synthetic category-level buyer queries contain client brand name only. Competitor names are detected in returned LLM responses, never injected into prompts sent to providers (GEO-A2 hard constraint confirmed in implementation). No personal data of any individual is included in probe texts.
- **Citation evidence**: Source URLs and position/cited flags only. No storage of full LLM response text beyond 90-day window. This minimises incidental personal data retention in LLM outputs.
- **Third-party personal data**: Named individuals in SERP snippets and off-site source results are not individually stored in the database. Off-site signal measurement records per-source presence/absence and weighted score only. The off-site signal module (packages/llm/offsite-signal.ts) stores source chips (present/absent) and aggregate score — not individual post author names or profile data.
- **BYOK keys**: Only ciphertext stored; presence-only API response; no plaintext ever returned or logged.
- **Competitor benchmark**: competitor_citation table stores mention_count and displacement_count per competitor entity, not named individuals at those competitors. The competitor-detect module uses word-boundary-safe name matching on returned text, not stored text of the full LLM response.
- **Evidence store (NEW 2026-07-28)**: minimisation is enforced by (a) a commercial-query-only write-gate (EV-1) — the evidence store never persists a response to any query type other than a buyer-category commercial probe; (b) no client PII in the object key (EV-2); (c) an automated pre-persistence content screen (EV-3) for high-risk incidental categories. Full detail in Section 11-GEO.

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
- **Right to object (Art. 21)**: Applies to processing on legitimate-interests basis (off-site signal measurement, competitor detection, and — as of 2026-07-28 — the evidence store). Object request must be assessed; if the objection is upheld, those processing activities cease for the customer's account (or, for evidence-store objections raised by a named THIRD PARTY rather than the account holder, the specific evidence object is deleted — see Section 11-GEO). Given B2B context, Art. 21 objections from account holders are expected to be rare; third-party evidence-erasure requests are a new, separate scenario (Section 11-GEO).
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
| Supabase Storage (evidence store, NEW 2026-07-28) | eu-central-1 for EU users — to be confirmed | No, if EU-bucket routing confirmed | No Art. 44 transfer, pending confirmation | CONDITION EV-7 (Section 11-GEO): region-routing for Storage has not yet been confirmed to mirror the Postgres EU/US-BR split. |

**BR users (Brazil → US/EU transfers under LGPD Arts. 33–36):**

LGPD international transfer requires one of: (a) transfer to country with adequate protection level recognised by ANPD; (b) ANPD-approved standard contractual clauses; (c) specific and highlighted consent; (d) binding corporate rules; (e) regulatory cooperation agreements. As of 2026-06, ANPD has not published a comprehensive adequacy list or approved standard contractual clauses that would provide a general LGPD SCC mechanism (the process was ongoing as of early 2025). This creates an open gap: in the absence of ANPD-approved clauses, the most practical LGPD basis for BR-to-US provider transfers is **Art. 33(IX) — specific consent from the data subject** or **Art. 33(II) — co-operation based on international instruments** where applicable.

**LGPD transfer condition (GEO-D3)**: Before Brazilian users' data is transferred to US-hosted sub-processors (Anthropic direct API, OpenAI standard API, Perplexity — if cleared, Stripe, SerpAPI), the LGPD transfer basis must be documented. Until ANPD publishes approved standard clauses, use: (a) specific highlighted consent disclosed in the Privacy Policy for each sub-processor transfer; or (b) verify whether current ANPD guidance recognises DPF or GDPR SCCs as an equivalent mechanism (this is an evolving area — external counsel review recommended). **This does not block the EU or US market launch, but must be resolved before Brazilian users who are natural persons (as opposed to the business entity itself) are onboarded onto the live SaaS platform.** The same GEO-D3 basis applies to any BR-tenant data flowing into the evidence store (Section 11-GEO) — no separate LGPD transfer condition is created by the evidence store; it inherits GEO-D3.

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
- **Evidence store technical controls (NEW 2026-07-28)**: private bucket ACL, short-TTL signed URLs, tenant-ownership check before signed-URL minting, no client PII in object key, targeted delete-by-evidence-id capability. Full detail and open conditions (EV-1 through EV-9) in Section 11-GEO.

### Organizational Measures

- **EU Art. 27 representative**: Required before EU users onboard. Not yet appointed. This is a Gate 7 hard stop.
- **Encarregado de Dados (LGPD Art. 41)**: Required. Must be appointed and contact published in Privacy Policy before BR launch. Can be same person as GDPR privacy contact.
- **Sub-processor DPAs**: All sub-processors in Section 1-GEO recipients table require executed DPAs before launch, including confirmation that the Supabase DPA explicitly covers Storage (EV-9, NEW 2026-07-28).
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
| GEO-R13 | Evidence store (raw engine responses, 12-month retention, Product Decision 4-A) contains incidental third-party personal data — named individuals (e.g. professionals, business owners) in commercial-query AI responses, retained in a private bucket for 12 months | M | M | 4 | Commercial-query-only write-gate (EV-1); no PII in object key (EV-2); pre-persistence content screen (EV-3); private bucket + short-TTL signed URLs (EV-4); tenant-ownership check on URL minting (EV-5); targeted delete-by-evidence-id DSR pathway (EV-6) — full detail in Section 11-GEO | Medium (4) — open until EV-1 through EV-6 close before the evidence-store slice ships to production |
| GEO-R14 | AI Audit lead/order data retained indefinitely — buyer emails and questionnaire answers accumulate with no purge (no retention set in code), and the $49 funnel is a cold-email destination, raising consent-hygiene stakes for the lead pool | M | M | 4 | Explicit opt-in only for marketing (never inferred from purchase); `ON DELETE SET NULL` decouples lead erasure from the paid order; truncated IP; PII-free logging (attribution values never logged); condition GEO-D6 requires a retention policy + purge job | Medium (4) — open until GEO-D6 closes; drops to Low once retention is enforced |
| GEO-R15 | Signal Engine provisioning drift — tenant brand keywords/competitors sent to the founder-operated service before the processing is registered and instruction-bounded, or a collector without a declared legal basis goes live | L | M | 2 | Provisioning is NOT live; client is read-only today; per-source `legal_basis` declared in the service; condition GEO-D8 gates activation on registration + written processing instruction + region confirmation | Low (2) — structural (no provisioning code path active) plus GEO-D8 gate |

**Overall residual risk (GEO platform): LOW to MEDIUM.** Three open conditions (GEO-D1 through GEO-D3) reduce to LOW once closed. Gate 7 hard stops (EU Art. 27 representative, Encarregado) are deployment prerequisites.

**Addendum (2026-07-28)**: GEO-R13 (Evidence Store) is newly added under Product Decision 4-A and does not change the LOW-to-MEDIUM overall characterization above; it carries its own Medium (4) residual pending closure of conditions EV-1 through EV-6 (Section 11-GEO), tracked separately from GEO-D1/D2/D3.

**Addendum (2026-08-24)**: GEO-R14 (AI Audit lead/order retention) and GEO-R15 (Signal Engine provisioning drift) are newly added — see Section 13-GEO. Neither changes the LOW-to-MEDIUM overall characterization; GEO-R14 is Medium (4) pending GEO-D6 (retention policy), GEO-R15 is Low (2) with the GEO-D8 gate. Conditions GEO-D6 through GEO-D9 are recorded in `ropa.md` (2026-08-24 section).

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

**Assessment for Ozvor (the controller)**:
1. Individual LLM probe query returns that mention a named executive or founder of a competitor brand: these are transient query results; citation_check stores source URLs and presence/position metadata, not the named individual's data. The name does not reach the persistent data layer except potentially in citation_check.sources. Condition GEO-D2 addresses this.
2. Off-site signal measurement (Reddit, Wikipedia, LinkedIn, G2, Trustpilot, Crunchbase, YouTube): stores per-source aggregate score only; no individual profiles or names stored. Art. 14 Art. 14(5)(b) exemption applies to this aggregate signal processing.
3. SERP query results for brand presence: individual author names or titles in SERP snippets may appear in raw query results but are not persisted in the data model; offsiteScore is computed and stored without underlying personal data. Minimisation is effective.
4. **Evidence store (NEW 2026-07-28)**: unlike (1)–(3), the evidence store DOES persist the full-text raw response, which may name a real individual. The Art. 14(5)(b) "publicly available source" limb (the LLM's training/retrieval corpus is broadly public-derived) provides a partial argument, but EDPB Opinion 6/2018's limit on indefinite retention is directly relevant to a 12-month store. Mitigations in Section 11-GEO (query-type gate, minimisation, deletion pathway) are the primary compliance posture rather than reliance on the Art. 14(5)(b) exemption alone.

**Overall Art. 14 assessment**: SUBSTANTIALLY COMPLIANT with data minimisation design for the pre-existing categories. GEO-D2 condition closes the residual gap in citation_check.sources. The evidence store (Section 11-GEO) is a materially higher-risk category than (1)–(3) and is assessed on its own terms rather than folded into the Art. 14(5)(b) exemption.

---

## 9-GEO. Conclusion (GEO Platform)

**Proceed with conditions.**

High-risk processing confirmed under GDPR Art. 35(1), EDPB Guidelines 4/2019 triggers 3 (systematic evaluation of publicly available personal data at scale) and trigger 8 (innovative technology), and LGPD Art. 5(XVII) RIPD trigger (data processing at scale with technological innovation). Mitigations are substantial. Residual risk is LOW to MEDIUM pending three open conditions.

**Gate 7 hard stops (must complete before EU/BR user onboarding):**
1. GDPR Art. 27 EU representative appointed and named in Privacy Policy before any EU user onboards.
2. LGPD Art. 41 Encarregado de Dados appointed and contact published in Privacy Policy before BR launch.
3. DPAs executed with all sub-processors: Supabase (incl. Storage — EV-9), Anthropic, OpenAI, Google Gemini, DataForSEO/SerpAPI, Stripe, Resend, Railway, Upstash.
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

**New evidence-store conditions (Product Decision 4-A, 2026-07-28) — see Section 11-GEO for full detail:**
- **EV-1** through **EV-9** — commercial-query-only write-gate, no-PII object keys, pre-persistence content screen, private bucket + short-TTL signed URLs, tenant-ownership check, targeted delete-by-evidence-id, Storage region-routing confirmation, third-party DSR procedure, Supabase Storage DPA coverage confirmation.

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

## 11-GEO. Product Decision 4-A — Evidence Store (Raw Engine Responses, 12-Month Retention) — 2026-07-28

> Founder-approved product decision (Decision 4-A, 2026-07-28): the AI Visibility Engine (B10) will persist the RAW, full-text responses returned by each AI search engine (ChatGPT/OpenAI, Claude/Anthropic, Gemini, Perplexity, Google AI Overview) as a distinct "evidence asset," retained for 12 months, with every citation claim in a client report deep-linking to the original generation via a short-lived signed URL served from a private Supabase Storage bucket. This is ADDITIVE to, and does NOT replace, the existing `citation_check` metadata (source URLs, cited flag, position) which remains on its 90-day purge cycle per GEO-A2/GEO-D2 (Section 1-GEO Retention Periods table; Section 2-GEO Data Minimization Assessment). The evidence store is a new, separate data category with its own purpose, basis, and safeguards, assessed below.

### Purpose and necessity

The evidence store's purpose is accountability and dispute-resolution: each claim in a delivered GEO report ("cited in position #2 by Claude") must be independently verifiable by the paying customer against the actual model output that produced it, for the full period the customer is reasonably expected to reference or dispute a report — a window materially longer than the prior 90-day operational cycle. Aligning the evidence window to the already-existing 12-month rolling retention applied to `geo_audit`/`geo_score` records (Section 1-GEO Retention Periods table) is a proportionate, internally-consistent choice: it does not extend retention beyond what the platform already keeps for the audit/score records the evidence supports.

### Lawful basis

- **GDPR Art. 6(1)(f) — legitimate interests.** Legitimate Interest Assessment (LIA):
  - *Purpose test*: PASS — evidence-backed reporting is a legitimate commercial/accountability purpose, consistent with the product's "measured, not fabricated" transparency stance (docs/system-transparency.md).
  - *Necessity test*: PASS, conditioned on the safeguards below — 12 months is necessary to cover a full reporting/renewal cycle; a shorter window would not support quarterly/annual dispute or audit needs.
  - *Balancing test*: The interests of any incidentally-named third party (e.g., a dentist or business owner named in a commercial-query answer) must be weighed against the controller/customer's evidentiary interest. Mitigating factors: (a) the content is a commercial opinion about a business/professional in a public buyer-research context, not private information about the individual's personal life; (b) the store is never public — private bucket, tenant-scoped, short-TTL signed URLs only; (c) a targeted deletion pathway is available on request. On balance, legitimate interest is sustainable SUBJECT TO the conditions in this section being implemented before the retention change ships to production.
- **LGPD Art. 7(IX) — legítimo interesse**, subject to the Art. 10 balancing test — same reasoning; ANPD may request this LIA documentation on request.
- **CCPA/CPRA**: internal business purpose (§ 1798.140(e) — providing the contracted service; audit/security). Not a "sale" or "share." No new opt-out obligation beyond the existing DNSS control (Section 3-GEO).
- **Special-category data (GDPR Art. 9)**: not intentionally processed. A professional's name in a commercial-recommendation context is ordinary personal data, not Art. 9 health/special-category data about that professional. Residual risk that a raw response incidentally surfaces sensitive context is addressed by the content-screen condition EV-3.

### Data minimization safeguards (founder-approved safeguards + new conditions)

1. **Commercial-query-only gate (EV-1)**: only responses to COMMERCIAL/buyer-category probe queries (e.g., "best dentist in Austin") are eligible for evidence-store persistence — never any query type carrying customer-supplied free text. Enforced at the same gateway chokepoint already used for GEO-A2/GEO-SEC-2, extended with a write-gate keyed on query type before any object is persisted.
2. **No PII in object key (EV-2)**: the Storage object key/path must be a non-identifying composite (tenant_id/audit_id/probe_id hash) — never a customer email, brand-owner name, or any personal identifier.
3. **Content screen before persistence (EV-3, NEW condition)**: raw natural-language model output is materially higher-risk than the existing URL/position/cited metadata. A lightweight automated pre-persistence screen must reject or flag responses containing high-risk patterns (government ID numbers, financial account numbers, explicit health/medical specifics unrelated to the "best provider" framing) before the object is written. Defensive control, not a full DLP system, given the commercial-query-only gate already limits exposure.
4. **Private bucket + short-TTL signed URLs (EV-4)**: bucket ACL private (no public read); signed URLs time-boxed to the shortest practical TTL for the report-viewing use case (recommend ≤15 minutes per view, minted on demand — not embedded as long-lived links in exported/emailed reports).
5. **Tenant-scoped access control (EV-5)**: the signed-URL minting endpoint must verify the requesting session's `tenant_id` owns the underlying `audit_id`/`brand_id` before issuing a URL — mirrors the existing forced-RLS tenant isolation pattern (Section 5-GEO) applied to the Storage layer, which is not natively RLS-covered like Postgres and needs an explicit application-layer check.

### Data subject rights — third-party evidence erasure (NEW, novel scenario)

The named individual in a raw engine response (e.g., the dentist) is typically not an Ozvor account holder and may have no email on file — this is a genuine **third-party DSR** scenario, distinct from the account-holder erasure cascade already documented in Section 3-GEO.

- **Intake**: the existing public `/legal/dsr-request` portal must accept a request from a non-customer who identifies the specific report/business/generation the request concerns (the requester cannot use email-OTP against an account they don't hold).
- **Identity verification**: email OTP is not available for non-account requesters. Recommend manual/admin-reviewed verification (reasonable link between the requester and the named individual/business) — this is an operational gap, not a legal determination; **recommend external counsel input** given the case-by-case judgment required (see novel-question flag below).
- **Fulfillment mechanism (EV-6, NEW backend requirement)**: a targeted, single-object deletion capability (delete-by-evidence-id) distinct from the full-account erasure cascade must exist, so a specific evidence blob can be removed without deleting the surrounding audit/score/report record. On deletion, the report's citation claim should degrade gracefully (e.g., "source evidence removed per data-subject request") rather than break the report.
- **Balancing outcome**: because the basis is Art. 6(1)(f) (not contract or legal obligation), an Art. 21(1) objection from the named third party generally prevails unless Ozvor can demonstrate compelling overriding legitimate grounds — expected to be rare for a single incidental evidence blob. Default operational posture: **honor deletion requests** for third-party evidence unless a specific, documented overriding interest exists.

### Cross-border transfer

Bucket region should mirror the existing tenant-routing pattern already applied to Postgres (EU tenants → eu-central-1; US/BR tenants → us-east-1) (Section 4-GEO). This has NOT yet been confirmed for Supabase Storage specifically (only the database region-split is confirmed) — flagged as condition EV-7 below.

### Risk register addition

See Section 6-GEO, new row GEO-R13.

### Open conditions (must close before the evidence-store slice ships to production)

- **EV-1** [HIGH]: commercial-query-only write-gate enforced at the gateway chokepoint before any object is persisted. Owner: backend-coder.
- **EV-2** [HIGH]: object key/path contains no client PII (hash-based composite key only). Owner: backend-coder / database-agent.
- **EV-3** [MEDIUM]: automated pre-persistence content screen for high-risk incidental PII (gov-ID, financial, explicit health specifics). Owner: backend-coder.
- **EV-4** [HIGH]: bucket private; signed URLs short-TTL (≤15 min recommended), minted on demand, not embedded as long-lived links. Owner: backend-coder / devops-engineer.
- **EV-5** [HIGH]: tenant-ownership check on the signed-URL minting endpoint (Storage is not natively RLS-covered like Postgres). Owner: backend-coder.
- **EV-6** [HIGH]: targeted delete-by-evidence-id endpoint + graceful report degradation on deletion, separate from the full-account erasure cascade. Owner: backend-coder.
- **EV-7** [MEDIUM]: confirm Supabase Storage bucket region-routing mirrors the existing Postgres EU/US-BR tenant split; document in Section 4-GEO sub-processor table. Owner: devops-engineer.
- **EV-8** [MEDIUM]: third-party (non-account-holder) DSR verification procedure for evidence-erasure requests — operational procedure, not yet designed. **Recommend external counsel review** given the novel balancing question (see below). Owner: legal-privacy-officer + external counsel.
- **EV-9** [LOW]: confirm the Supabase DPA / storage terms explicitly cover Storage (not only Postgres/Auth) — founder to confirm with Supabase account terms or request written confirmation. Owner: founder.

### Novel-question flag (not legal advice)

The third-party DSR-against-AI-evidence scenario (a non-customer natural person requesting deletion of a raw AI-generated commercial opinion about them, retained as evidence for a paying customer's audit) is a genuinely novel fact pattern without established regulatory guidance as of 2026-07. This assessment is legal-privacy-officer's best-effort application of GDPR Art. 6(1)(f)/17/21 and LGPD Art. 7(IX)/18 principles, not legal advice. **External counsel review is recommended** before EV-8 is finalized, particularly on: (a) whether the evidentiary/accountability interest can ever override a third party's erasure request, and (b) whether Brazilian and EU counsel would reach the same balancing outcome.

---

## 12-GEO. Sub-Processor Register Cross-Reference and Non-Product Processing (2026-07-24)

> Added by `legal-privacy-officer`. On 2026-07-24, `docs/compliance/ropa.md` was updated with a master Sub-Processor Register (SP-1–SP-14) and four new processing activities (G17–G20) covering internal operations/marketing tooling that had not previously been entered in the ROPA: Postiz (marketing social scheduling), HeyGen (AI marketing video), n8n cloud (internal workflow automation), and Google Workspace (Gmail/Drive). (Numbering note: these activities were drafted 2026-07-24 as G16–G19 and renumbered G17–G20 at merge, because Activity G16 was assigned to the Evidence Store — Product Decision 4-A, 2026-07-28 — in the interim. Section numbering note: this section was drafted as 11-GEO and renumbered 12-GEO for the same reason.)

**Effect on this DPIA's risk assessment**: None of G17–G20 touch the customer audit-data pipeline (probe prompts, citation evidence, GEO Score, content drafts, DSR/billing data) assessed in Sections 1-GEO through 9-GEO above. G17 (Postiz) and G18 (HeyGen) process Ozvor's own marketing output and, for HeyGen, the founder's own likeness/voice as data subject — no third-party or customer personal data is implicated. G20 (Google Workspace) may carry customer-derived personal data if support correspondence flows through Gmail; this is a low-volume, low-technology-risk channel (ordinary business email) and does not meet the Art. 35(1) high-risk threshold on its own. G19 (n8n cloud) is the one activity requiring a forward-looking constraint: **until a workflow-level data inventory is produced (ROPA condition GEO-D4), no customer-derived personal data may be configured to flow through n8n workflows.** This is a preventive constraint, not evidence of a current violation — as of this update, n8n's actual workflow content has not been audited.

**Conclusion**: This update does not change the overall residual risk finding of Section 9-GEO (LOW to MEDIUM). No re-triggering of the Art. 35(1) DPIA threshold occurs from G17–G20; they are ordinary business-operations processing, not systematic, large-scale, or innovative-technology processing of the kind that triggered this DPIA for the GEO platform itself. GEO-D4 is tracked as an open condition in `ropa.md` and should be verified closed before any customer-support or CRM data source is connected to n8n. GEO-D5 (HeyGen) is informational only — no action required.

---

## 13-GEO. Growth Products, Attribution & Ops Telemetry Addendum — 2026-08-24

> Added by `legal-privacy-officer`. Six capabilities shipped to production since the 2026-07-28 update, all verified in code (apps/api/src/routes/ai-audit.ts + billing.ts webhook branch, apps/api/src/lib/campaign-attribution.ts, packages/llm/src/signal-engine.ts + docs/signal-engine-integration.md, migrations 20260815000002_ai_audit_order and 20260817000001_api_spend_tenant). ROPA activities G21–G26 and Sub-Processor Register rows SP-15–SP-18 record the same capabilities; conditions GEO-D6 through GEO-D9 live in `ropa.md`. Each assessment below covers purpose, basis (GDPR Art. 6 + LGPD Art. 7 explicit), data categories, sub-processors, retention/erasure, and the CCPA posture, per the house rule that every compliance artifact addresses Brazil + EU + US.

### 13.1 AI Audit Stack $49 (ROPA G21; risk GEO-R14)

- **Purpose**: sell and deliver a one-time $49 AI-stack recommendation. Buyer submits email (mandatory) + a business questionnaire; payment via Stripe Checkout; on `checkout.session.completed` the order is marked paid and the deliverable email is sent via Resend; delivery also available at the tokenized URL `/ai-audit/:token`.
- **Basis**: GDPR Art. 6(1)(b) / LGPD Art. 7(V) for order + delivery. Marketing follow-up: GDPR Art. 6(1)(a) / LGPD Art. 7(I) — the code records `marketing_consent = true` only on an explicit affirmative (`body["marketing_consent"] === true`, "explicit opt-in only, never inferred" per the in-code comment); purchase alone triggers only the contracted delivery and the post-purchase `ai_audit_to_full` sequence tied to the offer presented at checkout.
- **Data**: buyer email (CITEXT), `answers` jsonb (pains/niche/focus/engines/tools — content is about the BUSINESS, but the row is keyed to the buyer's email so the record as a whole is personal data of the buyer; where the business is a sole proprietor/MEI the answers may describe the person's professional situation — no Art. 9 / LGPD Art. 11 data is solicited), status, unguessable `order_token`, Stripe session ID (UNIQUE partial index — one paid session unlocks at most one order), deliverable jsonb, truncated IP on the lead row, `marketing_consent` flag.
- **Sub-processors**: Stripe (SP-3, accepted), Resend (SP-4, accepted), Supabase (SP-1, accepted) — all already registered; no new sub-processor is introduced by this capability.
- **Retention/erasure**: `lead_capture_id` is `ON DELETE SET NULL`, so DSR erasure of the lead never breaks or blocks the paid order — deliberate erasure-safe design. The order table itself has NO purge in code and the app role cannot DELETE — retention policy is owed (GEO-D6); interim DSR posture: pseudonymize the buyer email on the order row (hash-replace, Art. 17(3)(e) reasoning) while the transactional record stands.
- **CCPA**: business-purpose processing (§ 1798.140(e)); no sale or share; marketing email is first-party, opt-in, opt-out honored.
- **Security posture** (inherited, verified in migration): FORCE RLS, `service_only` policy, tenant-claimed read only, PostgREST `anon`/`authenticated` revoked, identity-claim continuity (`claimed_by_tenant_id`).

### 13.2 Campaign Attribution (#513; ROPA G22)

- **Purpose**: attribute leads/orders to outreach campaigns (`ozvor.com/test?from=cold-atlanta-01` and `utm_*`).
- **Basis**: GDPR Art. 6(1)(f) / LGPD Art. 7(IX). LIA in brief: purpose (marketing measurement) legitimate; necessity satisfied by the minimal six-key design; balancing favorable because the stored values are campaign identifiers CHOSEN BY THE CONTROLLER, not identifiers of the person — no click IDs, no fingerprints, no cross-site identifiers, no person-level enrichment.
- **Minimization (verified in `campaign-attribution.ts`, the single gate between the untrusted body field and the jsonb column)**: only six known keys survive (`from`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`); string-typed, trimmed, truncated to 100 chars; empty result → nothing written; values arrive from a URL so they are never logged (loggers record key names/counts only — PII-free log rule).
- **Retention/erasure**: rides inside `lead_capture.result` / `ai_audit_order.answers` — no separate store; follows the host record's lifecycle and erasure.
- **CCPA**: first-party analytics; not cross-context behavioral advertising; no sale/share, no new opt-out obligation.

### 13.3 Signal Engine (ROPA G23; SP-16; risk GEO-R15)

- **Purpose**: consume REAL public-platform conversations and a "where to act" queue (SEO/GEO/PPC) from the founder-operated Signal Engine service (reddit-signal-infrastructure — separate FastAPI service on Railway, coupled as a SERVICE, never re-implemented here).
- **Basis**: GDPR Art. 6(1)(f) / LGPD Art. 7(IX) for consuming public-source signals. The service itself declares a `legal_basis` per source (official_api — e.g. Reddit official API — / licensed_provider / reseller_api / third_party_scraper with provenance label), and Ozvor renders that provenance; sources without a licensed path are not shown ("ainda não coletamos Meta"). LGPD note: Art. 7 §4 treatment of publicly accessible data still binds processing to purpose limitation and good faith — satisfied by the visibility-intelligence purpose and evidence-URL discipline.
- **Data boundary (the key finding)**: **no Ozvor tenant or customer data is sent to the Signal Engine today** — the TS client (`packages/llm/src/signal-engine.ts`) is read-only consumption over a bearer key, fail-open, never logs the bearer. Third-party personal data (public post authors) transits as evidence URLs/quotes, cached ≤6h in Redis, with no persistent copy in Ozvor's DB — the Art. 14(5)(b) aggregate/minimized reasoning of Section 8-GEO items (2)–(3) applies.
- **Planned future processing (registered now, not live)**: per-brand tenant provisioning (`POST /tenants`) would send brand keywords + competitor names + country, with the tenant key stored encrypted in `provider_keys`. Gated by GEO-D8: before activation — update the ROPA to live, confirm the per-source legal-basis register, put a written processing instruction in place (founder-operated but separate infrastructure ⇒ instruction-boundary documentation is owed even intra-controller), confirm hosting region.
- **CCPA**: business-purpose; public-source data; no sale/share.

### 13.4 Legacy Video/Social Pipeline (VPS) (ROPA G24; SP-11/SP-17/SP-18)

- **Purpose**: publish Ozvor's OWN marketing video/social content (HeyGen→Remotion render → Postiz to IG/TikTok/YouTube → Notion archive) and harvest aggregate engagement metrics of Ozvor's OWN channels (`ozvor-social-harvest.mjs`).
- **Basis**: GDPR Art. 6(1)(f) / LGPD Art. 7(IX) (controller's own marketing). Founder likeness in the video output is already assessed under G18/GEO-D5 (founder is both controller and data subject; no Art. 9 issue).
- **Data**: channel-level aggregate metrics only (views, likes, counts) — **no PII of viewers/commenters is collected by the harvest by design**; render/publish metadata archived in Notion; Pexels supplies stock media (nothing personal outbound). VPS retains no accumulated media (publish → register in Notion → delete local).
- **Sub-processors**: Postiz (SP-11, already registered, still NOT ASSESSED), Pexels (SP-17, new — no personal data shared, low priority), Notion (SP-18, new — internal-ops metadata; constraint: no customer personal data into pipeline pages until assessed). All three sit in the second-wave DPA review (GEO-D9 with SP-11–SP-13).
- **CCPA**: not applicable in substance — no consumer personal information is collected or shared by this activity.

### 13.5 Telegram Approvals Bot (ROPA G25; SP-15)

- **Purpose**: route internal content/deployment approvals to the founder on Telegram; persist the decision and, on rejection, the founder's free-text reason in `ops.agent_step.summary`.
- **Basis**: GDPR Art. 6(1)(f) / LGPD Art. 7(IX) — internal operations. The stored text is authored by the FOUNDER about internal work product, not customer content; the primary data subject is the founder himself (his decision text and Telegram chat/user ID).
- **Recipients**: Telegram Bot API (SP-15) — global infrastructure, no standard enterprise DPA. Standing constraint (GEO-D7): approval payloads carry internal content and founder decisions ONLY — no customer emails, no lead content, no customer personal data in Telegram messages; terms review owed in the second wave.
- **Retention**: `ops.agent_step` follows the append-only ops-log posture; Telegram-side messages per Telegram's own retention.
- **CCPA**: internal-ops; no consumer personal information.

### 13.6 Per-Tenant API Cost Ledger (`api_spend.tenant_id`) (ROPA G26)

- **Purpose**: attribute API/LLM spend to the tenant it was incurred for — per-plan margin analysis and cost alerts (billing/margin finality).
- **Basis**: GDPR Art. 6(1)(f) / LGPD Art. 7(IX) — cost accounting for the controller's own service. Account-level operational data linked to a business tenant; the ledger holds op/engine/tokens/cents plus a nullable `tenant_id` UUID — **no PII** (verified in migration 20260817000001).
- **Erasure-safe by design**: deliberately NO foreign key — a tenant erased under GDPR Art. 17 / LGPD Art. 18(IV) neither cascades into nor is blocked by the cost ledger; the UUID remains as an opaque, orphaned attribution key with no re-identification path once the tenant row is gone (effective anonymization post-erasure).
- **Retention**: align to the 3-year financial/accountability window already used for the audit log; flagged for inclusion in the GEO-D6 retention-policy pass.
- **CCPA**: internal business purpose; no sale/share.

### Conditions issued by this addendum (recorded in ropa.md, 2026-08-24 section)

- **GEO-D6** [MEDIUM]: retention/purge policy for `ai_audit_order` + `lead_capture` (none in code today); include the `api_spend` ledger window in the same pass. Owner: founder + backend-coder.
- **GEO-D7** [LOW]: Telegram Bot API terms review; constraint active meanwhile — no customer personal data in approval payloads. Owner: legal-privacy-officer.
- **GEO-D8** [MEDIUM]: Signal Engine tenant provisioning gate — ROPA update to live + legal-basis register confirmation + written processing instruction + region confirmation BEFORE the first provisioning call. Owner: founder + legal-privacy-officer.
- **GEO-D9** [LOW]: Pexels/Notion (with Postiz SP-11) data-processing terms + regions — second-wave DPA review. Owner: founder.

**Effect on the DPIA**: none of 13.1–13.6 re-triggers the Art. 35(1) high-risk threshold on its own (no new large-scale systematic monitoring, no new innovative-technology category; the AI Audit questionnaire is a low-volume, low-sensitivity funnel). Overall residual risk remains **LOW to MEDIUM** (Section 9-GEO unchanged). Gaps requiring a founder decision: the GEO-D6 retention policy, the GEO-D8 provisioning instruction, and the SP-15–SP-18 terms reviews (GEO-D7/D9).

---

## 14-GEO. Cold Outreach & Prospecting Addendum — 2026-09-02

> Added by `legal-privacy-officer` (02/09 sweep; ROPA G27–G30, SP-19–SP-21). The sales motion shipped in PRs #547 (prospect-batch) and #561 (follow-up) processes prospect personal data outside the customer-facing product for the first time. Risks and mitigations below; the LIA for the legitimate-interests basis is recorded in ROPA G27.

### 14.1 New risks

| # | Risk | Likelihood | Impact | Mitigation | Residual |
|---|---|---|---|---|---|
| GEO-R16 | **Cold e-mail without CAN-SPAM postal address** — outreach footers carry the opt-out line but no physical postal address (§5(a)(5)) | Medium (enforcement against low-volume senders is rare but real) | Medium (FTC penalties are per-e-mail in theory) | Opt-out line mandatory + honored immediately; low initial volume; **founder-accepted risk recorded 2026-09-02** in `docs/departments/sales/sop-dia-do-disparo.md` §7 with a named closing action (founder supplies address → replace `{{POSTAL_ADDRESS}}` everywhere) and a re-review trigger (~5k e-mails/month) | MEDIUM — accepted, time-boxed |
| GEO-R17 | **Reply text is free text** — a prospect's reply can contain anything (health details, personal grievances); it is stored in SmartLead (SP-19) and `smartlead_event`, and processed by LLM engines | Medium | Medium | Engine chain restricted to claude/codex (registered processors; kimi leg removed — no DPA existed); Telegram gate receives a **masked summary only** (no raw reply text/e-mail — closes the 10.D.4 GEO-D7 violation); retention rule owed on `smartlead_event` (10.B.11, target 12 months) | LOW-MEDIUM |
| GEO-R18 | **Scope creep beyond US** — the US-only geofence lives in the graph prompt, not code; an EU/BR natural person cold-e-mailed without consent would breach ePrivacy/GDPR/LGPD marketing rules | Low today (engine-suggested lists are US-seeded; volumes small) | High if it happens (consent-based regimes) | Condition GEO-D10: code-level geofence gating CRM writes before Apify (SP-20) activation; LIA re-run required before any deliberate EU/BR expansion | LOW (with GEO-D10 closed) |
| GEO-R19 | **Indefinite recycling = indefinite retention** | Medium | Medium | G29 hard rule (3 cycles or 12 months → erase; STOP suppressed forever); purge job pending in code — manual purge by the founder with each recycling CSV until it ships | LOW-MEDIUM (until the job ships) |

### 14.2 DSR posture

`crm_contact` and `smartlead_event` enter the DSR export/erasure scope (keyed by e-mail). An erasure request from a prospect = same-day suppression + row erasure; the dossier note dies with the contact row. Cascade code extension owed (backend-coder).

**Effect on the overall DPIA**: none of 14.1 re-triggers the Art. 35(1) high-risk threshold (no large-scale monitoring; B2B contact data at small volume). Overall residual risk remains **LOW to MEDIUM**, conditional on GEO-D10, the G29 purge job, and the SP-19/SP-20 terms reviews.

---

## Approval (GEO Platform)

- DPIA/RIPD author: legal-privacy-officer agent
- Gate: 3→4 (GEO platform DPIA)
- Date: 2026-06-09
- Jurisdictions covered: Brazil (LGPD RIPD), EU (GDPR Art. 35), US (CCPA/CPRA, FTC §5 — informing risk assessment)
- Reviewed by (human): _____ (required before EU/BR launch)
- Next mandatory review trigger: new LLM provider activation, new geographic market, >50% change in data volume/categories, or annual cycle (2027-06)
- **Update log**: 2026-09-02 — new Section 14-GEO added (Cold Outreach & Prospecting: prospect-batch #547, follow-up #561, recycling, dossier). New risks GEO-R16–GEO-R19 (CAN-SPAM postal-address accepted risk; free-text replies; US-geofence-in-prompt-only; recycling retention). Companion ROPA section (G27–G30, SP-19–SP-21) added same day; gate-log council entries for #547/#561 appended same day. Overall residual risk unchanged (LOW to MEDIUM).
- **Update log**: 2026-08-24 — new Section 13-GEO added (Growth Products, Attribution & Ops Telemetry: AI Audit Stack $49, campaign attribution, Signal Engine consumption, legacy video/social pipeline, Telegram approvals bot, per-tenant API cost ledger). Incremental updates: Processing Purposes 17–20, Data Subjects (buyers/leads), Personal Data Categories table (+4 rows), Recipients table (+2 rows: Telegram, Signal Engine), Retention Periods table (+4 rows) — all Section 1-GEO; GDPR Art. 6 and LGPD Art. 7 lawful-basis tables and CCPA paragraph — Section 2-GEO; Risk Assessment — Section 6-GEO, new rows GEO-R14/GEO-R15 + addendum. TL;DR addendum appended. Four new conditions (GEO-D6 through GEO-D9), recorded in `ropa.md` alongside new activities G21–G26 and sub-processor rows SP-15–SP-18. Overall residual risk unchanged (LOW to MEDIUM). No gate-log verdict exists yet for this update.
- **Update log**: 2026-07-28 — new Section 11-GEO added (Evidence Store — raw engine responses, 12-month retention, Product Decision 4-A, founder-approved); Retention Periods table (Section 1-GEO), Personal Data Categories table (Section 1-GEO), Sub-Processors table (Section 1-GEO), Processing Purposes list (Section 1-GEO), Lawful Basis tables (Section 2-GEO), Data Minimization Assessment (Section 2-GEO), DSR design (Section 3-GEO), Art. 44-46 assessment (Section 4-GEO), Security Measures (Section 5-GEO), Risk Assessment table (Section 6-GEO, new row GEO-R13), and Art. 14 assessment (Section 8-GEO) all updated with cross-references. TL;DR addendum appended. Nine new conditions issued (EV-1 through EV-9); EV-8 flagged for external counsel review as a novel question. This does NOT alter the existing 90-day citation_check purge (GEO-A2/GEO-D2), which is unchanged. Gate verdict: see gate-log.md 2026-07-28 entry.
- **Update log**: 2026-07-24 (merged via PR #404) — added Section 12-GEO (sub-processor register cross-reference and non-product processing: Postiz, HeyGen, n8n cloud, Google Workspace; drafted 2026-07-24 as Section 11-GEO and renumbered 12-GEO at merge because 11-GEO was assigned to the Evidence Store on 2026-07-28); TL;DR addendum appended. No change to the residual risk finding in Section 9-GEO. **No Gate 7 verdict has been logged for this update** — `docs/compliance/gate-log.md` has no 2026-07-24 entry. The two still-open Gate 7 hard stops (EU Art. 27 representative, LGPD Encarregado) and the finding that the live Privacy Policy overstates their appointment status are recorded in `docs/compliance/ropa.md` under "Appointment Records". A Gate 7 review of these additions, and the resulting gate-log entry, are still owed.
- **Update log**: 2026-07-10 — brand/entity naming alignment in the live Section B (TL;DR sentence, Art. 14 assessment heading) and a superseded-marker under the Section B heading, per issue #213. Substantive DPIA content unchanged; the controlling identity statement remains the Section 1-GEO block (2026-07-09).
- **Update log**: 2026-07-09 — Controller / Processor Identity block (Section 1-GEO) corrected by legal-privacy-officer to align with the confirmed entity identity in `docs/compliance/ropa.md` (2026-07-08) and the live legal pages: Ozvor, Brazilian MEI, CNPJ 67.609.444/0001-08, registered office Rua José Borges Abrantes nº 1, Centro, Muriaé — MG, CEP 36.880-063, Brasil; regulator ANPD. This supersedes the prior "TrustIndex AI Ltda / CNPJ pending incorporation" statement in this section. No other DPIA content was changed. See gate-log.md 2026-07-09 entry for the ratifying verdict.
