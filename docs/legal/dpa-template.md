# Data Processing Agreement (DPA) — Ozvor

**Live page**: https://ozvor.com/legal/dpa (source of record: `apps/web/src/app/legal/dpa/page.tsx`)
**Last updated (live)**: 13 June 2026
**Internal mirror refreshed**: 2026-07-10 (issue #213 — entity/brand refresh)
**Status**: LIVE (accepted by use of the Service). Counsel review required before paid EU/BR launch.

> This file is the internal markdown mirror of the live DPA. The live page is the operative customer-facing text; keep this mirror in sync when the page changes. Grounded in `docs/compliance/ropa.md` + `dpia.md`. The prior pre-launch template (2026-05-17, "Organic Posts, Lda" / Portuguese law / Tribunal Cível de Lisboa — superseded) is preserved in git history.

---

## TL;DR (≤100 words)

Where Ozvor processes personal data on behalf of a business customer, **the customer is the controller and Ozvor is the processor** (GDPR Art. 28, LGPD, US state laws). Processing is limited to providing the Service: GEO audits, Ozvor AI Visibility Score, benchmarking, plans/drafts, monitoring, billing, support. Audit prompts are synthetic by design (no personal data; no competitor names sent to AI providers). Sub-processors are the 11 listed at ozvor.com/legal/sub-processors; 30-day advance notice for changes. Governed by the Terms of Service and **the laws of Brazil**. Contact: **dpo@ozvor.com**.

---

**Intro.** This DPA forms part of the Terms of Service between you (the "Customer", acting as data controller) and Ozvor (the "Processor") and applies where we process personal data on your behalf under the GDPR (Art. 28), the LGPD, and applicable US state laws. By using the Service you accept this DPA on behalf of your organisation.

## 1. Roles

For personal data you submit or that we process to provide the Service to you (your account staff, your brand data), you are the **controller** and Ozvor is the **processor**. For our own operational data (e.g. billing relationship), Ozvor is an independent controller as described in the [Privacy Policy](https://ozvor.com/privacy-policy).

## 2. Subject-matter, nature and purpose

We process personal data only to provide the Service: running GEO audits, computing the Ozvor AI Visibility Score, benchmarking competitors, generating plans and drafts, monitoring, billing, and support. By design, audit prompts are synthetic and contain no personal data; competitor names are never sent to AI providers.

## 3. Duration, categories of data and data subjects

**Duration:** for the term of your subscription plus the retention periods in the Privacy Policy. **Data subjects:** your authorised staff/users. **Categories:** business contact data (name, email), account/role identifiers, brand and domain data, and configuration. We do not intend to process special-category data and ask that you not submit it.

## 4. Our obligations as processor

- Process personal data only on your documented instructions (these Terms and your use of the Service);
- Ensure persons authorised to process are bound by confidentiality;
- Implement appropriate technical and organisational measures (Section 6);
- Assist you, taking into account the nature of processing, with data-subject requests and with your obligations on security, breach notification, and DPIAs;
- At your choice, delete or return personal data at the end of services, save where retention is required by law;
- Make available information needed to demonstrate compliance and allow for audits (Section 7).

## 5. Sub-processors

You authorise us to engage the sub-processors listed in our [Privacy Policy §4](https://ozvor.com/privacy-policy) (Supabase, Anthropic, OpenAI, Google, Perplexity [US only], DataForSEO/SerpAPI, Stripe, Resend, Railway, Cloudflare). We impose data-protection obligations on each by contract and remain responsible for their performance. We will give advance notice of new sub-processors and a reasonable opportunity to object.

## 6. Security measures

We maintain: multi-tenant isolation via forced row-level security; encryption in transit (TLS) and at rest; AES-256-GCM encryption of stored API keys; append-only audit logging; least-privilege access; SSRF-hardened outbound fetching; prompt-injection sanitisation; and no-training AI inference per provider API terms. Measures are reviewed and may be updated provided protection is not materially reduced.

## 7. Audits and assistance

On reasonable request and subject to confidentiality, we will provide information to demonstrate compliance with this DPA and support audits no more than once per year (or as required by a supervisory authority), via documentation and questionnaires where sufficient.

## 8. International transfers

Where processing involves transfers outside the EEA/UK or Brazil, we rely on EU-hosted inference paths, Standard Contractual Clauses, and/or Data Privacy Framework certification, as described in the Privacy Policy. EU users' inference is routed to EU-hosted providers and Perplexity is excluded for EU users until safeguards are confirmed.

## 9. Personal data breach

We will notify you without undue delay after becoming aware of a personal-data breach affecting your data, with the information you reasonably need to meet your notification duties (including, where applicable, ANPD/supervisory-authority timelines).

## 10. Liability and order of precedence

This DPA is governed by the Terms of Service and the laws of Brazil. In case of conflict on data-protection matters, this DPA prevails over the Terms. Liability is subject to the limitations in the Terms. Contact: dpo@ozvor.com.

---

_Customers requiring a countersigned DPA: contact dpo@ozvor.com — a manual review and signature process is a founder-flagged operational requirement (see Legal STATE). This mirror does not constitute legal advice._
