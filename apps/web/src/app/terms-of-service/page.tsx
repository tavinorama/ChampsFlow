/**
 * /terms-of-service — Terms of Service (public). Linked from the site Footer.
 * Operator-authored; counsel review required before paid EU/BR launch
 * (docs/GO-LIVE-RUNBOOK.md Phase 6).
 */

import { LegalPage, LegalSection } from "../../components/legal/LegalPage";

export const metadata = {
  title: "Terms of Service | Ozvor",
  description: "The terms governing your use of Ozvor and OrganicPosts.",
  alternates: { canonical: "https://ozvor.com/terms-of-service" },
  openGraph: {
    title: "Terms of Service | Ozvor",
    description: "The terms governing your use of Ozvor and OrganicPosts.",
    url: "https://ozvor.com/terms-of-service",
    siteName: "Ozvor",
    type: "website",
  },
  robots: {
    index: true,
    follow: false,
  },
};

export default function TermsOfServicePage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="13 June 2026"
      intro={'These Terms govern your access to and use of the Ozvor platform and the OrganicPosts service (together, the “Service”), operated by Ozvor (a company being incorporated in Brazil). By creating an account or using the Service, you agree to these Terms.'}
    >
      <LegalSection n="1" title="Who we are">
        <p>The Service is operated by <strong>Ozvor</strong> (“we”, “us”), home jurisdiction Brazil. Ozvor is an AI-search visibility (Generative Engine Optimization, “GEO”) platform; <strong>OrganicPosts by Ozvor</strong> is our optional done-for-you content service. We are not affiliated with, and are a different company from, “Trustindex.io” (an online-review widget provider).</p>
      </LegalSection>

      <LegalSection n="2" title="What the Service does">
        <p>The Service audits how AI answer engines (e.g. ChatGPT, Claude, Perplexity, Gemini, Google AI Overview) reference a brand, computes a TrustIndex Score, benchmarks competitor mentions, and produces a GEO content plan and draft content. Audits query third-party AI providers and analyse publicly available web sources.</p>
        <p><strong>No guarantee of results.</strong> AI systems are non-deterministic and outside our control. Scores, benchmarks and recommendations are evidence-based estimates, not guarantees of citation, ranking, traffic, or revenue. We do not promise any specific AI-search outcome.</p>
      </LegalSection>

      <LegalSection n="3" title="Accounts">
        <p>You must provide accurate information and are responsible for activity under your account. Authentication is passwordless (email magic-link). You must be authorised to act for any brand you add, and at least the age of majority in your jurisdiction.</p>
      </LegalSection>

      <LegalSection n="4" title="Plans, billing and refunds">
        <p>Paid plans (e.g. Growth, Agency) are billed in advance on a recurring basis via our payment processor (Stripe) until cancelled. One-time products (e.g. the $29 Get-Cited Kit) are charged once. Prices are shown at checkout and may change prospectively. Paid subscription plans include a 30-day money-back guarantee as described at purchase. You can cancel at any time; cancellation takes effect at the end of the current billing period. Taxes may apply based on your location.</p>
      </LegalSection>

      <LegalSection n="5" title="Acceptable use">
        <p>You agree not to: (a) use the Service to violate any law or third-party right; (b) submit a domain or brand you are not authorised to analyse; (c) attempt to bypass security, rate limits, or access other tenants’ data; (d) resell or white-label the platform except under an Agency plan that permits it; or (e) use the Service to generate deceptive, infringing, or unlawful content. Generated drafts are <strong>AI-assisted suggestions</strong> that you must review and approve before publishing; you are responsible for what you publish.</p>
      </LegalSection>

      <LegalSection n="6" title="Your content and data">
        <p>You retain ownership of the brand information, domains, and content you provide. You grant us a limited licence to process it to operate the Service (run audits, compute scores, generate drafts). Our handling of personal data is described in our <a href="/privacy-policy" style={{ color: "var(--color-primary)" }}>Privacy Policy</a> and, for business customers, our <a href="/legal/dpa" style={{ color: "var(--color-primary)" }}>Data Processing Agreement</a>.</p>
      </LegalSection>

      <LegalSection n="7" title="Intellectual property">
        <p>The Service, including the TrustIndex Score methodology, software, and brand, is owned by us and protected by law. These Terms grant you a non-exclusive, non-transferable right to use the Service per your plan. Outputs we generate for you (drafts, plans, reports) are yours to use once delivered.</p>
      </LegalSection>

      <LegalSection n="8" title="Third-party providers">
        <p>The Service relies on third-party providers (AI providers, search-data providers, hosting, payments, email). Their availability and behaviour are outside our control, and your use may be subject to their terms. We are not liable for third-party acts or outages.</p>
      </LegalSection>

      <LegalSection n="9" title="Disclaimers and limitation of liability">
        <p>The Service is provided “as is” and “as available”, without warranties of any kind to the extent permitted by law. We do not warrant that the Service will be uninterrupted, error-free, or that any AI-search outcome will be achieved. To the maximum extent permitted by law, our aggregate liability arising from the Service is limited to the amount you paid us in the 12 months before the claim. Nothing limits liability that cannot be limited by law (including, where applicable, under the Brazilian Consumer Protection Code/CDC and consumer law in your jurisdiction).</p>
      </LegalSection>

      <LegalSection n="10" title="Suspension and termination">
        <p>You may stop using the Service and delete your account at any time. We may suspend or terminate access for breach of these Terms, non-payment, or to comply with law. On termination, your data is handled per the Privacy Policy retention schedule.</p>
      </LegalSection>

      <LegalSection n="11" title="Changes to these Terms">
        <p>We may update these Terms; material changes will be notified by email or in-app before they take effect. Continued use after the effective date constitutes acceptance.</p>
      </LegalSection>

      <LegalSection n="12" title="Governing law and contact">
        <p>These Terms are governed by the laws of Brazil, without prejudice to mandatory consumer-protection rights you may have in your country of residence. Questions: <a href="mailto:hello@ozvor.com" style={{ color: "var(--color-primary)" }}>hello@ozvor.com</a>. For privacy matters: <a href="mailto:dpo@ozvor.com" style={{ color: "var(--color-primary)" }}>dpo@ozvor.com</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
