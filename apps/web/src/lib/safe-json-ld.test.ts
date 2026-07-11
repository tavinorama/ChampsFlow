/**
 * Unit tests for safe-json-ld.ts pure helpers (Hermes QA Audit V2, #238).
 * No snapshot tests. Only pure functions tested here (same convention as
 * app/(marketing)/landing-v2-logic.test.ts).
 */

import { describe, it, expect } from "vitest";
import { safeJsonLd, safeHref } from "./safe-json-ld";

describe("safeJsonLd", () => {
  it("escapes a </script><script> break-out payload into an inert string", () => {
    const payload = { name: "</script><script>alert(1)</script>" };
    const out = safeJsonLd(payload);

    // No raw HTML-significant characters survive — a browser HTML parser
    // scanning for the closing </script> tag inside a <script> element
    // finds nothing to latch onto.
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
  });

  it("round-trips to the exact same object via JSON.parse", () => {
    const payload = { name: "</script><script>alert(1)</script>", n: 1, ok: true };
    const out = safeJsonLd(payload);
    expect(JSON.parse(out)).toEqual(payload);
  });

  it("escapes <, >, and & individually", () => {
    const out = safeJsonLd({ a: "<b> & <c>" });
    expect(out).toBe(String.raw`{"a":"\u003cb\u003e \u0026 \u003cc\u003e"}`);
    expect(JSON.parse(out)).toEqual({ a: "<b> & <c>" });
  });

  it("escapes U+2028/U+2029 line/paragraph separators (JS-context safety)", () => {
    const out = safeJsonLd({ a: "line break here" });
    expect(out).not.toContain(" ");
    expect(out).not.toContain(" ");
    expect(JSON.parse(out)).toEqual({ a: "line break here" });
  });

  it("handles nested objects/arrays with mixed dangerous content", () => {
    const payload = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is <b>this</b> safe & sound?",
          acceptedAnswer: { "@type": "Answer", text: "</script><img src=x onerror=alert(1)>" },
        },
      ],
    };
    const out = safeJsonLd(payload);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&");
    expect(JSON.parse(out)).toEqual(payload);
  });
});

describe("safeHref", () => {
  it("accepts a plain https URL unchanged", () => {
    expect(safeHref("https://example.com/page")).toBe("https://example.com/page");
  });

  it("prefixes a bare domain with https://", () => {
    expect(safeHref("example.com")).toBe("https://example.com/");
  });

  it("rejects javascript: URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
  });

  it("rejects data: URLs", () => {
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects protocol-relative //evil URLs by resolving and validating the host", () => {
    // //evil resolves to https://evil which has no dot in hostname → rejected
    expect(safeHref("//evil")).toBeNull();
  });

  it("accepts a protocol-relative URL with a valid dotted host", () => {
    expect(safeHref("//example.com/path")).toBe("https://example.com/path");
  });

  it("returns null for non-string input", () => {
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(42)).toBeNull();
  });

  it("returns null for an empty/whitespace string", () => {
    expect(safeHref("   ")).toBeNull();
  });
});
