"use client";

/**
 * HomeFilm: the Ozvor home page as a film.
 *
 * Four acts, scrubbed by scroll, then the close.
 *
 *   1. The contractor loses a job he never knew existed.
 *   2. The free test. Five engines light up, a score lands.
 *   3. The products do the work while he works.
 *   4. The same question, six weeks later, with his name in the answer.
 *   5. Who it is for, the two field form, the ladder.
 *
 * Honesty rules held here:
 *  - no customer count, no logo wall, no testimonial, no fake urgency
 *  - the only proof is the real engine coverage and the real 30 day guarantee
 *  - scene 2 is a sample and is labelled a sample, on screen, every time
 *
 * The navbar and the footer come from (marketing)/layout.tsx and are left
 * alone. The prototype hid them; the real site keeps its chrome, so the
 * persistent "Check my brand" CTA in the navbar rides along with the story.
 */

import Link from "next/link";
import {
  AiAnswer,
  EngineScan,
  FilmCopy,
  FilmProgressBar,
  FilmScene,
  FilmStartForm,
  FilmStyles,
  WorkChecklist,
} from "../../components/film";

/* ------------------------------------------------------------------ */
/* Script                                                              */
/* ------------------------------------------------------------------ */

const QUESTION = "best roofing company near me in Fort Worth";

const ANSWER_BEFORE = [
  { text: "You have a few good options. " },
  { text: "Summit Ridge Roofing", tone: "rival" as const },
  { text: " is well reviewed for storm work, and " },
  { text: "Lonestar Exteriors", tone: "rival" as const },
  { text: " handles most insurance claims in that area." },
];

const ANSWER_AFTER = [
  { text: "Most people point to " },
  { text: "your company", tone: "you" as const },
  {
    text:
      " for storm damage in Fort Worth, with a 24 hour callout and full insurance paperwork handled.",
  },
];

const ENGINES = [
  { name: "ChatGPT", result: "not named" },
  { name: "Claude", result: "not named" },
  { name: "Perplexity", result: "named, 4th", good: true },
  { name: "Gemini", result: "not named" },
  { name: "Google AI Overviews", result: "not named" },
];

const WORK = [
  {
    name: "Get Cited Kit",
    does: "writes the answers AI is missing about you",
  },
  {
    name: "Ozvor Pages",
    does: "publishes them on a page AI can quote",
  },
  {
    name: "Growth",
    does: "rechecks all five engines every week",
  },
  {
    name: "OrganicPosts",
    does: "keeps writing while you work",
  },
];

const VERTICALS = [
  "Contractors and home services",
  "Dental and medical clinics",
  "Law and accounting firms",
  "Real estate",
  "Boutique agencies, white label",
];

const LADDER = [
  {
    name: "Free test",
    what: "See where you stand on five engines",
    now: true,
  },
  { name: "Kit, $29", what: "The answers AI is missing, written for you" },
  { name: "Growth", what: "Weekly checks, content plan, pages published" },
  { name: "Agency", what: "Every client brand, under your logo" },
];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function HomeFilm() {
  return (
    <div className="film">
      <FilmStyles />
      <FilmProgressBar />

      {/* 1: the job he never knew he lost */}
      <FilmScene image="/film/scene-1.jpg" priority hero>
        <FilmCopy
          as="h1"
          eyebrow="Tuesday. A $40,000 job."
          heading="A homeowner asked AI for a roofer. It named someone else."
        >
          <AiAnswer question={QUESTION} segments={ANSWER_BEFORE} />
          {/* The gain, right under the loss. Scroll for the rest. */}
          <p className="film-sub">
            Ozvor puts your name in that answer.{" "}
            <b>Start with a free check.</b>
          </p>
          <GuaranteeChip />
        </FilmCopy>
      </FilmScene>

      {/* 2: the free test */}
      <FilmScene image="/film/scene-2.jpg">
        <FilmCopy
          eyebrow="Step one. Free."
          accentEyebrow
          heading="See what AI says about you."
        >
          <EngineScan
            tag="AI Invisibility Test"
            engines={ENGINES}
            score={18}
            caption="Visibility score. Sample audit, 60 seconds."
          />
        </FilmCopy>
      </FilmScene>

      {/* 3: the work */}
      <FilmScene image="/film/scene-3.jpg">
        <FilmCopy
          eyebrow="Step two. We work."
          accentEyebrow
          heading="We fix it. You approve."
          sub="You get a message when something moves. That is your whole job."
        >
          <WorkChecklist items={WORK} />
        </FilmCopy>
      </FilmScene>

      {/* 4: the same question, his name in it */}
      <FilmScene image="/film/scene-4.jpg">
        <FilmCopy
          eyebrow="Same question. Six weeks later."
          accentEyebrow
          heading={
            <>
              Now AI says <em>your name</em>.
            </>
          }
          sub={
            <>
              They call you already sold. <b>You never spoke to them.</b>
            </>
          }
        >
          <AiAnswer question={QUESTION} segments={ANSWER_AFTER} />
        </FilmCopy>
      </FilmScene>

      {/* 5: the close */}
      <section className="film-closing" id="start">
        <div className="film-wrap">
          <ul className="film-verticals">
            {VERTICALS.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>

          <div className="film-offer">
            <div>
              <h2>Find out in 60 seconds.</h2>
              <p>
                We ask all five engines what your customers ask. You see who
                they name instead of you.
              </p>
              <GuaranteeChip />
            </div>
            <div>
              <FilmStartForm />
            </div>
          </div>

          <ul className="film-ladder">
            {LADDER.map((step) => (
              <li
                key={step.name}
                className={`film-step${step.now ? " is-now" : ""}`}
              >
                <b>{step.name}</b>
                <span>{step.what}</span>
              </li>
            ))}
          </ul>

          <div className="film-signoff">
            <strong>Know if AI trusts your brand. Then fix it.</strong>
            <p>
              The scene above is a sample, and it says so. Every number in the
              product comes from a live check on ChatGPT, Claude, Perplexity,
              Gemini and Google AI Overviews, never an estimate. Photography
              from Pexels. See{" "}
              <Link href="/how-we-measure">how we measure</Link>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function GuaranteeChip() {
  return (
    <p className="film-chip">
      <ShieldIcon />
      30 day money back on any paid plan
    </p>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5 3 3.4v4.1c0 3 2.1 5.7 5 6.6 2.9-.9 5-3.6 5-6.6V3.4L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="m5.9 7.8 1.5 1.6 2.8-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
