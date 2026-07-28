"use client";

/**
 * /scroll-preview — Ozvor cinematic scroll home PROTOTYPE.
 *
 * One continuous camera flight through 4 scenes of the product journey,
 * scrubbed by scroll (Apple product-page style — scroll drives time,
 * the camera never cuts):
 *
 *   1. INVISIBLE  — a buyer asks AI; the answer names competitors,
 *                   the visitor's brand is a ghost.
 *   2. THE SWEEP  — the Ozvor ring orbits the 5 real engines, probing
 *                   with web search on.
 *   3. THE SCORE  — the scorecard assembles: 3 scores, measured.
 *   4. CITED      — the same question; now AI names the brand. CTA.
 *
 * Scrub pattern adapted from scroll-world by oso95, MIT
 * (https://github.com/oso95/scroll-world) — tall scroll track, fixed
 * stage, scroll→timeline mapping with rAF lerp smoothing, per-scene
 * copy choreography, route rail, reduced-motion fallback. The video
 * blob-scrub of the original is replaced by pure CSS 3D scenes
 * (transform/opacity only — no video, no stock imagery).
 *
 * Honesty rules respected: no invented social proof, no fabricated
 * testimonials, scorecard is labeled as a sample. The 30-day guarantee
 * is real (see /refund).
 */

import { useEffect, useRef } from "react";
import { LogoMark } from "../../components/brand/Logo";

/* ------------------------------------------------------------------ */
/* Timeline config (scene-units; t = scrollProgress * 4)               */
/* ------------------------------------------------------------------ */

const N = 4;
// Where each scene is perfectly framed on the timeline.
const FRAME = [0.1, 1.5, 2.6, 3.55];
// Content band per scene: u goes 0→1 across [start, start+span].
const CONTENT_START = [0.0, 1.05, 2.05, 3.1];
const CONTENT_SPAN = [0.75, 0.8, 0.8, 0.7];
const K = Math.log(2.3); // dolly zoom factor per scene-unit

const QUESTION = "best project tool for small agencies that runs itself";

const ENGINES = ["ChatGPT", "Claude", "Perplexity", "Gemini", "AI Overviews"];

const SCORES = [
  { label: "Visibility", value: 62, tol: 4 },
  { label: "Citation Readiness", value: 71, tol: 3 },
  { label: "Execution", value: 58, tol: 5 },
];

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);

export default function ScrollPreviewPage() {
  const sceneRefs = useRef<(HTMLElement | null)[]>([]);
  const typedRef = useRef<HTMLSpanElement | null>(null);
  const numRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const barRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // static fallback: CSS shows everything, no scrub

    let cur = 0;
    let raf = 0;
    let active = -1;

    const frame = () => {
      const max = Math.max(
        1,
        (trackRef.current?.offsetHeight ?? document.documentElement.scrollHeight) -
          window.innerHeight,
      );
      const p = clamp(window.scrollY / max);
      cur += (p - cur) * 0.16;
      if (Math.abs(p - cur) < 0.0004) cur = p;
      const t = cur * N;

      for (let i = 0; i < N; i++) {
        const el = sceneRefs.current[i];
        if (!el) continue;
        let d = t - FRAME[i];
        if (i === N - 1) d = Math.min(d, 0); // last scene parks
        const scale = Math.exp(K * d);
        const ty = -d * 6; // vh — slight rise as the camera passes through
        // opacity: fly-in (except scene 0), fly-out (except last scene)
        let op = 1;
        if (i > 0) op *= smooth((d + 0.95) / 0.35);
        if (i < N - 1) op *= 1 - smooth((d - 0.5) / 0.3);
        el.style.opacity = op.toFixed(3);
        el.style.transform = `translateY(${ty.toFixed(2)}vh) scale(${scale.toFixed(4)})`;
        el.style.visibility = op < 0.004 ? "hidden" : "visible";
        el.style.zIndex = String(10 + Math.round(op * 10));

        const u = clamp((t - CONTENT_START[i]) / CONTENT_SPAN[i]);
        el.style.setProperty("--u", u.toFixed(3));
      }

      // Scene 1: typed question
      if (typedRef.current) {
        const u0 = clamp((t - CONTENT_START[0]) / CONTENT_SPAN[0]);
        const chars = Math.round(QUESTION.length * clamp(u0 / 0.42));
        const txt = QUESTION.slice(0, chars);
        if (typedRef.current.textContent !== txt) typedRef.current.textContent = txt;
      }

      // Scene 3: counters
      const u2 = clamp((t - CONTENT_START[2]) / CONTENT_SPAN[2]);
      SCORES.forEach((s, i) => {
        const eln = numRefs.current[i];
        if (!eln) return;
        const v = Math.round(s.value * easeOut(clamp((u2 - 0.15 - i * 0.08) / 0.5)));
        const txt = String(v);
        if (eln.textContent !== txt) eln.textContent = txt;
      });

      // progress + hint + route rail
      if (barRef.current) barRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
      if (hintRef.current)
        hintRef.current.style.opacity = (0.8 * (1 - clamp(t / 0.3))).toFixed(3);
      let near = 0;
      let best = Infinity;
      for (let i = 0; i < N; i++) {
        const dist = Math.abs(t - FRAME[i]);
        if (dist < best) {
          best = dist;
          near = i;
        }
      }
      if (near !== active) {
        active = near;
        dotRefs.current.forEach((dot, i) => dot?.classList.toggle("is-active", i === near));
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const jumpTo = (i: number) => {
    const max =
      (trackRef.current?.offsetHeight ?? document.documentElement.scrollHeight) -
      window.innerHeight;
    window.scrollTo({ top: (FRAME[i] / N) * max, behavior: "smooth" });
  };

  return (
    <div className="sp-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* fixed backdrop */}
      <div className="sp-bg" aria-hidden="true" />

      {/* progress bar */}
      <div className="sp-progress" aria-hidden="true">
        <div ref={barRef} />
      </div>

      {/* top bar: logo + persistent CTA */}
      <header className="sp-top">
        <a className="sp-logo" href="/" aria-label="Ozvor home">
          <LogoMark size={26} />
          <span>Ozvor</span>
        </a>
        <a className="sp-cta-mini" href="/test">
          Run my free test
        </a>
      </header>

      {/* route rail */}
      <nav className="sp-rail" aria-label="Scenes">
        {["Invisible", "The sweep", "The score", "Cited"].map((label, i) => (
          <button
            key={label}
            ref={(el) => {
              dotRefs.current[i] = el;
            }}
            className={i === 0 ? "is-active" : undefined}
            onClick={() => jumpTo(i)}
            aria-label={`Go to scene: ${label}`}
          >
            <i />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* ---------------- fixed stage: the 4 scenes ---------------- */}
      <div className="sp-stage">
        {/* SCENE 1 — INVISIBLE */}
        <section
          ref={(el) => {
            sceneRefs.current[0] = el;
          }}
          className="sp-scene sp-s1"
          aria-label="Scene 1: your brand is invisible to AI"
        >
          <div className="sp-inner">
            <div className="sp-copy">
              <p className="sp-eyebrow sp-eyebrow--red">Right now, somewhere</p>
              <h1 className="sp-h1">
                Make AI name <em>your</em> brand.
                <br />
                Not your competitor.
              </h1>
              <p className="sp-body">
                People already ask AI for tools like yours. The answer names someone
                else. You never even see it happen.
              </p>
            </div>
            <div className="sp-visual">
              <div className="sp-chat">
                <div className="sp-chat-q">
                  {/* Full text is the SSR/no-JS/reduced-motion default; the
                      scrub loop retypes it from the scroll position. */}
                  <span ref={typedRef} className="sp-typed">
                    {QUESTION}
                  </span>
                  <span className="sp-caret" aria-hidden="true" />
                </div>
                <div className="sp-chat-a sp-r1">
                  <span className="sp-ai-dot" aria-hidden="true" />
                  For small agencies, the top picks are{" "}
                  <strong>Asana</strong>, <strong>ClickUp</strong> and{" "}
                  <strong>Trello</strong>.
                </div>
                <div className="sp-ghost sp-r2">
                  <span>your-brand.com</span>
                  <span className="sp-ghost-tag">not mentioned</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SCENE 2 — THE SWEEP */}
        <section
          ref={(el) => {
            sceneRefs.current[1] = el;
          }}
          className="sp-scene sp-s2"
          aria-label="Scene 2: Ozvor audits 5 AI engines"
        >
          <div className="sp-inner">
            <div className="sp-copy">
              <p className="sp-eyebrow">The sweep</p>
              <h2 className="sp-h2">We ask the real engines.</h2>
              <p className="sp-body">
                One audit runs your brand through ChatGPT, Claude, Perplexity, Gemini
                and Google AI Overviews. Web search on. No simulations.
              </p>
            </div>
            <div className="sp-visual">
              <div className="sp-orbit-wrap">
                <div className="sp-orbit-ring" aria-hidden="true" />
                <div className="sp-orbit-core" aria-hidden="true">
                  <LogoMark size={72} />
                </div>
                <div className="sp-orbit">
                  {ENGINES.map((name, i) => (
                    <div
                      key={name}
                      className="sp-planet"
                      style={{ "--a": `${(360 / ENGINES.length) * i}deg`, "--i": i } as React.CSSProperties}
                    >
                      <span className="sp-planet-chip">
                        <i className="sp-pulse" aria-hidden="true" />
                        {name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SCENE 3 — THE SCORE */}
        <section
          ref={(el) => {
            sceneRefs.current[2] = el;
          }}
          className="sp-scene sp-s3"
          aria-label="Scene 3: the Ozvor AI Visibility Score"
        >
          <div className="sp-inner">
            <div className="sp-copy">
              <p className="sp-eyebrow">The score</p>
              <h2 className="sp-h2">Measured, not guessed.</h2>
              <p className="sp-body">
                Three scores from real answers, scored the same way every time. You
                see exactly where you stand.
              </p>
            </div>
            <div className="sp-visual">
              <div className="sp-card">
                <div className="sp-card-head">
                  <span>Ozvor AI Visibility Score</span>
                  <span className="sp-card-sample">sample audit</span>
                </div>
                {SCORES.map((s, i) => (
                  <div className="sp-score" key={s.label} style={{ "--i": i } as React.CSSProperties}>
                    <div className="sp-score-top">
                      <span className="sp-score-label">{s.label}</span>
                      <span className="sp-score-num">
                        <span
                          ref={(el) => {
                            numRefs.current[i] = el;
                          }}
                        >
                          {s.value}
                        </span>
                        <small>/100</small>
                        <em className="sp-tol">±{s.tol}%</em>
                      </span>
                    </div>
                    <div className="sp-bar">
                      <div className="sp-bar-fill" style={{ "--v": s.value / 100 } as React.CSSProperties} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SCENE 4 — CITED */}
        <section
          ref={(el) => {
            sceneRefs.current[3] = el;
          }}
          className="sp-scene sp-s4"
          aria-label="Scene 4: AI now cites your brand"
        >
          <div className="sp-inner sp-inner--stack">
            <div className="sp-chat sp-chat--won">
              <div className="sp-chat-q sp-chat-q--done">{QUESTION}</div>
              <div className="sp-chat-a">
                <span className="sp-ai-dot sp-ai-dot--green" aria-hidden="true" />
                Start with <strong className="sp-won">your brand</strong>. It fits
                small agencies best.
              </div>
            </div>
            <div className="sp-final">
              <h2 className="sp-h1 sp-h1--final">This is where you end up. Cited.</h2>
              <p className="sp-body sp-body--center">
                Run the free test. See how the 5 engines answer about you today.
              </p>
              <form
                className="sp-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  window.location.href = "/test";
                }}
              >
                <input
                  type="url"
                  name="site"
                  placeholder="your-site.com"
                  aria-label="Your website"
                  required
                />
                <input
                  type="email"
                  name="email"
                  placeholder="you@company.com"
                  aria-label="Your email"
                  required
                />
                <button type="submit">Run my free test</button>
              </form>
              <p className="sp-form-note">No card. Results in 60 seconds.</p>
              <div className="sp-badges">
                <span className="sp-guarantee">
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path
                      d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M8.5 12l2.5 2.5 4.5-4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                  30-day money-back guarantee
                </span>
              </div>
              <div className="sp-engines-row" aria-label="Engines covered">
                {ENGINES.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* scroll hint */}
      <div ref={hintRef} className="sp-hint" aria-hidden="true">
        <span>scroll</span>
        <i />
      </div>

      {/* the scroll track — the film's length */}
      <div ref={trackRef} className="sp-track" aria-hidden="true" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles — brand palette, transform/opacity animation only            */
/* ------------------------------------------------------------------ */

const CSS = `
.sp-root {
  --sp-bg: #0a0f0d;
  --sp-ink: #f6faf7;
  --sp-accent: #27c98a;
  --sp-muted: #a6b4ac;
  --sp-red: #f0584e;
  --sp-font: var(--font-schibsted), "Schibsted Grotesk", system-ui, sans-serif;
  font-family: var(--sp-font);
  color: var(--sp-ink);
  background: var(--sp-bg);
}
.sp-bg {
  position: fixed; inset: 0; z-index: 0;
  background:
    radial-gradient(ellipse 70% 55% at 50% 0%, rgba(39,201,138,0.09) 0%, transparent 65%),
    radial-gradient(ellipse 60% 50% at 80% 100%, rgba(39,201,138,0.05) 0%, transparent 60%),
    var(--sp-bg);
}
.sp-track { position: relative; z-index: 1; height: 640vh; pointer-events: none; }

.sp-progress {
  position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 60;
  background: rgba(39,201,138,0.12);
}
.sp-progress > div {
  height: 100%; background: var(--sp-accent);
  transform: scaleX(0); transform-origin: 0 50%; will-change: transform;
}

.sp-top {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  display: flex; align-items: center; justify-content: space-between;
  padding: clamp(14px, 2.4vw, 24px) clamp(16px, 4vw, 48px);
  pointer-events: none;
}
.sp-top a { pointer-events: auto; }
.sp-logo {
  display: inline-flex; align-items: center; gap: 10px;
  color: var(--sp-ink); text-decoration: none;
  font-weight: 600; font-size: 1.05rem; letter-spacing: 0.04em;
}
.sp-cta-mini {
  color: #06231a; background: var(--sp-accent);
  text-decoration: none; font-weight: 700; font-size: 0.86rem;
  padding: 9px 16px; border-radius: 999px;
  box-shadow: 0 4px 18px rgba(39,201,138,0.35);
  transition: transform 0.2s;
}
.sp-cta-mini:hover { transform: translateY(-2px); }

.sp-rail {
  position: fixed; right: clamp(10px, 2vw, 26px); top: 50%; z-index: 40;
  transform: translateY(-50%);
  display: flex; flex-direction: column; gap: 18px;
}
.sp-rail button {
  position: relative; width: 26px; height: 26px;
  display: grid; place-items: center;
  background: transparent; border: 0; cursor: pointer; padding: 0;
}
.sp-rail button i {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(166,180,172,0.4);
  transition: transform 0.3s, background 0.3s, box-shadow 0.3s;
}
.sp-rail button.is-active i {
  background: var(--sp-accent); transform: scale(1.4);
  box-shadow: 0 0 0 5px rgba(39,201,138,0.18);
}
.sp-rail button span {
  position: absolute; right: 30px; top: 50%; transform: translateY(-50%);
  white-space: nowrap; font-size: 0.72rem; font-weight: 600; color: var(--sp-muted);
  opacity: 0; transition: opacity 0.25s; pointer-events: none;
}
.sp-rail button:hover span { opacity: 1; }

.sp-stage { position: fixed; inset: 0; z-index: 10; overflow: hidden; }
.sp-scene {
  position: absolute; inset: 0;
  display: grid; place-items: center;
  opacity: 0; visibility: hidden;
  will-change: transform, opacity;
  --u: 0;
}
.sp-scene:first-child { opacity: 1; visibility: visible; }
.sp-inner {
  width: min(1120px, 92vw);
  display: grid; grid-template-columns: 1.05fr 1fr;
  gap: clamp(24px, 5vw, 72px); align-items: center;
}
.sp-inner--stack { grid-template-columns: 1fr; justify-items: center; gap: clamp(20px, 4vh, 40px); }

.sp-eyebrow {
  font-size: 0.78rem; font-weight: 700; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--sp-accent); margin: 0 0 14px;
  opacity: clamp(0, calc(var(--u) / 0.2), 1);
}
.sp-eyebrow--red { color: var(--sp-red); }
.sp-h1 {
  font-size: clamp(2rem, 5.2vw, 3.9rem); line-height: 1.04;
  font-weight: 800; letter-spacing: -0.015em; margin: 0;
  opacity: clamp(0, calc((var(--u) - 0.05) / 0.25), 1);
  transform: translateY(calc((1 - clamp(0, calc((var(--u) - 0.05) / 0.25), 1)) * 26px));
}
.sp-h1 em { font-style: normal; color: var(--sp-accent); }
.sp-h2 {
  font-size: clamp(1.7rem, 4vw, 3rem); line-height: 1.06;
  font-weight: 800; letter-spacing: -0.01em; margin: 0;
  opacity: clamp(0, calc((var(--u) - 0.08) / 0.25), 1);
  transform: translateY(calc((1 - clamp(0, calc((var(--u) - 0.08) / 0.25), 1)) * 22px));
}
.sp-body {
  margin: 18px 0 0; max-width: 42ch;
  font-size: clamp(0.98rem, 1.3vw, 1.12rem); line-height: 1.6; color: var(--sp-muted);
  opacity: clamp(0, calc((var(--u) - 0.2) / 0.25), 1);
  transform: translateY(calc((1 - clamp(0, calc((var(--u) - 0.2) / 0.25), 1)) * 18px));
}
.sp-body--center { text-align: center; margin-left: auto; margin-right: auto; }

/* Scene 1: the camera starts INSIDE this scene, so its copy is visible
   from the very first frame (no scroll needed to read the promise). */
.sp-s1 .sp-eyebrow, .sp-s1 .sp-h1, .sp-s1 .sp-body { opacity: 1; transform: none; }
/* The question bubble only exists once someone starts typing it. */
.sp-s1 .sp-chat { opacity: clamp(0, calc(var(--u) / 0.05), 1); }

/* ---- chat mock ---- */
.sp-chat {
  width: 100%; max-width: 480px;
  display: flex; flex-direction: column; gap: 12px;
}
.sp-chat-q {
  align-self: flex-end;
  background: rgba(246,250,247,0.09);
  border: 1px solid rgba(246,250,247,0.12);
  border-radius: 16px 16px 4px 16px;
  padding: 12px 16px; font-size: 0.95rem; min-height: 1.4em;
  color: var(--sp-ink); max-width: 90%;
}
.sp-chat-q--done { min-height: 0; }
.sp-caret {
  display: inline-block; width: 2px; height: 1em; margin-left: 2px;
  background: var(--sp-accent); vertical-align: text-bottom;
  animation: sp-blink 0.9s steps(1) infinite;
}
@keyframes sp-blink { 50% { opacity: 0; } }
.sp-chat-a {
  align-self: flex-start; position: relative;
  background: rgba(10,15,13,0.6);
  border: 1px solid rgba(166,180,172,0.18);
  border-radius: 16px 16px 16px 4px;
  padding: 14px 16px 14px 34px; font-size: 0.95rem; line-height: 1.55;
  color: var(--sp-muted); max-width: 95%;
}
.sp-chat-a strong { color: var(--sp-ink); font-weight: 700; }
.sp-ai-dot {
  position: absolute; left: 14px; top: 20px;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--sp-red); box-shadow: 0 0 10px rgba(240,88,78,0.6);
}
.sp-ai-dot--green { background: var(--sp-accent); box-shadow: 0 0 10px rgba(39,201,138,0.7); }
.sp-ghost {
  align-self: flex-start;
  display: flex; align-items: center; gap: 10px;
  font-size: 0.86rem; color: rgba(246,250,247,0.28);
  padding: 8px 14px; border: 1px dashed rgba(240,88,78,0.35); border-radius: 10px;
}
.sp-ghost-tag {
  font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--sp-red); opacity: 0.85;
}
.sp-r1 {
  opacity: clamp(0, calc((var(--u) - 0.5) / 0.18), 1);
  transform: translateY(calc((1 - clamp(0, calc((var(--u) - 0.5) / 0.18), 1)) * 14px));
}
.sp-r2 {
  opacity: clamp(0, calc((var(--u) - 0.7) / 0.18), 1);
  transform: translateY(calc((1 - clamp(0, calc((var(--u) - 0.7) / 0.18), 1)) * 14px));
}

/* ---- orbit ---- */
.sp-visual { display: grid; place-items: center; }
.sp-orbit-wrap {
  position: relative;
  width: min(420px, 78vw); aspect-ratio: 1;
  display: grid; place-items: center;
  opacity: clamp(0, calc(var(--u) / 0.25), 1);
  transform: scale(calc(0.7 + clamp(0, calc(var(--u) / 0.4), 1) * 0.3));
}
.sp-orbit-ring {
  position: absolute; inset: 8%;
  border: 2px dashed rgba(39,201,138,0.3); border-radius: 50%;
  animation: sp-spin 60s linear infinite;
}
.sp-orbit-core {
  position: relative; z-index: 2; color: var(--sp-accent);
  filter: drop-shadow(0 0 24px rgba(39,201,138,0.45));
}
.sp-orbit { position: absolute; inset: 0; animation: sp-spin 44s linear infinite; }
.sp-planet {
  position: absolute; inset: 0;
  transform: rotate(var(--a));
}
.sp-planet-chip {
  position: absolute; left: 50%; top: 4%;
  transform: translateX(-50%) rotate(calc(0deg - var(--a)));
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(10,15,13,0.85);
  border: 1px solid rgba(39,201,138,0.35);
  color: var(--sp-ink); font-size: 0.8rem; font-weight: 600;
  padding: 7px 13px; border-radius: 999px; white-space: nowrap;
  animation: sp-counter-spin 44s linear infinite;
}
@keyframes sp-spin { to { transform: rotate(360deg); } }
@keyframes sp-counter-spin { to { transform: translateX(-50%) rotate(calc(0deg - var(--a) - 360deg)); } }
.sp-pulse {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--sp-accent);
  animation: sp-ping 2.2s ease-out infinite;
  animation-delay: calc(var(--i) * 0.36s);
}
@keyframes sp-ping {
  0% { box-shadow: 0 0 0 0 rgba(39,201,138,0.55); }
  70% { box-shadow: 0 0 0 9px rgba(39,201,138,0); }
  100% { box-shadow: 0 0 0 0 rgba(39,201,138,0); }
}

/* ---- scorecard ---- */
.sp-card {
  width: 100%; max-width: 460px;
  background: rgba(10,15,13,0.72);
  border: 1px solid rgba(39,201,138,0.22);
  border-radius: 18px; padding: clamp(18px, 3vw, 28px);
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
  opacity: clamp(0, calc(var(--u) / 0.2), 1);
  transform: translateY(calc((1 - clamp(0, calc(var(--u) / 0.3), 1)) * 30px));
}
.sp-card-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  font-weight: 700; font-size: 0.95rem; margin-bottom: 18px;
}
.sp-card-sample {
  font-size: 0.68rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--sp-muted); border: 1px solid rgba(166,180,172,0.3);
  padding: 3px 8px; border-radius: 999px;
}
.sp-score { margin-top: 16px; }
.sp-score-top { display: flex; align-items: baseline; justify-content: space-between; }
.sp-score-label { font-size: 0.88rem; color: var(--sp-muted); font-weight: 600; }
.sp-score-num { font-size: 1.5rem; font-weight: 800; color: var(--sp-ink); }
.sp-score-num small { font-size: 0.75rem; color: var(--sp-muted); font-weight: 600; margin-left: 2px; }
.sp-tol { font-style: normal; font-size: 0.68rem; color: var(--sp-muted); margin-left: 8px; opacity: 0.8; }
.sp-bar {
  height: 7px; border-radius: 999px; margin-top: 8px;
  background: rgba(166,180,172,0.15); overflow: hidden;
}
.sp-bar-fill {
  height: 100%; border-radius: inherit;
  background: linear-gradient(90deg, rgba(39,201,138,0.65), var(--sp-accent));
  transform-origin: 0 50%;
  transform: scaleX(calc(var(--v) * clamp(0, calc((var(--u) - 0.15 - var(--i, 0) * 0.08) / 0.5), 1)));
}

/* ---- final ---- */
.sp-chat--won {
  max-width: 520px;
  opacity: clamp(0, calc(var(--u) / 0.22), 1);
  transform: translateY(calc((1 - clamp(0, calc(var(--u) / 0.3), 1)) * 20px));
}
.sp-won {
  color: var(--sp-accent) !important;
  text-shadow: 0 0 18px rgba(39,201,138,0.55);
}
.sp-final {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  opacity: clamp(0, calc((var(--u) - 0.3) / 0.25), 1);
  transform: translateY(calc((1 - clamp(0, calc((var(--u) - 0.3) / 0.25), 1)) * 26px));
}
.sp-h1--final { font-size: clamp(1.8rem, 4.6vw, 3.4rem); }
.sp-form {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;
  margin-top: 26px; width: 100%; max-width: 640px;
}
.sp-form input {
  flex: 1 1 200px; min-width: 0;
  background: rgba(246,250,247,0.07);
  border: 1px solid rgba(166,180,172,0.3);
  border-radius: 12px; padding: 13px 16px;
  color: var(--sp-ink); font-size: 0.95rem; font-family: inherit;
  outline: none; transition: border-color 0.2s;
}
.sp-form input:focus { border-color: var(--sp-accent); }
.sp-form input::placeholder { color: rgba(166,180,172,0.6); }
.sp-form button {
  flex: 0 0 auto;
  background: var(--sp-accent); color: #06231a;
  border: 0; border-radius: 12px; padding: 13px 24px;
  font-size: 0.98rem; font-weight: 800; font-family: inherit; cursor: pointer;
  box-shadow: 0 8px 30px rgba(39,201,138,0.35);
  transition: transform 0.2s;
}
.sp-form button:hover { transform: translateY(-2px); }
.sp-form-note { margin: 12px 0 0; font-size: 0.84rem; color: var(--sp-muted); }
.sp-badges { margin-top: 16px; }
.sp-guarantee {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 0.8rem; font-weight: 600; color: var(--sp-accent);
  border: 1px solid rgba(39,201,138,0.35);
  padding: 7px 14px; border-radius: 999px;
}
.sp-engines-row {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 18px;
  margin-top: 26px; font-size: 0.78rem; font-weight: 600;
  letter-spacing: 0.06em; color: rgba(166,180,172,0.75);
  text-transform: uppercase;
}

.sp-hint {
  position: fixed; left: 50%; bottom: 22px; z-index: 30;
  transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  font-size: 0.7rem; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--sp-muted); opacity: 0.8;
}
.sp-hint i {
  width: 20px; height: 32px; border-radius: 11px;
  border: 2px solid rgba(166,180,172,0.35); position: relative;
}
.sp-hint i::after {
  content: ""; position: absolute; left: 50%; top: 6px;
  width: 3px; height: 6px; border-radius: 2px; background: var(--sp-accent);
  transform: translateX(-50%);
  animation: sp-wheel 1.7s ease-in-out infinite;
}
@keyframes sp-wheel {
  0% { opacity: 0; transform: translateX(-50%) translateY(0); }
  40% { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) translateY(9px); }
}

/* ---------------- mobile ---------------- */
@media (max-width: 760px) {
  .sp-inner { grid-template-columns: 1fr; gap: 22px; }
  .sp-scene { place-items: start center; padding-top: clamp(72px, 14vh, 120px); }
  .sp-s4 { place-items: center; padding-top: 0; }
  .sp-copy { text-align: left; }
  .sp-body { max-width: none; }
  .sp-chat { max-width: none; }
  .sp-orbit-wrap { width: min(320px, 82vw); margin: 0 auto; }
  .sp-planet-chip { font-size: 0.72rem; padding: 6px 10px; }
  .sp-card { max-width: none; }
  .sp-rail { right: 6px; gap: 14px; }
  .sp-rail button span { display: none; }
  .sp-hint { display: none; }
  .sp-h1--final { font-size: clamp(1.5rem, 7vw, 2.2rem); }
  .sp-final .sp-body { font-size: 0.92rem; }
  .sp-engines-row { gap: 6px 12px; font-size: 0.68rem; }
}

/* ---------------- reduced motion: static sectioned page ---------------- */
@media (prefers-reduced-motion: reduce) {
  .sp-track { display: none; }
  .sp-stage { position: static; overflow: visible; }
  .sp-scene {
    position: relative; inset: auto;
    opacity: 1 !important; visibility: visible !important;
    transform: none !important;
    min-height: 100vh; padding: 96px 0;
    --u: 1;
  }
  .sp-rail, .sp-hint, .sp-progress { display: none; }
  .sp-orbit-ring, .sp-orbit, .sp-planet-chip, .sp-pulse, .sp-caret, .sp-hint i::after {
    animation: none !important;
  }
}
`;
