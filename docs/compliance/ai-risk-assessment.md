# AI Risk Assessment — Ozvor (GEO platform; formerly "Organic Posts" / "TrustIndex AI")

> **Entity/brand note (2026-07-10, issue #213):** the operating entity is **Ozvor — Brazilian MEI, CNPJ 67.609.444/0001-08** (see `docs/compliance/ropa.md`, 2026-07-08). "Organic Posts" references in the archived v1 sections below are historical (pre-pivot product under the abandoned Portugal-entity plan) and are preserved unedited per the append-only convention — do not treat them as current.

> Owner: `ai-ethics-reviewer` · Created Gate 2→3 (2026-05-02) · Update at Gate 3→4 and Gate 6→7
> Living document — append sections; never rewrite historical entries.

---

## TL;DR

Organic Posts v1 contains one AI feature: C1 AI Post Generation (LLM-based text generation, provider TBD). EU AI Act classification is **limited-risk** under Art. 50 — not prohibited, not high-risk (Annex III). Mandatory transparency obligation applies; C5 AI Disclosure Badge satisfies Art. 50 as specified in PRD. Colorado AI Act SB 24-205 does **not** apply — social media post generation is not a "consequential decision" under the Act's enumerated categories. No US sectoral AI law exposure (not employment, housing, credit, education, or health). GPAI deployer obligations apply when provider is selected at Gate 3→4: must verify provider's GPAI compliance tier and data-use terms. Human oversight is structurally satisfied by draft-and-confirm architecture; three internal gaps require architectural resolution. Bias evaluation is low-priority but a baseline content-quality fairness check is required before Gate 6→7. No model card is required at this gate; model card due at Gate 6→7 per workflow.

**PIVOT NOTE (2026-05-18):** The above TL;DR applies to the archived Organic Posts v1 social-scheduling product (Gate 2→3 through Gate 6→7 verdicts 2026-05-02 to 2026-05-11). The product pivoted to a GEO / AI-Visibility Platform on 2026-05-29. The new Gate 2→3 classification for the GEO platform is appended below. The GEO platform's overall risk tier is **LIMITED-RISK (Art. 50)** — not high-risk, not prohibited — with materially elevated Art. 50 obligations and ethics-specific risks around citation/ranking influence, astroturfing, hallucination in audit outputs, and fairness. Six AI features inventoried; all require Art. 50 transparency labelling; content generation and citation sentiment features require additional human-in-the-loop controls. Colorado AI Act SB 24-205 re-confirmed not applicable. GPAI deployer obligations apply to all five LLM provider relationships. August 2026 Art. 50 full-applicability deadline is a live compliance deadline.

---

## Gate 2→3 — 2026-05-02

### AI Feature Inventory

| # | Feature | AI component | Inputs | Outputs | Human in loop |
|---|---|---|---|---|---|
| 1 | C1 — AI Post Generation | LLM text generation (provider TBD at Gate 3→4) | User-supplied topic / URL; platform target (LinkedIn or Instagram); neutral SMB default tone | Text draft: LinkedIn (150–300 chars) or Instagram caption + hashtag block | Yes — mandatory draft-and-confirm; no publish path bypasses user "Approve & Schedule" action |
| 2 | C5 — AI Disclosure Badge | None — UI compliance control | N/A | Persistent badge on review screen and post list | N/A — not an AI feature; the disclosure mechanism for Feature 1 |

---

### EU AI Act Risk Classification

**Feature: C1 — AI Post Generation**

**Classification: Limited-risk — Art. 50 (transparency obligation only)**

Reasoning:

1. Prohibited practices (Art. 5) — NOT applicable. The feature does not deploy subliminal manipulation techniques, social scoring, real-time remote biometric identification, emotion recognition in workplace or education contexts, or any other enumerated prohibited practice. The output is marketing copy that a human must review and explicitly approve before any downstream use. No concern.

2. High-risk (Annex III) — NOT applicable. Annex III categories are: biometric identification/categorisation, critical infrastructure management, education/vocational training, employment/worker management, essential private and public services (credit, social benefits, emergency services), law enforcement, migration/asylum, administration of justice, democratic processes. Social media post generation for SMB marketing falls in none of these categories. The feature does not make or meaningfully influence decisions about natural persons in any Annex III domain.

3. Limited-risk (Art. 50) — **CONFIRMED applicable.** Art. 50(2) and Art. 50(4) require that deployers of AI systems that generate synthetic content (text, audio, image, video) for public dissemination ensure outputs are marked as AI-generated in a machine-readable format, and that users are informed the content is AI-generated. This obligation is triggered because: (a) the LLM generates text, (b) the text is intended for publication on social platforms (public dissemination), and (c) a deployer (Organic Posts) is placing the AI system into service for third parties (SMBs).

   C5 AI Disclosure Badge satisfies the user-facing Art. 50 obligation as follows:
   - Badge is non-dismissable and visible pre-approval and in the scheduled post list (Art. 50 requires disclosure prior to dissemination — satisfied).
   - Badge text is explicit ("AI-generated draft" / "AI-generated content — reviewed by [user]").
   - Badge cannot be removed by user action or account setting.
   - Badge is WCAG 2.1 AA contrast compliant.
   - Badge does not appear on purely manual content (no false positives).

   Residual gap: Art. 50(4) also requires machine-readable marking of synthetic content where technically feasible. The PRD specifies a visual badge (human-readable) and a database flag (`ai_generated` per post in data inventory). The machine-readable requirement must be confirmed by the system-architect at Gate 3→4 — the database flag is likely sufficient for internal purposes but the requirement may extend to metadata embedded in any exported content. Flag as Gate 3→4 condition (LOW).

4. Minimal-risk — Not applicable; Art. 50 obligations place the feature in the limited-risk tier.

**GPAI Deployer Obligations (Title VIII)**

Organic Posts is a **deployer** (not a provider) of a foundation model. The GPAI obligations (documentation, training data transparency, copyright compliance) fall primarily on the LLM provider. However, as deployer, Organic Posts must:

- Operate within the GPAI provider's terms of use and intended use parameters.
- If the selected GPAI model is classified as "systemic risk" (trained on compute exceeding 10^25 FLOPs — currently GPT-4-class and above), the provider carries enhanced obligations, but Organic Posts must not deploy such a model in a manner that circumvents provider safety measures.
- Obtain and review the provider's GPAI technical documentation (Art. 53) at Gate 3→4 when the provider is selected.
- Confirm the provider's data-use terms do not retain inference inputs for training purposes without user consent (carries forward as Gate 3→4 condition from legal-privacy-officer).

Provider selection deferred to Gate 3→4 (system-architect). Deployer obligation checklist must be completed at that gate.

---

### Colorado AI Act SB 24-205 — Applicability Determination

**Determination: NOT APPLICABLE to Organic Posts v1**

Effective date: 2026-02-01. The Act applies to "high-risk AI systems" used in making or substantially assisting "consequential decisions" about Colorado consumers. "Consequential decision" is defined as a decision that has a significant effect on a consumer's access to, or the terms of, the following: education enrollment/opportunities, employment/employment opportunities, financial/lending services, essential government services, healthcare services, housing, insurance, or legal services.

Analysis:
- Organic Posts v1 generates text drafts for LinkedIn and Instagram posts on behalf of SMBs. The AI output is marketing copy reviewed by the SMB user before publication.
- The AI does not make or assist decisions about any individual consumer's access to education, employment, credit, housing, healthcare, insurance, or government services.
- The SMB user (not a Colorado consumer acting as a data subject in the Act's protective sense) interacts with the AI as a business tool.
- The published social media posts are marketing communications, not consequential decisions within the Act's scope.

**Conclusion**: Social media post generation is not a "consequential decision" under SB 24-205. The Act's high-risk AI system framework does not apply. This determination is documented as the formal compliance determination required by Gate 0→1 condition #7.

Caveat for future phases: If v1.1 introduces AI features that evaluate or score users (e.g., audience targeting recommendations, content performance scoring with hiring/promotion implications for agency staff), re-run this determination at the relevant gate.

---

### US Sectoral AI Law Exposure

| Sector | Applicable law | Exposure | Assessment |
|---|---|---|---|
| Employment / hiring | EEOC guidance; NYC LL 144; IL AI Video; CO AI Act | None | Organic Posts does not evaluate candidates or workers. Not an AEDT. |
| Housing | FHA; HUD AI guidance | None | No housing decisions. |
| Credit / lending | ECOA; FCRA; adverse action | None | No credit decisions. |
| Education | FERPA; state student privacy | None | No student data. |
| Health | HIPAA; FDA SaMD | None | No health data or diagnostic function. |
| Consumer-facing (general) | FTC §5; CO AI Act (above) | Limited | FTC §5 disclosure obligation satisfied by C5 badge. CO AI Act not triggered. |
| California AI transparency | CA SB-942 | Monitor | SB-942 (effective 2026-01-01) requires large AI providers to disclose training data provenance. Applies to the LLM provider, not to Organic Posts as deployer. Confirm at Gate 3→4 that selected provider is SB-942 compliant. |

No US sectoral AI law creates a compliance obligation for Organic Posts v1 beyond Art. 50 transparency (addressed by C5) and FTC §5 (addressed by C5 + draft-and-confirm architecture).

---

### NIST AI RMF Mapping (AI RMF 1.0)

The NIST AI RMF four functions map to pipeline phases as follows. Items marked [OPEN] require action at the specified gate.

**GOVERN**
- AI risk policy: The draft-and-confirm architecture is the product-level governance decision that constrains AI risk. Document as organizational AI use policy before Gate 7. [Gate 7]
- Roles and accountability: ai-ethics-reviewer owns this artifact; product-manager owns deployment decisions; system-architect owns inference pipeline. Accountability map to be formalized at Gate 3→4. [Gate 3→4]
- Incident response for AI-specific harms: No AI harm incident logging procedure defined. Required before Gate 7. [Gate 7 — HIGH]

**MAP**
- Context and use-case documentation: Completed here. Feature C1 purpose, inputs, outputs, and human-oversight model documented.
- Stakeholder impact: SMB users are primary; their social media audiences are indirect. No vulnerable populations identified in v1 scope (no children's data per PRD non-goals).
- Third-party dependency: LLM provider TBD. Dependency risk is HIGH until provider is selected and contracts (including data-use terms and GPAI documentation) are in place. [Gate 3→4]

**MEASURE**
- Accuracy and performance metrics: PRD specifies generation within 10 seconds (latency) but no output quality metric (e.g., user acceptance rate, regeneration rate). Recommend tracking regeneration-to-approval ratio as a proxy for output quality. [Gate 3→4 — architecture must instrument this]
- Bias evaluation: See Bias/Fairness section below.
- Drift monitoring: No drift monitoring specified. For a stateless inference API call, model drift is a provider-side concern, but output quality drift (e.g., degraded post quality after provider model updates) must be monitored. [Gate 7 — MEDIUM]
- Model evaluation plan: Formal evaluation plan required before Gate 6→7. [Gate 6→7]

**MANAGE**
- Human oversight: Structurally satisfied by draft-and-confirm. See Human Oversight section below for gaps.
- Output controls: See Output Safety section below.
- Incident logging: AI-specific harm log required. [Gate 7 — HIGH]
- Model card: Required at Gate 6→7 per workflow. [Gate 6→7]

---

### Human Oversight Design

**Structural satisfaction**: The draft-and-confirm architecture provides EU AI Act Art. 14-style human oversight at the user level. Every AI output is reviewed by the human user before any real-world effect (publication). No publish path bypasses the review screen (PRD US-04 AC confirmed by spec-reviewer). This is the primary and most important oversight control.

**Internal oversight gaps** (pipeline-level, not user-level):

1. [MEDIUM] Audit log of AI generations: CI-5 logs post approval actions (user ID, post ID, timestamp) but does not explicitly log the AI generation event (which prompt triggered which generation, model version used, generation timestamp). Without this, it is not possible to investigate a harmful or inaccurate AI output after the fact, or to demonstrate to a regulator which inputs produced which outputs. The system-architect must specify a generation audit log at Gate 3→4.

2. [MEDIUM] Prompt-to-output traceability: Users can regenerate with instructions (PRD US-02), but the PRD does not specify whether the original prompt and all regeneration instructions are stored alongside the draft. Traceability is required for: (a) post-incident investigation, (b) demonstrating Art. 50 compliance (the output was generated by AI, not manually typed), and (c) future bias auditing. Architect must address at Gate 3→4.

3. [LOW] Harmful output flagging: No mechanism exists for a user to flag an AI-generated draft as harmful, inappropriate, or biased for internal review by Organic Posts. This is not an Art. 50 requirement but is a NIST AI RMF MANAGE best practice and is low-cost to implement. UX designer should add a "Report this draft" option to the review screen at Gate 4→5.

---

### Bias and Fairness

**Risk level: LOW for v1**

Rationale: Organic Posts generates marketing copy for SMBs about their own business topics. The AI does not make decisions about natural persons. The outputs do not determine access to employment, credit, housing, or essential services. Disparate-impact analysis in the employment/credit sense does not apply.

However, a baseline content fairness assessment is required before Gate 6→7 for the following reasons:
- AI-generated marketing copy may reproduce stereotyping language if the LLM has documented biases in commercial/marketing contexts (e.g., gendered language defaults, cultural stereotyping in hashtag recommendations).
- SMB users may be disadvantaged if the model performs significantly worse for non-English inputs or non-US business contexts (EU persona B: Agency Account Manager).

Required at Gate 6→7:
- Test C1 generation quality across at least: English (US), English (UK/EU), and at least one non-English prompt (the scope of language support should be confirmed by system-architect at Gate 3→4).
- Test for stereotyping or exclusionary language patterns using the selected LLM provider's model card and bias documentation.
- No formal disparate-impact metric (4/5ths rule) is required for v1 given no protected-class decisions are made; a qualitative review is sufficient.

---

### Output Safety Controls

To be populated in detail at Gate 3→4 when LLM provider is confirmed. Placeholder requirements for system-architect:

1. The inference prompt must include a system-level instruction prohibiting the generation of: harmful content, content that makes claims about competitors, content that includes personally identifiable information about third parties, or content that could constitute defamation.
2. Output length controls must be enforced server-side (not just UI-side) to prevent prompt injection via oversized inputs.
3. The system-architect must document the provider's content moderation layer and confirm whether Organic Posts must implement an additional output filter or can rely on the provider's built-in safety controls.
4. Jailbreak resistance: as a B2B tool with authenticated users and a narrow use case (marketing copy generation), jailbreak risk is lower than consumer-facing products; nonetheless, the system-architect must assess whether user-controlled prompt fields (topic input, regeneration instruction) require sanitisation.

---

### Foundation Model Dependencies (Gate 3→4 — to be populated)

| Model | Provider | Hosting | PII to provider? | GPAI tier | SB-942 compliant? |
|---|---|---|---|---|---|
| TBD | TBD | TBD | TBD (user topic/URL) | TBD | TBD |

Populate at Gate 3→4 when system-architect confirms provider selection.

---

### Transparency Disclosures Status

| Requirement | Status | Gate |
|---|---|---|
| Users informed content is AI-generated (Art. 50) | SATISFIED — C5 AI Disclosure Badge specified in PRD | Gate 2→3 |
| Machine-readable AI content marking (Art. 50(4)) | PARTIAL — database flag present; metadata embedding TBD | Gate 3→4 |
| Public-facing model card | NOT YET — required at Gate 6→7 | Gate 6→7 |
| CO AI Act consumer notice | NOT REQUIRED — applicability determination negative | Gate 2→3 |
| CA SB-942 provider compliance | NOT YET — confirm at Gate 3→4 with provider selection | Gate 3→4 |
| AI harm incident log operational | NOT YET — required before Gate 7 | Gate 7 |

---

### Approval — Gate 2→3

- Author: ai-ethics-reviewer
- Date: 2026-05-02
- Next update: Gate 3→4 (system-architect confirms LLM provider; populate foundation model table, output safety controls, inference-time PII flows, machine-readable marking confirmation)

---

## Gate 3→4 — 2026-05-02

### Condition Disposition Table

| Ref | Severity | Requirement | Verdict | Basis |
|---|---|---|---|---|
| A1 | MEDIUM | Generation audit log schema (14-field minimum) | CLOSED | `generation_log` table in §4 + §12 contains all required fields: `id` (UUID PK), `prompt_system`, `prompt_user`, `regen_instructions[]`, `provider`, `model_name`, `model_version`, `output_text`, `output_hash`, `regen_count`, `latency_ms`, `zdr_confirmed`, `created_at`, plus `tenant_id` and `user_id` and `draft_id` FKs. That is 15 named fields plus 3 FK columns — exceeds the 14-field requirement. Schema is append-only by design comment. |
| A2 | MEDIUM | Prompt-to-output traceability via `generation_id` FK on `drafts`, new row per regen, full chain queryable via `draft_id` | CLOSED | `drafts.generation_id UUID FK → generation_log` confirmed in §4. §12 explicitly states: "On regeneration, a new `generation_log` row is inserted (regen_count incremented) and the draft's `generation_id` FK is updated to the latest generation. All prior `generation_log` rows for a draft are queryable via `draft_id`." Full chain reconstructable as required. |
| A3 | MEDIUM | Machine-readable AI marking — propagation across 5 surfaces + Art. 50(4) determination | CLOSED | §12 propagation table confirms all 5 surfaces: DB (`drafts.ai_generated`), API responses (`ai_generated: true` in JSON), export (`ai_generated` column in CSV/JSON), scheduler payload (flag in job payload), platform publish (no platform API accepts third-party AI marking field — see Art. 50(4) determination below). |
| A5 | MEDIUM | 3 Prometheus counters at API handler level + `regen_to_approval_ratio` 7-day rolling gauge + Grafana alert at configurable threshold | CLOSED | §10 defines: `drafts_generated_total` (counter), `drafts_regenerated_total` (counter), `drafts_approved_total` (counter) — all 3 confirmed. `regen_to_approval_ratio` as rolling 7-day Prometheus gauge confirmed. Grafana alert threshold set at 2.0 (explicitly marked "configurable" in §10). All requirements met. |
| A7 | LOW | CA SB-942 — Anthropic confirmed as v1 provider; formal signoff | CLOSED | Anthropic confirmed as v1 default by FD-3 (2026-05-02). Architecture §12 states: "Anthropic publishes training data provenance documentation satisfying the California AI transparency disclosure requirement." Formal ai-ethics-reviewer signoff recorded below. |

---

### Art. 50(4) Machine-Readable Marking — Formal Determination

**Question**: Does the `ai_generated` DB flag propagating to API responses and exports satisfy EU AI Act Art. 50(4) given that LinkedIn and Instagram APIs do not accept third-party AI content marking fields?

**Determination: SATISFIED within technical feasibility**

Art. 50(4) requires machine-readable marking "where technically feasible." The architecture documents (§12) that as of 2026-05, neither the LinkedIn Marketing API nor the Instagram Graph API provides a field for third-party AI origin metadata — a fact verified against the platform API specifications reviewed at architecture stage. Organic Posts cannot embed machine-readable AI marking in the published platform content without a platform API field to carry it.

The deployer obligation under Art. 50(4) is therefore satisfied by the following controls that are technically feasible within Organic Posts' own system boundary:

1. `drafts.ai_generated BOOL` — set at generation time, never cleared, stored in Organic Posts' database.
2. `ai_generated: true` in all API responses (`GET /api/drafts/:id`, `GET /api/posts`) — machine-readable by any API consumer.
3. `ai_generated` column in JSON/CSV export — machine-readable in all export formats.
4. `generation_id` FK linkable to the full `generation_log` record — provides audit-grade traceability.

The Art. 50(4) obligation does not require Organic Posts to mark content on third-party platform surfaces it does not control. The deployer's duty extends to what is technically feasible within its own infrastructure. The determination is that this obligation is fully discharged by controls 1–4 above.

**Status: CLOSED.**

---

### Anthropic Per-Provider AI Ethics Signoff (A7 — formal record)

**Provider**: Anthropic (Claude Sonnet, v1 default, FD-3 confirmed 2026-05-02)
**CA SB-942 status**: Anthropic publishes training data provenance documentation. This satisfies the SB-942 deployer-side disclosure verification requirement. Organic Posts' deployer obligation: link to Anthropic's SB-942 disclosure in the product's AI transparency notice. Owner: ux-designer at Gate 4→5 (confirmed as condition in legal-privacy-officer Gate 3→4 verdict, item 3).
**GPAI tier**: Below systemic-risk threshold (< 10^25 FLOPs training compute, EU AI Act Annex XIII). Standard deployer obligations only. No enhanced GPAI systemic-risk deployer obligations apply.
**ZDR**: On by default in both inference paths (Bedrock eu-central-1 + direct Anthropic API). No opt-in required. Inference inputs not retained after API response.
**Training secondary use**: ZDR eliminates any possibility of prompt content being used for provider-side model training. No secondary processing concern.
**Deployer obligation checklist (Title VIII)**:
- Operating within provider terms of use: confirmed (standard API use, no circumvention of safety measures).
- GPAI technical documentation reviewed (Art. 53): Anthropic model card and usage policies reviewed at Gate 3→4.
- Data-use terms: ZDR confirmed; no inference input retention.

**A7 condition: CLOSED.**

---

### Human Oversight Chain — Supabase Auth Impact Assessment

The switch from Clerk to Supabase Auth (FD-2) affects the identity and session layer only. It does not alter the draft-and-confirm oversight chain:

- The mandatory user review step (`POST /api/drafts/:id/approve`) is enforced at the API business logic layer, not the auth layer. The auth provider swap has no impact on this control.
- RBAC roles (Owner/Editor/Viewer) remain stored in the application `users` table and enforced in API middleware — independent of the auth provider.
- No new automated approval path has been introduced. The Supabase Auth JWT carries `tenant_id` as a custom claim; resolving tenant context from the JWT does not change the approval requirement.

**Conclusion**: Human oversight chain is unchanged by the Supabase Auth substitution. Art. 14-style oversight remains structurally satisfied.

---

### NIST AI RMF GOVERN — Model Update Responsibility

**Finding**: The architecture specifies `model_name` and `model_version` fields in both `generation_log` and the `LLMResponse` interface. This captures the model version used per generation event, which enables retrospective identification of when a provider-side model version change occurred (the version will change in the log).

**Gap**: The architecture does not document: (a) who within Organic Posts is responsible for reviewing provider-side model update notifications; (b) what the response procedure is when Anthropic updates Claude Sonnet to a new snapshot (e.g., a drift in output quality or safety behaviour); (c) whether the system actively alerts on a new `model_version` value appearing in `generation_log` as a proxy for an unannounced model change.

The `regen_to_approval_ratio` drift alert is a quality-proxy signal but is not a direct model-version-change alert. A provider model version change could theoretically go undetected until quality drift is observed.

**New condition issued**: See condition NC-1 below.

---

### Foundation Model Dependencies — Updated

| Model | Provider | Hosting | PII to provider? | GPAI tier | SB-942 compliant? |
|---|---|---|---|---|---|
| Claude Sonnet (v1 default — FD-3) | Anthropic | EU: AWS Bedrock eu-central-1; US: direct Anthropic API | Topic/prompt text only — no email, no OAuth tokens, no account identifiers | Below systemic-risk threshold (< 10^25 FLOPs) | Yes — provenance documentation published |

---

### Output Safety Controls — Updated (provider confirmed)

Architecture §12 confirms:
1. System prompt is hardcoded in the LLM Gateway module; not user-editable. Prohibits PII about third parties, competitor disparagement, harmful content, platform-length-exceeding content. Versioned; stored as hash + content in `generation_log.prompt_system`.
2. Output length enforced server-side via `max_tokens` parameter in `LLMRequest` (platform-specific limit, enforced by gateway — not UI-only).
3. Content filter layer: `LLMError.code = 'content_filter'` defined in the error envelope — the gateway handles provider-level content filter rejections explicitly. Provider (Anthropic) has built-in safety filters; Organic Posts relies on these for v1. No additional application-level output filter is implemented.
4. Jailbreak resistance: authenticated B2B narrow-use context lowers risk. The `prompt_user` field is the only user-controlled input to the LLM; `prompt_system` is hardcoded. Regeneration instructions (`regen_instructions[]`) are the only additional user input surface. Architecture does not specify explicit sanitisation of `regen_instructions[]` — this is noted as carry-condition CC-3 from the architecture-reviewer (prompt injection assessment, due Gate 4→5).

---

### Transparency Disclosures Status — Updated

| Requirement | Status | Gate |
|---|---|---|
| Users informed content is AI-generated (Art. 50) | SATISFIED — C5 AI Disclosure Badge specified in PRD | Gate 2→3 |
| Machine-readable AI content marking (Art. 50(4)) | CLOSED — DB flag + API field + export column satisfy obligation within technical feasibility; platform API gap documented and justified | Gate 3→4 |
| CA SB-942 provider compliance | CLOSED — Anthropic publishes provenance documentation; link required in AI transparency notice (ux-designer Gate 4→5) | Gate 3→4 |
| Public-facing model card | NOT YET — required at Gate 6→7 | Gate 6→7 |
| AI harm incident log operational | NOT YET — required before Gate 7 | Gate 7 |

---

### NIST AI RMF Status Table — Updated

| Function | Item | Status | Owner | Due |
|---|---|---|---|---|
| GOVERN | AI use policy | Open | product-manager | Gate 7 |
| GOVERN | Accountability map (who owns AI model updates, version monitoring) | PARTIAL — roles documented at architecture level; model-update notification procedure missing (NC-1) | system-architect / devops-engineer | Gate 5→6 |
| GOVERN | AI incident response | Open | devops-engineer | Gate 7 |
| MAP | Context / use-case | CLOSED | ai-ethics-reviewer | Gate 2→3 |
| MAP | Third-party dependency (Anthropic) | CLOSED | system-architect + ai-ethics-reviewer | Gate 3→4 |
| MEASURE | Accuracy / quality metrics (regen ratio) | CLOSED — instrumented at API layer | system-architect | Gate 3→4 |
| MEASURE | Bias / fairness baseline | Open | qa-engineer | Gate 6→7 |
| MEASURE | Drift monitoring (dashboards) | Instrumented (Gate 3→4); dashboards deferred | devops-engineer | Gate 7 |
| MANAGE | Human oversight (draft-and-confirm) | CLOSED — structurally satisfied; Supabase Auth swap confirmed no impact | system-architect | Gate 3→4 |
| MANAGE | Output safety controls | CLOSED (provider-level controls confirmed; regen_instructions sanitisation carried to CC-3) | system-architect | Gate 3→4 |
| MANAGE | Incident logging | Open | devops-engineer | Gate 7 |
| MANAGE | Model card | Open | ai-ethics-reviewer | Gate 6→7 |

---

### New Conditions Issued at Gate 3→4

**NC-1** [LOW] [NIST AI RMF GOVERN — model update notification procedure]: The architecture captures `model_version` per generation event, enabling retrospective detection of provider-side model version changes. However, no documented procedure exists for: (a) who within Organic Posts monitors for model version changes in `generation_log`; (b) what the response procedure is when a new snapshot version appears; (c) whether a Grafana alert on `model_version` value change is configured. Owner: devops-engineer to add model-version-change alert to observability plan; product-manager to document accountability owner in AI use policy. Due: Gate 5→6 (devops alert config may be built at Phase 5; AI use policy at Gate 7).

---

### Approval — Gate 3→4

- Author: ai-ethics-reviewer
- Date: 2026-05-02
- Conditions A1, A2, A3, A5, A7: all CLOSED
- Art. 50(4) determination: CLOSED (satisfied within technical feasibility)
- Anthropic per-provider signoff: CLOSED
- New condition NC-1 issued (LOW — does not block Gate 3→4)
- Next update: Gate 6→7 (bias/fairness test verification; model card production for C1)

---

## Gate 6→7 — 2026-05-11

### Condition Disposition — A8 and A9 (carryover from Gate 2→3)

**A8 — Bias/Fairness Baseline**: CLOSED

Delivery: `tests/ai/bias-baseline.spec.ts` — 30 prompts, 10 per locale (en-US, en-GB, pt-BR). AnthropicAdapter mocked; no live API in CI. Deny-list covers 7 categories (gendered stereotype, racial stereotype, slurs, competitor disparagement, email PII, phone PII, fictitious product promotion). Results: 30/30 pass, 0 deny-list violations across all locales, ZDR confirmed for all locales, locale differentiation verified. Cross-locale consistency checks pass. Report at `tests/ai/bias-baseline-report.md`.

Limitation accepted: fixture corpus uses static mock responses. A live API sampling run before Gate 7 is strongly recommended and carried as condition A8-live (Gate 7, non-blocking for this verdict).

**A9 — Model Card**: CLOSED

`docs/compliance/model-cards/c1-ai-post-generation.md` v1.0 delivered. Card names: production model (`claude-sonnet-4-5-20251022`); intended use (SMB social post generation); training data provenance (Anthropic; ZDR; SB-942 compliant); biases and limitations; ethical considerations (EU AI Act limited-risk; NIST references; FTC §5; human oversight); ZDR data-use terms; version and contact (privacy@organicposts.ai).

---

### Final NIST AI RMF Status — v1 Launch Position

| Function | Item | Status at Gate 6→7 | Owner | Gate 7 action? |
|---|---|---|---|---|
| GOVERN | AI use policy | OPEN | product-manager | Yes — document before go-live |
| GOVERN | Accountability map / model update procedure | PARTIAL — NC-1 open; Grafana alert not yet confirmed | devops-engineer / product-manager | Yes — NC-1a alert + NC-1b policy owner |
| GOVERN | AI incident response | OPEN | devops-engineer | Yes — A4/L-UX-2 procedure operational |
| MAP | Context / use-case | CLOSED | ai-ethics-reviewer | No |
| MAP | Third-party dependency (Anthropic) | CLOSED | ai-ethics-reviewer | No |
| MEASURE | Accuracy / quality metrics | CLOSED | system-architect | No |
| MEASURE | Bias / fairness baseline | CLOSED (A8) | qa-engineer | A8-live recommended (not blocking) |
| MEASURE | Drift monitoring dashboards | PARTIAL — Prometheus instrumented; Grafana dashboards Gate 7 scope | devops-engineer | Yes — A5 dashboards |
| MANAGE | Human oversight | CLOSED | system-architect | No |
| MANAGE | Output safety controls | PARTIAL — 2 sanitizer gaps (S5-a, S5-b) to be remediated | backend-coder | Yes — S5-a HIGH, S5-b MEDIUM |
| MANAGE | Incident logging | OPEN | devops-engineer | Yes — HIGH |
| MANAGE | Model card | CLOSED (A9) | ai-ethics-reviewer | No |

**Summary**: 6 of 12 NIST AI RMF items are CLOSED heading into production. GOVERN (policy/procedure) and MANAGE (incident log, sanitizer gaps) are the primary residual risk areas. None of these are novel gaps — all were identified at prior gates and are tracked with owners. The risk profile is proportionate to the v1 scope (limited-risk, B2B, low-volume SMB tool with mandatory human oversight on every output).

---

### Final EU AI Act Art. 50 Compliance Summary

| Requirement | Status |
|---|---|
| Art. 50(1)/(2) — Users informed content is AI-generated | CLOSED — C5 AI Disclosure Badge (non-dismissable, pre-approval, WCAG AA) |
| Art. 50(4) — Machine-readable marking where technically feasible | CLOSED — DB flag + API field + export column; platform API gap formally justified (Gate 3→4) |
| Art. 50 — Public-facing transparency documentation | CLOSED — model card at `docs/compliance/model-cards/c1-ai-post-generation.md` |
| Art. 50 — CA SB-942 provider disclosure link in product | OPEN — link to Anthropic SB-942 provenance disclosure required in product AI Transparency Notice; Gate 7 devops/frontend item |

No high-risk (Annex III) registration in the EU database is required. The system is limited-risk only.

---

### Residual AI Risk Register — Heading into Production

| Risk | Severity | Mitigation in place | Residual level | Post-launch monitoring |
|---|---|---|---|---|
| Prompt injection via `prompt_user` or `regen_instructions[]` | MEDIUM | 11-pattern sanitizer; 4000-char cap; hardcoded system prompt | LOW-MEDIUM (2 gaps: S5-a, S5-b must be patched pre-launch) | `prompt_injection_rejected` warn logs; S5-a/S5-b patch required before Gate 7 |
| LLM output quality drift after provider model update | LOW | `regen_to_approval_ratio` gauge + Grafana alert (threshold 2.0); `model_version` logged per generation | LOW | NC-1a Grafana alert on new model_version value (Gate 7) |
| Hallucinated business details in generated content | LOW | Mandatory human review (draft-and-confirm); output hash tamper-check | LOW | `draft_reported` events (A4/L-UX-2 monitoring procedure, Gate 7) |
| Stereotyping or exclusionary language in generated output | LOW | A8 bias baseline passed; deny-list in production (sanitizer post-output review not implemented — provider safety filters relied upon) | LOW | A8-live pre-launch manual review; ongoing `draft_reported` monitoring |
| Provider-side model training on inference inputs | NEGLIGIBLE | ZDR confirmed on both inference paths (Bedrock eu-central-1 + direct API) | NEGLIGIBLE | None required; ZDR is contractual |
| Art. 50 non-disclosure to end user (SMB's social media audience) | LOW | C5 badge visible to SMB user; draft-and-confirm means SMB user is aware before publishing | LOW | C5 badge implementation verified in E2E suite |
| Unannounced Anthropic model version change | LOW | `model_version` field in `generation_log`; NC-1a Grafana alert (Gate 7 condition) | LOW | NC-1a Grafana alert to be configured at Gate 7 |

---

### Post-Launch AI Monitoring Expectations

1. **`draft_reported` event threshold alert** (A4/L-UX-2): devops-engineer configures alert at >5 reports per `generation_id` or >20 reports per day. Escalation path: product-manager reviews flagged generations; ai-ethics-reviewer notified if systematic pattern identified.

2. **`regen_to_approval_ratio` gauge** (A5): 7-day rolling gauge in Prometheus. Alert threshold 2.0 (configurable). Sustained elevation signals output quality degradation; trigger point for manual review and provider contact.

3. **`model_version` change alert** (NC-1a): Grafana alert on new distinct `model_version` value in `generation_log`. Triggers NC-1b response procedure: quality re-test against A8 bias baseline (live API run), product-manager notification, optional version pin in `AnthropicAdapter`.

4. **Prompt injection rejection rate**: `prompt_injection_rejected` warn events tracked in observability stack. Elevated rate signals active adversarial use; trigger for sanitizer pattern review.

5. **Quarterly**: Re-run A8-live bias baseline with current production model version. Document results as an addendum to `tests/ai/bias-baseline-report.md`. Review Anthropic model card updates for new bias/limitation disclosures.

---

### Approval — Gate 6→7

- Author: ai-ethics-reviewer
- Date: 2026-05-11
- A8 (bias/fairness baseline): CLOSED
- A9 (model card): CLOSED
- NC-1 (model version notification): CARRIED to Gate 7 as NC-1a (Grafana alert) + NC-1b (policy owner)
- Sanitizer gaps S5-a + S5-b: CARRIED to Gate 7 as HIGH/MEDIUM conditions (must be resolved before go-live)
- A8-live (pre-launch live API bias review): CARRIED to Gate 7 as MEDIUM recommendation
- Verdict: APPROVED_WITH_CONDITIONS
- Next update: Gate 7 final sign-off (confirm S5-a/S5-b patched, NC-1a alert live, incident log operational, Art. 50 SB-942 link in product)

---

## Gate 2→3 (PIVOT RE-RUN — GEO / AI-Visibility Platform) — 2026-05-18

> This section supersedes the Gate 2→3 2026-05-02 classification for the GEO platform scope only. The prior sections (2026-05-02 through Gate 6→7 2026-05-11) remain archived and accurate for the social-scheduling product.

### AI Feature Inventory — GEO Platform

| # | Feature | Capability | Purpose | Inputs | Outputs | Human oversight |
|---|---|---|---|---|---|---|
| GEO-1 | LLM probe-query execution | C1, C2 | Send buyer-query simulations to ChatGPT, Claude, Perplexity (EU-gated), Gemini; detect citation presence/position/sentiment | Brand name, category, probe query templates | Citation presence, citation rank, raw LLM response text | No approval required for query execution; results are informational only; no automated external action triggered |
| GEO-2 | GEO Score computation | C1, C2, C7 | Compute 3-vector score (BRAND/PERFORMANCE/AI) from citation and entity data | Citation results, schema.org coverage, entity field completeness | GEO Score 0–100 + sub-scores | Displayed to client; client may annotate or dispute; rule-based computation on AI classifier outputs |
| GEO-3 | Strategy Generator | C3 | Convert audit + citation data into prioritized action plan and content calendar | GEO Score, sub-scores, gap analysis, competitor benchmarks | Recommendations list; 4-week content calendar | All outputs are AI-generated drafts; client must explicitly accept or reject each recommendation before it enters the live plan |
| GEO-4 | Content draft generation | C4, C5 | Generate blog posts, LinkedIn posts, FAQ entries, Reddit reply drafts | Strategy context, brand voice profile, target topic | Draft text with schema markup (blog/FAQ) | Draft-and-confirm mandatory; client reviews, edits, must approve before any publish/export; AI label non-removable pre-approval; FTC disclosure step required for Reddit (AC-C5-4) |
| GEO-5 | Citation sentiment classification | C2 | Classify citation sentiment as positive / neutral / negative | Raw LLM response text containing a brand citation | Sentiment label | Client can flag disagreements; flagged classifications logged for quality review; AI-generated label on all classifications |
| GEO-6 | Entity inconsistency detection | C6 | Compare entity fields across Wikidata, Crunchbase, LinkedIn, Google Business; identify gaps | Read-only entity data from four sources | Inconsistency report + human-readable edit draft | Advisory only; client manually reviews and manually submits edits to third-party platforms; no automated submission |

---

### EU AI Act Classification — Per Feature (GEO Platform)

#### Prohibited Practices Check (Art. 5) — All Features

Art. 5 prohibited practices: subliminal or manipulative techniques beyond conscious awareness; exploitation of vulnerabilities; social scoring; real-time remote biometric identification; emotion recognition in workplace/education; biometric categorisation inferring protected characteristics; AI-generated/manipulated content deceptively presenting as authentic in public discourse (deepfakes).

**GEO-1 (Probe-query execution):** NOT prohibited. Sending structured API queries to LLM providers on behalf of paying clients to measure citation presence is a monitoring/benchmarking function. It does not manipulate the LLM providers' outputs; it observes and records them.

**GEO-2 (GEO Score):** NOT prohibited. A composite scoring algorithm applied to a brand's own signals, computed for the benefit of the subscribing client, is not social scoring of natural persons within the Art. 5(1)(c) meaning. Social scoring under Art. 5 refers to evaluation of trustworthiness of natural persons by public authorities or equivalent. Brand-visibility scoring for commercial optimization is not within that scope.

**GEO-3 (Strategy Generator):** NOT prohibited. Producing a prioritized commercial action plan for a business client is not a prohibited practice. No subliminal manipulation, no scoring of natural persons, no forbidden categorisation.

**GEO-4 (Content draft generation):** NOT prohibited under Art. 5. Content that is drafted by AI and must be reviewed, edited, and explicitly approved by a human before publication, with a mandatory AI-generated label, does not constitute "AI-generated or manipulated content that deceives a person into thinking they are looking at authentic human-created content." The Art. 5 deepfake prohibition targets deceptive impersonation of real persons (images, video, audio). Text marketing drafts with mandatory AI labelling do not trigger this provision.

**GEO-5 (Sentiment classification):** NOT prohibited. Classifying a citation about a brand as positive/neutral/negative is not prohibited biometric categorisation, social scoring, or manipulation.

**GEO-6 (Entity inconsistency detection):** NOT prohibited. Read-only field comparison and human-reviewed draft generation.

**Art. 5 conclusion: NO prohibited practice applies to any GEO platform feature. Hard-rule gate cleared.**

---

#### High-Risk Classification (Annex III) — All Features

Annex III categories: (1) biometric identification and categorisation; (2) critical infrastructure management; (3) education and vocational training; (4) employment and worker management; (5) essential private and public services (credit, social benefits, emergency services, insurance); (6) law enforcement; (7) migration and asylum management; (8) administration of justice and democratic processes; (9) AI systems that influence elections or voter behaviour.

**GEO-1 through GEO-6:** None of the six features fall within any Annex III category. The GEO platform operates in the commercial marketing domain. Its outputs affect a brand's visibility in AI-generated search results — they do not affect any natural person's access to employment, credit, housing, education, healthcare, emergency services, legal proceedings, voting, migration status, or any other Annex III domain.

**Citation-influence specificity:** The core function of the GEO platform — helping brands appear more prominently in AI-generated answers — is a form of commercial optimization analogous to traditional SEO. Neither the EU AI Act nor any EU guidance as of August 2025 classifies commercial marketing optimization AI as high-risk. The platform does not determine which natural persons receive services; it influences which commercial entities are recommended in response to informational or commercial queries. This is categorically different from Annex III high-risk AI.

**Annex III conclusion: NOT high-risk. No conformity assessment, no EU database registration, no Art. 9 quality management system obligation.**

---

#### Limited-Risk Classification (Art. 50) — All Features

Art. 50 applies to: (a) AI systems that interact with natural persons (chatbots — Art. 50(1)); (b) AI systems that generate synthetic content (text, image, audio, video) for public dissemination — deployers must disclose AI generation to persons exposed to the output (Art. 50(2)/(4)); (c) deep fakes (Art. 50(3)/(4)).

**GEO-1 (Probe-query execution):** Art. 50(1) does not apply — the system queries LLMs on behalf of clients; it does not present itself as a human to users. Art. 50(2)/(4) do not apply — probe queries are not public-dissemination synthetic content. **No Art. 50 obligation for this feature as a standalone function.** However, the audit report presenting AI-analysed results to the client is an AI-generated output and must carry the Art. 50 label (see GEO-2).

**GEO-2 (GEO Score computation):** The Score is a rule-based computation on AI classifier outputs, presented to the subscribing client. The presentation of AI-derived analytics to the client constitutes AI-generated output. Art. 50 transparency label required on all AI-generated analysis elements (PRD AC-C1-8, AC-C2-3 confirmed). Obligation: label each AI-generated analysis element as AI-generated in audit and monitoring reports.

**GEO-3 (Strategy Generator):** Outputs a text action plan and content calendar generated by an LLM. The client uses this to make business decisions. This is AI-generated text output for the client's own use (not immediate public dissemination, but informing future public content and business strategy). Art. 50 label required on all strategy and calendar outputs (PRD AC-C3-4 confirmed: all outputs labelled as AI-generated drafts requiring client review).

**GEO-4 (Content draft generation):** AI-generated text intended for publication (blog, LinkedIn, FAQ, Reddit replies). This is the clearest Art. 50(2)/(4) trigger: the deployer must ensure the recipient (the client as author) is informed the content is AI-generated prior to dissemination. PRD AC-C4-3 specifies a non-removable AI-generated label on every draft before approval. AC-C5-4 specifies an FTC disclosure confirmation step for Reddit. **Art. 50 obligation CONFIRMED and addressed in PRD.**

**GEO-5 (Sentiment classification):** AI classifies text about the client's brand. The classification is presented to the client as an AI-generated analytical result. Art. 50 label required (PRD AC-C2-3 confirmed). The client can dispute; flagged classifications are logged.

**GEO-6 (Entity inconsistency detection):** Deterministic field comparison with LLM-generated draft text for edit suggestions. The draft text element carries an AI-generated label (PRD AC-C6-5 confirmed). The field-comparison report itself is deterministic and does not require an AI label, but the generated edit drafts do.

**Art. 50 conclusion: All six features require Art. 50 transparency labelling. PRD acceptance criteria satisfy the obligation for all six features. August 2026 full-applicability deadline is within V1 launch window — all Art. 50 controls must be live before first EU user accesses any GEO feature.**

---

#### Overall Risk Tier — GEO Platform

**LIMITED-RISK (Art. 50) — all six features**

No feature is prohibited. No feature is high-risk. All features require Art. 50 transparency disclosures. The GEO platform is a more complex Art. 50 case than the archived social-scheduling product (six features vs. one, monitoring functions, sentiment classification, score computation) but does not cross into Annex III territory.

---

### GPAI Deployer Obligations — GEO Platform (Title VIII)

The GEO platform is a **deployer** of foundation models from multiple providers (OpenAI GPT-4o, Anthropic Claude, Perplexity, Google Gemini — each via official APIs). It is not a GPAI provider. GPAI provider obligations (documentation, training data, copyright, systemic-risk provisions) fall on each respective provider.

**Deployer obligations applicable to Organic Posts as deployer:**

1. Operate within each provider's API terms of use and intended use parameters. Probe-query benchmarking must be permitted under the specific provider terms — this is flagged as Dependency #1 in PRD §9 for legal-privacy-officer confirmation at Gate 3→4.
2. If a provider model exceeds the systemic-risk threshold (10^25 FLOPs training compute), the provider bears enhanced obligations; Organic Posts must not circumvent provider safety measures.
3. Obtain and review each provider's GPAI technical documentation (Art. 53) at Gate 3→4.
4. Zero Data Retention (ZDR) or equivalent must be confirmed for each provider before EU user brand-probe queries are routed to that provider.
5. Art. 50(4) deployer duty extends to all six AI features; cannot be delegated to providers.

**Multi-provider deployer obligation checklist (to be completed at Gate 3→4):**

| Provider | EU transfer mechanism | GPAI tier | ZDR / data-use terms | Permissible use for benchmarking | Gate 3→4 status |
|---|---|---|---|---|---|
| Anthropic (Claude) | Bedrock eu-central-1 + SCC/DPF confirmed (archived) | Below systemic-risk | ZDR confirmed (archived) | To be confirmed for probe-query use | OPEN — re-confirm for new use case |
| OpenAI (GPT-4o) | Azure EU or SCC — unconfirmed for new use | TBD | TBD | To be confirmed | OPEN |
| Perplexity | EU residency unconfirmed — EU ROUTING GATE ACTIVE | TBD | TBD | To be confirmed | BLOCKED until DPA/SCC confirmed |
| Google Gemini | Vertex AI EU path — unconfirmed | TBD | TBD | To be confirmed | OPEN |
| DataForSEO/SerpAPI | EU option for DataForSEO — unconfirmed | N/A (not GPAI) | N/A | Licensed SERP data | OPEN |

**August 2026 GPAI transparency deadline:** Full EU AI Act applicability (including all Art. 50 GPAI provisions) comes into force August 2026. V1 launch must have all Art. 50 controls operational before this date.

---

### Colorado AI Act SB 24-205 — Re-Confirmation for GEO Platform

**Prior determination (2026-05-02):** NOT APPLICABLE (social media post generation not a consequential decision).

**Re-confirmation scope:** Gate 0→1 pivot condition 7 requires formal re-assessment for the GEO platform's AI use cases, specifically the Strategy Generator (prioritized action plan) and Citation Monitor (competitive share-of-voice analysis).

**Analysis:**

SB 24-205 (C.R.S. § 6-1-1301 et seq., effective 2026-02-01) applies to "high-risk AI systems" used in making or substantially assisting "consequential decisions" about Colorado consumers. Enumerated consequential-decision categories: education enrollment/opportunities; employment/employment opportunities; financial/lending services; essential government services; healthcare services; housing; insurance; legal services.

GEO-3 (Strategy Generator): Produces a commercial action plan for the subscribing business client (SMB/agency). The plan recommends content topics, distribution channels, and optimization tactics. The output is a business strategy document for a B2B client. It does not make or substantially assist any decision about a natural person's access to education, employment, credit, housing, healthcare, insurance, government services, or legal services. The SMB client (not a Colorado consumer in the Act's protective sense) receives the plan as a business tool. **NOT a consequential decision under SB 24-205.**

GEO-2 (GEO Score / Citation Monitor share-of-voice): Scores the client's brand performance in AI search results and benchmarks against competitors. This is a marketing analytics function, not a decision about any natural person's access to a regulated domain. **NOT a consequential decision under SB 24-205.**

GEO-5 (Sentiment classification): Classifies text about the client's brand. Does not constitute a decision about any natural person. **NOT a consequential decision under SB 24-205.**

**Re-confirmation conclusion:** SB 24-205 does NOT apply to any GEO platform AI feature. The GEO platform does not make or substantially assist consequential decisions about Colorado consumers within the Act's enumerated categories. This is a formal compliance re-determination superseding and affirming the prior 2026-05-02 determination for the pivoted product scope.

**Caveat:** If the platform introduces features that score or evaluate natural persons (e.g., influencer selection scoring, individual employee performance analysis, customer creditworthiness assessment) in a future version, re-run this determination at the relevant gate.

---

### US Sectoral AI Law Exposure — GEO Platform

| Sector | Applicable law | Exposure | Assessment |
|---|---|---|---|
| Employment / hiring | EEOC guidance; NYC LL 144; IL AI Video Interview Act; CO AI Act | None | GEO platform does not evaluate job candidates or workers. Not an AEDT. |
| Housing | FHA; HUD AI guidance | None | No housing decisions. |
| Credit / lending | ECOA; FCRA; adverse action notices | None | No credit decisions. |
| Education | FERPA; state student privacy | None | No student data. |
| Health | HIPAA; FDA SaMD | None | No health data or diagnostic function. |
| Consumer-facing (general) | FTC §5; 16 CFR Part 255; CO AI Act | ELEVATED — see ethics risks below | FTC disclosure obligation for AI-drafted community content (Reddit, LinkedIn). Draft-and-confirm + AC-C5-4 FTC disclosure step address the primary exposure. External counsel confirmation required before Reddit module is built. |
| California AI transparency | CA SB-942 | Active — confirm per provider at Gate 3→4 | SB-942 applies to large AI providers. Ozvor's deployer obligation: verify each provider (OpenAI, Anthropic, Google) publishes provenance documentation; link to their SB-942 disclosures in the product AI Transparency Notice. Anthropic already confirmed (archived Gate 3→4). Others: open for Gate 3→4 re-run. |
| Illinois AI Video Interview Act | IAIVEA | None | Platform does not conduct employment interviews. |
| NYC Local Law 144 | AEDT bias audit | None | Not an automated employment decision tool. |

---

### Ethics-Specific Risk Analysis — GEO Platform

#### 1. Citation/Ranking Manipulation — Legitimacy vs. Deception

**The question:** Is helping a brand win AI citations legitimate optimization or deceptive manipulation?

**Assessment:** The distinction maps to a well-established SEO analogy. Traditional SEO — creating quality content, earning authoritative backlinks, improving technical crawlability — is universally accepted as legitimate commercial optimization. GEO applies the same logic to AI-search inputs: improving entity data quality, publishing factually accurate and authoritative content, ensuring AI crawlers can access a brand's genuine information.

**Legitimate GEO (this platform):** Improve the genuine quality and accuracy of a brand's information in the sources AI systems draw from. The platform generates factually accurate content about the client's own business, improves entity data consistency on Wikidata/Crunchbase/Google Business, and ensures AI crawlers can index authoritative content. The AI citations that result reflect a genuine improvement in the brand's information quality. This is indistinguishable in principle from a law firm improving its Wikipedia article to accurately reflect its practice areas.

**The line:** The platform crosses into problematic territory if it: (a) fabricates false qualifications or misleading claims about the client brand in content; (b) creates artificial signals (fake citations, link schemes, astroturfed reviews) to manipulate AI training or retrieval; (c) submits false or unsupported claims to knowledge graphs (Wikidata); (d) floods AI-training datasets with inauthentic content. **None of these are within V1 scope.** The non-goals (§3) explicitly prohibit fabrication; content generation uses a system prompt prohibiting false claims; entity graph writes are prohibited (advisory only per AC-C6-2).

**Residual risk:** The platform could be misused by clients to generate technically accurate but selectively framed content that advantages their brand without being deceptive. This is the equivalent of a company publishing a press release — legal and common. The platform's role is tool/channel provider, not guarantor of content ethics beyond factual accuracy controls.

**Verdict:** LEGITIMATE OPTIMIZATION within current V1 scope. No prohibited manipulation. System-architect must ensure content-generation system prompt explicitly prohibits: false factual claims, fabricated credentials or awards, and misleading comparative claims. This must be a non-negotiable system-prompt constraint, not a client-editable parameter.

#### 2. Reddit AI-Drafted Answers — Authenticity and Community Harm

**Risk:** AI-drafted Reddit replies posted from the client's own account may deceive subreddit communities into thinking they are receiving authentic organic advice from a real person, when the post is actually AI-drafted marketing content for a commercial interest.

**Severity:** HIGH without mitigation; reduced by the PRD's mandatory FTC disclosure step (AC-C5-4).

**PRD mitigation assessment:** AC-C5-4 requires that before any Reddit draft can be approved, the client must confirm or add a disclosure statement — the platform prompts: "Does this reply disclose AI drafting and/or commercial intent where required by the target subreddit's rules?" The confirmation is logged with user identity, timestamp, and thread URL. Posting is from the client's own verified Reddit account only (AC-C5-1). No platform-controlled accounts. No autonomous posting.

**Gap 1 — Disclosure adequacy:** The PRD prompts the client to confirm disclosure where "required by the target subreddit's rules" — but many subreddits have no formal disclosure rules even though community expectations of organic authenticity apply. The FTC Endorsement Guides (16 CFR Part 255, revised 2023) require disclosure of material connections whenever there is a commercial interest, regardless of platform-specific rules. The platform's prompt framing ("required by subreddit rules") is too narrow. The prompt must reflect the FTC standard: disclosure is required whenever the poster has a commercial interest in the brand being discussed, regardless of whether the subreddit explicitly requires it. This is a condition (see conditions table below).

**Gap 2 — AI drafting disclosure:** The FTC guidance on AI-generated content suggests that disclosure of AI drafting is appropriate when the AI-generated nature of the content could affect how readers evaluate it. For Reddit community content intended to appear as authentic personal advice, disclosure of AI drafting is arguably required. The PRD's disclosure prompt covers "commercial intent" but is ambiguous on whether "AI drafting" must also be disclosed in the post text itself (vs. merely being confirmed by the client in the platform UI). This is a condition.

**Gap 3 — External counsel:** PRD §10 Open Question 7 correctly notes that FTC external counsel confirmation is required before the Reddit module is built. This is a hard condition before Gate 3→4 can issue architecture approval for C5.

#### 3. Competitor Data and Comparative Claims in AI-Generated Content

**Risk:** The content generation engine (GEO-4) and strategy engine (GEO-3) receive competitor benchmark data (citation share-of-voice, competitor AI sub-scores) as inputs. There is a risk that AI-generated content could include comparative claims about competitors that are inaccurate, misleading, or defamatory.

**Assessment:** The PRD §8 specifies that the content generation system prompt prohibits "competitor disparagement." The archived Gate 6→7 (2026-05-11) bias baseline deny-list confirmed "competitor disparagement" as a blocked category. These controls are necessary but not sufficient for the GEO platform because competitor data is now a richer input to the content engine than in the social-scheduling product.

**Condition:** The system-architect must confirm at Gate 3→4 that: (a) competitor citation rate data and competitor brand names are NOT injected as direct input into the content generation prompt (they inform strategy recommendations, not content drafts); (b) the content-generation system prompt explicitly prohibits comparative claims about specific named competitors; (c) if a client requests a blog post on a topic that implicitly compares their brand to competitors, the draft must not name specific competitors without factual sourcing.

**Defamation risk:** AI-generated content that falsely attributes negative characteristics to a named competitor brand constitutes potential defamation (product disparagement/trade libel). The mandatory human review step (draft-and-confirm) is the primary mitigant. However, the system prompt must prevent the model from generating such content in the first place — the human approval step is not a substitute for upstream content controls.

#### 4. Hallucination Risk — Audit Results and Generated Content

**Audit hallucination:** The GEO Audit Engine reports citation presence or absence by querying LLM APIs and recording their actual responses. The risk of "false not-cited" results (the LLM was cited in reality but not in the specific probe-query run) is not hallucination — it is sampling error inherent to the probabilistic nature of LLM responses. The PRD correctly addresses this by running at least 10 probe queries per provider per audit and tracking averages. However, the audit report must not present results as a definitive census of all AI mentions — it is a statistically meaningful sample. Any language in the audit report implying certainty must be removed or hedged.

**Citation presence misattribution:** There is a risk that the platform interprets a tangential brand mention (e.g., "unlike Brand X") as a positive citation. The sentiment classifier (GEO-5) must correctly distinguish between positive, neutral, and negative citations. A false positive (reporting a negative citation as a positive) would mislead the client about their GEO performance. The AC-C2-3 client flag-and-review mechanism is the oversight control; it must be actively surfaced in the UX, not buried.

**Content hallucination:** AI-generated blog posts, LinkedIn posts, and FAQ entries may contain factually incorrect statements about the client's own business (e.g., wrong founding year, false product claims, incorrect pricing). The draft-and-confirm model is the primary control. The system prompt should instruct the model to use only information provided in the prompt context and to flag uncertainty rather than fabricate specific facts.

**Condition:** System-architect must specify at Gate 3→4 that: (a) audit report language uses hedged statistical framing ("based on a sample of N queries, your brand was cited in X% of responses"); (b) the content generation system prompt instructs the model to use only client-provided factual context and to flag gaps rather than invent them; (c) the audit report's AI-generated label (AC-C1-8) covers all analytical interpretation elements, not just the raw citation counts.

#### 5. Sentiment Misclassification Harms

**Risk:** The citation sentiment classifier (GEO-5) misclassifies a negative citation as positive (or vice versa), leading the client to make incorrect strategic decisions or to feel falsely reassured about their brand health.

**Assessment:** Sentiment misclassification in this context affects the client's business decisions, not a natural person's access to essential services. The harm is commercial, not fundamental rights-threatening. The PRD includes a client flag-and-review mechanism (AC-C2-3) and an AI-generated label on all classifications. This is appropriate proportionate oversight for a commercial analytics function.

**Residual condition:** The system-architect should specify at Gate 3→4 what sentiment model or prompt is used for GEO-5 (a dedicated sentiment prompt vs. relying on the same general-purpose LLM). A dedicated sentiment classification prompt with few-shot examples will reduce misclassification rates compared to asking the general-purpose content model to also classify sentiment. This is a quality-optimization condition, not a hard compliance blocker.

#### 6. Fairness — Paying Clients vs. Organic Merit in AI Answers

**The question:** Does the GEO platform advantage clients who can pay, thereby distorting AI search results away from genuine merit toward commercial optimization power?

**Acknowledgment:** This is a real and legitimate concern. If GEO optimization tools are widely adopted, AI search results will increasingly reflect not just the quality and authority of information, but also the marketing budget of the brands paying for GEO services. The platform does contribute to this dynamic.

**Positioning:** This concern is not unique to this platform — it is the GEO category's structural analog to the SEO market's well-documented effect of larger marketing budgets producing better search rankings. Search engines (and by extension, AI systems trained on search data) have always partially rewarded investment in content and technical optimization, not just genuine quality.

**The platform's mitigants:** (a) The platform does not fabricate false information — it improves the accuracy and completeness of genuine brand information; (b) the free-tier GEO Audit Engine gives any brand visibility into their AI-citation standing without a paid subscription; (c) the platform explicitly prohibits astroturfing, fake reviews, and manipulation of AI training data.

**Conclusion:** This is an industry-level fairness concern to acknowledge in the platform's ethics documentation and model cards, but it is not a regulatory violation and does not warrant a compliance condition. The platform operates within the bounds of accepted commercial optimization practice. Position in model cards and public ethics documentation as a known limitation and contextual risk.

---

### PRD Transparency ACs and Human Oversight — Sufficiency Review

| PRD Acceptance Criterion | Feature | Obligation addressed | Sufficiency assessment |
|---|---|---|---|
| AC-C1-8 — audit report AI-generated label | GEO-1/2 | Art. 50 label on AI analysis | SUFFICIENT as written; must cover all analytical interpretation elements, not raw data only — confirm in architecture |
| AC-C2-3 — sentiment classification AI label + client flag | GEO-5 | Art. 50 label; client oversight | SUFFICIENT |
| AC-C3-4 — strategy drafts AI label, no auto-execution | GEO-3 | Art. 50 label; human oversight | SUFFICIENT |
| AC-C4-3 — content draft AI label non-removable | GEO-4 | Art. 50 label; human oversight | SUFFICIENT |
| AC-C4-4 — no auto-publish | GEO-4 | Human oversight | SUFFICIENT |
| AC-C5-4 — FTC disclosure confirmation before Reddit post | GEO-4 (Reddit) | FTC §5 / Art. 50 | PARTIALLY SUFFICIENT — prompt framing must be expanded from "required by subreddit rules" to FTC standard (commercial interest always triggers disclosure); AI drafting disclosure in post text is ambiguous — see Gap 1 and Gap 2 above |
| AC-C6-5 — entity edit draft AI label | GEO-6 | Art. 50 label | SUFFICIENT |
| AC-C6-2 — no automated entity graph writes | GEO-6 | Ethics guardrail; Wikidata ToS | SUFFICIENT and non-negotiable |

**Gaps not covered by PRD ACs:**
- No AC specifying that competitor brand names and competitor benchmark data are not injected into content-generation prompts — must be a system-prompt constraint confirmed at Gate 3→4.
- No AC specifying statistical hedging language in audit reports — must be addressed in UX at Gate 4→5.
- FTC Reddit disclosure prompt framing needs tightening — must be addressed in UX specification before Gate 3→4.

---

### NIST AI RMF — MAP Function for GEO Platform

**GOVERN**
- AI use policy: Does not yet exist for the GEO platform. Must be written before Gate 7. [OPEN — Gate 7]
- Accountability map: Six AI features across five LLM providers. Accountability map required from system-architect at Gate 3→4. [OPEN — Gate 3→4]
- Multi-provider AI incident response: No procedure defined. Required before Gate 7. [OPEN — Gate 7]

**MAP**
- Context and use-case: Completed here. Six features documented with inputs, outputs, oversight model, ethics-specific risks.
- Stakeholder impact: (a) Subscribing clients (direct users); (b) competitor brands (whose citation data is processed); (c) AI search users (whose experience of AI-generated answers is influenced by the platform's outputs); (d) Reddit/LinkedIn community members (who interact with AI-drafted posts approved by clients). No vulnerable populations as direct data subjects; all users are business professionals.
- Third-party dependency: Five LLM providers (OpenAI, Anthropic, Perplexity, Google Gemini, DataForSEO/SerpAPI). Dependency risk is HIGH until all providers are confirmed at Gate 3→4.

**MEASURE**
- Accuracy metrics: Probe-query citation detection accuracy (false positive/negative rate); sentiment classification accuracy. Establish baseline measurement plan at Gate 3→4.
- Bias evaluation: Required at Gate 6→7. See bias conditions below.
- Drift monitoring: Must cover both model drift (per provider) and GEO Score calibration drift as market conditions change.

**MANAGE**
- Human oversight: Structurally satisfied by draft-and-confirm for all content generation features (GEO-3, GEO-4). GEO-1 (probe queries) and GEO-2 (score computation) are fully automated but results are informational only — no automated external action.
- Output safety controls: Must be specified per feature at Gate 3→4.
- Incident logging: Required for all six features before Gate 7.

---

### Conditions — Gate 2→3 (GEO Platform)

| Ref | Severity | Requirement | Owner | Due |
|---|---|---|---|---|
| GEO-A1 | HIGH | FTC Reddit disclosure prompt framing: AC-C5-4 prompt must be updated in UX specification to reflect the FTC Endorsement Guides standard (disclosure required whenever there is a material commercial interest, not only when the subreddit's rules require it). UX specification must also clarify whether the AI-drafting disclosure must appear in the body of the Reddit post itself (not just confirmed in the platform UI). Confirm with external counsel before Gate 3→4 locks C5 architecture. Owner: ux-designer (AC-C5-4 UX spec update) + founder (external counsel engagement). Due: Gate 3→4 (before C5 architecture is locked). | ux-designer; founder | Gate 3→4 |
| GEO-A2 | HIGH | Content generation system-prompt constraints (must be documented in architecture §12 for Gate 3→4): (a) competitor brand names and competitor benchmark data must NOT be injected as direct input into content-generation prompts; (b) system prompt must explicitly prohibit comparative claims naming specific competitors without sourced factual basis; (c) system prompt must instruct the model to use only client-provided factual context and flag gaps rather than fabricate specific facts. These constraints are non-negotiable and must appear in the hardcoded system prompt, not as client-configurable parameters. Owner: system-architect. Due: Gate 3→4. | system-architect | Gate 3→4 |
| GEO-A3 | HIGH | Multi-provider GPAI deployer obligation checklist: For each of the five LLM/API providers (OpenAI GPT-4o, Anthropic Claude, Perplexity, Google Gemini, DataForSEO/SerpAPI), system-architect must confirm at Gate 3→4: (a) EU transfer mechanism (DPA + SCC or EU data residency); (b) ZDR or equivalent data-use terms confirming inference inputs are not retained for training; (c) permissibility of brand-probe-query benchmarking use case under provider ToS; (d) GPAI tier (systemic-risk threshold check). Perplexity is BLOCKED for EU user queries until (a) and (b) are confirmed. Owner: system-architect + legal-privacy-officer. Due: Gate 3→4. | system-architect; legal-privacy-officer | Gate 3→4 |
| GEO-A4 | MEDIUM | Audit report statistical hedging language: UX specification (Gate 4→5) must require that all audit report language uses hedged statistical framing (e.g., "Based on a sample of N queries across [X] LLM providers, your brand was cited in Y% of test responses"). No absolute "you are/are not cited" language. The AI-generated label (AC-C1-8) must cover all interpretive analysis elements, not just raw citation counts. Owner: ux-designer at Gate 4→5. Due: Gate 4→5. | ux-designer | Gate 4→5 |
| GEO-A5 | MEDIUM | Sentiment classification quality: system-architect must specify at Gate 3→4 whether GEO-5 uses a dedicated sentiment classification prompt (with few-shot examples) or the same general-purpose content generation LLM. A dedicated sentiment classification approach (separate prompt, purpose-specific) is required to achieve acceptable classification accuracy. The classification approach must be documented in architecture §12. Owner: system-architect. Due: Gate 3→4. | system-architect | Gate 3→4 |
| GEO-A6 | MEDIUM | Generation audit log for all six AI features: The architecture must specify a generation event log (equivalent to the social-scheduling `generation_log`) covering all six GEO AI features — including probe-query runs (GEO-1), score computation events (GEO-2), strategy generation events (GEO-3), content drafts (GEO-4), sentiment classification events (GEO-5), and entity inconsistency detection runs (GEO-6). Each log entry must capture: feature ID, input hash or summary, provider/model used, model version, output hash or summary, timestamp, tenant ID. Owner: system-architect at Gate 3→4. Due: Gate 3→4. | system-architect | Gate 3→4 |
| GEO-A7 | MEDIUM | Art. 50 transparency deadline: All Art. 50 disclosure controls must be live and operational before first EU user accesses any GEO platform feature. August 2026 is the full-applicability deadline. V1 launch must precede this deadline with all six Art. 50 labels implemented. If launch is delayed to after August 2026, a compliance review is required before EU launch. Owner: product-manager (launch timing); devops-engineer (Art. 50 controls verified operational at Gate 7). Due: Gate 7. | product-manager; devops-engineer | Gate 7 |
| GEO-A8 | MEDIUM | Bias and fairness tests at Gate 6→7: Bias testing must cover all six GEO AI features, not only content generation. Required at Gate 6→7: (a) probe-query execution — verify no systematic bias in which brand categories or query types produce different citation detection rates across languages and locales; (b) sentiment classification — verify accuracy parity across English US, English EU, and at least one non-English locale; (c) content generation — replicate A8 bias baseline approach (30 prompts, 3 locales) for GEO-4 content types (blog, LinkedIn, FAQ, Reddit). No formal disparate-impact metric required (no protected-class decisions made); qualitative review is sufficient for this product's risk tier. Owner: qa-engineer at Gate 6→7. Due: Gate 6→7. | qa-engineer | Gate 6→7 |
| GEO-A9 | MEDIUM | Model cards: One model card per AI feature (GEO-1 through GEO-6) must be produced at Gate 6→7 in `docs/compliance/model-cards/`. Cards must name the LLM provider(s), data flows, intended use, limitations, human oversight model, and EU AI Act Art. 50 compliance approach per feature. Owner: ai-ethics-reviewer at Gate 6→7. Due: Gate 6→7. | ai-ethics-reviewer | Gate 6→7 |
| GEO-A10 | LOW | AI ethics documentation in model cards — fairness acknowledgment: Each model card must include a section acknowledging the industry-level fairness concern (GEO optimization advantages brands with marketing budgets) and the platform's mitigants (free audit tier, prohibition of fabrication, prohibition of astroturfing). This is an ethics disclosure, not a regulatory obligation. Owner: ai-ethics-reviewer at Gate 6→7. Due: Gate 6→7. | ai-ethics-reviewer | Gate 6→7 |

---

### NIST AI RMF Status Table — GEO Platform (Gate 2→3 Opening Position)

| Function | Item | Status | Owner | Due |
|---|---|---|---|---|
| GOVERN | AI use policy (GEO scope) | OPEN | product-manager | Gate 7 |
| GOVERN | Accountability map — six features, five providers | OPEN | system-architect | Gate 3→4 |
| GOVERN | AI incident response — six features | OPEN | devops-engineer | Gate 7 |
| MAP | Context / use-case (six features) | CLOSED | ai-ethics-reviewer | Gate 2→3 |
| MAP | Third-party dependency (five providers) | OPEN | system-architect | Gate 3→4 |
| MAP | Stakeholder impact | CLOSED (documented above) | ai-ethics-reviewer | Gate 2→3 |
| MEASURE | Accuracy / quality metrics | OPEN — probe-query accuracy; sentiment accuracy; content quality | system-architect | Gate 3→4 |
| MEASURE | Bias / fairness baseline | OPEN | qa-engineer | Gate 6→7 |
| MEASURE | Drift monitoring (multi-provider) | OPEN | devops-engineer | Gate 7 |
| MANAGE | Human oversight (draft-and-confirm for GEO-3, GEO-4) | PARTIAL — informational features (GEO-1, GEO-2) do not require approval but must have contestation pathway | system-architect + ux-designer | Gate 3→4 / Gate 4→5 |
| MANAGE | Output safety controls (six features) | OPEN | system-architect | Gate 3→4 |
| MANAGE | Incident logging | OPEN | devops-engineer | Gate 7 |
| MANAGE | Model cards (six features) | OPEN | ai-ethics-reviewer | Gate 6→7 |

---

### Approval — Gate 2→3 (GEO Pivot)

- Author: ai-ethics-reviewer
- Date: 2026-05-18
- EU AI Act classification: LIMITED-RISK (Art. 50) — all six features. No prohibited practice. No Annex III high-risk.
- SB 24-205 re-confirmation: NOT APPLICABLE — formal re-determination documented above.
- Conditions GEO-A1 (HIGH) and GEO-A2 (HIGH) and GEO-A3 (HIGH): must be resolved at or before Gate 3→4. GEO-A1 requires FTC external counsel confirmation and UX spec update before C5 Reddit module architecture is locked. GEO-A2 requires system-prompt constraints documented in architecture §12. GEO-A3 requires multi-provider GPAI deployer checklist.
- Verdict: APPROVED_WITH_CONDITIONS (see gate-log for formal verdict)
- Next update: Gate 3→4 (system-architect confirms all five providers; GEO-A2 system prompt constraints; GEO-A5 sentiment classification approach; GEO-A6 generation audit log; GEO-A3 deployer checklist)
