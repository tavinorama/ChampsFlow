"use client";

/**
 * FilmChrome: the two page level pieces of the kit.
 *
 * FilmStyles injects the stylesheet once. FilmProgressBar is the green
 * hairline that tracks how far through the story the visitor is.
 */

import { useRef } from "react";
import { FILM_STYLES } from "./filmStyles";
import { useScrollProgress } from "./useScrollFilm";

export function FilmStyles() {
  return <style dangerouslySetInnerHTML={{ __html: FILM_STYLES }} />;
}

export function FilmProgressBar() {
  const bar = useRef<HTMLDivElement | null>(null);
  useScrollProgress(bar);
  return <div className="film-prog" ref={bar} aria-hidden="true" />;
}
