/**
 * color.ts — brand-colour safety for the public Ozvor Pages chrome.
 *
 * The site's brand colour is TENANT-controlled (landing_sites.theme.primary).
 * It is interpolated into an SSR <style> block (mobile-nav CSS) and into inline
 * styles. React does NOT escape <style> children, so an unvalidated value like
 * `red} body{background:url(//evil)}` would break out and inject CSS / trigger
 * external requests (Hermes #259). safeHexColor() clamps it to a strict hex
 * literal before it can reach any style sink; onAccent() derives a WCAG-correct
 * foreground.
 */

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Return a strict hex colour, or the fallback if the input isn't one. */
export function safeHexColor(v: unknown, fallback = "#0c7d54"): string {
  if (typeof v !== "string") return fallback;
  const s = v.trim();
  return HEX_RE.test(s) ? s : fallback;
}

// --- WCAG relative luminance (sRGB, gamma-corrected) ------------------------
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Contrast-safe foreground for text/icons sitting ON `hex`, chosen by WCAG
 * contrast ratio (not the YIQ shortcut): whichever of near-black / white gives
 * the higher ratio wins. `hex` should already be a safeHexColor().
 */
export function onAccent(hex: string): string {
  const safe = safeHexColor(hex);
  const [r, g, b] = hexToRgb(safe);
  const L = relativeLuminance(r, g, b);
  const contrastWhite = 1.05 / (L + 0.05); // (1.0 + 0.05) / (L + 0.05)
  const contrastBlack = (L + 0.05) / 0.05; // near-black ≈ luminance 0
  return contrastWhite >= contrastBlack ? "#ffffff" : "#171717";
}
