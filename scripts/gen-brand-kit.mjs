// gen-brand-kit.mjs — generate the Ozvor brand kit (platform-ready social assets).
//
// Produces avatars, banners/headers, and post templates sized for LinkedIn,
// Reddit, Instagram, YouTube, X/Twitter and Facebook, plus a BRAND-GUIDE.md and
// CHANNELS.md, into an output folder. Brand-accurate (monochrome O-ring,
// emerald + gold, dark canvas) using sharp to rasterize SVG — offline, no fonts
// to install.
//
// Run: node scripts/gen-brand-kit.mjs [outDir]
//   default outDir: <repo>/deliverables/ozvor-brand-kit

import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(__dirname, "../../../../deliverables/ozvor-brand-kit");
mkdirSync(OUT, { recursive: true });

// ---- brand constants --------------------------------------------------------
const CANVAS = "#0a0f0d";
const EMERALD = "#27c98a";
const EMERALD_DEEP = "#0c7d54";
const GOLD = "#e6a93f";
const INK = "#f4f7f5";
const MUTED = "#9fb0a4";
const FONT = "'Schibsted Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif";
const TAGLINE = "Know if AI trusts your brand.";
const URL = "ozvor.com";

// ---- svg helpers ------------------------------------------------------------
function defs() {
  return `<defs>
    <radialGradient id="glow" cx="50%" cy="38%" r="62%">
      <stop offset="0%" stop-color="${EMERALD}" stop-opacity="0.22"/>
      <stop offset="70%" stop-color="${EMERALD}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${EMERALD}"/>
      <stop offset="62%" stop-color="${EMERALD}"/>
      <stop offset="100%" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>`;
}

function bg(w, h, { glowX = w * 0.82, glowY = h * 0.22, hairline = true, fill = CANVAS } = {}) {
  const hairH = Math.max(3, Math.round(h * 0.012));
  return (
    `<rect width="${w}" height="${h}" fill="${fill}"/>` +
    `<circle cx="${glowX}" cy="${glowY}" r="${Math.max(w, h) * 0.5}" fill="url(#glow)"/>` +
    (hairline ? `<rect x="0" y="${h - hairH}" width="${w}" height="${hairH}" fill="url(#hair)" opacity="0.9"/>` : "")
  );
}

// O-ring mark — same dasharray geometry as components/brand/Logo.tsx.
function ring(cx, cy, r, color = EMERALD) {
  const k = r / 10.5;
  const sw = (3 * k).toFixed(2);
  const dash = `${(18.85 * k).toFixed(2)} ${(3.13 * k).toFixed(2)}`;
  const dot = (2.4 * k).toFixed(2);
  return (
    `<g transform="rotate(-84 ${cx} ${cy})"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-linecap="round"/></g>` +
    `<circle cx="${cx}" cy="${cy}" r="${dot}" fill="${color}"/>`
  );
}

function text(x, y, s, { size, weight = 700, fill = INK, anchor = "start", spacing = -1 }) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" fill="${fill}" text-anchor="${anchor}">${s}</text>`;
}

// Horizontal lockup (ring + Ozvor + tagline) left, url right — for wide banners.
function horizontalBanner(w, h, { showTagline = true, showUrl = true } = {}) {
  const padX = Math.round(Math.min(h * 0.55, w * 0.06) + 8);
  const r = Math.max(16, Math.round(h * 0.21));
  const cx = padX + r;
  const cy = Math.round(h / 2);
  const wordX = cx + r + Math.round(h * 0.16);
  const wordSize = Math.round(h * 0.34);
  let svg = defs() + bg(w, h);
  svg += ring(cx, cy, r);
  if (showTagline && h >= 240) {
    svg += text(wordX, cy - Math.round(h * 0.02), "Ozvor", { size: wordSize, weight: 800, anchor: "start", spacing: -2 });
    svg += text(wordX, cy + Math.round(h * 0.26), TAGLINE, { size: Math.round(h * 0.13), weight: 500, fill: MUTED, spacing: 0 });
  } else {
    svg += text(wordX, cy + Math.round(wordSize * 0.34), "Ozvor", { size: wordSize, weight: 800, anchor: "start", spacing: -2 });
  }
  if (showUrl) {
    svg += text(w - padX, cy + Math.round(h * 0.05), URL, { size: Math.round(h * 0.12), weight: 600, fill: MUTED, anchor: "end", spacing: 0 });
  }
  return svgDoc(w, h, svg);
}

// Centered stacked lockup (ring over Ozvor over tagline) — squares, posts, YT.
function stackedLockup(w, h, cx, cy, u, { tagline = true, pill = false, url = false, ringColor = EMERALD, wordFill = INK } = {}) {
  const r = Math.round(u * 0.12);
  let svg = "";
  const ringCy = cy - Math.round(u * 0.16);
  svg += ring(cx, ringCy, r, ringColor);
  const wordY = ringCy + r + Math.round(u * 0.135);
  svg += text(cx, wordY, "Ozvor", { size: Math.round(u * 0.12), weight: 800, anchor: "middle", spacing: -2, fill: wordFill });
  let cursor = wordY;
  if (tagline) {
    cursor = wordY + Math.round(u * 0.075);
    svg += text(cx, cursor, TAGLINE, { size: Math.round(u * 0.042), weight: 500, fill: MUTED, anchor: "middle", spacing: 0 });
  }
  if (pill) {
    const pw = Math.round(u * 0.42), ph = Math.round(u * 0.075), py = cursor + Math.round(u * 0.06);
    svg += `<rect x="${cx - pw / 2}" y="${py}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="${EMERALD}" fill-opacity="0.12" stroke="${EMERALD}" stroke-opacity="0.5"/>`;
    svg += text(cx, py + ph * 0.7, "TrustIndex AI Score", { size: Math.round(u * 0.036), weight: 600, fill: "#5fdfa8", anchor: "middle", spacing: 0 });
    cursor = py + ph;
  }
  if (url) {
    svg += text(cx, cursor + Math.round(u * 0.07), URL, { size: Math.round(u * 0.04), weight: 600, fill: MUTED, anchor: "middle", spacing: 0 });
  }
  return svg;
}

function svgDoc(w, h, inner) {
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

function squareAvatar(size, { wordmark = true, ringColor = EMERALD, fill = CANVAS, wordFill = INK } = {}) {
  const rx = Math.round(size * 0.18);
  let svg = defs();
  svg += `<rect width="${size}" height="${size}" rx="${rx}" fill="${fill}"/>`;
  svg += `<rect width="${size}" height="${size}" rx="${rx}" fill="url(#glow)"/>`;
  if (wordmark) {
    svg += stackedLockup(size, size, size / 2, Math.round(size * 0.46), size, { tagline: false, ringColor, wordFill });
  } else {
    svg += ring(size / 2, size / 2, Math.round(size * 0.32), ringColor);
  }
  return svgDoc(size, size, svg);
}

// Full-canvas centered banner (e.g. YouTube — lockup in middle safe area).
function centeredBanner(w, h, u, opts = {}) {
  let svg = defs() + bg(w, h, { glowX: w / 2, glowY: h * 0.32 });
  svg += stackedLockup(w, h, w / 2, h / 2, u, opts);
  return svgDoc(w, h, svg);
}

// ---- asset manifest ---------------------------------------------------------
const assets = [
  // Avatars (square)
  ["avatar-ozvor-1024.png", squareAvatar(1024, { wordmark: true }), 1024, 1024],
  ["avatar-icon-1024.png", squareAvatar(1024, { wordmark: false }), 1024, 1024],
  ["avatar-emerald-1024.png", squareAvatar(1024, { wordmark: true, fill: EMERALD_DEEP, ringColor: INK, wordFill: INK }), 1024, 1024],
  // LinkedIn
  ["linkedin-company-cover-1128x191.png", horizontalBanner(1128, 191), 1128, 191],
  ["linkedin-personal-banner-1584x396.png", horizontalBanner(1584, 396), 1584, 396],
  // X / Twitter
  ["x-header-1500x500.png", horizontalBanner(1500, 500), 1500, 500],
  // Reddit
  ["reddit-banner-1920x384.png", horizontalBanner(1920, 384), 1920, 384],
  // Facebook
  ["facebook-cover-1200x630.png", horizontalBanner(1200, 630), 1200, 630],
  // YouTube (centered lockup inside the 1546×423 safe area)
  ["youtube-banner-2560x1440.png", centeredBanner(2560, 1440, 423, { tagline: true }), 2560, 1440],
  // Instagram
  ["instagram-post-1080x1080.png", centeredBanner(1080, 1080, 1080, { tagline: true, pill: true, url: true }), 1080, 1080],
  ["instagram-story-1080x1920.png", (() => {
    let svg = defs() + bg(1080, 1920, { glowX: 540, glowY: 620 });
    svg += stackedLockup(1080, 1920, 540, 900, 1000, { tagline: true, pill: true, url: true });
    return svgDoc(1080, 1920, svg);
  })(), 1080, 1920],
  // Generic share / OG
  ["og-share-1200x630.png", (() => {
    let svg = defs() + bg(1200, 630, { glowX: 1040, glowY: 120 });
    svg += ring(116, 104, 31.5);
    svg += text(168, 120, "Ozvor", { size: 46, weight: 800, spacing: -1 });
    svg += text(80, 318, "AI SEARCH TRUST INTELLIGENCE", { size: 28, weight: 600, fill: "#8aa399", spacing: 3 });
    svg += text(78, 412, "Know if AI trusts", { size: 92, weight: 800, spacing: -3 });
    svg += `<text x="78" y="508" font-family="${FONT}" font-size="92" font-weight="800" letter-spacing="-3"><tspan fill="${INK}">your brand.</tspan><tspan dx="26" fill="#5fdfa8">Then fix it.</tspan></text>`;
    svg += text(80, 582, URL, { size: 34, weight: 500, spacing: 0 });
    return svgDoc(1200, 630, svg);
  })(), 1200, 630],
];

// ---- render -----------------------------------------------------------------
const logoDir = join(OUT, "assets");
mkdirSync(logoDir, { recursive: true });
for (const [name, svg, w, h] of assets) {
  await sharp(Buffer.from(svg)).png().toFile(join(logoDir, name));
  console.log(`✓ assets/${name}  (${w}×${h})`);
}

// ---- brand guide + channels (written after the consts below) ----------------

// ---------------------------------------------------------------------------
const BRAND_GUIDE = `# Ozvor — Brand Kit

_Ozvor · AI Search Trust Intelligence · ozvor.com_

Use these assets across every channel. The system is **dark-first, confident, and
technical-but-human**. Protected names that never change: **"TrustIndex AI Score"**
(the 3-vector score) and **"OrganicPosts by Ozvor"** (the done-with-you arm).

---

## 1. Logo — the O-ring

The mark is a **monochrome O-ring**: a dashed orbit (the "scan" of AI engines
circling your brand) with a solid centre dot (your brand at the centre). It is
always one colour (\`currentColor\`) — emerald on dark, ink on light. Never a tile,
never multicolour, never the old bar-chart mark.

- **Primary:** emerald O-ring on the dark canvas.
- **Wordmark:** "Ozvor", weight 800, tight tracking (-0.02em). Title-case, never all-caps in the logo.
- **Clear space:** keep at least the ring's radius clear on all sides.
- **Min size:** ring 20px; full lockup 96px wide.
- **Don'ts:** don't recolour the ring per-segment, add shadows/gradients to the mark, rotate it, stretch it, or place the emerald ring on a busy photo (use the ink/white ring instead).

---

## 2. Colour

| Token | Hex | Use |
|---|---|---|
| Canvas (dark) | \`#0a0f0d\` | Default background |
| Emerald | \`#27c98a\` | Primary accent, the ring, self-serve CTAs |
| Emerald deep | \`#0c7d54\` | Gradient end, links on light |
| Accent ink | \`#5fdfa8\` | Emerald text on dark |
| Gold | \`#e6a93f\` | **Reserved for OrganicPosts** (done-with-you) + the emerald→gold ladder hairline |
| Ink (text) | \`#f4f7f5\` | Text on dark |
| Muted | \`#9fb0a4\` | Secondary text on dark |
| Cream (print) | \`#f6f3ea\` | PDF / light surfaces |

**Accent rule:** emerald = self-serve (Free / Kit / Growth / Agency). **Gold is reserved for OrganicPosts only.** Don't use gold as a generic accent.

---

## 3. Type

- **Display & UI:** Schibsted Grotesk (weights 400–800). Fallback: Helvetica Neue / Arial.
- **Mono / code / data:** JetBrains Mono.
- Headlines are tight (-0.02 to -0.03em), bold (700–800), sentence case.

---

## 4. Voice

Plain, specific, honest. We sell clarity, not hype. We never *guarantee* AI
citations (the systems are non-deterministic) — we measure and improve the
probability. Lead with the customer's problem ("when a buyer asks AI, does it
name you?"), back claims with named sources, and keep a calm, expert tone.

Tagline: **"Know if AI trusts your brand."** (extended: "…Then fix it.")

---

## 5. What's in this kit

All files are in \`/assets\`. See \`CHANNELS.md\` for exact placement and dimensions.

- **Avatars (square, 1024×1024):** \`avatar-ozvor\` (ring + wordmark), \`avatar-icon\` (ring only — best at small sizes), \`avatar-emerald\` (for light surfaces).
- **Banners/headers:** LinkedIn (company + personal), X/Twitter, Reddit, Facebook, YouTube.
- **Post templates:** Instagram square + story, generic OG/share.

PNG, transparent-free (solid dark canvas), exported at platform-native sizes.
Need a different size? Re-run \`node scripts/gen-brand-kit.mjs\` — every asset is
generated from code, so the kit stays perfectly on-brand.
`;

const CHANNELS = `# Ozvor — Channel Placement Guide

Exact file → where it goes → native dimensions. (Platforms tweak specs over time;
these are correct as of 2026. The square avatar scales down cleanly everywhere.)

## Avatars (profile pictures)
| File | Size | Use on |
|---|---|---|
| \`assets/avatar-icon-1024.png\` | 1024×1024 | **Best for small avatars** — Reddit, X, Instagram, favicons. The ring reads at tiny sizes. |
| \`assets/avatar-ozvor-1024.png\` | 1024×1024 | LinkedIn company logo, YouTube channel icon, Facebook page — where the avatar renders larger. |
| \`assets/avatar-emerald-1024.png\` | 1024×1024 | Any context with a light/white surrounding UI. |

## Banners & headers
| File | Size | Platform |
|---|---|---|
| \`assets/linkedin-company-cover-1128x191.png\` | 1128×191 | LinkedIn **company page** cover |
| \`assets/linkedin-personal-banner-1584x396.png\` | 1584×396 | LinkedIn **personal profile** background |
| \`assets/x-header-1500x500.png\` | 1500×500 | X / Twitter header |
| \`assets/reddit-banner-1920x384.png\` | 1920×384 | Reddit profile / community banner |
| \`assets/facebook-cover-1200x630.png\` | 1200×630 | Facebook page cover |
| \`assets/youtube-banner-2560x1440.png\` | 2560×1440 | YouTube channel art (logo/text sit inside the 1546×423 safe area, visible on every device) |

## Posts & sharing
| File | Size | Use |
|---|---|---|
| \`assets/instagram-post-1080x1080.png\` | 1080×1080 | Instagram / LinkedIn / Facebook square post (announcement, intro) |
| \`assets/instagram-story-1080x1920.png\` | 1080×1920 | Instagram / TikTok / WhatsApp story |
| \`assets/og-share-1200x630.png\` | 1200×630 | Generic link-share / Open Graph (same look as the site's og-default) |

## Handles
Claim a consistent handle everywhere: **@ozvor** (or \`ozvor\` / \`getozvor\` where taken).
Bio line: *"AI Search Trust Intelligence for SMBs. Know if AI trusts your brand — then fix it. ozvor.com"*
`;

writeFileSync(join(OUT, "BRAND-GUIDE.md"), BRAND_GUIDE);
writeFileSync(join(OUT, "CHANNELS.md"), CHANNELS);
console.log(`✓ BRAND-GUIDE.md + CHANNELS.md`);
console.log(`\nDone → ${OUT}`);
