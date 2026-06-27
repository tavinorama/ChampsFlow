/**
 * UpsellLadder — reusable upsell ladder component.
 *
 * Renders one PRIMARY upsell (large card, gradient CTA) and an array of
 * SECONDARY upsells (compact row, smaller). Matches the Ozvor landing aesthetic:
 * dark-first, token-based, emerald gradient CTAs.
 *
 * Design rule: the natural next step is visually dominant; the rest are clearly
 * smaller. This is the founder's core requirement.
 *
 * No state, no side-effects — purely presentational.
 */

import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────

export interface UpsellItem {
  /** Short title: "Growth Plan", "Agency Plan", etc. */
  title: string;
  /** One-line reason this upsell matters to the user right now. */
  why: string;
  /** Price string shown on the CTA: "$99/mo", "$29", etc. */
  price: string;
  /** The href the CTA navigates to. Must be a real destination — no dead "#". */
  href: string;
  /**
   * Visual accent. "emerald" = gradient green CTA (self-serve plans).
   * "gold" = gradient amber CTA (OrganicPosts / done-for-you).
   * "ghost" = outlined CTA (secondary or free).
   */
  accent?: "emerald" | "gold" | "ghost";
  /** aria-label for the CTA anchor (accessibility). */
  ctaAriaLabel?: string;
}

export interface UpsellLadderProps {
  /** Section heading (rendered as <h2> unless headingLevel overrides it). */
  heading?: string;
  /** Override the heading element level. Default: "h2". */
  headingLevel?: "h2" | "h3";
  /** The primary (most prominent) upsell — large card. */
  primary: UpsellItem;
  /** Secondary upsells — compact cards below the primary. */
  secondary?: UpsellItem[];
  /** Extra top margin. Passed as a CSS value string (e.g. "var(--space-12)"). */
  marginTop?: string;
}

// ── Inline style helpers ───────────────────────────────────────────────────

const EMERALD_GRADIENT = "linear-gradient(135deg,#27c98a,#0c7d54)";
const GOLD_GRADIENT    = "linear-gradient(135deg,#e6a93f,#b9791f)";

function ctaStyle(accent: UpsellItem["accent"] = "emerald"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "var(--min-button-height, 48px)",
    minWidth: "44px",
    padding: "0 var(--space-6)",
    borderRadius: "var(--radius-md)",
    fontWeight: 800,
    fontSize: "var(--font-size-body)",
    textDecoration: "none",
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "var(--font-family)",
  };
  if (accent === "emerald") {
    return {
      ...base,
      background: EMERALD_GRADIENT,
      color: "#06140e",
      boxShadow: "0 10px 32px rgba(39,201,138,0.28)",
    };
  }
  if (accent === "gold") {
    return {
      ...base,
      background: GOLD_GRADIENT,
      color: "#1a1206",
      boxShadow: "0 10px 32px rgba(230,169,63,0.26)",
    };
  }
  // ghost
  return {
    ...base,
    background: "transparent",
    color: "var(--color-text)",
    border: "1px solid var(--color-border)",
  };
}

function secondaryCtaStyle(accent: UpsellItem["accent"] = "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "44px",
    padding: "0 var(--space-4)",
    borderRadius: "var(--radius-md)",
    fontWeight: 700,
    fontSize: "var(--font-size-body-sm)",
    textDecoration: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "var(--font-family)",
  };
  if (accent === "emerald") {
    return {
      ...base,
      background: EMERALD_GRADIENT,
      color: "#06140e",
    };
  }
  if (accent === "gold") {
    return {
      ...base,
      background: GOLD_GRADIENT,
      color: "#1a1206",
    };
  }
  return {
    ...base,
    background: "transparent",
    color: "var(--color-accent-ink)",
    border: "1px solid var(--color-accent-ink)",
  };
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function PrimaryCard({ item }: { item: UpsellItem }) {
  const accent = item.accent ?? "emerald";
  const borderColor =
    accent === "emerald"
      ? "rgba(39,201,138,0.35)"
      : accent === "gold"
      ? "var(--color-gold)"
      : "var(--color-border)";

  return (
    <article
      aria-label={`Recommended next step: ${item.title}`}
      style={{
        backgroundColor: "var(--color-surface)",
        border: `1.5px solid ${borderColor}`,
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-8) var(--space-6)",
        boxShadow:
          accent === "emerald"
            ? "0 12px 40px rgba(39,201,138,0.14)"
            : accent === "gold"
            ? "0 12px 40px rgba(230,169,63,0.12)"
            : "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}
    >
      <div>
        <p
          style={{
            margin: "0 0 var(--space-2) 0",
            fontSize: "var(--font-size-caption)",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color:
              accent === "gold"
                ? "var(--color-gold-ink)"
                : "var(--color-accent-ink)",
            fontFamily: "var(--font-mono)",
          }}
        >
          Natural next step
        </p>
        <h3
          style={{
            margin: "0 0 var(--space-2) 0",
            fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--color-text)",
          }}
        >
          {item.title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.6,
          }}
        >
          {item.why}
        </p>
      </div>

      <Link
        href={item.href}
        style={ctaStyle(accent)}
        aria-label={item.ctaAriaLabel ?? `${item.title} — ${item.price}`}
      >
        {item.title} — {item.price}
      </Link>
    </article>
  );
}

function SecondaryCard({ item }: { item: UpsellItem }) {
  const accent = item.accent ?? "ghost";
  return (
    <article
      aria-label={`Also available: ${item.title}`}
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4) var(--space-5)",
        boxShadow: "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        flex: "1 1 220px",
      }}
    >
      <div>
        <p
          style={{
            margin: "0 0 var(--space-1) 0",
            fontWeight: 700,
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-text)",
          }}
        >
          {item.title}{" "}
          <span
            style={{ fontWeight: 600, color: "var(--color-muted)", fontSize: "var(--font-size-caption)" }}
          >
            {item.price}
          </span>
        </p>
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            lineHeight: 1.5,
          }}
        >
          {item.why}
        </p>
      </div>
      <Link
        href={item.href}
        style={secondaryCtaStyle(accent)}
        aria-label={item.ctaAriaLabel ?? `${item.title} — ${item.price}`}
      >
        {item.title} →
      </Link>
    </article>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

export function UpsellLadder({
  heading = "Keep climbing",
  headingLevel = "h2",
  primary,
  secondary = [],
  marginTop,
}: UpsellLadderProps) {
  const Heading = headingLevel;

  return (
    <section
      aria-labelledby="upsell-ladder-heading"
      style={{ marginTop: marginTop ?? "var(--space-12)" }}
    >
      <Heading
        id="upsell-ladder-heading"
        style={{
          margin: "0 0 var(--space-6) 0",
          fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "var(--color-text)",
        }}
      >
        {heading}
      </Heading>

      {/* Primary — full-width dominant card */}
      <PrimaryCard item={primary} />

      {/* Secondary — compact row (wraps on mobile) */}
      {secondary.length > 0 && (
        <div
          role="list"
          aria-label="Other options"
          style={{
            marginTop: "var(--space-4)",
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-4)",
          }}
        >
          {secondary.map((item) => (
            <div key={item.title} role="listitem" style={{ flex: "1 1 220px", minWidth: "200px" }}>
              <SecondaryCard item={item} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
