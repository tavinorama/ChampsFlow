/**
 * /privacy-policy — Privacy Policy (public). Linked from the site Footer + hero
 * consent text. Grounded in docs/compliance/ropa.md (13 processing activities,
 * sub-processors, lawful bases, retention) + regulatory-map (LGPD/GDPR/CCPA).
 * Counsel review required before paid EU/BR launch.
 */

import { LegalPage, LegalSection } from "../../components/legal/LegalPage";

export const metadata = {
  title: "Privacy Policy — TrustIndex AI",
  description: "How TrustIndex AI collects, uses, shares, and protects personal data under LGPD, GDPR, and CCPA/CPRA.",
  alternates: { canonical: "https://trustindexai.com/privacy-policy" },
  openGraph: {
    title: "Privacy Policy — TrustIndex AI",
    description: "How TrustIndex AI collects, uses, shares, and protects personal data under LGPD, GDPR, and CCPA/CPRA.",
    url: "https://trustindexai.com/privacy-policy",
    siteName: "TrustIndex AI",
    type: "website",
  },
  robots: {
    index: true,
    follow: false,
  },
};

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--color-border)", verticalAlign: "top" };
const th: React.CSSProperties = { ...cell, fontWeight: 700, color: "var(--color-muted)", textAlign: "left" };

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="13 June 2026"
      intro="This Policy explains how TrustIndex AI (home jurisdiction Brazil) collects, uses, shares, and protects personal data, and your rights under the LGPD (Brazil), GDPR (EU/EEA & UK), and CCPA/CPRA (California) and other US state laws. TrustIndex AI is the data controller for account data; for data you process about your own customers via the Service, see our Data Processing Agreement."
    >
      <LegalSection n="1" title="Who is responsible (controller)">
        <p>TrustIndex AI is the controller of personal data described here. Privacy contact: <a href="mailto:dpo@trustindexai.com" style={{ color: "var(--color-primary)" }}>dpo@trustindexai.com</a>. An EU representative (GDPR Art. 27) and a Brazilian Encarregado (LGPD DPO) are appointed before serving EU and Brazilian markets respectively.</p>
      </LegalSection>

      <LegalSection n="2" title="What we collect and why">
        <p>We minimise personal data. By design, our audit prompts are synthetic category questions plus your own brand name — they contain no personal data, and competitor names are never sent to AI providers.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-caption)", marginTop: "var(--space-2)" }}>
            <thead><tr><th style={th}>Data</th><th style={th}>Purpose</th><th style={th}>Lawful basis (GDPR / LGPD)</th></tr></thead>
            <tbody>
              <tr><td style={cell}>Account: email, role, Supabase user ID</td><td style={cell}>Create your account, passwordless login</td><td style={cell}>Contract (Art. 6(1)(b) / Art. 7(V))</td></tr>
              <tr><td style={cell}>Brand profile: brand name, domain, settings</td><td style={cell}>Run audits and monitoring</td><td style={cell}>Contract</td></tr>
              <tr><td style={cell}>Audit evidence: synthetic prompts, citation flags, source URLs</td><td style={cell}>Compute your TrustIndex Score</td><td style={cell}>Contract</td></tr>
              <tr><td style={cell}>Off-site signals (public sources)</td><td style={cell}>Measure brand authority</td><td style={cell}>Legitimate interests (Art. 6(1)(f) / Art. 7(IX))</td></tr>
              <tr><td style={cell}>Billing: name, email, Stripe ID, region (no card data stored by us)</td><td style={cell}>Process payments</td><td style={cell}>Contract</td></tr>
              <tr><td style={cell}>BYOK API keys (encrypted, AES-256-GCM)</td><td style={cell}>Run audits with your own provider keys</td><td style={cell}>Contract</td></tr>
              <tr><td style={cell}>Lead capture: email + test result (Invisibility Test)</td><td style={cell}>Send your scorecard and follow up</td><td style={cell}>Consent / legitimate interests</td></tr>
              <tr><td style={cell}>Transactional email, support, DSR records</td><td style={cell}>Operate the Service, meet legal duties</td><td style={cell}>Contract / legal obligation</td></tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection n="3" title="AI processing and transparency">
        <p>Audits send synthetic prompts to AI providers under zero-data-retention terms where available; for EU users, inference runs on EU-hosted paths and Perplexity is excluded until transfer safeguards are confirmed. AI-generated content is always labelled as AI-generated (EU AI Act Art. 50) and requires your human review before any use. We do not use your data to train AI models, and our providers are contractually restricted from doing so on your content.</p>
      </LegalSection>

      <LegalSection n="4" title="Who we share with (sub-processors)">
        <p>We share data only with vetted processors acting on our instructions:</p>
        <ul style={{ paddingLeft: "var(--space-5)" }}>
          <li><strong>Supabase</strong> — authentication + database (EU region for EU users)</li>
          <li><strong>Anthropic, OpenAI, Google (Gemini)</strong> — AI audit inference (EU-hosted paths for EU users)</li>
          <li><strong>Perplexity</strong> — AI inference (US users only; EU excluded pending safeguards)</li>
          <li><strong>DataForSEO / SerpAPI</strong> — public off-site & AI-Overview signals</li>
          <li><strong>Stripe</strong> — payment processing (PCI-compliant; we never store card data)</li>
          <li><strong>Resend</strong> — transactional email delivery</li>
          <li><strong>Railway / Cloudflare</strong> — hosting and network/CDN</li>
        </ul>
        <p>We do not sell your personal information. A current sub-processor list is available on request.</p>
      </LegalSection>

      <LegalSection n="5" title="International transfers">
        <p>Where data leaves the EEA/UK or Brazil, we rely on appropriate safeguards: EU-hosted inference paths (no transfer), Standard Contractual Clauses, and/or Data Privacy Framework certification for US providers. For Brazilian users, the LGPD international-transfer basis is documented before onboarding natural persons.</p>
      </LegalSection>

      <LegalSection n="6" title="Retention">
        <p>We keep data only as long as needed: audit citation evidence is purged after 90 days; AI generation logs (hashes only) are kept 3 years; score history rolls 12 months; account, brand, plan, and draft data are kept for your account’s life plus a 30-day grace period; DSR records 30 days after closure. Encrypted BYOK keys are kept until rotation or account deletion.</p>
      </LegalSection>

      <LegalSection n="7" title="Your rights">
        <p>Subject to your jurisdiction, you can request access, correction, deletion, portability, restriction, and objection, and (CCPA/CPRA) to know, delete, correct, and opt out of “sale”/“sharing” and limit sensitive-data use. We do not sell or share personal information for cross-context behavioural advertising. Exercise rights at <a href="/legal/dsr-request" style={{ color: "var(--color-primary)" }}>/legal/dsr-request</a>, opt out at <a href="/legal/do-not-sell" style={{ color: "var(--color-primary)" }}>Do Not Sell or Share</a>, or email <a href="mailto:dpo@trustindexai.com" style={{ color: "var(--color-primary)" }}>dpo@trustindexai.com</a>. You may also lodge a complaint with the ANPD (Brazil), your EU supervisory authority, or the California Privacy Protection Agency.</p>
      </LegalSection>

      <LegalSection n="8" title="Security">
        <p>We use multi-tenant isolation (row-level security), encryption in transit and at rest, AES-256-GCM encryption for stored API keys, append-only audit logs, and least-privilege access. No method is perfectly secure, but we maintain controls appropriate to the risk.</p>
      </LegalSection>

      <LegalSection n="9" title="Children">
        <p>The Service is for businesses and not directed to children. We do not knowingly collect data from anyone under the age of majority in their jurisdiction.</p>
      </LegalSection>

      <LegalSection n="10" title="Changes and contact">
        <p>We will post updates here and, for material changes, notify you. Privacy contact: <a href="mailto:dpo@trustindexai.com" style={{ color: "var(--color-primary)" }}>dpo@trustindexai.com</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
