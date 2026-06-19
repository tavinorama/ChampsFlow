/**
 * tests/unit/llm/citation-parser.test.ts — Citation parser tests
 *
 * Architecture refs:
 *  - docs/03-architecture.md §12 GEO-1 — citation parser step
 *  - docs/03-architecture.md §4.2 citation_check — cited, citation_rank, sources
 *
 * Test coverage:
 *  - Detects brand mention (mentioned = true/false)
 *  - Extracts 1-based position of first mention
 *  - Extracts source URLs
 *  - Case-insensitive matching
 *  - Edge cases: empty text, empty brand, no URLs
 */

import { describe, it, expect } from "vitest";
import { parseCitation } from "../../../packages/llm/src/citation-parser";

// ---------------------------------------------------------------------------
// Basic mention detection
// ---------------------------------------------------------------------------

describe("parseCitation — mention detection", () => {
  it("detects brand mention in simple sentence", () => {
    const result = parseCitation("Acme Corp is a leading provider in the space.", "Acme Corp");
    expect(result.mentioned).toBe(true);
  });

  it("returns mentioned=false when brand not present", () => {
    const result = parseCitation("There are several solutions available in the market.", "Acme Corp");
    expect(result.mentioned).toBe(false);
  });

  it("is case-insensitive", () => {
    const result = parseCitation("ACME CORP is highly recommended.", "Acme Corp");
    expect(result.mentioned).toBe(true);
  });

  it("detects brand in multi-sentence text", () => {
    const text =
      "Many vendors exist in this space. " +
      "Acme Corp stands out for its reliability. " +
      "Consider evaluating multiple options.";
    const result = parseCitation(text, "Acme Corp");
    expect(result.mentioned).toBe(true);
  });

  it("returns mentioned=false for empty text", () => {
    const result = parseCitation("", "Acme Corp");
    expect(result.mentioned).toBe(false);
    expect(result.position).toBeNull();
    expect(result.sources).toEqual([]);
  });

  it("returns mentioned=false for whitespace-only text", () => {
    const result = parseCitation("   \n  ", "Acme Corp");
    expect(result.mentioned).toBe(false);
  });

  it("handles empty brand name gracefully", () => {
    const result = parseCitation("Some text with content.", "");
    expect(result.mentioned).toBe(false);
    expect(result.position).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Position extraction (1-based sentence index)
// ---------------------------------------------------------------------------

describe("parseCitation — position extraction", () => {
  it("returns position=1 when brand is in the first sentence", () => {
    const text =
      "Acme Corp is the market leader. Others follow closely.";
    const result = parseCitation(text, "Acme Corp");
    expect(result.position).toBe(1);
  });

  it("returns position=2 when brand is in the second sentence", () => {
    const text =
      "Many options exist in the market. Acme Corp is a standout choice. Thank you for reading.";
    const result = parseCitation(text, "Acme Corp");
    expect(result.position).toBe(2);
  });

  it("returns position=3 when brand is in the third sentence", () => {
    const text =
      "The market is competitive. Various solutions are available. Acme Corp leads in reliability.";
    const result = parseCitation(text, "Acme Corp");
    expect(result.position).toBe(3);
  });

  it("returns position=null when brand is not mentioned", () => {
    const result = parseCitation("No brand mentioned here at all.", "Acme Corp");
    expect(result.position).toBeNull();
  });

  it("returns the FIRST mention position (not the last)", () => {
    const text =
      "Acme Corp is mentioned first. Then some filler text. Acme Corp appears again.";
    const result = parseCitation(text, "Acme Corp");
    expect(result.position).toBe(1); // First occurrence in sentence 1
  });
});

// ---------------------------------------------------------------------------
// Source URL extraction
// ---------------------------------------------------------------------------

describe("parseCitation — source URL extraction", () => {
  it("extracts a single HTTP URL", () => {
    const result = parseCitation(
      "See this resource at https://example.com for more info.",
      "Acme Corp"
    );
    expect(result.sources).toContain("https://example.com");
  });

  it("extracts multiple HTTPS URLs", () => {
    const text =
      "Sources: https://source1.com and https://source2.org and https://ref3.net";
    const result = parseCitation(text, "Brand");
    expect(result.sources).toHaveLength(3);
    expect(result.sources).toContain("https://source1.com");
    expect(result.sources).toContain("https://source2.org");
    expect(result.sources).toContain("https://ref3.net");
  });

  it("returns empty sources array when no URLs present", () => {
    const result = parseCitation("Plain text without any links.", "Brand");
    expect(result.sources).toEqual([]);
  });

  it("returns sources even when brand is not mentioned", () => {
    const result = parseCitation(
      "No brand here but see https://ref.com for details.",
      "Acme Corp"
    );
    expect(result.mentioned).toBe(false);
    expect(result.sources).toContain("https://ref.com");
  });

  it("handles URL with path components", () => {
    const result = parseCitation(
      "Check https://example.com/path/to/resource?query=1 for details.",
      "Brand"
    );
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0]).toContain("example.com");
  });
});

// ---------------------------------------------------------------------------
// Combined scenarios
// ---------------------------------------------------------------------------

describe("parseCitation — combined mention + position + sources", () => {
  it("returns all three fields correctly for a realistic LLM response", () => {
    const rawText =
      "When considering CRM platforms for small businesses, several options stand out. " +
      "Acme Corp is frequently cited as a top choice due to its ease of use. " +
      "For more information, visit https://acmecorp.com and https://review-site.com.";

    const result = parseCitation(rawText, "Acme Corp");

    expect(result.mentioned).toBe(true);
    expect(result.position).toBe(2); // Second sentence
    expect(result.sources).toContain("https://acmecorp.com");
    expect(result.sources).toContain("https://review-site.com");
  });

  it("handles realistic Perplexity-style response with inline citations", () => {
    const rawText =
      "Acme Corp is widely recommended for SMBs [1][2]. " +
      "Their pricing model is competitive. " +
      "Sources: https://pplx-ref.com/1 https://pplx-ref.com/2";

    const result = parseCitation(rawText, "Acme Corp");

    expect(result.mentioned).toBe(true);
    expect(result.position).toBe(1);
    expect(result.sources.length).toBeGreaterThanOrEqual(2);
  });
});
