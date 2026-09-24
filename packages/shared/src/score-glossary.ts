/**
 * score-glossary.ts — the ONE definition of each score (B8, Codex D17, 23/09).
 *
 * The FAQ said "Execution checks your authority on the sources AI trusts";
 * the dashboard said Verified Execution is "fixes we re-checked and found
 * working". The learn page called the index "how likely AI engines are to
 * name you"; the FAQ called it "how often AI sees and quotes your brand".
 * Four surfaces, four products. A buyer who reads two of them is being sold
 * two different things.
 *
 * Every public sentence that defines a score comes from here. The test
 * (tests/unit/score-glossary.test.ts) scans the marketing pages for the old
 * phrasings and fails when one comes back.
 *
 * Weights in INDEX must match packages/llm/src/scoring.ts (0.5 / 0.3 / 0.2);
 * the same test checks that too.
 */

export const SCORE_GLOSSARY = {
  /** The headline number. An index, never a share of answers. */
  index: {
    name: "Ozvor AI Visibility Score",
    short: "An index from 0 to 100, not a share of answers.",
    long:
      "An index from 0 to 100, not a share of answers. Half of it is how often the AI engines named you in the answers we collected, 30% is how high you appeared when they did, and 20% is the tone. So a 52 does not mean you were named in 52% of answers; the measured share is shown beside it.",
  },
  visibility: {
    name: "Visibility",
    short: "How often AI engines name you, where in the answer, and in what tone.",
    long:
      "How often the AI engines name you when asked your customers' questions, where in the answer you appear, and how you are described. Measured from real answers; it moves on its own when the engines change.",
  },
  citationReadiness: {
    name: "Citation Readiness",
    short: "Whether engines can read and trust your site.",
    long:
      "Whether the engines can read and trust your site: schema, AI-crawler access, entity records and off-site presence. These are the signals you control; improving them makes citation possible, not certain.",
  },
  verifiedExecution: {
    name: "Verified Execution",
    short: "Fixes from your plan that a later audit re-checked and found live.",
    long:
      "Fixes from your plan that a later audit re-checked and found live in the AI answers. Not a checkbox, and not your authority on any source: a fix counts here only after we look again and see the change.",
  },
} as const;

/** Phrasings that meant something else, or nothing. Never in public copy again. */
export const RETIRED_SCORE_PHRASES: readonly RegExp[] = [
  /Execution checks your authority/i,
  /Execution \/ Brand: your authority/i,
  /how often AI sees and quotes your brand/i,
  /Execution score tracks how many of the recommended\s+fixes you have completed/i,
  /how likely AI engines are to name you/i,
  /How many ranked fixes from your GEO plan you have shipped/i,
];

/** The three-part line used wherever the parts are listed in one breath. */
export const THREE_PARTS_LINE = `Three parts: ${SCORE_GLOSSARY.visibility.name} (${SCORE_GLOSSARY.visibility.short.replace(/\.$/, "").toLowerCase()}), ${SCORE_GLOSSARY.citationReadiness.name} (${SCORE_GLOSSARY.citationReadiness.short.replace(/\.$/, "").toLowerCase()}), ${SCORE_GLOSSARY.verifiedExecution.name} (${SCORE_GLOSSARY.verifiedExecution.short.replace(/\.$/, "").toLowerCase()}).`;
