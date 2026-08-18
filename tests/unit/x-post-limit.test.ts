/**
 * X (Twitter) post length limit — the pure helpers behind the sphere-x fix.
 *
 * Prod failure 17/08 14:50: the sphere-x publish node handed Postiz an
 * over-limit post; Postiz rejected it ("post is too long, please fix it") and
 * the whole run was wasted. These tests pin the contract of the helpers that
 * now (a) trim the finalized post at adapt time and (b) back the publish guard's
 * refuse-to-send decision. The runner-level guard + adapt wiring is proven in
 * graph-runner.test.ts, on the real graph, reusing that harness.
 */

import { describe, it, expect } from "vitest";
import {
  X_POST_LIMIT,
  xPostWithinLimit,
  truncateForX,
  adaptXForPublish,
  splitXSegments,
} from "../../packages/shared/src/x-post-limit";

const len = (s: string) => [...s].length;

describe("X_POST_LIMIT", () => {
  it("is the hard 280-char single-post default", () => {
    expect(X_POST_LIMIT).toBe(280);
  });
});

describe("xPostWithinLimit", () => {
  it("passes a post at or under the limit", () => {
    expect(xPostWithinLimit("short and sweet")).toBe(true);
    expect(xPostWithinLimit("x".repeat(280))).toBe(true);
  });

  it("rejects a single post over the limit — the guard's decision", () => {
    expect(xPostWithinLimit("x".repeat(281))).toBe(false);
  });

  it("counts an emoji as ONE character (code point, not UTF-16 units)", () => {
    // 279 emoji = 279 code points, within limit even though it is 558 UTF-16 units.
    expect(xPostWithinLimit("😀".repeat(279))).toBe(true);
    expect(xPostWithinLimit("😀".repeat(281))).toBe(false);
  });

  it("applies the limit PER TWEET in a mini-thread", () => {
    const ok = ["a".repeat(200), "b".repeat(200), "c".repeat(200)].join("\n---\n");
    expect(xPostWithinLimit(ok)).toBe(true);
    // One over-limit segment fails the whole thread.
    const bad = ["a".repeat(200), "b".repeat(281), "c".repeat(200)].join("\n---\n");
    expect(xPostWithinLimit(bad)).toBe(false);
  });

  it("treats empty/whitespace as within limit (nothing over-limit to send)", () => {
    expect(xPostWithinLimit("")).toBe(true);
    expect(xPostWithinLimit("   \n  ")).toBe(true);
  });
});

describe("truncateForX", () => {
  it("returns a within-limit post untouched (no ellipsis added)", () => {
    const post = "This one already fits inside the budget.";
    expect(truncateForX(post)).toBe(post);
    expect(truncateForX(post)).not.toContain("…");
  });

  it("truncates an over-limit post on a WORD boundary and stays <= limit", () => {
    const words = ("word ".repeat(100)).trim(); // 500 chars, plenty of boundaries
    const out = truncateForX(words);
    expect(len(out)).toBeLessThanOrEqual(X_POST_LIMIT);
    // Cut on a boundary: no partial "wor" at the end, and it ends with the ellipsis.
    expect(out.endsWith("…")).toBe(true);
    const body = out.slice(0, -1).trimEnd();
    expect(body.split(/\s+/).every((w) => w === "word")).toBe(true);
  });

  it("appends the ellipsis ONLY when it actually cut", () => {
    expect(truncateForX("x".repeat(280))).not.toContain("…");
    expect(truncateForX("x".repeat(281))).toContain("…");
  });

  it("honors a custom (higher) limit when one is passed", () => {
    const post = "y".repeat(400);
    expect(truncateForX(post, 500)).toBe(post); // within the higher budget
    expect(len(truncateForX(post, 300))).toBeLessThanOrEqual(300);
  });

  it("falls back to a hard slice for one gigantic unbroken token", () => {
    const monster = "z".repeat(1000); // no whitespace to break on
    const out = truncateForX(monster);
    expect(len(out)).toBeLessThanOrEqual(X_POST_LIMIT);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeGreaterThan(1); // not an empty string + ellipsis
  });
});

describe("splitXSegments + adaptXForPublish", () => {
  it("splits a mini-thread on lone '---' lines and drops empties", () => {
    expect(splitXSegments("one\n---\ntwo\n---\nthree")).toEqual(["one", "two", "three"]);
    expect(splitXSegments("just one post")).toEqual(["just one post"]);
  });

  it("makes an over-limit single post publish-safe", () => {
    const out = adaptXForPublish("word ".repeat(100));
    expect(xPostWithinLimit(out)).toBe(true);
  });

  it("trims EACH tweet of a thread and keeps the '---' separators", () => {
    const thread = ["a".repeat(200), "word ".repeat(100), "c".repeat(200)].join("\n---\n");
    const out = adaptXForPublish(thread);
    expect(xPostWithinLimit(out)).toBe(true);
    expect(splitXSegments(out)).toHaveLength(3);
  });

  it("is idempotent on already-compliant content", () => {
    const compliant = ["First tweet.", "Second tweet."].join("\n---\n");
    expect(adaptXForPublish(adaptXForPublish(compliant))).toBe(adaptXForPublish(compliant));
    expect(xPostWithinLimit(adaptXForPublish(compliant))).toBe(true);
  });
});
