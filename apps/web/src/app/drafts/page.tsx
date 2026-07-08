import Link from "next/link";

// Example fix TYPES that map to real GEO tactics. This is an illustrative
// pattern page (see copy below) — no per-item score is asserted, because a real
// impact number only exists once it's computed against a real audit.
const FIXES = [
  {
    title: "Comparison page",
    status: "Draft ready",
    desc: "Answer the competitor displacement gap with a page AI engines can cite.",
  },
  {
    title: "LinkedIn proof post",
    status: "Needs approval",
    desc: "Turn proof, case data and founder expertise into a citable authority signal.",
  },
  {
    title: "FAQ schema update",
    status: "Recommended",
    desc: "Make high-intent buying answers machine-readable for Google AI and LLM crawlers.",
  },
];

export default function DraftsPage() {
  return (
    <main
      aria-labelledby="fix-queue-heading"
      style={{
        maxWidth: 1040,
        margin: "0 auto",
        padding: "var(--space-10) var(--space-4) calc(var(--bottom-nav-height) + var(--space-12))",
        color: "var(--color-text)",
        fontFamily: "var(--font-family)",
      }}
    >
      <section
        style={{
          border: "1px solid rgba(39,201,138,0.24)",
          borderRadius: "var(--radius-xl)",
          background: "radial-gradient(90% 70% at 10% 0%, rgba(39,201,138,0.14), transparent 58%), var(--color-surface)",
          padding: "var(--space-8)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          style={{
            color: "var(--color-accent-ink)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: "var(--space-2)",
          }}
        >
          Fix queue
        </div>
        <h1
          id="fix-queue-heading"
          style={{
            margin: 0,
            maxWidth: 720,
            fontSize: "clamp(2rem, 5vw, 3.3rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            lineHeight: 1.02,
          }}
        >
          Recommended fixes should become actions, not report text.
        </h1>
        <p style={{ maxWidth: 640, margin: "var(--space-4) 0 0", color: "var(--color-muted)", lineHeight: 1.65 }}>
          This placeholder queue establishes the product pattern from the RankLayer-inspired audit: every AI visibility gap becomes a draft, approval task, calendar item, or OrganicPosts handoff.
        </p>
      </section>

      <section style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-8)" }}>
        {FIXES.map((fix) => (
          <article
            key={fix.title}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto",
              gap: "var(--space-4)",
              alignItems: "center",
              padding: "var(--space-5)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div>
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: "var(--font-size-h3)", fontWeight: 800 }}>{fix.title}</h2>
                <span style={{ border: "1px solid rgba(39,201,138,0.28)", borderRadius: "var(--radius-pill)", padding: "3px 8px", color: "var(--color-accent-ink)", fontFamily: "var(--font-mono)", fontSize: "0.65rem", textTransform: "uppercase" }}>{fix.status}</span>
              </div>
              <p style={{ margin: "var(--space-2) 0 0", color: "var(--color-muted)", lineHeight: 1.55 }}>{fix.desc}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <Link href="/schedule" style={{ color: "#06140e", background: "linear-gradient(135deg,#27c98a,#0c7d54)", padding: "10px 14px", borderRadius: "var(--radius-md)", textDecoration: "none", fontWeight: 800 }}>Schedule →</Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
