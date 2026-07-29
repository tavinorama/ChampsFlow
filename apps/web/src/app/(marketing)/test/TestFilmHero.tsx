"use client";

/**
 * TestFilmHero: the opening scene of the free test page.
 *
 * One act only. The buyer asks. The answer names two other companies. The
 * visitor scrolls straight into the form that tells them whether that is
 * really happening to them.
 *
 * It reuses the exact kit the home page uses (FilmScene, FilmCopy, AiAnswer,
 * FilmStyles) so the two pages feel like one film. Nothing is duplicated here
 * except the script.
 *
 * Honesty: the answer on screen is a written example, and the caption under it
 * says so. No customer, no logo, no testimonial, no invented number.
 */

import { AiAnswer, FilmCopy, FilmScene, FilmStyles } from "../../../components/film";

const QUESTION = "who is the best accountant for a small business in Austin";

const ANSWER_RIVALS = [
  { text: "A few names come up. " },
  { text: "Harbor Point Accounting", tone: "rival" as const },
  { text: " is well reviewed for small business filing, and " },
  { text: "Vela Tax Partners", tone: "rival" as const },
  { text: " handles most of the bookkeeping work in that area." },
];

export function TestFilmHero() {
  return (
    <div className="film">
      <FilmStyles />

      <FilmScene image="/film/scene-1.jpg" priority hero>
        <FilmCopy
          as="h1"
          eyebrow="Right now. A buyer is asking."
          heading="AI just named someone else."
        >
          <AiAnswer question={QUESTION} segments={ANSWER_RIVALS} />
          <p className="film-sub">
            That answer is a written example. <b>Yours takes 60 seconds.</b>
          </p>
          <a className="film-jump" href="#start">
            Show me what AI says about me
          </a>
        </FilmCopy>
      </FilmScene>
    </div>
  );
}
