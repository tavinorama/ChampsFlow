/**
 * card-render.ts — the branded Instagram card (1.6, "IG com IMAGEM já").
 *
 * Instagram refuses text-only posts (22/08: 4 live failures → report-only,
 * #516). A branded card PNG carrying the post's HOOK line + the caption is a
 * legitimate IG post. This module turns the approved [CARD HOOK] into that
 * PNG, DETERMINISTICALLY: no LLM sits between the founder's approval and the
 * pixels — the layout is pure code over the exact hook text he approved.
 *
 * Brand (same source as scripts/gen-og-image.mjs and components/brand/Logo.tsx):
 * dark canvas #0a0f0d, emerald #27c98a / ink #5fdfa8, monochrome O-ring mark
 * (dasharray geometry of Logo.tsx), Schibsted Grotesk with a sans fallback.
 * Rasterized offline with sharp (SVG → PNG) — no headless browser.
 *
 * Split on purpose: `layoutHookLines` and `cardSvg` are PURE (unit-tested
 * without sharp); `renderCardPng` is the only function that touches sharp,
 * and it THROWS on any failure — the caller (the worker's media port) turns
 * that into an honest "publish not sent", never a text-only fallback.
 */

export const CARD_SIZE = 1080; // IG feed square (1:1) — accepted everywhere
export const CARD_BG = "#0a0f0d";
export const CARD_ACCENT = "#27c98a";
export const CARD_INK = "#5fdfa8";
export const CARD_TEXT = "#f4f7f5";
export const CARD_MUTED = "#8aa399";
/** Longest hook the card can carry legibly (the runner enforces it before approval). */
export const CARD_HOOK_MAX_CHARS = 90;

const FONT = "'Schibsted Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/**
 * Greedy word wrap for the hook. Pure. A single word longer than the line
 * still gets its own line (never dropped, never split mid-word).
 */
export function layoutHookLines(hook: string, maxCharsPerLine: number): string[] {
  const words = hook.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length <= maxCharsPerLine || cur === "") {
      cur = candidate;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Type size + wrap width chosen from the hook's length — short hooks get big type. */
export function hookTypography(hook: string): { fontSize: number; maxCharsPerLine: number; lineHeight: number } {
  const n = hook.trim().length;
  if (n <= 32) return { fontSize: 96, maxCharsPerLine: 18, lineHeight: 108 };
  if (n <= 60) return { fontSize: 80, maxCharsPerLine: 22, lineHeight: 92 };
  return { fontSize: 66, maxCharsPerLine: 27, lineHeight: 78 };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The card as SVG. Pure and deterministic: same hook → same markup. The hook
 * is XML-escaped (a hook with `<` or `&` must never break the document or
 * inject markup). Layout: brand lockup top-left, hook block vertically
 * centered, footer with the domain + the brand hairline.
 */
export function cardSvg(hook: string): string {
  const W = CARD_SIZE;
  const H = CARD_SIZE;
  const { fontSize, maxCharsPerLine, lineHeight } = hookTypography(hook);
  const lines = layoutHookLines(hook, maxCharsPerLine);
  const blockH = lines.length * lineHeight;
  const firstBaseline = Math.round((H - blockH) / 2 + fontSize * 0.85);
  const tspans = lines
    .map((line, i) => `<tspan x="96" y="${firstBaseline + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");

  // O-ring geometry ×3 from Logo.tsx (r10.5, sw3, dash "18.85 3.13").
  const RING_CX = 128;
  const RING_CY = 128;
  const RING_R = 31.5;
  const RING_SW = 9;
  const DASH = "56.55 9.39";
  const DOT_R = 7.2;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${CARD_ACCENT}" stop-opacity="0.28"/>
      <stop offset="70%" stop-color="${CARD_ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${CARD_ACCENT}" stop-opacity="0.55"/>
      <stop offset="62%" stop-color="${CARD_ACCENT}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#e6a93f" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${CARD_BG}"/>
  <circle cx="900" cy="160" r="520" fill="url(#glow)"/>
  <rect x="0" y="${H - 8}" width="${W}" height="8" fill="url(#hair)"/>
  <g transform="rotate(-84 ${RING_CX} ${RING_CY})">
    <circle cx="${RING_CX}" cy="${RING_CY}" r="${RING_R}" fill="none"
      stroke="${CARD_ACCENT}" stroke-width="${RING_SW}" stroke-dasharray="${DASH}" stroke-linecap="round"/>
  </g>
  <circle cx="${RING_CX}" cy="${RING_CY}" r="${DOT_R}" fill="${CARD_ACCENT}"/>
  <text x="180" y="144" font-family="${FONT}" font-size="46" font-weight="600"
    letter-spacing="-1" fill="${CARD_TEXT}">Ozvor</text>
  <text x="96" y="300" font-family="${FONT}" font-size="26" font-weight="500"
    letter-spacing="3" fill="${CARD_MUTED}">AI SEARCH TRUST INTELLIGENCE</text>
  <text font-family="${FONT}" font-size="${fontSize}" font-weight="700" letter-spacing="-2" fill="${CARD_TEXT}">${tspans}</text>
  <text x="96" y="${H - 72}" font-family="${FONT}" font-size="34" font-weight="500" fill="${CARD_INK}">ozvor.com</text>
</svg>`;
}

/**
 * Rasterize the card. The ONLY sharp touchpoint. Palette PNG (the card is flat
 * color + text) keeps the file small — it travels inline (base64) in the
 * publish payload to the VPS (docs/specs/ig-image-fase1.md). Throws on any
 * failure (sharp missing, librsvg error): the caller must fail the publish
 * step honestly — a media channel never receives text alone.
 */
export async function renderCardPng(hook: string): Promise<Buffer> {
  const mod = (await import("sharp")) as unknown as { default: (input: Buffer) => SharpLike };
  const sharp = mod.default;
  const svg = cardSvg(hook);
  return sharp(Buffer.from(svg)).png({ palette: true, colours: 128, compressionLevel: 9 }).toBuffer();
}

/** The slice of sharp's API this module uses — keeps the import lazy and typed. */
interface SharpLike {
  png(opts: { palette?: boolean; colours?: number; compressionLevel?: number }): { toBuffer(): Promise<Buffer> };
}
