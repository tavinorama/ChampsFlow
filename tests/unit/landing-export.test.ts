/**
 * landing-export.test.ts — the downloadable static-site export.
 *
 * Founder decision (2026-07-12): the .zip must NOT bundle Google photos
 * (Google's policy forbids redistributing the files); every image slot is
 * replaced with a notice, and the README explains it. Everything else is
 * included and self-contained.
 */
import { describe, it, expect } from "vitest";
import { buildLandingExport, escapeHtml, type ExportSiteInput } from "../../packages/llm/src/landing-export";

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
