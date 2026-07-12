/**
 * landing-export.ts — turn a generated Ozvor Pages site into a self-contained
 * STATIC site the client can drag-and-drop onto their own hosting/domain.
 *
 * Pure/DB-free/React-free → produces a list of { path, content } files:
 *   index.html, <slug>.html (one per page), styles.css, README.txt
 *
 * ToS decision (founder, 2026-07-12): Google Places PHOTOS are NOT bundled —
 * Google's policy forbids redistributing the photo files on a third-party host.
 * Every gallery / hero image is replaced with a clear notice telling the owner
 * to add their own images, and the README explains why. Everything else
 * (copy, attributed reviews, NAP, hours, theme, JSON-LD) is fully included, so
 * the export is honest and portable.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ExportBusiness {
  name: string;
  category?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  hours?: string | null;
}

export interface ExportPage {
  /** '' = home. */
  slug: string;
  title: string;
  sections: unknown[];
  seo?: { title?: string; description?: string } | null;
  jsonLd?: unknown[];
}

export interface ExportSiteInput {
  business: ExportBusiness;
  /** Brand colour (hex). Falls back to a neutral if absent. */
  themePrimary?: string;
  pages: ExportPage[];
  /** BCP-47 language tag for <html lang>. Defaults to "en". */
  lang?: string;
  /** Copyright year for the footer. Defaults to the current year. */
  year?: number;
}

export interface ExportFile {
  path: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Escaping — all dynamic text is business data or verbatim reviews, so escape.
// ---------------------------------------------------------------------------

export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}
/**
 * Normalize a slug to a filesystem/URL-safe token. Strips everything outside
 * [a-z0-9-] — so `../../x`, quotes, slashes and separators can never escape the
 * ZIP root or inject an HTML attribute. '' stays '' (the home page → index.html).
 */
export function safeSlug(slug: unknown): string {
  return String(slug ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function fileNameForSlug(slug: string): string {
  const norm = safeSlug(slug);
  return norm ? `${norm}.html` : "index.html";
}

/**
 * Allowlist for STORED website URLs rendered into <a href> — mirrors the web
 * app's safeHref contract (apps/web/src/lib/safe-json-ld.ts). Only http(s)
 * survives; `javascript:`, `data:`, protocol-relative `//evil` → null and the
 * caller renders plain text instead. A bare domain gets https:// prefixed.
 */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
    ? value
    : value.startsWith("//")
      ? `https:${value}`
      : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * HTML-script-safe JSON-LD serialization — mirrors the web app's safeJsonLd
 * (apps/web/src/lib/safe-json-ld.ts). Escapes <, >, & and U+2028/2029 as \uXXXX
 * so a stored `</script><script>` can't break out of the tag. Byte-identical
 * after JSON.parse (unicode escapes are plain JSON).
 */
export function safeJsonLdExport(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Normalize a brand colour to #rgb or #rrggbb (adds the #). null if invalid. */
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(m) || /^[0-9a-fA-F]{6}$/.test(m)) return `#${m.toLowerCase()}`;
  return null;
}

/** Contrast-safe text colour (#111 or #fff) for text sitting ON the brand fill. */
export function contrastText(hex: string): string {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#171717" : "#ffffff";
}

/**
 * Resolve an internal-link slug to a same-folder href. Uses the site's slug→
 * filename map when the target is a real page; otherwise falls back to the
 * normalized name (still traversal-safe).
 */
type HrefResolver = (slug: unknown) => string;

// ---------------------------------------------------------------------------
// Section → HTML (mirrors the public SectionRenderer, minus Google photos)
// ---------------------------------------------------------------------------

const IMAGE_NOTICE =
  `<div class="oz-photo-note"><strong>Add your own photos here.</strong> ` +
  `Google Maps photos aren't included in this download — Google's policy doesn't ` +
  `allow redistributing them as files. Drop your own images in and update this section.</div>`;

function renderSection(sec: unknown, resolveHref: HrefResolver): string {
  if (!isObj(sec)) return "";
  const type = s(sec.type);
  switch (type) {
    case "hero": {
      const headline = escapeHtml(sec.headline || sec.business_name);
      const sub = s(sec.subheadline) ? `<p class="lede">${escapeHtml(sec.subheadline)}</p>` : "";
      const rating =
        typeof sec.rating === "number"
          ? `<p class="rating"><span class="stars">${"★".repeat(Math.max(0, Math.min(5, Math.round(sec.rating))))}</span> <strong>${escapeHtml(sec.rating)}</strong>${typeof sec.review_count === "number" ? ` · ${escapeHtml(sec.review_count)} reviews on Google` : ""}</p>`
          : "";
      const imgNote = sec.image ? IMAGE_NOTICE : "";
      return `<header class="hero"><div class="wrap"><div><h1>${headline}</h1>${sub}<a class="btn" href="#contact">${escapeHtml(sec.cta_label || "Get in touch")}</a>${rating}</div>${imgNote ? `<div>${imgNote}</div>` : ""}</div></header>`;
    }
    case "gallery":
      return `<section class="sec"><h2>${escapeHtml(sec.heading || "Photos")}</h2>${IMAGE_NOTICE}</section>`;
    case "services": {
      const items = Array.isArray(sec.items) ? sec.items.filter((x) => typeof x === "string") : [];
      if (items.length === 0) return "";
      return `<section class="sec"><h2>${escapeHtml(sec.heading || "What We Do")}</h2><ul class="chips">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></section>`;
    }
    case "proof": {
      const items = Array.isArray(sec.items) ? sec.items.filter(isObj) : [];
      if (items.length === 0) return "";
      return `<section class="sec"><h2>${escapeHtml(sec.heading || "What people say")}</h2><div class="reviews">${items
        .map((it) => {
          const rating = typeof it.rating === "number" ? `<div class="stars">${"★".repeat(Math.max(0, Math.min(5, Math.round(it.rating))))}</div>` : "";
          const meta = [s(it.author), s(it.relative_time), s(it.source)].filter(Boolean).map(escapeHtml).join(" · ");
          return `<blockquote>${rating}<p>“${escapeHtml(it.body)}”</p><footer>— ${meta}</footer></blockquote>`;
        })
        .join("")}</div></section>`;
    }
    case "faq": {
      const items = Array.isArray(sec.items) ? sec.items.filter(isObj) : [];
      if (items.length === 0) return "";
      return `<section class="sec"><h2>${escapeHtml(sec.heading || "FAQ")}</h2>${items
        .map((it) => `<details><summary>${escapeHtml(it.q)}</summary><p>${escapeHtml(it.a)}</p></details>`)
        .join("")}</section>`;
    }
    case "map_nap": {
      const site = safeUrl(sec.website);
      const rows = [
        s(sec.address) ? `<dd>${escapeHtml(sec.address)}</dd>` : "",
        s(sec.phone) ? `<dd><a href="tel:${escapeHtml(s(sec.phone).replace(/[^0-9+]/g, ""))}">${escapeHtml(sec.phone)}</a></dd>` : "",
        site
          ? `<dd><a href="${escapeHtml(site)}" rel="noopener nofollow">${escapeHtml(s(sec.website))}</a></dd>`
          : s(sec.website)
            ? `<dd>${escapeHtml(sec.website)}</dd>`
            : "",
      ].join("");
      return `<section class="sec" id="contact"><h2>${escapeHtml(sec.name || "Visit")}</h2><dl>${rows}</dl></section>`;
    }
    case "hours": {
      if (!s(sec.hours)) return "";
      const lines = s(sec.hours).split(/\n|;/).map((l) => l.trim()).filter(Boolean);
      return `<section class="sec"><h2>${escapeHtml(sec.heading || "Hours")}</h2><ul class="hours">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul></section>`;
    }
    case "areas": {
      const items = Array.isArray(sec.items) ? sec.items.filter((x) => typeof x === "string") : [];
      if (items.length === 0) return "";
      return `<section class="sec"><h2>${escapeHtml(sec.heading || "Areas We Serve")}</h2><ul class="chips">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></section>`;
    }
    case "trust": {
      const themes = Array.isArray(sec.themes) ? sec.themes.filter((x) => typeof x === "string") : [];
      if (themes.length === 0) return "";
      return `<section class="sec"><h2>${escapeHtml(sec.heading || "Why Customers Choose Us")}</h2><ul class="checks">${themes.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></section>`;
    }
    case "cta":
      return `<section class="sec cta" id="contact"><h2>${escapeHtml(sec.heading || "Get in touch")}</h2>${s(sec.phone) ? `<a class="btn" href="tel:${escapeHtml(s(sec.phone).replace(/[^0-9+]/g, ""))}">Call ${escapeHtml(sec.phone)}</a>` : ""}</section>`;
    case "text": {
      // internal-links variant
      if (sec.role === "internal_links" && Array.isArray(sec.links)) {
        const links = sec.links.filter(isObj);
        return `<nav class="sec"><h2>${escapeHtml(sec.heading || "Explore More")}</h2><ul class="chips">${links.map((l) => `<li><a href="${escapeHtml(resolveHref(l.slug))}">${escapeHtml(l.label)}</a></li>`).join("")}</ul></nav>`;
      }
      if (!s(sec.body) && !s(sec.heading)) return "";
      const paras = s(sec.body).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      return `<section class="sec">${s(sec.heading) ? `<h2>${escapeHtml(sec.heading)}</h2>` : ""}${paras.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</section>`;
    }
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Page + site assembly
// ---------------------------------------------------------------------------

function navHtml(business: ExportBusiness, pages: ExportPage[], currentSlug: string, resolveHref: HrefResolver): string {
  const links = pages
    .map((p) => `<a href="${escapeHtml(resolveHref(p.slug))}"${p.slug === currentSlug ? ' aria-current="page"' : ""}>${escapeHtml(p.title || "Home")}</a>`)
    .join("");
  return `<header class="site-nav"><div class="wrap"><a class="word" href="index.html"><span class="dot"></span> ${escapeHtml(business.name)}</a><nav>${links}</nav><a class="btn small" href="#contact">Get in touch</a></div></header>`;
}

function footerHtml(business: ExportBusiness, pages: ExportPage[], resolveHref: HrefResolver, year: number): string {
  const b = business;
  const site = safeUrl(b.website);
  const napLines = [
    b.category ? `<p class="muted">${escapeHtml(b.category)}</p>` : "",
    b.address ? `<p>${escapeHtml(b.address)}</p>` : "",
    b.phone ? `<p><a href="tel:${escapeHtml(s(b.phone).replace(/[^0-9+]/g, ""))}">${escapeHtml(b.phone)}</a></p>` : "",
  ].join("");
  const pageLinks = pages.map((p) => `<a href="${escapeHtml(resolveHref(p.slug))}">${escapeHtml(p.title || "Home")}</a>`).join("");
  const websiteLink = site ? `<a href="${escapeHtml(site)}" rel="noopener nofollow">Website</a>` : "";
  return `<footer class="site-footer"><div class="wrap"><div><div class="word"><span class="dot"></span> ${escapeHtml(b.name)}</div>${napLines}</div><div class="col">${pageLinks}${websiteLink}</div></div><div class="bar"><span>© ${year} ${escapeHtml(b.name)}</span><span>Made with Ozvor</span></div></footer>`;
}

function pageHtml(
  input: ExportSiteInput,
  page: ExportPage,
  resolveHref: HrefResolver,
  lang: string,
  year: number
): string {
  const title = escapeHtml(page.seo?.title || page.title || input.business.name);
  const desc = escapeHtml(page.seo?.description || "");
  const jsonLd = Array.isArray(page.jsonLd)
    ? page.jsonLd
        .filter(isObj)
        .map((n) => `<script type="application/ld+json">${safeJsonLdExport(n)}</script>`)
        .join("")
    : "";
  const body = page.sections.map((sec) => renderSection(sec, resolveHref)).join("\n");
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${desc ? `<meta name="description" content="${desc}">` : ""}
<link rel="stylesheet" href="styles.css">
${jsonLd}
</head>
<body>
${navHtml(input.business, input.pages, page.slug, resolveHref)}
<main>
${body}
</main>
${footerHtml(input.business, input.pages, resolveHref, year)}
</body>
</html>
`;
}

function stylesCss(primary: string, onBrand: string): string {
  return `:root{--brand:${primary};--on-brand:${onBrand};--ink:#211d17;--muted:#736b5e;--line:#e6e1d7;--bg:#fdfcfa;--surface:#fff}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.55}
a{color:var(--brand)}.wrap{max-width:1080px;margin:0 auto;padding:0 1.5rem}
.site-nav{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.9);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.site-nav .wrap{display:flex;align-items:center;flex-wrap:wrap;gap:.75rem 1.25rem;padding-top:.85rem;padding-bottom:.85rem}
.word{display:inline-flex;align-items:center;gap:.5rem;font-weight:800;font-size:1.2rem;color:var(--ink);text-decoration:none}
.dot{width:11px;height:11px;border-radius:50%;background:var(--brand);display:inline-block}
.site-nav nav{display:flex;flex-wrap:wrap;gap:1.1rem;margin-left:.5rem}.site-nav nav a{color:#3a473f;text-decoration:none;font-size:.9rem}
.site-nav .btn{margin-left:auto}
.btn{display:inline-flex;align-items:center;min-height:46px;padding:.8rem 1.6rem;background:var(--brand);color:var(--on-brand);font-weight:700;text-decoration:none;border-radius:12px}
.btn.small{min-height:40px;padding:.5rem 1.15rem;font-size:.9rem}
.hero{background:linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--brand) 6%,var(--surface)))}
.hero .wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:2.75rem;align-items:center;padding-top:3.75rem;padding-bottom:3.75rem}
.hero h1{font-size:clamp(2rem,5vw,3.25rem);font-weight:800;letter-spacing:-.03em;line-height:1.03;margin:0}
.hero .lede{margin-top:1.1rem;font-size:1.15rem;color:var(--muted);max-width:34ch}
.hero .btn{margin-top:1.75rem}.hero .rating{margin-top:1.5rem;color:var(--muted)}.stars{color:#e0a325;letter-spacing:2px}
.sec{max-width:1080px;margin:0 auto;padding:2.5rem 1.5rem}
.sec h2{font-size:clamp(1.4rem,3.4vw,2rem);font-weight:800;letter-spacing:-.02em;margin:0 0 1rem}
.chips{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.5rem}.chips li{border:1px solid var(--line);border-radius:999px;padding:.4rem .85rem;font-size:.9rem}
.checks{list-style:none;margin:0;padding:0;display:grid;gap:.5rem}.checks li::before{content:"✓ ";color:var(--brand);font-weight:700}
.reviews{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
blockquote{margin:0;border:1px solid var(--line);border-radius:12px;padding:1rem 1.25rem}blockquote footer{color:var(--muted);font-size:.85rem;margin-top:.5rem}
details{border:1px solid var(--line);border-radius:10px;padding:.75rem 1rem;margin-bottom:.5rem}summary{font-weight:700;cursor:pointer}
.hours{list-style:none;margin:0;padding:0;line-height:1.9}
dl{margin:0}dd{margin:0 0 .35rem}
.oz-photo-note{border:1px dashed color-mix(in srgb,var(--brand) 45%,var(--line));background:color-mix(in srgb,var(--brand) 5%,#fff);border-radius:12px;padding:1rem 1.25rem;color:var(--muted);font-size:.95rem}
.site-footer{border-top:1px solid var(--line);background:color-mix(in srgb,var(--brand) 5%,#fff);margin-top:1rem}
.site-footer .wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:2rem;padding-top:2.5rem;padding-bottom:2rem}
.site-footer .word{font-size:1.1rem}.site-footer .muted{color:var(--muted)}.site-footer .col{display:grid;gap:.4rem;align-content:start}.site-footer .col a{color:#3a473f;text-decoration:none;font-size:.9rem}
.site-footer .bar{border-top:1px solid var(--line)}
.site-footer .bar{max-width:1080px;margin:0 auto;padding:1rem 1.5rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem;font-size:.78rem;color:var(--muted)}
`;
}

function readme(input: ExportSiteInput, fileMap: Map<string, string>): string {
  const files = input.pages
    .map((p) => `  - ${fileMap.get(p.slug) ?? fileNameForSlug(p.slug)}${p.slug ? "" : "  (home page)"}`)
    .join("\n");
  return `${input.business.name} — website export (made with Ozvor)
====================================================================

WHAT'S IN THIS FOLDER
  - styles.css        one stylesheet for the whole site
  - index.html        your home page
${files}
  - README.txt        this file

HOW TO PUBLISH IT
  This is a plain static website — no build step, no server code.
  1. Upload the WHOLE folder to any static host (Netlify, Vercel, Cloudflare
     Pages, GitHub Pages) or your own hosting (cPanel / public_html).
  2. Point your domain at it. index.html is the home page.
  You can open index.html in a browser right now to preview it locally.

ABOUT THE PHOTOS  (please read)
  Google Maps photos are NOT included in this download. Google's policy does
  not allow redistributing those photo files on another website. Wherever a
  photo would go, you'll see a "Add your own photos here" note — drop in your
  own images and update that section. Everything else (your text, reviews,
  address, hours) is included.

  Your live Ozvor site keeps showing the Google photos automatically.

Questions? https://ozvor.com
`;
}

// ---------------------------------------------------------------------------
// buildLandingExport — the single entry point.
// ---------------------------------------------------------------------------

const DEFAULT_BRAND = "#9aa7b0";

export function buildLandingExport(input: ExportSiteInput): ExportFile[] {
  const primary = normalizeHex(input.themePrimary) ?? DEFAULT_BRAND;
  const onBrand = contrastText(primary);
  const lang = (input.lang && /^[a-zA-Z-]{2,10}$/.test(input.lang) ? input.lang : "en").toLowerCase();
  const year =
    typeof input.year === "number" && input.year >= 2000 && input.year <= 9999
      ? Math.floor(input.year)
      : new Date().getFullYear();

  // Build the slug→filename map ONCE so filenames and every href agree, and so
  // two slugs that normalize to the same token can't overwrite each other in
  // the zip. Reserved names (styles.css/README.txt) are never reused.
  const reserved = new Set(["styles.css", "readme.txt"]);
  const used = new Set(reserved);
  const fileMap = new Map<string, string>();
  for (const page of input.pages) {
    const norm = safeSlug(page.slug);
    let base = norm ? `${norm}.html` : "index.html";
    let name = base;
    let i = 2;
    while (used.has(name.toLowerCase())) {
      name = norm ? `${norm}-${i}.html` : `index-${i}.html`;
      i++;
    }
    used.add(name.toLowerCase());
    fileMap.set(page.slug, name);
  }
  const resolveHref: HrefResolver = (slug) => {
    const key = String(slug ?? "");
    const mapped = fileMap.get(key);
    if (mapped) return mapped;
    const norm = safeSlug(key);
    return norm ? `${norm}.html` : "index.html";
  };

  const files: ExportFile[] = [
    { path: "styles.css", content: stylesCss(primary, onBrand) },
    { path: "README.txt", content: readme(input, fileMap) },
  ];
  for (const page of input.pages) {
    files.push({
      path: fileMap.get(page.slug) ?? fileNameForSlug(page.slug),
      content: pageHtml({ ...input, themePrimary: primary }, page, resolveHref, lang, year),
    });
  }
  return files;
}
