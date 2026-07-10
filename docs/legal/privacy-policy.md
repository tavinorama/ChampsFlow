# Privacy Policy — Ozvor

**Live page**: https://ozvor.com/privacy-policy (source of record: `apps/web/src/app/privacy-policy/page.tsx`)
**Last updated (live)**: 13 June 2026
**Internal mirror refreshed**: 2026-07-10 (issue #213 — entity/brand refresh)
**Status**: LIVE. Counsel review required before paid EU/BR launch. Grounded in `docs/compliance/ropa.md` + `regulatory-map.md`.

> This file is the internal markdown mirror of the live Privacy Policy. The live page is the operative customer-facing text; keep this mirror in sync when the page changes. The prior pre-launch draft (2026-05-17, "Organic Posts, Lda / Portugal" — superseded) is preserved in git history.

---

## TL;DR (≤150 words)

**Ozvor** — trade name of a Brazilian MEI, **CNPJ 67.609.444/0001-08**, registered office Rua José Borges Abrantes, nº 1, Centro, Muriaé — MG, CEP 36.880-063, Brazil — is the controller for account data; for customer-directed processing see the DPA. Data is minimised by design: audit prompts are synthetic (no personal data; competitor names never sent to AI providers). Collected: account email/role, brand/domain data, audit evidence, billing identifiers (no card data), encrypted BYOK keys, lead-capture emails. Sub-processors: Supabase, Anthropic, OpenAI, Google (Gemini), Perplexity (US only), DataForSEO/SerpAPI, Stripe, Resend, Railway, Cloudflare. Transfers rely on EU-hosted paths, SCCs, and/or DPF. Retention: citation evidence 90 days; scores 12 months; account data life + 30 days. Rights under LGPD, GDPR, and CCPA/CPRA via /legal/dsr-request or **dpo@ozvor.com**; complaints to ANPD, EU supervisory authorities, or the CPPA. We do not sell personal information.

---

**Intro.** This Policy explains how Ozvor (home jurisdiction Brazil) collects, uses, shares, and protects personal data, and your rights under the LGPD (Brazil), GDPR (EU/EEA & UK), and CCPA/CPRA (California) and other US state laws. Ozvor is the data controller for account data; for data you process about your own customers via the Service, see our Data Processing Agreement.

## 1. Who is responsible (controller)

Ozvor is the controller of personal data described here. Ozvor is the trade name of a Brazilian individual micro-entrepreneur (MEI), registered under CNPJ 67.609.444/0001-08, with registered office at Rua José Borges Abrantes, nº 1, Centro, Muriaé — MG, CEP 36.880-063, Brazil. Privacy contact: dpo@ozvor.com. An EU representative (GDPR Art. 27) and a Brazilian Encarregado (LGPD DPO) are appointed before serving EU and Brazilian markets respectively.

## 2. What we collect and why

We minimise personal data. By design, our audit prompts are synthetic category questions plus your own brand name — they contain no personal data, and competitor names are never sent to AI providers.

| Data | Purpose | Lawful basis (GDPR / LGPD) |
|---|---|---|
| Account: email, role, Supabase user ID | Create your account, passwordless login | Contract (Art. 6(1)(b) / Art. 7(V)) |
| Brand profile: brand name, domain, settings | Run audits and monitoring | Contract |
| Audit evidence: synthetic prompts, citation flags, source URLs | Compute your Ozvor AI Visibility Score | Contract |
| Off-site signals (public sources) | Measure brand authority | Legitimate interests (Art. 6(1)(f) / Art. 7(IX)) |
| Billing: name, email, Stripe ID, region (no card data stored by us) | Process payments | Contract |
| BYOK API keys (encrypted, AES-256-GCM) | Run audits with your own provider keys | Contract |
| Lead capture: email + test result (Invisibility Test) | Send your scorecard and follow up | Consent / legitimate interests |
| Transactional email, support, DSR records | Operate the Service, meet legal duties | Contract / legal obligation |

## 3. AI processing and transparency

Audits send synthetic prompts to AI providers under no-training terms per provider API agreements; for EU users, we minimise transfers and disclose all sub-processors (see §4), Perplexity is excluded until transfer safeguards are confirmed, and EU-region inference is on our roadmap. AI-generated content is always labelled as AI-generated (EU AI Act Art. 50) and requires your human review before any use. We do not use your data to train AI models, and our providers are contractually restricted from doing so on your content.

## 4. Who we share with (sub-processors)

We share data only with vetted processors acting on our instructions:

- **Supabase** — authentication + database (EU region for EU users)
- **Anthropic, OpenAI, Google (Gemini)** — AI audit inference (EU-hosted paths for EU users)
- **Perplexity** — AI inference (US users only; EU excluded pending safeguards)
- **DataForSEO / SerpAPI** — public off-site & AI-Overview signals
- **Stripe** — payment processing (PCI-compliant; we never store card data)
- **Resend** — transactional email delivery
- **Railway / Cloudflare** — hosting and network/CDN

We do not sell your personal information. A current sub-processor list is available at [ozvor.com/legal/sub-processors](https://ozvor.com/legal/sub-processors).

## 5. International transfers

Where data leaves the EEA/UK or Brazil, we rely on appropriate safeguards: EU-hosted inference paths (no transfer), Standard Contractual Clauses, and/or Data Privacy Framework certification for US providers. For Brazilian users, the LGPD international-transfer basis is documented before onboarding natural persons.

## 6. Retention

We keep data only as long as needed: audit citation evidence is purged after 90 days; AI generation logs (hashes only) are kept 3 years; score history rolls 12 months; account, brand, plan, and draft data are kept for your account's life plus a 30-day grace period; DSR records 30 days after closure. Encrypted BYOK keys are kept until rotation or account deletion.

## 7. Your rights

Subject to your jurisdiction, you can request access, correction, deletion, portability, restriction, and objection, and (CCPA/CPRA) to know, delete, correct, and opt out of "sale"/"sharing" and limit sensitive-data use. We do not sell or share personal information for cross-context behavioural advertising. Exercise rights at /legal/dsr-request, opt out at /legal/do-not-sell (Do Not Sell or Share), or email dpo@ozvor.com. You may also lodge a complaint with the ANPD (Brazil), your EU supervisory authority, or the California Privacy Protection Agency.

## 8. Security

We use multi-tenant isolation (row-level security), encryption in transit and at rest, AES-256-GCM encryption for stored API keys, append-only audit logs, and least-privilege access. No method is perfectly secure, but we maintain controls appropriate to the risk.

## 9. Children

The Service is for businesses and not directed to children. We do not knowingly collect data from anyone under the age of majority in their jurisdiction.

## 10. Changes and contact

We will post updates on the live page and, for material changes, notify you. Privacy contact: dpo@ozvor.com.

---

_This mirror reflects operator-authored live copy. It does not constitute legal advice._
