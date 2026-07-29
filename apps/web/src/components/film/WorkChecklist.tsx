"use client";

/**
 * WorkChecklist: the products ticking themselves off while the visitor
 * watches. One line per thing Ozvor actually does.
 *
 * Rendered as a real list so it reads correctly without JavaScript and with a
 * screen reader. The scroll only changes opacity and a check state.
 */

import { useEffect, useRef } from "react";
import { useFilmScene } from "./FilmScene";

export interface WorkItem {
  /** The product doing the work. */
  name: string;
  /** What it does, in plain words. */
  does: string;
}

export interface WorkChecklistProps {
  items: WorkItem[];
}

export function WorkChecklist({ items }: WorkChecklistProps) {
  const { cardRef, subscribe } = useFilmScene();
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const n = items.length;
    return subscribe((t) => {
      for (let i = 0; i < n; i += 1) {
        const el = rows.current[i];
        if (!el) continue;
        el.classList.toggle("is-on", t > (i + 0.4) / (n + 0.6));
      }
    });
  }, [items.length, subscribe]);

  return (
    <div className="film-panel" ref={cardRef}>
      <ul className="film-work">
        {items.map((item, i) => (
          <li
            key={item.name}
            className="film-item"
            ref={(el) => {
              rows.current[i] = el;
            }}
          >
            <i className="film-check" aria-hidden="true">
              &#10003;
            </i>
            <span>
              <b>{item.name}</b> {item.does}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
