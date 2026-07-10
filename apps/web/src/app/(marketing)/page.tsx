/**
 * Landing page v2 — Ozvor homepage redesign (feat/landing-v2-home).
 * Route: / (within (marketing) route group)
 *
 * Server shell: exports metadata only. All interactive state (hero demo
 * loop, score-ring count-up, click-to-play sims, FAQ accordion, checkout)
 * lives in the client component — see LandingV2.tsx for the full section
 * breakdown, the design source of truth, and the founder-approved
 * amendments layered on top of the raw design handoff.
 *
 * Nav + footer are NOT rendered here — ../layout.tsx already provides
 * PublicNavbar + SiteFooter for every route in this group (see the
 * implementation report for why this page renders sections only).
 */

import type { Metadata } from "next";
import { LandingV2 } from "./LandingV2";

export const metadata: Metadata = {
  title: "Ozvor — Get your brand cited by AI search",
  description:
    "Run a free 60-second test. See your Ozvor AI Visibility Score, who AI cites instead of you — and exactly what to fix.",
  alternates: { canonical: "https://ozvor.com/" },
  openGraph: {
    title: "Ozvor — Get your brand cited by AI search",
    description:
      "Run a free 60-second test. See your Ozvor AI Visibility Score, who AI cites instead of you — and exactly what to fix.",
    url: "https://ozvor.com/",
    siteName: "Ozvor",
    images: [
      {
        url: "https://ozvor.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "Ozvor — Know if AI trusts your brand",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ozvor — Get your brand cited by AI search",
    description: "When your customer asks ChatGPT for a recommendation, be the answer.",
    images: ["https://ozvor.com/og-default.png"],
  },
};

export default function LandingPage() {
  return <LandingV2 />;
}
