#!/usr/bin/env node
/**
 * blog-ingest.mjs — turn one generated article (JSON) into a published blog post.
 *
 * The Monday auto-publish Action calls the VPS to WRITE a complete article as
 * JSON, then pipes it here. This script is the gate between "a model wrote
 * something" and "it is live on ozvor.com/blog": it validates hard, and only
 * on a clean article does it inject one entry into _content.ts (the rendered
 * body) and one into posts.ts (the index registry). A bad article exits
 * non-zero and NOTHING is written — the Action fails loudly instead of
 * publishing garbage.
 *
 * Usage:  node scripts/blog-ingest.mjs <article.json>
 * On success prints the slug on stdout (the Action reads it to build the URL).
 *
 * Article JSON contract (all fields required unless noted):
 *   slug          kebab-case, unique, ^[a-z0-9][a-z0-9-]{6,80}$
 *   title         string
 *   dek           string (sub-headline)
 *   category      one of CATEGORIES below
 *   excerpt       string (index card blurb)
 *   readTime      e.g. "3 min read"
 *   keywords      string[] (>=2)
 *   takeaways     string[] (2..5)
 *   body_markdown string — paragraphs separated by blank lines; "## " headings
 *   sources       string[] (>=1) — "Name, \"Title\" (date), url"
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.join(HERE, "..", "apps", "web", "src", "app", "(marketing)", "blog");
const CONTENT = path.join(BLOG_DIR, "_content.ts");
const POSTS = path.join(BLOG_DIR, "posts.ts");

// Kept in sync with the categories already used in _content.ts. A new category
// is a deliberate human choice, not something an auto-writer invents.
const CATEGORIES = new Set([
  "GEO 101", "GEO Playbook", "How AI Works", "Local & SMB", "Measurement",
  "Playbook", "Research", "Reviews & Trust", "Strategy", "Technical GEO",
]);

function die(msg) {
  console.error("BLOG-INGEST REJECTED: " + msg);
  process.exit(1);
}

function hasDash(s) {
  // The house rule: no em-dash or en-dash anywhere in human-facing copy.
  return typeof s === "string" && (s.includes("—") || s.includes("–"));
}

// ---- read + parse -----------------------------------------------------------
const file = process.argv[2];
if (!file) die("no article file given (usage: blog-ingest.mjs <article.json>)");
let art;
try {
  art = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (e) {
  die("article is not valid JSON: " + e.message);
}

// ---- validate ---------------------------------------------------------------
const need = ["slug", "title", "dek", "category", "excerpt", "readTime", "keywords", "takeaways", "body_markdown", "sources"];
for (const k of need) {
  if (art[k] === undefined || art[k] === null || (typeof art[k] === "string" && !art[k].trim())) {
    die(`missing or empty field: ${k}`);
  }
}
if (!/^[a-z0-9][a-z0-9-]{6,80}$/.test(art.slug)) die(`slug not url-safe / wrong length: ${art.slug}`);
if (!CATEGORIES.has(art.category)) die(`category not in the allowed list: ${art.category}`);
if (!Array.isArray(art.keywords) || art.keywords.length < 2) die("keywords must be an array of >= 2");
if (!Array.isArray(art.takeaways) || art.takeaways.length < 2 || art.takeaways.length > 5) die("takeaways must be 2..5 items");
if (!Array.isArray(art.sources) || art.sources.length < 1) die("at least one source is required");
if (!art.sources.every((s) => typeof s === "string" && /https?:\/\//.test(s))) die("every source must contain a URL");

const dashScan = [art.title, art.dek, art.excerpt, art.body_markdown, ...art.takeaways, ...art.sources];
for (const s of dashScan) if (hasDash(s)) die("em-dash or en-dash found (house rule: none allowed)");

// dedup against what is already published
const contentSrc = fs.readFileSync(CONTENT, "utf8");
const postsSrc = fs.readFileSync(POSTS, "utf8");
if (contentSrc.includes(`slug: "${art.slug}"`) || postsSrc.includes(`slug: "${art.slug}"`)) {
  die(`slug already exists on the site: ${art.slug}`);
}

// ---- markdown body -> structured blocks ------------------------------------
const paras = String(art.body_markdown).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
if (paras.length < 3) die("body has fewer than 3 paragraphs; too thin to publish");

const slugifyHeading = (t) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "section";

const blocks = [];
let h2count = 0;
for (const p of paras) {
  if (p.startsWith("## ")) {
    const text = p.slice(3).trim();
    blocks.push({ t: "h2", id: slugifyHeading(text), text });
    h2count++;
  } else if (p.startsWith("### ")) {
    blocks.push({ t: "h3", text: p.slice(4).trim() });
  } else {
    blocks.push({ t: "p", text: p.replace(/\n/g, " ") });
  }
}
if (h2count < 1) die("body must have at least one '## ' section heading");

// ---- render TS entries ------------------------------------------------------
const j = (v) => JSON.stringify(v); // JS string/array literal, safe for TS source

const bodyTs = blocks
  .map((b) =>
    b.t === "h2"
      ? `      { t: "h2", id: ${j(b.id)}, text: ${j(b.text)} }`
      : b.t === "h3"
        ? `      { t: "h3", text: ${j(b.text)} }`
        : `      { t: "p", text: ${j(b.text)} }`,
  )
  .join(",\n");

const contentEntry =
  `  {
    slug: ${j(art.slug)},
    title: ${j(art.title)},
    dek: ${j(art.dek)},
    category: ${j(art.category)},
    datePublished: ${j(art.datePublished || todayISO())},
    dateDisplay: ${j(art.dateDisplay || todayDisplay())},
    readTime: ${j(art.readTime)},
    keywords: ${j(art.keywords)},
    takeaways: ${j(art.takeaways)},
    body: [
${bodyTs},
    ],
    sources: ${j(art.sources)},
  },
`;

const postEntry =
  `  {
    type: "article",
    slug: ${j(art.slug)},
    title: ${j(art.title)},
    excerpt: ${j(art.excerpt)},
    readTime: ${j(art.readTime)},
    publishedAt: ${j(art.datePublished || todayISO())},
    publishedAtDisplay: ${j(art.dateDisplay || todayDisplay())},
  },
`;

// ---- inject -----------------------------------------------------------------
const CONTENT_ANCHOR = "export const BLOG_CONTENT: BlogContent[] = [\n";
if (!contentSrc.includes(CONTENT_ANCHOR)) die("could not find BLOG_CONTENT anchor in _content.ts");
fs.writeFileSync(CONTENT, contentSrc.replace(CONTENT_ANCHOR, CONTENT_ANCHOR + contentEntry));

// Line-anchored (the "── Articles ──" rule has a variable dash run; the
// "GEO series" comment line right under it is stable). Insert the new post
// immediately after that comment so it lands at the top of the article list.
const postsLines = postsSrc.split("\n");
const anchorIdx = postsLines.findIndex((l) => l.includes("// GEO series") && l.includes("[slug] route"));
if (anchorIdx < 0) die("could not find the 'GEO series' anchor line in posts.ts");
postsLines.splice(anchorIdx + 1, 0, postEntry.replace(/\n$/, ""));
fs.writeFileSync(POSTS, postsLines.join("\n"));

console.log(art.slug);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function todayDisplay() {
  const d = new Date();
  return `${d.getUTCDate()} ${d.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}
