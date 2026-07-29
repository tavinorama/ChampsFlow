/**
 * Home: Ozvor, the cinematic cut.
 * Route: / (within the (marketing) route group)
 *
 * Server shell: metadata only. The page itself is one continuous scroll film
 * (see HomeFilm.tsx) built from the reusable kit in components/film/.
 *
 * Why this replaced LandingV2: the founder approved a story-first home. The
 * old grid of sections explained the product; this one shows a contractor
 * losing a job he never knew existed, then getting his name into the answer.
 * LandingV2.tsx stays in the tree, unused by this route, because the pricing
 * and FAQ pages still borrow its logic module (landing-v2-logic.ts).
 *
 * No server fetch here on purpose. The old shell called /api/showcase/geo for
 * the live self-score card; this page shows no score of its own, so there is
 * nothing to fetch and nothing that could quietly go stale.
 */

import type { Metadata } from "next";
import { HomeFilm } from "./HomeFilm";

export const metadata: Metadata = {
  // Bare title: the root layout template already suffixes "| Ozvor".
  title: "Make AI say your name",
  description:
    "People ask AI who to hire. We check ChatGPT, Claude, Perplexity, Gemini and Google AI Overviews, then get your name into the answer. Free test, 60 seconds.",
  alternates: { canonical: "https://ozvor.com/" },
  openGraph: {
    title: "Ozvor: Make AI say your name",
    description:
      "People ask AI who to hire. See who it names instead of you, then get your name into the answer. Free test, 60 seconds.",
    url: "https://ozvor.com/",
    siteName: "Ozvor",
    images: [
      {
        url: "https://ozvor.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "Ozvor: Know if AI trusts your brand",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ozvor: Make AI say your name",
    description:
      "When your customer asks AI who to hire, be the answer. Free test, 60 seconds.",
    images: ["https://ozvor.com/og-default.png"],
  },
};

export default function LandingPage() {
  return <HomeFilm />;
}
