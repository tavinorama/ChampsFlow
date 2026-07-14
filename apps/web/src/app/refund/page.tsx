/**
 * /refund — Public Refund Policy. Linked from the site Footer and the /support
 * page, and referenced by the Terms of Service ("Plans, billing and refunds").
 *
 * Launch-blocker fix: Terms and landing pages promise a 30-day money-back
 * guarantee and per-product deliverable guarantees, but /refund returned 404
 * (Hermes daily brief 2026-07-14, B1) — an unfulfillable public promise and a
 * CDC/LGPD risk. This page states the policy that already exists in the Terms,
 * in plain language. It grants no rights the Terms do not; the Terms govern.
 */

import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../../components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Refund Policy | Ozvor",
  description:
    "Ozvor's refund policy in plain English: 30-day money-back on subscriptions, deliverable guarantees on the Get-Cited Kit and Ozvor Pages, and how to ask.",
  alternates: { canonical: "https://ozvor.com/refund" },
  openGraph: {
    title: "Refund Policy | Ozvor",
    description: "30-day money-back on plans, deliverable guarantees on one-time products, no lock-in.",
    url: "https://ozvor.com/refund",
    siteName: "Ozvor",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      updated="14 July 2026"
      intro={
        "We want you to feel safe trying Ozvor. This page explains, in plain English, when you can get your money back and how to ask. It restates the refund terms in our Terms of Service — it does not change them. If anything conflicts, the Terms of Service govern."
      }
    >
      <LegalSection n="1" title="Subscriptions — 30-day money-back">
        <p>
          Paid subscription plans (Growth and Agency) include a 30-day money-back guarantee. If Ozvor is not right for
          you, email us within 30 days of your first payment and we will refund that payment. No hoops.
        </p>
        <p>
          You can also cancel any time, with no lock-in. Cancellation takes effect at the end of your current billing
          period, and you keep access until then. We do not auto-refund unused time on later renewals — cancel before a
          renewal date to avoid the next charge.
        </p>
      </LegalSection>

      <LegalSection n="2" title="The $29 Get-Cited Kit — deliverable guarantee">
        <p>
          The Get-Cited Kit is a one-time purchase. It comes with a deliverable guarantee: if the three content drafts
          in your Kit are not publish-ready, we will refund the $29 on request.
        </p>
        <p>
          The guarantee covers the deliverable — the drafts and audit you receive — not any AI-search outcome. AI systems
          are non-deterministic, so we never promise a specific citation, ranking, or traffic result.
        </p>
      </LegalSection>

      <LegalSection n="3" title="Ozvor Pages — deliverable guarantee">
        <p>
          Ozvor Pages is a one-time $99 purchase. If your 5-page site is not live and ready to publish, we will refund
          the $99. As with the Kit, the guarantee covers the deliverable, not any AI-search or traffic outcome.
        </p>
      </LegalSection>

      <LegalSection n="4" title="What is not refundable">
        <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <li>The free AI Visibility Test — it is free, so there is nothing to refund.</li>
          <li>Renewals of a subscription past the first 30 days (cancel before the renewal date instead).</li>
          <li>Done-for-you OrganicPosts work that has already been delivered, except as agreed in your engagement.</li>
        </ul>
        <p style={{ marginTop: "var(--space-2)" }}>
          If you are a consumer in Brazil or the EU, this policy is in addition to your statutory rights (for example,
          the CDC right of withdrawal in Brazil), which it never limits.
        </p>
      </LegalSection>

      <LegalSection n="5" title="How to ask for a refund">
        <p>
          Email{" "}
          <a href="mailto:support@ozvor.com" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            support@ozvor.com
          </a>{" "}
          from the address on your account. Tell us what you bought and that you would like a refund — you do not need to
          give a reason. We aim to reply within 1 business day.
        </p>
        <p>
          Approved refunds go back to your original payment method via our payment processor (Stripe). Depending on your
          bank, it can take a few business days to appear. Questions? See our{" "}
          <a href="/support" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            Support
          </a>{" "}
          page or our{" "}
          <a href="/terms-of-service" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            Terms of Service
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
