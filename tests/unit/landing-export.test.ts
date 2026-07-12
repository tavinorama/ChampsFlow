/**
 * landing-export.test.ts — the downloadable static-site export.
 *
 * Founder decision (2026-07-12): the .zip must NOT bundle Google photos
 * (Google's policy forbids redistributing the files); every image slot is
 * replaced with a notice, and the README explains it. Everything else is
 * included and self-contained.
 */
import { describe, it, expect } from "vitest";
import {
  buildLandingExport,
  escapeHtml,
  safeSlug,
  safeUrl,
  safeJsonLdExport,
  normalizeHex,
  contrastText,
  type ExportSiteInput,
} from "../../packages/llm/src/landing-export";

const input: ExportSiteInput = {
  business: {
    name: "Marigold Café",
    category: "Café",
    address: "1123 E 6th St, Austin, TX",
    phone: "(512) 555-0142",
    website: "https://marigold.example",
    hours: "Mon–Fri 7am–6pm",
  },
  themePrimary: "#c07d12",
  pages: [
    {
      slug: "",
      title: "Marigold Café",
      seo: { title: "Marigold Café", description: "Neighborhood café" },
      jsonLd: [{ "@context": "https://schema.org", "@type": "LocalBusiness", name: "Marigold Café" }],
      sections: [
        { type: "hero", headline: "Slow mornings", business_name: "Marigold Café", cta_label: "Visit", rating: 4.7, review_count: 328, image: "/api/public/landing-photo?ref=places/x/photos/y" },
        { type: "gallery", heading: "Photos", items: [{ src: "/api/public/landing-photo?ref=a", alt: "x" }] },
        { type: "proof", heading: "What people say", items: [{ author: "Marcus R.", body: "Best cortado.", rating: 5, relative_time: "2 weeks ago", source: "Google" }] },
        { type: "faq", items: [{ q: "Parking?", a: "Yes, free street parking." }] },
        { type: "map_nap", name: "Visit", address: "1123 E 6th St", phone: "(512) 555-0142" },
      ],
    },
    { slug: "faq", title: "FAQ", sections: [{ type: "faq", items: [{ q: "Wifi?", a: "Yes." }] }] },
  ],
};

describe("buildLandingExport", () => {
  const files = buildLandingExport(input);
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));

  it("emits index.html, per-slug html, styles.css and README.txt", () => {
    expect(Object.keys(byPath).sort()).toEqual(["README.txt", "faq.html", "index.html", "styles.css"]);
  });

  it("bundles the real content: headline, attributed review, NAP, JSON-LD", () => {
    const home = byPath["index.html"]!;
    expect(home).toContain("Slow mornings");
    expect(home).toContain("Best cortado.");
    expect(home).toContain("Marcus R.");
    expect(home).toContain("Google");
    expect(home).toContain("1123 E 6th St");
    expect(home).toContain('"@type":"LocalBusiness"'.replace(/"/g, '"')); // json-ld present
    expect(home).toContain("application/ld+json");
    expect(home).toContain('href="faq.html"'); // relative inter-page links
    expect(home).toContain('<link rel="stylesheet" href="styles.css">');
  });

  it("does NOT include Google photo URLs; shows the policy notice instead", () => {
    const home = byPath["index.html"]!;
    expect(home).not.toContain("landing-photo"); // no proxy/photo URLs leak into the export
    expect(home).not.toContain("places/x/photos"); // hero image ref stripped
    expect(home).toContain("Add your own photos here"); // the notice replaces both hero image + gallery
  });

  it("README explains hosting + the Google photo policy", () => {
    const readme = byPath["README.txt"]!;
    expect(readme).toContain("HOW TO PUBLISH");
    expect(readme).toContain("Google's policy");
    expect(readme).toMatch(/not included/i);
    expect(readme).toContain("Marigold Café");
  });

  it("escapeHtml neutralizes markup in business/review text", () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    const evil = buildLandingExport({
      ...input,
      business: { name: "<b>x</b>" },
      pages: [{ slug: "", title: "t", sections: [{ type: "proof", items: [{ author: "a", body: "<img src=x onerror=alert(1)>" }] }] }],
    });
    const home = evil.find((f) => f.path === "index.html")!.content;
    expect(home).not.toContain("<img src=x onerror");
    expect(home).toContain("&lt;img src=x onerror");
  });
});

// ---------------------------------------------------------------------------
// Security regressions (Hermes audit, PR #260) — the export runs on the
// client's own domain, so path/URL/JSON-LD injection surfaces must be closed.
// ---------------------------------------------------------------------------
describe("export security helpers", () => {
  it("safeSlug strips traversal/separators to [a-z0-9-]", () => {
    expect(safeSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(safeSlug("a/../b")).toBe("a-b");
    expect(safeSlug('x"onload=1')).toBe("x-onload-1");
    expect(safeSlug("Serviços Especiais")).toBe("servi-os-especiais");
    expect(safeSlug("")).toBe("");
    expect(safeSlug("...")).toBe(""); // all-invalid collapses to home-safe empty
  });

  it("a page slug with traversal can never escape the zip root", () => {
    const out = buildLandingExport({
      business: { name: "X" },
      pages: [
        { slug: "", title: "Home", sections: [] },
        { slug: "../../evil", title: "Evil", sections: [] },
      ],
    });
    for (const f of out) {
      expect(f.path).not.toContain("..");
      expect(f.path).not.toContain("/");
      expect(f.path).not.toContain("\\");
    }
  });

  it("safeUrl allows only http(s); rejects javascript:/data:", () => {
    expect(safeUrl("https://ok.example")).toBe("https://ok.example/");
    expect(safeUrl("ok.example")).toBe("https://ok.example/"); // bare domain → https
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<script>")).toBeNull();
    expect(safeUrl("//evil.example")).toBe("https://evil.example/");
    expect(safeUrl("notaurl")).toBeNull();
  });

  it("a javascript: website is rendered as text, never as an href", () => {
    const out = buildLandingExport({
      business: { name: "X", website: "javascript:alert(document.cookie)" },
      pages: [
        {
          slug: "",
          title: "Home",
          sections: [{ type: "map_nap", name: "Visit", website: "javascript:alert(1)" }],
        },
      ],
    });
    const home = out.find((f) => f.path === "index.html")!.content;
    expect(home).not.toContain('href="javascript:');
    expect(home).not.toContain("href=\"javascript");
  });

  it("safeJsonLdExport prevents </script> breakout", () => {
    const s = safeJsonLdExport({ name: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("</script>");
    expect(s).not.toContain("<script>");
    expect(s).toContain("\\u003c");
    // still valid JSON that round-trips to the original bytes
    expect(JSON.parse(s).name).toBe("</script><script>alert(1)</script>");
  });

  it("JSON-LD in the page cannot break out of its script tag", () => {
    const out = buildLandingExport({
      business: { name: "X" },
      pages: [
        {
          slug: "",
          title: "Home",
          sections: [],
          jsonLd: [{ "@type": "Thing", name: "</script><img src=x onerror=alert(1)>" }],
        },
      ],
    });
    const home = out.find((f) => f.path === "index.html")!.content;
    // The only literal </script> is the legit tag close — the payload is escaped.
    expect(home).not.toContain("</script><img");
    expect(home).toContain("\\u003c/script");
  });

  it("normalizeHex accepts #rgb/#rrggbb (adds #), rejects the rest", () => {
    expect(normalizeHex("#c07d12")).toBe("#c07d12");
    expect(normalizeHex("fff")).toBe("#fff"); // bare 3-digit gets the #
    expect(normalizeHex("#ABC")).toBe("#abc");
    expect(normalizeHex("#12345678")).toBeNull(); // 8-digit not supported
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });

  it("contrastText picks dark text on a light brand, light on dark", () => {
    expect(contrastText("#ffffff")).toBe("#171717");
    expect(contrastText("#000000")).toBe("#ffffff");
    expect(contrastText("#fff")).toBe("#171717");
  });

  it("an invalid brand colour falls back to the neutral default", () => {
    const out = buildLandingExport({ business: { name: "X" }, themePrimary: "red; }bad", pages: [{ slug: "", title: "H", sections: [] }] });
    const css = out.find((f) => f.path === "styles.css")!.content;
    expect(css).toContain("--brand:#9aa7b0");
    expect(css).not.toContain("bad");
  });

  it("uses the provided lang and a real year (not a hardcoded 2026)", () => {
    const out = buildLandingExport({
      business: { name: "X" },
      lang: "pt-BR",
      year: 2031,
      pages: [{ slug: "", title: "H", sections: [] }],
    });
    const home = out.find((f) => f.path === "index.html")!.content;
    expect(home).toContain('<html lang="pt-br">');
    expect(home).toContain("© 2031");
  });
});
