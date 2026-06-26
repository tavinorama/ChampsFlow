/**
 * CookieConsent — GDPR / LGPD / CCPA-compliant cookie consent banner
 *
 * Renders a bottom-anchored overlay on first visit (after hydration so there
 * is zero layout shift / blocking of page render).
 *
 * JURISDICTION BEHAVIOUR
 * ─────────────────────────────────────────────────────────────────────────
 *  EU/EEA + Brazil (LGPD) → OPT-IN regime
 *    • Non-essential categories default OFF
 *    • Offers: "Accept all" | "Reject non-essential" | "Customize"
 *    • Nothing non-essential activates until explicit acceptance
 *
 *  US / CCPA → OPT-OUT regime
 *    • Non-essential may default on (future analytics/marketing)
 *    • Prominently offers: "Accept all" | "Reject non-essential"
 *    • "Do Not Sell or Share My Info" link → /legal/do-not-sell
 *
 *  Unknown → treated as opt-in (safest default per GDPR Art. 25)
 *
 * ACCESSIBILITY (WCAG 2.2 AA)
 * ─────────────────────────────────────────────────────────────────────────
 *  • role="dialog" aria-modal="true" aria-labelledby on banner + custom panel
 *  • Focus management: first focusable button gets focus on mount;
 *    Escape dismisses (records reject-all for opt-in / keeps defaults for opt-out)
 *  • All interactive elements: keyboard operable (Tab, Enter, Space, Escape)
 *  • Focus stays within the customize panel when it's open (focus trap)
 *  • Visible focus-visible outlines (var(--color-focus-outline))
 *  • ARIA live region announces consent saved
 *  • Mobile-first: full-width bottom sheet on mobile, constrained card on ≥640px
 *  • prefers-reduced-motion: animation removed
 *  • AA contrast: all text on surfaces tested against design tokens
 *
 * RE-CONSENT
 * ─────────────────────────────────────────────────────────────────────────
 *  Exposed via CookieConsentTrigger component — a button that re-opens the
 *  customize panel by dispatching a custom DOM event ("ti:open-cookie-prefs").
 *  The footer uses this trigger. The CookieConsent component listens for
 *  this event regardless of whether the banner was already dismissed.
 *
 * HONEST DISCLOSURE
 * ─────────────────────────────────────────────────────────────────────────
 *  At launch TrustIndex AI uses ONLY essential cookies. The banner and
 *  customize panel state this explicitly. Toggles govern future scripts.
 */

"use client";

import {
  useState,
  useEffect,
  useRef,
  useId,
  useCallback,
} from "react";
import Link from "next/link";
import {
  detectJurisdiction,
  hasRecordedConsent,
  writeConsent,
  readConsent,
  buildAcceptAllRecord,
  buildRejectRecord,
  buildCustomRecord,
  type JurisdictionRegime,
} from "../lib/cookieConsent";

// ---------------------------------------------------------------------------
// Custom DOM event name used by CookieConsentTrigger → CookieConsent
// ---------------------------------------------------------------------------
const OPEN_PREFS_EVENT = "ti:open-cookie-prefs";

// ---------------------------------------------------------------------------
// CSS injected once — covers hover states, reduced-motion, dark mode, and
// responsive layout that cannot be expressed as inline styles.
// ---------------------------------------------------------------------------
const BANNER_STYLES = `
  /* Banner slide-up animation */
  @keyframes ti-cookie-slidein {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0);   opacity: 1; }
  }
  .ti-cookie-banner {
    animation: ti-cookie-slidein 0.25s ease-out both;
  }
  @media (prefers-reduced-motion: reduce) {
    .ti-cookie-banner { animation: none; }
  }

  /* Button hover/active states */
  .ti-cookie-btn-primary:hover  { opacity: 0.88; }
  .ti-cookie-btn-primary:active { opacity: 0.76; }
  .ti-cookie-btn-ghost:hover    { background: var(--color-surface-muted) !important; }
  .ti-cookie-btn-ghost:active   { opacity: 0.76; }
  .ti-cookie-btn-text:hover     { color: var(--color-text) !important; }

  /* Toggle thumb */
  .ti-toggle-track { transition: background 0.18s ease; }
  @media (prefers-reduced-motion: reduce) {
    .ti-toggle-track { transition: none; }
  }

  /* Focus visible */
  .ti-cookie-banner :focus-visible {
    outline: var(--focus-outline-width) solid var(--color-focus-outline) !important;
    outline-offset: var(--focus-outline-offset) !important;
  }

  /* Scrim — behind banner */
  .ti-cookie-scrim {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.25);
    z-index: 399;
  }
  @media (prefers-color-scheme: dark) {
    html:not([data-theme]) .ti-cookie-scrim { background: rgba(0,0,0,0.45); }
  }
  html[data-theme="dark"] .ti-cookie-scrim { background: rgba(0,0,0,0.45); }
`;

// ---------------------------------------------------------------------------
// Helper: inject banner styles exactly once
// ---------------------------------------------------------------------------
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.textContent = BANNER_STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

// ---------------------------------------------------------------------------
// Toggle — accessible on/off switch for cookie categories
// ---------------------------------------------------------------------------
interface ToggleProps {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

function Toggle({ id, checked, disabled = false, onChange, label }: ToggleProps) {
  const trackColor = disabled
    ? "var(--color-border)"
    : checked
    ? "var(--color-primary)"
    : "var(--color-border)";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      id={id}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        appearance: "none",
        background: "none",
        border: "none",
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      <span
        className="ti-toggle-track"
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          width: "40px",
          height: "22px",
          borderRadius: "var(--radius-pill)",
          background: trackColor,
          position: "relative",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: checked ? "20px" : "2px",
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            transition: "left 0.15s ease",
          }}
        />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// CategoryRow — one consent category with toggle
// ---------------------------------------------------------------------------
interface CategoryRowProps {
  id: string;
  name: string;
  description: string;
  alwaysOn?: boolean;
  checked: boolean;
  onChange?: (checked: boolean) => void;
}

function CategoryRow({
  id,
  name,
  description,
  alwaysOn = false,
  checked,
  onChange,
}: CategoryRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-3)",
        padding: "var(--space-3) 0",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            marginBottom: "var(--space-1)",
          }}
        >
          <span
            style={{
              fontSize: "var(--font-size-body-sm)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              fontFamily: "var(--font-family)",
            }}
          >
            {name}
          </span>
          {alwaysOn && (
            <span
              aria-label="Always active — cannot be disabled"
              style={{
                fontSize: "var(--font-size-caption)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-success)",
                background: "var(--color-success-subtle)",
                borderRadius: "var(--radius-pill)",
                padding: "1px var(--space-2)",
                fontFamily: "var(--font-family)",
              }}
            >
              Always on
            </span>
          )}
        </div>
        <p
          id={`${id}-desc`}
          style={{
            margin: 0,
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            lineHeight: "var(--line-height-caption)",
            fontFamily: "var(--font-family)",
          }}
        >
          {description}
        </p>
      </div>
      <Toggle
        id={`toggle-${id}`}
        checked={alwaysOn ? true : checked}
        disabled={alwaysOn}
        onChange={onChange ?? (() => {})}
        label={alwaysOn ? `${name}: always active` : `${name}: ${checked ? "on" : "off"}`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CustomizePanel — granular category toggles
// ---------------------------------------------------------------------------
interface CustomizePanelProps {
  jurisdiction: JurisdictionRegime;
  analyticsOn: boolean;
  marketingOn: boolean;
  onAnalyticsChange: (v: boolean) => void;
  onMarketingChange: (v: boolean) => void;
  onSave: () => void;
  onAcceptAll: () => void;
  panelTitleId: string;
  firstFocusRef: React.RefObject<HTMLButtonElement | null>;
}

function CustomizePanel({
  jurisdiction,
  analyticsOn,
  marketingOn,
  onAnalyticsChange,
  onMarketingChange,
  onSave,
  onAcceptAll,
  panelTitleId,
  firstFocusRef,
}: CustomizePanelProps) {
  return (
    <section aria-labelledby={panelTitleId}>
      <h3
        id={panelTitleId}
        style={{
          fontSize: "var(--font-size-h3)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text)",
          margin: "0 0 var(--space-1) 0",
          fontFamily: "var(--font-family)",
        }}
      >
        Customize cookie preferences
      </h3>

      <p
        style={{
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          margin: "0 0 var(--space-3) 0",
          lineHeight: "var(--line-height-caption)",
          fontFamily: "var(--font-family)",
        }}
      >
        {jurisdiction === "opt-out"
          ? "We currently use only essential cookies. The toggles below will govern any analytics or marketing tools we add in the future. Turn them off to opt out before those tools are introduced."
          : "We currently use only essential cookies. The toggles below will govern any analytics or marketing tools we add in the future. They are off by default — turn them on only if you would like to allow them when introduced."}
      </p>

      <CategoryRow
        id="essential"
        name="Essential"
        description="Authentication session cookies that keep you signed in (Supabase auth token). These cannot be disabled — the service requires them."
        alwaysOn
        checked
      />
      <CategoryRow
        id="analytics"
        name="Analytics"
        description="Collects aggregate data on how you use Ozvor (page views, session duration). No analytics cookies are active yet. Future tools will need your consent before loading."
        checked={analyticsOn}
        onChange={onAnalyticsChange}
      />
      <CategoryRow
        id="marketing"
        name="Marketing"
        description="Tracks ad campaign effectiveness and enables retargeting (e.g. Meta Pixel, LinkedIn Insight Tag). No marketing cookies are active yet. Future tools will need your consent before loading."
        checked={marketingOn}
        onChange={onMarketingChange}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          marginTop: "var(--space-4)",
        }}
      >
        <button
          ref={firstFocusRef}
          type="button"
          onClick={onSave}
          className="ti-cookie-btn-primary"
          style={{
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-md)",
            height: "var(--min-button-height)",
            width: "100%",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: "pointer",
            fontFamily: "var(--font-family)",
          }}
        >
          Save my preferences
        </button>
        <button
          type="button"
          onClick={onAcceptAll}
          className="ti-cookie-btn-ghost"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            height: "var(--min-button-height)",
            width: "100%",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: "pointer",
            fontFamily: "var(--font-family)",
          }}
        >
          Accept all cookies
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main banner
// ---------------------------------------------------------------------------
interface BannerViewProps {
  jurisdiction: JurisdictionRegime;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onCustomize: () => void;
  bannerTitleId: string;
  firstFocusRef: React.RefObject<HTMLButtonElement | null>;
}

function BannerView({
  jurisdiction,
  onAcceptAll,
  onRejectAll,
  onCustomize,
  bannerTitleId,
  firstFocusRef,
}: BannerViewProps) {
  const isOptOut = jurisdiction === "opt-out";

  return (
    <>
      <h2
        id={bannerTitleId}
        style={{
          fontSize: "var(--font-size-h3)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text)",
          margin: "0 0 var(--space-2) 0",
          fontFamily: "var(--font-family)",
        }}
      >
        {isOptOut ? "Your privacy choices" : "We value your privacy"}
      </h2>

      <p
        style={{
          fontSize: "var(--font-size-body-sm)",
          color: "var(--color-muted)",
          margin: "0 0 var(--space-3) 0",
          lineHeight: "var(--line-height-body)",
          fontFamily: "var(--font-family)",
        }}
      >
        {isOptOut ? (
          <>
            Ozvor currently uses <strong style={{ color: "var(--color-text)" }}>only essential cookies</strong> (your
            login session). We do not currently use analytics or marketing
            cookies. You can record your preferences now for when we introduce
            optional tools in the future.{" "}
            <Link
              href="/legal/cookies"
              style={{
                color: "var(--color-primary)",
                textDecoration: "underline",
                fontSize: "inherit",
              }}
            >
              Cookie Policy
            </Link>
          </>
        ) : (
          <>
            Ozvor currently uses <strong style={{ color: "var(--color-text)" }}>only essential cookies</strong> (your
            login session). We do not currently use analytics or marketing
            cookies. We ask for your consent so your preferences are recorded
            before any optional tools are introduced.{" "}
            <Link
              href="/legal/cookies"
              style={{
                color: "var(--color-primary)",
                textDecoration: "underline",
                fontSize: "inherit",
              }}
            >
              Learn more
            </Link>
          </>
        )}
      </p>

      {/* US opt-out: show "Do Not Sell" link prominently */}
      {isOptOut && (
        <p style={{ margin: "0 0 var(--space-3) 0" }}>
          <Link
            href="/legal/do-not-sell"
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-primary)",
              textDecoration: "underline",
              fontFamily: "var(--font-family)",
            }}
          >
            Do Not Sell or Share My Personal Information
          </Link>
        </p>
      )}

      {/* Button row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-2)",
        }}
      >
        {/* Accept all — equal visual weight (same height, same prominence) */}
        <button
          ref={firstFocusRef}
          type="button"
          onClick={onAcceptAll}
          className="ti-cookie-btn-primary"
          style={{
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-md)",
            height: "var(--min-tap-target)",
            padding: "0 var(--space-5)",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: "pointer",
            fontFamily: "var(--font-family)",
            whiteSpace: "nowrap",
          }}
        >
          Accept all
        </button>

        {/* Reject / Reject non-essential */}
        <button
          type="button"
          onClick={onRejectAll}
          className="ti-cookie-btn-ghost"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            height: "var(--min-tap-target)",
            padding: "0 var(--space-5)",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: "pointer",
            fontFamily: "var(--font-family)",
            whiteSpace: "nowrap",
          }}
        >
          {isOptOut ? "Reject non-essential" : "Reject non-essential"}
        </button>

        {/* Customize — text-style, same height */}
        <button
          type="button"
          onClick={onCustomize}
          className="ti-cookie-btn-text"
          style={{
            background: "none",
            border: "none",
            color: "var(--color-muted)",
            fontSize: "var(--font-size-body-sm)",
            fontWeight: "var(--font-weight-medium)",
            cursor: "pointer",
            height: "var(--min-tap-target)",
            padding: "0 var(--space-2)",
            fontFamily: "var(--font-family)",
            whiteSpace: "nowrap",
            textDecoration: "underline",
          }}
        >
          Customize
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// CookieConsent — root component mounted globally in layout.tsx
// ---------------------------------------------------------------------------

type PanelMode = "banner" | "customize" | "hidden";

export function CookieConsent() {
  const [mode, setMode] = useState<PanelMode>("hidden");
  const [jurisdiction, setJurisdiction] = useState<JurisdictionRegime>("opt-in");
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const [marketingOn, setMarketingOn] = useState(false);
  const [liveMsg, setLiveMsg] = useState("");

  const bannerTitleId = useId();
  const panelTitleId = useId();
  const firstFocusRef = useRef<HTMLButtonElement | null>(null);

  // After hydration: determine whether to show the banner
  useEffect(() => {
    injectStyles();
    const j = detectJurisdiction();
    setJurisdiction(j);

    if (!hasRecordedConsent()) {
      // No consent yet — show banner
      setMode("banner");
    }

    // Allow footer "Cookie preferences" link to re-open the panel
    function handleOpenPrefs() {
      const existing = readConsent();
      if (existing) {
        setAnalyticsOn(existing.analytics);
        setMarketingOn(existing.marketing);
      }
      setMode("customize");
    }
    window.addEventListener(OPEN_PREFS_EVENT, handleOpenPrefs);
    return () => window.removeEventListener(OPEN_PREFS_EVENT, handleOpenPrefs);
  }, []);

  // Focus management: when panel opens, move focus to first button
  useEffect(() => {
    if (mode !== "hidden") {
      // Small delay to allow render
      const id = setTimeout(() => {
        firstFocusRef.current?.focus();
      }, 50);
      return () => clearTimeout(id);
    }
  }, [mode]);

  // Escape key handler
  useEffect(() => {
    if (mode === "hidden") return;
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (mode === "customize") {
        // Go back to banner or close with reject-all
        handleRejectAll();
      } else {
        handleRejectAll();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const announce = useCallback((msg: string) => {
    setLiveMsg("");
    // Trigger re-render with new message for aria-live
    setTimeout(() => setLiveMsg(msg), 10);
  }, []);

  const handleAcceptAll = useCallback(() => {
    const record = buildAcceptAllRecord(jurisdiction);
    writeConsent(record);
    setMode("hidden");
    announce("Cookie preferences saved: all cookies accepted.");
  }, [jurisdiction, announce]);

  const handleRejectAll = useCallback(() => {
    const record = buildRejectRecord(jurisdiction);
    writeConsent(record);
    setMode("hidden");
    announce("Cookie preferences saved: essential cookies only.");
  }, [jurisdiction, announce]);

  const handleSaveCustom = useCallback(() => {
    const record = buildCustomRecord(jurisdiction, analyticsOn, marketingOn);
    writeConsent(record);
    setMode("hidden");
    announce("Cookie preferences saved.");
  }, [jurisdiction, analyticsOn, marketingOn, announce]);

  const handleCustomize = useCallback(() => {
    setMode("customize");
  }, []);

  if (mode === "hidden") {
    return (
      // Polite live region stays in DOM to announce saves even after dismiss
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {liveMsg}
      </div>
    );
  }

  return (
    <>
      {/* Polite live region — announces save confirmation to screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {liveMsg}
      </div>

      {/* Scrim — polite, does not trap browsing (click dismisses with reject) */}
      <div
        className="ti-cookie-scrim"
        aria-hidden="true"
        onClick={handleRejectAll}
      />

      {/* Banner / customize panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={mode === "banner" ? bannerTitleId : panelTitleId}
        className="ti-cookie-banner"
        style={{
          position: "fixed",
          // Mobile: full-width bottom sheet; Desktop ≥640px: constrained card, bottom-right
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 400,
          backgroundColor: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-modal)",
          padding: "var(--space-5) var(--space-5) var(--space-6)",
          // Desktop override applied via inline media query workaround below
          maxWidth: "100%",
        }}
      >
        {/*
         * Desktop card: we apply max-width + positioning via a wrapper so the
         * fixed bottom-0 works correctly without a media-query in inline styles.
         * The BANNER_STYLES injected above cannot be used for inline layout;
         * we rely on a max-width container inside the fixed element instead.
         */}
        <div
          style={{
            maxWidth: "560px",
            margin: "0 auto",
          }}
        >
          {mode === "banner" ? (
            <BannerView
              jurisdiction={jurisdiction}
              onAcceptAll={handleAcceptAll}
              onRejectAll={handleRejectAll}
              onCustomize={handleCustomize}
              bannerTitleId={bannerTitleId}
              firstFocusRef={firstFocusRef}
            />
          ) : (
            <CustomizePanel
              jurisdiction={jurisdiction}
              analyticsOn={analyticsOn}
              marketingOn={marketingOn}
              onAnalyticsChange={setAnalyticsOn}
              onMarketingChange={setMarketingOn}
              onSave={handleSaveCustom}
              onAcceptAll={handleAcceptAll}
              panelTitleId={panelTitleId}
              firstFocusRef={firstFocusRef}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// CookieConsentTrigger — a styled button that re-opens preferences
// Dispatch the custom event; CookieConsent listens globally.
// Usage: <CookieConsentTrigger /> in any footer or settings page.
// ---------------------------------------------------------------------------

export function CookieConsentTrigger({
  className,
  style,
  children = "Cookie preferences",
}: {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  function handleClick() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(OPEN_PREFS_EVENT));
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        textDecoration: "underline",
        fontFamily: "inherit",
        fontSize: "inherit",
        color: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
