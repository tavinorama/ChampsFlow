"use client";

/**
 * useScrollFilm: the scroll engine behind the cinematic scenes.
 *
 * Ported 1:1 from the prototype the founder approved (ozvor-home-v3):
 * one tall track per scene, a sticky stage, and a single requestAnimationFrame
 * pass that maps scroll position to a 0..1 progress per scene.
 *
 * Timing contract (do not drift from these numbers, they are the approved feel):
 *   p     scene progress, 0 when the scene tops out, 1 when it scrolls away
 *   in    copy entry,     p 0.00 → 0.16
 *   out   copy exit,      p 0.78 → 1.00
 *   t     inner animation (typing, engines, checklist), p 0.06 → 0.30
 *
 * Performance rules:
 *  - one shared scroll listener and one rAF for the whole page
 *  - every write is transform or opacity (no layout, no paint of geometry)
 *  - no React state per frame; children subscribe and touch the DOM directly
 *  - prefers-reduced-motion turns the whole engine off and the CSS falls back
 *    to a plain stacked-section layout
 */

import { useEffect, useRef } from "react";

/* ------------------------------------------------------------------ */
/* Shared frame driver: one listener, one rAF, many scenes            */
/* ------------------------------------------------------------------ */

type Frame = () => void;

const subscribers = new Set<Frame>();
let ticking = false;
let bound = false;

function runFrame(): void {
  ticking = false;
  subscribers.forEach((fn) => fn());
}

function requestFrame(): void {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(runFrame);
}

function subscribeToFrames(fn: Frame): () => void {
  subscribers.add(fn);
  if (!bound) {
    window.addEventListener("scroll", requestFrame, { passive: true });
    window.addEventListener("resize", requestFrame);
    bound = true;
  }
  // Paint once immediately so a scene is never blank before the first scroll.
  fn();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && bound) {
      window.removeEventListener("scroll", requestFrame);
      window.removeEventListener("resize", requestFrame);
      bound = false;
    }
  };
}

/* ------------------------------------------------------------------ */
/* Math                                                                */
/* ------------------------------------------------------------------ */

export function clamp(v: number, a = 0, b = 1): number {
  return v < a ? a : v > b ? b : v;
}

/** The prototype's easing. Slow in, slow out, no overshoot. */
export function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------------------------------------------ */
/* Scene hook                                                          */
/* ------------------------------------------------------------------ */

export interface ScrollFilmRefs {
  /** The tall track section. Progress is measured against this element. */
  scene: React.RefObject<HTMLElement | null>;
  /** Background layer. Gets the dolly (scale + drift + fade out). */
  bg?: React.RefObject<HTMLElement | null>;
  /** Copy block. Gets the entry and exit. */
  copy?: React.RefObject<HTMLElement | null>;
  /** Optional inner card (answer device, panel). Gets a softer parallax. */
  card?: React.RefObject<HTMLElement | null>;
  /**
   * The first scene of a page sits at scroll 0, where the entry animation has
   * not started yet, so a fading-in copy block would land the visitor on a
   * blank hero. Set this on the opening scene: it is framed from the first
   * paint and only ever plays its exit.
   */
  skipEntry?: boolean;
}

/**
 * Drives one scene and reports its inner progress `t` (0..1, complete at 30%
 * of the scene scroll) to an optional callback, once per animation frame.
 */
export function useScrollFilm(
  refs: ScrollFilmRefs,
  onInner?: (t: number) => void
): void {
  const cb = useRef(onInner);
  cb.current = onInner;

  useEffect(() => {
    if (prefersReducedMotion()) {
      // Static version: hand the children a finished timeline once, so the
      // typed answers and checklists render whole instead of empty.
      cb.current?.(1);
      return;
    }

    const frame = (): void => {
      const el = refs.scene.current;
      if (!el) return;

      const vh = window.innerHeight;
      const rect = el.getBoundingClientRect();
      const span = rect.height - vh;
      const p = clamp(-rect.top / (span || 1));

      const bg = refs.bg?.current;
      if (bg) {
        const scale = (1.18 - 0.18 * ease(p)).toFixed(4);
        const drift = ((p - 0.5) * 30).toFixed(1);
        bg.style.transform = `scale(${scale}) translate3d(0, ${drift}px, 0)`;
        bg.style.opacity = clamp(1 - Math.max(0, p - 0.84) * 6).toFixed(3);
      }

      const inn = refs.skipEntry ? 1 : clamp(p / 0.16);
      const out = clamp((p - 0.78) / 0.22);

      const copy = refs.copy?.current;
      if (copy) {
        copy.style.opacity = (ease(inn) * (1 - ease(out))).toFixed(3);
        copy.style.transform = `translate3d(0, ${(
          (1 - ease(inn)) * 50 -
          ease(out) * 42
        ).toFixed(1)}px, 0)`;
      }

      const card = refs.card?.current;
      if (card) {
        card.style.transform = `translate3d(0, ${(
          (1 - ease(inn)) * 26 -
          (p - 0.5) * 16
        ).toFixed(1)}px, 0)`;
      }

      cb.current?.(clamp((p - 0.06) / 0.24));
    };

    return subscribeToFrames(frame);
    // The ref objects are stable for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Drives the thin progress bar at the top of the page.
 * Writes a transform on the given element, never a width (no layout thrash).
 */
export function useScrollProgress(
  bar: React.RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const frame = (): void => {
      const el = bar.current;
      if (!el) return;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      el.style.transform = `scaleX(${clamp(
        max > 0 ? window.scrollY / max : 0
      ).toFixed(4)})`;
    };
    return subscribeToFrames(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
