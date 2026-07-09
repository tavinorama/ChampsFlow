/**
 * /landing-pages — in-app teaser for the upcoming Landing-page builder (V2).
 * Honest "coming soon": no fake data, no working controls.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ComingSoon } from "../../components/ComingSoon";

export const metadata: Metadata = {
  title: "Landing pages — Ozvor",
  robots: { index: false, follow: false },
};

export default function LandingPagesComingSoonPage() {
  return (
    <ComingSoon
      eyebrow="Coming soon"
      title="Landing pages AI can actually cite"
      description="Publish GEO-optimized landing pages in minutes — structured, schema-rich, and written around the exact buyer questions your audit shows AI answering with someone else's name."
      bullets={[
        "Templates engineered for citation-worthiness (schema, FAQ, comparison, proof).",
        "Pre-filled from your audit: the prompts, gaps, and competitors that matter.",
        "One-click publish to your domain, then tracked in your weekly re-audit.",
        "Every page ties back to the score it's meant to move — no vanity pages.",
      ]}
      cta={
        <Link
          href="/kit"
          style={{
            display: "inline-flex", alignItems: "center", height: "44px", padding: "0 var(--space-5)",
            background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)",
            fontWeight: 700, fontSize: "var(--font-size-body-sm)", textDecoration: "none",
          }}
        >
          Get publish-ready content now with the $29 Kit →
        </Link>
      }
    />
  );
}
