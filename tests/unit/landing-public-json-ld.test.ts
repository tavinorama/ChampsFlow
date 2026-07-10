/**
 * Unit tests for the public Ozvor Pages JSON-LD builders (issue #208, PR-6).
 * Pure logic only — no DOM.
 */

import { describe, it, expect } from "vitest";
import {
  buildLocalBusinessJsonLd,
  buildFaqJsonLd,
  buildBreadcrumbJsonLd,
  safeJsonLd,
  safeHref,
} from "../../apps/web/src/components/landing-public/json-ld";

describe("buildLocalBusinessJsonLd", () => {
  it("builds a full LocalBusiness schema from complete business facts", () => {
    const jsonLd = buildLocalBusinessJsonLd("acme-plumbing", {
      name: "Acme Plumbing",
      address: "123 Main St, Austin, TX",
      phone: "555-0100",
      website: "https://acmeplumbing.com",
    });
    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Acme Plumbing",
      url: "https://ozvor.com/l/acme-plumbing",
      address: "123 Main St, Austin, TX",
      telephone: "555-0100",
      sameAs: ["https://acmeplumbing.com"],
    });
  });

  it("omits absent fields instead of inventing them (audit integrity rule)", () => {
    const jsonLd = buildLocalBusinessJsonLd("acme-plumbing", { name: "Acme Plumbing" });
    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Acme Plumbing",
      url: "https://ozvor.com/l/acme-plumbing",
    });
    expect(jsonLd).not.toHaveProperty("address");
    expect(jsonLd).not.toHaveProperty("telephone");
    expect(jsonLd).not.toHaveProperty("sameAs");
  });

  it("returns null when there is no business name", () => {
    expect(buildLocalBusinessJsonLd("acme", {})).toBeNull();
    expect(buildLocalBusinessJsonLd("acme", { name: "" })).toBeNull();
    expect(buildLocalBusinessJsonLd("acme", { name: "   " })).toBeNull();
  });

  it("returns null for non-object business input", () => {
    expect(buildLocalBusinessJsonLd("acme", null)).toBeNull();
    expect(buildLocalBusinessJsonLd("acme", undefined)).toBeNull();
    expect(buildLocalBusinessJsonLd("acme", "Acme")).toBeNull();
  });
});

describe("buildFaqJsonLd", () => {
  it("builds an FAQPage schema from a faq section", () => {
    const jsonLd = buildFaqJsonLd([
      { type: "hero", headline: "Acme" },
      {
        type: "faq",
        items: [
          { q: "Do you offer 24/7 service?", a: "Yes, call any time." },
          { q: "Do you serve Round Rock?", a: "Yes." },
        ],
      },
    ]);
    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Do you offer 24/7 service?",
          acceptedAnswer: { "@type": "Answer", text: "Yes, call any time." },
        },
        {
          "@type": "Question",
          name: "Do you serve Round Rock?",
          acceptedAnswer: { "@type": "Answer", text: "Yes." },
        },
      ],
    });
  });

  it("returns null when the page has no faq section", () => {
    expect(buildFaqJsonLd([{ type: "hero", headline: "Acme" }])).toBeNull();
  });

  it("returns null when the faq section has no complete q/a pairs", () => {
    expect(buildFaqJsonLd([{ type: "faq", items: [{ q: "", a: "" }] }])).toBeNull();
    expect(buildFaqJsonLd([{ type: "faq", items: [] }])).toBeNull();
  });

  it("drops incomplete q/a pairs but keeps complete ones", () => {
    const jsonLd = buildFaqJsonLd([
      { type: "faq", items: [{ q: "", a: "Answer" }, { q: "Full", a: "Pair" }] },
    ]);
    expect(jsonLd?.mainEntity).toHaveLength(1);
  });

  it("returns null for non-array sections input", () => {
    expect(buildFaqJsonLd(null)).toBeNull();
    expect(buildFaqJsonLd(undefined)).toBeNull();
    expect(buildFaqJsonLd("nope")).toBeNull();
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("builds a two-level breadcrumb (site home -> page)", () => {
    const jsonLd = buildBreadcrumbJsonLd("acme-plumbing", "Acme Plumbing", "FAQ", "faq");
    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Acme Plumbing", item: "https://ozvor.com/l/acme-plumbing" },
        { "@type": "ListItem", position: 2, name: "FAQ", item: "https://ozvor.com/l/acme-plumbing/faq" },
      ],
    });
  });

  it("falls back to the slug when the page has no title", () => {
    const jsonLd = buildBreadcrumbJsonLd("acme-plumbing", "Acme Plumbing", "", "faq");
    expect(jsonLd.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Acme Plumbing", item: "https://ozvor.com/l/acme-plumbing" },
      { "@type": "ListItem", position: 2, name: "faq", item: "https://ozvor.com/l/acme-plumbing/faq" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// safeJsonLd — HTML-script-safe serialization (Hermes review requirement, #216)
// ---------------------------------------------------------------------------

describe("safeJsonLd — script-breakout escaping", () => {
  const MALICIOUS = '</script><script>alert(1)</script>';

  it("a stored </script><script> payload never appears raw in the output", () => {
    const jsonLd = buildLocalBusinessJsonLd("acme", { name: `Acme ${MALICIOUS} Plumbing` });
    const out = safeJsonLd(jsonLd);
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<script");
    expect(out).toContain("\\u003c"); // < escaped
    expect(out).toContain("\\u003e"); // > escaped
  });

  it("escapes the payload inside FAQ questions/answers too", () => {
    const jsonLd = buildFaqJsonLd([
      { type: "faq", items: [{ q: `Why ${MALICIOUS}?`, a: `Because ${MALICIOUS}.` }] },
    ]);
    const out = safeJsonLd(jsonLd);
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<script");
  });

  it("escaping is lossless — JSON.parse round-trips to the original value", () => {
    const original = {
      name: `A ${MALICIOUS} & B > C < D`,
      line: "u2028:\u2028 u2029:\u2029",
    };
    expect(JSON.parse(safeJsonLd(original))).toEqual(original);
  });

  it("escapes ampersands (no raw & in output)", () => {
    expect(safeJsonLd({ name: "Bar & Grill" })).not.toContain("&");
    expect(safeJsonLd({ name: "Bar & Grill" })).toContain("\\u0026");
  });
});

// ---------------------------------------------------------------------------
// safeHref — allowlisted schemes for stored URLs in <a href> (Hermes, #216)
// ---------------------------------------------------------------------------

describe("safeHref — stored-URL scheme allowlist", () => {
  it("allows https and http", () => {
    expect(safeHref("https://acme.com/x")).toBe("https://acme.com/x");
    expect(safeHref("http://acme.com")).toBe("http://acme.com/");
  });

  it("prefixes https:// on bare domains", () => {
    expect(safeHref("acme.com")).toBe("https://acme.com/");
    expect(safeHref("www.acme.com/contato")).toBe("https://www.acme.com/contato");
  });

  it("rejects javascript:, data:, vbscript: and friends", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHref("vbscript:msgbox(1)")).toBeNull();
    expect(safeHref("JAVASCRIPT:alert(1)")).toBeNull();
  });

  it("upgrades protocol-relative //host to https", () => {
    expect(safeHref("//evil.example/x")).toBe("https://evil.example/x");
  });

  it("rejects non-strings, empties and schemeless non-domains", () => {
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
    expect(safeHref("localhost")).toBeNull(); // no dot — not a public site
  });
});
