// md-to-pdf.mjs — zero-dependency Markdown → branded HTML → PDF for Ozvor.
//
// Renders a markdown deliverable into a premium, on-brand A4 PDF (dark Ozvor
// cover + monochrome O-ring mark + auto table-of-contents + styled headings/
// callouts/tables) using a self-contained Markdown parser and Chrome headless.
//
// Usage:
//   node scripts/md-to-pdf.mjs <input.md> <output.pdf> \
//     --title "..." --subtitle "..." --kicker "..." --badge "..." \
//     [--toc] [--breakSections] [--htmlOut path.html]
//
// Brand palette mirrors apps/web/src/styles/tokens.css (Ozvor light/print theme).
// Self-serve products use EMERALD; gold is reserved for OrganicPosts.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------- arg parsing ----------
const argv = process.argv.slice(2);
const positional = [];
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { opt[key] = true; }
    else { opt[key] = next; i++; }
  } else positional.push(a);
}
const [input, output] = positional;
if (!input || !output) {
  console.error("usage: node scripts/md-to-pdf.mjs <input.md> <output.pdf> --title ... [--subtitle ...] [--kicker ...] [--badge ...] [--toc] [--breakSections]");
  process.exit(1);
}

// ---------- inline markdown ----------
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(text) {
  let t = esc(text);
  // inline code
  t = t.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  // links [text](url)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, txt, url) => `<a href="${url}">${txt}</a>`);
  // bold **text** or __text__
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // italic *text* or _text_  (after bold so ** is consumed)
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  return t;
}

// ---------- block parser ----------
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

function renderBody(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const toc = [];
  let i = 0;
  let firstH1Dropped = !!opt.title; // drop body's first H1 if a cover title is set

  while (i < lines.length) {
    let line = lines[i];

    // blank
    if (/^\s*$/.test(line)) { i++; continue; }

    // horizontal rule
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) { out.push('<hr/>'); i++; continue; }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const txt = h[2].replace(/\s*#+\s*$/, "");
      if (level === 1 && firstH1Dropped) { firstH1Dropped = false; i++; continue; }
      // When we auto-generate a TOC (--toc), skip any author-written
      // "Contents"/"Table of Contents" section (heading + its following block
      // up to the next heading) so the document doesn't carry two TOCs.
      if (opt.toc && level <= 3 && /^(table of\s+)?contents$/i.test(txt.trim())) {
        i++;
        while (i < lines.length && !/^(#{1,6})\s/.test(lines[i])) i++;
        continue;
      }
      const id = slugify(txt);
      if (level === 2) toc.push({ id, txt });
      const cls = level === 2 ? ' class="h2"' : "";
      out.push(`<h${level} id="${id}"${cls}>${inline(txt)}</h${level}>`);
      i++; continue;
    }

    // table: header row then separator row of ---|---
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const parseRow = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = parseRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(parseRow(lines[i])); i++; }
      let tbl = '<table><thead><tr>' + header.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>";
      for (const r of rows) tbl += "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
      tbl += "</tbody></table>";
      out.push(tbl);
      continue;
    }

    // blockquote (callout) — consecutive > lines
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(`<blockquote>${inline(buf.join(" ").trim())}</blockquote>`);
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      out.push("<ul>" + buf.map((it) => `<li>${inline(it)}</li>`).join("") + "</ul>");
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      out.push("<ol>" + buf.map((it) => `<li>${inline(it)}</li>`).join("") + "</ol>");
      continue;
    }

    // paragraph (gather until blank / block start)
    const buf = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) &&
           !/^(#{1,6})\s/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^\s*\d+\.\s+/.test(lines[i]) && !/^\s*>\s?/.test(lines[i]) &&
           !/^\s*\|/.test(lines[i]) && !/^\s*([-*_])\1\1+\s*$/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return { html: out.join("\n"), toc };
}

// ---------- template ----------
const md = readFileSync(input, "utf8");
const { html, toc } = renderBody(md);
const title = opt.title || "Ozvor";
const subtitle = opt.subtitle || "";
const kicker = opt.kicker || "Ozvor";
const badge = opt.badge || "";
const breakSections = !!opt.breakSections;
const showToc = !!opt.toc;

const tocHtml = showToc && toc.length
  ? `<section class="toc"><h2 class="toc-h">Contents</h2><ol>${toc.map((t) => `<li><a href="#${t.id}">${esc(t.txt)}</a></li>`).join("")}</ol></section>`
  : "";

// Ozvor monochrome O-ring mark — same dasharray geometry as
// apps/web/src/components/brand/Logo.tsx, scaled into a 32×32 viewBox.
const ozvorMark = `<svg width="34" height="34" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(-84 16 16)"><circle cx="16" cy="16" r="10.5" fill="none" stroke="#27c98a" stroke-width="3" stroke-dasharray="18.85 3.13" stroke-linecap="round"/></g><circle cx="16" cy="16" r="2.4" fill="#27c98a"/></svg>`;

const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
  :root{ --primary:#0c7d54; --bright:#27c98a; --dark:#0a0f0d; --cream:#f6f3ea; --border:#e3decf;
    --muted:#6b6f68; --text:#14201a; --gold:#b8851f; --badge:#e7f6ef; }
  @page{ size:A4; margin:18mm 16mm; }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html,body{ margin:0; padding:0; color:var(--text);
    font-family:"Schibsted Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
    font-size:10.5pt; line-height:1.62; }
  a{ color:var(--primary); text-decoration:none; }
  code{ font-family:"JetBrains Mono","SFMono-Regular",Menlo,Consolas,monospace; font-size:9pt;
    background:var(--cream); padding:1px 5px; border-radius:4px; }
  /* cover */
  .cover{ page-break-after:always; min-height:248mm; display:flex; flex-direction:column;
    justify-content:space-between; padding:26mm 18mm; background:var(--dark); color:#f4f7f5;
    margin:-18mm -16mm 0; }
  .brand{ display:flex; align-items:center; gap:11px; }
  .brand svg{ display:block; flex-shrink:0; }
  .brand .word{ font-size:21px; font-weight:700; letter-spacing:-0.02em; color:#f4f7f5; }
  .cover .kicker{ color:#27c98a; font-weight:800; text-transform:uppercase; letter-spacing:.14em; font-size:11pt; margin-bottom:16px; }
  .cover h1{ font-size:34pt; font-weight:800; line-height:1.04; margin:0 0 16px; letter-spacing:-.015em; }
  .cover .sub{ font-size:13.5pt; color:#c8d2cb; max-width:130mm; line-height:1.5; }
  .cover .badge{ display:inline-block; margin-top:24px; background:linear-gradient(135deg,#27c98a,#0c7d54); color:#06140e;
    font-weight:800; padding:8px 16px; border-radius:999px; font-size:11pt; }
  .cover .foot{ display:flex; justify-content:space-between; align-items:flex-end; font-size:9pt;
    color:#9fb0a4; border-top:1px solid rgba(39,201,138,.28); padding-top:14px; }
  /* toc */
  .toc{ page-break-after:always; padding-top:6mm; }
  .toc-h{ font-size:18pt; font-weight:800; margin:0 0 12px; }
  .toc ol{ list-style:none; padding:0; margin:0; counter-reset:toc; }
  .toc li{ counter-increment:toc; padding:7px 0; border-bottom:1px solid var(--border); font-weight:600; font-size:11pt; }
  .toc li::before{ content:counter(toc) ".  "; color:var(--primary); font-weight:800; }
  .toc a{ color:var(--text); }
  /* body */
  h1{ font-size:22pt; font-weight:800; letter-spacing:-.01em; margin:18px 0 8px; }
  h2.h2{ font-size:16.5pt; font-weight:800; margin:22px 0 8px; padding-top:6px;
    color:var(--text); border-top:2px solid var(--bright); ${breakSections ? "page-break-before:always;" : ""} }
  h3{ font-size:12.5pt; font-weight:800; margin:16px 0 6px; color:var(--text); }
  h4{ font-size:11pt; font-weight:800; margin:12px 0 4px; color:var(--muted); }
  p{ margin:0 0 9px; text-align:justify; -webkit-hyphens:auto; hyphens:auto; }
  li{ -webkit-hyphens:auto; hyphens:auto; }
  blockquote{ text-align:left; } /* callouts read better left-aligned */
  strong{ font-weight:700; }
  ul,ol{ margin:0 0 10px; padding-left:20px; }
  li{ margin-bottom:4px; }
  hr{ border:none; border-top:1px solid var(--border); margin:16px 0; }
  blockquote{ margin:10px 0; padding:11px 16px; border-left:4px solid var(--bright);
    background:var(--cream); border-radius:0 6px 6px 0; font-weight:600; font-size:10.5pt;
    page-break-inside:avoid; }
  table{ width:100%; border-collapse:collapse; margin:12px 0; font-size:9.2pt; page-break-inside:avoid; }
  th{ background:var(--dark); color:#f4f7f5; text-align:left; padding:7px 9px; font-weight:700; }
  td{ padding:6px 9px; border-bottom:1px solid var(--border); vertical-align:top; }
  tbody tr:nth-child(even){ background:var(--cream); }
  h1,h2,h3,h4{ page-break-after:avoid; }
</style></head><body>
<section class="cover">
  <div class="brand">${ozvorMark}<span class="word">Ozvor</span></div>
  <div>
    ${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ""}
    <h1>${esc(title)}</h1>
    ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ""}
    ${badge ? `<div class="badge">${esc(badge)}</div>` : ""}
  </div>
  <div class="foot"><span>ozvor.com · Know if AI trusts your brand</span><span>${new Date().getFullYear()}</span></div>
</section>
${tocHtml}
<main>
${html}
</main>
</body></html>`;

const htmlPath = opt.htmlOut || join(tmpdir(), `ozvor-${slugify(title)}-${Date.now()}.html`);
writeFileSync(htmlPath, doc);

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Use the LEGACY headless mode: the new (Chrome 112+) headless has known
// --print-to-pdf pagination bugs that intermittently collapse a multi-page
// document with forced page-breaks onto a single page. Old headless paginates
// reliably. --virtual-time-budget lets the @import webfonts load before print.
execFileSync(CHROME, [
  "--headless=old", "--disable-gpu", "--no-pdf-header-footer",
  "--virtual-time-budget=8000",
  `--print-to-pdf=${output}`, `file://${htmlPath}`,
], { stdio: "ignore" });

console.log(`✓ ${output}  (from ${input}; ~${md.split(/\s+/).length} words)`);
