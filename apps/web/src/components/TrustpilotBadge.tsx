/**
 * Trustpilot badge — our own markup, not Trustpilot's TrustBox.
 *
 * Why we build it instead of embedding: the TrustBox draws itself inside a
 * cross-origin iframe, and the Review Collector template ignores `data-theme`
 * (the iframe URL Trustpilot builds carries only templateId and
 * businessunitId). Its white card therefore cannot be themed and no CSS of
 * ours reaches inside it — proven by three failed attempts to make it sit on a
 * dark footer. A plain styled link costs us the embedded widget and buys back
 * everything that matters here:
 *
 *   - both themes, from the site's own tokens, with no iframe to fight
 *   - no third-party script, so nothing to allow in the CSP
 *   - no third-party cookie, so no consent gate and no visitor who sees nothing
 *   - a server component: zero client JavaScript
 *
 * The green star is Trustpilot's brand colour (#00b67a) and the wordmark is
 * plain text, which is what their brand guidance allows for a link back to a
 * review page.
 *
 * TWO STATES, and which one shows is decided by the data, never by us:
 *
 *   rating   "4.8 · 12 reviews on Trustpilot" — only once the rating is real
 *            AND passes the floor in lib/trustpilot (>= 4.0, >= 5 reviews)
 *   invite   "Review us on Trustpilot" — every other case: no API key yet, the
 *            read failed, too few reviews, or a score we would not advertise
 *
 * The floor is the point of this component. As of writing the profile has ZERO
 * published reviews (checked on the live page: "This company hasn't received
 * any reviews yet", no aggregateRating in their structured data), so a rating
 * here today would be 0.0 or invented. One 5-star review would be no better: a
 * lone review reads as a favour from a friend. The badge earns its number.
 */

import { getTrustpilotRating, isWorthShowing } from "../lib/trustpilot";

const TRUSTPILOT_GREEN = "#00b67a";
const REVIEW_URL = "https://www.trustpilot.com/review/ozvor.com";

export async function TrustpilotBadge() {
  const rating = await getTrustpilotRating();

  if (isWorthShowing(rating)) {
    return (
      <a
        href={REVIEW_URL}
        target="_blank"
        rel="noopener"
        aria-label={`Rated ${rating.stars.toFixed(1)} out of 5 from ${rating.reviews} reviews on Trustpilot, opens in a new tab`}
        style={{ ...shell, gap: "var(--space-2)" }}
      >
        <Stars filled={rating.stars} />
        <span>
          <b style={{ fontWeight: 700 }}>{rating.stars.toFixed(1)}</b>{" "}
          <span style={{ color: "var(--color-muted)" }}>
            · {rating.reviews} review{rating.reviews === 1 ? "" : "s"} on
          </span>{" "}
          Trustpilot
        </span>
      </a>
    );
  }

  return (
    <a
      href={REVIEW_URL}
      target="_blank"
      rel="noopener"
      // The visible text already reads as an invitation, so an aria-label only
      // needs to add where the link goes.
      aria-label="Review Ozvor on Trustpilot, opens in a new tab"
      style={{ ...shell, gap: "var(--space-2)" }}
    >
      <Star />
      <span>
        Review us on <span style={{ letterSpacing: "-0.01em" }}>Trustpilot</span>
      </span>
    </a>
  );
}

/** Shared chrome. Surface + border come from the site's own tokens, so the
 *  badge is the same material as every other card and flips with the theme for
 *  free — no iframe, no data-theme, nothing to keep in sync. */
const shell: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: "8px",
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
  fontFamily: "var(--font-family)",
  fontSize: "var(--font-size-caption)",
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
  lineHeight: 1.2,
};

/** Trustpilot's five-point star, in their green, at caption size. */
function Star() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill={TRUSTPILOT_GREEN}
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <path d="M8 0l2.06 5.02L15.5 5.4l-4.1 3.44 1.3 5.16L8 11.1l-4.7 2.9 1.3-5.16L.5 5.4l5.44-.38L8 0z" />
    </svg>
  );
}

/**
 * Five stars with the score shown as fill, not as five identical icons: a 4.3
 * looks like 4.3. The partial star is a clipped overlay so the shape stays
 * Trustpilot's own rather than a different glyph at a smaller size.
 */
function Stars({ filled }: { filled: number }) {
  const whole = Math.floor(filled);
  const partial = filled - whole;
  return (
    <span style={{ display: "inline-flex", gap: "1px", flex: "none" }} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = i < whole ? 1 : i === whole ? partial : 0;
        return (
          <span key={i} style={{ position: "relative", width: 14, height: 14, display: "block" }}>
            <StarGlyph color="var(--color-border)" />
            {fill > 0 && (
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  overflow: "hidden",
                  width: `${fill * 100}%`,
                }}
              >
                <StarGlyph color={TRUSTPILOT_GREEN} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function StarGlyph({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill={color} style={{ display: "block" }}>
      <path d="M8 0l2.06 5.02L15.5 5.4l-4.1 3.44 1.3 5.16L8 11.1l-4.7 2.9 1.3-5.16L.5 5.4l5.44-.38L8 0z" />
    </svg>
  );
}
