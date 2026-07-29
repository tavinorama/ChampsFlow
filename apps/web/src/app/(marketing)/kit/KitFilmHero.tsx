"use client";

/**
 * KitFilmHero: one scene, then the price.
 *
 * Same shape as PricingFilmHero. The home page ends with the visitor knowing
 * they are missing from the answer; the Kit is the cheapest way to fix that,
 * so this scene shows the work being written rather than the product boxed up.
 *
 * Honesty: nothing here is a claim about results. The four lines are what the
 * $29 actually buys, and the page below states the deliverable guarantee.
 */

import {
  FilmCopy,
  FilmScene,
  FilmStyles,
  WorkChecklist,
} from "../../../components/film";

const INSIDE = [
  { name: "Your audit", does: "all five engines, your real score" },
  { name: "Your top 3 fixes", does: "ranked by what moves first" },
  { name: "Three drafts", does: "a post, a LinkedIn, an FAQ, ready to publish" },
  { name: "The guide", does: "why AI cites what it cites, in plain English" },
];

export function KitFilmHero() {
  return (
    <div className="film">
      <FilmStyles />

      <FilmScene image="/film/scene-1.jpg" priority hero>
        <FilmCopy
          as="h1"
          eyebrow="Twenty nine dollars. Once."
          heading="The words AI is missing about you."
          sub="You do not have to learn any of this. You just have to publish it."
        >
          <WorkChecklist items={INSIDE} />
          <a className="film-jump" href="#buy">
            Get my Kit, $29
          </a>
        </FilmCopy>
      </FilmScene>
    </div>
  );
}
