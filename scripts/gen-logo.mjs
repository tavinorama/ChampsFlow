// Generate the Ozvor square logo (512×512) for structured-data / publisher use.
//
// Writes apps/web/public/logo.png — referenced by the blog JSON-LD
// (Article.publisher.logo) which previously pointed at a non-existent file.
// Brand-accurate: dark canvas, monochrome O-ring mark + "Ozvor" wordmark.
//
// Run: node scripts/gen-logo.mjs

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../apps/web/public/logo.png");

const S = 512;
// O-ring geometry (Logo.tsx: r10.5, sw3, dash "18.85 3.13") scaled ×11 → r≈116.
const CX = 256, CY = 196, R = 116, SW = 33;
const DASH = "207.3 34.4"; // "18.85 3.13" × 11
const DOT_R = 26.4;

const svg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#27c98a" stop-opacity="0.22"/>
      <stop offset="70%" stop-color="#27c98a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" rx="96" fill="#0a0f0d"/>
  <rect width="${S}" height="${S}" rx="96" fill="url(#glow)"/>
  <g transform="rotate(-84 ${CX} ${CY})">
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#27c98a" stroke-width="${SW}"
      stroke-dasharray="${DASH}" stroke-linecap="round"/>
  </g>
  <circle cx="${CX}" cy="${CY}" r="${DOT_R}" fill="#27c98a"/>
  <text x="${CX}" y="404" text-anchor="middle"
    font-family="'Schibsted Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif"
    font-size="78" font-weight="700" letter-spacing="-2" fill="#f4f7f5">Ozvor</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log(`✓ wrote ${OUT}`);
