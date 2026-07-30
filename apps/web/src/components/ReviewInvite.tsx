"use client";

/**
 * ReviewInvite — asks a customer who has actually used the product to review it.
 *
 * This is the half of the Trustpilot work that produces reviews. The footer
 * badge can only ever show what exists; nothing existed, because nobody was
 * ever asked. The profile had zero reviews on the day this was written.
 *
 * WHEN IT SHOWS: only after the brand has more than one completed audit. A
 * first-run customer has seen a number, not a product — asking then buys a
 * review of a demo. The caller owns that gate (see dashboard-v3), because it is
 * the screen that knows how many audits ran.
 *
 * TRUSTPILOT'S RULES, and why the copy looks like this:
 *
 *   - No incentive. Nothing is offered for writing one. A discount or credit
 *     would get the reviews removed and the profile flagged.
 *   - No pre-screening. We do NOT ask "were you happy?" first and route only
 *     the happy ones to Trustpilot. That is review gating and it is banned. The
 *     same invitation goes to everyone, and it says so out loud.
 *   - The link is the plain public review page. No campaign token, no redirect
 *     that could later be pointed somewhere friendlier.
 *
 * Dismissal is remembered in localStorage, not on the server: the worst case if
 * it is lost is that a customer sees one small card again, which is not worth a
 * migration or a write path.
 */

import { useEffect, useState } from "react";

const REVIEW_URL = "https://www.trustpilot.com/review/ozvor.com";
const DISMISS_KEY = "ozvor-review-invite-dismissed";
const TRUSTPILOT_GREEN = "#00b67a";

export function ReviewInvite({ audits }: { audits: number }) {
  // Starts hidden and is only shown by the effect below. Rendering it on the
  // server and hiding it on mount would flash the card at someone who already
  // dismissed it — localStorage does not exist during SSR.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) !== "1") setShow(true);
    } catch {
      // Private-mode or blocked storage: show it. A card that cannot remember a
      // dismissal is a smaller problem than one that never appears.
      setShow(true);
    }
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to do — it will come back next visit.
    }
  }

  if (!show) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        flexWrap: "wrap",
        marginTop: "var(--space-6)",
        padding: "var(--space-4) var(--space-5)",
        borderRadius: "10px",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 16 16" fill={TRUSTPILOT_GREEN} aria-hidden="true" style={{ flex: "none" }}>
        <path d="M8 0l2.06 5.02L15.5 5.4l-4.1 3.44 1.3 5.16L8 11.1l-4.7 2.9 1.3-5.16L.5 5.4l5.44-.38L8 0z" />
      </svg>

      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.94rem", color: "var(--color-text)" }}>
          You&rsquo;ve run {audits} audits. Was it worth it?
        </p>
        <p style={{ margin: "4px 0 0", fontSize: "0.84rem", lineHeight: 1.55, color: "var(--color-muted)" }}>
          Tell people on Trustpilot. We ask everyone, whatever the answer. The
          review is public and we can&rsquo;t edit it &mdash; that is the whole
          point of asking there.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: "none" }}>
        <a
          href={REVIEW_URL}
          target="_blank"
          rel="noopener"
          style={{
            display: "inline-block",
            padding: "9px 16px",
            borderRadius: "8px",
            background: "var(--color-primary)",
            // #fff, not a token: there is no on-primary token, and every other
            // primary button in the dashboard is white-on-primary. Matching them
            // matters more here than inventing a token for one card.
            color: "#fff",
            fontSize: "0.86rem",
            fontWeight: 700,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Write my review
        </a>
        <button
          type="button"
          onClick={dismiss}
          style={{
            background: "none",
            border: "none",
            padding: "4px 2px",
            color: "var(--color-muted)",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
