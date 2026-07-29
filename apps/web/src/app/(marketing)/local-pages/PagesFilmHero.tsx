"use client";

/**
 * PagesFilmHero: what a page is actually for.
 *
 * Ozvor Pages is easy to mistake for a website builder, which is not the sale.
 * The sale is that AI needs somewhere to read about you before it can name
 * you. So the scene shows the answer that becomes possible once the page
 * exists, not a screenshot of a page.
 *
 * Honesty: the answer is a written example. The page below states the $99
 * price, what the five pages are, and the refund terms.
 */

import { AiAnswer, FilmCopy, FilmScene, FilmStyles } from "../../../components/film";

const QUESTION = "who does kitchen remodels in Boise";

const ANSWER = [
  { text: "A few names come up. " },
  { text: "Your company", tone: "you" as const },
  {
    text:
      " is mentioned for full kitchen remodels in Boise, with fixed quotes and a written timeline.",
  },
];

export function PagesFilmHero() {
  return (
    <div className="film">
      <FilmStyles />

      <FilmScene image="/film/scene-4.jpg" priority hero>
        <FilmCopy
          as="h1"
          eyebrow="Ozvor Pages &middot; $99 once"
          heading="AI cannot name you if it has nothing to read."
          sub="Five pages, written so an AI engine can quote them. Live in a day."
        >
          <AiAnswer question={QUESTION} segments={ANSWER} />
          <a className="film-jump" href="#buy">
            Build my pages, $99
          </a>
        </FilmCopy>
      </FilmScene>
    </div>
  );
}
