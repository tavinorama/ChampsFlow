/**
 * RingFlow — Hero illustration for OrganicPosts.
 *
 * Concept: the Ozvor O-ring mark at centre, with four gold-tinted "content
 * card" shapes orbiting outward along a dashed emerald arc, connected by
 * thin gradient lines. Communicates "a team + content engine" using only
 * brand motifs.
 *
 * Purely decorative. aria-hidden="true".
 * Responsive: viewBox + width 100%, max-width controlled by consumer.
 * Theme-aware: uses var(--color-*) tokens + literal brand gradient stops
 * (same as landing aurora). Works light AND dark.
 */

export function RingFlow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 520 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", width: "100%", height: "auto" }}
      className={className}
    >
      <defs>
        {/* Emerald gradient — same stops as landing aurora */}
        <linearGradient id="rf-em" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#27c98a" />
          <stop offset="100%" stopColor="#0c7d54" />
        </linearGradient>
        {/* Gold gradient for OrganicPosts cards */}
        <linearGradient id="rf-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e6a93f" />
          <stop offset="100%" stopColor="#b9791f" />
        </linearGradient>
        {/* Soft radial glow behind the ring */}
        <radialGradient id="rf-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#27c98a" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#27c98a" stopOpacity="0" />
        </radialGradient>
        {/* Card surface fill — uses CSS var so it flips in dark mode */}
        <filter id="rf-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#000" floodOpacity="0.10" />
        </filter>
      </defs>

      {/* Background glow pool */}
      <ellipse cx="260" cy="140" rx="130" ry="110" fill="url(#rf-glow)" />

      {/* Outer dashed orbit ring */}
      <circle
        cx="260"
        cy="140"
        r="110"
        stroke="#27c98a"
        strokeWidth="1.2"
        strokeDasharray="8 5"
        strokeOpacity="0.35"
      />

      {/* Inner orbit ring */}
      <circle
        cx="260"
        cy="140"
        r="70"
        stroke="#27c98a"
        strokeWidth="0.8"
        strokeDasharray="4 6"
        strokeOpacity="0.20"
      />

      {/* Spoke lines — from center to card positions */}
      {/* Top card spoke */}
      <line x1="260" y1="116" x2="260" y2="52" stroke="url(#rf-em)" strokeWidth="1" strokeOpacity="0.5" />
      {/* Right card spoke */}
      <line x1="298" y1="144" x2="358" y2="144" stroke="url(#rf-em)" strokeWidth="1" strokeOpacity="0.5" />
      {/* Bottom-left card spoke */}
      <line x1="238" y1="163" x2="180" y2="218" stroke="url(#rf-em)" strokeWidth="1" strokeOpacity="0.5" />
      {/* Left card spoke */}
      <line x1="222" y1="140" x2="162" y2="140" stroke="url(#rf-em)" strokeWidth="1" strokeOpacity="0.5" />

      {/* ── O-ring centre mark ──────────────────────────────────────────── */}
      {/* Outer dashed ring */}
      <circle
        cx="260"
        cy="140"
        r="38"
        fill="none"
        stroke="url(#rf-em)"
        strokeWidth="3"
        strokeDasharray="22 3.6"
        strokeLinecap="round"
        transform="rotate(-84 260 140)"
      />
      {/* Centre dot */}
      <circle cx="260" cy="140" r="5" fill="url(#rf-em)" />
      {/* Inner fill disc — surface colour so it "floats" */}
      <circle cx="260" cy="140" r="32" fill="var(--color-surface)" fillOpacity="0.85" />
      {/* Small emerald dot */}
      <circle cx="260" cy="140" r="5" fill="url(#rf-em)" />

      {/* ── Content cards — gold-accented ───────────────────────────────── */}

      {/* TOP card — "Content" */}
      <g filter="url(#rf-shadow)">
        <rect x="206" y="20" width="108" height="42" rx="8" fill="var(--color-surface)" />
        <rect x="206" y="20" width="108" height="42" rx="8" stroke="#e6a93f" strokeWidth="1.2" strokeOpacity="0.55" />
        {/* Gold accent bar */}
        <rect x="206" y="20" width="4" height="42" rx="2" fill="url(#rf-gold)" />
        {/* Label line */}
        <rect x="218" y="30" width="52" height="5" rx="2.5" fill="#e6a93f" fillOpacity="0.70" />
        {/* Body lines */}
        <rect x="218" y="40" width="72" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="218" y="47" width="58" height="3.5" rx="1.75" fill="var(--color-border)" />
      </g>

      {/* RIGHT card — "Publish" */}
      <g filter="url(#rf-shadow)">
        <rect x="358" y="116" width="108" height="50" rx="8" fill="var(--color-surface)" />
        <rect x="358" y="116" width="108" height="50" rx="8" stroke="#27c98a" strokeWidth="1.2" strokeOpacity="0.45" />
        <rect x="358" y="116" width="4" height="50" rx="2" fill="url(#rf-em)" />
        <rect x="370" y="126" width="44" height="5" rx="2.5" fill="#27c98a" fillOpacity="0.65" />
        <rect x="370" y="136" width="78" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="370" y="143" width="62" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="370" y="150" width="48" height="3.5" rx="1.75" fill="var(--color-border)" />
      </g>

      {/* BOTTOM-LEFT card — "Monitor" (gold) */}
      <g filter="url(#rf-shadow)">
        <rect x="84" y="204" width="108" height="50" rx="8" fill="var(--color-surface)" />
        <rect x="84" y="204" width="108" height="50" rx="8" stroke="#e6a93f" strokeWidth="1.2" strokeOpacity="0.55" />
        <rect x="84" y="204" width="4" height="50" rx="2" fill="url(#rf-gold)" />
        <rect x="96" y="214" width="60" height="5" rx="2.5" fill="#e6a93f" fillOpacity="0.70" />
        <rect x="96" y="224" width="84" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="96" y="231" width="68" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="96" y="238" width="52" height="3.5" rx="1.75" fill="var(--color-border)" />
      </g>

      {/* LEFT card — "Research" */}
      <g filter="url(#rf-shadow)">
        <rect x="46" y="112" width="108" height="50" rx="8" fill="var(--color-surface)" />
        <rect x="46" y="112" width="108" height="50" rx="8" stroke="#27c98a" strokeWidth="1.2" strokeOpacity="0.35" />
        <rect x="46" y="112" width="4" height="50" rx="2" fill="url(#rf-em)" />
        <rect x="58" y="122" width="56" height="5" rx="2.5" fill="#27c98a" fillOpacity="0.60" />
        <rect x="58" y="132" width="80" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="58" y="139" width="64" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="58" y="146" width="44" height="3.5" rx="1.75" fill="var(--color-border)" />
      </g>

      {/* Accent dots on orbit ring at cardinal positions */}
      <circle cx="260" cy="30" r="3.5" fill="#27c98a" fillOpacity="0.80" />
      <circle cx="370" cy="140" r="3.5" fill="#27c98a" fillOpacity="0.80" />
      <circle cx="150" cy="140" r="3.5" fill="#e6a93f" fillOpacity="0.70" />
      <circle cx="186" cy="222" r="3.5" fill="#e6a93f" fillOpacity="0.70" />
    </svg>
  );
}
