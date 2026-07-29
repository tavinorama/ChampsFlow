"use client";

/**
 * EngineScan: the five engines lighting up one after another, with a score
 * counting up underneath.
 *
 * The five names are the real coverage of the product: ChatGPT, Claude,
 * Perplexity, Gemini and Google AI Overviews. That list is the only proof on
 * this page besides the guarantee. Nothing here claims a customer, a logo or
 * a testimonial.
 *
 * The result strings and the score are a labelled sample, not a measurement.
 * The caption says so, and the caption is not optional.
 */

import { useEffect, useRef } from "react";
import { ease } from "./useScrollFilm";
import { useFilmScene } from "./FilmScene";

export interface EngineRow {
  name: string;
  /** What the sample answer did, e.g. "not named". */
  result: string;
  /** True when the result is a win, so it reads green instead of red. */
  good?: boolean;
}

export interface EngineScanProps {
  /** Pill above the list. */
  tag?: string;
  engines: EngineRow[];
  /** The number the counter climbs to. */
  score: number;
  /** Always says what the number is and where it came from. */
  caption: string;
}

export function EngineScan({ tag, engines, score, caption }: EngineScanProps) {
  const { cardRef, subscribe } = useFilmScene();
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const counter = useRef<HTMLElement | null>(null);
  const lastScore = useRef(-1);

  useEffect(() => {
    const n = engines.length;
    return subscribe((t) => {
      for (let i = 0; i < n; i += 1) {
        const el = rows.current[i];
        if (!el) continue;
        const on = t > (i + 1) / (n + 1);
        el.classList.toggle("is-on", on);
      }
      const value = Math.round(score * ease(t));
      if (value !== lastScore.current && counter.current) {
        lastScore.current = value;
        counter.current.textContent = String(value);
      }
    });
  }, [engines.length, score, subscribe]);

  return (
    <div className="film-panel" ref={cardRef}>
      {tag ? <span className="film-tag">{tag}</span> : null}
      <div className="film-engines">
        {engines.map((engine, i) => (
          <div
            key={engine.name}
            className="film-row"
            ref={(el) => {
              rows.current[i] = el;
            }}
          >
            <i className="film-dot" aria-hidden="true" />
            <span className="film-who">{engine.name}</span>
            <span className={`film-res${engine.good ? " is-ok" : ""}`}>
              {engine.result}
            </span>
          </div>
        ))}
      </div>
      <p className="film-score">
        <b ref={counter}>{score}</b>
        <i>{caption}</i>
      </p>
    </div>
  );
}
