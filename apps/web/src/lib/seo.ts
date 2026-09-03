/**
 * seo.ts — one place that builds page metadata. P1-04.
 *
 * The audit found 38 pages titled "… | Ozvor | Ozvor": the root layout already
 * applies `template: "%s | Ozvor"`, and pages were suffixing the brand a second
 * time by hand. It also found routes with no canonical and routes with no OG
 * image. All three are the same underlying problem — every page assembled its
 * own metadata object and each one forgot something different.
 *
 * `pageMetadata()` is the fix: pass the bare title, the description and the
 * path, and the suffix, the canonical and the OG/Twitter block are derived. The
 * companion `bareTitle()` exists so an existing page can be corrected in one
 * line without being rewritten.
 */
import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "./site";

/** The default social card. Every page gets one unless it names its own. */
export const DEFAULT_OG_IMAGE = "/og-default.png";

/**
 * Strip a trailing " | Ozvor" (or " — Ozvor", or several of them) from a title.
 *
 * The root layout's template appends the brand, so a page-level title that also
 * carries it renders doubled. Exported and tested because the CI guard below
 * uses the same definition of "already suffixed" that this helper does.
 */
export function bareTitle(title: string): string {
  let out = title.trim();
  // Loop: the audit found genuine "X | Ozvor | Ozvor" strings in source.
  for (;;) {
    const next = out.replace(
      new RegExp(`\\s*[|—–-]\\s*${SITE_NAME}\\s*$`, "i"),
      ""
    );
    if (next === out) return out;
    out = next.trim();
  }
}

export interface PageMetadataInput {
  /** WITHOUT the brand suffix — the root layout template adds it. */
  title: string;
  description: string;
  /** Absolute path, leading slash, no trailing slash (except "/"). */
  path: string;
  /** Defaults to DEFAULT_OG_IMAGE. Absolute path or absolute URL. */
  ogImage?: string;
  /** Article/resource pages that want a non-"website" OG type. */
  ogType?: "website" | "article";
  /** Set for pages that must stay out of the index. */
  noindex?: boolean;
}

export function canonicalUrl(path: string): string {
  const p = path === "/" ? "" : path.replace(/\/+$/, "");
  return `${SITE_URL}${p.startsWith("/") || p === "" ? p : `/${p}`}`;
}

/**
 * Build a complete, consistent metadata object.
 *
 * Note the OG title carries the brand suffix explicitly: the Next.js title
 * template applies to the document title only, so an OG title built from the
 * bare string would lose the brand in a social preview. That asymmetry is the
 * reason hand-written pages kept getting it wrong in one direction or the other.
 */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const title = bareTitle(input.title);
  const url = canonicalUrl(input.path);
  const image = input.ogImage ?? DEFAULT_OG_IMAGE;
  const social = `${title} | ${SITE_NAME}`;

  return {
    title,
    description: input.description,
    alternates: { canonical: url },
    ...(input.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: social,
      description: input.description,
      url,
      siteName: SITE_NAME,
      type: input.ogType ?? "website",
      images: [{ url: image, width: 1200, height: 630, alt: social }],
    },
    twitter: {
      card: "summary_large_image",
      title: social,
      description: input.description,
      images: [image],
    },
  };
}
