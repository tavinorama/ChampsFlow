/**
 * /support — Public support & contact page. Linked from the site Footer and
 * referenced by the Terms of Service and cancellation flow (support@ozvor.com).
 *
 * Launch-blocker fix: the Terms and product pages promise a support channel,
 * but /support returned 404 (Hermes daily brief 2026-07-14, B1). This page
 * makes the promise real: named channels, what each is for, and response-time
 * targets. Operator-authored; no fabricated SLAs — targets are stated as
 * targets, not contractual guarantees.
 */

import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../../components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Support | Ozvor",
  description:
    "How to reach Ozvor: help with your account, audits, billing, refunds and privacy requests — with our response-time targets.",
  alternates: { canonical: "https://ozvor.com/support" },
  openGraph: {
    title: "Support | Ozvor",
    description: "Reach a human at Ozvor. Account, billing, refunds and privacy help.",
    url: "https://ozvor.com/support",
    siteName: "Ozvor",
    type: "website",
  },
  robots: { index: true, follow: true },
};

/** A labelled email channel row. */
function Channel({ email, forWhat }: { email: string; forWhat: string }) {
  return (
    <p style={{ margin: 0 }}>
      <a href={`mailto:${email}`} style={{ color: "var(--color-primary)", fontWeight: 600 }}>
        {email}
      </a>{" "}
      — {forWhat}
    </p>
  );
}

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      updated="14 July 2026"
      intro={
        "Need a hand? A real person reads every message. Here is how to reach us, what each channel is for, and how fast we aim to reply. We are a small team, so we keep it simple and honest."
      }
    >
      <LegalSection n="1" title="Email us">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <Channel email="hello@ozvor.com" forWhat="general questions, sales, and anything about the product." />
          <Channel email="support@ozvor.com" forWhat="help with your account, audits, scores, or a technical problem." />
          <Channel email="support@ozvor.com" forWhat="billing, cancellations, and refund requests (see our Refund Policy)." />
          <Channel email="dpo@ozvor.com" forWhat="privacy, data access, deletion, and other data-rights requests." />
        </div>
        <p style={{ marginTop: "var(--space-2)" }}>
          You do not need an account to email us. Please include the email you signed up with, so we can find you fast.
        </p>
      </LegalSection>

      <LegalSection n="2" title="How fast we reply">
        <p>
          These are our response-time targets, not contractual guarantees. We almost always beat them, and we will tell
          you if something needs more time.
        </p>
        <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <li>Account and technical help: within 1 business day.</li>
          <li>Billing, cancellations and refunds: within 1 business day.</li>
          <li>Privacy and data-rights requests: within the timelines in our Privacy Policy (30 days under GDPR/LGPD, 45 days under CCPA/CPRA, often much sooner).</li>
        </ul>
        <p style={{ marginTop: "var(--space-2)" }}>
          Business days are Monday to Friday. We are based in Brazil and serve customers in Brazil, the EU, and the
          United States.
        </p>
      </LegalSection>

      <LegalSection n="3" title="Common things we can help with">
        <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <li>Can&rsquo;t log in, or your magic-link email did not arrive.</li>
          <li>A question about your Ozvor AI Visibility Score or an audit result.</li>
          <li>Changing or cancelling your plan, or asking for a refund.</li>
          <li>Getting a copy of your data, or deleting your account.</li>
          <li>Anything about the Get-Cited Kit, Ozvor Pages, or OrganicPosts.</li>
        </ul>
      </LegalSection>

      <LegalSection n="4" title="Billing & refunds">
        <p>
          Paid subscription plans include a 30-day money-back guarantee, and the one-time Get-Cited Kit and Ozvor Pages
          each carry a deliverable guarantee. The full policy — what is covered, how to ask, and how long it takes — is
          on our{" "}
          <a href="/refund" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            Refund Policy
          </a>{" "}
          page.
        </p>
        <p>
          You can also cancel any time from your account&rsquo;s billing page, with no lock-in. Cancellation takes effect
          at the end of your current billing period.
        </p>
      </LegalSection>

      <LegalSection n="5" title="Privacy & your data">
        <p>
          To access, correct, or delete your personal data, use our{" "}
          <a href="/legal/dsr-request" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            data-rights request form
          </a>{" "}
          or email{" "}
          <a href="mailto:dpo@ozvor.com" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            dpo@ozvor.com
          </a>
          . How we handle personal data is described in our{" "}
          <a href="/privacy-policy" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
