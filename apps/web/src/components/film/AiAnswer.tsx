"use client";

/**
 * AiAnswer: the device that shows an AI answer typing itself as you scroll.
 *
 * The answer is split into segments. A segment can be plain, a rival (grey,
 * the name that is taking the job) or you (green, the name we are working to
 * get in there). Same device, two scenes: once naming someone else, once
 * naming the visitor.
 *
 * The full text is rendered on the server, so with JavaScript off, with
 * reduced motion on, or in a crawler, the answer reads complete. The scroll
 * only ever slices what is already there.
 */

import { useEffect, useRef } from "react";
import { useFilmScene } from "./FilmScene";

export type AnswerTone = "rival" | "you";

export interface AnswerSegment {
  text: string;
  tone?: AnswerTone;
}

export interface AiAnswerProps {
  /** The buyer question above the answer. */
  question: string;
  segments: AnswerSegment[];
  /** How much of the scene clock the typing takes. 1 = the full inner window. */
  speed?: number;
}

const TONE_CLASS: Record<AnswerTone, string> = {
  rival: "is-rival",
  you: "is-you",
};

export function AiAnswer({ question, segments, speed = 1 }: AiAnswerProps) {
  const { cardRef, subscribe } = useFilmScene();
  const spans = useRef<(HTMLSpanElement | null)[]>([]);
  const caret = useRef<HTMLSpanElement | null>(null);
  const shown = useRef(-1);

  useEffect(() => {
    const total = segments.reduce((n, s) => n + s.text.length, 0);
    return subscribe((t) => {
      const n = Math.round(total * Math.min(1, Math.max(0, t / speed)));
      if (n === shown.current) return;
      shown.current = n;

      let cursor = 0;
      for (let i = 0; i < segments.length; i += 1) {
        const el = spans.current[i];
        const seg = segments[i];
        if (!seg) continue;
        const take = Math.max(0, Math.min(seg.text.length, n - cursor));
        if (el) el.textContent = seg.text.slice(0, take);
        cursor += seg.text.length;
      }

      if (caret.current) {
        caret.current.style.display = n < total ? "inline-block" : "none";
      }
    });
  }, [segments, speed, subscribe]);

  return (
    <div className="film-answer" ref={cardRef}>
      <p className="film-q">
        <b aria-hidden="true">Q</b>
        <span>{question}</span>
      </p>
      <p className="film-a">
        {segments.map((seg, i) => (
          <span
            // The segments are a fixed, ordered script. Index is the identity.
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className={seg.tone ? TONE_CLASS[seg.tone] : undefined}
            ref={(el) => {
              spans.current[i] = el;
            }}
          >
            {seg.text}
          </span>
        ))}
        <span className="film-caret" ref={caret} aria-hidden="true" />
      </p>
    </div>
  );
}
