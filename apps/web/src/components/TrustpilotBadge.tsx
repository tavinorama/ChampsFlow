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
 * review page. It makes no claim about a rating we have not earned — it invites
 * a review, which is what the Review Collector did too.
 */

const TRUSTPILOT_GREEN = "#00b67a";
const REVIEW_URL = "https://www.trustpilot.com/review/ozvor.com";

export function TrustpilotBadge() {
  return (
    <a
      href={REVIEW_URL}
      target="_blank"
      rel="noopener"
      // The visible text already reads as an invitation, so an aria-label only
      // needs to add where the link goes.
      aria-label="Review Ozvor on Trustpilot, opens in a new tab"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "8px 14px",
        borderRadius: "8px",
        // Surface + border from the site's tokens, so the badge is the same
        // material as every other card and flips with the theme for free.
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text)",
        fontFamily: "var(--font-family)",
        fontSize: "var(--font-size-caption)",
        fontWeight: 600,
        textDecoration: "none",
        whiteSpace: "nowrap",
        lineHeight: 1.2,
      }}
    >
      <Star />
      <span>
        Review us on <span style={{ letterSpacing: "-0.01em" }}>Trustpilot</span>
      </span>
    </a>
  );
}

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
