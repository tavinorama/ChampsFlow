/**
 * ContentEngine — supporting illustration for OrganicPosts process section.
 *
 * Concept: a simple "content pipeline" glyph — an input (research node) on the
 * left, a central processing circle (the engine), and output cards on the right.
 * Gold-tinted to match OrganicPosts branding.
 *
 * Used in the OrganicPosts "How it works" section.
 * Purely decorative. aria-hidden="true".
 * Responsive: viewBox + width 100%.
 */

export function ContentEngine({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", width: "100%", height: "auto" }}
      className={className}
    >
      <defs>
        <linearGradient id="ce-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e6a93f" />
          <stop offset="100%" stopColor="#b9791f" />
        </linearGradient>
        <linearGradient id="ce-em" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#27c98a" />
          <stop offset="100%" stopColor="#0c7d54" />
        </linearGradient>
        <filter id="ce-shadow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.08" />
        </filter>
      </defs>

      {/* ── LEFT: Research inputs ──────────────────────────────────────── */}
      {/* Input node 1 — AI prompts */}
      <g filter="url(#ce-shadow)">
        <rect x="10" y="20" width="90" height="32" rx="6" fill="var(--color-surface)" />
        <rect x="10" y="20" width="90" height="32" rx="6" stroke="#27c98a" strokeWidth="1" strokeOpacity="0.4" />
        <rect x="10" y="20" width="3.5" height="32" rx="1.75" fill="url(#ce-em)" />
        <rect x="19" y="28" width="40" height="4" rx="2" fill="#27c98a" fillOpacity="0.55" />
        <rect x="19" y="36" width="62" height="3.5" rx="1.75" fill="var(--color-border)" />
      </g>

      {/* Input node 2 — competitor data */}
      <g filter="url(#ce-shadow)">
        <rect x="10" y="64" width="90" height="32" rx="6" fill="var(--color-surface)" />
        <rect x="10" y="64" width="90" height="32" rx="6" stroke="#27c98a" strokeWidth="1" strokeOpacity="0.4" />
        <rect x="10" y="64" width="3.5" height="32" rx="1.75" fill="url(#ce-em)" />
        <rect x="19" y="72" width="36" height="4" rx="2" fill="#27c98a" fillOpacity="0.50" />
        <rect x="19" y="80" width="56" height="3.5" rx="1.75" fill="var(--color-border)" />
      </g>

      {/* Input node 3 — trust signals */}
      <g filter="url(#ce-shadow)">
        <rect x="10" y="108" width="90" height="32" rx="6" fill="var(--color-surface)" />
        <rect x="10" y="108" width="90" height="32" rx="6" stroke="#e6a93f" strokeWidth="1" strokeOpacity="0.5" />
        <rect x="10" y="108" width="3.5" height="32" rx="1.75" fill="url(#ce-gold)" />
        <rect x="19" y="116" width="44" height="4" rx="2" fill="#e6a93f" fillOpacity="0.60" />
        <rect x="19" y="124" width="60" height="3.5" rx="1.75" fill="var(--color-border)" />
      </g>

      {/* Connector lines from inputs → engine */}
      <line x1="100" y1="36" x2="155" y2="80" stroke="#27c98a" strokeWidth="1" strokeOpacity="0.30" />
      <line x1="100" y1="80" x2="155" y2="80" stroke="#27c98a" strokeWidth="1.2" strokeOpacity="0.40" />
      <line x1="100" y1="124" x2="155" y2="80" stroke="#e6a93f" strokeWidth="1" strokeOpacity="0.30" />

      {/* ── CENTRE: The Engine ────────────────────────────────────────── */}
      {/* Outer glow ring */}
      <circle cx="200" cy="80" r="46" fill="rgba(39,201,138,0.07)" />
      {/* Dashed orbit */}
      <circle cx="200" cy="80" r="40" stroke="#27c98a" strokeWidth="1.2" strokeDasharray="7 4" strokeOpacity="0.35" />
      {/* Main disc */}
      <circle cx="200" cy="80" r="30" fill="var(--color-surface)" />
      <circle cx="200" cy="80" r="30" stroke="url(#ce-gold)" strokeWidth="2.5" />
      {/* Inner O-ring mark (brand) */}
      <circle
        cx="200"
        cy="80"
        r="16"
        fill="none"
        stroke="url(#ce-em)"
        strokeWidth="2.5"
        strokeDasharray="14 2.4"
        strokeLinecap="round"
        transform="rotate(-84 200 80)"
      />
      <circle cx="200" cy="80" r="3.5" fill="url(#ce-em)" />

      {/* Connector lines from engine → outputs */}
      <line x1="245" y1="80" x2="295" y2="42" stroke="#e6a93f" strokeWidth="1" strokeOpacity="0.30" />
      <line x1="245" y1="80" x2="295" y2="80" stroke="#e6a93f" strokeWidth="1.2" strokeOpacity="0.40" />
      <line x1="245" y1="80" x2="295" y2="118" stroke="#e6a93f" strokeWidth="1" strokeOpacity="0.30" />

      {/* ── RIGHT: Output cards ──────────────────────────────────────── */}
      {/* Output 1 — Website content */}
      <g filter="url(#ce-shadow)">
        <rect x="295" y="18" width="98" height="48" rx="6" fill="var(--color-surface)" />
        <rect x="295" y="18" width="98" height="48" rx="6" stroke="#e6a93f" strokeWidth="1.2" strokeOpacity="0.55" />
        <rect x="295" y="18" width="3.5" height="48" rx="1.75" fill="url(#ce-gold)" />
        <rect x="306" y="27" width="46" height="4.5" rx="2.25" fill="#e6a93f" fillOpacity="0.70" />
        <rect x="306" y="36" width="72" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="306" y="43" width="58" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="306" y="50" width="44" height="3.5" rx="1.75" fill="var(--color-border)" />
        {/* Tiny check badge */}
        <circle cx="380" cy="27" r="6" fill="#e6a93f" fillOpacity="0.18" />
        <polyline points="377,27 379.5,29.5 384,24" stroke="#e6a93f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeOpacity="0.85" />
      </g>

      {/* Output 2 — LinkedIn post */}
      <g filter="url(#ce-shadow)">
        <rect x="295" y="56" width="98" height="48" rx="6" fill="var(--color-surface)" />
        <rect x="295" y="56" width="98" height="48" rx="6" stroke="#e6a93f" strokeWidth="1.2" strokeOpacity="0.55" />
        <rect x="295" y="56" width="3.5" height="48" rx="1.75" fill="url(#ce-gold)" />
        <rect x="306" y="65" width="50" height="4.5" rx="2.25" fill="#e6a93f" fillOpacity="0.65" />
        <rect x="306" y="74" width="76" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="306" y="81" width="62" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="306" y="88" width="48" height="3.5" rx="1.75" fill="var(--color-border)" />
        <circle cx="380" cy="65" r="6" fill="#e6a93f" fillOpacity="0.18" />
        <polyline points="377,65 379.5,67.5 384,62" stroke="#e6a93f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeOpacity="0.85" />
      </g>

      {/* Output 3 — Citation-ready block */}
      <g filter="url(#ce-shadow)">
        <rect x="295" y="94" width="98" height="48" rx="6" fill="var(--color-surface)" />
        <rect x="295" y="94" width="98" height="48" rx="6" stroke="#e6a93f" strokeWidth="1.2" strokeOpacity="0.55" />
        <rect x="295" y="94" width="3.5" height="48" rx="1.75" fill="url(#ce-gold)" />
        <rect x="306" y="103" width="54" height="4.5" rx="2.25" fill="#e6a93f" fillOpacity="0.65" />
        <rect x="306" y="112" width="70" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="306" y="119" width="54" height="3.5" rx="1.75" fill="var(--color-border)" />
        <rect x="306" y="126" width="40" height="3.5" rx="1.75" fill="var(--color-border)" />
        <circle cx="380" cy="103" r="6" fill="#e6a93f" fillOpacity="0.18" />
        <polyline points="377,103 379.5,105.5 384,100" stroke="#e6a93f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeOpacity="0.85" />
      </g>
    </svg>
  );
}
