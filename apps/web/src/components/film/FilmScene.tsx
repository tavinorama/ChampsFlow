"use client";

/**
 * FilmScene: one act of the film.
 *
 * A tall track (225vh) with a sticky stage inside it. The photo sits behind a
 * scrim and a grain layer and gets a slow dolly as the visitor scrolls. The
 * children get the scene's inner progress through context, so a typing answer
 * or a counting score can scrub with the same clock.
 *
 * Reusable: any marketing page can drop a FilmScene in, give it a photo and
 * a FilmCopy, and inherit the exact motion the founder approved.
 */

import Image from "next/image";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { useScrollFilm } from "./useScrollFilm";

/* ------------------------------------------------------------------ */
/* Context: how children hook into the scene clock                    */
/* ------------------------------------------------------------------ */

interface FilmSceneContextValue {
  /** Attach to the copy block so it can enter and leave. */
  copyRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the one device (answer or panel) so it can float. */
  cardRef: React.RefObject<HTMLDivElement | null>;
  /** Inner progress, 0..1, complete at 30% of the scene scroll. */
  subscribe: (fn: (t: number) => void) => () => void;
}

const FilmSceneContext = createContext<FilmSceneContextValue | null>(null);

export function useFilmScene(): FilmSceneContextValue {
  const ctx = useContext(FilmSceneContext);
  if (!ctx) {
    throw new Error("Film components must be rendered inside a <FilmScene>.");
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export interface FilmSceneProps {
  /** Public path of the photo, e.g. /film/scene-1.jpg */
  image: string;
  /** Empty string keeps it decorative. The copy already tells the story. */
  imageAlt?: string;
  /** Only the first scene should be priority. */
  priority?: boolean;
  /**
   * Marks the opening scene of the page. It is framed from the first paint
   * instead of fading in, so nobody ever lands on an empty hero.
   */
  hero?: boolean;
  children: React.ReactNode;
}

export function FilmScene({
  image,
  imageAlt = "",
  priority = false,
  hero = false,
  children,
}: FilmSceneProps) {
  const sceneRef = useRef<HTMLElement | null>(null);
  const bgRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const listeners = useRef(new Set<(t: number) => void>());
  const last = useRef(0);

  useScrollFilm(
    { scene: sceneRef, bg: bgRef, copy: copyRef, card: cardRef, skipEntry: hero },
    useCallback((t: number) => {
      last.current = t;
      listeners.current.forEach((fn) => fn(t));
    }, [])
  );

  const subscribe = useCallback((fn: (t: number) => void) => {
    listeners.current.add(fn);
    // Catch up straight away so a late child is never a frame behind.
    fn(last.current);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const value = useMemo<FilmSceneContextValue>(
    () => ({ copyRef, cardRef, subscribe }),
    [subscribe]
  );

  return (
    <FilmSceneContext.Provider value={value}>
      <section className="film-scene" ref={sceneRef}>
        <div className="film-stage">
          <div className="film-bg" ref={bgRef}>
            <Image
              src={image}
              alt={imageAlt}
              fill
              sizes="100vw"
              priority={priority}
              quality={72}
              aria-hidden={imageAlt === "" ? true : undefined}
            />
          </div>
          <div className="film-scrim" aria-hidden="true" />
          <div className="film-grain" aria-hidden="true" />
          {children}
        </div>
      </section>
    </FilmSceneContext.Provider>
  );
}
