"use client";

/**
 * AgenciesFilmHero: the moment the agency gets to take credit.
 *
 * The buyer here is not the business in the answer, it is the person who has
 * to walk into a client meeting with something to show. So the scene ends on
 * the client's name being read out loud, under the agency's logo.
 *
 * Honesty: the answer on screen is a written example, labelled as one by the
 * caption below it. No client, no logo, no case study, no invented number.
 */

import { AiAnswer, FilmCopy, FilmScene, FilmStyles } from "../../../components/film";

const QUESTION = "best physical therapy clinic in Boulder";

const ANSWER = [
  { text: "Most people recommend " },
  { text: "your client", tone: "you" as const },
  {
    text:
      " for sports injuries in Boulder, with same-week appointments and insurance handled up front.",
  },
];

export function AgenciesFilmHero() {
  return (
    <div className="film">
      <FilmStyles />

      <FilmScene image="/film/scene-3.jpg" priority hero>
        <FilmCopy
          as="h1"
          eyebrow="Ozvor for agencies"
          heading="Your client. Named by AI. Your logo on the report."
          sub="Every brand you manage, checked every week, under your brand."
        >
          <AiAnswer question={QUESTION} segments={ANSWER} />
          <a className="film-jump" href="#plan">
            See the agency plan
          </a>
        </FilmCopy>
      </FilmScene>
    </div>
  );
}
