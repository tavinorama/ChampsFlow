/**
 * Landing page v2 — Ozvor homepage redesign (feat/landing-v2-home).
 * Route: / (within (marketing) route group)
 *
 * Server shell: exports metadata + server-fetches the ONE dynamic bit — the
 * live self-score card's data (GET /api/showcase/geo, 10-min ISR, same
 * pattern + INTERNAL_API_URL fallback the pre-v2 homepage used for its
 * "building in public" band). All interactive state (hero demo loop,
 * score-ring count-up, click-to-play sims, FAQ accordion, checkout) lives in
 * the client component — see LandingV2.tsx for the full section breakdown.
 *
 * PR #231 review fix (Hermes, blocker): the score card's "LIVE" chip and
 * "updated weekly" claim need an actual live value, not a hardcoded const.
 * fetchSelfScore() below is the only place that value comes from; when it
 * fails/404s/is incomplete, `selfScore` is null and LandingV2 renders the
 * honest SNAPSHOT fallback (see landing-v2-logic.ts's scoreCardState()).
 *
 * Nav + footer are NOT rendered here — ../layout.tsx already provides
 * PublicNavbar + SiteFooter for every route in this group (see the
 * implementation report for why this page renders sections only).
 */

import type { Metadata } from "next";
import { LandingV2 } from "./LandingV2";
import type { SelfScoreApiData } from "./landing-v2-logic";

export const revalidate = 600;

// ---------------------------------------------------------------------------
// Self-score fetch — same source + ISR window as the old homepage's
// "building in public" band (GET /api/showcase/geo). Never invents a number:
// any failure, non-200, or incomplete latest audit returns null and the
// client component falls back to the honest, explicitly-labeled snapshot.
// ---------------------------------------------------------------------------

interface ShowcaseGeoResponse {
  overall: number | null;
  threeScores: {
    visibility: number;
    citationReadiness: number;
    executionProgress: number | null;
  } | null;
  measuredAt: string;
}

async function fetchSelfScore(): Promise<SelfScoreApiData | null> {
  const base =
    process.env.INTERNAL_API_URL ?? "https://api-production-2052.up.railway.app";
  try {
    const res = await fetch(`${base}/api/showcase/geo`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ShowcaseGeoResponse;
    if (data.overall == null || !data.threeScores || !data.measuredAt) return null;
    return {
      overall: data.overall,
      visibility: data.threeScores.visibility,
      citationReadiness: data.threeScores.citationReadiness,
      executionProgress: data.threeScores.executionProgress,
      measuredAt: data.measuredAt,
    };
  } catch {
    return null;
  }
}

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

export default async function LandingPage() {
  const selfScore = await fetchSelfScore();
  return <LandingV2 selfScore={selfScore} />;
}
