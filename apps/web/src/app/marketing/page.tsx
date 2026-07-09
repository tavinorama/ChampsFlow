/**
 * /marketing — in-app teaser for the upcoming Marketing module (V2).
 * Honest "coming soon": no fake data, no working controls.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ComingSoon } from "../../components/ComingSoon";

export const metadata: Metadata = {
  title: "Marketing — Ozvor",
  robots: { index: false, follow: false },
};

export default function MarketingComingSoonPage() {
  return (
    <ComingSoon
      eyebrow="Coming soon"
      title="Marketing, powered by your AI-visibility data"
      description="Turn the gaps Ozvor finds into campaigns that get you cited. The Marketing module will connect your audit signals to the channels and content that move your score — all in one place, all driven by real data from your own brand."
      bullets={[
        "Campaigns built from your real citation gaps and competitor displacement.",
        "Channel plans mapped to the sources AI actually cites in your category.",
        "Content briefs and drafts that flow straight into your Fix Queue and calendar.",
        "Performance tied back to your weekly AI Visibility Score movement.",
      ]}
      cta={
        <Link
          href="/test"
          style={{
            display: "inline-flex", alignItems: "center", height: "44px", padding: "0 var(--space-5)",
            background: "var(--color-primary)", color: "#fff", borderRadius: "var(--radius-md)",
            fontWeight: 700, fontSize: "var(--font-size-body-sm)", textDecoration: "none",
          }}
        >
          Meanwhile, run your free AI-visibility test →
        </Link>
      }
    />
  );
}
