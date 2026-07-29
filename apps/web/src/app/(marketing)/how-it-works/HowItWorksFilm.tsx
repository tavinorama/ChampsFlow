"use client";

/**
 * HowItWorksFilm: the four moves, told as four scenes.
 *
 * The home page shows a contractor losing a job. This page answers the next
 * question — "so what do you actually do?" — and the founder asked for it in
 * the same film language, so a visitor who clicked How it works does not fall
 * out of the story into a diagram.
 *
 * One move per scene, one device per move:
 *
 *   1. Audit      → the five engines light up and a score lands
 *   2. Benchmark  → the answer names someone else, out loud
 *   3. Plan       → the checklist of what gets done for you
 *   4. Monitor    → the loop, and the hand-off to OrganicPosts
 *
 * The photos run bright, face, dark, bright on purpose, and in a different
 * order from the home page: the same four frames, cut as a different film.
 *
 * Honesty rules, same as the home page: the audit on screen is a sample and
 * says so, no customer, no logo, no testimonial, no invented number. The
 * engine list is the real coverage.
 *
 * The score breakdown and the CTA stay in page.tsx, server rendered, so the
 * method and the links survive with JavaScript off.
 */

import Link from "next/link";
import {
  AiAnswer,
  EngineScan,
  FilmCopy,
  FilmProgressBar,
  FilmScene,
  FilmStyles,
  WorkChecklist,
} from "../../../components/film";

/* ------------------------------------------------------------------ */
/* Script                                                              */
/* ------------------------------------------------------------------ */

const QUESTION = "best emergency dentist in Sacramento";

const ANSWER_RIVALS = [
  { text: "A few clinics come up. " },
  { text: "Midtown Dental Care", tone: "rival" as const },
  { text: " takes walk-ins, and " },
  { text: "Riverpark Family Dentistry", tone: "rival" as const },
  { text: " has same-day slots most weeks." },
];

const ENGINES = [
  { name: "ChatGPT", result: "not named" },
  { name: "Claude", result: "not named" },
  { name: "Perplexity", result: "named, 6th", good: true },
  { name: "Gemini", result: "not named" },
  { name: "Google AI Overviews", result: "not named" },
];

const WORK = [
  { name: "The gaps", does: "the questions AI answers without you" },
  { name: "The words", does: "written to be quoted, not to rank" },
  { name: "The page", does: "published where AI can read it" },
  { name: "Your say", does: "nothing goes live until you press go" },
];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function HowItWorksFilm() {
  return (
    <div className="film">
      <FilmStyles />
      <FilmProgressBar />

      {/* 1: the audit */}
      <FilmScene image="/film/scene-3.jpg" priority hero>
        <FilmCopy
          as="h1"
          eyebrow="Move one. Free."
          heading="First we ask AI about you."
          sub="Your customers' real questions, put to all five engines. No guessing."
        >
          <EngineScan
            tag="AI Invisibility Test"
            engines={ENGINES}
            score={21}
            caption="Visibility score. Sample audit, 60 seconds."
          />
        </FilmCopy>
      </FilmScene>

      {/* 2: the benchmark */}
      <FilmScene image="/film/scene-1.jpg">
        <FilmCopy
          eyebrow="Move two."
          accentEyebrow
          heading="Then we show you who it names instead."
          sub="Not a score you have to decode. The actual sentence, with the actual names in it."
        >
          <AiAnswer question={QUESTION} segments={ANSWER_RIVALS} />
        </FilmCopy>
      </FilmScene>

      {/* 3: the work */}
      <FilmScene image="/film/scene-2.jpg">
        <FilmCopy
          eyebrow="Move three. We work."
          accentEyebrow
          heading="Then we write what is missing."
          sub="AI answers those questions with somebody. It should be you."
        >
          <WorkChecklist items={WORK} />
        </FilmCopy>
      </FilmScene>

      {/* 4: the loop, and the way out of doing it yourself */}
      <FilmScene image="/film/scene-4.jpg">
        <FilmCopy
          eyebrow="Move four. Every week."
          accentEyebrow
          heading={
            <>
              Then we keep <em>checking</em>.
            </>
          }
          sub={
            <>
              AI changes its mind. We watch it so you do not have to.{" "}
              <b>Or we run the whole thing for you.</b>
            </>
          }
        >
          <Link className="film-jump" href="/organicposts">
            Hand it to OrganicPosts
          </Link>
        </FilmCopy>
      </FilmScene>
    </div>
  );
}
