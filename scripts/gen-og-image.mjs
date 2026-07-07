// Regenerate the Ozvor share image (Open Graph / Twitter card), 1200×630.
//
// Replaces apps/web/public/og-default.png — the single raster every marketing
// page references for og:image / twitter:image. Rasterizes a brand-accurate SVG
// with sharp (offline, deterministic; no headless browser needed).
//
// Run:  node scripts/gen-og-image.mjs
//
// Brand: dark canvas #0a0f0d, emerald accent #27c98a / ink #5fdfa8, monochrome
// O-ring mark (same dasharray geometry as components/brand/Logo.tsx), Schibsted-
// like sans fallback. Keeps the protected names "Ozvor AI Visibility Score".

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../apps/web/public/og-default.png");

const W = 1200;
const H = 630;

// O-ring geometry scaled ×3 from Logo.tsx (r10.5, sw3, dash "18.85 3.13").
const RING_CX = 116;
const RING_CY = 104;
const RING_R = 31.5; // 10.5 × 3
const RING_SW = 9; // 3 × 3
const DASH = "56.55 9.39"; // "18.85 3.13" × 3
const DOT_R = 7.2; // 2.4 × 3

const FONT = "'Schibsted Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#27c98a" stop-opacity="0.30"/>
      <stop offset="70%" stop-color="#27c98a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#27c98a" stop-opacity="0.55"/>
      <stop offset="62%" stop-color="#27c98a" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#e6a93f" stop-opacity="0.55"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#0a0f0d"/>
  <circle cx="1040" cy="120" r="520" fill="url(#glow)"/>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="url(#hair)"/>

  <!-- brand lockup -->
  <g transform="rotate(-84 ${RING_CX} ${RING_CY})">
    <circle cx="${RING_CX}" cy="${RING_CY}" r="${RING_R}" fill="none"
      stroke="#27c98a" stroke-width="${RING_SW}" stroke-dasharray="${DASH}" stroke-linecap="round"/>
  </g>
  <circle cx="${RING_CX}" cy="${RING_CY}" r="${DOT_R}" fill="#27c98a"/>
  <text x="168" y="120" font-family="${FONT}" font-size="46" font-weight="600"
    letter-spacing="-1" fill="#f4f7f5">Ozvor</text>

  <!-- eyebrow -->
  <text x="80" y="318" font-family="${FONT}" font-size="28" font-weight="500"
    letter-spacing="3" fill="#8aa399">AI SEARCH TRUST INTELLIGENCE</text>

  <!-- headline -->
  <text x="78" y="412" font-family="${FONT}" font-size="92" font-weight="700"
    letter-spacing="-3" fill="#f4f7f5">Know if AI trusts</text>
  <text x="78" y="508" font-family="${FONT}" font-size="92" font-weight="700" letter-spacing="-3">
    <tspan fill="#f4f7f5">your brand.</tspan><tspan dx="26" fill="#5fdfa8">Then fix it.</tspan>
  </text>

  <!-- footer row -->
  <text x="80" y="582" font-family="${FONT}" font-size="34" font-weight="500" fill="#f4f7f5">ozvor.com</text>
  <rect x="812" y="546" width="308" height="50" rx="25"
    fill="#27c98a" fill-opacity="0.10" stroke="#27c98a" stroke-opacity="0.5"/>
  <text x="966" y="578" font-family="${FONT}" font-size="26" font-weight="600"
    text-anchor="middle" fill="#5fdfa8">Ozvor AI Visibility Score</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log(`✓ wrote ${OUT}`);
