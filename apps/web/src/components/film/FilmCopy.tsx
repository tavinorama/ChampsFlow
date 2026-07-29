"use client";

/**
 * FilmCopy: the words of one scene.
 *
 * Eyebrow, heading, optional sub, plus whatever device the scene carries.
 * It attaches itself to the scene's copy ref, so the entry and the exit are
 * driven by the shared scroll engine instead of a per-component observer.
 */

import { useFilmScene } from "./FilmScene";

export interface FilmCopyProps {
  eyebrow?: React.ReactNode;
  /** Green eyebrow for the scenes that carry a promise. */
  accentEyebrow?: boolean;
  heading: React.ReactNode;
  /** The first scene owns the page h1. Every other scene is an h2. */
  as?: "h1" | "h2";
  sub?: React.ReactNode;
  children?: React.ReactNode;
}

export function FilmCopy({
  eyebrow,
  accentEyebrow = false,
  heading,
  as = "h2",
  sub,
  children,
}: FilmCopyProps) {
  const { copyRef } = useFilmScene();
  const Heading = as;

  return (
    <div className="film-copy" ref={copyRef}>
      {eyebrow ? (
        <p className={`film-eyebrow${accentEyebrow ? " is-accent" : ""}`}>
          {eyebrow}
        </p>
      ) : null}
      <Heading>{heading}</Heading>
      {sub ? <p className="film-sub">{sub}</p> : null}
      {children}
    </div>
  );
}
