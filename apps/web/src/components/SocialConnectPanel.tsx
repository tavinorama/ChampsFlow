"use client";

/**
 * SocialConnectPanel — "Connect your publishing platforms" on the AI-engines
 * hub (/account/integrations).
 *
 * LAUNCH STATE: publishing-platform OAuth (LinkedIn / Instagram / Facebook) is
 * not yet wired in production — the OAuth apps + client credentials aren't
 * configured — so we show a "Coming soon" teaser instead of Connect buttons that
 * would fail. This is a deliberate launch decision (roadmap: "Publishing
 * platform OAuth (v-next)").
 *
 * To RE-ENABLE the live one-click connect: flip PUBLISHING_ENABLED to true after
 * the OAuth apps are configured. The full connect flow (popup → poll → reload,
 * disconnect, Facebook Page selection) already ships on /account/connections and
 * can be surfaced here again via <PlatformTile> + the /api/social-accounts
 * endpoints.
 */

const PUBLISHING_ENABLED = false;

const PLATFORMS = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook Page" },
];

export function SocialConnectPanel() {
  return (
    <section aria-labelledby="connect-platforms-heading" style={{ marginBottom: "var(--space-8)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", margin: "0 0 var(--space-2)" }}>
        <h2 id="connect-platforms-heading" style={{ fontSize: "var(--font-size-h3)", fontWeight: 700, margin: 0 }}>
          Connect your publishing platforms
        </h2>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.58rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "2px 8px",
            borderRadius: "var(--radius-pill)",
            background: "rgba(230,169,63,0.13)",
            color: "var(--color-gold-ink)",
          }}
        >
          Coming soon
        </span>
      </div>

      <p style={{ fontSize: "var(--font-size-body-sm)", color: "var(--color-muted)", lineHeight: 1.6, margin: "0 0 var(--space-4)" }}>
        Soon you&rsquo;ll link LinkedIn, Instagram and Facebook here and Ozvor will turn
        approved fixes into ready-to-publish drafts — and publish them for you, one
        place to manage every channel. We&rsquo;re finishing the secure OAuth setup.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        {PLATFORMS.map((p) => (
          <div
            key={p.key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-2)",
              padding: "var(--space-4)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-surface)",
              color: "var(--color-muted)",
            }}
          >
            <span style={{ fontWeight: 700, color: "var(--color-text)" }}>{p.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--font-size-caption)" }}>Soon</span>
          </div>
        ))}
      </div>

      {/* When PUBLISHING_ENABLED flips true, replace the teaser above with the
          live <PlatformTile> grid (see /account/connections for the flow). */}
      {PUBLISHING_ENABLED && null}
    </section>
  );
}
