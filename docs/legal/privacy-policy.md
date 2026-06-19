# Privacy Policy — Organic Posts

**Effective date**: 2026-05-17
**Version**: 0.1-pre-launch
**Last updated**: 2026-05-04

---

## TL;DR (≤150 words)

Organic Posts collects email, name, OAuth tokens, social content drafts, and usage telemetry to operate its AI-assisted social posting service. For EU users: lawful basis is contract (Art. 6(1)(b)) for core service data and legal obligation (Art. 6(1)(c)) for compliance records. Retention matches the ROPA: account life plus a 30-day grace period for most data, 3 years for compliance records. Sub-processors include Anthropic, Supabase, Railway, Resend, Stripe, and Plausible Analytics. Anthropic operates under Zero Data Retention — your content is not used to train AI models. EU-to-third-country transfers use SCCs or the EU-US Data Privacy Framework. EU users have full GDPR Art. 15–22 rights; California residents have CCPA/CPRA rights including the right to opt out of sale (we do not sell data). DSR requests: privacy@organicposts.ai or /account/data-privacy.

---

## 1. Controller Identity

**Organic Posts, Lda — Portugal (registration TBD)**, trading as Organic Posts
Website: organicposts.ai
Privacy contact: privacy@organicposts.ai

As Organic Posts, Lda is established in Portugal (EU), no Article 27 representative is appointed under GDPR — direct contact via privacy@organicposts.ai.

**Data Protection Officer:** Not mandatory at current scale (no large-scale systematic monitoring, no special category data). Will be reassessed at Series A or if headcount exceeds 250.

---

## 2. Scope of This Policy

This Policy applies to:
- Visitors to organicposts.ai (including the pre-launch waitlist page)
- Users of the Organic Posts application (post-launch)
- EU and US data subjects in all 50 states

During the pre-launch (waitlist) period, only waitlist data is collected. See the Waitlist Privacy Notice for a shorter standalone version.

---

## 3. Data We Collect and Why

| Category | Examples | Lawful basis (EU) | US basis | Retention |
|---|---|---|---|---|
| Account identity | Name, email, password hash | Art. 6(1)(b) — contract | Necessary for service | Account life + 30 days |
| Authentication tokens | Session JWTs, Supabase Auth UID | Art. 6(1)(b) — contract | Necessary for service | Session expiry / account life |
| OAuth social tokens | LinkedIn/Instagram access + refresh tokens (AES-256-GCM encrypted) | Art. 6(1)(b) — contract | Necessary for service | Until revoked or account deletion |
| Social content | Topic inputs, AI-generated drafts, approved posts | Art. 6(1)(b) — contract | Necessary for service | Account life + 30 days |
| Usage telemetry | Page views, feature interactions (no PII — Plausible Analytics) | Art. 6(1)(f) — legitimate interest | Disclosed purpose | Plausible retention (rolling 2 years) |
| Billing data | Name, email, Stripe customer ID (card data is Stripe-hosted) | Art. 6(1)(b) — contract | Necessary for service | Account life; card data per Stripe policy |
| Compliance records | DPA acknowledgment, CCPA opt-out flag, DSR logs | Art. 6(1)(c) — legal obligation | Legal compliance | 3 years minimum |
| Audit logs | Hashed user/tenant ID, event type, IP address | Art. 6(1)(c) + 6(1)(f) | Legal compliance / security | 3 years (audit); 90 days hot / 1 year archive (operational) |
| Transactional email | Email address, notification content | Art. 6(1)(b) + 6(1)(c) | Necessary for service | Per Resend retention policy |

We do not collect special category data (Art. 9 GDPR), biometric data, or data from children under 16.

---

## 4. AI Features and Data Use

The AI drafting feature is powered by **Anthropic Claude Sonnet**, accessed via:
- AWS Bedrock, eu-central-1 region — for EU-based tenants
- Anthropic direct API, us-east-1 region — for US-based tenants

**Zero Data Retention (ZDR):** Anthropic operates under a ZDR agreement with Organic Posts. Your topic inputs and generated drafts are not stored by Anthropic and are not used to train any AI model.

**EU AI Act Article 50 disclosure:** AI-generated content is labeled as such within the application. The post draft review screen displays a visible AI disclosure badge on every draft.

**No automated decision-making:** The service does not make automated decisions with legal or similarly significant effects. Every post requires explicit human approval before it is scheduled or published (draft-and-confirm model). GDPR Art. 22 does not apply.

**California SB-942:** The AI feature uses a generative AI system. Users may request information about the AI system's training data and capabilities by contacting privacy@organicposts.ai or via the link provided in the application.

---

## 5. Sub-processors

We use the following sub-processors that may process personal data on our behalf. Full details including transfer mechanisms are on our [Sub-processors page](organicposts.ai/sub-processors).

| Sub-processor | Purpose | Region | Transfer mechanism |
|---|---|---|---|
| Anthropic | AI inference (ZDR — no retention) | EU (Bedrock eu-central-1) / US | ZDR; DPF certified; SCCs available |
| Supabase | Database + authentication | eu-central-1 (EU users); us-east-1 (US users) | EU project = no transfer; US project = domestic |
| Railway | Application hosting | [CONFIRM: EU region for EU users] | SCCs if non-EU hosting |
| Resend | Transactional email | EU infrastructure for EU users | SCCs |
| Stripe | Payment processing | US-hosted | SCCs + DPF certified |
| Plausible Analytics | Privacy-friendly analytics (no PII, no cookies) | EU-hosted | No personal data transferred |

We will update this page when sub-processors are added, removed, or materially changed.

---

## 6. International Data Transfers (EU)

For EU data subjects, personal data is primarily processed within the EU (Supabase eu-central-1, Anthropic via Bedrock eu-central-1, Plausible EU-hosted). Where transfers to the US occur (Stripe, Anthropic as fallback):
- We rely on Standard Contractual Clauses (SCCs) adopted by the European Commission
- Where available, we also rely on EU-US Data Privacy Framework (DPF) certification
- Transfer impact assessments have been conducted as part of our DPIA (on file)

---

## 7. Your Rights

### EU / EEA / UK Data Subjects (GDPR / UK GDPR)
You have the right to:
- **Access** (Art. 15) — receive a copy of your personal data
- **Rectification** (Art. 16) — correct inaccurate data
- **Erasure** (Art. 17) — request deletion ("right to be forgotten")
- **Restriction** (Art. 18) — restrict processing in specified circumstances
- **Portability** (Art. 20) — receive your data in a machine-readable format
- **Object** (Art. 21) — object to processing based on legitimate interests
- **Lodge a complaint** — with your national supervisory authority (e.g., the Irish DPC if we are Ireland-registered, or your local SA)

Response deadline: 30 days from receipt of a verifiable request.

### California Residents (CCPA/CPRA)
You have the right to:
- **Know** what personal information we collect, use, or share
- **Delete** your personal information (with exceptions)
- **Correct** inaccurate personal information
- **Opt out of Sale or Sharing** — we do not sell or share personal information for cross-context behavioral advertising. The "Do Not Sell or Share My Personal Information" link is available in the application footer and Privacy Settings.
- **Limit Use of Sensitive PI** — we do not collect sensitive personal information as defined by CPRA beyond what is strictly necessary to provide the service.
- **Non-discrimination** — we will not discriminate against you for exercising these rights

Response deadline: 45 days from receipt of a verifiable request (one 45-day extension possible).

### Other US State Rights
We honor equivalent rights for residents of Virginia (VCDPA), Colorado (CPA), Connecticut (CTDPA), Texas (TDPSA), and other states with comprehensive privacy laws in effect. Contact privacy@organicposts.ai.

### How to Submit a Request
- In-app: Account > Data & Privacy (/account/data-privacy)
- Email: privacy@organicposts.ai
- We will verify your identity before processing any request. Identity verification does not require unnecessary data collection.

---

## 8. Cookies and Tracking

We use **Plausible Analytics** — a privacy-first analytics tool that does not use cookies, does not fingerprint browsers, and does not collect or store any personally identifiable information. No cookie consent banner is required for Plausible under the ePrivacy Directive.

If we add additional analytics or advertising tools in the future (e.g., Google Analytics 4), this policy will be updated, a cookie banner will be implemented, and consent will be obtained before those tools activate. See our Cookie Policy for full details.

---

## 9. Children's Privacy

The service is not directed to individuals under 16. We do not knowingly collect personal data from anyone under 16. If we become aware that we have collected data from a minor, we will delete it promptly. Contact privacy@organicposts.ai if you believe we have collected data from a minor.

---

## 10. Security

We implement appropriate technical and organizational measures including: AES-256 encryption at rest, TLS in transit, RBAC with least-privilege, session JWT rotation, IP-rate limiting on auth endpoints, and audit logging of sensitive actions. See our threat model (internal) for full details.

---

## 11. Changes to This Policy

We will notify users of material changes via email and in-app notification at least 30 days before the change takes effect. The effective date at the top of this document will be updated. Continued use after the effective date constitutes acceptance.

---

## 12. Contact

Privacy inquiries: privacy@organicposts.ai (email forwarding to be configured via Cloudflare; founder operational task this week)
Postal address: Organic Posts, Lda — registered office in Portugal (to be confirmed at incorporation)
EU Representative: Not applicable — controller is established in Portugal (EU).

---

_This document is a pre-launch draft. It must be reviewed by qualified legal counsel before the service goes live. It does not constitute legal advice._
