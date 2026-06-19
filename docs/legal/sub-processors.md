# Sub-processors — Organic Posts

**Effective date**: 2026-05-17
**Version**: 0.1

This page lists all sub-processors that may process personal data on behalf of Organic Posts customers (as controller or processor). It is updated when sub-processors are added, removed, or materially changed. Customers subscribed to DPA notifications will be emailed 30 days before any material change.

**Controller establishment note**: Organic Posts, Lda is established in Portugal (EU). Sub-processors below are listed with their location and transfer mechanism. As an EU-established controller, transfers to non-EU sub-processors (Anthropic US, Stripe US fallback) rely on the EU-US Data Privacy Framework or Standard Contractual Clauses (SCCs).

This list matches the architecture documented in `docs/03-architecture.md` §11 and the ROPA (`docs/compliance/ropa.md`).

---

## Sub-processor Table

| Sub-processor | Purpose | Data processed | Location / Region | Transfer mechanism (EU → third country) | Customer DPA coverage | Their privacy notice |
|---|---|---|---|---|---|---|
| **Anthropic** | AI inference — generates post drafts from user-supplied topic inputs. Zero Data Retention (ZDR): prompts and responses are not stored or used for training. | Topic/prompt text (user-supplied; no other PII sent to LLM) | EU tenants: AWS Bedrock eu-central-1 (EU). US tenants: Anthropic API us-east-1 (US). | EU path: inference stays in EU — no third-country transfer. US path: domestic US — no mechanism required. DPF certified; SCCs (Module 2) available. | Covered by Organic Posts DPA (Art. 28); ZDR addendum in place | anthropic.com/privacy |
| **Supabase** | Database (Postgres) and authentication | Account data (name, email, password hash, Auth UID), OAuth tokens (encrypted), post drafts, scheduling records, compliance flags, audit logs | EU tenants: eu-central-1 (EU-hosted Supabase project). US tenants: us-east-1 (US project). | EU project: no transfer outside EU. US project: domestic US. | Covered by Organic Posts DPA; Supabase DPA available at supabase.com/dpa | supabase.com/privacy |
| **Railway** | Application hosting — runs the Next.js frontend and Hono API backend | Traffic data, environment variables (secrets managed separately), logs as configured | [FOUNDER: confirm Railway region selection for EU vs US tenants] | [To be confirmed based on region selection — SCCs if non-EU] | Railway DPA at railway.app — confirm execution before EU launch | railway.app/legal/privacy |
| **Resend** | Transactional email delivery — account notifications, DSR acknowledgments, failed-publish alerts, DPA confirmation emails | Recipient email address, notification content | EU infrastructure selected for EU users | SCCs where applicable | Resend DPA — confirm execution before EU launch | resend.com/legal/privacy-policy |
| **Stripe** | Payment processing and subscription management — billing, invoicing, subscription lifecycle | Account name, email, Stripe customer ID (in Organic Posts DB); full card/payment data is Stripe-hosted and never touches Organic Posts servers | Stripe US-hosted | SCCs (Module 2) + DPF certified. Note: SCC module determination recommended via external counsel (see DPIA). | Stripe DPA at stripe.com/legal/dpa | stripe.com/privacy |
| **Plausible Analytics** | Privacy-friendly website and application analytics. No cookies. No personal data. No cross-site tracking. | Aggregate metrics only — no personal data processed | EU-hosted (Plausible is based in the EU) | No personal data transferred — no mechanism required | Not applicable (no personal data processing) | plausible.io/privacy |

---

## DPA Execution Status

| Sub-processor | DPA signed | Date | Notes |
|---|---|---|---|
| Anthropic | Pending | — | ZDR addendum required; DPA (Art. 28 / SCCs Module 2) available via Anthropic enterprise. Must be signed before EU launch. |
| Supabase | Pending | — | DPA available at supabase.com/dpa. Must be signed before EU users onboard. |
| Railway | Pending | — | Review required; confirm EU region availability. |
| Resend | Pending | — | DPA review required before EU launch. |
| Stripe | Pending | — | Stripe DPA covers Art. 28. SCC module determination to be confirmed by counsel. |
| Plausible Analytics | Not required | — | No personal data processed. |

**All DPAs must be executed before 2026-05-17 (landing page launch).** Owner: vp-legal to track; founder to sign.

---

## Change Notification

We will provide at least 30 days' advance notice of any material changes to this sub-processor list via email to customers who have executed a DPA with Organic Posts. Objections to new sub-processors must be submitted to privacy@organicposts.ai within the notice period.

---

_This document is maintained by the Legal department. Last reviewed: 2026-05-04. It does not constitute legal advice._
