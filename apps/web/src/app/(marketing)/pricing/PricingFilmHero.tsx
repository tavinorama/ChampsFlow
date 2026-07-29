"use client";

/**
 * PricingFilmHero: the turn, told once, above the plans.
 *
 * The home page ends on this beat and the pricing page opens on it, using the
 * same photo and the same kit, so a visitor who scrolled the story and clicked
 * Plans lands inside the same film instead of a spreadsheet.
 *
 * One scene only. Then the prices.
 *
 * Honesty: the answer on screen is a written example. No customer, no logo, no
 * testimonial, no invented number anywhere on this page.
 */

import { AiAnswer, FilmCopy, FilmScene, FilmStyles } from "../../../components/film";

const QUESTION = "who is the best accountant for a small business in Austin";

const ANSWER_YOU = [
  { text: "Most people point to " },
  { text: "your company", tone: "you" as const },
  {
    text:
      " for small business filing in Austin, with fixed monthly pricing and the bookkeeping handled.",
  },
];

export function PricingFilmHero() {
  return (
    <div className="film">
      <FilmStyles />

      <FilmScene image="/film/scene-4.jpg" priority hero>
        <FilmCopy
          as="h1"
          eyebrow="Six weeks later. Same question."
          accentEyebrow
          heading={
            <>
              Now AI says <em>your name</em>.
            </>
          }
        >
          <AiAnswer question={QUESTION} segments={ANSWER_YOU} />
          <p className="film-sub">
            That is the job. <b>Here is what it costs.</b>
          </p>
          <a className="film-jump" href="#plans">
            See the plans
          </a>
        </FilmCopy>
      </FilmScene>
    </div>
  );
}
