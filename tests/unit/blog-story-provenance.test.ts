/**
 * blog-story-provenance.test.ts — R05-a: a composite is never published as a
 * documented case (2026-09-16).
 *
 * The Monday auto-publish shipped "The Orchard ChatGPT Sent Customers to on
 * the Wrong Day" (#619) and "The Small-Engine Shop ChatGPT Named, Then Almost
 * Lost" (#597): each narrates a named business as a documented case, sourced
 * only by generic links about local search. The pipeline's own rule is "a real
 * story, a real person... NEVER a number without a named source" — and it had
 * no way to tell a real case from a composite.
 *
 * What these tests hold, by running the real ingest script against a temp copy
 * of the site's blog files (BLOG_INGEST_DIR):
 *   1. an article without `story` is rejected;
 *   2. a "real" story without a URL documenting the case is rejected;
 *   3. an "illustrative" story is accepted and the page's FIRST paragraph is
 *      the illustrative label;
 *   4. a "real" story with a URL is accepted, unlabelled, and the case URL is
 *      present in the article's sources;
 *   5. the generator's contract asks the model for the field and states the
 *      rule.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const BLOG_DIR = join(root, "apps/web/src/app/(marketing)/blog");
const SCRIPT = join(root, "scripts/blog-ingest.mjs");

const LABEL =
  "Illustrative example: the business and people in this story are a composite built from public patterns, not a documented case.";

function article(over: Record<string, unknown> = {}) {
  const para = "This is a plain paragraph with sentences of twelve words or fewer. It stays concrete and short.";
  return {
    slug: `provenance-fixture-${Date.now()}`,
    title: "A fixture article for the provenance gate",
    dek: "One sentence sub headline for the fixture.",
    category: "Local & SMB",
    excerpt: "One sentence index blurb for the fixture.",
    readTime: "4 min read",
    keywords: ["fixture", "provenance", "geo"],
    takeaways: ["Label composites.", "Cite real cases."],
    body_markdown: [para, "## Why does this matter?", para, para, para].join("\n\n"),
    sources: ['Google, "AI features and your website" (2026), https://developers.google.com/search/docs/appearance/ai-features'],
    ...over,
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "blog-ingest-"));
  copyFileSync(join(BLOG_DIR, "_content.ts"), join(dir, "_content.ts"));
  copyFileSync(join(BLOG_DIR, "posts.ts"), join(dir, "posts.ts"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function ingest(art: Record<string, unknown>) {
  const file = join(dir, "article.json");
  writeFileSync(file, JSON.stringify(art));
  const res = spawnSync(process.execPath, [SCRIPT, file], {
    encoding: "utf8",
    env: { ...process.env, BLOG_INGEST_DIR: dir },
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, content: readFileSync(join(dir, "_content.ts"), "utf8") };
}

describe("the ingest gate on story provenance", () => {
  it("rejects an article without a story object", () => {
    const r = ingest(article());
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("BLOG-INGEST REJECTED");
    expect(r.stderr).toContain("story");
  });

  it('rejects a "real" story that has no URL documenting the case', () => {
    const r = ingest(article({ story: { kind: "real", source: null } }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("story.source is not a URL documenting the specific case");
  });

  it("rejects an unknown kind", () => {
    const r = ingest(article({ story: { kind: "true story", source: null } }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('story.kind must be "real" or "illustrative"');
  });

  it('publishes an "illustrative" story with the label as the FIRST paragraph', () => {
    const art = article({ story: { kind: "illustrative", source: null } });
    const r = ingest(art);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(art.slug);
    const entry = r.content.slice(r.content.indexOf(`slug: ${JSON.stringify(art.slug)}`));
    const firstBlock = entry.slice(entry.indexOf("body: ["));
    expect(firstBlock.indexOf(JSON.stringify(LABEL))).toBeGreaterThan(-1);
    expect(firstBlock.indexOf(JSON.stringify(LABEL))).toBeLessThan(firstBlock.indexOf("Why does this matter?"));
  });

  it('publishes a "real" story unlabelled and carries the case URL in the sources', () => {
    const caseUrl = "https://example.com/news/the-actual-case";
    const art = article({ story: { kind: "real", source: caseUrl } });
    const r = ingest(art);
    expect(r.status).toBe(0);
    const entry = r.content.slice(r.content.indexOf(`slug: ${JSON.stringify(art.slug)}`));
    expect(entry).not.toContain(LABEL);
    expect(entry).toContain(caseUrl);
  });
});

describe("the generator asks for it", () => {
  const gen = read("scripts/blog-generate.py");
  it("story is a required key of the article JSON", () => {
    expect(gen).toMatch(/REQUIRED_KEYS = \[.*"story"\]/);
    // The prompt is a Python string literal, so the quotes are escaped in the source.
    expect(gen).toContain('\\"story\\":{\\"kind\\":\\"real or illustrative\\"');
  });
  it("the prompt states the rule: real needs a documenting URL, otherwise illustrative and labelled", () => {
    expect(gen).toContain("STORY PROVENANCE (R05, hard)");
    expect(gen).toContain("Presenting a composite as a documented case is the one thing this pipeline must ");
  });
});
