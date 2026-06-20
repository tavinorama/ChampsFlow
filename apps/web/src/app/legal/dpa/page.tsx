/**
 * /legal/dpa — Data Processing Agreement (public, viewable). Linked from the
 * site Footer ("Data Processing Agreement"). Grounded in docs/compliance/ropa.md
 * + dpia.md. Where TrustIndex AI processes personal data on behalf of a business
 * customer, TrustIndex AI is the processor and the customer is the controller.
 * Counsel review required before paid EU/BR launch.
 */

import { LegalPage, LegalSection } from "../../../components/legal/LegalPage";

export const metadata = {
  title: "Data Processing Agreement — TrustIndex AI",
  description: "The DPA governing TrustIndex AI's processing of personal data on behalf of business customers (GDPR Art. 28, LGPD).",
  alternates: { canonical: "https://trustindexai.com/legal/dpa" },
};

export default function DpaPage() {
  return (
    <LegalPage
      title="Data Processing Agreement (DPA)"
      updated="13 June 2026"
      intro="This DPA forms part of the Terms of Service between you (the “Customer”, acting as data controller) and TrustIndex AI (the “Processor”) and applies where we process personal data on your behalf under the GDPR (Art. 28), the LGPD, and applicable US state laws. By using the Service you accept this DPA on behalf of your organisation."
    >
      <LegalSection n="1" title="Roles">
        <p>For personal data you submit or that we process to provide the Service to you (your account staff, your brand data), you are the <strong>controller</strong> and TrustIndex AI is the <strong>processor</strong>. For our own operational data (e.g. billing relationship), TrustIndex AI is an independent controller as described in the <a href="/privacy-policy" style={{ color: "var(--color-primary)" }}>Privacy Policy</a>.</p>
      </LegalSection>

      <LegalSection n="2" title="Subject-matter, nature and purpose">
        <p>We process personal data only to provide the Service: running GEO audits, computing the TrustIndex Score, benchmarking competitors, generating plans and drafts, monitoring, billing, and support. By design, audit prompts are synthetic and contain no personal data; competitor names are never sent to AI providers.</p>
      </LegalSection>

      <LegalSection n="3" title="Duration, categories of data and data subjects">
        <p><strong>Duration:</strong> for the term of your subscription plus the retention periods in the Privacy Policy. <strong>Data subjects:</strong> your authorised staff/users. <strong>Categories:</strong> business contact data (name, email), account/role identifiers, brand and domain data, and configuration. We do not intend to process special-category data and ask that you not submit it.</p>
      </LegalSection>

      <LegalSection n="4" title="Our obligations as processor">
        <ul style={{ paddingLeft: "var(--space-5)" }}>
          <li>Process personal data only on your documented instructions (these Terms and your use of the Service);</li>
          <li>Ensure persons authorised to process are bound by confidentiality;</li>
          <li>Implement appropriate technical and organisational measures (Section 6);</li>
          <li>Assist you, taking into account the nature of processing, with data-subject requests and with your obligations on security, breach notification, and DPIAs;</li>
          <li>At your choice, delete or return personal data at the end of services, save where retention is required by law;</li>
          <li>Make available information needed to demonstrate compliance and allow for audits (Section 7).</li>
        </ul>
      </LegalSection>

      <LegalSection n="5" title="Sub-processors">
        <p>You authorise us to engage the sub-processors listed in our <a href="/privacy-policy" style={{ color: "var(--color-primary)" }}>Privacy Policy §4</a> (Supabase, Anthropic, OpenAI, Google, Perplexity [US only], DataForSEO/SerpAPI, Stripe, Resend, Railway, Cloudflare). We impose data-protection obligations on each by contract and remain responsible for their performance. We will give advance notice of new sub-processors and a reasonable opportunity to object.</p>
      </LegalSection>

      <LegalSection n="6" title="Security measures">
        <p>We maintain: multi-tenant isolation via forced row-level security; encryption in transit (TLS) and at rest; AES-256-GCM encryption of stored API keys; append-only audit logging; least-privilege access; SSRF-hardened outbound fetching; prompt-injection sanitisation; and zero-data-retention AI inference where available. Measures are reviewed and may be updated provided protection is not materially reduced.</p>
      </LegalSection>

      <LegalSection n="7" title="Audits and assistance">
        <p>On reasonable request and subject to confidentiality, we will provide information to demonstrate compliance with this DPA and support audits no more than once per year (or as required by a supervisory authority), via documentation and questionnaires where sufficient.</p>
      </LegalSection>

      <LegalSection n="8" title="International transfers">
        <p>Where processing involves transfers outside the EEA/UK or Brazil, we rely on EU-hosted inference paths, Standard Contractual Clauses, and/or Data Privacy Framework certification, as described in the Privacy Policy. EU users’ inference is routed to EU-hosted providers and Perplexity is excluded for EU users until safeguards are confirmed.</p>
      </LegalSection>

      <LegalSection n="9" title="Personal data breach">
        <p>We will notify you without undue delay after becoming aware of a personal-data breach affecting your data, with the information you reasonably need to meet your notification duties (including, where applicable, ANPD/supervisory-authority timelines).</p>
      </LegalSection>

      <LegalSection n="10" title="Liability and order of precedence">
        <p>This DPA is governed by the Terms of Service and the laws of Brazil. In case of conflict on data-protection matters, this DPA prevails over the Terms. Liability is subject to the limitations in the Terms. Contact: <a href="mailto:dpo@trustindexai.com" style={{ color: "var(--color-primary)" }}>dpo@trustindexai.com</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
