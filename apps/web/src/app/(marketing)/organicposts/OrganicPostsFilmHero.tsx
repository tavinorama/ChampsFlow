"use client";

/**
 * OrganicPostsFilmHero: the summit of the ladder, in one scene.
 *
 * Every other page sells a tool the visitor operates. This one sells the
 * opposite: the work happening without them. So the photo is a team at work
 * and the checklist is written in our voice, not theirs.
 *
 * Honesty: "done with you", never "done for you and guaranteed". The scope
 * and the approval step are stated on the page below, and nothing here
 * promises a ranking or a citation.
 */

import {
  FilmCopy,
  FilmScene,
  FilmStyles,
  WorkChecklist,
} from "../../../components/film";

const WE_DO = [
  { name: "We read the answers", does: "every week, all five engines" },
  { name: "We write the gaps", does: "posts, pages, schema, in your voice" },
  { name: "We publish", does: "once you say yes, never before" },
  { name: "You get a message", does: "when something moves. That is your part." },
];

export function OrganicPostsFilmHero() {
  return (
    <div className="film">
      <FilmStyles />

      <FilmScene image="/film/scene-5.jpg" priority hero>
        <FilmCopy
          as="h1"
          eyebrow="Done with you"
          heading={
            <>
              You run the business. <em>We run this.</em>
            </>
          }
          sub="Same work as the platform. You are just not the one doing it."
        >
          <WorkChecklist items={WE_DO} />
          <a className="film-jump" href="#start">
            Talk to us
          </a>
        </FilmCopy>
      </FilmScene>
    </div>
  );
}
