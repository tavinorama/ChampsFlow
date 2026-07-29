/**
 * filmStyles: the stylesheet for the cinematic scenes.
 *
 * Kept as one injected string (the same pattern the marketing layout uses)
 * because these rules need sticky positioning, pseudo elements, media queries
 * and a reduced-motion fallback, none of which can be inline styles.
 *
 * The film is always dark. It is a photographic sequence, so it keeps its own
 * palette instead of following the light/dark theme token. The green matches
 * --color-primary (#27c98a) so the scenes, the navbar CTA and the footer stay
 * one brand.
 */

export const FILM_STYLES = `
.film {
  --film-ground: #060c09;
  --film-ink: #f4f9f6;
  --film-muted: #9db0a6;
  --film-green: #27c98a;
  --film-red: #f0584e;
  --film-line: rgba(244,249,246,0.13);
  background: var(--film-ground);
  color: var(--film-ink);
  position: relative;
  overflow-x: clip;
}

/* ── Scroll progress hairline ─────────────────────────────────────── */
.film-prog {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--film-green);
  z-index: 120;
  transform: scaleX(0);
  transform-origin: 0 50%;
  box-shadow: 0 0 12px rgba(39,201,138,0.8);
  pointer-events: none;
}

/* ── Scene track + sticky stage ───────────────────────────────────── */
.film-scene { height: 225vh; position: relative; }
.film-stage {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.film-bg {
  position: absolute;
  inset: -7%;
  will-change: transform, opacity;
  transform: scale(1.18);
}
.film-bg img { object-fit: cover; }
.film-scrim {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(115% 85% at 50% 55%, rgba(6,12,9,0.22), rgba(6,12,9,0.88) 72%),
    linear-gradient(180deg, rgba(6,12,9,0.92) 0%, rgba(6,12,9,0.30) 32%, rgba(6,12,9,0.60) 70%, rgba(6,12,9,0.97) 100%);
}
.film-grain {
  position: absolute;
  inset: 0;
  opacity: 0.05;
  mix-blend-mode: overlay;
  pointer-events: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='.6'/></svg>");
}

/* ── Copy ─────────────────────────────────────────────────────────── */
.film-copy {
  position: relative;
  z-index: 4;
  width: min(1060px, 90vw);
  will-change: transform, opacity;
}
.film-eyebrow {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--film-muted);
  font-weight: 700;
  margin: 0 0 16px;
}
.film-eyebrow.is-accent { color: var(--film-green); }
.film-copy h1,
.film-copy h2 {
  font-size: clamp(32px, 6.4vw, 78px);
  line-height: 1.0;
  letter-spacing: -0.035em;
  font-weight: 830;
  margin: 0;
  max-width: 15ch;
  text-wrap: balance;
}
.film-copy h1 em,
.film-copy h2 em { font-style: normal; color: var(--film-green); }
.film-sub {
  margin: 20px 0 0;
  font-size: clamp(15.5px, 2vw, 20px);
  line-height: 1.5;
  color: #d3e0d9;
  max-width: 34ch;
  font-weight: 430;
}
.film-sub b { color: var(--film-ink); font-weight: 700; }

/* ── Guarantee chip, sits with the first call to action ───────────── */
.film-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 20px;
  font-size: 12.5px;
  font-weight: 600;
  color: #cfdcd5;
  border: 1px solid var(--film-line);
  border-radius: 999px;
  padding: 7px 13px;
}
.film-chip svg { width: 14px; height: 14px; color: var(--film-green); flex: none; }

/* ── AI answer device ─────────────────────────────────────────────── */
.film-answer {
  margin-top: 26px;
  width: min(500px, 88vw);
  background: rgba(6,13,10,0.80);
  border: 1px solid var(--film-line);
  border-radius: 14px;
  padding: 16px 18px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  will-change: transform;
}
.film-q {
  font-size: 12px;
  color: var(--film-muted);
  margin: 0 0 11px;
  display: flex;
  gap: 8px;
}
.film-q b { color: var(--film-green); font-weight: 800; flex: none; }
.film-a {
  font-size: 14.5px;
  line-height: 1.6;
  margin: 0;
  color: #e2ece7;
  min-height: 3.2em;
}
.film-a .is-rival { color: var(--film-muted); }
.film-a .is-you { color: var(--film-green); font-weight: 760; }
.film-caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--film-green);
  vertical-align: -2px;
  margin-left: 1px;
  animation: film-blink 1s steps(2) infinite;
}
@keyframes film-blink { 50% { opacity: 0; } }

/* ── Product panel ────────────────────────────────────────────────── */
.film-panel {
  margin-top: 26px;
  width: min(520px, 88vw);
  background: rgba(6,13,10,0.80);
  border: 1px solid var(--film-line);
  border-radius: 14px;
  padding: 17px 18px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  will-change: transform;
}
.film-tag {
  display: inline-block;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 750;
  color: #04120c;
  background: var(--film-green);
  padding: 4px 9px;
  border-radius: 5px;
  margin-bottom: 14px;
}

/* engines */
.film-engines { display: flex; flex-direction: column; gap: 9px; }
.film-engines .film-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
  opacity: 0.24;
  transition: opacity 0.25s ease;
}
.film-engines .film-row.is-on { opacity: 1; }
.film-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--film-muted);
  flex: none;
  transition: background 0.25s ease, box-shadow 0.25s ease;
}
.film-engines .film-row.is-on .film-dot {
  background: var(--film-green);
  box-shadow: 0 0 9px rgba(39,201,138,0.9);
}
.film-who { flex: 1; color: #d3e0d9; }
.film-res { font-size: 12px; color: var(--film-red); font-weight: 650; }
.film-engines .film-row.is-on .film-res.is-ok { color: var(--film-green); }
.film-score {
  margin-top: 15px;
  padding-top: 14px;
  border-top: 1px solid var(--film-line);
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.film-score b {
  font-size: 40px;
  font-weight: 830;
  letter-spacing: -0.04em;
  color: var(--film-green);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.film-score i { font-style: normal; font-size: 12.5px; color: var(--film-muted); }

/* checklist */
.film-work { display: flex; flex-direction: column; gap: 11px; }
.film-work .film-item {
  display: flex;
  gap: 11px;
  align-items: flex-start;
  font-size: 13.5px;
  color: #d3e0d9;
  opacity: 0.22;
  transition: opacity 0.3s ease, transform 0.3s ease;
  transform: translateY(4px);
}
.film-work .film-item.is-on { opacity: 1; transform: none; }
.film-check {
  width: 17px;
  height: 17px;
  border-radius: 5px;
  border: 1.5px solid var(--film-muted);
  flex: none;
  display: grid;
  place-items: center;
  font-size: 10px;
  color: transparent;
  transition: border-color 0.3s ease, background 0.3s ease, color 0.3s ease;
  margin-top: 1px;
}
.film-work .film-item.is-on .film-check {
  border-color: var(--film-green);
  background: var(--film-green);
  color: #04120c;
}
.film-work .film-item b { color: var(--film-ink); font-weight: 680; }

/* ── Closing act ──────────────────────────────────────────────────── */
.film-closing {
  position: relative;
  padding: clamp(64px, 10vh, 120px) clamp(14px, 5vw, 40px) 64px;
  background: linear-gradient(180deg, var(--film-ground), #040806);
}
.film-wrap { width: min(1060px, 92vw); margin: 0 auto; }
.film-verticals {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  justify-content: center;
  margin: 0 0 40px;
  padding: 0;
  list-style: none;
}
.film-verticals li {
  font-size: 12.5px;
  color: #cfdcd5;
  border: 1px solid var(--film-line);
  padding: 7px 13px;
  border-radius: 999px;
  font-weight: 560;
}
.film-offer {
  display: grid;
  grid-template-columns: 1fr;
  gap: 32px;
  align-items: center;
  border: 1px solid var(--film-line);
  border-radius: 20px;
  padding: clamp(24px, 4vw, 44px);
  background: linear-gradient(160deg, rgba(39,201,138,0.08), rgba(39,201,138,0) 55%);
  scroll-margin-top: 88px;
}
@media (min-width: 860px) {
  .film-offer { grid-template-columns: 1.05fr 0.95fr; gap: 50px; }
}
.film-offer h2 {
  font-size: clamp(25px, 3.5vw, 40px);
  line-height: 1.05;
  letter-spacing: -0.03em;
  margin: 0;
  font-weight: 820;
  max-width: 14ch;
  text-wrap: balance;
}
.film-offer > div > p {
  margin: 15px 0 0;
  color: #cfdcd5;
  font-size: 15.5px;
  line-height: 1.55;
  max-width: 34ch;
}
.film-form { display: flex; flex-direction: column; gap: 10px; }
.film-form label {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--film-muted);
  font-weight: 700;
}
.film-field { display: flex; flex-direction: column; gap: 6px; }
.film-form input {
  background: rgba(255,255,255,0.045);
  border: 1px solid var(--film-line);
  color: var(--film-ink);
  border-radius: 11px;
  padding: 14px 15px;
  font-size: 16px;
  font-family: inherit;
  width: 100%;
}
.film-form input::placeholder { color: #6f817a; }
.film-form input:focus {
  outline: none;
  border-color: var(--film-green);
  box-shadow: 0 0 0 3px rgba(39,201,138,0.17);
}
.film-form input[aria-invalid="true"] { border-color: var(--film-red); }
.film-error { margin: 0; font-size: 12.5px; color: var(--film-red); font-weight: 600; }
.film-form button {
  margin-top: 5px;
  background: var(--film-green);
  color: #04120c;
  border: none;
  border-radius: 11px;
  padding: 15px 20px;
  font-size: 16.5px;
  font-weight: 790;
  font-family: inherit;
  cursor: pointer;
  min-height: 48px;
  box-shadow: 0 8px 24px rgba(39,201,138,0.26);
  transition: transform 0.16s ease, filter 0.16s ease;
}
.film-form button:hover { transform: translateY(-1px); }
.film-form button[disabled] { opacity: 0.65; cursor: progress; transform: none; }
.film-fine { margin: 11px 0 0; font-size: 12.5px; color: var(--film-muted); text-align: center; }
.film-fine b { color: #cfdcd5; font-weight: 640; }

.film-ladder {
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr;
  margin-top: 34px;
  padding: 0;
  list-style: none;
}
@media (min-width: 760px) {
  .film-ladder { grid-template-columns: repeat(4, 1fr); }
}
.film-step {
  border: 1px solid var(--film-line);
  border-radius: 13px;
  padding: 15px 16px;
}
.film-step b { display: block; font-size: 14px; font-weight: 720; margin-bottom: 5px; }
.film-step span { font-size: 12.5px; color: var(--film-muted); line-height: 1.45; }
.film-step.is-now {
  border-color: rgba(39,201,138,0.45);
  background: rgba(39,201,138,0.06);
}
.film-signoff {
  margin-top: 50px;
  padding-top: 24px;
  border-top: 1px solid var(--film-line);
  display: flex;
  flex-wrap: wrap;
  gap: 13px;
  align-items: center;
  justify-content: space-between;
}
.film-signoff p { margin: 0; font-size: 12.5px; color: var(--film-muted); max-width: 58ch; }
.film-signoff strong { font-size: 14px; color: #cfdcd5; font-weight: 620; }

.film :focus-visible { outline: 2px solid var(--film-green); outline-offset: 3px; }

/* ── Reduced motion: a plain stack of sections, nothing moves ──────── */
@media (prefers-reduced-motion: reduce) {
  .film-scene { height: auto; }
  .film-stage {
    position: relative;
    height: auto;
    min-height: 86vh;
    padding: 86px 0;
  }
  .film-bg { transform: none !important; opacity: 0.45 !important; }
  .film-copy { transform: none !important; opacity: 1 !important; }
  .film-answer, .film-panel { transform: none !important; }
  .film-engines .film-row,
  .film-work .film-item { opacity: 1 !important; transform: none !important; }
  .film-prog { display: none; }
  .film-caret { display: none; }
  .film * { transition: none !important; animation: none !important; }
}
`;
