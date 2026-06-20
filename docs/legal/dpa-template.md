# Data Processing Agreement (DPA) — Organic Posts

**Template version**: 0.1-pre-launch
**Governing regulation**: GDPR Art. 28; supplemented by SCCs where applicable
**Effective date**: [Date of customer acceptance — auto-stamped at onboarding DPA modal]

This DPA is incorporated by reference into the Terms of Service between **Organic Posts, Lda** — a Sociedade por Quotas registered in Portugal (registration number and registered office to be confirmed at incorporation) — and the Customer. For EU customers, acceptance is recorded at onboarding via the DPA modal (CI-1, as specified in `docs/04-ux.md` §6). For customers requiring a countersigned DPA, contact privacy@organicposts.ai.

**Note on Art. 28 chain**: when EU customers sign this DPA, Organic Posts is processor on their behalf for the social publishing data they instruct us to process. When Organic Posts contracts Anthropic, Supabase, Stripe, and other sub-processors, Organic Posts is the controller (or processor — see role in Part 1) entering controller-to-processor or processor-to-sub-processor terms with them. The Art. 28 chain stays the same regardless of Organic Posts' Portugal-establishment.

---

## TL;DR (≤100 words)

Organic Posts processes personal data as a processor on behalf of the Customer (controller) solely to provide the social media drafting and scheduling service. Sub-processors are listed at organicposts.ai/sub-processors. Anthropic operates under Zero Data Retention — content is not retained or used for training. Data stays in EU (eu-central-1) for EU tenants. Data subject rights requests received by Organic Posts on behalf of the Customer will be forwarded within 48 hours. This DPA implements GDPR Art. 28 requirements and is accepted in-product at onboarding.

---

## Part 1 — Definitions

**"Agreement"** means the Terms of Service between Organic Posts and the Customer, including this DPA.

**"Controller"** means the Customer — the entity that determines the purposes and means of processing personal data.

**"Processor"** means Organic Posts — the entity that processes personal data on behalf of the Controller.

**"Data Subject"** means the natural person whose personal data is processed.

**"Personal Data"** has the meaning given in GDPR Art. 4(1).

**"Processing"** has the meaning given in GDPR Art. 4(2).

**"Sub-processor"** means any third party engaged by Organic Posts to process personal data in connection with the service.

**"GDPR"** means Regulation (EU) 2016/679 (General Data Protection Regulation).

---

## Part 2 — Subject Matter, Duration, Nature, and Purpose

**2.1** Organic Posts processes personal data on behalf of the Customer only to:
- Generate AI post drafts from topic inputs provided by the Customer's users
- Schedule and publish approved posts to connected social media platforms
- Deliver transactional notifications related to the service
- Maintain audit and compliance records as required by law

**2.2** Processing is limited to the duration of the Agreement plus any applicable retention period under law.

**2.3** The Customer instructs Organic Posts to process personal data solely for the purposes above. Any additional instruction requires written agreement.

---

## Part 3 — Categories of Data Subjects and Personal Data

| Data subjects | Personal data categories |
|---|---|
| Customer's account users (SMB operators, managers, editors) | Name, email, password hash (Organic Posts only — not shared), Supabase Auth UID, role, OAuth access/refresh tokens (encrypted AES-256-GCM), topic inputs, post drafts, scheduling records |
| Customer's end audience (third parties mentioned in content) | Not processed by Organic Posts as a distinct category; content is Customer-generated and Customer-approved |

---

## Part 4 — Processor Obligations (Organic Posts)

Organic Posts shall:

**4.1** Process personal data only on documented instructions from the Customer (including via in-app configuration), unless required by EU or Member State law.

**4.2** Ensure that personnel authorized to process personal data are committed to confidentiality.

**4.3** Implement appropriate technical and organizational measures (TOMs) as required by GDPR Art. 32, including: AES-256 encryption at rest, TLS 1.2+ in transit, RBAC with least-privilege access, session JWT rotation, audit logging, and rate-limiting on authentication endpoints.

**4.4** Respect the conditions for engaging sub-processors (Part 5 below).

**4.5** Assist the Customer, taking into account the nature of processing, in responding to Data Subject Rights requests under GDPR Arts. 15–22. DSR requests received by Organic Posts that belong to the Customer's scope will be forwarded to the Customer's designated contact within 48 hours.

**4.6** Assist the Customer with obligations under GDPR Arts. 32–36 (security, breach notification, DPIA, prior consultation), taking into account the nature of processing and the information available to Organic Posts.

**4.7** At the Customer's choice, delete or return all personal data on termination of the Agreement, and delete existing copies unless EU or Member State law requires storage. Deletion timelines follow the retention schedule in the Privacy Policy.

**4.8** Make available all information reasonably necessary to demonstrate compliance with GDPR Art. 28, and allow for and contribute to audits conducted by the Customer or a mandated auditor, with reasonable notice and subject to confidentiality obligations.

---

## Part 5 — Sub-processors

**5.1** The Customer grants general authorization for Organic Posts to engage the sub-processors listed at organicposts.ai/sub-processors.

**5.2** Organic Posts will notify the Customer at least 30 days in advance of any intended changes to the sub-processor list (additions or replacements). The Customer may object within the notice period by contacting privacy@organicposts.ai. If the Customer objects and no solution can be reached, the Customer may terminate the Agreement.

**5.3** Organic Posts imposes data protection obligations on each sub-processor that are equivalent to those in this DPA, by written agreement (Art. 28(4) GDPR).

**5.4** Anthropic (AI inference) operates under Zero Data Retention — prompt inputs and generated outputs are not stored by Anthropic and are not used for model training.

---

## Part 6 — International Data Transfers

**6.1** For EU tenants: personal data is processed within the EU (Supabase eu-central-1; Anthropic via AWS Bedrock eu-central-1; Plausible EU-hosted). Where transfers to third countries are necessary (e.g., Stripe):
- Standard Contractual Clauses (Module 2: Controller to Processor) are in place
- Where available, EU-US Data Privacy Framework (DPF) certification is relied upon in addition

**6.2** Transfer impact assessments have been conducted and are available to the Customer on request.

---

## Part 7 — Security Incident Notification

Organic Posts will notify the Customer without undue delay and within 72 hours of becoming aware of a personal data breach affecting Customer data, to the extent required by GDPR Art. 33. Notification will be sent to the account email on record or to a designated security contact if provided. The notification will include, to the extent available: nature of the breach, categories and approximate number of data subjects and records affected, likely consequences, and measures taken or proposed.

---

## Part 8 — Controller Obligations

The Customer as Controller represents that:
- It has a valid lawful basis for the processing activities it instructs Organic Posts to perform
- It will provide required privacy notices to Data Subjects
- It has the authority to enter into this DPA

---

## Part 9 — Governing Law

This DPA is governed by Portuguese law, consistent with the Terms of Service (Section 13). Competent court: Tribunal Cível de Lisboa. For EU customers, GDPR applies as mandatory law regardless of governing law choice.

---

## Part 10 — Acceptance

For EU customers onboarding via the application: this DPA is accepted electronically at the DPA modal screen (onboarding step CI-1). The timestamp, DPA version, user ID, and IP address are recorded in the Organic Posts database (Art. 5(2) accountability).

For customers requiring a countersigned physical or PDF DPA: contact privacy@organicposts.ai. Note that a manual counter-signature process requires a human review step and may take up to 5 business days. This is a founder-flagged operational requirement — see Legal STATE.

---

_This template is prepared by the VP Legal agent. It must be reviewed by qualified legal counsel before the service goes live. It does not constitute legal advice._
