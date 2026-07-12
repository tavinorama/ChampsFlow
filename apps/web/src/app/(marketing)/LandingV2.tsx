"use client";

/**
 * LandingV2 — Ozvor homepage v2 redesign (feat/landing-v2-home).
 *
 * Sections: hero -> "your score in 60 seconds" -> "three steps" -> pricing
 * -> mini-FAQ. Nav + footer are owned by ../layout.tsx (PublicNavbar +
 * SiteFooter) and are NOT rendered here — see the implementation report for
 * why (route-group layout already provides them, matches every other
 * marketing page).
 *
 * Source of truth: design_handoff_ozvor_landing/ (README + .dc.html +
 * BRAND-GUIDE.md), with founder-approved amendments layered on top — see
 * landing-v2-logic.ts's file header for the full list (gold -> emerald on
 * Kit, real self-score, 3-scene hero, redesigned section 2/3 demos).
 *
 * State machine: ONE 1s setInterval (created once, cleaned up on unmount)
 * drives the hero scene/tick reducer + the two click-to-play sims' tick
 * counters, reading "is this currently playing" via refs so the interval
 * itself never needs to be recreated (mirrors the design handoff's single-
 * timer logic class). The score ring's 0 -> scoreState.overall count-up is a
 * separate, one-shot IntersectionObserver + requestAnimationFrame tween
 * (never bound to an SVG <text> node — the number is a plain HTML overlay,
 * per the handoff's explicit warning that an SVG-text counter "broke in
 * testing"). prefers-reduced-motion disables both the hero autoplay and the
 * ring tween (jumps straight to the final values) after mount.
 *
 * Self-score data: `selfScore` is server-fetched in page.tsx (GET
 * /api/showcase/geo, 10-min ISR) and passed in as a prop — this component
 * never fetches or hardcodes it. `scoreCardState()` (landing-v2-logic.ts)
 * turns that into either the LIVE chip/copy or the honest SNAPSHOT fallback
 * when the fetch failed. See that file's header for the PR #231 review fix.
 */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { LogoMark } from "../../components/brand/Logo";
import { safeJsonLd } from "../../components/landing-public/json-ld";
import { useDirectCheckout } from "../../lib/use-direct-checkout";
import {
  type SelfScoreApiData,
  scoreCardState,
  EXECUTION_NOTE,
  SCORE_BULLETS,
  STEPS,
  PRICING_TIERS,
  ECOSYSTEM_CARDS,
  FAQS,
  CALENDLY_URL,
  HERO_CAPTIONS,
  HERO_ACTION_CARDS,
  AI_ANSWER_QUERY,
  AI_ANSWER_TOKENS,
  AI_ANSWER_CITATION_INDEX,
  AI_ANSWER_TICK_COUNT,
  KIT_TICK_COUNT,
  ringOffset,
  subScoreWidthPct,
  heroLoopPct,
  nextHeroTick,
  heroGrowth,
  aiAnswerSim,
  kitSim,
} from "./landing-v2-logic";

// ---------------------------------------------------------------------------
// Shared style bits
// ---------------------------------------------------------------------------

/** Resets ONLY the chrome properties — deliberately leaves `outline` alone
 * so the shared `.mk-root :focus-visible` rule (layout.tsx) keeps working. */
const BUTTON_RESET: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

/** Overlay label rendered on top of the three product-demo frames — part of
 * the "screenshot" chrome, so intentionally fixed-dark in both themes (see
 * the theming header note above each demo frame). */
const DEMO_CHIP_STYLE: CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 2,
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.06em",
  color: "#9fb0a4",
  background: "rgba(0,0,0,0.5)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 20,
  padding: "3px 8px",
  pointerEvents: "none",
  whiteSpace: "nowrap",
};

const LANDING_V2_STYLES = `
  @keyframes lv2-fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes lv2-floatIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes lv2-typing { from { width: 0; } 55% { width: 13.5ch; } to { width: 13.5ch; } }
  @keyframes lv2-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
  @keyframes lv2-slowSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  .lv2-faq-panel { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
  .lv2-faq-panel[data-open="true"] { max-height: 240px; }

  /* Primary CTA — bright emerald + near-black text, sourced from the fixed
     --landing-cta-* tokens (NOT --color-primary — see tokens.css note): this
     exact combo already contrasts on any page background, dark or light. */
  .lv2-btn-primary {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 15px 28px; border-radius: 12px; border: none;
    background: var(--landing-cta-bg); color: var(--landing-cta-text); font-weight: 800; font-size: 16px;
    font-family: var(--font-family); text-decoration: none; cursor: pointer;
    box-shadow: var(--landing-cta-shadow);
    transition: background 0.15s, box-shadow 0.15s;
  }
  .lv2-btn-primary:hover { background: var(--landing-cta-bg-hover); box-shadow: var(--landing-cta-shadow-hover); }
  .lv2-btn-primary:disabled { opacity: 0.65; cursor: not-allowed; }

  .lv2-btn-ghost {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 15px 28px; border-radius: 12px;
    border: 1px solid var(--landing-border-accent-strong); background: transparent; color: var(--color-accent-ink);
    font-weight: 700; font-size: 16px; font-family: var(--font-family);
    text-decoration: none; cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .lv2-btn-ghost:hover { border-color: var(--color-primary); background: var(--landing-tint-soft); }
  .lv2-btn-ghost:disabled { opacity: 0.65; cursor: not-allowed; }

  /* 4-across on desktop, 2×2 on tablet, 1 on mobile — never the auto-fit 3+1
     that orphaned the Agency card on ~1000–1150px windows. */
  .lv2-pricing-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
  @media (max-width: 1120px) { .lv2-pricing-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .lv2-pricing-grid { grid-template-columns: minmax(0, 1fr); } }

  .lv2-btn-tier-primary {
    box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    padding: 12px 18px; border-radius: 10px; font-weight: 700; font-size: 15px;
    font-family: var(--font-family); background: var(--landing-cta-bg); color: var(--landing-cta-text); border: 1px solid var(--landing-cta-bg);
    text-decoration: none; cursor: pointer; width: 100%;
    transition: opacity 0.15s;
  }
  .lv2-btn-tier-primary:hover { opacity: 0.85; }
  .lv2-btn-tier-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .lv2-btn-tier-ghost {
    box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    padding: 12px 18px; border-radius: 10px; font-weight: 700; font-size: 15px;
    font-family: var(--font-family); background: transparent; color: var(--color-accent-ink);
    border: 1px solid var(--landing-border-accent-strong);
    text-decoration: none; cursor: pointer; width: 100%;
    transition: opacity 0.15s;
  }
  .lv2-btn-tier-ghost:hover { opacity: 0.85; }
  .lv2-btn-tier-ghost:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Hero demo's play/pause control — chrome for a fixed-dark "screenshot"
     frame (see the hero demo's header comment), intentionally not themed. */
  .lv2-icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.5); color: #f4f7f5;
    cursor: pointer; padding: 0; transition: border-color 0.15s, color 0.15s;
  }
  .lv2-icon-btn:hover { border-color: #27c98a; color: #27c98a; }

  .lv2-dot-btn {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; border-radius: 8px; border: none; background: none; padding: 0; cursor: pointer;
  }
  .lv2-dot-btn > span { display: block; width: 16px; height: 4px; border-radius: 2px; transition: background 0.3s; }

  @media (prefers-reduced-motion: reduce) {
    .lv2-anim-fadeUp, .lv2-anim-floatIn, .lv2-anim-spin, .lv2-anim-typing, .lv2-anim-blink {
      animation: none !important;
    }
  }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LandingV2Props {
  /** Server-fetched in page.tsx (GET /api/showcase/geo, 10-min ISR). null
   * when the fetch failed/404'd/was incomplete — scoreCardState() renders the
   * honest SNAPSHOT fallback in that case, never a fabricated "live" value. */
  selfScore: SelfScoreApiData | null;
}

export function LandingV2({ selfScore }: LandingV2Props) {
  const scoreState = scoreCardState(selfScore);

  const [hero, setHero] = useState({ scene: 0, tick: 0 });
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [answerPlaying, setAnswerPlaying] = useState(false);
  const [answerTick, setAnswerTick] = useState(0);
  const [kitPlaying, setKitPlaying] = useState(false);
  const [kitTick, setKitTick] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const { loadingPlan, error: checkoutError, startCheckout } = useDirectCheckout();

  // Refs mirror the latest "is playing" flags so the ONE interval below
  // never needs to be torn down and recreated on every play/pause click.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const answerPlayingRef = useRef(answerPlaying);
  answerPlayingRef.current = answerPlaying;
  const kitPlayingRef = useRef(kitPlaying);
  kitPlayingRef.current = kitPlaying;

  const scoreCardRef = useRef<HTMLDivElement | null>(null);
  const scoreObservedRef = useRef(false);

  // Respect prefers-reduced-motion: stop the hero autoplay after mount (kept
  // as a post-mount effect, not a lazy useState initializer, to avoid an SSR
  // hydration mismatch — see file header).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReducedMotion(true);
      setPaused(true);
    }
  }, []);

  // The single 1s timer driving hero scene/tick + both sims' tick counters.
  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) setHero((s) => nextHeroTick(s.scene, s.tick));
      if (answerPlayingRef.current) setAnswerTick((t) => (t + 1) % AI_ANSWER_TICK_COUNT);
      if (kitPlayingRef.current) setKitTick((t) => (t + 1) % KIT_TICK_COUNT);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Score ring: one-shot count-up on scroll into view (or immediate jump for
  // prefers-reduced-motion), never re-triggered. Target is scoreState.overall
  // (live value if the fetch succeeded, snapshot value otherwise) — stable
  // for the lifetime of this page load since `selfScore` is a server-fetched
  // prop, not client-refetched.
  const overallTarget = scoreState.overall;
  useEffect(() => {
    if (reducedMotion) {
      setScore(overallTarget);
      return;
    }
    const el = scoreCardRef.current;
    if (!el || scoreObservedRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (scoreObservedRef.current || !entries.some((e) => e.isIntersecting)) return;
        scoreObservedRef.current = true;
        const start = performance.now();
        const DURATION = 1500;
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / DURATION);
          const eased = 1 - Math.pow(1 - p, 3);
          setScore(Math.round(overallTarget * eased));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        observer.disconnect();
      },
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion, overallTarget]);

  function togglePause() {
    setPaused((p) => !p);
    trackEvent("hero_video_pause_toggle");
  }
  function goToScene(i: number) {
    setHero({ scene: i, tick: 0 });
  }
  function toggleAnswer() {
    setAnswerTick(0);
    setAnswerPlaying((p) => !p);
  }
  function toggleKit() {
    setKitTick(0);
    setKitPlaying((p) => !p);
  }
  function toggleFaq(i: number) {
    setFaqOpen((cur) => (cur === i ? null : i));
  }
  function handleFreeTestClick() {
    trackEvent("cta_free_test_click");
  }
  function handleKitClick() {
    trackEvent("kit_checkout_click");
  }
  function handleGrowthCheckout() {
    trackEvent("growth_checkout_click");
    void startCheckout("growth", "month");
  }
  function handleAgencyCheckout() {
    trackEvent("agency_checkout_click");
    void startCheckout("agency", "month");
  }

  const heroCaption = HERO_CAPTIONS[hero.scene];
  const loopPct = heroLoopPct(hero.scene, hero.tick);
  const growth = heroGrowth(hero.scene, hero.tick);
  const ringOff = ringOffset(score);
  const answer = aiAnswerSim(answerPlaying, answerTick);
  const kit = kitSim(kitPlaying, kitTick);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_V2_STYLES }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />

      {/* ============ SECTION 1 — HERO ============ */}
      <section
        style={{ position: "relative", overflow: "hidden", background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 90% 70% at 70% -10%, var(--landing-glow-hero-1), transparent 65%), radial-gradient(ellipse 50% 40% at 15% 100%, var(--landing-glow-hero-2), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(var(--landing-dot-hero) 1px, transparent 1.5px)",
            backgroundSize: "30px 30px",
            WebkitMaskImage: "radial-gradient(ellipse 60% 60% at 75% 20%, black 0%, transparent 70%)",
            maskImage: "radial-gradient(ellipse 60% 60% at 75% 20%, black 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 600 600"
          className={reducedMotion ? undefined : "lv2-anim-spin"}
          style={{
            position: "absolute",
            top: -220,
            right: -180,
            width: 760,
            height: 760,
            opacity: 0.5,
            pointerEvents: "none",
            animation: reducedMotion ? undefined : "lv2-slowSpin 180s linear infinite",
          }}
        >
          <g fill="none" strokeLinecap="round">
            <circle cx="300" cy="300" r="285" stroke="var(--landing-ring-soft)" strokeWidth="2" strokeDasharray="440 160" />
            <circle cx="300" cy="300" r="225" stroke="var(--landing-ring-strong)" strokeWidth="3" strokeDasharray="330 140" />
            <circle cx="300" cy="300" r="160" stroke="var(--landing-ring-soft)" strokeWidth="2" strokeDasharray="230 110" />
          </g>
        </svg>

        <div
          style={{
            position: "relative",
            maxWidth: 1240,
            margin: "0 auto",
            padding: "clamp(52px, 7vw, 104px) clamp(20px, 4vw, 48px) clamp(48px, 6vw, 88px)",
            display: "flex",
            flexWrap: "wrap",
            gap: "clamp(32px, 4vw, 56px)",
            alignItems: "center",
          }}
        >
          <div style={{ flex: "1 1 440px", minWidth: "min(440px, 100%)" }}>
            <h1
              style={{
                margin: "0 0 20px",
                fontSize: "clamp(38px, 4.6vw, 62px)",
                lineHeight: 1.04,
                letterSpacing: "-0.03em",
                fontWeight: 800,
                fontFamily: "var(--font-family)",
              }}
            >
              Is AI recommending you, or your competitor?
            </h1>
            <p
              style={{
                margin: "0 0 28px",
                fontSize: "clamp(17px, 1.4vw, 20px)",
                lineHeight: 1.5,
                color: "var(--color-muted)",
                maxWidth: "52ch",
              }}
            >
              People ask ChatGPT who to buy from. Find out in 60 seconds if it says your name. Free.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <Link href="/test" onClick={handleFreeTestClick} className="lv2-btn-primary">
                Check my brand — free →
              </Link>
              <span style={{ fontSize: 13, color: "var(--color-muted)", paddingLeft: 4 }}>60 seconds. No credit card.</span>
            </div>
            <p
              style={{
                margin: "32px 0 0",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--color-muted)",
                letterSpacing: "0.02em",
              }}
            >
              <span style={{ color: "var(--color-accent-ink)" }}>We check:</span> ChatGPT · Claude · Perplexity · Gemini · Google AI
              Overviews
            </p>
          </div>

          {/* HERO DEMO — simulated 21s product loop (3 scenes x 7 ticks), example
              data. DEPICTS the (dark-only) product UI, like a screenshot — its
              interior colors below are intentionally fixed-dark in both themes;
              only the outer border/shadow (var(--landing-frame-*)) adapts so the
              widget sits naturally on a light page. `color` is pinned too, so the
              currentColor-based LogoMark inside stays visible on the fixed-dark
              background regardless of page theme. */}
          <div style={{ flex: "1 1 460px", minWidth: "min(460px, 100%)" }}>
            <div
              role="group"
              aria-label="Product demo, 21 second looping animation with example data"
              style={{
                position: "relative",
                borderRadius: 16,
                border: "1px solid var(--landing-frame-border)",
                background: "linear-gradient(165deg, #0e1512, #0a100d)" /* product-demo internals: intentionally fixed dark */,
                color: "#f4f7f5" /* product-demo internals: intentionally fixed dark */,
                overflow: "hidden",
                boxShadow: "var(--landing-frame-shadow)",
              }}
            >
              {/* browser chrome + loop progress (emerald->gold hairline — explicitly whitelisted) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  background: "rgba(255,255,255,0.025)",
                  position: "relative",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(255,255,255,0.15)" }}
                  />
                ))}
                <span style={{ marginLeft: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "#9fb0a4" }}>
                  app.ozvor.com/test
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: -1,
                    height: 2,
                    background: "linear-gradient(90deg, #27c98a, #e6a93f)",
                    width: `${loopPct}%`,
                    transition: "width 0.9s linear",
                  }}
                />
              </div>

              <div style={{ display: "flex", height: "clamp(280px, 26vw, 360px)" }}>
                <div
                  aria-hidden="true"
                  style={{
                    width: 52,
                    flexShrink: 0,
                    borderRight: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 18,
                    padding: "16px 0",
                  }}
                >
                  <LogoMark size={22} />
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        background: i === hero.scene ? "rgba(39,201,138,0.35)" : "rgba(255,255,255,0.07)",
                        transition: "background 0.4s",
                      }}
                    />
                  ))}
                </div>

                <div style={{ flex: 1, position: "relative", padding: "clamp(16px, 2vw, 24px)", overflow: "hidden" }}>
                  <span style={DEMO_CHIP_STYLE}>PRODUCT DEMO · EXAMPLE DATA</span>

                  <div aria-hidden="true" style={{ height: "100%" }}>
                    {hero.scene === 0 && (
                      <div
                        className={reducedMotion ? undefined : "lv2-anim-fadeUp"}
                        style={{
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          gap: 18,
                          animation: reducedMotion ? undefined : "lv2-fadeUp 0.6s ease both",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "#5fdfa8",
                            letterSpacing: "0.1em",
                          }}
                        >
                          FREE TEST
                        </span>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "clamp(18px, 1.8vw, 24px)",
                            fontWeight: 800,
                            letterSpacing: "-0.02em",
                            lineHeight: 1.15,
                          }}
                        >
                          Which brand should AI be citing?
                        </p>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            padding: "14px 16px",
                            border: "1px solid rgba(95,223,168,0.45)",
                            borderRadius: 10,
                            background: "rgba(7,11,9,0.6)",
                            boxShadow: "0 0 0 3px rgba(39,201,138,0.08)",
                          }}
                        >
                          <span
                            className={reducedMotion ? undefined : "lv2-anim-typing"}
                            style={{
                              display: "inline-block",
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              fontFamily: "var(--font-mono)",
                              fontSize: "clamp(13px, 1.3vw, 15px)",
                              color: "#f4f7f5",
                              animation: reducedMotion ? undefined : "lv2-typing 3.4s steps(13) 0.7s both",
                            }}
                          >
                            yourbrand.com
                          </span>
                          <span
                            className={reducedMotion ? undefined : "lv2-anim-blink"}
                            style={{
                              width: 2,
                              height: 18,
                              background: "#27c98a",
                              animation: reducedMotion ? undefined : "lv2-blink 0.9s infinite",
                              flexShrink: 0,
                            }}
                          />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span
                            style={{
                              padding: "11px 22px",
                              background: "#27c98a",
                              color: "#0a0f0d",
                              borderRadius: 9,
                              fontWeight: 700,
                              fontSize: "clamp(13px, 1.3vw, 15px)",
                            }}
                          >
                            Run test →
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#9fb0a4" }}>
                            no credit card
                          </span>
                        </div>
                      </div>
                    )}

                    {hero.scene === 1 && (
                      <div
                        style={{
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          gap: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                              color: "#5fdfa8",
                              letterSpacing: "0.1em",
                            }}
                          >
                            YOUR VISIBILITY, WEEK OVER WEEK
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                              color: "#5fdfa8",
                              padding: "3px 9px",
                              borderRadius: 12,
                              border: "1px solid rgba(39,201,138,0.35)",
                              background: "rgba(39,201,138,0.08)",
                            }}
                          >
                            {growth.growWeek}
                          </span>
                        </div>
                        {growth.competitors.map((c) => (
                          <div
                            key={c.name}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "12px 14px",
                              borderRadius: 10,
                              background: c.bg,
                              border: `1px solid ${c.border}`,
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "clamp(11px, 1.1vw, 13px)",
                                color: c.color,
                                filter: c.blur,
                                minWidth: 110,
                              }}
                            >
                              {c.name}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                height: 7,
                                borderRadius: 4,
                                background: "rgba(255,255,255,0.06)",
                                overflow: "hidden",
                                display: "block",
                              }}
                            >
                              <span
                                style={{
                                  height: "100%",
                                  background: c.barColor,
                                  width: c.bar,
                                  borderRadius: 4,
                                  display: "block",
                                  transition: "width 0.9s cubic-bezier(0.22,1,0.36,1)",
                                }}
                              />
                            </span>
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 11,
                                color: c.citesColor,
                                minWidth: 62,
                                textAlign: "right",
                                transition: "color 0.4s",
                              }}
                            >
                              {c.cites}
                            </span>
                          </div>
                        ))}
                        <span style={{ fontSize: 12, color: "#9fb0a4" }}>{growth.growNote}</span>
                      </div>
                    )}

                    {hero.scene === 2 && (
                      <div
                        style={{
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          gap: 11,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "#5fdfa8",
                            letterSpacing: "0.1em",
                          }}
                        >
                          YOUR PRIORITIZED FIX LIST
                        </span>
                        {HERO_ACTION_CARDS.map((ac) => (
                          <div
                            key={ac.title}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "12px 14px",
                              borderRadius: 10,
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.08)",
                            }}
                          >
                            <span
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 5,
                                border: "1.5px solid #27c98a",
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#27c98a",
                                fontSize: 11,
                                fontWeight: 700,
                                background: ac.done ? "rgba(39,201,138,0.15)" : "transparent",
                              }}
                            >
                              {ac.done ? "✓" : ""}
                            </span>
                            <span style={{ flex: 1, fontSize: "clamp(12px, 1.2vw, 14px)", fontWeight: 500 }}>
                              {ac.title}
                            </span>
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 10,
                                padding: "3px 8px",
                                borderRadius: 20,
                                background: "rgba(39,201,138,0.12)",
                                color: "#5fdfa8",
                              }}
                            >
                              {ac.impact}
                            </span>
                          </div>
                        ))}
                        <div style={{ marginTop: 4 }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "9px 18px",
                              background: "#27c98a",
                              color: "#0a0f0d",
                              borderRadius: 8,
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            Fix it with the Kit — $29
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* caption bar + controls */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 14px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(0,0,0,0.35)",
                }}
              >
                <span style={{ fontSize: "clamp(12px, 1.2vw, 14px)", fontWeight: 600, color: "#f4f7f5" }}>
                  {heroCaption}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 2 }}>
                    {[0, 1, 2].map((i) => (
                      <button
                        key={i}
                        type="button"
                        className="lv2-dot-btn"
                        onClick={() => goToScene(i)}
                        aria-label={`Go to scene ${i + 1} of 3`}
                        aria-current={i === hero.scene}
                      >
                        <span style={{ background: i === hero.scene ? "#27c98a" : "rgba(255,255,255,0.22)" }} />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="lv2-icon-btn"
                    onClick={togglePause}
                    aria-label={paused ? "Play demo" : "Pause demo"}
                  >
                    {paused ? (
                      <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
                        <polygon points="0,0 10,6 0,12" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
                        <rect x="0" y="0" width="3.5" height="12" fill="currentColor" />
                        <rect x="6.5" y="0" width="3.5" height="12" fill="currentColor" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <p
              style={{
                margin: "10px 4px 0",
                fontSize: 12,
                color: "var(--color-muted)",
                textAlign: "right",
                fontFamily: "var(--font-mono)",
              }}
            >
              21s product demo · example data · sound off
            </p>
          </div>
        </div>
        <div
          aria-hidden="true"
          style={{ height: 1, background: "linear-gradient(90deg, transparent, var(--landing-divider), transparent)" }}
        />
      </section>

      {/* ============ SECTION 2 — YOUR SCORE IN 60 SECONDS ============ */}
      <section
        aria-labelledby="lv2-score-heading"
        style={{ position: "relative", overflow: "hidden", background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse 55% 65% at 22% 50%, var(--landing-glow-score), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            maxWidth: 1240,
            margin: "0 auto",
            padding: "clamp(64px, 8vw, 120px) clamp(20px, 4vw, 48px)",
            display: "flex",
            flexWrap: "wrap",
            gap: "clamp(36px, 5vw, 80px)",
            alignItems: "center",
          }}
        >
          {/* Live score card. Shows our real self-audit, styled like the actual
              (dark-only) product dashboard — same "screenshot" treatment as the
              three demo frames: interior colors below stay fixed-dark in both
              themes (with an explicit `color` pin, since the currentColor-based
              LogoMark needs it), while the ambient halo behind the card and its
              gradient border adapt to the page theme (the border's emerald->gold
              gradient itself is explicitly whitelisted — works on both themes). */}
          <div style={{ flex: "1 1 400px", minWidth: "min(400px, 100%)", position: "relative" }}>
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: -40,
                background: "radial-gradient(ellipse at center, var(--landing-glow-score-card), transparent 65%)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "relative",
                borderRadius: 22,
                padding: 1,
                background: "linear-gradient(160deg, rgba(39,201,138,0.55), rgba(255,255,255,0.07) 40%, rgba(230,169,63,0.35))",
              }}
            >
              <div
                ref={scoreCardRef}
                style={{
                  borderRadius: 21,
                  background: "linear-gradient(165deg, #0e1512, #090e0b)" /* product-demo internals: intentionally fixed dark */,
                  color: "#f4f7f5" /* product-demo internals: intentionally fixed dark */,
                  padding: "clamp(24px, 3vw, 36px)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 24,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <LogoMark size={26} />
                    <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>Ozvor</span>
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "#5fdfa8",
                      padding: "5px 11px",
                      borderRadius: 20,
                      border: "1px solid rgba(39,201,138,0.35)",
                      background: "rgba(39,201,138,0.08)",
                    }}
                  >
                    {scoreState.chipLabel}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "clamp(20px, 3vw, 36px)", flexWrap: "wrap" }}>
                  <div style={{ position: "relative", width: "clamp(130px, 15vw, 170px)", flexShrink: 0 }}>
                    <svg
                      viewBox="0 0 120 120"
                      role="img"
                      aria-label={`Ozvor AI Visibility Score: ${overallTarget} out of 100`}
                      style={{ width: "100%", display: "block", filter: "drop-shadow(0 0 28px rgba(39,201,138,0.3))" }}
                    >
                      <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                      <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="#27c98a"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray="339"
                        strokeDashoffset={ringOff}
                        transform="rotate(-90 60 60)"
                        style={{ transition: "stroke-dashoffset 0.1s linear" }}
                      />
                    </svg>
                    <div
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                      }}
                    >
                      <span style={{ fontSize: "clamp(34px, 3.4vw, 44px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
                        {overallTarget}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#9fb0a4" }}>/ 100</span>
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 14 }}>
                    {scoreState.subScores.map((ss) => {
                      const w = ss.val == null ? 0 : subScoreWidthPct(ss.val, score, scoreState.overall);
                      return (
                        <div key={ss.key}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                            <span style={{ color: "#9fb0a4" }}>{ss.label}</span>
                            <span style={{ fontFamily: "var(--font-mono)", color: "#5fdfa8" }}>
                              {ss.val == null ? "—" : ss.val}
                            </span>
                          </div>
                          <div style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                            <div
                              style={{
                                height: "100%",
                                borderRadius: 4,
                                background: "linear-gradient(90deg, #0c7d54, #27c98a)",
                                width: `${w}%`,
                                transition: "width 0.15s linear",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <p style={{ margin: "2px 0 0", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "#9fb0a4", lineHeight: 1.5 }}>
                      {EXECUTION_NOTE}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 24 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: "linear-gradient(160deg, #1a9c68, #0c7d54)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#f4f7f5",
                    }}
                  >
                    <LogoMark size={28} />
                  </span>
                  <span>
                    <p style={{ margin: 0, fontSize: 13, color: "#9fb0a4", lineHeight: 1.5 }}>{scoreState.noteLine}</p>
                    <p style={{ margin: "3px 0 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "#5b6a60" }}>
                      {scoreState.provenanceLine}
                    </p>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ flex: "1 1 380px", minWidth: "min(380px, 100%)" }}>
            <h2
              id="lv2-score-heading"
              style={{ margin: "0 0 24px", fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              Your score in 60 seconds
            </h2>
            <ul style={{ margin: "0 0 28px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
              {SCORE_BULLETS.map((b) => (
                <li key={b} style={{ display: "flex", gap: 14, alignItems: "flex-start", fontSize: "clamp(15px, 1.3vw, 17px)", lineHeight: 1.5 }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
                    <circle cx="10" cy="10" r="9" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeDasharray="4 3" />
                    <circle cx="10" cy="10" r="3" fill="var(--color-primary)" />
                  </svg>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            {/* SECTION 2 DEMO — streaming AI-answer chat, click-to-play, example
                data. Same fixed-dark "screenshot" treatment as the hero demo:
                interior colors stay hardcoded; only the outer border adapts. */}
            <div style={{ borderRadius: 14, border: "1px solid var(--landing-frame-border)", background: "linear-gradient(165deg, #0e1512, #0a100d)" /* product-demo internals: intentionally fixed dark */, color: "#f4f7f5" /* product-demo internals: intentionally fixed dark */, overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 13px",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  background: "rgba(255,255,255,0.025)",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span key={i} aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
                ))}
                <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "#9fb0a4" }}>app.ozvor.com/dashboard</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "#5fdfa8" }}>WEEKLY TEST</span>
              </div>

              <button
                type="button"
                onClick={toggleAnswer}
                aria-pressed={answerPlaying}
                aria-label={answerPlaying ? "Pause the AI-answer example demo" : "Play: watch the moment AI cites you — 30 second example demo"}
                style={{ ...BUTTON_RESET, display: "block", width: "100%", position: "relative", aspectRatio: "16 / 8.5" }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    padding: "clamp(14px, 1.6vw, 20px)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: 10,
                    filter: answer.idle ? "blur(2px) brightness(0.7)" : "none",
                    transition: "filter 0.4s",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: "clamp(11px, 1.1vw, 13px)", color: "#9fb0a4" }}>
                    <span style={{ color: "#5fdfa8" }}>›</span>
                    <span>{AI_ANSWER_QUERY}</span>
                  </span>
                  <span style={{ display: "block", fontSize: "clamp(13px, 1.3vw, 15px)", lineHeight: 1.55, color: "#f4f7f5" }}>
                    {AI_ANSWER_TOKENS.slice(0, answer.revealedCount).map((tok, i) =>
                      i === AI_ANSWER_CITATION_INDEX ? (
                        <span
                          key={i}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            padding: "1px 8px",
                            borderRadius: 6,
                            background: "rgba(39,201,138,0.16)",
                            border: "1px solid rgba(39,201,138,0.4)",
                            color: "#5fdfa8",
                            fontWeight: 700,
                            marginRight: 4,
                          }}
                        >
                          {tok}
                          <sup style={{ fontSize: 9 }}>[1]</sup>
                        </span>
                      ) : (
                        <span key={i}>{tok} </span>
                      )
                    )}
                  </span>
                  <span
                    style={{
                      alignSelf: "flex-start",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: 20,
                      color: answer.cited ? "#0a0f0d" : "#9fb0a4",
                      background: answer.cited ? "#27c98a" : "rgba(255,255,255,0.06)",
                      border: answer.cited ? "none" : "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    {answer.badge}
                  </span>
                </span>

                {answerPlaying && <span style={DEMO_CHIP_STYLE}>PRODUCT DEMO · EXAMPLE DATA</span>}

                {answer.idle ? (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 14,
                      background: "rgba(7,11,9,0.55)",
                    }}
                  >
                    <span
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: "50%",
                        background: "#27c98a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 6px 24px rgba(39,201,138,0.4)",
                        flexShrink: 0,
                      }}
                    >
                      <svg width="16" height="18" viewBox="0 0 16 18">
                        <polygon points="1,0 16,9 1,18" fill="#0a0f0d" />
                      </svg>
                    </span>
                    <span style={{ display: "block", textAlign: "left" }}>
                      <span style={{ display: "block", fontWeight: 700, fontSize: 15, color: "#f4f7f5" }}>
                        Watch the moment AI cites you
                      </span>
                      <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "#9fb0a4", fontFamily: "var(--font-mono)" }}>
                        30s · example data
                      </span>
                    </span>
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 12,
                      bottom: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      background: "rgba(0,0,0,0.6)",
                      padding: "3px 9px",
                      borderRadius: 5,
                    }}
                  >
                    {answer.caption}
                  </span>
                )}
              </button>
            </div>
            <p style={{ margin: "10px 2px 0", fontSize: 12, color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
              Growth does this for you, every week.
            </p>
          </div>
        </div>
      </section>

      {/* ============ SECTION 3 — THREE STEPS ============ */}
      <section
        aria-labelledby="lv2-steps-heading"
        style={{ position: "relative", overflow: "hidden", borderTop: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(var(--landing-dot-steps) 1px, transparent 1.5px)",
            backgroundSize: "30px 30px",
            WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 0%, black 0%, transparent 75%)",
            maskImage: "radial-gradient(ellipse 70% 55% at 50% 0%, black 0%, transparent 75%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "clamp(64px, 8vw, 120px) clamp(20px, 4vw, 48px)" }}>
          <h2
            id="lv2-steps-heading"
            style={{ margin: "0 0 44px", fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: "20ch" }}
          >
            Three steps to get picked by AI
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 18, marginBottom: 44 }}>
            {STEPS.map((st) => (
              <div
                key={st.n}
                style={{
                  position: "relative",
                  borderRadius: 18,
                  border: `1px solid ${st.border}`,
                  background: st.bg,
                  padding: "30px 26px 26px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  marginTop: st.lift,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: 15,
                      background: st.numBg,
                      color: st.numColor,
                      border: `1px solid ${st.numBorder}`,
                    }}
                  >
                    {st.n}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: st.priceColor }}>{st.price}</span>
                </div>
                <h3 style={{ margin: "6px 0 0", fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em" }}>{st.title}</h3>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "var(--color-muted)" }}>{st.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(24px, 4vw, 48px)", alignItems: "center" }}>
            {/* SECTION 3 DEMO — document-flip cards (3 pages: DRAFT -> LIVE),
                example data. Same fixed-dark "screenshot" treatment as the
                other two demo frames: interior colors stay hardcoded; only the
                outer border adapts. */}
            <div style={{ flex: "1 1 380px", minWidth: "min(380px, 100%)" }}>
              <div style={{ borderRadius: 14, border: "1px solid var(--landing-frame-border)", background: "linear-gradient(165deg, #0e1512, #0a100d)" /* product-demo internals: intentionally fixed dark */, color: "#f4f7f5" /* product-demo internals: intentionally fixed dark */, overflow: "hidden" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 13px",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                    background: "rgba(255,255,255,0.025)",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#5fdfa8" }}>KIT — $29 · ONE-TIME</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "#9fb0a4" }}>{kit.kitHeader}</span>
                </div>

                <button
                  type="button"
                  onClick={toggleKit}
                  aria-pressed={kitPlaying}
                  aria-label={kitPlaying ? "Pause the Kit example demo" : "Play: see what the Kit does — 60 second example demo"}
                  style={{ ...BUTTON_RESET, display: "block", width: "100%", position: "relative", aspectRatio: "16 / 8.5" }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      padding: "clamp(12px, 1.5vw, 18px)",
                      display: "flex",
                      gap: "clamp(12px, 1.6vw, 20px)",
                      filter: kit.idle ? "blur(2px) brightness(0.7)" : "none",
                      transition: "filter 0.4s",
                    }}
                  >
                    <span style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "#9fb0a4", letterSpacing: "0.08em" }}>
                        {kit.kitStatus}
                      </span>
                      {kit.pages.map((page) => (
                        <span
                          key={page.slug}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "7px 9px",
                            borderRadius: 8,
                            border: page.live ? "1px solid rgba(39,201,138,0.45)" : "1px dashed rgba(255,255,255,0.18)",
                            background: page.live ? "rgba(39,201,138,0.07)" : page.flipping ? "rgba(39,201,138,0.05)" : "rgba(255,255,255,0.02)",
                            transition: "background 0.4s, border-color 0.4s",
                          }}
                        >
                          <span
                            style={{
                              width: 20,
                              height: 24,
                              borderRadius: 4,
                              flexShrink: 0,
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              display: "flex",
                              flexDirection: "column",
                              padding: "3px 3px",
                              gap: 2,
                            }}
                          >
                            <span style={{ display: "block", height: 3, borderRadius: 1, background: page.live ? "#27c98a" : "rgba(255,255,255,0.25)" }} />
                            <span style={{ display: "block", height: 2, borderRadius: 1, width: "80%", background: "rgba(255,255,255,0.15)" }} />
                            <span style={{ display: "block", height: 2, borderRadius: 1, width: "60%", background: "rgba(255,255,255,0.15)" }} />
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span
                              style={{
                                display: "block",
                                fontSize: "clamp(11px, 1vw, 13px)",
                                fontWeight: 500,
                                color: page.live ? "#f4f7f5" : "#9fb0a4",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {page.title}
                            </span>
                            {page.live && (
                              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9, color: "#5fdfa8", marginTop: 1 }}>
                                yourbrand.com/{page.slug}
                              </span>
                            )}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "2px 7px",
                              borderRadius: 10,
                              flexShrink: 0,
                              color: page.live ? "#0a0f0d" : page.flipping ? "#5fdfa8" : "#5b6a60",
                              background: page.live ? "#27c98a" : "transparent",
                              border: page.live ? "none" : "1px solid rgba(255,255,255,0.15)",
                            }}
                          >
                            {page.live ? "LIVE" : page.flipping ? "PUBLISHING" : "DRAFT"}
                          </span>
                        </span>
                      ))}
                    </span>

                    <span
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        gap: 6,
                        borderLeft: "1px solid rgba(255,255,255,0.07)",
                        paddingLeft: "clamp(12px, 1.6vw, 20px)",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#9fb0a4", letterSpacing: "0.08em" }}>
                        AI CITATIONS
                      </span>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontSize: "clamp(18px, 1.8vw, 22px)", fontWeight: 800, letterSpacing: "-0.02em", color: "#f4f7f5" }}>
                          {kit.cites}
                        </span>
                        {kit.cites > 3 && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#5fdfa8" }}>
                            +{kit.cites - 3}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: "clamp(10px, 1vw, 11px)", color: kitPlaying ? "#5fdfa8" : "#9fb0a4" }}>{kit.kitResult}</span>
                    </span>
                  </span>

                  {kitPlaying && <span style={DEMO_CHIP_STYLE}>PRODUCT DEMO · EXAMPLE DATA</span>}

                  {kit.idle ? (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 14,
                        background: "rgba(7,11,9,0.55)",
                      }}
                    >
                      <span
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: "50%",
                          background: "#27c98a",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 6px 24px rgba(39,201,138,0.35)",
                          flexShrink: 0,
                        }}
                      >
                        <svg width="16" height="18" viewBox="0 0 16 18">
                          <polygon points="1,0 16,9 1,18" fill="#0a0f0d" />
                        </svg>
                      </span>
                      <span style={{ display: "block", textAlign: "left" }}>
                        <span style={{ display: "block", fontWeight: 700, fontSize: 15, color: "#f4f7f5" }}>See what the Kit does</span>
                        <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "#9fb0a4", fontFamily: "var(--font-mono)" }}>
                          60s · example data
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        left: 12,
                        bottom: 10,
                        fontSize: 12,
                        fontWeight: 600,
                        background: "rgba(0,0,0,0.6)",
                        padding: "3px 9px",
                        borderRadius: 5,
                      }}
                    >
                      {kit.kitCaption}
                    </span>
                  )}
                </button>
              </div>
              <p style={{ margin: "10px 2px 0", fontSize: 12, color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
                Publish the first page in ~10 minutes. Become quotable.
              </p>
            </div>

            <div style={{ flex: "1 1 300px", minWidth: "min(300px, 100%)", display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
              <Link href="/test" onClick={handleFreeTestClick} className="lv2-btn-primary">
                Start free →
              </Link>
              <Link href="/kit" onClick={handleKitClick} className="lv2-btn-ghost">
                Get the Kit — $29
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ SECTION 4 — PRICING ============ */}
      <section
        id="pricing"
        aria-labelledby="lv2-pricing-heading"
        style={{ position: "relative", overflow: "hidden", borderTop: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse 80% 60% at 50% 110%, var(--landing-glow-pricing), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "clamp(64px, 8vw, 120px) clamp(20px, 4vw, 48px)" }}>
          <h2 id="lv2-pricing-heading" style={{ margin: "0 0 10px", fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em" }}>
            Pricing
          </h2>
          <p style={{ margin: "0 0 44px", color: "var(--color-muted)", fontSize: 16 }}>Start free. Upgrade when you&apos;re ready to fix things.</p>

          {checkoutError && (
            <p role="alert" style={{ margin: "0 0 20px", color: "var(--color-error)", fontSize: 14, fontFamily: "var(--font-family)" }}>
              {checkoutError}
            </p>
          )}

          <div className="lv2-pricing-grid">
            {PRICING_TIERS.map((t) => (
              <div
                key={t.name}
                style={{
                  position: "relative",
                  borderRadius: 18,
                  border: t.popular ? "1px solid var(--landing-border-accent-strong)" : "1px solid var(--color-border)",
                  background: t.popular ? "var(--landing-tint-soft)" : "var(--color-surface)",
                  padding: "26px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  boxShadow: t.popular ? "var(--landing-shadow-popular)" : "none",
                }}
              >
                {t.popular && (
                  <span
                    style={{
                      position: "absolute",
                      top: -11,
                      left: 22,
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      padding: "4px 10px",
                      borderRadius: 12,
                      background: "var(--landing-cta-bg)",
                      color: "var(--landing-cta-text)",
                    }}
                  >
                    MOST POPULAR
                  </span>
                )}
                <h3 style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--color-muted)", letterSpacing: "0.05em" }}>
                  {t.name}
                </h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "4px 0 10px" }}>
                  <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>{t.price}</span>
                  <span style={{ fontSize: 13, color: "var(--color-muted)" }}>{t.per}</span>
                </div>
                <ul style={{ margin: "0 0 20px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                  {t.features.map((f) => (
                    <li key={f} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 14, lineHeight: 1.45, color: "var(--color-text)" }}>
                      <span aria-hidden="true" style={{ color: "var(--color-primary)", flexShrink: 0 }}>
                        ✓
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div style={{ marginTop: "auto" }}>
                  {t.ctaKind === "link" && t.href && (
                    <Link
                      href={t.href}
                      onClick={t.name === "KIT" ? handleKitClick : handleFreeTestClick}
                      className={t.popular ? "lv2-btn-tier-primary" : "lv2-btn-tier-ghost"}
                    >
                      {t.cta}
                    </Link>
                  )}
                  {t.ctaKind === "checkout-growth" && (
                    <button
                      type="button"
                      className="lv2-btn-tier-primary"
                      disabled={loadingPlan !== null}
                      aria-busy={loadingPlan === "growth"}
                      onClick={handleGrowthCheckout}
                    >
                      {loadingPlan === "growth" ? "Opening checkout…" : t.cta}
                    </button>
                  )}
                  {t.ctaKind === "checkout-agency" && (
                    <button
                      type="button"
                      className="lv2-btn-tier-ghost"
                      disabled={loadingPlan !== null}
                      aria-busy={loadingPlan === "agency"}
                      onClick={handleAgencyCheckout}
                    >
                      {loadingPlan === "agency" ? "Opening checkout…" : t.cta}
                    </button>
                  )}
                  {/* Reserved secondary-CTA row — rendered on every card so all
                      four primary CTAs share one baseline; only Agency fills it
                      (the Calendly link no longer pushes its button up). */}
                  <div style={{ minHeight: 18, marginTop: 10 }}>
                    {t.ctaKind === "checkout-agency" && (
                      <p style={{ margin: 0, textAlign: "center" }}>
                        <a
                          href={CALENDLY_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 13, color: "var(--color-accent-ink)", textDecoration: "none" }}
                        >
                          Prefer to talk? Book a call →
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ SECTION 4.5 — ECOSYSTEM ("Two more ways we help") ============ */}
      <EcosystemSection />

      {/* ============ SECTION 5 — MINI FAQ ============ */}
      <section aria-labelledby="lv2-faq-heading" style={{ borderTop: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "clamp(64px, 8vw, 110px) clamp(20px, 4vw, 48px)" }}>
          <h2 id="lv2-faq-heading" style={{ margin: "0 0 12px", fontSize: "clamp(26px, 2.6vw, 36px)", fontWeight: 800, letterSpacing: "-0.03em" }}>
            Quick answers
          </h2>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {FAQS.map((fq, i) => {
              const open = faqOpen === i;
              const triggerId = `lv2-faq-trigger-${i}`;
              const panelId = `lv2-faq-panel-${i}`;
              return (
                <div key={fq.q} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <h3 style={{ margin: 0 }}>
                    <button
                      type="button"
                      id={triggerId}
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => toggleFaq(i)}
                      style={{
                        ...BUTTON_RESET,
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        padding: "22px 2px",
                        fontSize: 17,
                        fontWeight: 700,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      <span>{fq.q}</span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        aria-hidden="true"
                        style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s" }}
                      >
                        <path d="M2 5 L7 10 L12 5" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </h3>
                  <div id={panelId} role="region" aria-labelledby={triggerId} className="lv2-faq-panel" data-open={open}>
                    <p style={{ margin: 0, padding: "0 2px 22px", fontSize: 15, lineHeight: 1.6, color: "var(--color-muted)", maxWidth: "62ch" }}>{fq.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ margin: "24px 0 0", fontSize: 15 }}>
            <Link href="/faq" style={{ color: "var(--color-accent-ink)" }}>
              More questions →
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Section 4.5 — "Two more ways we help" (Ozvor Pages + OrganicPosts teasers)
// ---------------------------------------------------------------------------

/** Every card's link click fires a GA4 event, gated the same way the rest of
 * the app treats gtag: it may not exist yet (no consent) — always optional-
 * chained, never assumed present (#117 consent-gated GA4). */
function EcosystemSection() {
  return (
    <section
      aria-labelledby="lv2-ecosystem-heading"
      style={{ borderTop: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "clamp(56px, 7vw, 100px) clamp(20px, 4vw, 48px)" }}>
        <h2
          id="lv2-ecosystem-heading"
          style={{ margin: "0 0 28px", fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}
        >
          Two more ways we help
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          {ECOSYSTEM_CARDS.map((card) => (
            <div
              key={card.slug}
              style={{
                flex: "1 1 320px",
                minWidth: "min(320px, 100%)",
                borderRadius: 18,
                border: `1px solid ${card.gold ? "var(--landing-gold-border)" : "var(--color-border)"}`,
                background: card.gold ? "var(--landing-gold-bg)" : "var(--color-surface)",
                padding: "28px 26px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  color: card.gold ? "var(--color-gold-ink)" : "var(--color-accent-ink)",
                }}
              >
                {card.chip}
              </span>
              <h3 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em" }}>{card.title}</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "var(--color-muted)" }}>{card.body}</p>
              <Link
                href={card.href}
                onClick={() => window.gtag?.("event", card.gtagEvent)}
                style={{
                  marginTop: 4,
                  fontSize: 14,
                  fontWeight: 700,
                  color: card.gold ? "var(--color-gold-ink)" : "var(--color-accent-ink)",
                  textDecoration: "none",
                }}
              >
                {card.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function trackEvent(name: string): void {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", name);
  }
}
